import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    UITransform,
} from "cc";

const { ccclass, property } = _decorator;

/** 2048 大厅视图，负责固定主题图形和场景跳转状态展示。 */
@ccclass("LobbySceneView")
export class LobbySceneView extends Component {
    /** 大厅背景、装饰数字块和开始按钮背景画布。 */
    @property(Graphics)
    public backgroundGraphics: Graphics | null = null;

    /** 大厅底部状态提示。 */
    @property(Label)
    public statusLabel: Label | null = null;

    /** 开始按钮文字。 */
    @property(Label)
    public startLabel: Label | null = null;

    /** 当前设计画布宽度。 */
    private _viewWidth = 640;

    /** 当前设计画布高度。 */
    private _viewHeight = 1136;

    /** Cocos 生命周期：校验显式绑定并绘制大厅静态视觉。 */
    protected onLoad(): void {
        this.assertBindings();
        const transform = this.node.getComponent(UITransform);
        if (!transform) {
            throw new Error("大厅视图宿主节点缺少 UITransform。");
        }
        this._viewWidth = transform.contentSize.width;
        this._viewHeight = transform.contentSize.height;
        this.drawBackground();
        this.showReady();
    }

    /** 恢复大厅可开始状态。 */
    public showReady(): void {
        this.startLabel!.string = "开始游戏";
        this.statusLabel!.string = "滑动或 WASD 控制方向 · 相同数字自动合并";
    }

    /** 显示正在进入游戏状态。 */
    public showLoading(): void {
        this.startLabel!.string = "正在进入...";
        this.statusLabel!.string = "圆形竞技场准备中";
    }

    /** 显示游戏场景加载失败后的可恢复状态。 */
    public showFailure(): void {
        this.startLabel!.string = "重新进入";
        this.statusLabel!.string = "游戏加载失败，请再次尝试";
    }

    /** 清空大厅程序化画布，供场景退出时幂等清理。 */
    public clear(): void {
        this.backgroundGraphics?.clear();
    }

    /** 校验大厅视图全部 Inspector 必填引用。 */
    private assertBindings(): void {
        const bindings: ReadonlyArray<readonly [string, unknown]> = [
            ["backgroundGraphics", this.backgroundGraphics],
            ["statusLabel", this.statusLabel],
            ["startLabel", this.startLabel],
        ];
        const missingNames = bindings
            .filter(([, value]) => value === null || value === undefined)
            .map(([name]) => name);
        if (missingNames.length > 0) {
            throw new Error(
                `大厅视图 Inspector 绑定缺失：${missingNames.join("、")}`,
            );
        }
    }

    /** 绘制圆形竞技场预览、数字块、规则卡片和开始按钮背景。 */
    private drawBackground(): void {
        const graphics = this.backgroundGraphics!;
        graphics.clear();
        graphics.fillColor = new Color(4, 8, 18, 255);
        graphics.rect(
            -this._viewWidth * 0.5,
            -this._viewHeight * 0.5,
            this._viewWidth,
            this._viewHeight,
        );
        graphics.fill();

        graphics.fillColor = new Color(12, 20, 36, 255);
        graphics.circle(0, 116, 290);
        graphics.fill();
        graphics.lineWidth = 4;
        graphics.strokeColor = new Color(95, 121, 161, 220);
        graphics.circle(0, 116, 290);
        graphics.stroke();

        graphics.fillColor = new Color(43, 59, 83, 180);
        for (let x = -228; x <= 228; x += 76) {
            for (let y = -76; y <= 304; y += 76) {
                if (x * x + (y - 116) * (y - 116) <= 250 * 250) {
                    graphics.circle(x, y, 2.5);
                    graphics.fill();
                }
            }
        }

        const tiles = [
            { x: -148, y: 76, color: new Color(238, 228, 218, 255) },
            { x: -58, y: 76, color: new Color(237, 224, 200, 255) },
            { x: 32, y: 76, color: new Color(242, 177, 121, 255) },
            { x: 122, y: 76, color: new Color(245, 149, 99, 255) },
        ];
        for (const tile of tiles) {
            graphics.fillColor = tile.color;
            graphics.roundRect(tile.x, tile.y, 72, 72, 14);
            graphics.fill();
        }

        graphics.fillColor = new Color(17, 26, 45, 245);
        graphics.roundRect(-268, -292, 536, 120, 26);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(62, 82, 113, 240);
        graphics.roundRect(-268, -292, 536, 120, 26);
        graphics.stroke();

        graphics.fillColor = new Color(108, 92, 231, 255);
        graphics.roundRect(-190, -426, 380, 88, 26);
        graphics.fill();
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(157, 146, 255, 235);
        graphics.roundRect(-190, -426, 380, 88, 26);
        graphics.stroke();
    }
}
