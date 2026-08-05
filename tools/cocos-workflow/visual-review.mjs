#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadWorkflowConfig,
  writeJsonAtomic,
} from "./lib.mjs";
import {
  loadVisualContracts,
  resolveVisualEvidenceDirectory,
  summarizeVisualContracts,
  validatePageIdentity,
  validateVisualSession,
} from "./visual-review-lib.mjs";

/** 命令行帮助。 */
const helpText = `
可移植视觉验收证据工具。

用法：
  npm run workflow:visual -- verify-contract [--json]
  npm run workflow:visual -- plan [--json]
  npm run workflow:visual -- start \\
    --preview-url <动态地址> --page-title <浏览器标题> \\
    --preview-started-at <ISO 时间>
  npm run workflow:visual -- record \\
    --session <会话 ID> --case <用例 ID> --viewport <视口 ID> \\
    [--state <状态>] --screenshot <Canvas PNG 路径> \\
    --capture-method browser-canvas-element \\
    --preview-url <动态地址> --page-title <浏览器标题> \\
    --canvas-width <宽> --canvas-height <高> \\
    [--action-completed] \\
    --freshness-cue <已确认线索> --passed-visual <已确认项>
  npm run workflow:visual -- runtime \\
    --session <会话 ID> --browser-console-errors <数量> \\
    --creator-errors <数量> --creator-warnings <数量>
  npm run workflow:visual -- finish --session <会话 ID> [--json]

说明：
  本工具不猜测浏览器标签，也不截桌面。外部浏览器控制工具必须先刷新当前项目预览、
  切换到约定状态并只截 Canvas；本工具负责拒绝错项目、错尺寸、黑屏、陈旧状态和缺项证据。
`.trim();

/** 解析支持重复值的长参数。 */
function parseArguments(argv) {
  const result = {
    command: argv[0] ?? "help",
    flags: new Set(),
    values: new Map(),
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`未知参数：${argument}`);
    }
    if (["--json", "--action-completed", "--help"].includes(argument)) {
      result.flags.add(argument.slice(2));
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数缺少值：${argument}`);
    }
    const key = argument.slice(2);
    const current = result.values.get(key) ?? [];
    current.push(value);
    result.values.set(key, current);
    index += 1;
  }
  return result;
}

/** 取得只允许出现一次的参数。 */
function singleValue(parsed, key, { required = true } = {}) {
  const values = parsed.values.get(key) ?? [];
  if (values.length > 1) {
    throw new Error(`参数不得重复：--${key}`);
  }
  if (required && values.length === 0) {
    throw new Error(`缺少参数：--${key}`);
  }
  return values[0];
}

/** 读取非负整数参数。 */
function integerValue(parsed, key) {
  const raw = singleValue(parsed, key);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${key} 必须是非负整数。`);
  }
  return value;
}

