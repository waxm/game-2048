import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    UITransform,
} from "cc";

const { ccclass, property } = _decorator;

/** 启动场景视图，负责展示品牌、加载进度与可恢复失败状态。 */
@ccclass("BootSceneView")
export class BootSceneView extends Component {
    /** 启动背景与品牌图形画布。 */
    @property(Graphics)
    public backgroundGraphics: Graphics | null = null;

    /** 启动进度条画布。 */
    @property(Graphics)
    public progressGraphics: Graphics | null = null;

    /** 当前启动阶段文本。 */
    @property(Label)
    public statusLabel: Label | null = null;

    /** 当前启动进度百分比文本。 */
    @property(Label)
    public percentLabel: Label | null = null;

    /** 加载失败后显示的重试节点。 */
    @property(Node)
    public retryNode: Node | null = null;

    /** 当前设计画布宽度。 */
    private _viewWidth = 640;

    /** 当前设计画布高度。 */
    private _viewHeight = 1136;

    /** Cocos 生命周期：校验显式绑定并绘制固定启动背景。 */
    protected onLoad(): void {
        this.assertBindings();
        const transform = this.node.getComponent(UITransform);
        if (!transform) {
            throw new Error("启动视图宿主节点缺少 UITransform。");
        }
        this._viewWidth = transform.contentSize.width;
        this._viewHeight = transform.contentSize.height;
        this.drawBackground();
        this.showLoading(0);
    }

    /** 显示当前启动进度并隐藏重试入口。 */
    public showLoading(progress: number): void {
        const normalizedProgress = Math.max(0, Math.min(1, progress));
        this.retryNode!.active = false;
        this.statusLabel!.string =
            normalizedProgress < 0.3
                ? "正在初始化核心模块"
                : normalizedProgress < 0.82
                  ? "正在准备 2048 大厅"
                  : "即将进入大厅";
        this.percentLabel!.string = `${Math.round(normalizedProgress * 100)}%`;
        this.drawProgress(normalizedProgress, false);
    }

    /** 显示进入大厅失败状态与重试入口。 */
    public showFailure(): void {
        this.statusLabel!.string = "大厅加载失败，请重试";
        this.percentLabel!.string = "!";
        this.retryNode!.active = true;
        this.drawProgress(1, true);
    }

    /** 清空程序化画布，供场景退出时幂等释放显示状态。 */
    public clear(): void {
        this.backgroundGraphics?.clear();
        this.progressGraphics?.clear();
    }

    /** 校验启动视图全部 Inspector 必填引用。 */
    private assertBindings(): void {
        const bindings: ReadonlyArray<readonly [string, unknown]> = [
            ["backgroundGraphics", this.backgroundGraphics],
            ["progressGraphics", this.progressGraphics],
            ["statusLabel", this.statusLabel],
            ["percentLabel", this.percentLabel],
            ["retryNode", this.retryNode],
        ];
        const missingNames = bindings
            .filter(([, value]) => value === null || value === undefined)
            .map(([name]) => name);
        if (missingNames.length > 0) {
            throw new Error(
                `启动视图 Inspector 绑定缺失：${missingNames.join("、")}`,
            );
        }
    }

    /** 绘制适配 640 x 1136 的启动背景、光晕和 2048 方块标识。 */
    private drawBackground(): void {
        const graphics = this.backgroundGraphics!;
        graphics.clear();
        graphics.fillColor = new Color(5, 9, 20, 255);
        graphics.rect(
            -this._viewWidth * 0.5,
            -this._viewHeight * 0.5,
            this._viewWidth,
            this._viewHeight,
        );
        graphics.fill();

        graphics.fillColor = new Color(21, 32, 57, 255);
        graphics.circle(0, 84, 252);
        graphics.fill();
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(87, 113, 155, 180);
        graphics.circle(0, 84, 252);
        graphics.stroke();

        const tileColors = [
            new Color(238, 228, 218, 255),
            new Color(242, 177, 121, 255),
            new Color(246, 124, 95, 255),
            new Color(108, 92, 231, 255),
        ];
        const tilePositions = [
            { x: -102, y: 126 },
            { x: 0, y: 126 },
            { x: -102, y: 24 },
            { x: 0, y: 24 },
        ];
        for (let index = 0; index < tilePositions.length; index += 1) {
            const position = tilePositions[index];
            graphics.fillColor = tileColors[index];
            graphics.roundRect(position.x, position.y, 88, 88, 18);
            graphics.fill();
        }
    }

    /** 绘制加载轨道与当前进度，失败时使用醒目的暖色反馈。 */
    private drawProgress(progress: number, failed: boolean): void {
        const graphics = this.progressGraphics!;
        graphics.clear();
        graphics.fillColor = new Color(31, 43, 66, 255);
        graphics.roundRect(-220, -220, 440, 18, 9);
        graphics.fill();

        const width = Math.max(18, 440 * progress);
        graphics.fillColor = failed
            ? new Color(246, 124, 95, 255)
            : new Color(108, 92, 231, 255);
        graphics.roundRect(-220, -220, width, 18, 9);
        graphics.fill();

        if (failed) {
            graphics.fillColor = new Color(108, 92, 231, 255);
            graphics.roundRect(-130, -385, 260, 70, 22);
            graphics.fill();
            graphics.lineWidth = 2;
            graphics.strokeColor = new Color(157, 146, 255, 235);
            graphics.roundRect(-130, -385, 260, 70, 22);
            graphics.stroke();
        }
    }
}
