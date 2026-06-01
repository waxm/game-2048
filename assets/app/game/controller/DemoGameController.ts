import { AudioManager } from "../../core/audio/AudioManager";
import { StorageManager } from "../../core/data/StorageManager";
import { EventCenter } from "../../core/event/EventCenter";
import { ResManager } from "../../core/resource/ResManager";
import { TimerManager } from "../../core/timer/TimerManager";
import { Logger } from "../../core/utils/Logger";
import { GameEvent } from "../GameEvent";
import { DefaultDemoGameConfig, DemoGameConfig } from "../config/DemoGameConfig";
import { DemoGameResult, DemoGameState } from "../model/DemoGameState";

/**
 * 点击得分 Demo 控制器。
 *
 * 负责读取配置、控制倒计时、统计分数、保存最高分和金币。
 */
export class DemoGameController {
    /** Demo 配置。 */
    private _config: DemoGameConfig = DefaultDemoGameConfig;

    /** Demo 当前状态。 */
    private _state: DemoGameState = {
        score: 0,
        timeLeft: DefaultDemoGameConfig.duration,
        bestScore: 0,
        coins: 0,
        running: false,
        scorePerClick: DefaultDemoGameConfig.scorePerClick,
        popupRecycleDelay: DefaultDemoGameConfig.popupRecycleDelay,
    };

    /** 倒计时计时器 id。 */
    private _timerId = 0;

    /**
     * 启动 Demo。
     */
    public async start(): Promise<void> {
        await this.loadConfig();
        this.resetState();
        this.bindEvents();
        this.startTimer();

        this._state.running = true;
        EventCenter.emit<DemoGameState>(GameEvent.ScoreChanged, this._state);
        EventCenter.emit<DemoGameState>(GameEvent.TimeChanged, this._state);
        Logger.info("点击得分 Demo 已启动。", this._config);
    }

    /**
     * 停止 Demo。
     */
    public stop(): void {
        this.clearTimer();
        this.unbindEvents();
        this._state.running = false;
    }

    /**
     * 销毁控制器。
     */
    public destroy(): void {
        this.stop();
    }

    /**
     * 读取当前游戏状态。
     */
    public getState(): DemoGameState {
        return { ...this._state };
    }

    /**
     * 读取配置。
     *
     * 通过 ResManager 走统一资源加载流程。
     */
    private async loadConfig(): Promise<void> {
        this._config = await ResManager.loadJson<DemoGameConfig>("config/DemoGameConfig").catch((error) => {
            Logger.warn("Demo 配置加载失败，使用默认配置。", error);
            return DefaultDemoGameConfig;
        });
    }

    /**
     * 重置本局状态。
     */
    private resetState(): void {
        this._state = {
            score: 0,
            timeLeft: this._config.duration,
            bestScore: StorageManager.get("bestScore", 0),
            coins: StorageManager.get("coins", 0),
            running: false,
            scorePerClick: this._config.scorePerClick,
            popupRecycleDelay: this._config.popupRecycleDelay,
        };
    }

    /**
     * 注册 Demo 事件。
     */
    private bindEvents(): void {
        EventCenter.on(GameEvent.DemoClick, this.onDemoClick, this);
    }

    /**
     * 注销 Demo 事件。
     */
    private unbindEvents(): void {
        EventCenter.off(GameEvent.DemoClick, this.onDemoClick, this);
    }

    /**
     * 启动倒计时。
     */
    private startTimer(): void {
        this.clearTimer();

        this._timerId = TimerManager.loop(() => {
            this._state.timeLeft -= 1;
            EventCenter.emit<DemoGameState>(GameEvent.TimeChanged, this._state);

            if (this._state.timeLeft <= 0) {
                this.finishGame();
            }
        }, 1);
    }

    /**
     * 清理倒计时。
     */
    private clearTimer(): void {
        if (this._timerId <= 0) {
            return;
        }

        TimerManager.clear(this._timerId);
        this._timerId = 0;
    }

    /**
     * 响应屏幕点击。
     */
    private onDemoClick = (): void => {
        if (!this._state.running) {
            return;
        }

        this._state.score += this._config.scorePerClick;
        AudioManager.setEffectVolume(StorageManager.get("effectVolume", 1));
        EventCenter.emit<DemoGameState>(GameEvent.ScoreChanged, this._state);

        if (this._state.score >= this._config.targetScore) {
            this.finishGame();
        }
    };

    /**
     * 结束本局游戏。
     */
    private finishGame(): void {
        if (!this._state.running) {
            return;
        }

        this.clearTimer();
        this._state.running = false;

        const passed = this._state.score >= this._config.targetScore;
        const bestScore = Math.max(this._state.bestScore, this._state.score);
        const coins = this._state.coins + (passed ? this._config.coinReward : 0);

        this._state.bestScore = bestScore;
        this._state.coins = coins;

        StorageManager.set("bestScore", bestScore);
        StorageManager.set("coins", coins);

        const result: DemoGameResult = {
            score: this._state.score,
            bestScore,
            coins,
            passed,
        };

        Logger.info("点击得分 Demo 结束。", result);
        EventCenter.emit<DemoGameResult>(GameEvent.GameOver, result);
    }
}
