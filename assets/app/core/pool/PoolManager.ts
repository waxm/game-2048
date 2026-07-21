import {
    Component,
    Node,
    NodePool,
    Prefab,
    Quat,
    Vec3,
    instantiate,
    isValid,
} from "cc";
import { ResManager } from "../resource/ResManager";
import type { ResourceHandle } from "../resource/ResManager";
import { Logger } from "../utils/Logger";

/** 对象池节点可选的生命周期协议。 */
export interface PoolLifecycle {
    /** 节点取出时接收本次业务参数并恢复业务状态。 */
    reuse(...args: unknown[]): void;

    /** 节点回收前注销事件、计时器并清空旧业务数据。 */
    unuse(): void;
}

/** 可作为对象池生命周期处理器的 Cocos 组件构造函数。 */
export type PoolLifecycleConstructor = new (
    ...args: any[]
) => Component & PoolLifecycle;

/** 创建对象池时使用的完整配置。 */
export interface PoolCreateOptions {
    /** Prefab 动态加载路径，不带扩展名。 */
    prefabPath: string;

    /** Prefab 所属 Asset Bundle，不填时从 resources 加载。 */
    bundleName?: string;

    /** 创建成功后立即放入池中的节点数量，默认为 0。 */
    initialSize?: number;

    /** 池内最多缓存的空闲节点数量，默认为 64。 */
    maxSize?: number;

    /** 实现 reuse/unuse 的组件类型或已注册类名。 */
    lifecycleComponent?: PoolLifecycleConstructor | string;
}

/** 对象池当前容量和节点使用情况。 */
export interface PoolStats {
    /** 当前空闲节点数量。 */
    available: number;

    /** 当前已经取出且尚未回收的节点数量。 */
    inUse: number;

    /** 当前仍由对象池负责的节点总数。 */
    total: number;

    /** 允许缓存的最大空闲节点数量。 */
    maxSize: number;
}

/** 节点实例化完成时记录的根节点基础状态。 */
interface PoolNodeState {
    /** Prefab 根节点原始本地坐标。 */
    position: Vec3;

    /** Prefab 根节点原始本地旋转。 */
    rotation: Quat;

    /** Prefab 根节点原始本地缩放。 */
    scale: Vec3;

    /** Prefab 根节点原始激活状态。 */
    active: boolean;

    /** Prefab 根节点原始渲染层。 */
    layer: number;
}

/** 单个具名对象池拥有的全部运行状态。 */
interface PoolRecord {
    /** 对象池名称。 */
    name: string;

    /** Cocos 底层节点池。 */
    pool: NodePool;

    /** 源 Prefab 的明确资源所有权。 */
    prefabHandle: ResourceHandle<Prefab>;

    /** 池内最多保留的空闲节点数。 */
    maxSize: number;

    /** 可选业务生命周期组件。 */
    lifecycleComponent?: PoolLifecycleConstructor | string;

    /** 当前仍归本池负责的全部节点。 */
    nodes: Set<Node>;

    /** 已经放回底层 NodePool 的空闲节点。 */
    availableNodes: Set<Node>;

    /** 每个节点对应的 Prefab 初始状态。 */
    initialStates: Map<Node, PoolNodeState>;

    /** 是否已经进入清理流程。 */
    disposing: boolean;

    /** Prefab 句柄是否已经归还。 */
    prefabReleased: boolean;
}

/**
 * 对象池管理器。
 *
 * 每个池在创建时持有一份 Prefab 资源句柄，并负责从实例化到销毁的完整节点生命周期。
 * 适用于子弹、金币、飘字、敌人等高频创建对象。
 */
export class PoolManager {
    /** 默认允许缓存的空闲节点数量。 */
    private static readonly DEFAULT_MAX_SIZE = 64;

    /** 对象池名称到完整运行记录的映射。 */
    private static readonly _pools: Map<string, PoolRecord> = new Map();

    /** 节点到所属对象池名称的反向映射，用于拦截跨池回收。 */
    private static readonly _nodeOwners: Map<Node, string> = new Map();

    /** 正在创建的同名对象池任务，用于合并并发请求。 */
    private static readonly _creationPromises: Map<string, Promise<boolean>> = new Map();

    /** 创建请求令牌；清理操作通过删除令牌使旧异步结果失效。 */
    private static readonly _creationTokens: Map<string, symbol> = new Map();

