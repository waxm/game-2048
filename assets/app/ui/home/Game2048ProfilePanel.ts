import {
    _decorator,
    Button,
    Color,
    EditBox,
    Graphics,
    Label,
    Node,
} from "cc";
import { PoolManager } from "../../core/pool/PoolManager";
import { UIBase } from "../../core/ui/UIBase";
import { UIManager } from "../../core/ui/UIManager";
import { Logger } from "../../core/utils/Logger";
import {
    GAME2048_AVATAR_CATALOG,
    getGame2048Avatar,
} from "../../game/game2048/Game2048AvatarCatalog";
import {
    GAME2048_HOME_POOL_NAME,
    GAME2048_HOME_RESOURCE_PATH,
    GAME2048_HOME_UI_NAME,
} from "../../game/game2048/Game2048HomeKey";
import {
    GAME2048_PROFILE_NAME_MAX_LENGTH,
    Game2048ProfileData,
    Game2048ProfileManager,
} from "../../game/game2048/Game2048ProfileManager";
import { Game2048SettingsManager } from "../../game/game2048/Game2048SettingsManager";
import { Game2048AvatarRenderer } from "./Game2048AvatarRenderer";
import {
    Game2048AvatarItem,
    Game2048AvatarItemData,
} from "./Game2048AvatarItem";

const { ccclass, property } = _decorator;

/** 2048 玩家名称与头像选择弹窗。 */
@ccclass("Game2048ProfilePanel")
export class Game2048ProfilePanel extends UIBase {
    /** 全屏半透明输入遮罩。 */
    @property(Graphics)
    public overlayGraphics: Graphics | null = null;

    /** 资料弹窗冷色底板。 */
    @property(Graphics)
    public panelGraphics: Graphics | null = null;

    /** 关闭按钮。 */
    @property(Button)
    public closeButton: Button | null = null;

    /** 关闭按钮图形。 */
    @property(Graphics)
    public closeButtonGraphics: Graphics | null = null;

    /** 当前头像渲染器。 */
    @property(Game2048AvatarRenderer)
    public currentAvatarRenderer: Game2048AvatarRenderer | null = null;

    /** 当前玩家名称的常驻展示，避免输入框未聚焦时信息缺失。 */
    @property(Label)
    public currentNameLabel: Label | null = null;

    /** 玩家名称输入框。 */
    @property(EditBox)
    public nameEditBox: EditBox | null = null;

    /** 输入框未编辑时常驻显示的玩家名称。 */
    @property(Label)
    public nameInputDisplayLabel: Label | null = null;

    /** 玩家名称输入框底板。 */
    @property(Graphics)
    public nameInputGraphics: Graphics | null = null;

    /** 保存名称按钮。 */
    @property(Button)
    public saveNameButton: Button | null = null;

    /** 保存名称按钮背景。 */
    @property(Graphics)
    public saveNameGraphics: Graphics | null = null;

    /** 动态头像列表的显式父节点。 */
    @property(Node)
    public avatarListContent: Node | null = null;

    /** 保存和加载反馈。 */
    @property(Label)
    public feedbackLabel: Label | null = null;

    /** 当前借出的头像列表节点。 */
    private readonly _avatarItemNodes: Node[] = [];

    /** 是否已经注册固定按钮事件。 */
    private _eventsBound = false;

    /** 当前面板代次，用于丢弃关闭后的对象池异步结果。 */
    private _openGeneration = 0;

    /** Cocos 生命周期：校验绑定、绘制固定外观并注册按钮。 */
    protected onLoad(): void {
        this.assertRequiredBindings({
            overlayGraphics: this.overlayGraphics,
            panelGraphics: this.panelGraphics,
            closeButton: this.closeButton,
            closeButtonGraphics: this.closeButtonGraphics,
            currentAvatarRenderer: this.currentAvatarRenderer,
            currentNameLabel: this.currentNameLabel,
            nameEditBox: this.nameEditBox,
            nameInputDisplayLabel: this.nameInputDisplayLabel,
            nameInputGraphics: this.nameInputGraphics,
            saveNameButton: this.saveNameButton,
            saveNameGraphics: this.saveNameGraphics,
            avatarListContent: this.avatarListContent,
            feedbackLabel: this.feedbackLabel,
        });
        this.nameEditBox!.maxLength = GAME2048_PROFILE_NAME_MAX_LENGTH;
        this.drawStaticView();
        this.bindEvents();
    }

