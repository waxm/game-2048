import { AudioClip, AudioSource, director, Game, game, Node } from "cc";
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

    /** 本次播放音量，范围建议为 0 到 1。 */
    volume?: number;
}

/**
 * 全局音频管理器。
 *
 * 管理器在 Boot 场景初始化时创建常驻 AudioRoot，并分别使用两个 AudioSource 播放
 * 背景音乐和一次性音效。AudioRoot 不属于任何业务场景，因此切换场景不会留下失效引用。
 */
export class AudioManager {
    /** 常驻音频根节点名称，便于运行时在层级管理器中定位。 */
    private static readonly AUDIO_ROOT_NAME = "AudioRoot";

    /** 背景音乐节点名称。 */
    private static readonly MUSIC_SOURCE_NAME = "MusicSource";

    /** 一次性音效节点名称。 */
    private static readonly EFFECT_SOURCE_NAME = "EffectSource";

    /** 跨场景保留的音频根节点。 */
    private static _audioRoot: Node | null = null;

    /** 专门播放背景音乐的音频组件。 */
    private static _musicSource: AudioSource | null = null;

    /** 专门播放一次性音效的音频组件。 */
    private static _effectSource: AudioSource | null = null;

    /** 背景音乐音量。 */
    private static _musicVolume = 1;

    /** 音效音量。 */
    private static _effectVolume = 1;

    /** 当前背景音乐路径。 */
    private static _currentMusicPath = "";

    /** 当前背景音乐是否循环。 */
    private static _currentMusicLoop = true;

    /** 当前业务是否要求背景音乐保持播放。 */
    private static _musicPlaybackRequested = false;

    /** 应用是否处于后台，用于阻止后台播放和错误恢复。 */
    private static _appHidden = false;

    /** 是否已经监听应用前后台事件。 */
    private static _applicationLifecycleBound = false;

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
     * 初始化全局音频服务。
     *
     * 重复调用不会创建多个常驻节点或重复注册应用事件。首次调用应位于 Boot 场景已经
     * 加载之后，确保 AudioRoot 能先加入当前场景根层级再声明为常驻节点。
     */
    public static init(): void {
        this.bindApplicationLifecycle();
        if (!this.ensureAudioHost()) {
            Logger.warn("全局音频节点创建失败，将在首次播放时重新尝试。");
            return;
        }

        Logger.info("全局音频管理器初始化完成。");
    }

    /**
     * 播放背景音乐。
     *
     * @param path AudioClip 资源路径，不带扩展名
     * @param loop 是否循环播放
     */
    public static async playMusic(
        path: string,
        loop = true,
        options: AudioPlayOptions = {},
    ): Promise<void> {
        const source = this.getMusicSource();
        if (!source) {
            return;
        }

        const requestId = ++this._musicRequestId;
        const handle = await ResManager.acquire(path, AudioClip, {
            bundleName: options.bundleName,
        });

        // 加载期间可能停止音乐、重置框架或重建常驻节点，旧结果必须主动归还。
        if (
            requestId !== this._musicRequestId ||
            source !== this._musicSource ||
            !source.isValid
        ) {
            handle.release();
            return;
        }

        // 必须先解除 AudioSource 对旧音乐的引用，再释放资源，避免底层仍读取旧 clip。
        source.stop();
        source.clip = null;
        this.releaseMusicHandle();
        this._musicHandle = handle;
        this._currentMusicPath = path;
        this._currentMusicLoop = loop;
        this._musicPlaybackRequested = true;
        this._musicVolume = this.clampVolume(options.volume ?? this._musicVolume);
        source.clip = handle.asset;
        source.loop = loop;
        source.volume = this._musicVolume;

        // 后台完成的加载只准备资源，回到前台后再根据播放意图恢复，避免后台发声。
        if (!this._appHidden) {
            source.play();
        }
    }

    /** 停止背景音乐并释放当前音乐资源。 */
    public static stopMusic(): void {
        this._musicRequestId += 1;
        this._musicPlaybackRequested = false;
        const source = this._musicSource;
        if (source?.isValid) {
            source.stop();
            source.clip = null;
        }
        this.releaseMusicHandle();
        this._currentMusicPath = "";
        this._currentMusicLoop = true;
    }

