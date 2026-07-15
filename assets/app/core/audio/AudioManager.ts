import { AudioClip, AudioSource } from "cc";
import { ResManager } from "../resource/ResManager";
import { Logger } from "../utils/Logger";

/**
 * 音频播放选项。
 */
export interface AudioPlayOptions {
    /** 所属 Asset Bundle，不填则从 resources 加载。 */
    bundleName?: string;

    /** 音量，范围建议 0 到 1。 */
    volume?: number;
}

/**
 * 音频管理器。
 *
 * 统一负责背景音乐和音效播放。
 */
export class AudioManager {
    /** 用于播放背景音乐和音效的 AudioSource。 */
    private static _audioSource: AudioSource | null = null;

    /** 背景音乐音量。 */
    private static _musicVolume = 1;

    /** 音效音量。 */
    private static _effectVolume = 1;

    /** 当前背景音乐路径。 */
    private static _currentMusicPath = "";

    /** 音乐异步加载请求编号，用于阻止停止或重置后的旧请求继续播放。 */
    private static _musicRequestId = 0;

    /** 音频管理器生命周期编号，用于让重置前加载中的音效失效。 */
    private static _lifecycleId = 0;

    /**
     * 初始化音频管理器。
     *
     * audioSource 可以稍后通过 setAudioSource 设置。
     */
    public static init(audioSource?: AudioSource): void {
        if (audioSource) {
            this.setAudioSource(audioSource);
        }

        Logger.info("音频管理器初始化完成。");
    }

    /**
     * 设置音频播放组件。
     *
     * 建议在启动场景或常驻节点上挂一个 AudioSource，然后传进来。
     */
    public static setAudioSource(audioSource: AudioSource): void {
        this._audioSource = audioSource;
    }

    /**
     * 播放背景音乐。
     *
     * @param path AudioClip 资源路径，不带扩展名
     * @param loop 是否循环播放
     */
    public static async playMusic(path: string, loop = true, options: AudioPlayOptions = {}): Promise<void> {
        const source = this.getAudioSource();

        if (!source) {
            return;
        }

        const requestId = ++this._musicRequestId;
        const clip = await ResManager.load(path, AudioClip, {
            bundleName: options.bundleName,
        });

        // 加载期间可能已经停止音乐、重置框架或更换 AudioSource，旧结果必须丢弃。
        if (requestId !== this._musicRequestId || source !== this._audioSource || !source.isValid) {
            return;
        }

        this._currentMusicPath = path;
        this._musicVolume = options.volume ?? this._musicVolume;
        source.clip = clip;
        source.loop = loop;
        source.volume = this._musicVolume;
        source.play();
    }

    /**
     * 停止背景音乐。
     */
    public static stopMusic(): void {
        this._musicRequestId += 1;
        const source = this.getAudioSource();

        if (!source) {
            return;
        }

        source.stop();
        source.clip = null;
        this._currentMusicPath = "";
    }

    /**
     * 重置音频运行状态并解除场景 AudioSource 引用。
     *
     * 音量会恢复默认值，但不会修改 StorageManager 中的用户设置。
     */
    public static reset(): void {
        this._musicRequestId += 1;
        this._lifecycleId += 1;
        const source = this._audioSource;
        if (source?.isValid) {
            source.stop();
            source.clip = null;
        }
        this._audioSource = null;
        this._musicVolume = 1;
        this._effectVolume = 1;
        this._currentMusicPath = "";
    }

    /**
     * 暂停背景音乐。
     */
    public static pauseMusic(): void {
        this.getAudioSource()?.pause();
    }

    /**
     * 恢复背景音乐。
     */
    public static resumeMusic(): void {
        this.getAudioSource()?.play();
    }

    /**
     * 播放一次音效。
     *
     * 使用 AudioSource.playOneShot，不会打断当前背景音乐。
     */
    public static async playEffect(path: string, options: AudioPlayOptions = {}): Promise<void> {
        const source = this.getAudioSource();

        if (!source) {
            return;
        }

        const lifecycleId = this._lifecycleId;
        const clip = await ResManager.load(path, AudioClip, {
            bundleName: options.bundleName,
        });

        if (lifecycleId !== this._lifecycleId || source !== this._audioSource || !source.isValid) {
            return;
        }

        const volume = options.volume ?? this._effectVolume;
        source.playOneShot(clip, volume);
    }

    /**
     * 设置背景音乐音量。
     */
    public static setMusicVolume(volume: number): void {
        this._musicVolume = this.clampVolume(volume);

        if (this._audioSource) {
            this._audioSource.volume = this._musicVolume;
        }
    }

    /**
     * 设置音效音量。
     */
    public static setEffectVolume(volume: number): void {
        this._effectVolume = this.clampVolume(volume);
    }

    /**
     * 获取当前背景音乐路径。
     */
    public static getCurrentMusicPath(): string {
        return this._currentMusicPath;
    }

    /**
     * 获取 AudioSource，没有设置时输出提示。
     */
    private static getAudioSource(): AudioSource | null {
        if (!this._audioSource) {
            Logger.warn("AudioSource 还没有设置，无法播放音频。");
            return null;
        }

        return this._audioSource;
    }

    /**
     * 限制音量范围，避免传入异常值。
     */
    private static clampVolume(volume: number): number {
        return Math.max(0, Math.min(1, volume));
    }
}
