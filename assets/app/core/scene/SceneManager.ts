import { director } from "cc";
import { Logger } from "../utils/Logger";

/**
 * 场景加载回调。
 */
export type SceneLoadCallback = () => void;

/** 场景加载结果状态。 */
export type SceneLoadStatus = "loaded" | "ignored" | "cancelled" | "failed";

/** 场景加载失败或未执行的具体阶段。 */
export type SceneLoadReason =
    | "busy"
    | "reset"
    | "missing-current-scene"
    | "load-scene"
    | "loaded-callback";

/** 场景加载完成后返回给调用方的明确结果。 */
export interface SceneLoadResult {
    /** 本次请求最终状态。 */
    status: SceneLoadStatus;

    /** 本次请求准备加载的场景名。 */
    sceneName: string;

    /** 未成功完成时的具体原因。 */
    reason?: SceneLoadReason;

    /** 忽略请求时正在加载的场景名。 */
    activeSceneName?: string;

    /** 引擎或加载完成回调抛出的原始错误。 */
    error?: unknown;
}

/**
 * 场景管理器。
 *
 * 统一负责场景切换，业务层不要直接调用 director.loadScene。
 */
export class SceneManager {
    /** 当前记录的场景名。 */
    private static _currentSceneName = "";

    /** 当前是否正在加载场景，避免重复切换。 */
    private static _loading = false;

    /** 当前正在加载的场景名，用于说明并发请求为何被忽略。 */
    private static _loadingSceneName = "";

    /** 场景加载请求编号，用于阻止 reset 后的旧回调写回管理器状态。 */
    private static _loadRequestId = 0;

    /** 获取当前场景名。 */
    public static get currentSceneName(): string {
        return this._currentSceneName;
    }

    /** 当前是否正在加载场景。 */
    public static get loading(): boolean {
        return this._loading;
    }

    /**
     * 加载场景。
     *
     * @param sceneName Cocos Creator 中的场景名称
     * @param onLoaded 场景加载完成后的回调
     */
    public static load(sceneName: string, onLoaded?: SceneLoadCallback): Promise<SceneLoadResult> {
        if (this._loading) {
            const activeSceneName = this._loadingSceneName;
            Logger.warn(
                `场景 ${activeSceneName} 正在加载中，忽略新的加载请求：${sceneName}`,
            );
            return Promise.resolve({
                status: "ignored",
                sceneName,
                reason: "busy",
                activeSceneName,
            });
        }

        this._loading = true;
        this._loadingSceneName = sceneName;
        const requestId = ++this._loadRequestId;
        Logger.info(`开始加载场景：${sceneName}`);

        return new Promise((resolve) => {
            try {
                director.loadScene(sceneName, (error) => {
                    if (requestId !== this._loadRequestId) {
                        resolve({
                            status: "cancelled",
                            sceneName,
                            reason: "reset",
                        });
                        return;
                    }

                    this.finishLoadingRequest();
                    if (error) {
                        Logger.error(`场景加载失败：${sceneName}`, error);
                        resolve({
                            status: "failed",
                            sceneName,
                            reason: "load-scene",
                            error,
                        });
                        return;
                    }

                    this._currentSceneName = sceneName;
                    Logger.info(`场景加载完成：${sceneName}`);
                    try {
                        onLoaded?.();
                        resolve({ status: "loaded", sceneName });
                    } catch (callbackError) {
                        // 场景已经加载成功，但回调失败也必须结束 Promise 并保留原始错误。
                        Logger.error(
                            `场景加载完成回调执行失败：${sceneName}`,
                            callbackError,
                        );
                        resolve({
                            status: "failed",
                            sceneName,
                            reason: "loaded-callback",
                            error: callbackError,
                        });
                    }
                });
            } catch (loadError) {
                // director.loadScene 同步抛错时引擎不会触发回调，必须在这里恢复管理器状态。
                if (requestId === this._loadRequestId) {
                    this.finishLoadingRequest();
                }
                Logger.error(`场景加载调用失败：${sceneName}`, loadError);
                resolve({
                    status: "failed",
                    sceneName,
                    reason: "load-scene",
                    error: loadError,
                });
            }
        });
    }

    /**
     * 重新加载当前场景。
     */
    public static reload(): Promise<SceneLoadResult> {
        const scene = director.getScene();
        const sceneName = this._currentSceneName || scene?.name;

        if (!sceneName) {
            Logger.warn("当前场景名为空，无法重新加载。");
            return Promise.resolve({
                status: "ignored",
                sceneName: "",
                reason: "missing-current-scene",
            });
        }

        return this.load(sceneName);
    }

    /**
     * 从引擎当前场景同步场景名。
     *
     * 当项目不是通过 SceneManager 进入首场景时，可以调用这个方法补齐状态。
     */
    public static syncCurrentScene(): void {
        const scene = director.getScene();
        this._currentSceneName = scene?.name ?? "";
    }

    /**
     * 清空框架记录的场景状态。
     *
     * 这里只重置管理器状态，不主动销毁或切换 Cocos 当前场景。
     */
    public static reset(): void {
        this._loadRequestId += 1;
        this._currentSceneName = "";
        this.finishLoadingRequest();
    }

    /** 清除当前加载标记；允许失败、重置和正常完成路径重复调用。 */
    private static finishLoadingRequest(): void {
        this._loading = false;
        this._loadingSceneName = "";
    }
}
