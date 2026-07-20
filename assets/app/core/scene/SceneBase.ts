import { _decorator, Component } from "cc";
import { Logger } from "../utils/Logger";

const { ccclass } = _decorator;

/**
 * 场景脚本基类。
 *
 * Boot、Lobby、Game、Result 等场景脚本都可以继承它，统一场景进入和退出流程。
 */
@ccclass("SceneBase")
export class SceneBase extends Component {
  /** 场景名。子类不设置时，默认使用节点名或类名。 */
  protected _sceneName = "";

  /** 获取当前场景名。 */
  public get sceneName(): string {
    return this._sceneName || this.node.name || this.constructor.name;
  }

  /**
   * 校验场景脚本在 Inspector 中声明的必填引用。
   *
   * 场景结构缺失时立即中断启动，避免运行时创建替代节点掩盖绑定错误。
   */
  protected assertRequiredBindings(bindings: Record<string, unknown>): void {
    const missingNames = Object.keys(bindings).filter(
      (name) => bindings[name] === null || bindings[name] === undefined,
    );
    if (missingNames.length > 0) {
      throw new Error(
        `Scene 节点未绑定：${this.node.name}.${missingNames.join("、")}`,
      );
    }
  }

  /**
   * 托管场景发起但不需要同步等待的异步任务。
   *
   * 业务函数仍应自行处理资源加载失败等预期结果；这里负责接住真正遗漏的异常，
   * 保证按钮事件和 Cocos 生命周期不会产生 Unhandled Promise Rejection。
   */
  protected runAsyncTask(task: Promise<unknown>, description: string): void {
    void task.catch((error) => {
      Logger.error(`${this.sceneName} 场景异步任务失败：${description}`, error);
    });
  }

  /**
   * Cocos 生命周期：节点加载时调用。
   *
   * 这里统一触发场景进入逻辑和事件注册。
   */
  protected onLoad(): void {
    this.onEnter();
    this.bindEvents();
  }

  /**
   * Cocos 生命周期：节点销毁时调用。
   *
   * 这里统一触发事件注销和场景退出逻辑。
   */
  protected onDestroy(): void {
    this.unbindEvents();
    this.onExit();
  }

  /**
   * 场景进入时调用。
   *
   * 子类在这里初始化场景数据、节点、UI 等。
   */
  protected onEnter(): void {
    // 子类重写：处理场景进入时的初始化逻辑。
  }

  /**
   * 场景退出时调用。
   *
   * 子类在这里释放场景级资源。
   */
  protected onExit(): void {
    // 子类重写：处理场景退出时的清理逻辑。
  }

  /**
   * 注册场景事件。
   *
   * 子类统一在这里监听 EventCenter 事件。
   */
  protected bindEvents(): void {
    // 子类重写：注册当前场景需要监听的事件。
  }

  /**
   * 注销场景事件。
   *
   * 子类统一在这里取消事件监听。
   */
  protected unbindEvents(): void {
    // 子类重写：注销当前场景监听的事件。
  }
}
