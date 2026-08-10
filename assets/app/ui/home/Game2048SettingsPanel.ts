import { _decorator, Button, Color, Graphics, Label } from "cc";
import {
    SpriteSkinBinding,
    UIBase,
} from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import { UIManager } from "../../core/ui/UIManager";
import { GAME2048_HOME_UI_NAME } from "../../game/game2048/Game2048HomeKey";
import { Game2048SettingsManager } from "../../game/game2048/Game2048SettingsManager";

const { ccclass, property } = _decorator;

/** 2048 冷色设置面板，负责声音和震动开关的展示与操作。 */
@ccclass("Game2048SettingsPanel")
export class Game2048SettingsPanel extends UIBase {
    /** 2048 通用图片资源根路径。 */
    private static readonly UI_TEXTURE_ROOT =
        "textures/common/generated-ui";

    /** 绘制半透明遮罩、底部卡片、分隔线和开关背景的画布。 */
    @property(Graphics)
    public panelGraphics: Graphics | null = null;

    /** 声音开关按钮。 */
    @property(Button)
    public soundButton: Button | null = null;

    /** 震动开关按钮。 */
    @property(Button)
    public vibrationButton: Button | null = null;

    /** 面板右上关闭按钮。 */
    @property(Button)
    public closeButton: Button | null = null;

    /** 点击弹层外部时关闭面板的遮罩按钮。 */
    @property(Button)
    public backdropButton: Button | null = null;

    /** 声音当前开关文字。 */
    @property(Label)
    public soundStateLabel: Label | null = null;

    /** 震动当前开关文字。 */
    @property(Label)
    public vibrationStateLabel: Label | null = null;

    /** 是否已经绑定按钮监听。 */
    private _eventsBound = false;

    /** 当前设置弹窗持有的图片皮肤与资源句柄。 */
    private readonly _skin = new SpriteSkinBinding();

    /** Cocos 生命周期：校验 Prefab 显式绑定并注册按钮事件。 */
    protected onLoad(): void {
        this.assertRequiredBindings({
            panelGraphics: this.panelGraphics,
            soundButton: this.soundButton,
            vibrationButton: this.vibrationButton,
            closeButton: this.closeButton,
            backdropButton: this.backdropButton,
            soundStateLabel: this.soundStateLabel,
            vibrationStateLabel: this.vibrationStateLabel,
        });
        this.bindEvents();
    }

    /** 面板打开时从版本化存档恢复状态。 */
    protected onOpen(): void {
        this.refreshView();
        this.bindEvents();
    }

    /** 面板关闭时注销输入监听，缓存再次打开时重新注册。 */
    protected onClose(): void {
        this.unbindEvents();
    }

    /** 组件销毁时兜底移除节点事件。 */
    protected onDestroy(): void {
        this.unbindEvents();
        this._skin.release();
        super.onDestroy();
    }

    /** 幂等注册四个按钮的点击事件。 */
    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }
        this._eventsBound = true;
        this.soundButton!.node.on(
            Button.EventType.CLICK,
            this.toggleSound,
            this,
        );
        this.vibrationButton!.node.on(
            Button.EventType.CLICK,
            this.toggleVibration,
            this,
        );
        this.closeButton!.node.on(
            Button.EventType.CLICK,
            this.closePanel,
            this,
        );
        this.backdropButton!.node.on(
            Button.EventType.CLICK,
            this.closePanel,
            this,
        );
    }

    /** 幂等注销全部按钮事件。 */
    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }
        this._eventsBound = false;
        this.soundButton?.node?.off(
            Button.EventType.CLICK,
            this.toggleSound,
            this,
        );
        this.vibrationButton?.node?.off(
            Button.EventType.CLICK,
            this.toggleVibration,
            this,
        );
        this.closeButton?.node?.off(
            Button.EventType.CLICK,
            this.closePanel,
            this,
        );
        this.backdropButton?.node?.off(
            Button.EventType.CLICK,
            this.closePanel,
            this,
        );
    }

    /** 切换声音状态并立即同步音频服务和版本化存档。 */
    private toggleSound(): void {
        const settings = Game2048SettingsManager.getSettings();
        Game2048SettingsManager.setSoundEnabled(!settings.soundEnabled);
        this.refreshView();
    }

    /** 切换震动状态并在开启时请求一次预览反馈。 */
    private toggleVibration(): void {
        const settings = Game2048SettingsManager.getSettings();
        Game2048SettingsManager.setVibrationEnabled(
            !settings.vibrationEnabled,
        );
        this.refreshView();
    }

    /** 通过 UIManager 关闭当前缓存面板并完整执行 UIBase 生命周期。 */
    private closePanel(): void {
        UIManager.close(GAME2048_HOME_UI_NAME.Settings);
    }

    /** 刷新两个开关文字和冷色背景。 */
    private refreshView(): void {
        const settings = Game2048SettingsManager.getSettings();
        this.soundStateLabel!.string = settings.soundEnabled
            ? "已开启"
            : "已关闭";
        this.vibrationStateLabel!.string = settings.vibrationEnabled
            ? "已开启"
            : "已关闭";
        this.soundStateLabel!.color = settings.soundEnabled
            ? new Color(112, 218, 228, 255)
            : new Color(143, 158, 184, 255);
        this.vibrationStateLabel!.color = settings.vibrationEnabled
            ? new Color(112, 218, 228, 255)
            : new Color(143, 158, 184, 255);
        void this.applyGeneratedSkin(
            settings.soundEnabled,
            settings.vibrationEnabled,
        );
    }

    /** 按两个开关状态切换预合成的底部设置面板图片。 */
    private async applyGeneratedSkin(
        soundEnabled: boolean,
        vibrationEnabled: boolean,
    ): Promise<void> {
        const sound = soundEnabled ? "on" : "off";
        const vibration = vibrationEnabled ? "on" : "off";
        try {
            await this._skin.apply(
                this.panelGraphics!,
                `${Game2048SettingsPanel.UI_TEXTURE_ROOT}/settings_${sound}_${vibration}/spriteFrame`,
                { fitVisibleWidth: true },
            );
        } catch (error) {
            Logger.error("2048 设置面板图片切换失败。", error);
        }
    }
}
