#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

/** 当前工具所在项目的根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** 拼图关卡图片根目录。 */
const levelsRoot = path.join(
  projectRoot,
  "assets/resources/textures/game/levels",
);

/** 自动生成的 TypeScript 关卡目录文件。 */
const outputPath = path.join(
  projectRoot,
  "assets/app/game/config/PuzzleLevelCatalog.generated.ts",
);

/** 新关卡默认使用的网格和显示参数。 */
const defaultSettings = {
  rows: 3,
  columns: 3,
  boardWidth: 448,
  boardHeight: 448,
  pieceOrder: [4, 0, 7, 2, 8, 3, 6, 1, 5],
};

/** 扫描目录、校验关卡资源并生成 TypeScript 配置目录。 */
function main() {
  const levelNumbers = collectLevelNumbers();
  if (!levelNumbers.includes(1)) {
    throw new Error("关卡资源中缺少 level_001，无法生成第一关配置。");
  }

  const source = createCatalogSource(levelNumbers);
  fs.writeFileSync(outputPath, source, "utf8");
  console.log(`已生成 ${levelNumbers.length} 个拼图关卡配置：${outputPath}`);
}

/** 从 level_XXX 目录中取得排序后的实际关卡编号。 */
function collectLevelNumbers() {
  return fs
    .readdirSync(levelsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^level_\d{3}$/.test(entry.name))
    .map((entry) => {
      const level = Number(entry.name.slice("level_".length));
      validateLevelAsset(entry.name);
      return level;
    })
    .sort((first, second) => first - second);
}

/** 校验每个关卡目录都存在命名一致的图片和 SpriteFrame 元数据。 */
function validateLevelAsset(levelName) {
  const imagePath = path.join(levelsRoot, levelName, `${levelName}_source.png`);
  const metaPath = `${imagePath}.meta`;
  if (!fs.existsSync(imagePath) || !fs.existsSync(metaPath)) {
    throw new Error(`${levelName} 缺少命名一致的 PNG 或 .meta 文件。`);
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const spriteFrame = meta.subMetas?.f9941;
  if (!spriteFrame || spriteFrame.name !== "spriteFrame") {
    throw new Error(`${levelName} 没有可加载的 SpriteFrame 子资源。`);
  }
}

/** 生成只包含资源事实和统一默认值的 TypeScript 关卡目录。 */
function createCatalogSource(levelNumbers) {
  const settings = JSON.stringify(defaultSettings, null, 4)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `    ${line}`))
    .join("\n");

  return `// 本文件由 tools/generate-puzzle-level-configs.mjs 自动生成，请勿手工维护资源路径。\n\nimport type { PuzzleLevelConfig } from "./PuzzleLevelConfig";\n\n/** 当前资源目录中实际存在的关卡编号。 */\nexport const PuzzleLevelNumbers = ${JSON.stringify(levelNumbers)} as const;\n\n/** 所有关卡共用的默认网格参数，后续可扩展为按难度覆盖。 */\nconst DefaultPuzzleSettings = ${settings} as const;\n\n/** 当前已经生成资源配置的全部拼图关卡。 */\nexport const PuzzleLevelConfigs: readonly PuzzleLevelConfig[] = PuzzleLevelNumbers.map(\n    (level) => {\n        const levelName = "level_" + ("000" + level).slice(-3);\n        return {\n            level,\n            sourceImagePath: \`textures/game/levels/\${levelName}/\${levelName}_source/spriteFrame\`,\n            rows: DefaultPuzzleSettings.rows,\n            columns: DefaultPuzzleSettings.columns,\n            boardWidth: DefaultPuzzleSettings.boardWidth,\n            boardHeight: DefaultPuzzleSettings.boardHeight,\n            pieceOrder: [...DefaultPuzzleSettings.pieceOrder],\n        };\n    },\n);\n\n/** 关卡编号到配置对象的只读索引。 */\nconst PuzzleLevelConfigMap = new Map(\n    PuzzleLevelConfigs.map((config) => [config.level, config]),\n);\n\n/** 根据关卡编号读取配置，不存在对应图片时返回 null。 */\nexport function getPuzzleLevelConfig(level: number): PuzzleLevelConfig | null {\n    return PuzzleLevelConfigMap.get(level) ?? null;\n}\n\n/** 当前 Demo 使用的第一关配置。 */\nexport const PuzzleLevel001Config = PuzzleLevelConfigMap.get(1)!;\n`;
}

main();
