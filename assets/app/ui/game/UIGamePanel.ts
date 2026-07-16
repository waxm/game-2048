import {
  _decorator,
  Button,
  Color,
  Graphics,
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
import type { ResourceHandle } from "../../core/resource/ResManager";
import { TimerManager } from "../../core/timer/TimerManager";
import { UIBase } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import type { PuzzleLevelConfig } from "../../game/config/PuzzleLevelConfig";
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

/** 打开拼图面板时必须传入的关卡参数。 */
export interface UIGamePanelOpenParams {
  /** 当前需要创建和展示的关卡配置。 */
  levelConfig: PuzzleLevelConfig;
}

/** 通用规则网格相邻拼接面板。 */
@ccclass("UIGamePanel")
export class UIGamePanel extends UIBase {
  /** 进入关卡后展示完整原图的时长，单位为秒。 */
  private static readonly SOURCE_PREVIEW_DURATION = 3;

  /** 增加时间道具单次补充的秒数。 */
  private static readonly TIME_TOOL_BONUS_SECONDS = 10;

  /** 初始网格中格子之间的空隙，吸附成功后该空隙会归零。 */
  private static readonly INITIAL_GRID_GAP = 20;

  /** 拼图与容器边缘之间保留的最小距离，避免贴边后难以再次拖动。 */
  private static readonly DRAG_BOUNDARY_PADDING = 8;

  /** 时间进度条的完整宽度。 */
  private static readonly TIMER_BAR_WIDTH = 448;

  /** 时间进度条的固定高度。 */
  private static readonly TIMER_BAR_HEIGHT = 24;

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

  /** 原图预览使用的全屏半透明蒙层。 */
  @property({ type: Graphics })
  public sourcePreviewOverlay: Graphics | null = null;

  /** 开局预览使用的完整原图组件。 */
  @property({ type: Sprite })
  public sourcePreviewSprite: Sprite | null = null;

  /** 开局预览显示剩余观察时间的文本。 */
  @property({ type: Label })
  public sourcePreviewCountdownLabel: Label | null = null;

  /** 时间进度条的底色绘制组件。 */
  @property({ type: Graphics })
  public timerBarBackground: Graphics | null = null;

  /** 时间进度条的剩余时间填充组件。 */
  @property({ type: Graphics })
  public timerBarFill: Graphics | null = null;

  /** 剩余秒数文本。 */
  @property({ type: Label })
  public timerLabel: Label | null = null;

  /** 重玩按钮。 */
  @property({ type: Button })
  public restartButton: Button | null = null;

  /** 返回大厅按钮。 */
  @property({ type: Button })
  public backButton: Button | null = null;

  /** 增加本关剩余时间的文字道具按钮。 */
  @property({ type: Button })
  public addTimeToolButton: Button | null = null;

  /** 在游戏中再次查看完整原图的文字道具按钮。 */
  @property({ type: Button })
  public viewSourceToolButton: Button | null = null;

  /** 自动完成一次正确相邻组合的文字道具按钮。 */
  @property({ type: Button })
  public autoMergeToolButton: Button | null = null;

  /** 拼图编号到运行实例的映射。 */
  private readonly _pieces = new Map<number, PieceRuntime>();

  /** 组合编号到组合内拼图编号集合的映射。 */
  private readonly _clusters = new Map<number, Set<number>>();

  /** 拼图编号到当前所属组合编号的映射。 */
  private readonly _pieceClusterIds = new Map<number, number>();

  /** 是否已注册按钮和状态事件。 */
  private _eventsBound = false;

  /** 当前打开面板时由场景传入的关卡配置。 */
  private _levelConfig: PuzzleLevelConfig | null = null;

  /** 当前关卡单块拼图的显示宽度。 */
  private _pieceWidth = 0;

  /** 当前关卡单块拼图的显示高度。 */
  private _pieceHeight = 0;

  /** 当前关卡允许触发吸附的最大位置误差。 */
  private _snapDistance = 0;

  /** 当前关卡的规则网格，统一处理上下左右邻接关系。 */
  private _grid: PuzzleGrid | null = null;

  /** 当前关卡是否已完成。 */
  private _completed = false;

  /** 当前关卡是否已经超时失败。 */
  private _failed = false;

  /** 当前关卡正式拼图阶段剩余的秒数。 */
  private _remainingTime = 0;

  /** 是否正在消耗本关剩余时间。 */
  private _timerRunning = false;

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

  /**
   * 当前关卡原图预览专用的 SpriteFrame。
   *
   * 开局观察和道具查看复用同一个独立对象，直到重玩或退出时才销毁；这样既不会
   * 污染 ResManager 缓存，也不会在第二次查看时从运行中的资源状态重复克隆。
   */
  private _sourcePreviewFrame: SpriteFrame | null = null;

  /** 当前关卡运行时生成的切片，由面板在重玩或关闭时统一销毁。 */
  private _pieceFrames: SpriteFrame[] = [];

  /** ResManager 持有的当前关卡原图，仅用于创建切片和道具预览。 */
  private _levelSourceFrame: SpriteFrame | null = null;

  /** 当前关卡原图的资源所有权，在所有切片和预览对象销毁后归还。 */
  private _levelSourceHandle: ResourceHandle<SpriteFrame> | null = null;

  /** 是否正在通过道具查看原图，防止连续点击创建重叠的预览任务。 */
  private _toolPreviewRunning = false;

  /** 节点加载时校验 Prefab 引用并准备固定显示组件。 */
  protected onLoad(): void {
    this.assertRequiredBindings({
      titleLabel: this.titleLabel,
      progressLabel: this.progressLabel,
      feedbackLabel: this.feedbackLabel,
      puzzleContainer: this.puzzleContainer,
      piecePrefab: this.piecePrefab,
      sourcePreviewNode: this.sourcePreviewNode,
      sourcePreviewOverlay: this.sourcePreviewOverlay,
      sourcePreviewSprite: this.sourcePreviewSprite,
      sourcePreviewCountdownLabel: this.sourcePreviewCountdownLabel,
      timerBarBackground: this.timerBarBackground,
      timerBarFill: this.timerBarFill,
      timerLabel: this.timerLabel,
      restartButton: this.restartButton,
      backButton: this.backButton,
      addTimeToolButton: this.addTimeToolButton,
      viewSourceToolButton: this.viewSourceToolButton,
      autoMergeToolButton: this.autoMergeToolButton,
    });

    this.drawTimerBar();
    this.drawSourcePreviewOverlay();
    this.bindEvents();
  }

  /** 面板打开时读取关卡参数并创建对应拼图。 */
  protected onOpen(params?: unknown): void {
    super.onOpen(params);
    const levelConfig = this.readOpenParams(params);
    this.configureLevel(levelConfig);
    this.titleLabel!.string = `关卡 ${levelConfig.level}`;
    const totalPieces = levelConfig.rows * levelConfig.columns;
    this.progressLabel!.string = `已连接 0 / ${totalPieces}`;
    this.feedbackLabel!.string = "拖动相邻图片，让正确边缘靠近";
    this.refreshTimerDisplay();
    this.bindEvents();
    void this.createLevel();
  }

  /** 正式游戏阶段逐帧扣减时间并平滑刷新进度条。 */
  protected update(deltaTime: number): void {
    if (!this._timerRunning || this._completed || this._failed) {
      return;
    }

    this._remainingTime = Math.max(0, this._remainingTime - deltaTime);
    this.refreshTimerDisplay();
    if (this._remainingTime <= 0) {
      this.expireLevel();
    }
  }

  /** 面板关闭时注销事件并销毁动态拼图实例。 */
  protected onClose(): void {
    this._levelRequestId += 1;
    this.stopLevelTimer();
    this.cancelSourcePreviewWait();
    this.hideSourcePreview();
    this.unbindEvents();
    this.clearPieces();
    this._grid = null;
    this._levelConfig = null;
    super.onClose();
  }

  /** 从 UIManager 打开参数中取得必填关卡配置，缺失时立即阻止错误界面运行。 */
  private readOpenParams(params: unknown): PuzzleLevelConfig {
    if (
      !params ||
      typeof params !== "object" ||
      !("levelConfig" in params) ||
      !params.levelConfig
    ) {
      throw new Error("打开 UIGamePanel 时必须传入 levelConfig。");
    }
    return params.levelConfig as PuzzleLevelConfig;
  }

  /** 根据当前关卡配置准备切片尺寸、吸附阈值和网格规则。 */
  private configureLevel(levelConfig: PuzzleLevelConfig): void {
    this._levelConfig = levelConfig;
    this._pieceWidth = levelConfig.boardWidth / levelConfig.columns;
    this._pieceHeight = levelConfig.boardHeight / levelConfig.rows;
    this._snapDistance = Math.min(this._pieceWidth, this._pieceHeight) * 0.34;
    this._grid = new PuzzleGrid(
      levelConfig.rows,
      levelConfig.columns,
      this._pieceWidth,
      this._pieceHeight,
    );
    this.resetLevelTimer();
  }

  /** 返回当前关卡配置；未通过正常打开流程初始化时立即报错。 */
  private get levelConfig(): PuzzleLevelConfig {
    if (!this._levelConfig) {
      throw new Error("UIGamePanel 当前没有有效的关卡配置。");
    }
    return this._levelConfig;
  }

  /** 返回当前关卡网格；未初始化时立即报错。 */
  private get grid(): PuzzleGrid {
    if (!this._grid) {
      throw new Error("UIGamePanel 当前没有有效的拼图网格。");
    }
    return this._grid;
  }

  /** 加载当前关卡整图，运行时裁成网格块并按打乱顺序放入规则网格。 */
  private async createLevel(): Promise<void> {
    const requestId = ++this._levelRequestId;
    this.cancelSourcePreviewWait();
    this.hideSourcePreview();
    this.clearPieces();
    this._completed = false;
    this._failed = false;
    this._toolPreviewRunning = false;
    this.resetLevelTimer();

    let loadingHandle: ResourceHandle<SpriteFrame> | null = null;
    try {
      // 关卡资源按 SpriteFrame 导入，裁切器使用完整底层纹理生成网格运行时切图。
      loadingHandle = await ResManager.acquire(
        this.levelConfig.sourceImagePath,
        SpriteFrame,
      );
      if (!this.node.isValid || requestId !== this._levelRequestId) {
        return;
      }
      const sourceFrame = loadingHandle.asset;

      // 关卡原图必须保持不可变，避免预览渲染后缓存对象被动态图集替换纹理。
      this.prepareSourceFrame(sourceFrame);
      this._levelSourceHandle = loadingHandle;
      loadingHandle = null;
      this._levelSourceFrame = sourceFrame;
      this._pieceFrames = PuzzleImageSlicer.slice(
        sourceFrame,
        this.levelConfig.rows,
        this.levelConfig.columns,
      );
      // 运行时切片共享同一张关卡纹理，禁止自动合图可避免重玩时复用旧图集区域。
      this._pieceFrames.forEach((frame) => {
        frame.packable = false;
      });
      await this.showSourcePreview(sourceFrame);
      if (!this.node.isValid || requestId !== this._levelRequestId) {
        return;
      }

      this.levelConfig.pieceOrder.forEach((pieceId, displayIndex) => {
        const pieceNode = instantiate(this.piecePrefab!);
        const piece = pieceNode.getComponent(PuzzlePiece);
        if (!piece) {
          throw new Error("PuzzlePiece.prefab 缺少 PuzzlePiece 组件。");
        }

        this.puzzleContainer!.addChild(pieceNode);
        pieceNode.setPosition(this.getInitialGridPosition(displayIndex));
        piece.setDisplaySize(this._pieceWidth, this._pieceHeight);
        piece.setData({
          id: pieceId,
          spriteFrame: this._pieceFrames[pieceId],
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
      this.startLevelTimer();
    } catch (error) {
      if (!this.node.isValid || requestId !== this._levelRequestId) {
        return;
      }
      this.hideSourcePreview();
      this.clearPieces();
      this.feedbackLabel!.string = `第 ${this.levelConfig.level} 关图片加载失败，请查看控制台`;
      Logger.error(`创建第 ${this.levelConfig.level} 关拼图失败。`, error);
    } finally {
      // 请求若在加载完成前已被重玩或关闭，所有权尚未转交给面板，必须在此立即归还。
      loadingHandle?.release();
    }
  }

  /**
   * 将关卡原图恢复为资源导入时的纹理状态，并禁止后续参与动态图集。
   *
   * `_resetDynamicAtlasFrame()` 是 Creator 3.8.4 提供的引擎接口，只在检测到原图
   * 已被自动合图时调用，用于兼容修改前已经运行过预览的缓存对象。
   */
  private prepareSourceFrame(sourceFrame: SpriteFrame): void {
    if (sourceFrame.original) {
      sourceFrame._resetDynamicAtlasFrame();
    }
    sourceFrame.packable = false;
  }

  /** 使用独立克隆展示完整原图，等待规定时长后再允许创建拼图。 */
  private async showSourcePreview(sourceFrame: SpriteFrame): Promise<void> {
    this.cancelSourcePreviewWait();

    if (!this._sourcePreviewFrame) {
      // 每关只创建一次预览克隆，并关闭自动合图，确保多次查看始终读取同一份正确区域。
      const previewFrame = sourceFrame.clone();
      previewFrame.packable = false;
      this._sourcePreviewFrame = previewFrame;
    }
    this.sourcePreviewSprite!.spriteFrame = this._sourcePreviewFrame;
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

  /** 隐藏完整原图预览；专用 SpriteFrame 保留给本关下一次查看继续使用。 */
  private hideSourcePreview(): void {
    this.sourcePreviewNode!.active = false;
    this.sourcePreviewSprite!.spriteFrame = null;
    this.sourcePreviewCountdownLabel!.string = "观察原图";
  }

  /**
   * 释放预览专用 SpriteFrame。
   *
   * 此函数允许重复调用，只在重玩、关闭面板或关卡创建失败时释放本关专用对象。
   */
  private releaseSourcePreviewFrame(): void {
    if (!this._sourcePreviewFrame) {
      return;
    }
    this._sourcePreviewFrame.destroy();
    this._sourcePreviewFrame = null;
  }

  /** 绘制覆盖完整设计分辨率的预览蒙层，突出原图并拦住底层游戏画面。 */
  private drawSourcePreviewOverlay(): void {
    this.sourcePreviewOverlay!.clear();
    this.sourcePreviewOverlay!.fillColor = new Color(12, 16, 22, 210);
    this.sourcePreviewOverlay!.rect(-320, -568, 640, 1136);
    this.sourcePreviewOverlay!.fill();
  }

  /** 绘制进度条固定底色和满格填充，后续只缩放填充节点。 */
  private drawTimerBar(): void {
    const halfWidth = UIGamePanel.TIMER_BAR_WIDTH / 2;
    const halfHeight = UIGamePanel.TIMER_BAR_HEIGHT / 2;

    this.timerBarBackground!.clear();
    this.timerBarBackground!.fillColor = new Color(48, 56, 68, 220);
    this.timerBarBackground!.roundRect(
      -halfWidth,
      -halfHeight,
      UIGamePanel.TIMER_BAR_WIDTH,
      UIGamePanel.TIMER_BAR_HEIGHT,
      halfHeight,
    );
    this.timerBarBackground!.fill();

    this.timerBarFill!.clear();
    this.timerBarFill!.fillColor = new Color(55, 204, 118, 255);
    this.timerBarFill!.roundRect(
      0,
      -halfHeight,
      UIGamePanel.TIMER_BAR_WIDTH,
      UIGamePanel.TIMER_BAR_HEIGHT,
      halfHeight,
    );
    this.timerBarFill!.fill();
  }

  /** 恢复本关完整时间，但在原图观察阶段不开始扣减。 */
  private resetLevelTimer(): void {
    this._timerRunning = false;
    this._remainingTime = this.levelConfig.timeLimitSeconds;
    this.refreshTimerDisplay();
  }

  /** 原图预览结束且拼图创建完成后开始关卡计时。 */
  private startLevelTimer(): void {
    this._timerRunning = true;
    this._remainingTime = this.levelConfig.timeLimitSeconds;
    this.refreshTimerDisplay();
  }

  /** 停止时间衰减，供完成、失败、重玩和退出流程重复调用。 */
  private stopLevelTimer(): void {
    this._timerRunning = false;
  }

  /** 根据当前剩余比例刷新进度条长度和整秒文本。 */
  private refreshTimerDisplay(): void {
    const limit = this.levelConfig.timeLimitSeconds;
    const ratio =
      limit > 0 ? Math.max(0, Math.min(1, this._remainingTime / limit)) : 0;
    this.timerBarFill!.node.setScale(ratio, 1, 1);
    this.timerLabel!.string = `${Math.ceil(this._remainingTime)} 秒`;
  }

  /** 时间归零后锁定所有拼图，并请求控制器确认失败状态。 */
  private expireLevel(): void {
    if (!this._timerRunning || this._completed || this._failed) {
      return;
    }
    this._timerRunning = false;
    this._failed = true;
    this._pieces.forEach((runtime) => runtime.piece.setInteractable(false));
    this.feedbackLabel!.string = "时间到，本关失败";
    EventCenter.emit(GameEvent.PuzzleTimeExpired);
  }

  /** 判断当前是否处于允许使用游戏道具的正式拼图阶段。 */
  private canUseGameTool(): boolean {
    const totalPieces = this.levelConfig.rows * this.levelConfig.columns;
    return (
      this._timerRunning &&
      !this._completed &&
      !this._failed &&
      !this._toolPreviewRunning &&
      this._pieces.size === totalPieces
    );
  }

  /** 使用增加时间道具，为当前关卡补充固定秒数。 */
  private onAddTimeTool = (): void => {
    if (!this.canUseGameTool()) {
      return;
    }
    this._remainingTime += UIGamePanel.TIME_TOOL_BONUS_SECONDS;
    this.refreshTimerDisplay();
    this.feedbackLabel!.string = `增加 ${UIGamePanel.TIME_TOOL_BONUS_SECONDS} 秒`;
  };

  /**
   * 使用查看原图道具。
   *
   * 观察期间暂停关卡计时并锁住拼图，预览结束后恢复原来的剩余时间，
   * 不重新创建拼图，也不会改变已经完成的组合关系。
   */
  private onViewSourceTool = (): void => {
    if (!this.canUseGameTool() || !this._levelSourceFrame) {
      return;
    }
    void this.runToolSourcePreview(this._levelSourceFrame);
  };

  /** 执行道具原图预览，并在异步等待结束后恢复本轮游戏状态。 */
  private async runToolSourcePreview(sourceFrame: SpriteFrame): Promise<void> {
    const requestId = this._levelRequestId;
    this._toolPreviewRunning = true;
    this.stopLevelTimer();
    this._pieces.forEach((runtime) => runtime.piece.setInteractable(false));

    await this.showSourcePreview(sourceFrame);
    if (
      !this.node.isValid ||
      requestId !== this._levelRequestId ||
      this._completed ||
      this._failed
    ) {
      return;
    }

    this._toolPreviewRunning = false;
    this._pieces.forEach((runtime) => runtime.piece.setInteractable(true));
    this._timerRunning = true;
    this.feedbackLabel!.string = "继续拖动相邻图片完成拼接";
  }

  /** 使用自动组合道具，完成一次正确邻接合并并同步控制器进度。 */
  private onAutoMergeTool = (): void => {
    if (!this.canUseGameTool()) {
      return;
    }

    const mergedCluster = this.mergeOneAdjacentCluster();
    if (!mergedCluster) {
      this.feedbackLabel!.string = "当前没有可自动组合的拼图";
      return;
    }

    this.feedbackLabel!.string = "已自动组合 1 块";
    const request: PuzzlePieceDropRequest = {
      connectedPieceIds: [...mergedCluster],
      fromAutoMergeTool: true,
    };
    EventCenter.emit(GameEvent.PuzzlePieceDropRequest, request);
  };

  /**
   * 按拼图编号顺序寻找一对尚未连接的正确邻块，并完成一次组合合并。
   *
   * 自动组合使用与拖拽吸附相同的网格相对位置，合并后仍然是普通组合，
   * 玩家可以继续拖动其中任意一块带动整个组合。
   */
  private mergeOneAdjacentCluster(): Set<number> | null {
    const pieceIds = [...this._pieces.keys()].sort((a, b) => a - b);
    for (const movingId of pieceIds) {
      for (const targetId of pieceIds) {
        if (
          movingId >= targetId ||
          !this.grid.areAdjacent(movingId, targetId)
        ) {
          continue;
        }

        const movingClusterId = this._pieceClusterIds.get(movingId);
        const targetClusterId = this._pieceClusterIds.get(targetId);
        if (
          movingClusterId === undefined ||
          targetClusterId === undefined ||
          movingClusterId === targetClusterId
        ) {
          continue;
        }

        const movingCluster = this._clusters.get(movingClusterId);
        const targetCluster = this._clusters.get(targetClusterId);
        const movingPiece = this._pieces.get(movingId);
        const targetPiece = this._pieces.get(targetId);
        if (!movingCluster || !targetCluster || !movingPiece || !targetPiece) {
          continue;
        }

        const relativeOffset = this.grid.getRelativeOffset(
          movingId,
          targetId,
        );
        const correction = new Vec3(
          targetPiece.piece.node.position.x +
            relativeOffset.x -
            movingPiece.piece.node.position.x,
          targetPiece.piece.node.position.y +
            relativeOffset.y -
            movingPiece.piece.node.position.y,
          0,
        );
        this.moveCluster(movingCluster, correction);

        targetCluster.forEach((pieceId) => {
          movingCluster.add(pieceId);
          this._pieceClusterIds.set(pieceId, movingClusterId);
        });
        this._clusters.delete(targetClusterId);
        this.moveClusterWithinBounds(movingCluster, new Vec3());
        return movingCluster;
      }
    }
    return null;
  }

  /**
   * 根据展示序号生成整齐的初始格位。
   *
   * 图片块按 pieceOrder 打乱，但节点中心始终落在规则网格上，保证初始界面整洁。
   */
  private getInitialGridPosition(displayIndex: number): Vec3 {
    const displayRow = Math.floor(displayIndex / this.levelConfig.columns);
    const displayColumn = displayIndex % this.levelConfig.columns;
    const stepX = this._pieceWidth + UIGamePanel.INITIAL_GRID_GAP;
    const stepY = this._pieceHeight + UIGamePanel.INITIAL_GRID_GAP;
    const x =
      (displayColumn - (this.levelConfig.columns - 1) / 2) * stepX;
    const y =
      40 + ((this.levelConfig.rows - 1) / 2 - displayRow) * stepY;
    return new Vec3(x, y, 0);
  }

  /** 开始拖动时把当前组合整体提升到其他拼图上方。 */
  private onPieceDragStart = (pieceId: number): void => {
    if (this._completed || this._failed) {
      return;
    }
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
    if (this._completed || this._failed) {
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
    if (this._completed || this._failed) {
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

        if (!this.grid.areAdjacent(draggedId, targetId)) {
          return;
        }

        const relativeOffset = this.grid.getRelativeOffset(
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
          distance <= this._snapDistance &&
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

    const halfPieceWidth = this._pieceWidth / 2;
    const halfPieceHeight = this._pieceHeight / 2;
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
    this._failed = state.failed;
    if (state.completed || state.failed) {
      this.stopLevelTimer();
    }
    this.progressLabel!.string = `已连接 ${state.placedCount} / ${state.totalCount}`;
  };

  /** 通关后把完整图片移动到界面中心并锁定拖拽。 */
  private onCompleted = (): void => {
    this.stopLevelTimer();
    const allPieces = new Set(this._pieces.keys());
    const center = this.getClusterCenter(allPieces);
    this.moveCluster(allPieces, new Vec3(-center.x, 20 - center.y, 0));
    this._pieces.forEach((runtime) => runtime.piece.setInteractable(false));
    this.feedbackLabel!.string = `第 ${this.levelConfig.level} 关完成！`;
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

  /** 按钮请求重新开始当前关卡。 */
  private onRestart = (): void => EventCenter.emit(GameEvent.PuzzleRestart);

  /** 收到统一重玩事件后重新执行原图预览和拼图创建流程。 */
  private onRestartRequested = (): void => {
    void this.createLevel();
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
    this.addTimeToolButton!.node.on(
      Button.EventType.CLICK,
      this.onAddTimeTool,
      this,
    );
    this.viewSourceToolButton!.node.on(
      Button.EventType.CLICK,
      this.onViewSourceTool,
      this,
    );
    this.autoMergeToolButton!.node.on(
      Button.EventType.CLICK,
      this.onAutoMergeTool,
      this,
    );
    EventCenter.on(GameEvent.PuzzleStateChanged, this.onStateChanged, this);
    EventCenter.on(GameEvent.PuzzleCompleted, this.onCompleted, this);
    EventCenter.on(GameEvent.PuzzleRestart, this.onRestartRequested, this);
  }

  /** 注销按钮和拼图状态事件。 */
  private unbindEvents(): void {
    if (!this._eventsBound) {
      return;
    }
    this._eventsBound = false;
    this.restartButton!.node.off(Button.EventType.CLICK, this.onRestart, this);
    this.backButton!.node.off(Button.EventType.CLICK, this.onBack, this);
    this.addTimeToolButton!.node.off(
      Button.EventType.CLICK,
      this.onAddTimeTool,
      this,
    );
    this.viewSourceToolButton!.node.off(
      Button.EventType.CLICK,
      this.onViewSourceTool,
      this,
    );
    this.autoMergeToolButton!.node.off(
      Button.EventType.CLICK,
      this.onAutoMergeTool,
      this,
    );
    EventCenter.off(GameEvent.PuzzleStateChanged, this.onStateChanged, this);
    EventCenter.off(GameEvent.PuzzleCompleted, this.onCompleted, this);
    EventCenter.off(GameEvent.PuzzleRestart, this.onRestartRequested, this);
  }

  /** 销毁上一轮实例和运行时切片，并清空组合关系。 */
  private clearPieces(): void {
    this._pieces.forEach((runtime) => runtime.piece.node.destroy());
    this._pieces.clear();
    this._clusters.clear();
    this._pieceClusterIds.clear();
    this._pieceFrames.forEach((frame) => frame.destroy());
    this._pieceFrames = [];
    this.releaseSourcePreviewFrame();
    this._levelSourceFrame = null;
    // Creator 会在帧末完成 destroy；延迟到下一轮任务再释放共享纹理，避免派生帧尚未销毁。
    const sourceHandle = this._levelSourceHandle;
    if (sourceHandle) {
      TimerManager.delay(() => sourceHandle.release(), 0);
    }
    this._levelSourceHandle = null;
    this._toolPreviewRunning = false;
  }
}
