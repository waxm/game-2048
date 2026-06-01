import { _decorator } from "cc";
import { App } from "../core/app/App";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { Logger } from "../core/utils/Logger";

const { ccclass } = _decorator;

/**
 * 启动场景。
 *
 * 项目启动后先进入这个场景，用它完成框架初始化。
 * 框架初始化完成后，再自动切换到 Lobby 场景。
 */
@ccclass("BootScene")
export class BootScene extends SceneBase {
  /** 当前场景名。 */
  protected _sceneName = "Boot";

  /** 启动完成后进入的场景名。 */
  private readonly _nextSceneName = "Lobby";

  /**
   * 场景进入时调用。
   *
   * SceneBase 会在 onLoad 中自动调用这里。
   */
  protected onEnter(): void {
    super.onEnter();

    Logger.info("进入启动场景。");
    this.initFramework();
    this.enterNextScene();
  }

  /**
   * 初始化框架。
   *
   * 第一版先只调用 App.init()，后续资源、配置、存档、音频等模块会继续接到这里。
   */
  private initFramework(): void {
    App.init();
  }

  /**
   * 进入下一个场景。
   */
  private enterNextScene(): void {
    Logger.info(`启动流程完成，准备进入场景：${this._nextSceneName}`);
    void SceneManager.load(this._nextSceneName);
  }
}
