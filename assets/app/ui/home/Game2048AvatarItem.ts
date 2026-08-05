import { _decorator, Button, Component, Label } from "cc";
import type { PoolLifecycle } from "../../core/pool/PoolManager";
import type { Game2048AvatarDefinition } from "../../game/game2048/Game2048AvatarCatalog";
import { Game2048AvatarRenderer } from "./Game2048AvatarRenderer";

const { ccclass, property } = _decorator;

/** 头像选择列表项从对象池取出时接收的数据。 */
export interface Game2048AvatarItemData {
    /** 当前头像定义。 */
    avatar: Game2048AvatarDefinition;

    /** 是否为玩家当前头像。 */
    selected: boolean;

    /** 玩家点击头像后的回调。 */
    onSelect: (avatarId: string) => void;
}

/** 可复用的 2048 头像选择列表项。 */
@ccclass("Game2048AvatarItem")
export class Game2048AvatarItem extends Component implements PoolLifecycle {
    /** 列表项点击区域。 */
    @property(Button)
    public selectButton: Button | null = null;

    /** 头像图形渲染器。 */
    @property(Game2048AvatarRenderer)
    public avatarRenderer: Game2048AvatarRenderer | null = null;

    /** 头像可读名称。 */
    @property(Label)
    public nameLabel: Label | null = null;

    /** 当前选中提示。 */
    @property(Label)
    public selectedLabel: Label | null = null;

    /** 当前头像稳定编号。 */
    private _avatarId = "";

    /** 当前选择回调，回收时必须清空。 */
    private _onSelect: ((avatarId: string) => void) | null = null;

    /** 是否已经绑定按钮事件。 */
    private _eventsBound = false;

    /** Cocos 生命周期：校验 Prefab 绑定。 */
    protected onLoad(): void {
        if (
            !this.selectButton ||
            !this.avatarRenderer ||
            !this.nameLabel ||
            !this.selectedLabel
        ) {
            throw new Error(`2048 头像列表项 Prefab 未完整绑定：${this.node.name}`);
        }
    }

    /** 从对象池取出时恢复全部展示和输入状态。 */
    public reuse(...args: unknown[]): void {
        const data = this.readData(args[0]);
        this._avatarId = data.avatar.id;
        this._onSelect = data.onSelect;
        this.avatarRenderer!.render(data.avatar, 78, data.selected);
        this.nameLabel!.string = data.avatar.displayName;
        this.selectedLabel!.string = data.selected ? "当前" : "";
        this.bindEvents();
    }

    /** 回收到对象池前注销事件并清空旧业务数据。 */
    public unuse(): void {
        this.unbindEvents();
        this._avatarId = "";
        this._onSelect = null;
        if (this.nameLabel) {
            this.nameLabel.string = "";
        }
        if (this.selectedLabel) {
            this.selectedLabel.string = "";
        }
    }

    /** 校验对象池传入的头像数据。 */
    private readData(value: unknown): Game2048AvatarItemData {
        if (
            !value ||
            typeof value !== "object" ||
            !("avatar" in value) ||
            !("selected" in value) ||
            !("onSelect" in value) ||
            typeof value.selected !== "boolean" ||
            typeof value.onSelect !== "function" ||
            !value.avatar ||
            typeof value.avatar !== "object" ||
            !("id" in value.avatar) ||
            typeof value.avatar.id !== "string"
        ) {
            throw new Error("2048 头像列表项收到的复用参数无效。");
        }
        return value as Game2048AvatarItemData;
    }

    /** 幂等注册选择事件。 */
    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }
        this._eventsBound = true;
        this.selectButton!.node.on(
            Button.EventType.CLICK,
            this.onClickSelect,
            this,
        );
    }

    /** 幂等注销选择事件。 */
    private unbindEvents(): void {
        if (!this._eventsBound || !this.selectButton) {
            return;
        }
        this._eventsBound = false;
        this.selectButton.node.off(
            Button.EventType.CLICK,
            this.onClickSelect,
            this,
        );
    }

    /** 把当前头像编号转发给资料面板。 */
    private onClickSelect(): void {
        if (this._avatarId.length > 0) {
            this._onSelect?.(this._avatarId);
        }
    }
}
