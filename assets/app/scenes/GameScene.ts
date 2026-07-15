import { _decorator, AudioSource, Node, UITransform } from "cc";
import { AudioManager } from "../core/audio/AudioManager";
import { StorageManager } from "../core/data/StorageManager";
import { EventCenter } from "../core/event/EventCenter";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { UIManager } from "../core/ui/UIManager";
import { Logger } from "../core/utils/Logger";
import { PuzzleGameController } from "../game/controller/PuzzleGameController";
import { GameEvent } from "../game/GameEvent";
import { UIGamePanel } from "../ui/game/UIGamePanel";

const { ccclass } = _decorator;

/** 第 1 关拼图游戏场景。 */
@ccclass("GameScene")
export class GameScene extends SceneBase {
  /** 当前场景名。 */
  protected _sceneName = "Game";

  /** 第 1 关拼图控制器。 */
  private _controller: PuzzleGameController | null = null;

  /** 当前场景的 UI 挂载根节点。 */
  private _uiRoot: Node | null = null;

  /**
   * 当前打开游戏面板的请求编号。
   *
   * 场景退出时递增编号，使退出前尚未完成的异步加载结果自动失效。
   */
  private _panelRequestId = 0;

  /** 进入场景时准备服务并打开拼图面板。 */
  protected onEnter(): void {
    super.onEnter();
    Logger.info("进入拼图游戏场景。");
    this.prepareFrameworkServices();
    this.registerGamePanel();
    void this.openGamePanel();
  }

  /** 离开场景时释放本局控制器和 UI。 */
  protected onExit(): void {
    this.clearRuntime();
    super.onExit();
  }

  /** 注册场景级事件。 */
  protected bindEvents(): void {
    EventCenter.on(GameEvent.BackToLobby, this.onBackToLobby, this);
  }

  /** 注销场景级事件。 */
  protected unbindEvents(): void {
    EventCenter.off(GameEvent.BackToLobby, this.onBackToLobby, this);
  }

  /** 注册游戏 Prefab，由 UIManager 统一加载。 */
  private registerGamePanel(): void {
    UIManager.setRoot(this.getOrCreateUIRoot());
    UIManager.register({
      name: "UIGamePanel",
      path: "prefabs/game/UIGamePanel",
      cache: false,
    });
  }

  /** UI 完成加载和事件绑定后再启动控制器，避免丢失初始状态事件。 */
  private async openGamePanel(): Promise<void> {
    const requestId = ++this._panelRequestId;
    const panel = await UIManager.open<UIGamePanel>("UIGamePanel");

    if (!this.node.isValid || requestId !== this._panelRequestId) {
      // 旧请求仍可能已经实例化面板，必须同步关闭，避免离场后残留 UI。
      if (panel && UIManager.get("UIGamePanel") === panel) {
        UIManager.close("UIGamePanel", true);
      } else if (panel?.node.isValid) {
        panel.node.destroy();
      }
      return;
    }

    if (!panel) {
      throw new Error(
        "UIGamePanel 打开失败，请检查 prefabs/game/UIGamePanel。",
      );
    }

    this._controller = new PuzzleGameController();
    this._controller.start();
  }

  /** 返回大厅并清理当前拼图运行数据。 */
  private onBackToLobby = (): void => {
    this.clearRuntime();
    SceneManager.load("Lobby");
  };

  /** 准备当前场景使用的音频服务。 */
  private prepareFrameworkServices(): void {
    const audioSource =
      this.node.getComponent(AudioSource) ??
      this.node.addComponent(AudioSource);
    AudioManager.setAudioSource(audioSource);
    AudioManager.setMusicVolume(StorageManager.get("musicVolume", 0.8));
    AudioManager.setEffectVolume(StorageManager.get("effectVolume", 1));
  }

  /** 获取或创建非业务 UI 的场景挂载根节点。 */
  private getOrCreateUIRoot(): Node {
    if (this._uiRoot?.isValid) {
      return this._uiRoot;
    }

    const existingRoot = this.node.getChildByName("UIRoot");
    if (existingRoot) {
      this._uiRoot = existingRoot;
      return existingRoot;
    }

    const uiRoot = new Node("UIRoot");
    uiRoot.addComponent(UITransform).setContentSize(640, 1136);
    this.node.addChild(uiRoot);
    this._uiRoot = uiRoot;
    return uiRoot;
  }

  /** 清理控制器、UI 和音乐状态；重复调用也保持安全。 */
  private clearRuntime(): void {
    // 先让异步打开请求失效，再关闭现有 UI，避免加载完成后重新启动控制器。
    this._panelRequestId += 1;
    this._controller?.destroy();
    this._controller = null;
    UIManager.close("UIGamePanel", true);
    AudioManager.stopMusic();
  }
}
