import { _decorator, Button } from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

@ccclass("UIRenameConfirmPanel")
export class UIRenameConfirmPanel extends UIBase {
    @property({ type: Button })
    public closeBtn: Button | null = null;

    @property({ type: Button })
    public cancelBtn: Button | null = null;

    @property({ type: Button })
    public confirmBtn: Button | null = null;

    private _eventsBound = false;

    protected onLoad(): void {
        this.bindEvents();
    }

    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        this.bindEvents();
    }

    protected onClose(): void {
        this.unbindEvents();
        super.onClose();
    }

    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }

        this._eventsBound = true;
        this.closeBtn?.node.on(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.cancelBtn?.node.on(Button.EventType.CLICK, this.onCancelBtnClick, this);
        this.confirmBtn?.node.on(Button.EventType.CLICK, this.onConfirmBtnClick, this);
    }

    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }

        this._eventsBound = false;
        this.closeBtn?.node.off(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.cancelBtn?.node.off(Button.EventType.CLICK, this.onCancelBtnClick, this);
        this.confirmBtn?.node.off(Button.EventType.CLICK, this.onConfirmBtnClick, this);
    }

    private onCloseBtnClick(): void {
        // TODO: 绑定关闭弹窗逻辑。
    }

    private onCancelBtnClick(): void {
        // TODO: 绑定取消改名逻辑。
    }

    private onConfirmBtnClick(): void {
        // TODO: 绑定确认改名逻辑。
    }
}
