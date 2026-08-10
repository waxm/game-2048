import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Sprite,
    UITransform,
} from "cc";
import { SpriteSkinBinding } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";

const { ccclass, property } = _decorator;

/** 启动场景视图，负责展示品牌、加载进度与可恢复失败状态。 */
@ccclass("BootSceneView")
export class BootSceneView extends Component {
    /** 2048 通用图片资源根路径。 */
    private static readonly UI_TEXTURE_ROOT =
        "textures/common/generated-ui";

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

    /** 当前启动视图持有的图片皮肤与资源句柄。 */
    private readonly _skin = new SpriteSkinBinding();

    /** 进度条图片组件，资源加载完成前允许为空。 */
    private _progressSprite: Sprite | null = null;

    /** 当前归一化启动进度。 */
    private _progress = 0;

    /** 当前是否展示启动失败状态。 */
    private _failed = false;

    /** Cocos 生命周期：校验显式绑定并绘制固定启动背景。 */
    protected onLoad(): void {
        this.assertBindings();
        const transform = this.node.getComponent(UITransform);
        if (!transform) {
            throw new Error("启动视图宿主节点缺少 UITransform。");
        }
        const progressTransform =
            this.progressGraphics!.node.getComponent(UITransform);
        if (!progressTransform) {
            throw new Error("启动进度节点缺少 UITransform。");
        }
        progressTransform.setContentSize(440, 18);
        progressTransform.setAnchorPoint(0, 0.5);
        this.progressGraphics!.node.setPosition(-220, -220, 0);
        void this.applyGeneratedSkin();
        this.showLoading(0);
    }

    /** 显示当前启动进度并隐藏重试入口。 */
    public showLoading(progress: number): void {
        const normalizedProgress = Math.max(0, Math.min(1, progress));
        this._progress = normalizedProgress;
        this._failed = false;
        this.retryNode!.active = false;
        this.statusLabel!.string =
            normalizedProgress < 0.3
                ? "正在初始化核心模块"
                : normalizedProgress < 0.82
                  ? "正在准备 2048 大厅"
                  : "即将进入大厅";
        this.percentLabel!.string = `${Math.round(normalizedProgress * 100)}%`;
        this.refreshProgressSprite();
    }

    /** 显示进入大厅失败状态与重试入口。 */
    public showFailure(): void {
        this._progress = 1;
        this._failed = true;
        this.statusLabel!.string = "大厅加载失败，请重试";
        this.percentLabel!.string = "!";
        this.retryNode!.active = true;
        this.refreshProgressSprite();
    }

    /** 清空程序化画布，供场景退出时幂等释放显示状态。 */
    public clear(): void {
        this.backgroundGraphics?.clear();
        this.progressGraphics?.clear();
    }

    /** 节点销毁时归还启动图片资源。 */
    protected onDestroy(): void {
        this._skin.release();
        this._progressSprite = null;
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

    /** 应用启动背景、九宫进度填充和重试按钮图片。 */
    private async applyGeneratedSkin(): Promise<void> {
        const root = BootSceneView.UI_TEXTURE_ROOT;
        try {
            const [, progressSprite] = await Promise.all([
                this._skin.apply(
                    this.backgroundGraphics!,
                    `${root}/boot_composite/spriteFrame`,
                    { fitVisibleWidth: true },
                ),
                this._skin.apply(
                    this.progressGraphics!,
                    `${root}/progress_fill/spriteFrame`,
                    {
                        sliced: true,
                        insets: { left: 18, right: 18, top: 8, bottom: 8 },
                        anchor: [0, 0.5],
                    },
                ),
                this._skin.applyNode(
                    this.retryNode!,
                    null,
                    `${root}/button_primary/spriteFrame`,
                    {
                        sliced: true,
                        insets: { left: 42, right: 42, top: 28, bottom: 28 },
                    },
                ),
            ]);
            this._progressSprite = progressSprite;
            this.refreshProgressSprite();
        } catch (error) {
            Logger.error("2048 启动图片皮肤加载失败。", error);
        }
    }

    /** 按当前进度和失败状态刷新图片填充。 */
    private refreshProgressSprite(): void {
        this.progressGraphics!.node.setScale(
            Math.max(0.04, this._progress),
            1,
            1,
        );
        if (this._progressSprite) {
            this._progressSprite.color = this._failed
                ? new Color(255, 125, 112, 255)
                : Color.WHITE;
        }
    }
}
