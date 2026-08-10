import { _decorator, Component, Graphics, Label } from "cc";
import { SpriteSkinBinding } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import { getGame2048Avatar } from "../../game/game2048/Game2048AvatarCatalog";
import type { Game2048ProfileData } from "../../game/game2048/Game2048ProfileManager";
import { Game2048AvatarRenderer } from "./Game2048AvatarRenderer";

const { ccclass, property } = _decorator;

/** 2048 大厅视图，负责固定主题图形和场景跳转状态展示。 */
@ccclass("LobbySceneView")
export class LobbySceneView extends Component {
    /** 2048 通用图片资源根路径。 */
    private static readonly UI_TEXTURE_ROOT =
        "textures/common/generated-ui";

    /** 大厅背景、装饰数字块和开始按钮背景画布。 */
    @property(Graphics)
    public backgroundGraphics: Graphics | null = null;

    /** 大厅底部状态提示。 */
    @property(Label)
    public statusLabel: Label | null = null;

    /** 开始按钮文字。 */
    @property(Label)
    public startLabel: Label | null = null;

    /** 大厅左上玩家昵称。 */
    @property(Label)
    public playerNameLabel: Label | null = null;

    /** 大厅左上当前玩家头像。 */
    @property(Game2048AvatarRenderer)
    public playerAvatarRenderer: Game2048AvatarRenderer | null = null;

    /** 当前大厅持有的图片皮肤与资源句柄。 */
    private readonly _skin = new SpriteSkinBinding();

    /** Cocos 生命周期：校验显式绑定并绘制大厅静态视觉。 */
    protected onLoad(): void {
        this.assertBindings();
        void this.applyGeneratedSkin();
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

    /** 显示经过版本化服务校验的本地玩家资料。 */
    public showProfile(profile: Game2048ProfileData): void {
        this.playerNameLabel!.string = profile.name;
        this.playerAvatarRenderer!.render(
            getGame2048Avatar(profile.avatarId),
            64,
            false,
        );
    }

    /** 清空大厅程序化画布，供场景退出时幂等清理。 */
    public clear(): void {
        this.backgroundGraphics?.clear();
    }

    /** 节点销毁时归还大厅图片资源。 */
    protected onDestroy(): void {
        this._skin.release();
    }

    /** 校验大厅视图全部 Inspector 必填引用。 */
    private assertBindings(): void {
        const bindings: ReadonlyArray<readonly [string, unknown]> = [
            ["backgroundGraphics", this.backgroundGraphics],
            ["statusLabel", this.statusLabel],
            ["startLabel", this.startLabel],
            ["playerNameLabel", this.playerNameLabel],
            ["playerAvatarRenderer", this.playerAvatarRenderer],
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

    /** 应用已按大厅交互位置合成的竞技主题图片。 */
    private async applyGeneratedSkin(): Promise<void> {
        try {
            await this._skin.apply(
                this.backgroundGraphics!,
                `${LobbySceneView.UI_TEXTURE_ROOT}/lobby_composite/spriteFrame`,
                { fitVisibleWidth: true },
            );
        } catch (error) {
            Logger.error("2048 大厅图片皮肤加载失败。", error);
        }
    }
}