    /**
     * 加载 Prefab 并创建具名对象池。
     *
     * 同名并发创建会复用一个 Promise；已经存在的池不会被静默替换。清理发生在资源加载
     * 期间时，旧请求取得的 Prefab 句柄会立即释放，不会重新写回池注册表。
     */
    public static create(
        poolName: string,
        options: PoolCreateOptions,
    ): Promise<boolean> {
        this.validateCreateOptions(poolName, options);
        if (this._pools.has(poolName)) {
            Logger.warn(`对象池已经存在，跳过重复创建：${poolName}`);
            return Promise.resolve(false);
        }

        const pendingPromise = this._creationPromises.get(poolName);
        if (pendingPromise) {
            return pendingPromise;
        }

        const token = Symbol(poolName);
        this._creationTokens.set(poolName, token);
        const promise = this.createPool(poolName, options, token);
        this._creationPromises.set(poolName, promise);
        const clearPromise = (): void => {
            if (this._creationPromises.get(poolName) === promise) {
                this._creationPromises.delete(poolName);
            }
            if (this._creationTokens.get(poolName) === token) {
                this._creationTokens.delete(poolName);
            }
        };
        void promise.then(clearPromise, clearPromise);
        return promise;
    }

    /**
     * 从对象池取出节点；池为空时使用已持有的 Prefab 同步实例化。
     *
     * reuseArgs 会原样传给配置的生命周期组件。生命周期执行失败时节点会被销毁并抛出
     * 原始错误，避免带有半初始化状态的节点继续进入业务。
     */
    public static get(poolName: string, ...reuseArgs: unknown[]): Node | null {
        const record = this._pools.get(poolName);
        if (!record || record.disposing) {
            Logger.warn(`对象池不存在或正在清理：${poolName}`);
            return null;
        }

        let node = this.takeAvailableNode(record);
        if (!node) {
            node = this.createNode(record);
        }

        try {
            this.restoreNodeState(record, node);
            this.invokeReuse(record, node, reuseArgs);
            return node;
        } catch (error) {
            this.destroyTrackedNode(record, node);
            Logger.error(`对象池节点 reuse 执行失败：${poolName}`, error);
            throw error;
        }
    }

    /**
     * 把节点归还所属对象池。
     *
     * 返回 true 表示节点已进入缓存；达到容量上限时节点会执行 unuse 后销毁并返回 false。
     * 无效节点、重复回收和跨池回收都会被拒绝，不会污染底层 NodePool。
     */
    public static put(poolName: string, node: Node): boolean {
        const record = this._pools.get(poolName);
        if (!record || record.disposing) {
            Logger.warn(`对象池不存在或正在清理，拒绝回收：${poolName}`);
            return false;
        }
        if (!isValid(node, true)) {
            Logger.warn(`对象池收到无效节点，拒绝回收：${poolName}`);
            return false;
        }

        const owner = this._nodeOwners.get(node);
        if (owner !== poolName || !record.nodes.has(node)) {
            Logger.warn(
                owner
                    ? `节点属于对象池 ${owner}，不能回收到 ${poolName}`
                    : `节点不受对象池管理，不能回收到 ${poolName}`,
            );
            return false;
        }
        if (record.availableNodes.has(node)) {
            Logger.warn(`节点已经位于对象池中，拒绝重复回收：${poolName}`);
            return false;
        }

        try {
            this.invokeUnuse(record, node);
            if (!isValid(node, true)) {
                return false;
            }
            this.restoreNodeState(record, node);
        } catch (error) {
            this.destroyTrackedNode(record, node);
            Logger.error(`对象池节点 unuse 或状态复位失败：${poolName}`, error);
            return false;
        }

        if (record.availableNodes.size >= record.maxSize) {
            this.destroyTrackedNode(record, node);
            return false;
        }

        record.pool.put(node);
        record.availableNodes.add(node);
        return true;
    }

    /** 判断指定对象池是否已经创建完成。 */
    public static has(poolName: string): boolean {
        return this._pools.has(poolName);
    }

    /** 获取对象池当前可复用节点数量。 */
    public static size(poolName: string): number {
        return this._pools.get(poolName)?.availableNodes.size ?? 0;
    }

    /** 获取对象池完整容量统计；池不存在时返回 null。 */
    public static getStats(poolName: string): PoolStats | null {
        const record = this._pools.get(poolName);
        if (!record) {
            return null;
        }
        const total = record.nodes.size;
        const available = record.availableNodes.size;
        return {
            available,
            inUse: Math.max(0, total - available),
            total,
            maxSize: record.maxSize,
        };
    }

