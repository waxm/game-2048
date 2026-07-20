import { _decorator, Component, isValid } from "cc";
import { Logger } from "../utils/Logger";

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

    /** 是否正在执行关闭生命周期，防止回调重入后重复清理。 */
    private _closing = false;

    /** 当前 UI 是否处于打开状态。 */
    public get isOpened(): boolean {
        return this._isOpened;
    }

    /** 获取 UI 打开时传入的参数。 */
    public get openParams(): unknown {
        return this._openParams;
    }

    /**
     * 校验 Prefab 中的必填节点引用。
     *
     * Prefab 驱动的 UI 必须在 Inspector 中显式绑定节点；缺失时立即报错，
     * 不允许通过运行时查找节点来掩盖配置问题。
     */
    protected assertRequiredBindings(bindings: Record<string, unknown>): void {
        const missingNames: string[] = [];

        for (const name in bindings) {
            if (bindings[name] === null || bindings[name] === undefined) {
                missingNames.push(name);
            }
        }

        if (missingNames.length > 0) {
            throw new Error(`UI Prefab 节点未绑定：${this.node.name}.${missingNames.join("、")}`);
        }
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
            if (isValid(this.node, true)) {
                this.node.active = false;
            }
            return;
        }

        this.finishCloseLifecycle();
        if (isValid(this.node, true)) {
            this.node.active = false;
        }
    }

    /**
     * 节点即将被场景树销毁时提前完成关闭清理。
     *
     * Cocos 会先销毁子节点，再执行根组件的 onDestroy。UIManager 会在
     * NODE_DESTROYED 事件刚触发、子节点仍有效时调用本方法，因此这里只执行
     * 生命周期，不再修改已经进入销毁流程的节点 active 状态。
     */
    public disposeBeforeNodeDestroy(): void {
        this.finishCloseLifecycle();
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
        try {
            // 未交给 UIManager 管理的面板仍保留兜底清理；正常动态面板会提前完成。
            this.disposeBeforeNodeDestroy();
        } catch (error) {
            Logger.error(`UI 销毁清理失败：${this.constructor.name}`, error);
        }
    }

    /**
     * 幂等执行 onHide 和 onClose，并保证任一回调失败后内部状态仍会复位。
     *
     * 两个回调独立执行是为了确保 onHide 报错时，onClose 中的事件和计时器
     * 清理仍然有机会完成；最终把第一个错误交回 UIManager 统一处理。
     */
    private finishCloseLifecycle(): void {
        if (!this._isOpened || this._closing) {
            return;
        }

        this._closing = true;
        let firstError: unknown;
        let hasError = false;

        try {
            this.onHide();
        } catch (error) {
            firstError = error;
            hasError = true;
        }

        try {
            this.onClose();
        } catch (error) {
            if (!hasError) {
                firstError = error;
                hasError = true;
            }
        }

        this._isOpened = false;
        this._openParams = null;
        this._closing = false;
        if (hasError) {
            throw firstError;
        }
    }
}
