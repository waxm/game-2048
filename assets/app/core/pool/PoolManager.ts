import { Node, NodePool, Prefab, instantiate } from "cc";

/**
 * 对象池管理器。
 *
 * 用于复用频繁创建和销毁的节点，例如子弹、金币、飘字、敌人等。
 */
export class PoolManager {
    /** 对象池名称到 NodePool 的映射。 */
    private static readonly _pools: Map<string, NodePool> = new Map();

    /**
     * 预创建一批节点放入对象池。
     *
     * @param poolName 对象池名称
     * @param prefab 要实例化的预制体
     * @param count 预创建数量
     */
    public static prewarm(poolName: string, prefab: Prefab, count: number): void {
        const pool = this.getOrCreatePool(poolName);

        for (let index = 0; index < count; index++) {
            pool.put(instantiate(prefab));
        }
    }

    /**
     * 从对象池取出一个节点。
     *
     * 如果池里没有节点，并且传入了 prefab，就会立即实例化一个新节点。
     */
    public static get(poolName: string, prefab?: Prefab): Node | null {
        const pool = this.getOrCreatePool(poolName);

        if (pool.size() > 0) {
            return pool.get();
        }

        if (prefab) {
            return instantiate(prefab);
        }

        return null;
    }

    /**
     * 回收节点到对象池。
     */
    public static put(poolName: string, node: Node): void {
        if (!node || !node.isValid) {
            return;
        }

        const pool = this.getOrCreatePool(poolName);
        pool.put(node);
    }

    /**
     * 获取对象池中当前可复用节点数量。
     */
    public static size(poolName: string): number {
        return this._pools.get(poolName)?.size() ?? 0;
    }

    /**
     * 清空指定对象池。
     */
    public static clear(poolName: string): void {
        const pool = this._pools.get(poolName);

        if (!pool) {
            return;
        }

        pool.clear();
        this._pools.delete(poolName);
    }

    /**
     * 清空全部对象池。
     */
    public static clearAll(): void {
        for (const pool of this._pools.values()) {
            pool.clear();
        }

        this._pools.clear();
    }

    /**
     * 获取对象池；不存在时自动创建。
     */
    private static getOrCreatePool(poolName: string): NodePool {
        let pool = this._pools.get(poolName);

        if (!pool) {
            pool = new NodePool();
            this._pools.set(poolName, pool);
        }

        return pool;
    }
}
