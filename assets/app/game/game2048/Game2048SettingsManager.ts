import { AudioManager } from "../../core/audio/AudioManager";
import { StorageManager } from "../../core/data/StorageManager";
import { EventCenter } from "../../core/event/EventCenter";
import {
    GAME2048_HOME_EVENT,
    GAME2048_HOME_STORAGE_KEY,
} from "./Game2048HomeKey";

/** 当前设置存档版本。 */
const GAME2048_SETTINGS_VERSION = 1;

/** 设置页持久化的数据。 */
export interface Game2048SettingsData {
    /** 数据结构版本。 */
    version: 1;

    /** 是否允许播放背景音乐和音效。 */
    soundEnabled: boolean;

    /** 是否允许触发设备震动反馈。 */
    vibrationEnabled: boolean;
}

/** 浏览器震动能力的最小边界类型。 */
interface BrowserNavigatorWithVibration {
    /** Web Vibration API。 */
    vibrate?: (pattern: number) => boolean;
}

/** 声音和震动的版本化设置服务。 */
export class Game2048SettingsManager {
    /** 当前内存中的规范化设置。 */
    private static _settings = this.createDefaultSettings();

    /** 是否已经从存档初始化。 */
    private static _initialized = false;

    /** 从存档加载设置并立即应用音频状态。 */
    public static initialize(): Game2048SettingsData {
        const stored = StorageManager.get<unknown>(
            GAME2048_HOME_STORAGE_KEY.Settings,
            null,
        );
        this._settings = this.normalize(stored);
        this._initialized = true;
        this.applyAudioSettings();
        StorageManager.set(GAME2048_HOME_STORAGE_KEY.Settings, this._settings);
        return this.getSettings();
    }

    /** 返回不允许外部修改的设置快照。 */
    public static getSettings(): Game2048SettingsData {
        this.ensureInitialized();
        return { ...this._settings };
    }

    /** 设置声音开关并持久化。 */
    public static setSoundEnabled(enabled: boolean): Game2048SettingsData {
        this.ensureInitialized();
        if (this._settings.soundEnabled === enabled) {
            return this.getSettings();
        }
        this._settings = { ...this._settings, soundEnabled: enabled };
        this.applyAudioSettings();
        return this.persistAndNotify();
    }

    /** 设置震动开关并持久化；开启时提供一次短反馈。 */
    public static setVibrationEnabled(
        enabled: boolean,
    ): Game2048SettingsData {
        this.ensureInitialized();
        if (this._settings.vibrationEnabled !== enabled) {
            this._settings = { ...this._settings, vibrationEnabled: enabled };
            this.persistAndNotify();
        }
        if (enabled) {
            this.vibrate(35);
        }
        return this.getSettings();
    }

    /** 在震动开启时请求一次反馈，不支持的平台安全降级。 */
    public static vibrate(durationMs = 20): boolean {
        this.ensureInitialized();
        if (!this._settings.vibrationEnabled) {
            return false;
        }
        // Cocos 运行环境不保证完整 DOM 类型，这里只收窄实际使用的浏览器边界。
        const navigatorValue = (globalThis as {
            navigator?: BrowserNavigatorWithVibration;
        }).navigator;
        return (
            navigatorValue?.vibrate?.(Math.max(1, Math.round(durationMs))) ??
            false
        );
    }

    /** 测试或完整退出时恢复未初始化状态。 */
    public static reset(): void {
        this._settings = this.createDefaultSettings();
        this._initialized = false;
    }

    /** 保证首次访问时也会读取存档。 */
    private static ensureInitialized(): void {
        if (!this._initialized) {
            this.initialize();
        }
    }

    /** 创建新玩家的默认设置。 */
    private static createDefaultSettings(): Game2048SettingsData {
        return {
            version: GAME2048_SETTINGS_VERSION,
            soundEnabled: true,
            vibrationEnabled: true,
        };
    }

    /** 校验外部存档，损坏或旧结构统一回退到安全默认值。 */
    private static normalize(value: unknown): Game2048SettingsData {
        if (
            !value ||
            typeof value !== "object" ||
            !("version" in value) ||
            !("soundEnabled" in value) ||
            !("vibrationEnabled" in value) ||
            value.version !== GAME2048_SETTINGS_VERSION ||
            typeof value.soundEnabled !== "boolean" ||
            typeof value.vibrationEnabled !== "boolean"
        ) {
            return this.createDefaultSettings();
        }
        return {
            version: GAME2048_SETTINGS_VERSION,
            soundEnabled: value.soundEnabled,
            vibrationEnabled: value.vibrationEnabled,
        };
    }

    /** 把当前声音设置同步到框架音频管理器。 */
    private static applyAudioSettings(): void {
        const volume = this._settings.soundEnabled ? 1 : 0;
        AudioManager.setMusicVolume(volume);
        AudioManager.setEffectVolume(volume);
    }

    /** 保存设置并派发不可变快照。 */
    private static persistAndNotify(): Game2048SettingsData {
        StorageManager.set(GAME2048_HOME_STORAGE_KEY.Settings, this._settings);
        const snapshot = this.getSettings();
        EventCenter.emit(GAME2048_HOME_EVENT.SettingsChanged, snapshot);
        return snapshot;
    }
}
