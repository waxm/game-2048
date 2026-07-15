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

/** 人工维护的关卡默认值和单关覆盖配置。 */
const definitionsPath = path.join(
  projectRoot,
  "tools/config/puzzle-levels.json",
);

/** 自动生成的 TypeScript 关卡目录文件。 */
const outputPath = path.join(
  projectRoot,
  "assets/app/game/config/PuzzleLevelCatalog.generated.ts",
);

/** 允许在默认配置和单关覆盖中出现的字段。 */
const settingNames = [
  "rows",
  "columns",
  "boardWidth",
  "boardHeight",
  "timeLimitSeconds",
  "pieceOrder",
];

/** 当前是否只执行校验而不写入生成文件。 */
const checkOnly = process.argv.includes("--check");

/** 当前是否自动关闭关卡 SpriteFrame 的动态合图。 */
const fixImportSettings = process.argv.includes("--fix-import-settings");

/** 扫描目录、校验关卡资源并生成 TypeScript 配置目录。 */
function main() {
  const definitions = readDefinitions();
  const levelNumbers = collectLevelNumbers();
  validateDefinitionLevelNumbers(definitions.levels, levelNumbers);

  const levelConfigs = levelNumbers.map((level) =>
    createLevelConfig(level, definitions),
  );
  const source = createCatalogSource(levelNumbers, definitions);

  if (checkOnly) {
    const currentSource = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, "utf8")
      : "";
    if (currentSource !== source) {
      throw new Error(
        "关卡生成文件不是最新状态，请先执行 npm run generate:levels。",
      );
    }
    console.log(`关卡配置与 ${levelConfigs.length} 个关卡资源校验通过。`);
    return;
  }

  fs.writeFileSync(outputPath, source, "utf8");
  console.log(`已生成 ${levelConfigs.length} 个拼图关卡配置：${outputPath}`);
}

/** 读取并校验人工维护的关卡配置文件。 */
function readDefinitions() {
  const definitions = JSON.parse(fs.readFileSync(definitionsPath, "utf8"));
  if (!isPlainObject(definitions.defaults) || !isPlainObject(definitions.levels)) {
    throw new Error("puzzle-levels.json 必须包含 defaults 和 levels 对象。");
  }

  validateSettingKeys("defaults", definitions.defaults);
  for (const [level, override] of Object.entries(definitions.levels)) {
    if (!/^\d+$/.test(level) || !isPlainObject(override)) {
      throw new Error(`关卡覆盖配置格式错误：levels.${level}`);
    }
    validateSettingKeys(`levels.${level}`, override);
  }
  return definitions;
}

/** 从 level_XXX 目录中取得排序后的实际关卡编号。 */
function collectLevelNumbers() {
  const levelNumbers = fs
    .readdirSync(levelsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^level_\d{3}$/.test(entry.name))
    .map((entry) => Number(entry.name.slice("level_".length)))
    .sort((first, second) => first - second);

  if (!levelNumbers.includes(1)) {
    throw new Error("关卡资源中缺少 level_001，无法生成第一关配置。");
  }
  return levelNumbers;
}

/** 合并默认值和单关覆盖，并执行资源与玩法参数校验。 */
function createLevelConfig(level, definitions) {
  const levelName = createLevelName(level);
  const settings = {
    ...definitions.defaults,
    ...(definitions.levels[String(level)] ?? {}),
  };

  validateSettings(levelName, settings);
  validateLevelAsset(levelName);
  return { level, ...settings };
}

/** 校验关卡参数均为可执行的规则网格配置。 */
function validateSettings(levelName, settings) {
  for (const name of ["rows", "columns", "timeLimitSeconds"]) {
    if (!Number.isInteger(settings[name]) || settings[name] <= 0) {
      throw new Error(`${levelName}.${name} 必须是正整数。`);
    }
  }
  for (const name of ["boardWidth", "boardHeight"]) {
    if (!Number.isFinite(settings[name]) || settings[name] <= 0) {
      throw new Error(`${levelName}.${name} 必须是正数。`);
    }
  }

  const pieceCount = settings.rows * settings.columns;
  if (!Array.isArray(settings.pieceOrder)) {
    throw new Error(`${levelName}.pieceOrder 必须是数组。`);
  }
  const sortedOrder = [...settings.pieceOrder].sort((first, second) => first - second);
  if (
    sortedOrder.length !== pieceCount ||
    sortedOrder.some((pieceId, index) => pieceId !== index)
  ) {
    throw new Error(
      `${levelName}.pieceOrder 必须完整包含 0 到 ${pieceCount - 1}，且不能重复。`,
    );
  }
}

