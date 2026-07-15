import { Button, Color, Label, Node, Sprite, UITransform, Vec3, _decorator } from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

/**
 * Generated from Lanhu design data.
 *
 * Source size: 640 x 1136
 * Coordinate system: top-left
 */
@ccclass("UILanhuSamplePanel")
export class UILanhuSamplePanel extends UIBase {
    private _viewBuilt = false;

    private _eventsBound = false;

    @property({ type: Sprite })
    public bgImg: Sprite | null = null;

    @property({ type: Label })
    public titleLabel: Label | null = null;

    @property({ type: Button })
    public closeBtn: Button | null = null;

    @property({ type: Button })
    public confirmBtn: Button | null = null;

    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        this.buildView();
        this.bindEvents();
    }

    protected onClose(): void {
        this.unbindEvents();
        super.onClose();
    }

    private buildView(): void {
        if (this._viewBuilt) {
            return;
        }

        this._viewBuilt = true;
        this.node.name = "UILanhuSamplePanel";
        this.ensureTransform(this.node, 640, 1136);
        this.bgImg = this.bgImg ?? this.createImageNode("BgImg", 0, 0, 640, 1136);
        this.titleLabel = this.titleLabel ?? this.createTextNode("TitleLabel", -113, 472, 366, 48, "Lanhu Sample", 28, new Color(255, 255, 255, 255));
        this.closeBtn = this.closeBtn ?? this.createButtonNode("CloseBtn", 54, 496, 40, 40);
        this.confirmBtn = this.confirmBtn ?? this.createButtonNode("ConfirmBtn", -113, -220, 270, 56);
    }

    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }

        this._eventsBound = true;
        this.closeBtn?.node.on(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.confirmBtn?.node.on(Button.EventType.CLICK, this.onConfirmBtnClick, this);
    }

    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }

        this._eventsBound = false;
        this.closeBtn?.node.off(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.confirmBtn?.node.off(Button.EventType.CLICK, this.onConfirmBtnClick, this);
    }

    private createImageNode(name: string, x: number, y: number, width: number, height: number): Sprite {
        const node = this.createChild(name, x, y, width, height);
        return node.addComponent(Sprite);
    }

    private createTextNode(name: string, x: number, y: number, width: number, height: number, text: string, fontSize: number, color: Color): Label {
        const node = this.createChild(name, x, y, width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 8;
        label.color = color;
        return label;
    }

    private createButtonNode(name: string, x: number, y: number, width: number, height: number): Button {
        const node = this.createChild(name, x, y, width, height);
        node.addComponent(Sprite);
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
        // TODO: Bind CloseBtn click behavior.
    }

    private onConfirmBtnClick(): void {
        // TODO: Bind ConfirmBtn click behavior.
    }
}
