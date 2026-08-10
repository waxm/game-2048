import {
    _decorator,
    Color,
    Component,
    Graphics,
    isValid,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    view,
} from "cc";
import type { ResourceHandle } from "../resource/ResManager";
import { ResManager } from "../resource/ResManager";
import { Logger } from "../utils/Logger";

const { ccclass } = _decorator;

/** 九宫图片在运行时使用的边界像素。 */
export interface SpriteSkinInsets {
    /** 左侧不可拉伸区域。 */
    left: number;

    /** 右侧不可拉伸区域。 */
    right: number;

    /** 顶部不可拉伸区域。 */
    top: number;

    /** 底部不可拉伸区域。 */
    bottom: number;
}

/** 图片皮肤应用参数。 */
export interface SpriteSkinOptions {
    /** 设为 true 时按九宫方式渲染。 */
    sliced?: boolean;

    /** 九宫不可拉伸边界。 */
    insets?: SpriteSkinInsets;

    /** 图片整体颜色，用于头像等可复用彩色底板。 */
    color?: Color;

    /** 可选锚点；进度条填充使用左中锚点。 */
    anchor?: readonly [number, number];

    /** 按可视区宽度等比展开，供 800×1920 长屏背景和整屏合图使用。 */
    fitVisibleWidth?: boolean;
}

/**
 * 把 Inspector 已绑定节点上的程序化 Graphics 替换为资源图片。
 *
 * 宿主节点来自现有 Scene/Prefab，类本身不查找层级；Graphics 节点会创建一个
 * 受控图片子节点，避免 Cocos 禁止同节点挂载两个可渲染组件。动态节点、Sprite
 * 与资源句柄均由所属视图在销毁时统一释放。
 */
export class SpriteSkinBinding {
    /** 每个节点当前持有的图片资源。 */
    private readonly _handles = new Map<Node, ResourceHandle<SpriteFrame>>();

    /** 每个节点当前使用的 Sprite。 */
    private readonly _sprites = new Map<Node, Sprite>();

    /** Graphics 宿主对应的受控图片子节点。 */
    private readonly _spriteNodes = new Map<Node, Node>();

    /** 节点到最新异步请求编号的映射。 */
    private readonly _requestIds = new Map<Node, number>();

    /** 全局递增请求编号，保证旧加载结果不会覆盖新皮肤。 */
    private _nextRequestId = 1;

    /** 把 Graphics 所在节点切换为指定图片资源。 */
    public apply(
        graphics: Graphics,
        resourcePath: string,
        options: SpriteSkinOptions = {},
    ): Promise<Sprite | null> {
        return this.applyNode(graphics.node, graphics, resourcePath, options);
    }

    /** 把显式绑定的现有节点切换为指定图片资源。 */
    public async applyNode(
        node: Node,
        graphics: Graphics | null,
        resourcePath: string,
        options: SpriteSkinOptions = {},
    ): Promise<Sprite | null> {
        const requestId = this._nextRequestId++;
        this._requestIds.set(node, requestId);
        if (graphics) {
            graphics.clear();
            graphics.enabled = false;
        }

        const handle = await ResManager.acquire(resourcePath, SpriteFrame);
        if (
            this._requestIds.get(node) !== requestId ||
            !isValid(node, true)
        ) {
            handle.release();
            return null;
        }

        const transform = node.getComponent(UITransform);
        if (!transform) {
            handle.release();
            throw new Error(`图片皮肤节点缺少 UITransform：${node.name}`);
        }
        if (options.anchor) {
            transform.setAnchorPoint(options.anchor[0], options.anchor[1]);
        }

        const spriteNode = graphics
            ? this.getOrCreateSpriteNode(node, transform)
            : node;
        const spriteTransform = spriteNode.getComponent(UITransform);
        if (!spriteTransform) {
            handle.release();
            throw new Error(`图片皮肤显示节点缺少 UITransform：${spriteNode.name}`);
        }
        if (options.anchor) {
            spriteTransform.setAnchorPoint(options.anchor[0], options.anchor[1]);
        }
        const sprite =
            spriteNode.getComponent(Sprite) ?? spriteNode.addComponent(Sprite);
        const frame = handle.asset;
        frame.packable = false;
        if (options.fitVisibleWidth) {
            const visibleSize = view.getVisibleSize();
            const sourceSize = frame.originalSize;
            if (sourceSize.width <= 0 || sourceSize.height <= 0) {
                handle.release();
                throw new Error(`长屏图片尺寸无效：${resourcePath}`);
            }
            spriteTransform.setContentSize(
                visibleSize.width,
                (visibleSize.width * sourceSize.height) / sourceSize.width,
            );
        } else {
            spriteTransform.setContentSize(transform.contentSize);
        }
        if (options.sliced) {
            const insets = options.insets;
            if (!insets) {
                handle.release();
                throw new Error(`九宫图片未提供边界：${resourcePath}`);
            }
            frame.insetLeft = insets.left;
            frame.insetRight = insets.right;
            frame.insetTop = insets.top;
            frame.insetBottom = insets.bottom;
            sprite.type = Sprite.Type.SLICED;
        } else {
            sprite.type = Sprite.Type.SIMPLE;
        }
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.color = options.color ?? Color.WHITE;
        sprite.spriteFrame = frame;
        sprite.enabled = true;

        const previousHandle = this._handles.get(node);
        this._handles.set(node, handle);
        this._sprites.set(node, sprite);
        previousHandle?.release();
        return sprite;
    }

    /** 为已有 Graphics 的宿主创建或复用独立图片显示节点。 */
    private getOrCreateSpriteNode(
        hostNode: Node,
        hostTransform: UITransform,
    ): Node {
        const existing = this._spriteNodes.get(hostNode);
        if (existing && isValid(existing, true)) {
            return existing;
        }
        const spriteNode = new Node(`${hostNode.name}__ImageSkin`);
        spriteNode.layer = hostNode.layer;
        spriteNode.setPosition(0, 0, 0);
        hostNode.addChild(spriteNode);
        spriteNode.setSiblingIndex(0);
        const spriteTransform = spriteNode.addComponent(UITransform);
        spriteTransform.setContentSize(hostTransform.contentSize);
        spriteTransform.setAnchorPoint(
            hostTransform.anchorPoint.x,
            hostTransform.anchorPoint.y,
        );
        this._spriteNodes.set(hostNode, spriteNode);
        return spriteNode;
    }

    /** 隐藏已经绑定的 Graphics 与图片表现。 */
    public hide(graphics: Graphics): void {
        graphics.clear();
        graphics.enabled = false;
        const sprite = this._sprites.get(graphics.node);
        if (sprite) {
            sprite.enabled = false;
        }
    }

    /** 返回节点当前使用的 Sprite。 */
    public getSprite(node: Node): Sprite | null {
        return this._sprites.get(node) ?? null;
    }

    /** 使所有旧请求失效并归还图片资源所有权。 */
    public release(): void {
        this._requestIds.clear();
        this._nextRequestId += 1;
        for (const [node, sprite] of this._sprites) {
            if (isValid(node, true) && isValid(sprite, true)) {
                sprite.spriteFrame = null;
            }
        }
        for (const handle of this._handles.values()) {
            handle.release();
        }
        this._handles.clear();
        this._sprites.clear();
        for (const spriteNode of this._spriteNodes.values()) {
            if (isValid(spriteNode, true)) {
                spriteNode.destroy();
            }
        }
        this._spriteNodes.clear();
    }
}

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
