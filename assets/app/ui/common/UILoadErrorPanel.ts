import { _decorator, Button, Color, Graphics, Label } from "cc";
import { UIBase } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";

const { ccclass, property } = _decorator;

/** 打开通用加载失败弹窗时传入的恢复操作。 */
export interface UILoadErrorPanelOpenParams {
    /** 弹窗标题。 */
    title: string;

    /** 面向玩家显示的失败说明。 */
    message: string;

    /** 重试按钮文字；不传时显示“重新尝试”。 */
    retryLabel?: string;

    /** 返回按钮文字；不传时显示“返回大厅”。 */
    backLabel?: string;

    /** 点击重试后由当前场景重新发起原请求。 */
    onRetry: () => void;

    /** 可选返回操作；不传时隐藏返回按钮。 */
    onBack?: () => void;
}

/** UI、场景或资源加载失败时使用的通用恢复弹窗。 */
@ccclass("UILoadErrorPanel")
export class UILoadErrorPanel extends UIBase {
    /** 全屏半透明输入遮罩。 */
    @property({ type: Graphics })
    public overlayGraphics: Graphics | null = null;

    /** 弹窗主体背景。 */
    @property({ type: Graphics })
    public panelGraphics: Graphics | null = null;

    /** 失败标题。 */
    @property({ type: Label })
    public titleLabel: Label | null = null;

    /** 失败原因和恢复提示。 */
    @property({ type: Label })
    public messageLabel: Label | null = null;

    /** 重新发起原请求的按钮。 */
    @property({ type: Button })
    public retryButton: Button | null = null;

    /** 重试按钮背景。 */
    @property({ type: Graphics })
    public retryButtonGraphics: Graphics | null = null;

    /** 重试按钮文字。 */
    @property({ type: Label })
    public retryButtonLabel: Label | null = null;

    /** 放弃当前流程并返回安全场景的按钮。 */
    @property({ type: Button })
    public backButton: Button | null = null;

    /** 返回按钮背景。 */
    @property({ type: Graphics })
    public backButtonGraphics: Graphics | null = null;

    /** 返回按钮文字。 */
    @property({ type: Label })
    public backButtonLabel: Label | null = null;

    /** 当前弹窗持有的恢复操作，关闭时必须清空，避免跨场景保留回调。 */
    private _params: UILoadErrorPanelOpenParams | null = null;

    /** 是否已经注册按钮事件。 */
    private _eventsBound = false;

    /** 是否已经提交一次恢复操作，防止连续点击重复发起请求。 */
    private _actionPending = false;

    /** 校验 Prefab 绑定、绘制固定外观并注册按钮事件。 */
    protected onLoad(): void {
        this.assertRequiredBindings({
            overlayGraphics: this.overlayGraphics,
            panelGraphics: this.panelGraphics,
            titleLabel: this.titleLabel,
            messageLabel: this.messageLabel,
            retryButton: this.retryButton,
            retryButtonGraphics: this.retryButtonGraphics,
            retryButtonLabel: this.retryButtonLabel,
            backButton: this.backButton,
            backButtonGraphics: this.backButtonGraphics,
            backButtonLabel: this.backButtonLabel,
        });
        this.drawView();
        this.bindEvents();
    }

    /** 根据当前失败场景刷新提示和可用操作。 */
    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        this._params = this.readOpenParams(params);
        this.titleLabel!.string = this._params.title;
        this.messageLabel!.string = this._params.message;
        this.retryButtonLabel!.string = this._params.retryLabel ?? "重新尝试";
        this.backButtonLabel!.string = this._params.backLabel ?? "返回大厅";
        this.backButton!.node.active = Boolean(this._params.onBack);
        this.setActionPending(false);
        this.bindEvents();
    }

    /** 关闭时注销事件并释放场景回调引用。 */
    protected onClose(): void {
        this.unbindEvents();
        this._params = null;
        this._actionPending = false;
        super.onClose();
    }

    /** 绘制遮罩、弹窗底板和操作按钮。 */
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
            -200,
            500,
            400,
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
            this.backButtonGraphics!,
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

    /** 校验场景传入的提示文案和恢复回调。 */
    private readOpenParams(params: unknown): UILoadErrorPanelOpenParams {
        if (!params || typeof params !== "object" || !("onRetry" in params)) {
            throw new Error("打开 UILoadErrorPanel 时必须传入恢复参数。");
        }
        const errorParams = params as UILoadErrorPanelOpenParams;
        if (
            typeof errorParams.title !== "string" ||
            errorParams.title.length === 0 ||
            typeof errorParams.message !== "string" ||
            errorParams.message.length === 0 ||
            typeof errorParams.onRetry !== "function" ||
            (errorParams.onBack !== undefined &&
                typeof errorParams.onBack !== "function")
        ) {
            throw new Error("UILoadErrorPanel 收到的恢复参数无效。");
        }
        return errorParams;
    }

    /** 注册重试和返回按钮事件；重复调用不会重复绑定。 */
    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }
        this._eventsBound = true;
        this.retryButton!.node.on(Button.EventType.CLICK, this.onRetry, this);
        this.backButton!.node.on(Button.EventType.CLICK, this.onBack, this);
    }

    /** 注销按钮事件；关闭和销毁流程可以重复调用。 */
    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }
        this._eventsBound = false;
        this.retryButton!.node.off(Button.EventType.CLICK, this.onRetry, this);
        this.backButton!.node.off(Button.EventType.CLICK, this.onBack, this);
    }

    /** 提交重试操作，并锁定按钮直到场景关闭弹窗或操作同步失败。 */
    private onRetry = (): void => {
        this.invokeAction(this._params?.onRetry, "重试");
    };

    /** 提交返回操作，并锁定按钮防止重复切换场景。 */
    private onBack = (): void => {
        this.invokeAction(this._params?.onBack, "返回");
    };

    /** 安全执行场景回调，回调同步抛错时恢复按钮并保留当前弹窗。 */
    private invokeAction(
        callback: (() => void) | undefined,
        actionName: string,
    ): void {
        if (!callback || this._actionPending) {
            return;
        }
        this.setActionPending(true);
        try {
            callback();
        } catch (error) {
            this.setActionPending(false);
            Logger.error(`加载失败弹窗执行${actionName}操作失败。`, error);
        }
    }

    /** 统一切换按钮交互状态，避免重试和返回请求并发执行。 */
    private setActionPending(pending: boolean): void {
        this._actionPending = pending;
        this.retryButton!.interactable = !pending;
        this.backButton!.interactable = !pending;
    }
}
