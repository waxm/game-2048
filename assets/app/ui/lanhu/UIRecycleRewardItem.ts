import { _decorator, Label, Sprite, SpriteFrame } from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

/** 回收奖励列表项的数据。 */
export interface RecycleRewardItemData {
    /** 奖励图标。 */
    icon: SpriteFrame;
    /** 奖励名称。 */
    name: string;
    /** 奖励数量。 */
    count: string;
}

/** 回收奖励列表项，负责显示单个奖励的图标、名称和数量。 */
@ccclass("UIRecycleRewardItem")
export class UIRecycleRewardItem extends UIBase {
    /** 奖励图标。 */
    @property({ type: Sprite })
    public rewardIcon: Sprite | null = null;

    /** 奖励名称文本。 */
    @property({ type: Label })
    public rewardNameLabel: Label | null = null;

    /** 奖励数量文本。 */
    @property({ type: Label })
    public rewardCountLabel: Label | null = null;

    /** 组件加载时立即检查 Item Prefab 的必填绑定。 */
    protected onLoad(): void {
        this.assertRequiredBindings({
            rewardIcon: this.rewardIcon,
            rewardNameLabel: this.rewardNameLabel,
            rewardCountLabel: this.rewardCountLabel,
        });
    }

    /** 使用业务数据刷新当前奖励项。 */
    public setData(data: RecycleRewardItemData): void {
        this.rewardIcon!.spriteFrame = data.icon;
        this.rewardNameLabel!.string = data.name;
        this.rewardCountLabel!.string = data.count;
    }
}
