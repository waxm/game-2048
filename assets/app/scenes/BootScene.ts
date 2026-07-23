import { _decorator, Button, isValid } from "cc";
import { App } from "../core/app/App";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { Logger } from "../core/utils/Logger";
import { BootSceneView } from "../ui/common/BootSceneView";

const { ccclass, property } = _decorator;

/** 初始化通用框架并进入大厅的启动场景控制器。 */
@ccclass("BootScene")
export class BootScene extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = "Boot";

    /** Inspector 绑定的启动视图。 */
    @property(BootSceneView)
    public view: BootSceneView | null = null;

    /** Inspector 绑定的启动失败重试按钮。 */
    @property(Button)
    public retryButton: Button | null = null;

    /** 启动进度停留时长，让用户能感知独立启动场景。 */
    private readonly _minimumBootDuration = 0.72;

    /** 当前启动进度。 */
    private _progress = 0;

    /** 当前是否正在加载大厅。 */
    private _loadingLobby = false;

    /** 当前启动请求序号，用于忽略场景退出后的旧异步结果。 */
    private _requestSerial = 0;

    /** 当前是否已经绑定重试按钮。 */
    private _eventsBound = false;

    /** 初始化全部核心管理器并启动进入大厅流程。 */
    protected onEnter(): void {
        super.onEnter();
        this.assertRequiredBindings({
            view: this.view,
            retryButton: this.retryButton,
        });
        App.init();
        this.beginLoading();
    }

    /** 注册启动失败重试按钮，重复调用不会重复绑定。 */
    protected bindEvents(): void {
        if (this._eventsBound) {
            return;
        }
        this.assertRequiredBindings({
            retryButton: this.retryButton,
        });
        this._eventsBound = true;
        this.retryButton!.node.on(
            Button.EventType.CLICK,
            this.retryEnterLobby,
            this,
        );
    }

    /** 注销启动失败重试按钮，允许重复调用。 */
    protected unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }
        this._eventsBound = false;
        this.retryButton?.node?.off(
            Button.EventType.CLICK,
            this.retryEnterLobby,
            this,
        );
    }

    /** 场景退出：使旧请求失效并清空启动画布。 */
    protected onExit(): void {
        this._requestSerial += 1;
        this._loadingLobby = false;
        this.view?.clear();
        super.onExit();
    }

    /** Cocos 生命周期：推进可视进度，到达最低停留时间后加载大厅。 */
    protected update(deltaTime: number): void {
        if (this._loadingLobby || this._progress >= 1) {
            return;
        }
        this._progress = Math.min(
            1,
            this._progress + deltaTime / this._minimumBootDuration,
        );
        this.view?.showLoading(this._progress);
        if (this._progress >= 1) {
            this.loadLobby();
        }
    }

    /** 重试按钮回调：重新执行启动进度和大厅加载。 */
    private retryEnterLobby(): void {
        if (this._loadingLobby) {
            return;
        }
        this.beginLoading();
    }

    /** 重置启动显示与交互状态。 */
    private beginLoading(): void {
        this._progress = 0;
        this._loadingLobby = false;
        this.retryButton!.interactable = false;
        this.view!.showLoading(0);
    }

    /** 防止同一帧重复发起大厅加载请求。 */
    private loadLobby(): void {
        if (this._loadingLobby) {
            return;
        }
        this._loadingLobby = true;
        const requestSerial = ++this._requestSerial;
        this.runAsyncTask(
            this.enterLobbyScene(requestSerial),
            "启动完成进入大厅",
        );
    }

    /** 加载大厅场景，失败时显示重试入口并恢复交互。 */
    private async enterLobbyScene(requestSerial: number): Promise<void> {
        const result = await SceneManager.load("Lobby");
        if (result.status === "loaded") {
            return;
        }
        if (
            requestSerial !== this._requestSerial ||
            !isValid(this, true) ||
            !isValid(this.node, true)
        ) {
            return;
        }

        this._loadingLobby = false;
        this.retryButton!.interactable = true;
        this.view!.showFailure();
        Logger.error(
            `2048 大厅场景加载失败：${result.reason ?? "unknown"}`,
            result.error,
        );
    }
}
