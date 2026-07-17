import {
  _decorator,
  EventTouch,
  Label,
  Mask,
  Node,
  Sprite,
  SpriteFrame,
  tween,
  Tween,
  UITransform,
  Vec3,
} from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

/** 拼图块初始化参数。 */
export interface PuzzlePieceParams {
  /** 拼图编号。 */
  id: number;

  /** 拼图块显示的运行时切图。 */
  spriteFrame: SpriteFrame;

  /** 开始拖动时请求面板锁定当前拖拽；返回 false 表示已有其他触摸在操作。 */
  onDragStart: (id: number) => boolean;

  /** 拖动时把本次位移增量交给面板，用于提供跟手反馈。 */
  onDragMove: (id: number, delta: Vec3) => void;

  /** 拖动结束时通知面板执行目标格交换；取消触摸时只允许复位。 */
  onDrop: (id: number, canceled: boolean) => void;
}

/**
 * 单个拼图块 Prefab 脚本。
 *
 * 本组件只采集触摸输入和切换连接显示，不直接判断网格交换与邻接关系。
 * 所有格子占用和拼图进度统一由 UIGamePanel 管理。
 */
@ccclass("PuzzlePiece")
export class PuzzlePiece extends UIBase {
  /** 超过此距离才进入拖拽，避免轻点或触摸抖动误换格。 */
  private static readonly DRAG_START_DISTANCE = 6;

  /** 连接成功时的最大放大倍率。 */
  private static readonly CONNECTED_SCALE = 1.08;

  /** 连接动画单程持续时间，单位为秒。 */
  private static readonly CONNECTED_ANIMATION_DURATION = 0.12;

  /** 拼图块根节点尺寸，用于匹配当前关卡网格。 */
  @property({ type: UITransform })
  public pieceTransform: UITransform | null = null;

  /** 未连接时显示的圆角背景图。 */
  @property({ type: Node })
  public disconnectedBackgroundNode: Node | null = null;

  /** 未连接背景的显示尺寸。 */
  @property({ type: UITransform })
  public disconnectedBackgroundTransform: UITransform | null = null;

  /** 未连接时裁剪图片的圆角遮罩。 */
  @property({ type: Mask })
  public imageMask: Mask | null = null;

  /** 图片遮罩区域的显示尺寸。 */
  @property({ type: UITransform })
  public imageMaskTransform: UITransform | null = null;

  /** 拼图块图片。 */
  @property({ type: Sprite })
  public imageSprite: Sprite | null = null;

  /** 切片图片的完整格子尺寸。 */
  @property({ type: UITransform })
  public imageTransform: UITransform | null = null;

  /** 图片缺失时用于排错的拼图编号。 */
  @property({ type: Label })
  public numberLabel: Label | null = null;

  /** 当前拼图编号。 */
  private _pieceId = -1;

  /** 上一次触摸点在拼图容器中的本地坐标。 */
  private readonly _lastTouchPosition = new Vec3();

  /** 当前触摸开始点，用于判断是否超过拖拽启动距离。 */
  private readonly _touchStartPosition = new Vec3();

  /** 当前由本组件接管的触摸编号；null 表示没有活动触摸。 */
  private _activeTouchId: number | null = null;

  /** 当前触摸是否已经通过距离阈值并被面板接受为拖拽。 */
  private _dragStarted = false;

  /** 当前是否允许拖拽。 */
  private _interactable = true;

  /** 开始拖动回调。 */
  private _onDragStart: ((id: number) => boolean) | null = null;

  /** 拖动位移回调。 */
  private _onDragMove: ((id: number, delta: Vec3) => void) | null = null;

  /** 拖动结束回调。 */
  private _onDrop: ((id: number, canceled: boolean) => void) | null = null;

  /** 节点加载时校验 Prefab 绑定并注册拖拽事件。 */
  protected onLoad(): void {
    this.assertRequiredBindings({
      pieceTransform: this.pieceTransform,
      disconnectedBackgroundNode: this.disconnectedBackgroundNode,
      disconnectedBackgroundTransform: this.disconnectedBackgroundTransform,
      imageMask: this.imageMask,
      imageMaskTransform: this.imageMaskTransform,
      imageSprite: this.imageSprite,
      imageTransform: this.imageTransform,
      numberLabel: this.numberLabel,
    });
    this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
  }

