import { _decorator, Button, Node, Sprite, SpriteFrame, UITransform, Vec3, resources } from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

@ccclass("UIUpgradePanel")
export class UIUpgradePanel extends UIBase {
    @property({ type: Sprite })
    public lanhuReferenceImg: Sprite | null = null;

    @property({ type: Button })
    public closeBtn: Button | null = null;

    @property({ type: Button })
    public actionBtn: Button | null = null;

    private _viewBuilt = false;
    private _eventsBound = false;

    protected onLoad(): void {
        this.buildView();
        this.bindEvents();
        this.loadLanhuReference();
    }

    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        this.buildView();
        this.bindEvents();
        this.loadLanhuReference();
    }

    protected onClose(): void {
        this.unbindEvents();
        super.onClose();
    }

    private buildView(): void {
        if (this._viewBuilt) return;
        this._viewBuilt = true;
        this.node.name = "UIUpgradePanel";
        this.ensureTransform(this.node, 640, 1136);

        const referenceNode = this.createChild("LanhuReferenceImg", 0, 0, 640, 1385);
        this.lanhuReferenceImg = referenceNode.addComponent(Sprite);
        this.closeBtn = this.createButtonHitArea("CloseBtn", 185, -67, 72, 72);
        this.actionBtn = this.createButtonHitArea("ActionBtn", 0, -232, 260, 76);
    }

    private bindEvents(): void {
        if (this._eventsBound) return;
        this._eventsBound = true;
        this.closeBtn?.node.on(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.actionBtn?.node.on(Button.EventType.CLICK, this.onActionBtnClick, this);
    }

    private unbindEvents(): void {
        if (!this._eventsBound) return;
        this._eventsBound = false;
        this.closeBtn?.node.off(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.actionBtn?.node.off(Button.EventType.CLICK, this.onActionBtnClick, this);
    }

    private loadLanhuReference(): void {
        if (!this.lanhuReferenceImg || this.lanhuReferenceImg.spriteFrame) return;
        resources.load("lanhu/upgrade/reference/spriteFrame", SpriteFrame, (error, spriteFrame) => {
            if (error || !spriteFrame || !this.lanhuReferenceImg) return;
            this.lanhuReferenceImg.spriteFrame = spriteFrame;
        });
    }

    private createButtonHitArea(name: string, x: number, y: number, width: number, height: number): Button {
        const node = this.createChild(name, x, y, width, height);
        return node.addComponent(Button);
    }

    private createChild(name: string, x: number, y: number, width: number, height: number): Node {
        const node = new Node(name);
        node.setPosition(new Vec3(x, y, 0));
        this.ensureTransform(node, width, height);
        this.node.addChild(node);
        return node;
    }

    private ensureTransform(node: Node, width: number, height: number): UITransform {
        const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        transform.setContentSize(width, height);
        return transform;
    }

    private onCloseBtnClick(): void {
        // TODO: 绑定关闭逻辑。
    }

    private onActionBtnClick(): void {
        // TODO: 绑定主按钮逻辑。
    }
}
