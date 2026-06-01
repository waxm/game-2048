import { _decorator, Component } from "cc";

const { ccclass } = _decorator;

/**
 * UI 面板基类。
 *
 * 所有 UI 面板都建议继承这个类，统一打开、关闭、显示、隐藏的生命周期。
 */
@ccclass("UIBase")
export class UIBase extends Component {
    /** 当前 UI 是否已经通过 open 打开。 */
    private _isOpened = false;

    /** 打开 UI 时传入的参数，方便面板内部读取。 */
    private _openParams: unknown = null;

    /** 当前 UI 是否处于打开状态。 */
    public get isOpened(): boolean {
        return this._isOpened;
    }

    /** 获取 UI 打开时传入的参数。 */
    public get openParams(): unknown {
        return this._openParams;
    }

    /**
     * 打开 UI。
     *
     * UIManager 后续会统一调用这个方法，而不是直接操作节点 active。
     */
    public open(params?: unknown): void {
        this._openParams = params ?? null;
        this._isOpened = true;
        this.node.active = true;

        this.onOpen(params);
        this.onShow();
    }

    /**
     * 关闭 UI。
     *
     * 会依次触发 onHide 和 onClose，适合在 onClose 里释放事件监听、计时器等资源。
     */
    public close(): void {
        if (!this._isOpened) {
            this.node.active = false;
            return;
        }

        this.onHide();
        this.onClose();

        this._isOpened = false;
        this._openParams = null;
        this.node.active = false;
    }

    /**
     * 显示 UI。
     *
     * 只改变显示状态，不会重新触发 onOpen。
     */
    public show(): void {
        if (this.node.active) {
            return;
        }

        this.node.active = true;
        this.onShow();
    }

    /**
     * 隐藏 UI。
     *
     * 只改变显示状态，不会触发 onClose。
     */
    public hide(): void {
        if (!this.node.active) {
            return;
        }

        this.onHide();
        this.node.active = false;
    }

    /**
     * UI 打开时调用。
     *
     * 子类在这里读取参数并初始化界面。
     */
    protected onOpen(params?: unknown): void {
        // 子类重写：处理 UI 打开时的初始化逻辑。
    }

    /**
     * UI 关闭时调用。
     *
     * 子类在这里注销事件、停止计时器、清理临时状态。
     */
    protected onClose(): void {
        // 子类重写：处理 UI 关闭时的清理逻辑。
    }

    /**
     * UI 显示时调用。
     *
     * 子类在这里刷新显示内容。
     */
    protected onShow(): void {
        // 子类重写：处理 UI 显示时的刷新逻辑。
    }

    /**
     * UI 隐藏时调用。
     *
     * 子类在这里暂停动画、暂停刷新等。
     */
    protected onHide(): void {
        // 子类重写：处理 UI 隐藏时的暂停逻辑。
    }

    /**
     * Cocos 节点销毁时调用。
     *
     * 如果面板仍处于打开状态，补一次关闭清理，避免泄漏。
     */
    protected onDestroy(): void {
        if (this._isOpened) {
            this.onClose();
        }
    }
}