    /**
     * 清理指定对象池。
     *
     * 默认存在借出节点时拒绝清理，防止仍在运行的节点突然销毁。force 为 true 时会先执行
     * unuse，再销毁借出节点；Prefab 句柄会等所有节点真正销毁后才释放。
     */
    public static clear(poolName: string, force = false): boolean {
        const record = this._pools.get(poolName);
        if (!record) {
            const cancelled = this.cancelPendingCreation(poolName);
            return cancelled;
        }

        const inUseCount = record.nodes.size - record.availableNodes.size;
        if (inUseCount > 0 && !force) {
            Logger.warn(
                `对象池仍有 ${inUseCount} 个节点正在使用，拒绝清理：${poolName}`,
            );
            return false;
        }

        this.disposeRecord(record);
        return true;
    }

    /** 清空全部对象池，并强制销毁仍在使用的节点。 */
    public static clearAll(): void {
        this._creationTokens.clear();
        this._creationPromises.clear();
        for (const record of Array.from(this._pools.values())) {
            this.disposeRecord(record);
        }
    }

    /** 完成单个对象池的异步创建和初始预热。 */
    private static async createPool(
        poolName: string,
        options: PoolCreateOptions,
        token: symbol,
    ): Promise<boolean> {
        const prefabHandle = await ResManager.acquire(options.prefabPath, Prefab, {
            bundleName: options.bundleName,
        });
        if (this._creationTokens.get(poolName) !== token) {
            prefabHandle.release();
            return false;
        }
        this._creationTokens.delete(poolName);

        const record: PoolRecord = {
            name: poolName,
            pool: new NodePool(),
            prefabHandle,
            maxSize: options.maxSize ?? this.DEFAULT_MAX_SIZE,
            lifecycleComponent: options.lifecycleComponent,
            nodes: new Set(),
            availableNodes: new Set(),
            initialStates: new Map(),
            disposing: false,
            prefabReleased: false,
        };
        this._pools.set(poolName, record);

        try {
            const initialSize = options.initialSize ?? 0;
            for (let index = 0; index < initialSize; index++) {
                const node = this.createNode(record);
                if (!this.put(poolName, node)) {
                    throw new Error(`对象池预热节点回收失败：${poolName}`);
                }
            }
        } catch (error) {
            this.disposeRecord(record);
            throw error;
        }

        Logger.info(
            `对象池创建完成：${poolName}，预热 ${record.availableNodes.size}，最大缓存 ${record.maxSize}`,
        );
        return true;
    }

    /** 校验创建参数，避免异步加载后才暴露明显配置错误。 */
    private static validateCreateOptions(
        poolName: string,
        options: PoolCreateOptions,
    ): void {
        if (!poolName.trim()) {
            throw new Error("对象池名称不能为空。");
        }
        if (!options?.prefabPath?.trim()) {
            throw new Error(`对象池 Prefab 路径不能为空：${poolName}`);
        }

        const maxSize = options.maxSize ?? this.DEFAULT_MAX_SIZE;
        const initialSize = options.initialSize ?? 0;
        if (!Number.isInteger(maxSize) || maxSize <= 0) {
            throw new Error(`对象池 maxSize 必须是正整数：${poolName}`);
        }
        if (
            !Number.isInteger(initialSize) ||
            initialSize < 0 ||
            initialSize > maxSize
        ) {
            throw new Error(
                `对象池 initialSize 必须是 0 到 maxSize 之间的整数：${poolName}`,
            );
        }
    }

    /** 实例化节点、保存初始状态并建立节点所有权。 */
    private static createNode(record: PoolRecord): Node {
        const node = instantiate(record.prefabHandle.asset);
        try {
            const initialState = this.captureNodeState(node);
            // 先验证生命周期组件，再登记所有权，失败节点不能进入借出节点统计。
            this.getLifecycle(record, node);
            record.nodes.add(node);
            record.initialStates.set(node, initialState);
            this._nodeOwners.set(node, record.name);
            node.once(Node.EventType.NODE_DESTROYED, () => {
                this.removeTrackedNode(record, node);
                this.releaseDisposedPrefabWhenReady(record);
            });
            return node;
        } catch (error) {
            if (isValid(node, true)) {
                node.destroy();
            }
            throw error;
        }
    }

    /** 从底层池取出第一个仍然有效且所有权正确的节点。 */
    private static takeAvailableNode(record: PoolRecord): Node | null {
        while (record.pool.size() > 0) {
            const node = record.pool.get();
            if (!node) {
                continue;
            }
            record.availableNodes.delete(node);
            if (
                isValid(node, true) &&
                record.nodes.has(node) &&
                this._nodeOwners.get(node) === record.name
            ) {
                return node;
            }
            if (isValid(node, true)) {
                node.destroy();
            }
        }
        return null;
    }