    /**
     * 重置音频服务、归还全部音频资源并销毁常驻节点。
     *
     * 音量会恢复默认值，但不会修改 StorageManager 中保存的用户设置。该方法允许重复调用，
     * 主要供 App.reset、自动化测试和完整热重载使用，普通场景切换不应调用。
     */
    public static reset(): void {
        this._musicRequestId += 1;
        this._lifecycleId += 1;
        this._musicPlaybackRequested = false;

        const source = this._musicSource;
        if (source?.isValid) {
            source.stop();
            source.clip = null;
        }

        this.releaseMusicHandle();
        this.releaseAllEffectHandles();
        this.unbindApplicationLifecycle();
        this.destroyAudioHost();
        this._musicVolume = 1;
        this._effectVolume = 1;
        this._currentMusicPath = "";
        this._currentMusicLoop = true;
        this._appHidden = false;
    }

    /** 手动暂停背景音乐；应用恢复时不会擅自继续播放。 */
    public static pauseMusic(): void {
        this._musicPlaybackRequested = false;
        const source = this._musicSource;
        if (source?.isValid) {
            source.pause();
        }
    }

    /** 恢复已加载的背景音乐；应用在后台时延迟到回到前台再播放。 */
    public static resumeMusic(): void {
        if (!this._musicHandle || !this._currentMusicPath) {
            return;
        }

        const source = this.getMusicSource();
        if (!source) {
            return;
        }

        this._musicPlaybackRequested = true;
        if (!this._appHidden) {
            source.play();
        }
    }

    /**
     * 播放一次音效。
     *
     * 音效使用独立 AudioSource，不会被背景音乐音量影响，也不会打断背景音乐。
     */
    public static async playEffect(
        path: string,
        options: AudioPlayOptions = {},
    ): Promise<void> {
        if (this._appHidden) {
            return;
        }

        const source = this.getEffectSource();
        if (!source) {
            return;
        }

        const lifecycleId = this._lifecycleId;
        const handle = await ResManager.acquire(path, AudioClip, {
            bundleName: options.bundleName,
        });

        // 音效加载期间切到后台、重置服务或重建音频节点时，不再播放过期音效。
        if (
            lifecycleId !== this._lifecycleId ||
            source !== this._effectSource ||
            !source.isValid ||
            this._appHidden
        ) {
            handle.release();
            return;
        }

        const volume = this.clampVolume(options.volume ?? this._effectVolume);
        source.playOneShot(handle.asset, volume);
        this.holdEffectUntilPlaybackEnds(handle);
    }

    /** 设置背景音乐音量，并立即同步到正在使用的音乐音源。 */
    public static setMusicVolume(volume: number): void {
        this._musicVolume = this.clampVolume(volume);
        if (this._musicSource?.isValid) {
            this._musicSource.volume = this._musicVolume;
        }
    }

    /** 设置后续一次性音效使用的默认音量。 */
    public static setEffectVolume(volume: number): void {
        this._effectVolume = this.clampVolume(volume);
    }

    /** 获取当前背景音乐路径。 */
    public static getCurrentMusicPath(): string {
        return this._currentMusicPath;
    }

    /** 返回可用的音乐音源，节点丢失时先尝试重建常驻宿主。 */
    private static getMusicSource(): AudioSource | null {
        if (!this.ensureAudioHost()) {
            Logger.warn("全局音乐 AudioSource 不可用，无法播放背景音乐。");
            return null;
        }
        return this._musicSource;
    }

    /** 返回可用的音效音源，节点丢失时先尝试重建常驻宿主。 */
    private static getEffectSource(): AudioSource | null {
        if (!this.ensureAudioHost()) {
            Logger.warn("全局音效 AudioSource 不可用，无法播放音效。");
            return null;
        }
        return this._effectSource;
    }

