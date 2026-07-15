import {
  _decorator,
  Button,
  instantiate,
  Label,
  Node,
  Prefab,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
} from "cc";
import { EventCenter } from "../../core/event/EventCenter";
import { ResManager } from "../../core/resource/ResManager";
import { TimerManager } from "../../core/timer/TimerManager";
import { UIBase } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import { PuzzleLevel001Config } from "../../game/config/PuzzleLevelConfig";
import { GameEvent } from "../../game/GameEvent";
import { PuzzleGrid } from "../../game/logic/PuzzleGrid";
import { PuzzleImageSlicer } from "../../game/logic/PuzzleImageSlicer";
import {
  PuzzleGameState,
  PuzzlePieceDropRequest,
} from "../../game/model/PuzzleGameState";
import { PuzzlePiece } from "./PuzzlePiece";

const { ccclass, property } = _decorator;

/** 单个拼图实例在当前关卡中的运行数据。 */
interface PieceRuntime {
  /** 拼图块组件。 */
  piece: PuzzlePiece;
}

/** 本次吸附计算得到的最佳候选。 */
interface SnapCandidate {
  /** 被拖动组合需要整体修正的位移。 */
  correction: Vec3;

  /** 即将合并的另一个组合编号。 */
  targetClusterId: number;

  /** 当前候选距离，用于选择最近的正确邻块。 */
  distance: number;
}

/** 第 1 关规则网格相邻拼接面板。 */
@ccclass("UIGamePanel")
export class UIGamePanel extends UIBase {
  /** 进入关卡后展示完整原图的时长，单位为秒。 */
  private static readonly SOURCE_PREVIEW_DURATION = 3;

  /** 单块拼图的显示宽度，由完整拼图宽度和列数计算。 */
  private static readonly PIECE_WIDTH =
    PuzzleLevel001Config.boardWidth / PuzzleLevel001Config.columns;

  /** 单块拼图的显示高度，由完整拼图高度和行数计算。 */
  private static readonly PIECE_HEIGHT =
    PuzzleLevel001Config.boardHeight / PuzzleLevel001Config.rows;

  /** 初始网格中格子之间的空隙，吸附成功后该空隙会归零。 */
  private static readonly INITIAL_GRID_GAP = 20;

  /** 相邻拼图中心距离与正确距离之间允许的误差。 */
  private static readonly SNAP_DISTANCE =
    Math.min(UIGamePanel.PIECE_WIDTH, UIGamePanel.PIECE_HEIGHT) * 0.34;

  /** 拼图与容器边缘之间保留的最小距离，避免贴边后难以再次拖动。 */
  private static readonly DRAG_BOUNDARY_PADDING = 8;

  /** 当前关卡的规则网格，统一处理上下左右邻接关系。 */
  private readonly _grid = new PuzzleGrid(
    PuzzleLevel001Config.rows,
    PuzzleLevel001Config.columns,
    UIGamePanel.PIECE_WIDTH,
    UIGamePanel.PIECE_HEIGHT,
  );

  /** 关卡标题。 */
  @property({ type: Label })
  public titleLabel: Label | null = null;

  /** 当前已连接的拼图数量。 */
  @property({ type: Label })
  public progressLabel: Label | null = null;

  /** 操作和通关提示。 */
  @property({ type: Label })
  public feedbackLabel: Label | null = null;

  /** 所有动态拼图块共用的坐标容器。 */
  @property({ type: Node })
  public puzzleContainer: Node | null = null;

  /** 单块拼图 Prefab。 */
  @property({ type: Prefab })
  public piecePrefab: Prefab | null = null;

  /** 开局展示完整原图的预览节点。 */
  @property({ type: Node })
  public sourcePreviewNode: Node | null = null;

  /** 开局预览使用的完整原图组件。 */
  @property({ type: Sprite })
  public sourcePreviewSprite: Sprite | null = null;

  /** 开局预览显示剩余观察时间的文本。 */
  @property({ type: Label })
  public sourcePreviewCountdownLabel: Label | null = null;

