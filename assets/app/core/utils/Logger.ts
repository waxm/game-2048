/**
 * 日志等级。
 *
 * 数字越大，输出越少。
 */
export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
    None = 4,
}

/**
 * 统一日志工具。
 *
 * 后续项目里不要直接到处写 console，优先通过 Logger 输出。
 * 这样以后要关闭日志、换前缀、上报错误时，只需要改这里。
 */
export class Logger {
    /** 当前允许输出的最低日志等级。 */
    private static _level: LogLevel = LogLevel.Debug;

    /** 所有日志统一带上的项目前缀。 */
    private static _prefix = "[WorkAI]";

    /**
     * 设置日志等级。
     *
     * 例如发布版本可以设置成 Warn 或 Error，减少控制台输出。
     */
    public static setLevel(level: LogLevel): void {
        this._level = level;
    }

    /**
     * 设置日志前缀。
     *
     * 多个小游戏共用框架时，可以用不同前缀区分项目。
     */
    public static setPrefix(prefix: string): void {
        this._prefix = prefix;
    }

    /** 输出调试日志，适合开发阶段查看临时信息。 */
    public static debug(...args: unknown[]): void {
        if (this._level <= LogLevel.Debug) {
            console.debug(this._prefix, ...args);
        }
    }

    /** 输出普通日志，适合记录框架初始化、流程切换等信息。 */
    public static info(...args: unknown[]): void {
        if (this._level <= LogLevel.Info) {
            console.info(this._prefix, ...args);
        }
    }

    /** 输出警告日志，适合记录不影响运行但需要注意的问题。 */
    public static warn(...args: unknown[]): void {
        if (this._level <= LogLevel.Warn) {
            console.warn(this._prefix, ...args);
        }
    }

    /** 输出错误日志，适合记录会影响功能运行的问题。 */
    public static error(...args: unknown[]): void {
        if (this._level <= LogLevel.Error) {
            console.error(this._prefix, ...args);
        }
    }
}
