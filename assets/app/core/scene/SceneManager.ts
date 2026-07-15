import { director } from "cc";
import { Logger } from "../utils/Logger";

/**
 * 场景加载回调。
 */
export type SceneLoadCallback = () => void;

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
    public static load(sceneName: string, onLoaded?: SceneLoadCallback): Promise<void> {
        if (this._loading) {
            Logger.warn(`场景正在加载中，忽略新的加载请求：${sceneName}`);
            return Promise.resolve();
        }

        this._loading = true;
        const requestId = ++this._loadRequestId;
        Logger.info(`开始加载场景：${sceneName}`);

        return new Promise((resolve, reject) => {
            director.loadScene(sceneName, (error) => {
                if (requestId !== this._loadRequestId) {
                    resolve();
                    return;
                }
                this._loading = false;

                if (error) {
                    Logger.error(`场景加载失败：${sceneName}`, error);
                    reject(error);
                    return;
                }

                this._currentSceneName = sceneName;
                Logger.info(`场景加载完成：${sceneName}`);
                onLoaded?.();
                resolve();
            });
        });
    }

    /**
     * 重新加载当前场景。
     */
    public static reload(): Promise<void> {
        const scene = director.getScene();
        const sceneName = this._currentSceneName || scene?.name;

        if (!sceneName) {
            Logger.warn("当前场景名为空，无法重新加载。");
            return Promise.resolve();
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
        this._loading = false;
    }
}
