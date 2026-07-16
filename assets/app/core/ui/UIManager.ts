import { Node } from "cc";
import { ResManager } from "../resource/ResManager";
import { Logger } from "../utils/Logger";
import { UIBase } from "./UIBase";

/**
 * UI 配置。
 *
 * 建议后续从 UIConfig.json 中读取，再统一注册到 UIManager。
 */
export interface UIConfig {
    /** UI 名称，例如 UIHomePanel。 */
    name: string;

    /** Prefab 路径，不带扩展名。 */
    path: string;

    /** 所属 Asset Bundle，不填则从 resources 加载。 */
    bundleName?: string;

    /** 关闭后是否缓存节点。默认缓存。 */
    cache?: boolean;
}

/**
 * UI 管理器。
 *
 * 负责统一打开、关闭、显示、隐藏 UI 面板。
 */
export class UIManager {
    /** UI 挂载根节点。通常是 Canvas 下的 UI 根节点。 */
    private static _root: Node | null = null;

    /** UI 名称到配置的映射。 */
    private static readonly _configs: Map<string, UIConfig> = new Map();

    /** 当前已经打开过的 UI 组件。 */
    private static readonly _openedPanels: Map<string, UIBase> = new Map();

    /** 已缓存但未显示的 UI 节点。 */
    private static readonly _cachedNodes: Map<string, Node> = new Map();

    /** 同名 UI 正在执行的打开任务，用于合并连续点击产生的并发请求。 */
    private static readonly _openingPromises: Map<string, Promise<UIBase | null>> = new Map();

    /** 每个 UI 当前有效的打开请求版本，用于让关闭后的旧异步结果失效。 */
    private static readonly _openRequestVersions: Map<string, number> = new Map();

    /** UIManager 整体生命周期版本，clear 后旧任务不得再写回管理器。 */
    private static _lifecycleVersion = 0;

    /**
     * 初始化 UI 管理器。
     *
     * root 可以稍后通过 setRoot 设置。
     */
    public static init(root?: Node): void {
        if (root) {
            this.setRoot(root);
        }

        Logger.info("UI 管理器初始化完成。");
    }

    /**
     * 设置 UI 根节点。
     *
     * 所有动态打开的 UI 都会挂到这个节点下面。
     */
    public static setRoot(root: Node): void {
        this._root = root;
    }

    /**
     * 注册一个 UI 配置。
     */
    public static register(config: UIConfig): void {
        this._configs.set(config.name, config);
    }

    /**
     * 批量注册 UI 配置。
     */
    public static registerMany(configs: UIConfig[]): void {
        for (const config of configs) {
            this.register(config);
        }
    }

    /**
     * 挂载一个已经存在的 UI 面板。
     *
     * 适合 Demo 阶段用代码创建 UI，或者接管场景里已经摆好的 UI 节点。
     */
    public static mount<T extends UIBase>(name: string, panel: T, config: Partial<Omit<UIConfig, "name">> = {}): void {
        this.invalidateOpeningRequest(name);
        this._configs.set(name, {
            name,
            path: config.path ?? "",
            bundleName: config.bundleName,
            cache: config.cache ?? true,
        });

        this._cachedNodes.set(name, panel.node);

        if (this._root && panel.node.parent !== this._root) {
            this._root.addChild(panel.node);
        }
    }

    /**
     * 打开 UI。
     *
     * @param name UI 名称
     * @param params 传给 UIBase.open 的参数
     */
    public static async open<T extends UIBase = UIBase>(name: string, params?: unknown): Promise<T | null> {
        const config = this._configs.get(name);

        if (!config) {
            Logger.warn(`UI 配置不存在：${name}`);
            return null;
        }

        const openedPanel = this._openedPanels.get(name);
        if (openedPanel?.node.isValid) {
            // open 只负责打开生命周期；已打开面板的数据变化由面板内部监听并刷新。
            if (!openedPanel.node.active) {
                openedPanel.show();
            }
            return openedPanel as T;
        }

        // 已销毁节点不能继续占用打开状态，否则后续请求会一直拿到无效组件。
        if (openedPanel) {
            this._openedPanels.delete(name);
        }

        const openingPromise = this._openingPromises.get(name);
        if (openingPromise) {
            // 加载中的重复请求直接复用首次任务，避免参数变化导致初始化逻辑重复执行。
            return openingPromise as Promise<T | null>;
        }

        const requestVersion = (this._openRequestVersions.get(name) ?? 0) + 1;
        const lifecycleVersion = this._lifecycleVersion;
        this._openRequestVersions.set(name, requestVersion);

        const newOpeningPromise = this.openPanel<T>(
            config,
            params,
            requestVersion,
            lifecycleVersion,
        );

        this._openingPromises.set(name, newOpeningPromise);

        // Creator 当前编译目标不保证支持 Promise.finally，因此成功和失败都显式执行清理。
        void newOpeningPromise.then(
            () => this.finishOpeningRequest(name, newOpeningPromise),
            () => this.finishOpeningRequest(name, newOpeningPromise),
        );
        return newOpeningPromise;
    }

