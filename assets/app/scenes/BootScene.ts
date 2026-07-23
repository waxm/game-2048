import { _decorator } from "cc";
import { App } from "../core/app/App";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { Logger } from "../core/utils/Logger";

const { ccclass } = _decorator;

/** 初始化通用框架的最小启动场景。 */
@ccclass("BootScene")
export class BootScene extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = "Boot";

    /** 初始化全部核心管理器并进入 2048 Demo 场景。 */
    protected onEnter(): void {
        super.onEnter();
        App.init();
        this.runAsyncTask(this.enterGameScene(), "进入 2048 Demo");
    }

    /** 加载玩法场景并在失败时保留明确日志。 */
    private async enterGameScene(): Promise<void> {
        const result = await SceneManager.load("Game2048");
        if (result.status !== "loaded") {
            Logger.error(
                `2048 Demo 场景加载失败：${result.reason ?? "unknown"}`,
                result.error,
            );
        }
    }
}
