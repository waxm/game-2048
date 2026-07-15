import {
    _decorator,
    Button,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
    resources,
} from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

/**
 * 蓝湖“失败”界面初版绑定脚本。
 *
 * 当前蓝湖只拿到了整张合成图，暂时用整图作为参考背景，
 * 并额外生成可绑定的关闭与再次挑战点击区域。
 */
@ccclass("UIFailPanel")
export class UIFailPanel extends UIBase {
    @property({ type: Sprite })
    public lanhuReferenceImg: Sprite | null = null;

    @property({ type: Button })
    public closeBtn: Button | null = null;

    @property({ type: Button })
    public retryBtn: Button | null = null;

    private _viewBuilt = false;

    private _eventsBound = false;

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
        if (this._viewBuilt) {
            return;
        }

        this._viewBuilt = true;
        this.node.name = "UIFailPanel";
        this.ensureTransform(this.node, 640, 1136);

        const referenceNode = this.createChild(
            "LanhuReferenceImg",
            0,
            0,
            640,
            1456,
        );
        this.lanhuReferenceImg = referenceNode.addComponent(Sprite);

        this.closeBtn = this.createButtonHitArea("CloseBtn", 270, 263, 76, 76);
        this.retryBtn = this.createButtonHitArea(
            "RetryBtn",
            -4,
            -252,
            260,
            110,
        );
    }

    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }

        this._eventsBound = true;
        this.closeBtn?.node.on(
            Button.EventType.CLICK,
            this.onCloseBtnClick,
            this,
        );
        this.retryBtn?.node.on(
            Button.EventType.CLICK,
            this.onRetryBtnClick,
            this,
        );
    }

    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }

        this._eventsBound = false;
        this.closeBtn?.node.off(
            Button.EventType.CLICK,
            this.onCloseBtnClick,
            this,
        );
        this.retryBtn?.node.off(
            Button.EventType.CLICK,
            this.onRetryBtnClick,
            this,
        );
    }

    private loadLanhuReference(): void {
        if (!this.lanhuReferenceImg || this.lanhuReferenceImg.spriteFrame) {
            return;
        }

        resources.load(
            "textures/popup/fail-panel/spriteFrame",
            SpriteFrame,
            (error, spriteFrame) => {
                if (error || !spriteFrame || !this.lanhuReferenceImg) {
                    return;
                }

                this.lanhuReferenceImg.spriteFrame = spriteFrame;
            },
        );
    }

    private createButtonHitArea(
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ): Button {
        const node = this.createChild(name, x, y, width, height);
        return node.addComponent(Button);
    }

    private createChild(
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ): Node {
        const node = new Node(name);
        node.setPosition(new Vec3(x, y, 0));
        this.ensureTransform(node, width, height);
        this.node.addChild(node);
        return node;
    }

    private ensureTransform(
        node: Node,
        width: number,
        height: number,
    ): UITransform {
        const transform =
            node.getComponent(UITransform) ?? node.addComponent(UITransform);
        transform.setContentSize(width, height);
        return transform;
    }

    private onCloseBtnClick(): void {
        // TODO: 绑定关闭失败面板逻辑。
    }

    private onRetryBtnClick(): void {
        // TODO: 绑定再次挑战逻辑。
    }
}
