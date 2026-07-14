import { _decorator, Button, Label, Sprite } from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

export interface VisitFriendItemData {
    name: string;
    reputation: string;
}

@ccclass("UIVisitFriendItem")
export class UIVisitFriendItem extends UIBase {
    @property({ type: Sprite })
    public avatar: Sprite | null = null;

    @property({ type: Label })
    public nameLabel: Label | null = null;

    @property({ type: Label })
    public reputationLabel: Label | null = null;

    @property({ type: Button })
    public visitBtn: Button | null = null;

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

    public setData(data: VisitFriendItemData): void {
        if (this.nameLabel) {
            this.nameLabel.string = data.name;
        }
        if (this.reputationLabel) {
            this.reputationLabel.string = data.reputation;
        }
    }

    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }

        this._eventsBound = true;
        this.visitBtn?.node.on(Button.EventType.CLICK, this.onVisitBtnClick, this);
    }

    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }

        this._eventsBound = false;
        this.visitBtn?.node.off(Button.EventType.CLICK, this.onVisitBtnClick, this);
    }

    private onVisitBtnClick(): void {
        // TODO: 绑定单个好友串门逻辑。
    }
}