  /** 重玩按钮。 */
  @property({ type: Button })
  public restartButton: Button | null = null;

  /** 返回大厅按钮。 */
  @property({ type: Button })
  public backButton: Button | null = null;

  /** 拼图编号到运行实例的映射。 */
  private readonly _pieces = new Map<number, PieceRuntime>();

  /** 组合编号到组合内拼图编号集合的映射。 */
  private readonly _clusters = new Map<number, Set<number>>();

  /** 拼图编号到当前所属组合编号的映射。 */
  private readonly _pieceClusterIds = new Map<number, number>();

  /** 是否已注册按钮和状态事件。 */
  private _eventsBound = false;

  /** 当前关卡是否已完成。 */
  private _completed = false;

  /**
   * 当前关卡创建请求编号。
   *
   * 重玩、关闭面板或销毁节点后会递增，旧异步请求返回时不得覆盖新一轮状态。
   */
  private _levelRequestId = 0;

  /** 当前完整原图预览使用的框架计时器编号。 */
  private _sourcePreviewTimerId: number | null = null;

  /** 取消预览计时后用于结束旧异步等待的回调。 */
  private _sourcePreviewResolve: (() => void) | null = null;

  /** 当前原图预览剩余的整秒数。 */
  private _sourcePreviewRemainingSeconds = 0;

  /** 节点加载时校验 Prefab 引用并创建第一关。 */
  protected onLoad(): void {
    this.assertRequiredBindings({
      titleLabel: this.titleLabel,
      progressLabel: this.progressLabel,
      feedbackLabel: this.feedbackLabel,
      puzzleContainer: this.puzzleContainer,
      piecePrefab: this.piecePrefab,
      sourcePreviewNode: this.sourcePreviewNode,
      sourcePreviewSprite: this.sourcePreviewSprite,
      sourcePreviewCountdownLabel: this.sourcePreviewCountdownLabel,
      restartButton: this.restartButton,
      backButton: this.backButton,
    });

    this.bindEvents();
    void this.createLevel();
  }

  /** 面板打开时初始化固定文案。 */
  protected onOpen(params?: unknown): void {
    super.onOpen(params);
    this.titleLabel!.string = `关卡 ${PuzzleLevel001Config.level}`;
    const totalPieces =
      PuzzleLevel001Config.rows * PuzzleLevel001Config.columns;
    this.progressLabel!.string = `已连接 0 / ${totalPieces}`;
    this.feedbackLabel!.string = "拖动相邻图片，让正确边缘靠近";
    this.bindEvents();
  }

  /** 面板关闭时注销事件并销毁动态拼图实例。 */
  protected onClose(): void {
    this._levelRequestId += 1;
    this.cancelSourcePreviewWait();
    this.hideSourcePreview();
    this.unbindEvents();
    this.clearPieces();
    super.onClose();
  }

