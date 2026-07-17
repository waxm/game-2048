import {
  _decorator,
  EventTouch,
  Label,
  Mask,
  Node,
  Sprite,
  SpriteFrame,
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

  /** 开始拖动时通知面板记录当前所在格子。 */
  onDragStart: (id: number) => void;

  /** 拖动时把本次位移增量交给面板，用于提供跟手反馈。 */
  onDragMove: (id: number, delta: Vec3) => void;

  /** 拖动结束时通知面板执行目标格交换。 */
  onDrop: (id: number) => void;
}

/**
 * 单个拼图块 Prefab 脚本。
 *
 * 本组件只采集触摸输入和切换连接显示，不直接判断网格交换与邻接关系。
 * 所有格子占用和拼图进度统一由 UIGamePanel 管理。
 */
@ccclass("PuzzlePiece")
export class PuzzlePiece extends UIBase {
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

  /** 当前是否允许拖拽。 */
  private _interactable = true;

  /** 开始拖动回调。 */
  private _onDragStart: ((id: number) => void) | null = null;

  /** 拖动位移回调。 */
  private _onDragMove: ((id: number, delta: Vec3) => void) | null = null;

  /** 拖动结束回调。 */
  private _onDrop: ((id: number) => void) | null = null;

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
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
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

  /** 设置是否允许继续拖动，通关后用于锁定完整图片。 */
  public setInteractable(interactable: boolean): void {
    this._interactable = interactable;
  }

  /** 拼图块销毁时注销输入事件和回调引用。 */
  protected onDestroy(): void {
    this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    this._onDragStart = null;
    this._onDragMove = null;
    this._onDrop = null;
    super.onDestroy();
  }

  /** 记录初始触摸位置，并通知面板记录拼图原始格子。 */
  private onTouchStart(event: EventTouch): void {
    if (!this._interactable) {
      return;
    }
    this._lastTouchPosition.set(this.getTouchPosition(event));
    this._onDragStart?.(this._pieceId);
  }

  /** 计算相邻两帧的触摸位移，为当前拼图提供跟手反馈。 */
  private onTouchMove(event: EventTouch): void {
    if (!this._interactable) {
      return;
    }

    const position = this.getTouchPosition(event);
    const delta = new Vec3(
      position.x - this._lastTouchPosition.x,
      position.y - this._lastTouchPosition.y,
      0,
    );
    this._lastTouchPosition.set(position);
    this._onDragMove?.(this._pieceId, delta);
  }

  /** 拖动结束后由面板选择最近目标格并交换格子内容。 */
  private onTouchEnd(): void {
    if (!this._interactable) {
      return;
    }
    this._onDrop?.(this._pieceId);
  }

  /** 将 UI 世界坐标转换为拼图容器的本地坐标。 */
  private getTouchPosition(event: EventTouch): Vec3 {
    const location = event.getUILocation();
    return this.node
      .parent!.getComponent(UITransform)!
      .convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
  }
}
