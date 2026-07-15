import { _decorator, Button, Label } from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

@ccclass("UIRenamePanel")
export class UIRenamePanel extends UIBase {
    @property({ type: Button })
    public closeBtn: Button | null = null;

    @property({ type: Button })
    public renameCardBtn: Button | null = null;

    @property({ type: Button })
    public jadeBtn: Button | null = null;

    @property({ type: Label })
    public nameInputLabel: Label | null = null;

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

    public setPetName(name: string): void {
        if (this.nameInputLabel) {
            this.nameInputLabel.string = name;
        }
    }

    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }

        this._eventsBound = true;
        this.closeBtn?.node.on(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.renameCardBtn?.node.on(Button.EventType.CLICK, this.onRenameCardBtnClick, this);
        this.jadeBtn?.node.on(Button.EventType.CLICK, this.onJadeBtnClick, this);
    }

    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }

        this._eventsBound = false;
        this.closeBtn?.node.off(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.renameCardBtn?.node.off(Button.EventType.CLICK, this.onRenameCardBtnClick, this);
        this.jadeBtn?.node.off(Button.EventType.CLICK, this.onJadeBtnClick, this);
    }

    private onCloseBtnClick(): void {
        // TODO: 绑定关闭改名弹窗逻辑。
    }

    private onRenameCardBtnClick(): void {
        // TODO: 绑定使用改名卡逻辑。
    }

    private onJadeBtnClick(): void {
        // TODO: 绑定使用灵玉改名逻辑。
    }
}
