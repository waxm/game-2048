import { _decorator, Node, UITransform } from "cc";
import { EventCenter } from "../core/event/EventCenter";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { UIManager } from "../core/ui/UIManager";
import { Logger } from "../core/utils/Logger";
import { GameEvent } from "../game/GameEvent";

const { ccclass } = _decorator;

/**
 * 大厅场景模板。
 *
 * 负责展示首页 UI、监听开始游戏事件。
 */
@ccclass("LobbyScene")
export class LobbyScene extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = "Lobby";

    /** 当前场景的 UI 根节点。 */
    private _uiRoot: Node | null = null;

    /**
     * 场景进入时调用。
     */
    protected onEnter(): void {
        super.onEnter();
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
        const uiRoot = this.getOrCreateUIRoot();
        UIManager.setRoot(uiRoot);

        UIManager.register({
            name: "UIHomePanel",
            path: "prefabs/home/UIHomePanel",
            cache: true,
        });
    }

    /**
     * 获取或创建当前场景的 UI 根节点。
     */
    private getOrCreateUIRoot(): Node {
        if (this._uiRoot?.isValid) {
            return this._uiRoot;
        }

        const existRoot = this.node.getChildByName("UIRoot");

        if (existRoot) {
            this._uiRoot = existRoot;
            return existRoot;
        }

        const uiRoot = new Node("UIRoot");
        uiRoot.addComponent(UITransform).setContentSize(640, 1136);
        this.node.addChild(uiRoot);
        this._uiRoot = uiRoot;
        return uiRoot;
    }
}