  /** 加载第一关整图，运行时裁成网格块并按打乱顺序放入规则网格。 */
  private async createLevel(): Promise<void> {
    const requestId = ++this._levelRequestId;
    this.cancelSourcePreviewWait();
    this.hideSourcePreview();
    this.clearPieces();
    this._completed = false;

    try {
      // 关卡资源按 SpriteFrame 导入，裁切器使用完整底层纹理生成网格运行时切图。
      const sourceFrame = await ResManager.load(
        PuzzleLevel001Config.sourceImagePath,
        SpriteFrame,
      );
      if (!this.node.isValid || requestId !== this._levelRequestId) {
        return;
      }

      // 必须在原图交给预览 Sprite 之前完成裁切，避免预览渲染改变原图的运行时纹理状态。
      const frames = PuzzleImageSlicer.slice(
        sourceFrame,
        PuzzleLevel001Config.rows,
        PuzzleLevel001Config.columns,
      );
      await this.showSourcePreview(sourceFrame);
      if (!this.node.isValid || requestId !== this._levelRequestId) {
        return;
      }

      PuzzleLevel001Config.pieceOrder.forEach((pieceId, displayIndex) => {
        const pieceNode = instantiate(this.piecePrefab!);
        const piece = pieceNode.getComponent(PuzzlePiece);
        if (!piece) {
          throw new Error("PuzzlePiece.prefab 缺少 PuzzlePiece 组件。");
        }

        this.puzzleContainer!.addChild(pieceNode);
        pieceNode.setPosition(this.getInitialGridPosition(displayIndex));
        piece.setDisplaySize(UIGamePanel.PIECE_WIDTH, UIGamePanel.PIECE_HEIGHT);
        piece.setData({
          id: pieceId,
          spriteFrame: frames[pieceId],
          onDragStart: this.onPieceDragStart,
          onDragMove: this.onPieceDragMove,
          onDrop: this.onPieceDrop,
        });
        this._pieces.set(pieceId, { piece });

        // 每块拼图初始都是独立组合，组合编号直接使用拼图编号，便于排错。
        this._clusters.set(pieceId, new Set([pieceId]));
        this._pieceClusterIds.set(pieceId, pieceId);
      });
      this.feedbackLabel!.string = "拖动相邻图片，让正确边缘靠近";
    } catch (error) {
      if (!this.node.isValid || requestId !== this._levelRequestId) {
        return;
      }
      this.hideSourcePreview();
      this.feedbackLabel!.string = "第一关图片加载失败，请查看控制台";
      Logger.error("创建第 1 关拼图失败。", error);
    }
  }

  /** 展示完整原图并等待规定时长，结束后再允许创建拼图。 */
  private async showSourcePreview(sourceFrame: SpriteFrame): Promise<void> {
    this.cancelSourcePreviewWait();
    this.sourcePreviewSprite!.spriteFrame = sourceFrame;
    this.sourcePreviewNode!.active = true;
    this._sourcePreviewRemainingSeconds = UIGamePanel.SOURCE_PREVIEW_DURATION;
    this.refreshSourcePreviewCountdown();
    await this.waitForSourcePreview();
    this.hideSourcePreview();
  }

  /** 使用逐秒框架计时器显示 3、2、1，并在倒计时归零后结束预览。 */
  private waitForSourcePreview(): Promise<void> {
    return new Promise((resolve) => {
      this._sourcePreviewResolve = resolve;

      const countDown = (): void => {
        this._sourcePreviewRemainingSeconds -= 1;
        if (this._sourcePreviewRemainingSeconds <= 0) {
          this._sourcePreviewTimerId = null;
          this._sourcePreviewResolve = null;
          resolve();
          return;
        }

        this.refreshSourcePreviewCountdown();
        this._sourcePreviewTimerId = TimerManager.delay(countDown, 1);
      };

      this._sourcePreviewTimerId = TimerManager.delay(countDown, 1);
    });
  }

  /** 同步刷新预览层和底部提示中的剩余秒数。 */
  private refreshSourcePreviewCountdown(): void {
    const seconds = this._sourcePreviewRemainingSeconds;
    this.sourcePreviewCountdownLabel!.string = `观察原图  ${seconds}`;
    this.feedbackLabel!.string = `记住完整图片，${seconds} 秒后开始`;
  }

  /**
   * 取消尚未结束的预览等待。
   *
   * 清理计时器后仍要主动结束 Promise，让旧 createLevel 能继续执行请求编号校验，
   * 避免重玩或关闭面板后留下永久等待的异步任务。
   */
  private cancelSourcePreviewWait(): void {
    if (this._sourcePreviewTimerId !== null) {
      TimerManager.clear(this._sourcePreviewTimerId);
      this._sourcePreviewTimerId = null;
    }
    const resolve = this._sourcePreviewResolve;
    this._sourcePreviewResolve = null;
    this._sourcePreviewRemainingSeconds = 0;
    resolve?.();
  }

