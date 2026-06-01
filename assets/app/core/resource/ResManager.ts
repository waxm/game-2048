import { Asset, AssetManager, JsonAsset, Node, Prefab, assetManager, instantiate, resources } from "cc";
import { Logger } from "../utils/Logger";

/**
 * 资源加载位置。
 *
 * 不传 bundleName 时默认从 resources 加载。
 */
export interface LoadOptions {
  /** Asset Bundle 名称，例如 common、lobby、gameplay。 */
  bundleName?: string;
}

/**
 * 资源管理器。
 *
 * 所有动态资源加载都建议从这里走，避免业务代码散落 resources.load 或 bundle.load。
 */
export class ResManager {
  /** 已经加载过的 Asset Bundle 缓存。 */
  private static readonly _bundles: Map<string, AssetManager.Bundle> = new Map();

  /**
   * 加载 Asset Bundle。
   *
   * 加载过的分包会被缓存，后续重复调用会直接返回缓存结果。
   */
  public static loadBundle(bundleName: string): Promise<AssetManager.Bundle> {
    const cachedBundle = this._bundles.get(bundleName);

    if (cachedBundle) {
      return Promise.resolve(cachedBundle);
    }

    return new Promise((resolve, reject) => {
      assetManager.loadBundle(bundleName, (error, bundle) => {
        if (error || !bundle) {
          Logger.error(`分包加载失败：${bundleName}`, error);
          reject(error);
          return;
        }

        this._bundles.set(bundleName, bundle);
        Logger.info(`分包加载完成：${bundleName}`);
        resolve(bundle);
      });
    });
  }

  /**
   * 获取已经加载过的 Asset Bundle。
   */
  public static getBundle(bundleName: string): AssetManager.Bundle | null {
    return this._bundles.get(bundleName) ?? null;
  }

  /**
   * 加载单个资源。
   *
   * @param path 资源路径，不带扩展名
   * @param type 资源类型，例如 Prefab、JsonAsset、AudioClip
   * @param options 加载选项
   */
  public static async load<T extends Asset>(
    path: string,
    type: new (...args: any[]) => T,
    options: LoadOptions = {},
  ): Promise<T> {
    const loader = await this.getLoader(options.bundleName);

    return new Promise((resolve, reject) => {
      loader.load(path, type, (error: Error | null, asset: T) => {
        if (error || !asset) {
          Logger.error(`资源加载失败：${path}`, error);
          reject(error);
          return;
        }

        resolve(asset);
      });
    });
  }

  /**
   * 加载目录下的同类型资源。
   *
   * 适合加载一组配置、关卡、图集等资源。
   */
  public static async loadDir<T extends Asset>(
    path: string,
    type: new (...args: any[]) => T,
    options: LoadOptions = {},
  ): Promise<T[]> {
    const loader = await this.getLoader(options.bundleName);

    return new Promise((resolve, reject) => {
      loader.loadDir(path, type, (error: Error | null, assets: T[]) => {
        if (error || !assets) {
          Logger.error(`资源目录加载失败：${path}`, error);
          reject(error);
          return;
        }

        resolve(assets);
      });
    });
  }

  /**
   * 加载 JSON 配置。
   *
   * 返回 JsonAsset.json，业务层不需要再关心 JsonAsset 包装。
   */
  public static async loadJson<T = unknown>(path: string, options: LoadOptions = {}): Promise<T> {
    const asset = await this.load(path, JsonAsset, options);
    return asset.json as T;
  }

  /**
   * 加载并实例化 Prefab。
   *
   * UIManager 或业务模块需要动态创建节点时，可以直接调用这个方法。
   */
  public static async instantiatePrefab(path: string, options: LoadOptions = {}): Promise<Node> {
    const prefab = await this.load(path, Prefab, options);
    return instantiate(prefab);
  }

  /**
   * 释放单个资源。
   *
   * 注意：如果资源仍被场景节点引用，释放后可能导致显示异常。
   */
  public static async release(path: string, options: LoadOptions = {}): Promise<void> {
    const loader = await this.getLoader(options.bundleName);
    loader.release(path);
  }

  /**
   * 释放指定分包。
   *
   * 会同时移除本地缓存记录。
   */
  public static removeBundle(bundleName: string): void {
    const bundle = this._bundles.get(bundleName);

    if (!bundle) {
      return;
    }

    assetManager.removeBundle(bundle);
    this._bundles.delete(bundleName);
    Logger.info(`分包已移除：${bundleName}`);
  }

  /**
   * 根据加载选项获取资源加载器。
   */
  private static async getLoader(bundleName?: string): Promise<typeof resources | AssetManager.Bundle> {
    if (!bundleName) {
      return resources;
    }

    return this.loadBundle(bundleName);
  }
}
