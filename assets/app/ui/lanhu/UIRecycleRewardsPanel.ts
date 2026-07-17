import { _decorator, Button, instantiate, Node, Prefab, SpriteFrame } from "cc";
import { UIBase } from "../../core/ui/UIBase";
import { RecycleRewardItemData, UIRecycleRewardItem } from "./UIRecycleRewardItem";

const { ccclass, property } = _decorator;

/** 蓝湖示例中使用的六个默认奖励名称。 */
const DEFAULT_REWARD_NAMES = ["碎片箱-精良", "圣狮碎片", "震麟碎片", "碎片箱-精良", "圣狮碎片", "震麟碎片"];

/** 蓝湖示例中使用的六个默认奖励数量。 */
const DEFAULT_REWARD_COUNTS = ["2", "2", "20", "2", "2", "20"];

/** 回收成功奖励弹窗，负责按钮事件和奖励列表生成。 */
@ccclass("UIRecycleRewardsPanel")
export class UIRecycleRewardsPanel extends UIBase {
    /** 关闭按钮。 */
    @property({ type: Button })
    public closeBtn: Button | null = null;

    /** 开心收下按钮。 */
    @property({ type: Button })
    public acceptBtn: Button | null = null;

    /** 继续派遣按钮。 */
    @property({ type: Button })
    public continueBtn: Button | null = null;

    /** 使用网格 Layout 排列奖励项的容器。 */
    @property({ type: Node })
    public rewardGrid: Node | null = null;

    /** 单个奖励项 Prefab。 */
    @property({ type: Prefab })
    public rewardItemPrefab: Prefab | null = null;

    /** 默认展示的六个奖励图标，由 Prefab Inspector 显式绑定。 */
    @property({ type: [SpriteFrame] })
    public defaultRewardIcons: SpriteFrame[] = [];

    /** 当前由面板创建的奖励项节点。 */
    private readonly _rewardItemNodes: Node[] = [];

    /** 是否已经注册按钮事件。 */
    private _eventsBound = false;

    /** 校验必填绑定、注册事件并生成默认奖励列表。 */
    protected onLoad(): void {
        this.assertRequiredBindings({
            closeBtn: this.closeBtn,
            acceptBtn: this.acceptBtn,
            continueBtn: this.continueBtn,
            rewardGrid: this.rewardGrid,
            rewardItemPrefab: this.rewardItemPrefab,
        });
        if (this.defaultRewardIcons.length !== DEFAULT_REWARD_NAMES.length) {
            throw new Error(`UI Prefab 默认奖励图标数量错误：需要 ${DEFAULT_REWARD_NAMES.length} 个，实际 ${this.defaultRewardIcons.length} 个。`);
        }

        this.bindEvents();
        this.setRewards(this.createDefaultRewards());
    }

    /** 面板打开时恢复按钮事件。 */
    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        this.bindEvents();
    }

    /** 面板关闭时释放按钮事件。 */
    protected onClose(): void {
        this.unbindEvents();
        super.onClose();
    }

    /** 销毁时释放事件和动态创建的奖励项。 */
    protected onDestroy(): void {
        this.unbindEvents();
        this.clearRewardItems();
        super.onDestroy();
    }

    /** 根据传入数据重新生成奖励列表，由 RewardGrid 的 Layout 统一排列。 */
    public setRewards(rewards: RecycleRewardItemData[]): void {
        this.clearRewardItems();

        for (const reward of rewards) {
            const itemNode = instantiate(this.rewardItemPrefab!);
            const item = itemNode.getComponent(UIRecycleRewardItem);
            if (!item) {
                itemNode.destroy();
                throw new Error("UIRecycleRewardItem.prefab 未挂载 UIRecycleRewardItem 组件。");
            }

            itemNode.parent = this.rewardGrid!;
            item.setData(reward);
            this._rewardItemNodes.push(itemNode);
        }
    }

    /** 根据 Inspector 绑定的默认图标组装蓝湖示例数据。 */
    private createDefaultRewards(): RecycleRewardItemData[] {
        return this.defaultRewardIcons.map((icon, index) => ({
            icon,
            name: DEFAULT_REWARD_NAMES[index],
            count: DEFAULT_REWARD_COUNTS[index],
        }));
    }

    /** 清理面板创建的全部奖励项，允许重复调用。 */
    private clearRewardItems(): void {
        for (const itemNode of this._rewardItemNodes) {
            if (itemNode.isValid) itemNode.destroy();
        }
        this._rewardItemNodes.length = 0;
    }

    /** 幂等注册三个按钮事件。 */
    private bindEvents(): void {
        if (this._eventsBound) return;
        this._eventsBound = true;
        this.closeBtn!.node.on(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.acceptBtn!.node.on(Button.EventType.CLICK, this.onAcceptBtnClick, this);
        this.continueBtn!.node.on(Button.EventType.CLICK, this.onContinueBtnClick, this);
    }

    /** 幂等注销三个按钮事件。 */
    private unbindEvents(): void {
        if (!this._eventsBound) return;
        this._eventsBound = false;
        this.closeBtn?.node.off(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.acceptBtn?.node.off(Button.EventType.CLICK, this.onAcceptBtnClick, this);
        this.continueBtn?.node.off(Button.EventType.CLICK, this.onContinueBtnClick, this);
    }

    /** 关闭按钮业务入口。 */
    private onCloseBtnClick(): void {
        // TODO: 接入关闭回收奖励弹窗的业务逻辑。
    }

    /** 开心收下按钮业务入口。 */
    private onAcceptBtnClick(): void {
        // TODO: 接入领取奖励后的业务逻辑。
    }

    /** 继续派遣按钮业务入口。 */
    private onContinueBtnClick(): void {
        // TODO: 接入继续派遣的业务逻辑。
    }
}