    /** 打开时加载当前资料，并异步准备可复用头像项。 */
    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        const generation = ++this._openGeneration;
        this.feedbackLabel!.string = "点击头像立即切换，名称修改后请保存";
        this.refreshProfile(Game2048ProfileManager.getProfile());
        this.bindEvents();
        void this.prepareAvatarList(generation);
    }

    /** 关闭时回收列表项、注销事件并使旧异步请求失效。 */
    protected onClose(): void {
        this._openGeneration += 1;
        this.unbindEvents();
        this.recycleAvatarItems();
        super.onClose();
    }

    /** 绘制遮罩、资料底板和操作按钮。 */
    private drawStaticView(): void {
        this.drawRoundedRect(
            this.overlayGraphics!,
            -320,
            -568,
            640,
            1136,
            0,
            new Color(2, 8, 23, 210),
        );
        this.drawRoundedRect(
            this.panelGraphics!,
            -270,
            -455,
            540,
            910,
            32,
            new Color(11, 25, 49, 255),
        );
        this.panelGraphics!.lineWidth = 2;
        this.panelGraphics!.strokeColor = new Color(42, 157, 191, 180);
        this.panelGraphics!.roundRect(-270, -455, 540, 910, 32);
        this.panelGraphics!.stroke();
        this.panelGraphics!.fillColor = new Color(18, 41, 72, 255);
        this.panelGraphics!.roundRect(-222, 210, 444, 140, 22);
        this.panelGraphics!.fill();
        this.panelGraphics!.lineWidth = 1;
        this.panelGraphics!.strokeColor = new Color(42, 157, 191, 70);
        this.panelGraphics!.moveTo(-170, -390);
        this.panelGraphics!.lineTo(170, -390);
        this.panelGraphics!.stroke();
        this.drawRoundedRect(
            this.closeButtonGraphics!,
            -28,
            -28,
            56,
            56,
            28,
            new Color(32, 57, 91, 255),
        );
        this.drawRoundedRect(
            this.nameInputGraphics!,
            -150,
            -32,
            300,
            64,
            12,
            new Color(25, 48, 80, 255),
        );
        this.drawRoundedRect(
            this.saveNameGraphics!,
            -64,
            -32,
            128,
            64,
            14,
            new Color(42, 157, 191, 255),
        );
    }

    /** 使用指定 Graphics 绘制单色圆角矩形。 */
    private drawRoundedRect(
        graphics: Graphics,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number,
        color: Color,
    ): void {
        graphics.clear();
        graphics.fillColor = color;
        graphics.roundRect(x, y, width, height, radius);
        graphics.fill();
    }

    /** 刷新当前头像和名称输入框。 */
    private refreshProfile(profile: Game2048ProfileData): void {
        this.currentAvatarRenderer!.render(
            getGame2048Avatar(profile.avatarId),
            92,
            false,
        );
        this.currentNameLabel!.string = profile.name;
        this.nameInputDisplayLabel!.string = profile.name;
        this.nameInputDisplayLabel!.node.active = true;
        const editBox = this.nameEditBox!;
        editBox.string = profile.name;
        if (editBox.textLabel) {
            editBox.textLabel.string = profile.name;
            editBox.textLabel.node.active = true;
        }
    }

    /** 创建头像对象池并渲染完整选择目录。 */
    private async prepareAvatarList(generation: number): Promise<void> {
        try {
            if (!PoolManager.has(GAME2048_HOME_POOL_NAME.AvatarItem)) {
                await PoolManager.create(GAME2048_HOME_POOL_NAME.AvatarItem, {
                    prefabPath: GAME2048_HOME_RESOURCE_PATH.AvatarItemPrefab,
                    initialSize: GAME2048_AVATAR_CATALOG.length,
                    maxSize: GAME2048_AVATAR_CATALOG.length,
                    lifecycleComponent: Game2048AvatarItem,
                });
            }
            if (
                !this.isOpened ||
                generation !== this._openGeneration ||
                !this.node.isValid
            ) {
                return;
            }
            this.renderAvatarItems();
        } catch (error) {
            if (
                !this.isOpened ||
                generation !== this._openGeneration ||
                !this.node.isValid
            ) {
                return;
            }
            this.feedbackLabel!.string = "头像列表加载失败，请重新打开";
            Logger.error("2048 头像列表对象池准备失败。", error);
        }
    }

    /** 从对象池取出头像项并加入显式列表容器。 */
    private renderAvatarItems(): void {
        this.recycleAvatarItems();
        const profile = Game2048ProfileManager.getProfile();
        GAME2048_AVATAR_CATALOG.forEach((avatar, index) => {
            const data: Game2048AvatarItemData = {
                avatar,
                selected: avatar.id === profile.avatarId,
                onSelect: this.onAvatarSelected,
            };
            const node = PoolManager.get(
                GAME2048_HOME_POOL_NAME.AvatarItem,
                data,
            );
            if (!node) {
                throw new Error(`无法取得 2048 头像列表项：${avatar.id}`);
            }
            node.setParent(this.avatarListContent!);
            const column = index % 3;
            const row = Math.floor(index / 3);
            node.setPosition(-150 + column * 150, 85 - row * 170, 0);
            this._avatarItemNodes.push(node);
        });
    }

    /** 将本面板借出的全部头像项归还对象池。 */
    private recycleAvatarItems(): void {
        while (this._avatarItemNodes.length > 0) {
            const node = this._avatarItemNodes.pop()!;
            PoolManager.put(GAME2048_HOME_POOL_NAME.AvatarItem, node);
        }
    }

    /** 幂等注册关闭和保存名称按钮。 */
    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }
        this._eventsBound = true;
        this.closeButton!.node.on(
            Button.EventType.CLICK,
            this.onCloseClick,
            this,
        );
        this.saveNameButton!.node.on(
            Button.EventType.CLICK,
            this.onSaveNameClick,
            this,
        );
        this.nameEditBox!.node.on(
            EditBox.EventType.EDITING_DID_BEGAN,
            this.onNameEditingBegan,
            this,
        );
        this.nameEditBox!.node.on(
            EditBox.EventType.TEXT_CHANGED,
            this.onNameTextChanged,
            this,
        );
        this.nameEditBox!.node.on(
            EditBox.EventType.EDITING_DID_ENDED,
            this.onNameEditingEnded,
            this,
        );
    }

    /** 幂等注销关闭和保存名称按钮。 */
    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }
        this._eventsBound = false;
        this.closeButton!.node.off(
            Button.EventType.CLICK,
            this.onCloseClick,
            this,
        );
        this.saveNameButton!.node.off(
            Button.EventType.CLICK,
            this.onSaveNameClick,
            this,
        );
        this.nameEditBox!.node.off(
            EditBox.EventType.EDITING_DID_BEGAN,
            this.onNameEditingBegan,
            this,
        );
        this.nameEditBox!.node.off(
            EditBox.EventType.TEXT_CHANGED,
            this.onNameTextChanged,
            this,
        );
        this.nameEditBox!.node.off(
            EditBox.EventType.EDITING_DID_ENDED,
            this.onNameEditingEnded,
            this,
        );
    }

    /** 开始编辑时让原生输入层负责显示文本，避免重复文字。 */
    private onNameEditingBegan(): void {
        this.nameInputDisplayLabel!.node.active = false;
    }

    /** 编辑过程中同步常驻名称，结束编辑后可以立即恢复。 */
    private onNameTextChanged(): void {
        this.nameInputDisplayLabel!.string = this.nameEditBox!.string;
    }

    /** 结束编辑时恢复 Cocos 常驻文字，保证未聚焦状态仍可见。 */
    private onNameEditingEnded(): void {
        this.onNameTextChanged();
        this.nameInputDisplayLabel!.node.active = true;
    }

    /** 关闭当前资料弹窗。 */
    private onCloseClick(): void {
        UIManager.close(GAME2048_HOME_UI_NAME.Profile);
    }

    /** 校验并保存玩家名称。 */
    private onSaveNameClick(): void {
        try {
            const profile = Game2048ProfileManager.setName(
                this.nameEditBox!.string,
            );
            this.refreshProfile(profile);
            this.feedbackLabel!.string = "名称已保存";
            Game2048SettingsManager.vibrate();
        } catch (error) {
            this.feedbackLabel!.string = "请输入有效名称";
            Logger.warn("2048 玩家名称保存失败。", error);
        }
    }

    /** 选择头像、持久化并刷新列表选中态。 */
    private onAvatarSelected = (avatarId: string): void => {
        try {
            const profile = Game2048ProfileManager.selectAvatar(avatarId);
            this.refreshProfile(profile);
            this.renderAvatarItems();
            this.feedbackLabel!.string = "头像已更新";
            Game2048SettingsManager.vibrate();
        } catch (error) {
            this.feedbackLabel!.string = "头像选择失败";
            Logger.error(`2048 头像选择失败：${avatarId}`, error);
        }
    };
}
