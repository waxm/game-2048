import { AudioClip, AudioSource } from "cc";
import { ResManager } from "../resource/ResManager";
import type { ResourceHandle } from "../resource/ResManager";
import { TimerManager } from "../timer/TimerManager";
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

    /** 当前背景音乐资源所有权，停止或切歌后立即归还。 */
    private static _musicHandle: ResourceHandle<AudioClip> | null = null;

    /** 正在播放的一次性音效资源，播放结束后按时长归还。 */
    private static readonly _effectHandles: Set<ResourceHandle<AudioClip>> = new Set();

    /** 音效句柄对应的延迟释放计时器。 */
    private static readonly _effectReleaseTimers: Map<ResourceHandle<AudioClip>, number> = new Map();

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
        const handle = await ResManager.acquire(path, AudioClip, {
            bundleName: options.bundleName,
        });

        // 加载期间可能已经停止音乐、重置框架或更换 AudioSource，旧结果必须丢弃。
        if (requestId !== this._musicRequestId || source !== this._audioSource || !source.isValid) {
            handle.release();
            return;
        }

        // 先解除 AudioSource 对旧音乐的使用，再归还旧资源，避免释放后组件仍引用旧 clip。
        source.stop();
        source.clip = null;
        this.releaseMusicHandle();
        this._musicHandle = handle;
        this._currentMusicPath = path;
        this._musicVolume = this.clampVolume(options.volume ?? this._musicVolume);
        source.clip = handle.asset;
        source.loop = loop;
        source.volume = this._musicVolume;
        source.play();
    }

    /**
     * 停止背景音乐。
     */
    public static stopMusic(): void {
        this._musicRequestId += 1;
        const source = this._audioSource;
        if (source?.isValid) {
            source.stop();
            source.clip = null;
        }
        this.releaseMusicHandle();
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
        this.releaseMusicHandle();
        this.releaseAllEffectHandles();
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
        const handle = await ResManager.acquire(path, AudioClip, {
            bundleName: options.bundleName,
        });

        if (lifecycleId !== this._lifecycleId || source !== this._audioSource || !source.isValid) {
            handle.release();
            return;
        }

        const volume = this.clampVolume(options.volume ?? this._effectVolume);
        source.playOneShot(handle.asset, volume);
        this.holdEffectUntilPlaybackEnds(handle);
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

    /** 归还当前背景音乐句柄；允许停止、切歌和 reset 重复调用。 */
    private static releaseMusicHandle(): void {
        this._musicHandle?.release();
        this._musicHandle = null;
    }

    /**
     * 保持一次性音效资源到预计播放结束。
     *
     * decRef 不能紧跟在 playOneShot 后执行，因为底层音频仍在异步读取 clip；已知时长时延后
     * 一小段保护时间释放，时长不可用时保留到 reset，宁可晚释放也不冒播放中断的风险。
     */
    private static holdEffectUntilPlaybackEnds(handle: ResourceHandle<AudioClip>): void {
        this._effectHandles.add(handle);
        const duration = handle.asset.getDuration();
        if (!Number.isFinite(duration) || duration <= 0) {
            Logger.warn(`音效时长不可用，将在音频管理器重置时释放：${handle.path}`);
            return;
        }

        const timerId = TimerManager.delay(() => {
            this._effectReleaseTimers.delete(handle);
            this._effectHandles.delete(handle);
            handle.release();
        }, duration + 0.25);
        this._effectReleaseTimers.set(handle, timerId);
    }

    /** 清理所有音效释放计时器并归还仍在播放或等待兜底清理的资源。 */
    private static releaseAllEffectHandles(): void {
        for (const timerId of this._effectReleaseTimers.values()) {
            TimerManager.clear(timerId);
        }
        this._effectReleaseTimers.clear();
        for (const handle of this._effectHandles) {
            handle.release();
        }
        this._effectHandles.clear();
    }
}
