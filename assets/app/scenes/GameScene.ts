import { _decorator, AudioSource, Node, UITransform } from "cc";
import { AudioManager } from "../core/audio/AudioManager";
import { StorageManager } from "../core/data/StorageManager";
import { EventCenter } from "../core/event/EventCenter";
import { PoolManager } from "../core/pool/PoolManager";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { TimerManager } from "../core/timer/TimerManager";
import { UIManager } from "../core/ui/UIManager";
import { Logger } from "../core/utils/Logger";
import { DemoGameController } from "../game/controller/DemoGameController";
import { GameEvent } from "../game/GameEvent";
import { UIGamePanel } from "../ui/panels/UIGamePanel";

const { ccclass } = _decorator;

/**
 * 游戏场景模板。
 *
 * 负责启动一局游戏、监听游戏结束和返回大厅事件。
 */
@ccclass("GameScene")
export class GameScene extends SceneBase {
  /** 当前场景名。 */
  protected _sceneName = "Game";

  /** 当前 Demo 控制器。 */
  private _controller: DemoGameController | null = null;

  /** 当前场景的 UI 根节点。 */
  private _uiRoot: Node | null = null;

  /**
   * 场景进入时调用。
   */
  protected onEnter(): void {
    super.onEnter();
    Logger.info("进入游戏场景。");
    this.prepareFrameworkServices();
    this.prepareGamePanel();
    void UIManager.open<UIGamePanel>("UIGamePanel");
    void this.startGame();
  }

  /**
   * 场景退出时调用。
   */
  protected onExit(): void {
    this.clearDemoRuntime();
    super.onExit();
  }

  /**
   * 注册游戏场景事件。
   */
  protected bindEvents(): void {
    EventCenter.on(GameEvent.GameOver, this.onGameOver, this);
    EventCenter.on(GameEvent.BackToLobby, this.onBackToLobby, this);
  }

  /**
   * 注销游戏场景事件。
   */
  protected unbindEvents(): void {
    EventCenter.off(GameEvent.GameOver, this.onGameOver, this);
    EventCenter.off(GameEvent.BackToLobby, this.onBackToLobby, this);
  }

  /**
   * 启动一局游戏。
   */
  private startGame(): void {
    Logger.info("游戏开始。");
    this._controller = new DemoGameController();
    void this._controller.start();
  }

  /**
   * 响应游戏结束事件。
   */
  private onGameOver = (): void => {
    Logger.info("游戏结束。");
  };

  /**
   * 响应返回大厅事件。
   */
  private onBackToLobby = (): void => {
    this.clearDemoRuntime();
    SceneManager.load("Lobby");
  };

  /**
   * 准备本场景需要用到的框架服务。
   */
  private prepareFrameworkServices(): void {
    const audioSource = this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
    AudioManager.setAudioSource(audioSource);
    AudioManager.setMusicVolume(StorageManager.get("musicVolume", 0.8));
    AudioManager.setEffectVolume(StorageManager.get("effectVolume", 1));
  }

  /**
   * 准备游戏面板。
   */
  private prepareGamePanel(): void {
    const uiRoot = this.getOrCreateUIRoot();
    UIManager.setRoot(uiRoot);

    const panelNode = new Node("UIGamePanel");
    const panel = panelNode.addComponent(UIGamePanel);
    UIManager.mount("UIGamePanel", panel, {
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
    uiRoot.addComponent(UITransform).setContentSize(720, 1280);
    this.node.addChild(uiRoot);
    this._uiRoot = uiRoot;
    return uiRoot;
  }

  /**
   * 清理 Demo 运行期资源。
   */
  private clearDemoRuntime(): void {
    this._controller?.destroy();
    this._controller = null;
    UIManager.close("UIGamePanel", true);
    TimerManager.clearAll();
    PoolManager.clearAll();
    AudioManager.stopMusic();
  }
}
