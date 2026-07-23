import { _decorator, Button, isValid } from "cc";
import { App } from "../core/app/App";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { Logger } from "../core/utils/Logger";
import { LobbySceneView } from "../ui/home/LobbySceneView";

const { ccclass, property } = _decorator;

/** 2048 大厅场景控制器，负责开始游戏和异步跳转恢复。 */
@ccclass("LobbySceneController")
export class LobbySceneController extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = "Lobby";

    /** Inspector 绑定的大厅视图。 */
    @property(LobbySceneView)
    public view: LobbySceneView | null = null;

    /** Inspector 绑定的开始游戏按钮。 */
    @property(Button)
    public startButton: Button | null = null;

    /** 当前是否正在切换到游戏场景。 */
    private _transitioning = false;

    /** 场景请求序号，用于忽略场景退出后的旧异步结果。 */
    private _transitionSerial = 0;

    /** 当前是否已经绑定按钮事件。 */
    private _eventsBound = false;

    /** 场景进入：确保框架初始化并恢复大厅可操作状态。 */
    protected onEnter(): void {
        super.onEnter();
        if (!App.inited) {
            App.init();
        }
        this.assertRequiredBindings({
            view: this.view,
            startButton: this.startButton,
        });
        this._transitioning = false;
        this.startButton!.interactable = true;
        this.view!.showReady();
    }

    /** 注册开始游戏按钮事件，重复调用不会重复绑定。 */
    protected bindEvents(): void {
        if (this._eventsBound) {
            return;
        }
        this.assertRequiredBindings({
            startButton: this.startButton,
        });
        this._eventsBound = true;
        this.startButton!.node.on(
            Button.EventType.CLICK,
            this.startGame,
            this,
        );
    }

    /** 注销开始游戏按钮事件，允许重复调用。 */
    protected unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }
        this._eventsBound = false;
        this.startButton?.node?.off(
            Button.EventType.CLICK,
            this.startGame,
            this,
        );
    }

    /** 场景退出：使未完成的跳转结果失效并清空程序化画布。 */
    protected onExit(): void {
        this._transitionSerial += 1;
        this._transitioning = false;
        this.view?.clear();
        super.onExit();
    }

    /** 开始游戏按钮回调，切换期间屏蔽重复点击。 */
    private startGame(): void {
        if (this._transitioning) {
            return;
        }
        this._transitioning = true;
        this.startButton!.interactable = false;
        this.view!.showLoading();
        const requestSerial = ++this._transitionSerial;
        this.runAsyncTask(
            this.enterGameScene(requestSerial),
            "从大厅进入 2048 游戏",
        );
    }

    /** 加载游戏场景，失败时恢复大厅按钮和明确提示。 */
    private async enterGameScene(requestSerial: number): Promise<void> {
        const result = await SceneManager.load("Game2048");
        if (result.status === "loaded") {
            return;
        }
        if (
            requestSerial !== this._transitionSerial ||
            !isValid(this, true) ||
            !isValid(this.node, true)
        ) {
            return;
        }

        this._transitioning = false;
        this.startButton!.interactable = true;
        this.view!.showFailure();
        Logger.error(
            `2048 游戏场景加载失败：${result.reason ?? "unknown"}`,
            result.error,
        );
    }
}
