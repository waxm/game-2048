import { _decorator, Button, Label } from "cc";
import { EventCenter } from "../../core/event/EventCenter";
import { UIBase } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import { GameEvent } from "../../game/GameEvent";

const { ccclass, property } = _decorator;

/**
 * 首页面板。
 *
 * 界面节点由 UIHomePanel.prefab 提供，脚本只负责绑定按钮和派发开始游戏事件。
 */
@ccclass("UIHomePanel")
export class UIHomePanel extends UIBase {
    /** 首页标题。 */
    @property({ type: Label })
    public titleLabel: Label | null = null;

    /** 开始第 1 关按钮。 */
    @property({ type: Button })
    public startButton: Button | null = null;

    /** 首页玩法提示。 */
    @property({ type: Label })
    public tipLabel: Label | null = null;

    /** 是否已经注册按钮事件。 */
    private _eventsBound = false;

    /** 节点加载时调用。 */
    protected onLoad(): void {
        this.assertRequiredBindings({
            titleLabel: this.titleLabel,
            startButton: this.startButton,
            tipLabel: this.tipLabel,
        });
        this.bindEvents();
    }

    /** UI 打开时调用。 */
    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        this.bindEvents();
        Logger.info("打开首页面板。", params);
    }

    /** UI 关闭时调用。 */
    protected onClose(): void {
        this.unbindEvents();
        Logger.info("关闭首页面板。");
        super.onClose();
    }

    /** 注册首页按钮事件。 */
    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }

        this._eventsBound = true;
        this.startButton?.node.on(Button.EventType.CLICK, this.onClickStart, this);
    }

    /** 注销首页按钮事件。 */
    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }

        this._eventsBound = false;
        this.startButton?.node.off(Button.EventType.CLICK, this.onClickStart, this);
    }

    /** 点击开始按钮后进入拼图第 1 关。 */
    public onClickStart(): void {
        EventCenter.emit(GameEvent.GameStart);
    }
}
