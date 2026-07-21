import { _decorator } from "cc";
import { App } from "../core/app/App";
import { SceneBase } from "../core/scene/SceneBase";
import { Logger } from "../core/utils/Logger";

const { ccclass } = _decorator;

/** 初始化通用框架的最小启动场景。 */
@ccclass("BootScene")
export class BootScene extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = "Boot";

    /** 初始化全部核心管理器，具体游戏在自己的业务分支中接入后续场景。 */
    protected onEnter(): void {
        super.onEnter();
        App.init();
        Logger.info("通用框架启动完成，等待业务层接入首个游戏场景。");
    }
}
