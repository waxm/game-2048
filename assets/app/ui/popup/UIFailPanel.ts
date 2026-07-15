import { _decorator, Button, Color, Graphics, Label } from "cc";
import { EventCenter } from "../../core/event/EventCenter";
import { UIBase } from "../../core/ui/UIBase";
import { GameEvent } from "../../game/GameEvent";

const { ccclass, property } = _decorator;

/** 拼图关卡超时后的失败弹窗。 */
@ccclass("UIFailPanel")
export class UIFailPanel extends UIBase {
  /** 全屏半透明遮罩。 */
  @property({ type: Graphics })
  public overlayGraphics: Graphics | null = null;

  /** 弹窗主体背景。 */
  @property({ type: Graphics })
  public panelGraphics: Graphics | null = null;

  /** 失败标题。 */
  @property({ type: Label })
  public titleLabel: Label | null = null;

  /** 失败原因说明。 */
  @property({ type: Label })
  public messageLabel: Label | null = null;

  /** 重新挑战按钮。 */
  @property({ type: Button })
  public retryButton: Button | null = null;

  /** 重新挑战按钮背景。 */
  @property({ type: Graphics })
  public retryButtonGraphics: Graphics | null = null;

  /** 返回首页按钮。 */
  @property({ type: Button })
  public homeButton: Button | null = null;

  /** 返回首页按钮背景。 */
  @property({ type: Graphics })
  public homeButtonGraphics: Graphics | null = null;

  /** 是否已经注册按钮事件。 */
  private _eventsBound = false;

  /** 校验 Prefab 绑定、绘制固定背景并注册按钮。 */
  protected onLoad(): void {
    this.assertRequiredBindings({
      overlayGraphics: this.overlayGraphics,
      panelGraphics: this.panelGraphics,
      titleLabel: this.titleLabel,
      messageLabel: this.messageLabel,
      retryButton: this.retryButton,
      retryButtonGraphics: this.retryButtonGraphics,
      homeButton: this.homeButton,
      homeButtonGraphics: this.homeButtonGraphics,
    });
    this.drawView();
    this.bindEvents();
  }

  /** 打开弹窗时刷新失败文案并确保按钮事件有效。 */
  protected onOpen(params?: unknown): void {
    super.onOpen(params);
    this.titleLabel!.string = "挑战失败";
    this.messageLabel!.string = "时间已经用完，再试一次吧";
    this.bindEvents();
  }

  /** 关闭弹窗时注销按钮事件。 */
  protected onClose(): void {
    this.unbindEvents();
    super.onClose();
  }

  /** 绘制遮罩、弹窗底板和两个按钮的固定外观。 */
  private drawView(): void {
    this.drawRoundedRect(
      this.overlayGraphics!,
      -320,
      -568,
      640,
      1136,
      0,
      new Color(16, 18, 22, 210),
    );
    this.drawRoundedRect(
      this.panelGraphics!,
      -250,
      -190,
      500,
      380,
      8,
      new Color(245, 247, 250, 255),
    );
    this.drawRoundedRect(
      this.retryButtonGraphics!,
      -100,
      -34,
      200,
      68,
      8,
      new Color(45, 127, 249, 255),
    );
    this.drawRoundedRect(
      this.homeButtonGraphics!,
      -100,
      -34,
      200,
      68,
      8,
      new Color(91, 101, 116, 255),
    );
  }

  /** 使用指定 Graphics 绘制单色圆角矩形。 */
  private drawRoundedRect(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: Color,
  ): void {
    graphics.clear();
    graphics.fillColor = color;
    graphics.roundRect(x, y, width, height, radius);
    graphics.fill();
  }

  /** 注册重玩和返回首页按钮；重复调用不会重复绑定。 */
  private bindEvents(): void {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    this.retryButton!.node.on(Button.EventType.CLICK, this.onRetry, this);
    this.homeButton!.node.on(Button.EventType.CLICK, this.onHome, this);
  }

  /** 注销失败弹窗按钮事件；允许重复调用。 */
  private unbindEvents(): void {
    if (!this._eventsBound) {
      return;
    }
    this._eventsBound = false;
    this.retryButton!.node.off(Button.EventType.CLICK, this.onRetry, this);
    this.homeButton!.node.off(Button.EventType.CLICK, this.onHome, this);
  }

  /** 请求重新开始当前关卡。 */
  private onRetry = (): void => EventCenter.emit(GameEvent.PuzzleRestart);

  /** 请求离开游戏并返回首页场景。 */
  private onHome = (): void => EventCenter.emit(GameEvent.BackToLobby);
}
