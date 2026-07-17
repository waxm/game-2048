// 本文件由 tools/generate-puzzle-level-configs.mjs 自动生成，请勿手工维护资源路径。

import type { PuzzleLevelConfig } from "./PuzzleLevelConfig";

/** 不包含关卡编号和资源路径的拼图玩法参数。 */
type PuzzleLevelSettings = Omit<PuzzleLevelConfig, "level" | "sourceImagePath">;

/** 当前资源目录中实际存在的关卡编号。 */
export const PuzzleLevelNumbers = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88, 89, 100,
] as const;

/** 所有关卡共用的默认参数，由 tools/config/puzzle-levels.json 维护。 */
const DefaultPuzzleSettings: PuzzleLevelSettings = {
  rows: 3,
  columns: 3,
  boardWidth: 448,
  boardHeight: 448,
  timeLimitSeconds: 30,
  pieceOrder: [4, 0, 7, 2, 8, 3, 6, 1, 5],
};

/** 单关覆盖参数；没有列出的关卡直接使用默认值。 */
const PuzzleLevelOverrides: ReadonlyMap<number, Partial<PuzzleLevelSettings>> = new Map([
  [1, { timeLimitSeconds: 30 }],
  [
    5,
    {
      rows: 9,
      columns: 9,
      timeLimitSeconds: null,
      pieceOrder: [
        18, 3, 58, 6, 2, 60, 41, 44, 27, 78, 0, 32, 50, 15, 57, 42,
        22, 28, 38, 20, 66, 79, 8, 54, 30, 11, 68, 35, 48, 23, 17, 39,
        14, 33, 69, 52, 46, 63, 70, 51, 74, 37, 34, 59, 12, 5, 40, 73,
        25, 64, 16, 29, 67, 19, 80, 62, 36, 43, 10, 9, 7, 1, 65, 71,
        21, 75, 26, 76, 24, 31, 56, 61, 72, 55, 4, 45, 49, 53, 47, 77,
        13,
      ],
    },
  ],
]);

/** 当前已经生成资源配置的全部拼图关卡。 */
export const PuzzleLevelConfigs: readonly PuzzleLevelConfig[] =
  PuzzleLevelNumbers.map((level) => {
    const levelName = "level_" + ("000" + level).slice(-3);
    const settings = {
      ...DefaultPuzzleSettings,
      ...(PuzzleLevelOverrides.get(level) ?? {}),
    };
    return {
      level,
      sourceImagePath: `textures/game/levels/${levelName}/${levelName}_source/spriteFrame`,
      ...settings,
      pieceOrder: [...settings.pieceOrder],
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

/** 返回当前关卡在资源目录中的下一关编号，最后一关返回 null。 */
export function getNextPuzzleLevelNumber(level: number): number | null {
  const currentIndex = PuzzleLevelNumbers.findIndex(
    (candidate) => candidate === level,
  );
  if (currentIndex < 0 || currentIndex >= PuzzleLevelNumbers.length - 1) {
    return null;
  }
  return PuzzleLevelNumbers[currentIndex + 1];
}

/** 当前 Demo 使用的第一关配置。 */
export const PuzzleLevel001Config = PuzzleLevelConfigMap.get(1)!;
