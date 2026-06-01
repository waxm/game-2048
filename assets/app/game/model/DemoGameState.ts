/**
 * 点击得分 Demo 运行状态。
 */
export interface DemoGameState {
  /** 当前得分。 */
  score: number;

  /** 剩余时间，单位秒。 */
  timeLeft: number;

  /** 历史最高分。 */
  bestScore: number;

  /** 当前累计金币。 */
  coins: number;

  /** 是否正在游戏中。 */
  running: boolean;

  /** 每次点击增加的分数。 */
  scorePerClick: number;

  /** 得分飘字回收延迟，单位秒。 */
  popupRecycleDelay: number;
}

/**
 * 游戏结束结果。
 */
export interface DemoGameResult {
  /** 本局得分。 */
  score: number;

  /** 历史最高分。 */
  bestScore: number;

  /** 当前累计金币。 */
  coins: number;

  /** 是否达成目标。 */
  passed: boolean;
}