  /** 隐藏完整原图预览并释放 SpriteFrame 引用。 */
  private hideSourcePreview(): void {
    this.sourcePreviewNode!.active = false;
    this.sourcePreviewSprite!.spriteFrame = null;
    this.sourcePreviewCountdownLabel!.string = "观察原图";
  }

  /**
   * 根据展示序号生成整齐的初始格位。
   *
   * 图片块按 pieceOrder 打乱，但节点中心始终落在规则网格上，保证初始界面整洁。
   */
  private getInitialGridPosition(displayIndex: number): Vec3 {
    const displayRow = Math.floor(displayIndex / PuzzleLevel001Config.columns);
    const displayColumn = displayIndex % PuzzleLevel001Config.columns;
    const stepX = UIGamePanel.PIECE_WIDTH + UIGamePanel.INITIAL_GRID_GAP;
    const stepY = UIGamePanel.PIECE_HEIGHT + UIGamePanel.INITIAL_GRID_GAP;
    const x = (displayColumn - (PuzzleLevel001Config.columns - 1) / 2) * stepX;
    const y = 40 + ((PuzzleLevel001Config.rows - 1) / 2 - displayRow) * stepY;
    return new Vec3(x, y, 0);
  }

  /** 开始拖动时把当前组合整体提升到其他拼图上方。 */
  private onPieceDragStart = (pieceId: number): void => {
    const cluster = this.getPieceCluster(pieceId);
    if (!cluster) {
      return;
    }

    cluster.forEach((id) => {
      const node = this._pieces.get(id)?.piece.node;
      if (node) {
        node.setSiblingIndex(node.parent!.children.length - 1);
      }
    });
  };

  /** 使用同一份位移增量移动组合内所有拼图，保持已吸附边缘不被拖散。 */
  private onPieceDragMove = (pieceId: number, delta: Vec3): void => {
    if (this._completed) {
      return;
    }
    const cluster = this.getPieceCluster(pieceId);
    if (!cluster) {
      return;
    }
    this.moveClusterWithinBounds(cluster, delta);
  };

  /** 松手时反复吸附附近的正确邻块，并把新组合结果交给控制器统计。 */
  private onPieceDrop = (pieceId: number): void => {
    if (this._completed) {
      return;
    }

    const clusterId = this._pieceClusterIds.get(pieceId);
    if (clusterId === undefined) {
      return;
    }

    let merged = false;
    // 一次放下可能同时对齐多个组合，因此持续合并到附近没有新邻块为止。
    while (this.tryMergeCluster(clusterId)) {
      merged = true;
    }

    const cluster = this._clusters.get(clusterId);
    if (!merged || !cluster) {
      this.feedbackLabel!.string = "继续靠近正确的相邻边缘";
      return;
    }

    this.feedbackLabel!.string = `已拼接 ${cluster.size} 块`;
    const request: PuzzlePieceDropRequest = {
      connectedPieceIds: [...cluster],
    };
    EventCenter.emit(GameEvent.PuzzlePieceDropRequest, request);
  };