    /** 记录 Prefab 根节点需要在每次复用前恢复的初始状态。 */
    private static captureNodeState(node: Node): PoolNodeState {
        return {
            position: node.position.clone(),
            rotation: node.rotation.clone(),
            scale: node.scale.clone(),
            active: node.active,
            layer: node.layer,
        };
    }

    /** 恢复 Prefab 根节点初始 Transform、激活状态和渲染层。 */
    private static restoreNodeState(record: PoolRecord, node: Node): void {
        const state = record.initialStates.get(node);
        if (!state) {
            throw new Error(`对象池节点缺少初始状态：${record.name}`);
        }
        node.setPosition(state.position);
        node.setRotation(state.rotation);
        node.setScale(state.scale);
        node.active = state.active;
        node.layer = state.layer;
    }

    /** 返回节点上的生命周期组件；配置存在但组件或方法缺失时立即报错。 */
    private static getLifecycle(
        record: PoolRecord,
        node: Node,
    ): PoolLifecycle | null {
        const componentType = record.lifecycleComponent;
        if (!componentType) {
            return null;
        }

        const component = node.getComponent(componentType as any) as
            | (Component & Partial<PoolLifecycle>)
            | null;
        if (
            !component ||
            typeof component.reuse !== "function" ||
            typeof component.unuse !== "function"
        ) {
            throw new Error(
                `对象池生命周期组件缺失或未实现 reuse/unuse：${record.name}`,
            );
        }
        return component as Component & PoolLifecycle;
    }

    /** 调用节点复用生命周期。 */
    private static invokeReuse(
        record: PoolRecord,
        node: Node,
        args: unknown[],
    ): void {
        this.getLifecycle(record, node)?.reuse(...args);
    }

    /** 调用节点回收生命周期。 */
    private static invokeUnuse(record: PoolRecord, node: Node): void {
        this.getLifecycle(record, node)?.unuse();
    }

    /** 销毁单个受管节点，销毁事件负责最终移除所有权记录。 */
    private static destroyTrackedNode(record: PoolRecord, node: Node): void {
        record.availableNodes.delete(node);
        if (isValid(node, true)) {
            node.destroy();
        } else {
            this.removeTrackedNode(record, node);
            this.releaseDisposedPrefabWhenReady(record);
        }
    }

    /** 从记录和反向所有权表中移除已经销毁的节点。 */
    private static removeTrackedNode(record: PoolRecord, node: Node): void {
        record.nodes.delete(node);
        record.availableNodes.delete(node);
        record.initialStates.delete(node);
        if (this._nodeOwners.get(node) === record.name) {
            this._nodeOwners.delete(node);
        }
    }

    /** 清理池内和借出节点，并等待节点实际销毁后归还 Prefab 资源。 */
    private static disposeRecord(record: PoolRecord): void {
        if (record.disposing) {
            return;
        }
        record.disposing = true;
        if (this._pools.get(record.name) === record) {
            this._pools.delete(record.name);
        }
        this.cancelPendingCreation(record.name);

        const inUseNodes = Array.from(record.nodes).filter(
            (node) => !record.availableNodes.has(node),
        );
        for (const node of inUseNodes) {
            if (isValid(node, true)) {
                try {
                    this.invokeUnuse(record, node);
                } catch (error) {
                    Logger.error(
                        `强制清理对象池时 unuse 执行失败：${record.name}`,
                        error,
                    );
                }
                node.destroy();
            } else {
                this.removeTrackedNode(record, node);
            }
        }
        record.pool.clear();
        this.releaseDisposedPrefabWhenReady(record);
    }

    /** 最后一个受管节点销毁后，幂等归还对象池持有的 Prefab 句柄。 */
    private static releaseDisposedPrefabWhenReady(record: PoolRecord): void {
        if (
            !record.disposing ||
            record.prefabReleased ||
            record.nodes.size > 0
        ) {
            return;
        }
        record.prefabReleased = true;
        record.prefabHandle.release();
    }

    /** 使尚未完成的同名创建请求失效。 */
    private static cancelPendingCreation(poolName: string): boolean {
        const tokenDeleted = this._creationTokens.delete(poolName);
        const promiseDeleted = this._creationPromises.delete(poolName);
        return tokenDeleted || promiseDeleted;
    }
}
