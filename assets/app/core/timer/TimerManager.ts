/**
 * 计时器句柄。
 */
interface TimerRecord {
  /** 原生计时器句柄。 */
  nativeHandle: ReturnType<typeof setTimeout>;

  /** 是否为循环计时器。 */
  repeat: boolean;
}

/**
 * 计时器管理器。
 *
 * 统一管理延迟执行和循环执行，方便在切场景或重启游戏时批量清理。
 */
export class TimerManager {
  /** 计时器自增 id。 */
  private static _nextId = 1;

  /** 框架计时器 id 到原生计时器的映射。 */
  private static readonly _timers: Map<number, TimerRecord> = new Map();

  /**
   * 延迟执行一次。
   *
   * @param callback 回调函数
   * @param delay 秒
   */
  public static delay(callback: () => void, delay: number): number {
    const id = this.createTimerId();

    const nativeHandle = setTimeout(() => {
      this.clear(id);
      callback();
    }, delay * 1000);

    this._timers.set(id, {
      nativeHandle,
      repeat: false,
    });

    return id;
  }

  /**
   * 按固定间隔循环执行。
   *
   * @param callback 回调函数
   * @param interval 秒
   */
  public static loop(callback: () => void, interval: number): number {
    const id = this.createTimerId();

    const nativeHandle = setInterval(callback, interval * 1000);

    this._timers.set(id, {
      nativeHandle,
      repeat: true,
    });

    return id;
  }

  /**
   * 清理指定计时器。
   */
  public static clear(id: number): void {
    const timer = this._timers.get(id);

    if (!timer) {
      return;
    }

    if (timer.repeat) {
      clearInterval(timer.nativeHandle);
    } else {
      clearTimeout(timer.nativeHandle);
    }

    this._timers.delete(id);
  }

  /**
   * 清理全部计时器。
   */
  public static clearAll(): void {
    const ids = Array.from(this._timers.keys());

    for (const id of ids) {
      this.clear(id);
    }
  }

  /**
   * 获取当前正在管理的计时器数量。
   */
  public static count(): number {
    return this._timers.size;
  }

  /**
   * 创建框架内部计时器 id。
   */
  private static createTimerId(): number {
    return this._nextId++;
  }
}