  /**
   * 为指定组合查找最近的正确邻块并完成一次合并。
   *
   * 正确位置不依赖固定目标格，而是由两块图片在原图中的行列差计算；
   * 这样完整图片可以在画布任意位置拼成，并支持不规则组合继续参与吸附。
   */
  private tryMergeCluster(clusterId: number): boolean {
    const draggedCluster = this._clusters.get(clusterId);
    if (!draggedCluster) {
      return false;
    }

    let bestCandidate: SnapCandidate | null = null;
    draggedCluster.forEach((draggedId) => {
      const dragged = this._pieces.get(draggedId);
      if (!dragged) {
        return;
      }

      this._pieces.forEach((target, targetId) => {
        if (draggedCluster.has(targetId)) {
          return;
        }

        if (!this._grid.areAdjacent(draggedId, targetId)) {
          return;
        }

        const relativeOffset = this._grid.getRelativeOffset(
          draggedId,
          targetId,
        );
        const expectedPosition = new Vec3(
          target.piece.node.position.x + relativeOffset.x,
          target.piece.node.position.y + relativeOffset.y,
          0,
        );
        const correction = new Vec3(
          expectedPosition.x - dragged.piece.node.position.x,
          expectedPosition.y - dragged.piece.node.position.y,
          0,
        );
        const distance = correction.length();
        if (
          distance <= UIGamePanel.SNAP_DISTANCE &&
          (!bestCandidate || distance < bestCandidate.distance)
        ) {
          bestCandidate = {
            correction,
            targetClusterId: this._pieceClusterIds.get(targetId)!,
            distance,
          };
        }
      });
    });

    if (!bestCandidate) {
      return false;
    }

    this.moveCluster(draggedCluster, bestCandidate.correction);
    const targetCluster = this._clusters.get(bestCandidate.targetClusterId);
    if (!targetCluster) {
      return false;
    }

    // 合并后统一改为被拖动组合的编号，后续拖动其中任意块都会移动完整组合。
    targetCluster.forEach((id) => {
      draggedCluster.add(id);
      this._pieceClusterIds.set(id, clusterId);
    });
    this._clusters.delete(bestCandidate.targetClusterId);

    // 边缘附近完成吸附时，整体回到容器范围内，且不改变拼图之间的正确位置。
    this.moveClusterWithinBounds(draggedCluster, new Vec3());
    return true;
  }

  /**
   * 在拼图容器范围内移动整个组合。
   *
   * 先计算组合移动后的外接矩形，再统一修正位移，确保组合内每块拼图使用
   * 完全相同的增量，避免已经吸附的边缘被边界限制重新拉开。
   */
  private moveClusterWithinBounds(
    cluster: Set<number>,
    requestedDelta: Vec3,
  ): void {
    const containerTransform = this.puzzleContainer!.getComponent(UITransform);
    if (!containerTransform) {
      throw new Error("UIGamePanel.puzzleContainer 缺少 UITransform 组件。");
    }

    const halfPieceWidth = UIGamePanel.PIECE_WIDTH / 2;
    const halfPieceHeight = UIGamePanel.PIECE_HEIGHT / 2;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    cluster.forEach((id) => {
      const node = this._pieces.get(id)?.piece.node;
      if (!node) {
        return;
      }
      minX = Math.min(minX, node.position.x - halfPieceWidth);
      maxX = Math.max(maxX, node.position.x + halfPieceWidth);
      minY = Math.min(minY, node.position.y - halfPieceHeight);
      maxY = Math.max(maxY, node.position.y + halfPieceHeight);
    });

    if (!Number.isFinite(minX)) {
      return;
    }

    const size = containerTransform.contentSize;
    const anchor = containerTransform.anchorPoint;
    const padding = UIGamePanel.DRAG_BOUNDARY_PADDING;
    const left = -size.width * anchor.x + padding;
    const right = size.width * (1 - anchor.x) - padding;
    const bottom = -size.height * anchor.y + padding;
    const top = size.height * (1 - anchor.y) - padding;
    const boundedDelta = new Vec3(requestedDelta);

    boundedDelta.x = this.clampAxisDelta(
      minX,
      maxX,
      boundedDelta.x,
      left,
      right,
    );
    boundedDelta.y = this.clampAxisDelta(
      minY,
      maxY,
      boundedDelta.y,
      bottom,
      top,
    );
    this.moveCluster(cluster, boundedDelta);
  }

  /**
   * 修正单个坐标轴上的位移，使移动后的组合范围不超过容器边界。
   *
   * 当前关卡组合始终小于容器；额外保留超宽保护，避免未来关卡尺寸配置错误时
   * 在两侧边界之间反复修正导致位置抖动。
   */
  private clampAxisDelta(
    clusterMin: number,
    clusterMax: number,
    requestedDelta: number,
    boundaryMin: number,
    boundaryMax: number,
  ): number {
    const clusterSize = clusterMax - clusterMin;
    const boundarySize = boundaryMax - boundaryMin;
    if (clusterSize > boundarySize) {
      const clusterCenter = (clusterMin + clusterMax) / 2;
      const boundaryCenter = (boundaryMin + boundaryMax) / 2;
      return boundaryCenter - clusterCenter;
    }

    const minimumDelta = boundaryMin - clusterMin;
    const maximumDelta = boundaryMax - clusterMax;
    return Math.max(minimumDelta, Math.min(requestedDelta, maximumDelta));
  }

