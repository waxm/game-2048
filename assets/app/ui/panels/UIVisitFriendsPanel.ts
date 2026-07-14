import { _decorator, Button, Node, Prefab, ScrollView } from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

@ccclass("UIVisitFriendsPanel")
export class UIVisitFriendsPanel extends UIBase {
    @property({ type: Button })
    public closeBtn: Button | null = null;

    @property({ type: Button })
    public searchBtn: Button | null = null;

    @property({ type: ScrollView })
    public friendScrollView: ScrollView | null = null;

    @property({ type: Node })
    public content: Node | null = null;

    @property({ type: Prefab })
    public itemPrefab: Prefab | null = null;

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
        this.searchBtn?.node.on(Button.EventType.CLICK, this.onSearchBtnClick, this);
    }

    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }

        this._eventsBound = false;
        this.closeBtn?.node.off(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.searchBtn?.node.off(Button.EventType.CLICK, this.onSearchBtnClick, this);
    }

    private onCloseBtnClick(): void {
        // TODO: 绑定关闭串门面板逻辑。
    }

    private onSearchBtnClick(): void {
        // TODO: 绑定房间号搜索逻辑。
    }

}
