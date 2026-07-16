import { director, macro } from "cc";
import { Logger } from "../utils/Logger";

/** Creator Scheduler 识别计时目标所需的最小结构。 */
interface TimerSchedulerTarget {
    /** 每个计时器独立的稳定标识。 */
    id: string;
}

/** 框架计时器记录。 */
interface TimerRecord {
    /** 注册到 Creator Scheduler 的实际回调。 */
    schedulerCallback: (deltaTime?: number) => void;

    /** Creator Scheduler 使用的独立目标。 */
    schedulerTarget: TimerSchedulerTarget;

    /** 是否为循环计时器。 */
    repeat: boolean;

    /** 业务归属对象，用于组件销毁时批量清理。 */
    owner?: unknown;
}

/**
 * 计时器管理器。
 *
 * 所有计时均使用 Creator Scheduler 的游戏时间，会跟随 director 暂停和恢复；
 * 业务不应直接使用 setTimeout 或 setInterval，以免切后台后倒计时继续流逝。
 */
export class TimerManager {
    /** 计时器自增编号。 */
    private static _nextId = 1;

    /** 框架计时器编号到 Scheduler 记录的映射。 */
    private static readonly _timers: Map<number, TimerRecord> = new Map();

    /**
     * 延迟执行一次。
     *
     * @param callback 到时后执行的回调
     * @param delay 延迟秒数，允许为 0
     * @param owner 可选归属对象，用于 clearByOwner 批量清理
     */
    public static delay(callback: () => void, delay: number, owner?: unknown): number {
        this.assertDuration(delay, true, "延迟时间");
        return this.createTimer(callback, delay, false, owner);
    }

    /**
     * 按固定游戏时间间隔循环执行。
     *
     * @param callback 每次到达间隔后执行的回调
     * @param interval 循环间隔秒数，必须大于 0
     * @param owner 可选归属对象，用于 clearByOwner 批量清理
     */
    public static loop(callback: () => void, interval: number, owner?: unknown): number {
        this.assertDuration(interval, false, "循环间隔");
        return this.createTimer(callback, interval, true, owner);
    }

    /** 清理指定计时器；重复清理不会产生错误。 */
    public static clear(id: number): void {
        const record = this._timers.get(id);
        if (!record) {
            return;
        }

        director.getScheduler().unschedule(record.schedulerCallback, record.schedulerTarget);
        this._timers.delete(id);
    }

    /** 清理指定归属对象创建的全部计时器。 */
    public static clearByOwner(owner: unknown): void {
        const ids: number[] = [];
        for (const [id, record] of this._timers) {
            if (record.owner === owner) {
                ids.push(id);
            }
        }
        for (const id of ids) {
            this.clear(id);
        }
    }

    /** 暂停指定计时器，已经暂停或不存在时不重复操作。 */
    public static pause(id: number): void {
        const record = this._timers.get(id);
        if (!record || director.getScheduler().isTargetPaused(record.schedulerTarget)) {
            return;
        }
        director.getScheduler().pauseTarget(record.schedulerTarget);
    }

    /** 恢复指定计时器，正在运行或不存在时不重复操作。 */
    public static resume(id: number): void {
        const record = this._timers.get(id);
        if (!record || !director.getScheduler().isTargetPaused(record.schedulerTarget)) {
            return;
        }
        director.getScheduler().resumeTarget(record.schedulerTarget);
    }

    /** 判断指定计时器当前是否暂停；不存在的计时器返回 false。 */
    public static isPaused(id: number): boolean {
        const record = this._timers.get(id);
        return record
            ? director.getScheduler().isTargetPaused(record.schedulerTarget)
            : false;
    }

    /** 清理全部计时器，一般只在 App.reset 中调用。 */
    public static clearAll(): void {
        const ids = Array.from(this._timers.keys());
        for (const id of ids) {
            this.clear(id);
        }
        this._nextId = 1;
    }

    /** 获取计时器数量；传 owner 时只统计该归属对象的计时器。 */
    public static count(owner?: unknown): number {
        if (owner === undefined) {
            return this._timers.size;
        }

        let count = 0;
        for (const record of this._timers.values()) {
            if (record.owner === owner) {
                count += 1;
            }
        }
        return count;
    }

    /** 创建并注册单次或循环 Scheduler 任务。 */
    private static createTimer(
        callback: () => void,
        duration: number,
        repeat: boolean,
        owner?: unknown,
    ): number {
        const id = this.createTimerId();
        const schedulerTarget: TimerSchedulerTarget = {
            id: `WorkAI.Timer.${id}`,
        };
        const schedulerCallback = (): void => {
            if (!this._timers.has(id)) {
                return;
            }

            // 单次任务在用户回调前移除记录，回调内 clear 或创建新任务都不会污染旧状态。
            if (!repeat) {
                this._timers.delete(id);
            }

            try {
                callback();
            } catch (error) {
                // 循环任务发生异常后立即停表，避免每个间隔重复抛出同一错误。
                if (repeat) {
                    this.clear(id);
                }
                Logger.error(`计时器回调执行失败：${id}`, error);
            }
        };

        this._timers.set(id, {
            schedulerCallback,
            schedulerTarget,
            repeat,
            owner,
        });

        const scheduler = director.getScheduler();
        try {
            if (repeat) {
                scheduler.schedule(
                    schedulerCallback,
                    schedulerTarget,
                    duration,
                    macro.REPEAT_FOREVER,
                    0,
                    false,
                );
            } else {
                scheduler.schedule(schedulerCallback, schedulerTarget, 0, 0, duration, false);
            }
        } catch (error) {
            // Scheduler 注册同步失败时回滚本地记录，不能留下永远无法触发和清理的假任务。
            this._timers.delete(id);
            throw error;
        }
        return id;
    }

    /** 校验计时参数，阻止 NaN、Infinity、负数或零间隔形成不可控任务。 */
    private static assertDuration(duration: number, allowZero: boolean, fieldName: string): void {
        const valid = Number.isFinite(duration) && (allowZero ? duration >= 0 : duration > 0);
        if (!valid) {
            throw new RangeError(`${fieldName}无效：${duration}`);
        }
    }

    /** 创建不与当前活动任务重复的框架计时器编号。 */
    private static createTimerId(): number {
        const id = this._nextId;
        this._nextId = id >= Number.MAX_SAFE_INTEGER ? 1 : id + 1;
        if (this._timers.has(id)) {
            return this.createTimerId();
        }
        return id;
    }
}