  /**
   * 根据关卡配置设置拼图块尺寸。
   *
   * 根节点、切片和背景始终使用完整格子尺寸，保证底框边界与切割模块一致；
   * 仅把图片遮罩略微内缩，让边框完整包住图片。连接后关闭遮罩即可恢复无缝切片。
   */
  public setDisplaySize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new Error(`拼图块显示尺寸无效：${width}×${height}`);
    }
    this.pieceTransform!.setContentSize(width, height);
    this.imageTransform!.setContentSize(width, height);

    this.disconnectedBackgroundTransform!.setContentSize(width, height);
    this.imageMaskTransform!.setContentSize(
      width * 0.92,
      height * 0.92,
    );
  }

  /** 初始化拼图块图片和拖拽回调。 */
  public setData(params: PuzzlePieceParams): void {
    this.stopConnectedAnimation();
    this._pieceId = params.id;
    this._onDragStart = params.onDragStart;
    this._onDragMove = params.onDragMove;
    this._onDrop = params.onDrop;
    this._interactable = true;
    this.imageSprite!.spriteFrame = params.spriteFrame;
    this.numberLabel!.string = `${params.id + 1}`;
    this.numberLabel!.node.active = false;
    this.setConnected(false);
  }

  /**
   * 切换拼图块的连接表现。
   *
   * 连接状态只影响背景和裁剪，不改变运行时切片与格子尺寸，防止反复交换后
   * SpriteFrame 被重新创建或缩放，从而出现图片错位和闪烁。
   */
  public setConnected(connected: boolean): void {
    this.disconnectedBackgroundNode!.active = !connected;
    this.imageMask!.enabled = !connected;
  }

  /**
   * 播放连接成功的放大回弹动画。
   *
   * 再次触发前先停止旧 Tween 并恢复标准缩放，保证连续合并时动画从确定状态开始，
   * 不会在上一轮倍率上继续叠加导致拼图越来越大。
   */
  public playConnectedAnimation(): void {
    this.stopConnectedAnimation();
    tween(this.node)
      .to(
        PuzzlePiece.CONNECTED_ANIMATION_DURATION,
        {
          scale: new Vec3(
            PuzzlePiece.CONNECTED_SCALE,
            PuzzlePiece.CONNECTED_SCALE,
            1,
          ),
        },
        { easing: "quadOut" },
      )
      .to(
        PuzzlePiece.CONNECTED_ANIMATION_DURATION,
        { scale: new Vec3(1, 1, 1) },
        { easing: "quadIn" },
      )
      .start();
  }

  /** 设置是否允许继续拖动，通关后用于锁定完整图片。 */
  public setInteractable(interactable: boolean): void {
    this._interactable = interactable;
    if (!interactable) {
      this.resetTouchState();
    }
  }

  /** 拼图块销毁时注销输入事件和回调引用。 */
  protected onDestroy(): void {
    this.stopConnectedAnimation();
    this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    this.resetTouchState();
    this._onDragStart = null;
    this._onDragMove = null;
    this._onDrop = null;
    super.onDestroy();
  }

  /** 记录唯一活动触摸及起点；此时尚不移动节点，等待超过拖拽阈值。 */
  private onTouchStart(event: EventTouch): void {
    if (!this._interactable || this._activeTouchId !== null) {
      return;
    }
    this.stopConnectedAnimation();
    const position = this.getTouchPosition(event);
    this._activeTouchId = event.getID();
    this._dragStarted = false;
    this._touchStartPosition.set(position);
    this._lastTouchPosition.set(position);
  }

  /** 超过启动距离后申请拖拽，并持续把同一触摸的位移交给面板。 */
  private onTouchMove(event: EventTouch): void {
    if (
      !this._interactable ||
      this._activeTouchId === null ||
      event.getID() !== this._activeTouchId
    ) {
      return;
    }

    const position = this.getTouchPosition(event);
    let deltaX = position.x - this._lastTouchPosition.x;
    let deltaY = position.y - this._lastTouchPosition.y;
    this._lastTouchPosition.set(position);

    if (!this._dragStarted) {
      const totalDeltaX = position.x - this._touchStartPosition.x;
      const totalDeltaY = position.y - this._touchStartPosition.y;
      if (
        Math.hypot(totalDeltaX, totalDeltaY) <
        PuzzlePiece.DRAG_START_DISTANCE
      ) {
        return;
      }
      if (!this._onDragStart?.(this._pieceId)) {
        // 面板已被其他触摸占用时，本次触摸后续事件全部忽略。
        this.resetTouchState();
        return;
      }
      this._dragStarted = true;
      deltaX = totalDeltaX;
      deltaY = totalDeltaY;
    }

    this._onDragMove?.(this._pieceId, new Vec3(deltaX, deltaY, 0));
  }

  /** 拖动结束后由面板选择最近目标格并交换格子内容。 */
  private onTouchEnd(event: EventTouch): void {
    this.finishTouch(event, false);
  }

  /** 触摸被系统中断时通知面板强制复位，不允许把当前位置当作有效落点。 */
  private onTouchCancel(event: EventTouch): void {
    this.finishTouch(event, true);
  }

  /** 结束当前唯一触摸，并区分正常松手和系统取消两条提交路径。 */
  private finishTouch(event: EventTouch, canceled: boolean): void {
    if (
      this._activeTouchId === null ||
      event.getID() !== this._activeTouchId
    ) {
      return;
    }
    if (this._dragStarted) {
      this._onDrop?.(this._pieceId, canceled);
    }
    this.resetTouchState();
  }

  /** 将 UI 世界坐标转换为拼图容器的本地坐标。 */
  private getTouchPosition(event: EventTouch): Vec3 {
    const location = event.getUILocation();
    return this.node
      .parent!.getComponent(UITransform)!
      .convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
  }

  /** 停止当前连接 Tween 并恢复标准缩放；可在重玩、销毁和触摸前重复调用。 */
  private stopConnectedAnimation(): void {
    Tween.stopAllByTarget(this.node);
    this.node.setScale(1, 1, 1);
  }

  /** 清空本组件的触摸编号和阈值状态；允许在禁用、结束和销毁时重复调用。 */
  private resetTouchState(): void {
    this._activeTouchId = null;
    this._dragStarted = false;
    this._touchStartPosition.set(0, 0, 0);
    this._lastTouchPosition.set(0, 0, 0);
  }
}
