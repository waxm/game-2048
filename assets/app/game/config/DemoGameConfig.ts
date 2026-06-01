/**
 * 点击得分 Demo 配置。
 *
 * 对应 resources/config/DemoGameConfig.json。
 */
export interface DemoGameConfig {
    /** 单局时长，单位秒。 */
    duration: number;

    /** 每次点击增加的分数。 */
    scorePerClick: number;

    /** 达成目标需要的分数。 */
    targetScore: number;

    /** 达成目标后奖励的金币数量。 */
    coinReward: number;

    /** 得分飘字回收延迟，单位秒。 */
    popupRecycleDelay: number;
}

/**
 * 点击得分 Demo 默认配置。
 *
 * 当 JSON 配置加载失败时使用它兜底。
 */
export const DefaultDemoGameConfig: DemoGameConfig = {
    duration: 15,
    scorePerClick: 1,
    targetScore: 30,
    coinReward: 10,
    popupRecycleDelay: 0.35,
};
