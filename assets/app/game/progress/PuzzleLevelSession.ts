import type { PuzzleLevelConfig } from "../config/PuzzleLevelConfig";
import { getPuzzleLevelConfig } from "../config/PuzzleLevelConfig";
import { PuzzleProgressManager } from "./PuzzleProgressManager";

/** 当前进程内正在挑战的拼图关卡。 */
export class PuzzleLevelSession {
  /** 当前选择的关卡编号；进入游戏前尚未选择时为 null。 */
  private static _currentLevel: number | null = null;

  /** 选择一个已经解锁的关卡，并返回对应配置。 */
  public static selectLevel(level: number): PuzzleLevelConfig {
    const config = getPuzzleLevelConfig(level);
    if (!config) {
      throw new Error(`拼图关卡资源不存在：${level}`);
    }
    if (!PuzzleProgressManager.isUnlocked(level)) {
      throw new Error(`拼图关卡尚未解锁：${level}`);
    }
    this._currentLevel = level;
    return config;
  }

  /** 选择本地进度中顺序最靠后的已解锁关卡。 */
  public static selectHighestUnlockedLevel(): PuzzleLevelConfig {
    return this.selectLevel(PuzzleProgressManager.getHighestUnlockedLevel());
  }

  /** 返回当前关卡；没有有效选择时自动回到最高已解锁关卡。 */
  public static getCurrentLevel(): PuzzleLevelConfig {
    if (
      this._currentLevel !== null &&
      PuzzleProgressManager.isUnlocked(this._currentLevel)
    ) {
      const config = getPuzzleLevelConfig(this._currentLevel);
      if (config) {
        return config;
      }
    }
    return this.selectHighestUnlockedLevel();
  }

  /** 清除当前进程中的关卡选择，不影响本地通关进度。 */
  public static clear(): void {
    this._currentLevel = null;
  }
}
