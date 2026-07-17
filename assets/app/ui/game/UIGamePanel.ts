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
  PuzzleMoveFailureReason,
  PuzzleMovePlanner,
} from "../../game/logic/PuzzleMovePlanner";
import type { PuzzleMovePlan } from "../../game/logic/PuzzleMovePlanner";
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

  /** 按显示格子编号保存当前占用该格子的拼图编号。 */
  private readonly _pieceIdsByCell: number[] = [];

  /** 拼图编号到当前显示格子编号的反向索引。 */
  private readonly _cellIndexByPieceId = new Map<number, number>();

  /** 拼图编号到当前正确连接组合的映射；未连接块对应只包含自己的集合。 */
  private readonly _connectedGroupByPieceId = new Map<number, Set<number>>();

  /** 本次正在整体拖动的拼图编号集合。 */
  private _draggingPieceIds: Set<number> | null = null;

  /** 本次拖拽开始时各拼图所在格子，用于验证目标区域和失败复位。 */
  private readonly _dragOriginCells = new Map<number, number>();

  /** 当前唯一拖拽的触摸锚点；用于阻止多指同时修改棋盘占用。 */
  private _activeDragAnchorPieceId: number | null = null;

  /** 是否已注册按钮和状态事件。 */
  private _eventsBound = false;

  /** 当前打开面板时由场景传入的关卡配置。 */
  private _levelConfig: PuzzleLevelConfig | null = null;

  /** 当前关卡单块拼图的显示宽度。 */
  private _pieceWidth = 0;

  /** 当前关卡单块拼图的显示高度。 */
  private _pieceHeight = 0;

  /** 当前关卡的规则网格，统一处理上下左右邻接关系。 */
  private _grid: PuzzleGrid | null = null;

  /** 当前关卡是否已完成。 */
  private _completed = false;

  /** 当前关卡是否已经超时失败。 */
  private _failed = false;

  /** 当前限时关卡剩余的秒数；不限时关卡固定保留为 0。 */
  private _remainingTime = 0;

  /** 是否已进入允许操作的正式拼图阶段；不限时关卡同样会设为 true。 */
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
    if (
      !this._timerRunning ||
      this._completed ||
      this._failed ||
      this.levelConfig.timeLimitSeconds === null
    ) {
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

  /** 根据当前关卡配置准备切片尺寸和网格规则。 */
  private configureLevel(levelConfig: PuzzleLevelConfig): void {
    this._levelConfig = levelConfig;
    this._pieceWidth = levelConfig.boardWidth / levelConfig.columns;
    this._pieceHeight = levelConfig.boardHeight / levelConfig.rows;
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
        pieceNode.setPosition(this.getGridPosition(displayIndex));
        piece.setDisplaySize(this._pieceWidth, this._pieceHeight);
        piece.setData({
          id: pieceId,
          spriteFrame: this._pieceFrames[pieceId],
          onDragStart: this.onPieceDragStart,
          onDragMove: this.onPieceDragMove,
          onDrop: this.onPieceDrop,
        });
        this._pieces.set(pieceId, { piece });
        this._pieceIdsByCell[displayIndex] = pieceId;
        this._cellIndexByPieceId.set(pieceId, displayIndex);
      });
      this.feedbackLabel!.string = "拖动图片到目标格，与格内图片交换位置";
      this.startLevelTimer();
      this.refreshConnectedState(true);
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
    this._remainingTime = this.levelConfig.timeLimitSeconds ?? 0;
    this.refreshTimerDisplay();
  }

  /** 原图预览结束且拼图创建完成后开始关卡计时。 */
  private startLevelTimer(): void {
    this._timerRunning = true;
    this._remainingTime = this.levelConfig.timeLimitSeconds ?? 0;
    this.refreshTimerDisplay();
  }

  /** 停止时间衰减，供完成、失败、重玩和退出流程重复调用。 */
  private stopLevelTimer(): void {
    this._timerRunning = false;
  }

  /** 根据当前剩余比例刷新进度条长度和整秒文本。 */
  private refreshTimerDisplay(): void {
    const limit = this.levelConfig.timeLimitSeconds;
    if (limit === null) {
      this.timerBarFill!.node.setScale(1, 1, 1);
      this.timerLabel!.string = "无限时间";
      return;
    }
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
    this.restoreDraggingGroup();
    this.clearDraggingState();
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
      this._activeDragAnchorPieceId === null &&
      this._pieces.size === totalPieces
    );
  }

  /** 使用增加时间道具，为当前关卡补充固定秒数。 */
  private onAddTimeTool = (): void => {
    if (!this.canUseGameTool()) {
      return;
    }
    if (this.levelConfig.timeLimitSeconds === null) {
      this.feedbackLabel!.string = "本关时间无限，无需增加时间";
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

  /** 使用自动组合道具，通过一次格子交换制造一组正确邻接。 */
  private onAutoMergeTool = (): void => {
    if (!this.canUseGameTool()) {
      return;
    }

    const connectedPieceIds = this.connectOneAdjacentPair();
    if (!connectedPieceIds) {
      this.feedbackLabel!.string = "当前没有可自动组合的拼图";
      return;
    }

    this.feedbackLabel!.string = "已自动组合 1 块";
    const request: PuzzlePieceDropRequest = {
      connectedPieceIds,
      fromAutoMergeTool: true,
    };
    EventCenter.emit(GameEvent.PuzzlePieceDropRequest, request);
  };

  /**
   * 按拼图编号顺序寻找一对尚未正确相邻的原图邻块，并交换一个目标格。
   *
   * 道具不直接修改节点坐标，而是先计算移动块在目标块旁边应占用的格子，再走
   * 普通交换函数，确保自动操作与玩家拖拽只有一套格子占用状态。
   */
  private connectOneAdjacentPair(): number[] | null {
    const pieceIds = [...this._pieces.keys()].sort((a, b) => a - b);
    for (const movingId of pieceIds) {
      for (const targetId of pieceIds) {
        if (
          movingId >= targetId ||
          !this.grid.areAdjacent(movingId, targetId)
        ) {
          continue;
        }

        const movingCellIndex = this._cellIndexByPieceId.get(movingId);
        const targetCellIndex = this._cellIndexByPieceId.get(targetId);
        if (movingCellIndex === undefined || targetCellIndex === undefined) {
          continue;
        }
        if ((this._connectedGroupByPieceId.get(movingId)?.size ?? 0) > 1) {
          continue;
        }
        if (
          this.isCorrectlyConnected(
            movingId,
            movingCellIndex,
            targetId,
            targetCellIndex,
          )
        ) {
          continue;
        }

        const movingOriginalCell = this.grid.getCell(movingId);
        const targetOriginalCell = this.grid.getCell(targetId);
        const targetDisplayCell = this.grid.getCell(targetCellIndex);
        const desiredRow =
          targetDisplayCell.row +
          movingOriginalCell.row -
          targetOriginalCell.row;
        const desiredColumn =
          targetDisplayCell.column +
          movingOriginalCell.column -
          targetOriginalCell.column;
        const desiredCellIndex = this.getCellIndex(
          desiredRow,
          desiredColumn,
        );
        if (desiredCellIndex === null) {
          continue;
        }
        const displacedPieceId = this._pieceIdsByCell[desiredCellIndex];
        if (
          (this._connectedGroupByPieceId.get(displacedPieceId)?.size ?? 0) > 1
        ) {
          continue;
        }

        this.swapPieceToCell(movingId, desiredCellIndex);
        return this.refreshConnectedState(false, true);
      }
    }
    return null;
  }

  /**
   * 根据格子序号生成无间隙的规则网格中心坐标。
   *
   * 未连接底框虽然会内缩，但根节点和格子坐标不留空隙；连接后完整切片会自然
   * 覆盖整个格子并与上下左右的正确切片严丝合缝。
   */
  private getGridPosition(cellIndex: number): Vec3 {
    const cell = this.grid.getCell(cellIndex);
    const x =
      (cell.column - (this.levelConfig.columns - 1) / 2) * this._pieceWidth;
    const y =
      40 +
      ((this.levelConfig.rows - 1) / 2 - cell.row) * this._pieceHeight;
    return new Vec3(x, y, 0);
  }

  /**
   * 开始拖动时锁定唯一触摸，记录整个连接组合的原始格子并提升显示层级。
   *
   * 返回值交给 PuzzlePiece 判断本次触摸是否取得棋盘操作权，防止两根手指同时
   * 建立两套拖拽快照并交叉覆盖格子占用。
   */
  private onPieceDragStart = (pieceId: number): boolean => {
    if (
      !this._timerRunning ||
      this._completed ||
      this._failed ||
      this._toolPreviewRunning ||
      this._activeDragAnchorPieceId !== null
    ) {
      return false;
    }
    const connectedGroup = this._connectedGroupByPieceId.get(pieceId);
    if (!connectedGroup) {
      return false;
    }

    const draggingPieceIds = new Set(connectedGroup);
    const dragEntries: Array<{
      id: number;
      runtime: PieceRuntime;
      cellIndex: number;
    }> = [];
    draggingPieceIds.forEach((id) => {
      const runtime = this._pieces.get(id);
      const cellIndex = this._cellIndexByPieceId.get(id);
      if (!runtime || cellIndex === undefined) {
        throw new Error(`拖拽组合缺少拼图 ${id} 的运行状态。`);
      }
      dragEntries.push({ id, runtime, cellIndex });
    });

    // 先完成整组校验再写入活动状态，避免异常快照把后续触摸永久锁住。
    this._activeDragAnchorPieceId = pieceId;
    this._draggingPieceIds = draggingPieceIds;
    this._dragOriginCells.clear();
    dragEntries.forEach(({ id, runtime, cellIndex }) => {
      this._dragOriginCells.set(id, cellIndex);
      runtime.piece.node.setSiblingIndex(
        runtime.piece.node.parent!.children.length - 1,
      );
    });
    return true;
  };

  /** 拖动过程中为组合内每块拼图应用相同位移，保持已经连接的边缘不被拉开。 */
  private onPieceDragMove = (pieceId: number, delta: Vec3): void => {
    if (this._completed || this._failed) {
      return;
    }
    if (
      this._activeDragAnchorPieceId !== pieceId ||
      !this._draggingPieceIds?.has(pieceId)
    ) {
      return;
    }
    this._draggingPieceIds.forEach((id) => {
      const node = this._pieces.get(id)!.piece.node;
      node.setPosition(
        node.position.x + delta.x,
        node.position.y + delta.y,
        0,
      );
    });
  };

  /**
   * 松手时验证整个组合是否能够平移到目标格。
   *
   * 取消触摸、目标越界、目标组覆盖不完整或置换后会改变连接组形状时，本轮都
   * 完整复位；只有移动计划通过全部校验后才一次性提交格子占用。
   */
  private onPieceDrop = (pieceId: number, canceled: boolean): void => {
    if (this._completed || this._failed) {
      return;
    }
    if (this._activeDragAnchorPieceId !== pieceId) {
      return;
    }

    if (canceled) {
      this.restoreDraggingGroup();
      this.feedbackLabel!.string = "拖拽已取消，组合已返回原位";
      this.clearDraggingState();
      return;
    }

    const runtime = this._pieces.get(pieceId);
    const sourceCellIndex = this._dragOriginCells.get(pieceId);
    if (
      !runtime ||
      sourceCellIndex === undefined ||
      !this._draggingPieceIds?.has(pieceId)
    ) {
      this.restoreDraggingGroup();
      this.clearDraggingState();
      Logger.error(`拼图 ${pieceId} 松手时缺少完整拖拽快照。`);
      this.feedbackLabel!.string = "拖拽状态异常，本次操作已复位";
      return;
    }

    const targetCellIndex =
      this.getNearestGridCellIndex(runtime.piece.node.position) ?? -1;
    const plan = this.createDraggingMovePlan(pieceId, targetCellIndex);
    if (!plan.valid) {
      this.restoreDraggingGroup();
      this.feedbackLabel!.string = this.getMoveFailureFeedback(plan.reason);
      if (this.isInternalMoveFailure(plan.reason)) {
        Logger.error(
          `第 ${this.levelConfig.level} 关拖拽状态异常：${plan.reason}`,
        );
      }
      this.clearDraggingState();
      return;
    }

    this.commitMovePlan(plan);
    const connectedPieceIds = this.refreshConnectedState(true, true);
    this.feedbackLabel!.string =
      connectedPieceIds.length >= 2
        ? `已连接 ${connectedPieceIds.length} 块`
        : "组合已放入目标格，继续寻找正确相邻位置";
    this.clearDraggingState();
  };

  /**
   * 根据当前拖拽快照创建完整移动计划。
   *
   * 规划器会处理重叠平移形成的移动链，并要求目标中的每个已连接组合都被完整
   * 覆盖、使用统一位移回填，从而支持“三格换两格加一单格”等完整组合置换。
   */
  private createDraggingMovePlan(
    anchorPieceId: number,
    targetAnchorCellIndex: number,
  ): PuzzleMovePlan {
    return PuzzleMovePlanner.createPlan({
      rows: this.levelConfig.rows,
      columns: this.levelConfig.columns,
      pieceIdsByCell: this._pieceIdsByCell,
      movingPieceIds: this._draggingPieceIds ?? new Set<number>(),
      sourceCellByPieceId: this._dragOriginCells,
      connectedGroupByPieceId: this._connectedGroupByPieceId,
      anchorPieceId,
      targetAnchorCellIndex,
    });
  }

  /**
   * 一次性提交规划器返回的完整置换，并把所有受影响节点吸附到格子中心。
   *
   * 提交前再次核对来源、目标和反向索引；任何状态不一致都会在写入前抛错，避免
   * 快速触摸或后续代码改动造成半组已移动、半组仍在原位。
   */
  private commitMovePlan(plan: PuzzleMovePlan): void {
    if (!plan.valid) {
      throw new Error("不能提交无效的拼图移动计划。");
    }

    const sourceCells = new Set<number>();
    const targetCells = new Set<number>();
    const nextPieceIdsByCell = [...this._pieceIdsByCell];
    for (const move of plan.moves) {
      const runtime = this._pieces.get(move.pieceId);
      if (
        !runtime ||
        this._pieceIdsByCell[move.sourceCellIndex] !== move.pieceId ||
        this._cellIndexByPieceId.get(move.pieceId) !== move.sourceCellIndex ||
        move.targetCellIndex < 0 ||
        move.targetCellIndex >= this._pieceIdsByCell.length ||
        sourceCells.has(move.sourceCellIndex) ||
        targetCells.has(move.targetCellIndex)
      ) {
        throw new Error(
          `拼图移动计划与当前占用不一致：piece=${move.pieceId}，` +
            `source=${move.sourceCellIndex}，target=${move.targetCellIndex}`,
        );
      }
      sourceCells.add(move.sourceCellIndex);
      targetCells.add(move.targetCellIndex);
    }
    if (
      sourceCells.size !== targetCells.size ||
      [...sourceCells].some((cellIndex) => !targetCells.has(cellIndex))
    ) {
      throw new Error("拼图移动计划没有完整覆盖全部腾出格和目标格。");
    }

    for (const move of plan.moves) {
      nextPieceIdsByCell[move.targetCellIndex] = move.pieceId;
    }
    if (
      new Set(nextPieceIdsByCell).size !== nextPieceIdsByCell.length ||
      nextPieceIdsByCell.some((pieceId) => !this._pieces.has(pieceId))
    ) {
      throw new Error("拼图移动计划提交后会产生重复格子或丢失拼图。");
    }

    this._pieceIdsByCell.splice(
      0,
      this._pieceIdsByCell.length,
      ...nextPieceIdsByCell,
    );
    for (const move of plan.moves) {
      this._cellIndexByPieceId.set(move.pieceId, move.targetCellIndex);
      this._pieces
        .get(move.pieceId)!
        .piece.node.setPosition(this.getGridPosition(move.targetCellIndex));
    }
  }

  /** 将移动规划失败原因转换为玩家可理解、可排错的放置反馈。 */
  private getMoveFailureFeedback(reason: PuzzleMoveFailureReason): string {
    switch (reason) {
      case PuzzleMoveFailureReason.TargetOutOfBounds:
      case PuzzleMoveFailureReason.InvalidAnchor:
        return "组合超出棋盘边界，已返回原位";
      case PuzzleMoveFailureReason.IncompleteTargetGroup:
        return "目标连接组没有被完整覆盖，已返回原位";
      case PuzzleMoveFailureReason.TargetGroupDeformed:
        return "目标连接组无法保持原形，已返回原位";
      default:
        return "拼图占用状态异常，本次拖拽已复位";
    }
  }

  /** 区分玩家正常放置失败与必须进入控制台排查的内部状态错误。 */
  private isInternalMoveFailure(reason: PuzzleMoveFailureReason): boolean {
    switch (reason) {
      case PuzzleMoveFailureReason.InvalidAnchor:
      case PuzzleMoveFailureReason.TargetOutOfBounds:
      case PuzzleMoveFailureReason.IncompleteTargetGroup:
      case PuzzleMoveFailureReason.TargetGroupDeformed:
        return false;
      default:
        return true;
    }
  }

  /** 放置失败时根据拖拽开始前记录的格子复位整个组合。 */
  private restoreDraggingGroup(): void {
    this._dragOriginCells.forEach((cellIndex, id) => {
      this._pieces.get(id)?.piece.node.setPosition(
        this.getGridPosition(cellIndex),
      );
    });
  }

  /** 清空本轮拖拽的临时引用；允许在成功和失败路径重复调用。 */
  private clearDraggingState(): void {
    this._activeDragAnchorPieceId = null;
    this._draggingPieceIds = null;
    this._dragOriginCells.clear();
  }

  /**
   * 将指定拼图交换到目标格，并让被占用的拼图回到来源格。
   *
   * 所有映射与节点位置在同一个函数内更新，防止快速连续拖动时出现两个拼图
   * 指向同一格，或逻辑占用位置与画面位置不一致。
   */
  private swapPieceToCell(pieceId: number, targetCellIndex: number): void {
    const sourceCellIndex = this._cellIndexByPieceId.get(pieceId);
    const targetPieceId = this._pieceIdsByCell[targetCellIndex];
    if (sourceCellIndex === undefined || targetPieceId === undefined) {
      throw new Error(
        `拼图格子占用状态异常：piece=${pieceId}，target=${targetCellIndex}`,
      );
    }

    this._pieceIdsByCell[sourceCellIndex] = targetPieceId;
    this._pieceIdsByCell[targetCellIndex] = pieceId;
    this._cellIndexByPieceId.set(pieceId, targetCellIndex);
    this._cellIndexByPieceId.set(targetPieceId, sourceCellIndex);
    this._pieces
      .get(pieceId)!
      .piece.node.setPosition(this.getGridPosition(targetCellIndex));
    this._pieces
      .get(targetPieceId)!
      .piece.node.setPosition(this.getGridPosition(sourceCellIndex));
  }

  /** 根据拖拽节点中心取得最近格子；超出棋盘半格范围时判定为无效落点。 */
  private getNearestGridCellIndex(position: Readonly<Vec3>): number | null {
    const column = Math.round(
      position.x / this._pieceWidth +
        (this.levelConfig.columns - 1) / 2,
    );
    const row = Math.round(
      (40 - position.y) / this._pieceHeight +
        (this.levelConfig.rows - 1) / 2,
    );
    return this.getCellIndex(row, column);
  }

  /** 把合法行列转换为格子编号，越界时返回 null。 */
  private getCellIndex(row: number, column: number): number | null {
    if (
      row < 0 ||
      row >= this.levelConfig.rows ||
      column < 0 ||
      column >= this.levelConfig.columns
    ) {
      return null;
    }
    return row * this.levelConfig.columns + column;
  }

  /** 判断两块图片在当前格子中的方向是否与它们在原图中的方向完全一致。 */
  private isCorrectlyConnected(
    firstPieceId: number,
    firstCellIndex: number,
    secondPieceId: number,
    secondCellIndex: number,
  ): boolean {
    const firstOriginal = this.grid.getCell(firstPieceId);
    const secondOriginal = this.grid.getCell(secondPieceId);
    const firstCurrent = this.grid.getCell(firstCellIndex);
    const secondCurrent = this.grid.getCell(secondCellIndex);
    return (
      secondOriginal.row - firstOriginal.row ===
        secondCurrent.row - firstCurrent.row &&
      secondOriginal.column - firstOriginal.column ===
        secondCurrent.column - firstCurrent.column
    );
  }

  /**
   * 重算当前棋盘上的正确连接分组，并同步每块拼图的背景与裁剪状态。
   *
   * 交换可能建立也可能拆开旧连接，因此不能沿用只增不减的组合缓存。这里每次
   * 仅检查右侧和下侧邻格构建关系图，再用深度优先遍历得到真实连接分组。
   */
  private refreshConnectedState(
    emitState: boolean,
    playConnectedAnimation = false,
  ): number[] {
    const adjacency = new Map<number, Set<number>>();
    const previousGroupSizes = new Map<number, number>();
    this._connectedGroupByPieceId.forEach((group, pieceId) => {
      previousGroupSizes.set(pieceId, group.size);
    });
    this._connectedGroupByPieceId.clear();
    this._pieces.forEach((_runtime, pieceId) => {
      adjacency.set(pieceId, new Set());
    });

    this._pieceIdsByCell.forEach((pieceId, cellIndex) => {
      const cell = this.grid.getCell(cellIndex);
      const neighborIndices = [
        this.getCellIndex(cell.row, cell.column + 1),
        this.getCellIndex(cell.row + 1, cell.column),
      ];
      neighborIndices.forEach((neighborIndex) => {
        if (neighborIndex === null) {
          return;
        }
        const neighborPieceId = this._pieceIdsByCell[neighborIndex];
        if (
          this.isCorrectlyConnected(
            pieceId,
            cellIndex,
            neighborPieceId,
            neighborIndex,
          )
        ) {
          adjacency.get(pieceId)!.add(neighborPieceId);
          adjacency.get(neighborPieceId)!.add(pieceId);
        }
      });
    });

    const visited = new Set<number>();
    let largestConnectedPieceIds: number[] = [];
    adjacency.forEach((_neighbors, pieceId) => {
      if (visited.has(pieceId)) {
        return;
      }
      const component: number[] = [];
      const pending = [pieceId];
      while (pending.length > 0) {
        const currentId = pending.pop()!;
        if (visited.has(currentId)) {
          continue;
        }
        visited.add(currentId);
        component.push(currentId);
        adjacency.get(currentId)!.forEach((neighborId) => {
          if (!visited.has(neighborId)) {
            pending.push(neighborId);
          }
        });
      }
      if (component.length > largestConnectedPieceIds.length) {
        largestConnectedPieceIds = component;
      }
      const connectedGroup = new Set(component);
      const connected = component.length >= 2;
      const connectionExpanded =
        playConnectedAnimation &&
        connected &&
        component.some(
          (id) => component.length > (previousGroupSizes.get(id) ?? 1),
        );
      component.forEach((id) => {
        this._connectedGroupByPieceId.set(id, connectedGroup);
        const piece = this._pieces.get(id)!.piece;
        piece.setConnected(connected);
        if (connectionExpanded) {
          piece.playConnectedAnimation();
        }
      });
    });

    const reportedPieceIds =
      largestConnectedPieceIds.length >= 2 ? largestConnectedPieceIds : [];
    if (emitState) {
      const request: PuzzlePieceDropRequest = {
        connectedPieceIds: reportedPieceIds,
      };
      EventCenter.emit(GameEvent.PuzzlePieceDropRequest, request);
    }
    return reportedPieceIds;
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

  /** 通关后保持完整图片位于规则棋盘，并锁定全部拖拽输入。 */
  private onCompleted = (): void => {
    this.stopLevelTimer();
    this._pieces.forEach((runtime) => {
      runtime.piece.setConnected(true);
      runtime.piece.setInteractable(false);
    });
    this.feedbackLabel!.string = `第 ${this.levelConfig.level} 关完成！`;
  };

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

  /** 销毁上一轮实例和运行时切片，并清空格子占用关系。 */
  private clearPieces(): void {
    this._pieces.forEach((runtime) => runtime.piece.node.destroy());
    this._pieces.clear();
    this._pieceIdsByCell.length = 0;
    this._cellIndexByPieceId.clear();
    this._connectedGroupByPieceId.clear();
    this.clearDraggingState();
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
