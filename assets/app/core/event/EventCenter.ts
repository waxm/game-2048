/**
 * 事件回调函数类型。
 *
 * T 表示事件携带的数据类型，不传时默认 unknown。
 */
export type EventCallback<T = unknown> = (data?: T) => void;

/**
 * 单个事件监听对象。
 */
interface EventListener {
  /** 事件触发时调用的函数。 */
  callback: EventCallback;

  /** 监听归属对象，通常传 this，方便销毁时批量注销。 */
  target?: unknown;

  /** 是否只监听一次。 */
  once: boolean;
}

/**
 * 全局事件中心。
 *
 * 用于模块之间解耦通信，例如金币变化、游戏开始、游戏结束等。
 */
export class EventCenter {
  /** 事件名到监听列表的映射。 */
  private static readonly _listeners: Map<string, EventListener[]> = new Map();

  /**
   * 注册一个普通事件监听。
   *
   * @param eventName 事件名
   * @param callback 事件回调
   * @param target 监听归属对象，建议传当前类的 this
   */
  public static on<T = unknown>(eventName: string, callback: EventCallback<T>, target?: unknown): void {
    this.addListener(eventName, callback as EventCallback, target, false);
  }

  /**
   * 注册一个只触发一次的事件监听。
   *
   * 回调执行后会自动注销。
   */
  public static once<T = unknown>(eventName: string, callback: EventCallback<T>, target?: unknown): void {
    this.addListener(eventName, callback as EventCallback, target, true);
  }

  /**
   * 注销事件监听。
   *
   * 不传 callback 和 target 时，会移除这个事件名下的全部监听。
   */
  public static off(eventName: string, callback?: EventCallback, target?: unknown): void {
    const listeners = this._listeners.get(eventName);

    if (!listeners) {
      return;
    }

    if (!callback && target === undefined) {
      this._listeners.delete(eventName);
      return;
    }

    // 同时支持按回调、按归属对象、或两者组合进行删除。
    const nextListeners = listeners.filter((listener) => {
      const callbackMatched = callback ? listener.callback === callback : true;
      const targetMatched = target !== undefined ? listener.target === target : true;
      return !(callbackMatched && targetMatched);
    });

    if (nextListeners.length > 0) {
      this._listeners.set(eventName, nextListeners);
    } else {
      this._listeners.delete(eventName);
    }
  }

  /**
   * 派发事件。
   *
   * @param eventName 事件名
   * @param data 事件携带的数据
   */
  public static emit<T = unknown>(eventName: string, data?: T): void {
    const listeners = this._listeners.get(eventName);

    if (!listeners || listeners.length === 0) {
      return;
    }

    // 复制一份监听列表，避免回调里新增或删除监听导致遍历混乱。
    const currentListeners = listeners.slice();

    for (const listener of currentListeners) {
      listener.callback(data);

      if (listener.once) {
        this.off(eventName, listener.callback, listener.target);
      }
    }
  }

  /**
   * 清理事件监听。
   *
   * 不传 target 时会清空所有事件，传 target 时只清理这个对象注册的监听。
   */
  public static clear(target?: unknown): void {
    if (target === undefined) {
      this._listeners.clear();
      return;
    }

    for (const eventName of this._listeners.keys()) {
      this.off(eventName, undefined, target);
    }
  }

  /**
   * 获取某个事件当前的监听数量。
   *
   * 主要用于调试事件是否被重复注册。
   */
  public static listenerCount(eventName: string): number {
    return this._listeners.get(eventName)?.length ?? 0;
  }

  /**
   * 统一添加监听的内部方法。
   */
  private static addListener(eventName: string, callback: EventCallback, target: unknown, once: boolean): void {
    const listeners = this._listeners.get(eventName) ?? [];

    listeners.push({
      callback,
      target,
      once,
    });

    this._listeners.set(eventName, listeners);
  }
}