    /**
     * 完成单个 UI 的异步加载和打开流程。
     *
     * 请求版本会在 close 或 clear 时变化，旧请求即使加载完成也不能重新显示面板。
     */
    private static async openPanel<T extends UIBase>(
        config: UIConfig,
        params: unknown,
        requestVersion: number,
        lifecycleVersion: number,
    ): Promise<T | null> {
        const panel = await this.createOrReusePanel<T>(config).catch((error) => {
            Logger.error(`UI 打开失败：${config.name}`, error);
            return null;
        });

        if (!panel || !panel.node.isValid) {
            return null;
        }

        if (!this.isOpeningRequestValid(config.name, requestVersion, lifecycleVersion)) {
            this.disposeAbandonedPanel(config.name, panel);
            return null;
        }

        this._cachedNodes.delete(config.name);
        this._openedPanels.set(config.name, panel);
        try {
            panel.open(params);
            return panel;
        } catch (error) {
            // 生命周期执行失败的面板不能继续缓存或占用打开状态，否则后续 open 会复用残缺实例。
            this._openedPanels.delete(config.name);
            this._cachedNodes.delete(config.name);
            Logger.error(`UI 生命周期打开失败：${config.name}`, error);
            if (panel.node.isValid) {
                panel.node.destroy();
            }
            return null;
        }
    }

    /**
     * 关闭 UI。
     *
     * @param name UI 名称
     * @param destroy 是否销毁节点，默认按配置决定是否缓存
     */
    public static close(name: string, destroy = false): void {
        this.invalidateOpeningRequest(name);

        const panel = this._openedPanels.get(name);

        if (!panel) {
            // 缓存面板虽然没有打开，但 destroy=true 时仍应按调用方要求彻底销毁。
            if (destroy) {
                const cachedNode = this._cachedNodes.get(name);
                this._cachedNodes.delete(name);
                if (cachedNode?.isValid) {
                    cachedNode.destroy();
                }
            }
            return;
        }

        const config = this._configs.get(name);
        const shouldCache = config?.cache ?? true;

        let closeFailed = false;
        try {
            panel.close();
        } catch (error) {
            closeFailed = true;
            Logger.error(`UI 生命周期关闭失败：${name}`, error);
        }
        this._openedPanels.delete(name);

        // 关闭失败说明面板内部状态不再可信，必须销毁，不能放回缓存复用。
        if (closeFailed || destroy || !shouldCache) {
            this._cachedNodes.delete(name);
            panel.node.destroy();
            return;
        }

        this._cachedNodes.set(name, panel.node);
    }

    /**
     * 关闭全部已打开 UI。
     */
    public static closeAll(destroy = false): void {
        const names = Array.from(this._openedPanels.keys());

        for (const name of names) {
            this.close(name, destroy);
        }
    }

    /**
     * 获取当前已打开的 UI 面板。
     */
    public static get<T extends UIBase = UIBase>(name: string): T | null {
        return (this._openedPanels.get(name) as T) ?? null;
    }

    /**
     * 判断 UI 是否已经打开。
     */
    public static isOpened(name: string): boolean {
        return this._openedPanels.has(name);
    }

    /**
     * 清空 UI 管理器状态。
     *
     * 一般用于切换账号、重启游戏或测试。
     */
    public static clear(): void {
        // 先提升整体版本，让尚未完成的资源加载结果全部失效。
        this._lifecycleVersion += 1;
        this._openingPromises.clear();
        this.closeAll(true);

        for (const node of this._cachedNodes.values()) {
            if (node.isValid) {
                node.destroy();
            }
        }

        this._cachedNodes.clear();
        this._openRequestVersions.clear();
        this._configs.clear();
        this._root = null;
    }

    /** 使指定 UI 当前尚未结束的打开任务失效。 */
    private static invalidateOpeningRequest(name: string): void {
        const nextVersion = (this._openRequestVersions.get(name) ?? 0) + 1;
        this._openRequestVersions.set(name, nextVersion);
        this._openingPromises.delete(name);
    }

    /** 打开任务结束后清理对应记录，但不得误删后来创建的新任务。 */
    private static finishOpeningRequest(name: string, promise: Promise<UIBase | null>): void {
        if (this._openingPromises.get(name) === promise) {
            this._openingPromises.delete(name);
        }
    }

    /** 判断异步打开结果是否仍属于当前 UIManager 状态。 */
    private static isOpeningRequestValid(
        name: string,
        requestVersion: number,
        lifecycleVersion: number,
    ): boolean {
        return (
            lifecycleVersion === this._lifecycleVersion &&
            requestVersion === this._openRequestVersions.get(name)
        );
    }

    /**
     * 处理已经失效的异步加载结果。
     *
     * 原本来自缓存的节点继续保持缓存；新实例没有管理器持有者，必须直接销毁。
     */
    private static disposeAbandonedPanel(name: string, panel: UIBase): void {
        if (this._cachedNodes.get(name) === panel.node) {
            panel.close();
            return;
        }

        panel.node.destroy();
    }

    /**
     * 创建或复用 UI 面板。
     */
    private static async createOrReusePanel<T extends UIBase>(config: UIConfig): Promise<T | null> {
        let node = this._cachedNodes.get(config.name) ?? null;

        if (!node || !node.isValid) {
            if (!config.path) {
                Logger.warn(`UI 配置缺少 Prefab 路径：${config.name}`);
                return null;
            }

            node = await ResManager.instantiatePrefab(config.path, {
                bundleName: config.bundleName,
            });

            // 新实例挂到场景前先保持隐藏，避免 Prefab 默认文本在业务数据填充前显示一帧。
            node.active = false;
        }

        if (this._root && node.parent !== this._root) {
            this._root.addChild(node);
        }

        const panel = node.getComponent(UIBase) as T | null;

        if (!panel) {
            Logger.warn(`UI 节点缺少 UIBase 组件：${config.name}`);
            node.destroy();
            return null;
        }

        return panel;
    }
}
