import { _decorator, Color, Component, Graphics, Label } from "cc";
import type { Game2048AvatarDefinition } from "../../game/game2048/Game2048AvatarCatalog";

const { ccclass, property } = _decorator;

/** 以纯图形方式展示 2048 冷色头像。 */
@ccclass("Game2048AvatarRenderer")
export class Game2048AvatarRenderer extends Component {
    /** 头像圆形底板和选中描边。 */
    @property(Graphics)
    public graphics: Graphics | null = null;

    /** 头像中央数字符号。 */
    @property(Label)
    public symbolLabel: Label | null = null;

    /** Cocos 生命周期：校验 Prefab 中的显式绑定。 */
    protected onLoad(): void {
        if (!this.graphics || !this.symbolLabel) {
            throw new Error(
                `2048 头像渲染器节点未绑定：${this.node.name}.graphics、symbolLabel`,
            );
        }
    }

    /** 按目录定义绘制头像，并可显示冰青色选中描边。 */
    public render(
        avatar: Game2048AvatarDefinition,
        diameter: number,
        selected = false,
    ): void {
        if (!this.graphics || !this.symbolLabel) {
            throw new Error(`2048 头像渲染器尚未完成绑定：${this.node.name}`);
        }
        const radius = diameter * 0.5;
        const [red, green, blue] = avatar.color;
        this.graphics.clear();
        this.graphics.fillColor = new Color(red, green, blue, 255);
        this.graphics.circle(0, 0, radius);
        this.graphics.fill();
        if (selected) {
            this.graphics.lineWidth = 5;
            this.graphics.strokeColor = new Color(118, 232, 238, 255);
            this.graphics.circle(0, 0, Math.max(1, radius - 3));
            this.graphics.stroke();
        }
        this.symbolLabel.string = avatar.symbol;
        this.symbolLabel.fontSize = Math.round(diameter * 0.35);
        this.symbolLabel.lineHeight = Math.round(diameter * 0.48);
    }
}
