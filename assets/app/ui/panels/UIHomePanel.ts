import { _decorator, Color, Label, Node, UITransform, Vec3 } from "cc";
import { EventCenter } from "../../core/event/EventCenter";
import { UIBase } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import { GameEvent } from "../../game/GameEvent";

const { ccclass } = _decorator;

/**
 * 首页面板模板。
 *
 * 后续真正制作 UIHomePanel.prefab 时，把这个脚本挂到面板根节点上。
 */
@ccclass("UIHomePanel")
export class UIHomePanel extends UIBase {
  /** 当前是否已经构建过界面。 */
  private _viewBuilt = false;

  /**
   * UI 打开时调用。
   *
   * 这里适合刷新首页数据，例如金币、体力、关卡进度。
   */
  protected onOpen(params?: unknown): void {
    super.onOpen(params);
    this.buildView();
    this.node.on(Node.EventType.TOUCH_END, this.onClickStart, this);
    Logger.info("打开首页面板。", params);
  }

  /**
   * UI 关闭时调用。
   *
   * 这里适合注销按钮外的临时监听、停止动画等。
   */
  protected onClose(): void {
    this.node.off(Node.EventType.TOUCH_END, this.onClickStart, this);
    Logger.info("关闭首页面板。");
    super.onClose();
  }

  /**
   * 构建首页基础界面。
   *
   * Demo 阶段先用代码生成文本，后续可以替换成正式 Prefab。
   */
  private buildView(): void {
    if (this._viewBuilt) {
      return;
    }

    this._viewBuilt = true;
    this.node.name = "UIHomePanel";
    this.node.addComponent(UITransform).setContentSize(720, 1280);
    this.createLabel("TitleLabel", "Work AI Demo", 0, 160, 48, Color.WHITE);
    this.createLabel("StartLabel", "点击屏幕开始游戏", 0, 40, 34, new Color(255, 230, 120));
    this.createLabel("TipLabel", "限时点击得分，达标获得金币", 0, -40, 26, new Color(180, 220, 255));
  }

  /**
   * 创建一个文本节点。
   */
  private createLabel(name: string, text: string, x: number, y: number, fontSize: number, color: Color): Label {
    const node = new Node(name);
    node.setPosition(new Vec3(x, y, 0));
    this.node.addChild(node);

    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;

    return label;
  }

  /**
   * 点击开始按钮。
   *
   * 在 Creator 里可以把按钮点击事件绑定到这个方法。
   */
  public onClickStart(): void {
    EventCenter.emit(GameEvent.GameStart);
  }
}