    /**
     * 创建或复用跨场景音频宿主。
     *
     * Cocos 要求常驻节点先位于当前 Scene 的根层级。音乐和音效拆成两个子节点，避免
     * musicSource.volume 参与 playOneShot 的最终音量计算，也便于分别控制生命周期。
     */
    private static ensureAudioHost(): boolean {
        if (this.isAudioHostValid()) {
            return true;
        }

        // 外部误删或热重载可能只留下部分失效引用，先完整清理再建立一致的新宿主。
        this.destroyAudioHost();
        const scene = director.getScene();
        if (!scene?.isValid) {
            return false;
        }

        const audioRoot = new Node(this.AUDIO_ROOT_NAME);
        const musicNode = new Node(this.MUSIC_SOURCE_NAME);
        const effectNode = new Node(this.EFFECT_SOURCE_NAME);
        musicNode.setParent(audioRoot);
        effectNode.setParent(audioRoot);
        const musicSource = musicNode.addComponent(AudioSource);
        const effectSource = effectNode.addComponent(AudioSource);
        musicSource.playOnAwake = false;
        effectSource.playOnAwake = false;
        effectSource.volume = 1;

        try {
            scene.addChild(audioRoot);
            director.addPersistRootNode(audioRoot);
        } catch (error) {
            if (director.isPersistRootNode(audioRoot)) {
                director.removePersistRootNode(audioRoot);
            }
            audioRoot.destroy();
            Logger.error("全局音频节点注册为常驻节点失败。", error);
            return false;
        }

        this._audioRoot = audioRoot;
        this._musicSource = musicSource;
        this._effectSource = effectSource;
        this.restoreMusicSourceState();
        return true;
    }

    /** 判断音频根节点和两个音源是否同时有效。 */
    private static isAudioHostValid(): boolean {
        return Boolean(
            this._audioRoot?.isValid &&
                director.isPersistRootNode(this._audioRoot) &&
                this._musicSource?.isValid &&
                this._effectSource?.isValid,
        );
    }

    /**
     * 音频宿主被意外重建时恢复已经持有的背景音乐。
     *
     * 资源句柄仍由管理器持有，因此只需要把 clip、循环和音量重新写入新 AudioSource；
     * 是否立即播放继续服从业务播放意图和应用前后台状态。
     */
    private static restoreMusicSourceState(): void {
        const source = this._musicSource;
        if (!source?.isValid || !this._musicHandle) {
            return;
        }

        source.clip = this._musicHandle.asset;
        source.loop = this._currentMusicLoop;
        source.volume = this._musicVolume;
        if (this._musicPlaybackRequested && !this._appHidden) {
            source.play();
        }
    }

    /** 销毁当前常驻音频节点并清空组件引用，不改变已持有资源和播放意图。 */
    private static destroyAudioHost(): void {
        const root = this._audioRoot;
        const source = this._musicSource;
        if (source?.isValid) {
            source.stop();
            source.clip = null;
        }
        if (root?.isValid) {
            if (director.isPersistRootNode(root)) {
                director.removePersistRootNode(root);
            }
            root.destroy();
        }

        this._audioRoot = null;
        this._musicSource = null;
        this._effectSource = null;
    }

    /** 注册应用隐藏和恢复事件；状态标记保证重复初始化不会重复绑定。 */
    private static bindApplicationLifecycle(): void {
        if (this._applicationLifecycleBound) {
            return;
        }
        game.on(Game.EVENT_HIDE, this.onApplicationHide, this);
        game.on(Game.EVENT_SHOW, this.onApplicationShow, this);
        this._applicationLifecycleBound = true;
    }

    /** 注销应用生命周期事件；reset 重复调用时保持幂等。 */
    private static unbindApplicationLifecycle(): void {
        if (!this._applicationLifecycleBound) {
            return;
        }
        game.off(Game.EVENT_HIDE, this.onApplicationHide, this);
        game.off(Game.EVENT_SHOW, this.onApplicationShow, this);
        this._applicationLifecycleBound = false;
    }

    /** 应用进入后台时暂停正在播放的音乐，并保留业务播放意图。 */
    private static onApplicationHide(): void {
        if (this._appHidden) {
            return;
        }
        this._appHidden = true;
        const source = this._musicSource;
        if (this._musicPlaybackRequested && source?.isValid && source.playing) {
            source.pause();
        }
    }

    /** 应用回到前台时，仅恢复业务仍然要求播放的背景音乐。 */
    private static onApplicationShow(): void {
        if (!this._appHidden) {
            return;
        }
        this._appHidden = false;
        const source = this._musicSource;
        if (
            this._musicPlaybackRequested &&
            this._musicHandle &&
            source?.isValid
        ) {
            source.play();
        }
    }

    /** 限制音量范围，避免传入异常值。 */
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
