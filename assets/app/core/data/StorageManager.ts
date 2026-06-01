import { sys } from "cc";
import { Logger } from "../utils/Logger";

/**
 * 本地存档管理器。
 *
 * 统一封装 localStorage，避免业务代码直接读写字符串。
 */
export class StorageManager {
  /** 存档 key 前缀，用来避免和其他项目冲突。 */
  private static _prefix = "WorkAI";

  /**
   * 初始化存档管理器。
   *
   * 可以传入项目专属前缀，例如游戏名或包名。
   */
  public static init(prefix = "WorkAI"): void {
    this._prefix = prefix;
    Logger.info(`存档管理器初始化完成：${this._prefix}`);
  }

  /**
   * 保存任意可 JSON 序列化的数据。
   */
  public static set<T>(key: string, value: T): void {
    const storageKey = this.getStorageKey(key);

    try {
      sys.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      Logger.error(`存档保存失败：${key}`, error);
    }
  }

  /**
   * 读取数据。
   *
   * 读取失败或不存在时返回默认值。
   */
  public static get<T>(key: string, defaultValue: T): T {
    const storageKey = this.getStorageKey(key);
    const text = sys.localStorage.getItem(storageKey);

    if (text === null || text === "") {
      return defaultValue;
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      Logger.error(`存档解析失败：${key}`, error);
      return defaultValue;
    }
  }

  /**
   * 保存字符串。
   *
   * 适合保存 token、用户 id 等不需要 JSON 包装的简单文本。
   */
  public static setString(key: string, value: string): void {
    sys.localStorage.setItem(this.getStorageKey(key), value);
  }

  /**
   * 读取字符串。
   */
  public static getString(key: string, defaultValue = ""): string {
    return sys.localStorage.getItem(this.getStorageKey(key)) ?? defaultValue;
  }

  /**
   * 删除指定存档。
   */
  public static remove(key: string): void {
    sys.localStorage.removeItem(this.getStorageKey(key));
  }

  /**
   * 判断指定存档是否存在。
   */
  public static has(key: string): boolean {
    return sys.localStorage.getItem(this.getStorageKey(key)) !== null;
  }

  /**
   * 清空当前框架前缀下的存档。
   *
   * 注意：只清理带有当前前缀的 key。
   */
  public static clear(): void {
    const prefix = `${this._prefix}:`;
    const keys: string[] = [];

    for (let index = 0; index < sys.localStorage.length; index++) {
      const key = sys.localStorage.key(index);

      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }

    for (const key of keys) {
      sys.localStorage.removeItem(key);
    }
  }

  /**
   * 生成真实存档 key。
   */
  private static getStorageKey(key: string): string {
    return `${this._prefix}:${key}`;
  }
}
