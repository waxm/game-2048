/**
 * 游戏事件名。
 *
 * 当前游戏专属事件统一放在这里，避免业务代码到处手写字符串。
 */
export enum GameEvent {
  /** 游戏开始。 */
  GameStart = "GameStart",

  /** 点击得分 Demo 中点击屏幕。 */
  DemoClick = "DemoClick",

  /** 分数变化。 */
  ScoreChanged = "ScoreChanged",

  /** 剩余时间变化。 */
  TimeChanged = "TimeChanged",

  /** 游戏结束。 */
  GameOver = "GameOver",

  /** 返回大厅。 */
  BackToLobby = "BackToLobby",

  /** 金币数量变化。 */
  CoinChanged = "CoinChanged",

  /** 关卡通过。 */
  LevelPassed = "LevelPassed",
}
