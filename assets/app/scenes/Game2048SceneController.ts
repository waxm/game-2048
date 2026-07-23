import {
    _decorator,
    Button,
    EventKeyboard,
    EventMouse,
    EventTouch,
    Input,
    KeyCode,
    Node,
    UITransform,
    Vec3,
    input,
    isValid,
} from "cc";
import { App } from "../core/app/App";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { Logger } from "../core/utils/Logger";
import {
    Game2048Point,
    Game2048RunState,
} from "../game/game2048/Game2048Model";
import { Game2048World } from "../game/game2048/Game2048World";
import { Game2048Renderer } from "../ui/game/Game2048Renderer";

const { ccclass, property } = _decorator;

/**
 * 2048 圆形竞技场场景控制器。
 *
 * 负责把场景输入转换为领域方向、驱动世界时钟，并把快照交给渲染器。
 */
@ccclass("Game2048SceneController")
export class Game2048SceneController extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = "Game2048";

    /** Inspector 绑定的程序化渲染器。 */
    @property(Game2048Renderer)
    public renderer: Game2048Renderer | null = null;

    /** 覆盖完整画布的输入节点。 */
    @property(Node)
    public inputSurface: Node | null = null;

    /** 玩家失败后显示的结算节点。 */
    @property(Node)
    public gameOverPanel: Node | null = null;

    /** 结算面板中的重新开始按钮。 */
    @property(Button)
    public restartButton: Button | null = null;

    /** 游戏进行中返回大厅的按钮。 */
    @property(Button)
    public backButton: Button | null = null;

    /** 结算面板中返回大厅的按钮。 */
    @property(Button)
    public gameOverLobbyButton: Button | null = null;

    /** 与 Cocos 节点解耦的玩法领域对象。 */
    private readonly _world = new Game2048World();

    /** 当前按住的键盘方向键。 */
    private readonly _pressedKeys: Set<KeyCode> = new Set();

    /** 重新开始次数，用于让每局随机分布不同。 */
    private _restartSerial = 0;

    /** 当前是否已经完成输入监听注册。 */
    private _inputBound = false;

    /** 当前是否正在返回大厅，期间暂停玩法并屏蔽重复交互。 */
    private _sceneTransitioning = false;

    /** 返回大厅请求序号，用于忽略场景退出后的旧异步结果。 */
    private _transitionSerial = 0;

    /** 场景进入：初始化框架并开始第一局。 */
    protected onEnter(): void {
        super.onEnter();
        if (!App.inited) {
            App.init();
        }
        this.assertRequiredBindings({
            renderer: this.renderer,
            inputSurface: this.inputSurface,
            gameOverPanel: this.gameOverPanel,
            restartButton: this.restartButton,
            backButton: this.backButton,
            gameOverLobbyButton: this.gameOverLobbyButton,
        });
        if (!this.inputSurface!.getComponent(UITransform)) {
            throw new Error("2048 输入节点缺少 UITransform。");
        }
        this.restartGame();
    }

    /** 注册触摸、鼠标、键盘和重新开始事件。 */
    protected bindEvents(): void {
        if (this._inputBound) {
            return;
        }
        this.assertRequiredBindings({
            inputSurface: this.inputSurface,
            restartButton: this.restartButton,
            backButton: this.backButton,
            gameOverLobbyButton: this.gameOverLobbyButton,
        });
        this._inputBound = true;
        this.inputSurface!.on(
            Node.EventType.TOUCH_START,
            this.handleTouchDirection,
            this,
        );
        this.inputSurface!.on(
            Node.EventType.TOUCH_MOVE,
            this.handleTouchDirection,
            this,
        );
        this.inputSurface!.on(
            Node.EventType.MOUSE_DOWN,
            this.handleMouseDirection,
            this,
        );
        this.inputSurface!.on(
            Node.EventType.MOUSE_MOVE,
            this.handleMouseDirection,
            this,
        );
        input.on(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.handleKeyUp, this);
        this.restartButton!.node.on(
            Button.EventType.CLICK,
            this.restartGame,
            this,
        );
        this.backButton!.node.on(
            Button.EventType.CLICK,
            this.backToLobby,
            this,
        );
        this.gameOverLobbyButton!.node.on(
            Button.EventType.CLICK,
            this.backToLobby,
            this,
        );
    }

    /** 注销全部输入和按钮事件，允许重复调用。 */
    protected unbindEvents(): void {
        if (!this._inputBound) {
            return;
        }
        this._inputBound = false;
        this.inputSurface?.off(
            Node.EventType.TOUCH_START,
            this.handleTouchDirection,
            this,
        );
        this.inputSurface?.off(
            Node.EventType.TOUCH_MOVE,
            this.handleTouchDirection,
            this,
        );
        this.inputSurface?.off(
            Node.EventType.MOUSE_DOWN,
            this.handleMouseDirection,
            this,
        );
        this.inputSurface?.off(
            Node.EventType.MOUSE_MOVE,
            this.handleMouseDirection,
            this,
        );
        input.off(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.handleKeyUp, this);
        this.restartButton?.node?.off(
            Button.EventType.CLICK,
            this.restartGame,
            this,
        );
        this.backButton?.node?.off(
            Button.EventType.CLICK,
            this.backToLobby,
            this,
        );
        this.gameOverLobbyButton?.node?.off(
            Button.EventType.CLICK,
            this.backToLobby,
            this,
        );
    }

    /** 场景退出：清空按键状态和程序化画布。 */
    protected onExit(): void {
        this._transitionSerial += 1;
        this._sceneTransitioning = false;
        this._pressedKeys.clear();
        this.renderer?.clear();
        super.onExit();
    }

    /** Cocos 生命周期：推进玩法并刷新一帧显示。 */
    protected update(deltaTime: number): void {
        if (this._sceneTransitioning) {
            return;
        }
        this._world.update(deltaTime);
        const snapshot = this._world.getSnapshot();
        const shouldShowGameOver =
            snapshot.state === Game2048RunState.GameOver;
        if (
            this.gameOverPanel &&
            this.gameOverPanel.active !== shouldShowGameOver
        ) {
            this.gameOverPanel.active = shouldShowGameOver;
        }
        this.renderer?.render(snapshot);
    }

    /** 重新建立世界并隐藏上一局结算界面。 */
    private restartGame(): void {
        if (this._sceneTransitioning) {
            return;
        }
        this._restartSerial += 1;
        this._pressedKeys.clear();
        this.setSceneButtonsInteractable(true);
        this.gameOverPanel!.active = false;
        const seed = 2048 + this._restartSerial * 7919;
        this._world.reset(seed);
        this._world.setPlayerDirection({ x: 0, y: 1 });
        this.renderer!.render(this._world.getSnapshot());
    }

    /** 返回大厅按钮回调，切换期间暂停世界并禁用全部场景按钮。 */
    private backToLobby(): void {
        if (this._sceneTransitioning) {
            return;
        }
        this._sceneTransitioning = true;
        this._pressedKeys.clear();
        this.setSceneButtonsInteractable(false);
        const requestSerial = ++this._transitionSerial;
        this.runAsyncTask(
            this.enterLobbyScene(requestSerial),
            "从 2048 游戏返回大厅",
        );
    }

    /** 加载大厅场景，失败时恢复本局交互并保留当前世界状态。 */
    private async enterLobbyScene(requestSerial: number): Promise<void> {
        const result = await SceneManager.load("Lobby");
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

        this._sceneTransitioning = false;
        this.setSceneButtonsInteractable(true);
        Logger.error(
            `2048 大厅场景加载失败：${result.reason ?? "unknown"}`,
            result.error,
        );
    }

    /** 同步设置游戏内、重新开始和结算返回按钮的可交互状态。 */
    private setSceneButtonsInteractable(interactable: boolean): void {
        if (this.restartButton) {
            this.restartButton.interactable = interactable;
        }
        if (this.backButton) {
            this.backButton.interactable = interactable;
        }
        if (this.gameOverLobbyButton) {
            this.gameOverLobbyButton.interactable = interactable;
        }
    }

    /** 把触摸位置转换为以画布中心为原点的玩家方向。 */
    private handleTouchDirection(event: EventTouch): void {
        const location = event.getUILocation();
        this.updatePlayerDirectionFromUiLocation(location.x, location.y);
    }

    /** 把鼠标位置转换为以画布中心为原点的玩家方向。 */
    private handleMouseDirection(event: EventMouse): void {
        const location = event.getUILocation();
        this.updatePlayerDirectionFromUiLocation(location.x, location.y);
    }

    /** 记录按下的方向键并立即刷新键盘方向。 */
    private handleKeyDown(event: EventKeyboard): void {
        if (!this.isDirectionKey(event.keyCode)) {
            return;
        }
        this._pressedKeys.add(event.keyCode);
        this.applyKeyboardDirection();
    }

    /** 移除松开的方向键并应用仍按住的组合方向。 */
    private handleKeyUp(event: EventKeyboard): void {
        this._pressedKeys.delete(event.keyCode);
        this.applyKeyboardDirection();
    }

    /** 将 UI 屏幕坐标转换到输入节点本地空间后更新方向。 */
    private updatePlayerDirectionFromUiLocation(
        locationX: number,
        locationY: number,
    ): void {
        if (this._world.state !== Game2048RunState.Playing) {
            return;
        }
        const transform = this.inputSurface!.getComponent(UITransform)!;
        const localPosition = transform.convertToNodeSpaceAR(
            new Vec3(locationX, locationY, 0),
        );
        this.updatePlayerDirection({
            x: localPosition.x,
            y: localPosition.y,
        });
    }

    /** 归一化并提交一个玩家方向。 */
    private updatePlayerDirection(direction: Game2048Point): void {
        const length = Math.sqrt(
            direction.x * direction.x + direction.y * direction.y,
        );
        if (length < 12) {
            return;
        }
        this._world.setPlayerDirection({
            x: direction.x / length,
            y: direction.y / length,
        });
    }

    /** 根据当前按住的 WASD 或方向键组合提交方向。 */
    private applyKeyboardDirection(): void {
        let directionX = 0;
        let directionY = 0;
        if (
            this._pressedKeys.has(KeyCode.KEY_A) ||
            this._pressedKeys.has(KeyCode.ARROW_LEFT)
        ) {
            directionX -= 1;
        }
        if (
            this._pressedKeys.has(KeyCode.KEY_D) ||
            this._pressedKeys.has(KeyCode.ARROW_RIGHT)
        ) {
            directionX += 1;
        }
        if (
            this._pressedKeys.has(KeyCode.KEY_W) ||
            this._pressedKeys.has(KeyCode.ARROW_UP)
        ) {
            directionY += 1;
        }
        if (
            this._pressedKeys.has(KeyCode.KEY_S) ||
            this._pressedKeys.has(KeyCode.ARROW_DOWN)
        ) {
            directionY -= 1;
        }
        if (directionX !== 0 || directionY !== 0) {
            this.updatePlayerDirection({ x: directionX, y: directionY });
        }
    }

    /** 判断键值是否属于 Demo 支持的八个方向输入。 */
    private isDirectionKey(keyCode: KeyCode): boolean {
        return (
            keyCode === KeyCode.KEY_A ||
            keyCode === KeyCode.KEY_D ||
            keyCode === KeyCode.KEY_W ||
            keyCode === KeyCode.KEY_S ||
            keyCode === KeyCode.ARROW_LEFT ||
            keyCode === KeyCode.ARROW_RIGHT ||
            keyCode === KeyCode.ARROW_UP ||
            keyCode === KeyCode.ARROW_DOWN
        );
    }
}