/** 生成不依赖电脑路径或进程号的会话 ID。 */
function createSessionId(now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${timestamp}-${crypto.randomBytes(3).toString("hex")}`;
}

/** 安全解析会话目录，拒绝路径穿越。 */
function resolveSessionDirectory(config, sessionId) {
  if (!/^[0-9TZ]+-[a-f0-9]{6}$/.test(sessionId)) {
    throw new Error(`视觉会话 ID 格式无效：${sessionId}`);
  }
  return path.join(resolveVisualEvidenceDirectory(config), sessionId);
}

/** 加载会话 JSON。 */
function loadSession(config, sessionId) {
  const directory = resolveSessionDirectory(config, sessionId);
  const sessionPath = path.join(directory, "session.json");
  if (!fs.existsSync(sessionPath)) {
    throw new Error(`视觉会话不存在：${sessionId}`);
  }
  return {
    directory,
    sessionPath,
    session: JSON.parse(fs.readFileSync(sessionPath, "utf8")),
  };
}

/** 输出 JSON 或适合人读的摘要。 */
function printResult(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

/** 验证并展示当前项目视觉契约。 */
function verifyContract(config, contracts, json) {
  const summary = summarizeVisualContracts(config, contracts);
  printResult(
    json
      ? summary
      : `视觉契约检查通过：${summary.cases.length} 个用例，${summary.totalEvidence} 份必需截图，规格状态 ${summary.uiSpecStatus}。`,
    json,
  );
}

/** 创建一次必须基于新鲜预览完成的验收会话。 */
function startSession(config, contracts, parsed) {
  if (contracts.mode !== "project") {
    throw new Error("框架模板模式不能开始项目视觉验收。");
  }
  if (contracts.uiSpec.status !== "approved") {
    throw new Error("GAME_UI_SPEC.json 仍为 draft，请先确认视觉方向并改为 approved。");
  }
  const previewUrl = singleValue(parsed, "preview-url");
  const pageTitle = singleValue(parsed, "page-title");
  const previewStartedAt = singleValue(parsed, "preview-started-at");
  if (!Number.isFinite(Date.parse(previewStartedAt))) {
    throw new Error("--preview-started-at 必须是有效 ISO 时间。");
  }
  validatePageIdentity(pageTitle, contracts.cases.expectedPageTitleIncludes);
  let parsedUrl;
  try {
    parsedUrl = new URL(previewUrl);
  } catch {
    throw new Error("--preview-url 必须是有效 URL。");
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error("预览 URL 只允许 http 或 https。");
  }
  const startedAt = new Date().toISOString();
  if (Date.parse(previewStartedAt) < Date.parse(startedAt) - 60_000) {
    throw new Error("预览刷新时间距离会话开始超过 60 秒，请重新刷新预览。");
  }
  const sessionId = createSessionId();
  const directory = resolveSessionDirectory(config, sessionId);
  fs.mkdirSync(path.join(directory, "screenshots"), { recursive: true });
  const session = {
    schemaVersion: 1,
    workflowVersion: config.workflowVersion,
    sessionId,
    startedAt,
    previewStartedAt: new Date(previewStartedAt).toISOString(),
    previewUrl,
    pageTitle,
    entryScene: contracts.cases.entryScene,
    uiSpecStatus: contracts.uiSpec.status,
    evidence: [],
    runtime: null,
    status: "collecting",
  };
  writeJsonAtomic(path.join(directory, "session.json"), session);
  printResult({ sessionId, directory, required: summarizeVisualContracts(config, contracts) }, parsed.flags.has("json"));
}

/** 复制单张 Canvas 截图并写入其页面、动作和人工核对证据。 */
function recordEvidence(config, contracts, parsed) {
  const sessionId = singleValue(parsed, "session");
  const loaded = loadSession(config, sessionId);
  if (loaded.session.status !== "collecting") {
    throw new Error("视觉会话已经结束，不能继续追加截图。");
  }
  const caseId = singleValue(parsed, "case");
  const viewportId = singleValue(parsed, "viewport");
  const state = singleValue(parsed, "state", { required: false }) ?? "default";
  const reviewCase = contracts.cases.cases.find((entry) => entry.id === caseId);
  if (!reviewCase) throw new Error(`未知视觉用例：${caseId}`);
  if (!reviewCase.screenshots.includes(viewportId)) {
    throw new Error(`${caseId} 不要求视口：${viewportId}`);
  }
  const states = reviewCase.requiredStates ?? ["default"];
  if (!states.includes(state)) throw new Error(`${caseId} 不要求状态：${state}`);
  const sourceScreenshot = path.resolve(singleValue(parsed, "screenshot"));
  if (!fs.existsSync(sourceScreenshot) || !fs.statSync(sourceScreenshot).isFile()) {
    throw new Error(`截图文件不存在：${sourceScreenshot}`);
  }
  if (path.extname(sourceScreenshot).toLowerCase() !== ".png") {
    throw new Error("视觉证据必须使用 PNG。");
  }
  const captureMethod = singleValue(parsed, "capture-method");
  if (captureMethod !== "browser-canvas-element") {
    throw new Error("--capture-method 必须为 browser-canvas-element，禁止桌面或整窗截图。");
  }
  const sourceStats = fs.statSync(sourceScreenshot);
  if (sourceStats.mtimeMs < Date.parse(loaded.session.previewStartedAt) - 1000) {
    throw new Error("原始 PNG 早于本次预览刷新，拒绝复用旧截图。");
  }
  const pageTitle = singleValue(parsed, "page-title");
  const previewUrl = singleValue(parsed, "preview-url");
  validatePageIdentity(pageTitle, contracts.cases.expectedPageTitleIncludes);
  if (previewUrl !== loaded.session.previewUrl) {
    throw new Error("截图预览地址与当前会话不一致，可能截错标签页。");
  }
  const fileName = `${caseId}__${viewportId}__${state}.png`;
  const targetRelativePath = `screenshots/${fileName}`;
  const targetPath = path.join(loaded.directory, targetRelativePath);
  if (fs.existsSync(targetPath)) {
    throw new Error(`证据已经存在，拒绝静默覆盖：${caseId}/${viewportId}/${state}`);
  }
  fs.copyFileSync(sourceScreenshot, targetPath);
  const item = {
    caseId,
    viewportId,
    state,
    screenshot: targetRelativePath,
    previewUrl,
    pageTitle,
    captureMethod,
    canvasWidth: integerValue(parsed, "canvas-width"),
    canvasHeight: integerValue(parsed, "canvas-height"),
    actionCompleted: parsed.flags.has("action-completed"),
    passedFreshnessCues: parsed.values.get("freshness-cue") ?? [],
    passedVisuals: parsed.values.get("passed-visual") ?? [],
    sourceModifiedAt: sourceStats.mtime.toISOString(),
    capturedAt: new Date().toISOString(),
  };
  loaded.session.evidence.push(item);
  writeJsonAtomic(loaded.sessionPath, loaded.session);
  printResult(`已记录视觉证据：${caseId}/${viewportId}/${state}`, false);
}

/** 写入同一会话的浏览器 Console 与 Creator 增量错误统计。 */
function recordRuntime(config, parsed) {
  const loaded = loadSession(config, singleValue(parsed, "session"));
  if (loaded.session.status !== "collecting") {
    throw new Error("视觉会话已经结束，不能更新运行检查。 ");
  }
  loaded.session.runtime = {
    browserConsoleErrors: integerValue(parsed, "browser-console-errors"),
    creatorErrors: integerValue(parsed, "creator-errors"),
    creatorWarnings: integerValue(parsed, "creator-warnings"),
    recordedAt: new Date().toISOString(),
  };
  writeJsonAtomic(loaded.sessionPath, loaded.session);
  printResult("已记录浏览器与 Creator 运行检查。", false);
}

/** 完成会话；任一截图、状态、人工核对或错误计数缺失都会失败。 */
function finishSession(config, contracts, parsed) {
  const loaded = loadSession(config, singleValue(parsed, "session"));
  if (loaded.session.status === "passed") {
    throw new Error("视觉会话已经通过，无需重复完成。");
  }
  const result = validateVisualSession(config, contracts, loaded.session, loaded.directory);
  loaded.session.status = "passed";
  loaded.session.finishedAt = new Date().toISOString();
  loaded.session.result = result;
  writeJsonAtomic(loaded.sessionPath, loaded.session);
  printResult(
    parsed.flags.has("json")
      ? { sessionId: loaded.session.sessionId, ...result }
      : `视觉验收通过：${result.screenshotCount} 份截图，运行错误为零。`,
    parsed.flags.has("json"),
  );
}

/** 命令入口。 */
export function runVisualReview(argv) {
  const parsed = parseArguments(argv);
  if (parsed.command === "help" || parsed.flags.has("help")) {
    console.log(helpText);
    return;
  }
  const config = loadWorkflowConfig();
  const contracts = loadVisualContracts(config);
  if (parsed.command === "verify-contract") {
    verifyContract(config, contracts, parsed.flags.has("json"));
  } else if (parsed.command === "plan") {
    printResult(summarizeVisualContracts(config, contracts), parsed.flags.has("json"));
  } else if (parsed.command === "start") {
    startSession(config, contracts, parsed);
  } else if (parsed.command === "record") {
    recordEvidence(config, contracts, parsed);
  } else if (parsed.command === "runtime") {
    recordRuntime(config, parsed);
  } else if (parsed.command === "finish") {
    finishSession(config, contracts, parsed);
  } else {
    throw new Error(`未知视觉验收命令：${parsed.command}`);
  }
}

const invokedPath = process.argv[1]
  ? fs.realpathSync(path.resolve(process.argv[1]))
  : "";
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
if (invokedPath === currentPath) {
  try {
    runVisualReview(process.argv.slice(2));
  } catch (error) {
    console.error(`视觉验收失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
