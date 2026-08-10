import { _decorator, Color, Component, Graphics, Label } from "cc";
import { SpriteSkinBinding } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import type { Game2048AvatarDefinition } from "../../game/game2048/Game2048AvatarCatalog";

const { ccclass, property } = _decorator;

/** 以纯图形方式展示 2048 冷色头像。 */
@ccclass("Game2048AvatarRenderer")
export class Game2048AvatarRenderer extends Component {
    /** 2048 通用图片资源根路径。 */
    private static readonly UI_TEXTURE_ROOT =
        "textures/common/generated-ui";

    /** 头像圆形底板和选中描边。 */
    @property(Graphics)
    public graphics: Graphics | null = null;

    /** 头像中央数字符号。 */
    @property(Label)
    public symbolLabel: Label | null = null;

    /** 当前头像持有的图片皮肤与资源句柄。 */
    private readonly _skin = new SpriteSkinBinding();

    /** Cocos 生命周期：校验 Prefab 中的显式绑定。 */
    protected onLoad(): void {
        if (!this.graphics || !this.symbolLabel) {
            throw new Error(
                `2048 头像渲染器节点未绑定：${this.node.name}.graphics、symbolLabel`,
            );
        }
    }

    /** 按目录定义切换头像图片，并可显示冰青色选中描边。 */
    public render(
        avatar: Game2048AvatarDefinition,
        diameter: number,
        selected = false,
    ): void {
        if (!this.graphics || !this.symbolLabel) {
            throw new Error(`2048 头像渲染器尚未完成绑定：${this.node.name}`);
        }
        const [red, green, blue] = avatar.color;
        const file = selected ? "avatar_frame_selected" : "avatar_frame";
        void this._skin
            .apply(
                this.graphics,
                `${Game2048AvatarRenderer.UI_TEXTURE_ROOT}/${file}/spriteFrame`,
                { color: new Color(red, green, blue, 255) },
            )
            .catch((error) => {
                Logger.error(`2048 头像图片加载失败：${avatar.id}`, error);
            });
        this.symbolLabel.string = avatar.symbol;
        this.symbolLabel.fontSize = Math.round(diameter * 0.35);
        this.symbolLabel.lineHeight = Math.round(diameter * 0.48);
    }

    /** 节点销毁时归还头像图片资源。 */
    protected onDestroy(): void {
        this._skin.release();
    }
}
