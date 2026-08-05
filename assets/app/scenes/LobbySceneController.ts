import { _decorator, Button, isValid, Node } from "cc";
import { App } from "../core/app/App";
import { EventCenter } from "../core/event/EventCenter";
import { PoolManager } from "../core/pool/PoolManager";
import { GAME2048_APP_INIT_OPTIONS } from "../game/game2048/Game2048ProjectConfig";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { Logger } from "../core/utils/Logger";
import { UIManager } from "../core/ui/UIManager";
import { Game2048SettingsPanel } from "../ui/home/Game2048SettingsPanel";
import { Game2048ProfilePanel } from "../ui/home/Game2048ProfilePanel";
import { LobbySceneView } from "../ui/home/LobbySceneView";
import {
    GAME2048_HOME_EVENT,
    GAME2048_HOME_POOL_NAME,
    GAME2048_HOME_UI_CONFIG,
    GAME2048_HOME_UI_NAME,
} from "../game/game2048/Game2048HomeKey";
import {
    Game2048ProfileData,
    Game2048ProfileManager,
} from "../game/game2048/Game2048ProfileManager";
import { Game2048SettingsManager } from "../game/game2048/Game2048SettingsManager";

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

    /** Inspector 绑定的设置入口按钮。 */
    @property(Button)
    public settingsButton: Button | null = null;

    /** Inspector 绑定的玩家头像和名称入口按钮。 */
    @property(Button)
    public profileButton: Button | null = null;

    /** 动态设置 Prefab 的场景挂载根节点。 */
    @property(Node)
    public uiRoot: Node | null = null;

    /** 当前是否正在切换到游戏场景。 */
    private _transitioning = false;

    /** 场景请求序号，用于忽略场景退出后的旧异步结果。 */
    private _transitionSerial = 0;

    /** 当前是否已经绑定按钮事件。 */
    private _eventsBound = false;

    /** 当前是否正在异步打开设置面板。 */
    private _settingsOpening = false;

    /** 设置面板请求序号，用于让场景退出后的旧结果失效。 */
    private _settingsRequestSerial = 0;

    /** 当前是否正在异步打开玩家资料面板。 */
    private _profileOpening = false;

    /** 玩家资料面板请求序号，用于让场景退出后的旧结果失效。 */
    private _profileRequestSerial = 0;

    /** 场景进入：确保框架初始化并恢复大厅可操作状态。 */
    protected onEnter(): void {
        super.onEnter();
        if (!App.inited) {
            App.init(GAME2048_APP_INIT_OPTIONS);
        }
        this.assertRequiredBindings({
            view: this.view,
            startButton: this.startButton,
            settingsButton: this.settingsButton,
            profileButton: this.profileButton,
            uiRoot: this.uiRoot,
        });
        UIManager.setRoot(this.uiRoot!);
        UIManager.registerMany([
            { ...GAME2048_HOME_UI_CONFIG.Settings },
            { ...GAME2048_HOME_UI_CONFIG.Profile },
        ]);
        Game2048SettingsManager.initialize();
        const profile = Game2048ProfileManager.initialize();
        this._transitioning = false;
        this._settingsOpening = false;
        this._profileOpening = false;
        this.startButton!.interactable = true;
        this.view!.showReady();
        this.view!.showProfile(profile);
    }

    /** 注册开始游戏按钮事件，重复调用不会重复绑定。 */
    protected bindEvents(): void {
        if (this._eventsBound) {
            return;
        }
        this.assertRequiredBindings({
            startButton: this.startButton,
            settingsButton: this.settingsButton,
            profileButton: this.profileButton,
        });
        this._eventsBound = true;
        this.startButton!.node.on(
            Button.EventType.CLICK,
            this.startGame,
            this,
        );
        this.settingsButton!.node.on(
            Button.EventType.CLICK,
            this.openSettings,
            this,
        );
        this.profileButton!.node.on(
            Button.EventType.CLICK,
            this.openProfile,
            this,
        );
        EventCenter.on(
            GAME2048_HOME_EVENT.ProfileChanged,
            this.onProfileChanged,
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
        this.settingsButton?.node?.off(
            Button.EventType.CLICK,
            this.openSettings,
            this,
        );
        this.profileButton?.node?.off(
            Button.EventType.CLICK,
            this.openProfile,
            this,
        );
        EventCenter.off(
            GAME2048_HOME_EVENT.ProfileChanged,
            this.onProfileChanged,
            this,
        );
    }

    /** 场景退出：使未完成的跳转结果失效并清空程序化画布。 */
    protected onExit(): void {
        this._transitionSerial += 1;
        this._settingsRequestSerial += 1;
        this._profileRequestSerial += 1;
        this._transitioning = false;
        this._settingsOpening = false;
        this._profileOpening = false;
        UIManager.close(GAME2048_HOME_UI_NAME.Settings, true);
        UIManager.close(GAME2048_HOME_UI_NAME.Profile, true);
        PoolManager.clear(GAME2048_HOME_POOL_NAME.AvatarItem, true);
        this.view?.clear();
        super.onExit();
    }

    /** 设置按钮回调，加载期间合并连续点击并交给 UIManager 管理 Prefab。 */
    private openSettings(): void {
        if (this._settingsOpening || this._transitioning) {
            return;
        }
        this._settingsOpening = true;
        const requestSerial = ++this._settingsRequestSerial;
        this.runAsyncTask(
            this.openSettingsPanel(requestSerial),
            "打开 2048 设置面板",
        );
    }

    /** 等待设置 Prefab 打开，并在失败且场景仍有效时恢复可操作状态。 */
    private async openSettingsPanel(requestSerial: number): Promise<void> {
        const result = await UIManager.open<Game2048SettingsPanel>(
            GAME2048_HOME_UI_NAME.Settings,
        );
        if (
            requestSerial !== this._settingsRequestSerial ||
            !isValid(this, true) ||
            !isValid(this.node, true)
        ) {
            return;
        }
        this._settingsOpening = false;
        if (result.status === "failed") {
            Logger.error(
                `2048 设置面板打开失败：${result.reason ?? "unknown"}`,
                result.error,
            );
        }
    }

    /** 头像入口回调，加载期间合并连续点击并交给 UIManager 管理 Prefab。 */
    private openProfile(): void {
        if (this._profileOpening || this._transitioning) {
            return;
        }
        this._profileOpening = true;
        const requestSerial = ++this._profileRequestSerial;
        this.runAsyncTask(
            this.openProfilePanel(requestSerial),
            "打开 2048 玩家资料面板",
        );
    }

    /** 等待资料 Prefab 打开，并在失败且场景仍有效时恢复可操作状态。 */
    private async openProfilePanel(requestSerial: number): Promise<void> {
        const result = await UIManager.open<Game2048ProfilePanel>(
            GAME2048_HOME_UI_NAME.Profile,
        );
        if (
            requestSerial !== this._profileRequestSerial ||
            !isValid(this, true) ||
            !isValid(this.node, true)
        ) {
            return;
        }
        this._profileOpening = false;
        if (result.status === "failed") {
            Logger.error(
                `2048 玩家资料面板打开失败：${result.reason ?? "unknown"}`,
                result.error,
            );
        }
    }

    /** 玩家资料保存后立即刷新大厅头像和名称。 */
    private onProfileChanged = (profile?: Game2048ProfileData): void => {
        if (profile) {
            this.view!.showProfile(profile);
        }
    };

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
