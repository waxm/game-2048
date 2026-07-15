import { _decorator, Node } from "cc";
import { EventCenter } from "../core/event/EventCenter";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { UIManager } from "../core/ui/UIManager";
import { Logger } from "../core/utils/Logger";
import { GameEvent } from "../game/GameEvent";

const { ccclass, property } = _decorator;

/**
 * 大厅场景模板。
 *
 * 负责展示首页 UI、监听开始游戏事件。
 */
@ccclass("LobbyScene")
export class LobbyScene extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = "Lobby";

    /** 当前场景的 UI 根节点，必须在 Lobby.scene 中显式绑定。 */
    @property(Node)
    private uiRoot: Node | null = null;

    /**
     * 场景进入时调用。
     */
    protected onEnter(): void {
        super.onEnter();
        this.assertRequiredBindings({ uiRoot: this.uiRoot });
        Logger.info("进入大厅场景。");
        this.prepareHomePanel();
        void UIManager.open("UIHomePanel");
    }

    /**
     * 注册大厅场景事件。
     */
    protected bindEvents(): void {
        EventCenter.on(GameEvent.GameStart, this.onGameStart, this);
    }

    /**
     * 注销大厅场景事件。
     */
    protected unbindEvents(): void {
        EventCenter.off(GameEvent.GameStart, this.onGameStart, this);
    }

    /**
     * 响应开始游戏事件。
     */
    private onGameStart = (): void => {
        Logger.info("收到开始游戏事件。");
        UIManager.close("UIHomePanel");
        SceneManager.load("Game");
    };

    /**
     * 准备首页面板。
     *
     * 首页使用 Prefab，由 UIManager 统一加载和管理。
     */
    private prepareHomePanel(): void {
        UIManager.setRoot(this.uiRoot!);

        UIManager.register({
            name: "UIHomePanel",
            path: "prefabs/home/UIHomePanel",
            cache: true,
        });
    }
}