/** 校验关卡图片、SpriteFrame、原始尺寸和禁止动态合图设置。 */
function validateLevelAsset(levelName) {
  const imagePath = path.join(levelsRoot, levelName, `${levelName}_source.png`);
  const metaPath = `${imagePath}.meta`;
  if (!fs.existsSync(imagePath) || !fs.existsSync(metaPath)) {
    throw new Error(`${levelName} 缺少命名一致的 PNG 或 .meta 文件。`);
  }

  const imageSize = readPngSize(imagePath);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const spriteFrame = Object.values(meta.subMetas ?? {}).find(
    (subMeta) => subMeta?.name === "spriteFrame",
  );
  if (!spriteFrame) {
    throw new Error(`${levelName} 没有可加载的 SpriteFrame 子资源。`);
  }

  if (fixImportSettings && spriteFrame.userData?.packable !== false) {
    spriteFrame.userData = { ...(spriteFrame.userData ?? {}), packable: false };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }
  if (spriteFrame.userData?.packable !== false) {
    throw new Error(
      `${levelName} 的 SpriteFrame 仍允许动态合图，请执行 npm run fix:level-imports。`,
    );
  }

  const rawWidth = spriteFrame.userData?.rawWidth;
  const rawHeight = spriteFrame.userData?.rawHeight;
  if (rawWidth !== imageSize.width || rawHeight !== imageSize.height) {
    throw new Error(
      `${levelName} 的 PNG 尺寸与 SpriteFrame 元数据不一致：` +
        `${imageSize.width}x${imageSize.height} / ${rawWidth}x${rawHeight}。`,
    );
  }
}

/** 从 PNG 的 IHDR 数据块读取原始宽高，不依赖额外图片库。 */
function readPngSize(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`关卡图片不是有效 PNG：${imagePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

/** 校验配置文件没有引用当前资源目录中不存在的关卡。 */
function validateDefinitionLevelNumbers(levelOverrides, levelNumbers) {
  const existingLevels = new Set(levelNumbers);
  for (const levelText of Object.keys(levelOverrides)) {
    const level = Number(levelText);
    if (!existingLevels.has(level)) {
      throw new Error(`levels.${level} 没有对应的 level_${padLevel(level)} 资源目录。`);
    }
  }
}

/** 校验配置对象没有拼写错误或未支持字段。 */
function validateSettingKeys(location, settings) {
  for (const name of Object.keys(settings)) {
    if (!settingNames.includes(name)) {
      throw new Error(`${location} 包含不支持的字段：${name}`);
    }
  }
}

/** 生成稳定格式的 TypeScript 关卡目录。 */
function createCatalogSource(levelNumbers, definitions) {
  const numberLines = chunk(levelNumbers, 20)
    .map((numbers) => `  ${numbers.join(", ")},`)
    .join("\n");
  const defaultSource = createSettingsSource(definitions.defaults, 2);
  const overrideEntries = Object.entries(definitions.levels)
    .sort(([first], [second]) => Number(first) - Number(second))
    .map(
      ([level, settings]) =>
        `  [${level}, ${createSettingsSource(settings, 2, true)}],`,
    )
    .join("\n");

  return `// 本文件由 tools/generate-puzzle-level-configs.mjs 自动生成，请勿手工维护资源路径。

import type { PuzzleLevelConfig } from "./PuzzleLevelConfig";

/** 不包含关卡编号和资源路径的拼图玩法参数。 */
type PuzzleLevelSettings = Omit<PuzzleLevelConfig, "level" | "sourceImagePath">;

/** 当前资源目录中实际存在的关卡编号。 */
export const PuzzleLevelNumbers = [
${numberLines}
] as const;

/** 所有关卡共用的默认参数，由 tools/config/puzzle-levels.json 维护。 */
const DefaultPuzzleSettings: PuzzleLevelSettings = ${defaultSource};

/** 单关覆盖参数；没有列出的关卡直接使用默认值。 */
const PuzzleLevelOverrides: ReadonlyMap<number, Partial<PuzzleLevelSettings>> = new Map([
${overrideEntries}
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
      sourceImagePath: \`textures/game/levels/\${levelName}/\${levelName}_source/spriteFrame\`,
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
`;
}

/** 将关卡参数格式化为便于审核的 TypeScript 对象。 */
function createSettingsSource(settings, indent, compact = false) {
  const entries = settingNames
    .filter((name) => Object.hasOwn(settings, name))
    .map((name) => name);
  const lines = entries.map((name) => {
    const value = Array.isArray(settings[name])
      ? `[${settings[name].join(", ")}]`
      : String(settings[name]);
    return `${" ".repeat(indent)}${name}: ${value},`;
  });
  if (compact && lines.length === 1) {
    return `{ ${lines[0].trim().replace(/,$/, "")} }`;
  }
  return `{\n${lines.join("\n")}\n${" ".repeat(Math.max(0, indent - 2))}}`;
}

/** 把数组按固定数量分行，保持生成文件便于人工查看。 */
function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

/** 创建三位数关卡目录名。 */
function createLevelName(level) {
  return `level_${padLevel(level)}`;
}

/** 把关卡编号补齐为三位字符串。 */
function padLevel(level) {
  return String(level).padStart(3, "0");
}

/** 判断 JSON 值是否为普通对象。 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

main();
