import {
  _decorator,
  EventTouch,
  Label,
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

  /** 开始拖动时通知面板提升整个拼图组合的显示层级。 */
  onDragStart: (id: number) => void;

  /** 拖动时把本次位移增量交给面板，由面板移动整个拼图组合。 */
  onDragMove: (id: number, delta: Vec3) => void;

  /** 拖动结束时通知面板执行相邻块吸附判断。 */
  onDrop: (id: number) => void;
}

/**
 * 单个拼图块 Prefab 脚本。
 *
 * 本组件只采集触摸输入，不直接判断吸附关系。组合移动和合并规则统一由
 * UIGamePanel 管理，避免已经合并的拼图块被单独拖散。
 */
@ccclass("PuzzlePiece")
export class PuzzlePiece extends UIBase {
  /** 拼图块根节点尺寸，用于匹配当前关卡网格。 */
  @property({ type: UITransform })
  public pieceTransform: UITransform | null = null;

  /** 拼图块图片。 */
  @property({ type: Sprite })
  public imageSprite: Sprite | null = null;

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
      imageSprite: this.imageSprite,
      numberLabel: this.numberLabel,
    });
    this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  /** 根据关卡配置设置拼图块的显示尺寸和触摸区域。 */
  public setDisplaySize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new Error(`拼图块显示尺寸无效：${width}×${height}`);
    }
    this.pieceTransform!.setContentSize(width, height);
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

  /** 记录初始触摸位置，并通知面板准备移动整个组合。 */
  private onTouchStart(event: EventTouch): void {
    if (!this._interactable) {
      return;
    }
    this._lastTouchPosition.set(this.getTouchPosition(event));
    this._onDragStart?.(this._pieceId);
  }

  /** 计算相邻两帧的触摸位移，避免组合内各节点产生不同的拖拽偏移。 */
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

  /** 拖动结束后由面板查找可吸附的正确邻块。 */
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
