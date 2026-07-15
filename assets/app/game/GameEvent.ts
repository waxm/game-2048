/**
 * 游戏事件名。
 *
 * 游戏层通过这些统一事件和 UI、场景通信，避免散落的字符串事件名。
 */
export enum GameEvent {
  /** 游戏开始。 */
  GameStart = "GameStart",

  /** 旧点击得分 Demo 中点击屏幕。保留它以兼容历史示例代码。 */
  DemoClick = "DemoClick",

  /** 旧点击得分 Demo 的分数变化。保留它以兼容历史示例代码。 */
  ScoreChanged = "ScoreChanged",

  /** 旧点击得分 Demo 的倒计时变化。保留它以兼容历史示例代码。 */
  TimeChanged = "TimeChanged",

  /** 旧点击得分 Demo 的游戏结束事件。保留它以兼容历史示例代码。 */
  GameOver = "GameOver",

  /** 拼图组合发生正确吸附后，请求控制器记录已连接拼图。 */
  PuzzlePieceDropRequest = "PuzzlePieceDropRequest",

  /** 控制器返回拼图块落点判定结果。 */
  PuzzlePieceDropped = "PuzzlePieceDropped",

  /** 拼图状态变化。 */
  PuzzleStateChanged = "PuzzleStateChanged",

  /** 第 1 关完成。 */
  PuzzleCompleted = "PuzzleCompleted",

  /** 拼图面板通知控制器本关时间已经耗尽。 */
  PuzzleTimeExpired = "PuzzleTimeExpired",

  /** 控制器确认本关失败。 */
  PuzzleFailed = "PuzzleFailed",

  /** 请求重新开始本关。 */
  PuzzleRestart = "PuzzleRestart",

  /** 返回大厅。 */
  BackToLobby = "BackToLobby",
}