  /** 将组合内所有拼图移动相同距离。 */
  private moveCluster(cluster: Set<number>, delta: Vec3): void {
    cluster.forEach((id) => {
      const node = this._pieces.get(id)?.piece.node;
      if (node) {
        node.setPosition(
          node.position.x + delta.x,
          node.position.y + delta.y,
          0,
        );
      }
    });
  }

  /** 获取拼图当前所属的组合。 */
  private getPieceCluster(pieceId: number): Set<number> | null {
    const clusterId = this._pieceClusterIds.get(pieceId);
    return clusterId === undefined
      ? null
      : (this._clusters.get(clusterId) ?? null);
  }

  /** 刷新已连接数量和关卡锁定状态。 */
  private onStateChanged = (state?: PuzzleGameState): void => {
    if (!state) {
      return;
    }
    this._completed = state.completed;
    this.progressLabel!.string = `已连接 ${state.placedCount} / ${state.totalCount}`;
  };

  /** 通关后把完整图片移动到界面中心并锁定拖拽。 */
  private onCompleted = (): void => {
    const allPieces = new Set(this._pieces.keys());
    const center = this.getClusterCenter(allPieces);
    this.moveCluster(allPieces, new Vec3(-center.x, 20 - center.y, 0));
    this._pieces.forEach((runtime) => runtime.piece.setInteractable(false));
    this.feedbackLabel!.string = "第 1 关完成！";
  };

  /** 计算组合外接矩形的中心点，用于通关后居中展示完整图片。 */
  private getClusterCenter(cluster: Set<number>): Vec3 {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    cluster.forEach((id) => {
      const position = this._pieces.get(id)!.piece.node.position;
      minX = Math.min(minX, position.x);
      maxX = Math.max(maxX, position.x);
      minY = Math.min(minY, position.y);
      maxY = Math.max(maxY, position.y);
    });
    return new Vec3((minX + maxX) / 2, (minY + maxY) / 2, 0);
  }

  /** 重新生成当前关卡的全部拼图实例并重置控制器。 */
  private onRestart = (): void => {
    void this.createLevel();
    EventCenter.emit(GameEvent.PuzzleRestart);
  };

  /** 请求场景返回大厅。 */
  private onBack = (): void => EventCenter.emit(GameEvent.BackToLobby);

  /** 注册按钮和拼图状态事件。 */
  private bindEvents(): void {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    this.restartButton!.node.on(Button.EventType.CLICK, this.onRestart, this);
    this.backButton!.node.on(Button.EventType.CLICK, this.onBack, this);
    EventCenter.on(GameEvent.PuzzleStateChanged, this.onStateChanged, this);
    EventCenter.on(GameEvent.PuzzleCompleted, this.onCompleted, this);
  }

  /** 注销按钮和拼图状态事件。 */
  private unbindEvents(): void {
    if (!this._eventsBound) {
      return;
    }
    this._eventsBound = false;
    this.restartButton!.node.off(Button.EventType.CLICK, this.onRestart, this);
    this.backButton!.node.off(Button.EventType.CLICK, this.onBack, this);
    EventCenter.off(GameEvent.PuzzleStateChanged, this.onStateChanged, this);
    EventCenter.off(GameEvent.PuzzleCompleted, this.onCompleted, this);
  }

  /** 销毁上一轮实例并清空组合关系，避免重玩后残留旧状态。 */
  private clearPieces(): void {
    this._pieces.forEach((runtime) => runtime.piece.node.destroy());
    this._pieces.clear();
    this._clusters.clear();
    this._pieceClusterIds.clear();
  }
}
