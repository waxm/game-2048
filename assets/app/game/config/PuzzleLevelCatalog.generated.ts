// 本文件由 tools/generate-puzzle-level-configs.mjs 自动生成，请勿手工维护资源路径。

import type { PuzzleLevelConfig } from "./PuzzleLevelConfig";

/** 当前资源目录中实际存在的关卡编号。 */
export const PuzzleLevelNumbers = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
  42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
  80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 100,
] as const;

/** 所有关卡共用的默认网格参数，后续可扩展为按难度覆盖。 */
const DefaultPuzzleSettings = {
  rows: 3,
  columns: 3,
  boardWidth: 448,
  boardHeight: 448,
  timeLimitSeconds: 30,
  pieceOrder: [4, 0, 7, 2, 8, 3, 6, 1, 5],
} as const;

/** 当前已经生成资源配置的全部拼图关卡。 */
export const PuzzleLevelConfigs: readonly PuzzleLevelConfig[] =
  PuzzleLevelNumbers.map((level) => {
    const levelName = "level_" + ("000" + level).slice(-3);
    return {
      level,
      sourceImagePath: `textures/game/levels/${levelName}/${levelName}_source/spriteFrame`,
      rows: DefaultPuzzleSettings.rows,
      columns: DefaultPuzzleSettings.columns,
      boardWidth: DefaultPuzzleSettings.boardWidth,
      boardHeight: DefaultPuzzleSettings.boardHeight,
      timeLimitSeconds: DefaultPuzzleSettings.timeLimitSeconds,
      pieceOrder: [...DefaultPuzzleSettings.pieceOrder],
    };
  });

/** 关卡编号到配置对象的只读索引。 */
const PuzzleLevelConfigMap = new Map(
  PuzzleLevelConfigs.map((config) => [config.level, config]),
);

/** 根据关卡编号读取配置，不存在对应图片时返回 null。 */
export function getPuzzleLevelConfig(level: number): PuzzleLevelConfig | null {
  return PuzzleLevelConfigMap.get(level) ?? null;
}

/** 当前 Demo 使用的第一关配置。 */
export const PuzzleLevel001Config = PuzzleLevelConfigMap.get(1)!;
