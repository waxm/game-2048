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

        const panel = await this.createOrReusePanel<T>(config).catch((error) => {
            Logger.error(`UI 打开失败：${name}`, error);
            return null;
        });

        if (!panel) {
            return null;
        }

        this._openedPanels.set(name, panel);
        panel.open(params);
        return panel;
    }

    /**
     * 关闭 UI。
     *
     * @param name UI 名称
     * @param destroy 是否销毁节点，默认按配置决定是否缓存
     */
    public static close(name: string, destroy = false): void {
        const panel = this._openedPanels.get(name);

        if (!panel) {
            return;
        }

        const config = this._configs.get(name);
        const shouldCache = config?.cache ?? true;

        panel.close();
        this._openedPanels.delete(name);

        if (destroy || !shouldCache) {
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
        this.closeAll(true);
        this._cachedNodes.clear();
        this._configs.clear();
        this._root = null;
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
