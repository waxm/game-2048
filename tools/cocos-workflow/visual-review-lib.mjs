import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import {
  projectRoot,
  readJson,
  resolveProjectPath,
} from "./lib.mjs";

/** 视觉契约当前支持的结构版本。 */
export const visualContractSchemaVersion = 1;

/** 判断值是否为普通 JSON 对象。 */
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 断言字符串为非空文本。 */
function requireString(value, description) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${description} 必须是非空字符串。`);
  }
}

/** 断言数组只包含非空字符串。 */
function requireStringArray(value, description, allowEmpty = false) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`${description} 必须是${allowEmpty ? "" : "非空"}字符串数组。`);
  }
}

/** 校验项目 UI 规格，防止生成后仍残留模板占位符。 */
export function validateUiSpec(spec, { allowPlaceholders = false } = {}) {
  if (!isObject(spec) || spec.schemaVersion !== visualContractSchemaVersion) {
    throw new Error("GAME_UI_SPEC.json 的 schemaVersion 必须为 1。");
  }
  if (!['draft', 'approved'].includes(spec.status)) {
    throw new Error("GAME_UI_SPEC.json 的 status 必须是 draft 或 approved。");
  }
  for (const [field, value] of [
    ["game.id", spec.game?.id],
    ["game.name", spec.game?.name],
    ["game.repository", spec.game?.repository],
  ]) {
    requireString(value, `GAME_UI_SPEC.json 的 ${field}`);
    if (!allowPlaceholders && /<[^>]+>/.test(value)) {
      throw new Error(`GAME_UI_SPEC.json 的 ${field} 仍包含模板占位符。`);
    }
  }
  if (!allowPlaceholders) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.game.id)) {
      throw new Error("GAME_UI_SPEC.json 的 game.id 必须使用小写字母、数字或短横线。");
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.game.repository)) {
      throw new Error("GAME_UI_SPEC.json 的 game.repository 必须是可移植仓库名。");
    }
  }
  if (
    !Number.isInteger(spec.display?.width) ||
    spec.display.width <= 0 ||
    !Number.isInteger(spec.display?.height) ||
    spec.display.height <= 0
  ) {
    throw new Error("GAME_UI_SPEC.json 必须声明有效设计尺寸。");
  }
  if (!['portrait', 'landscape'].includes(spec.display.orientation)) {
    throw new Error("GAME_UI_SPEC.json 的 orientation 必须为 portrait 或 landscape。");
  }
  requireStringArray(spec.direction?.keywords, "视觉方向 keywords");
  requireStringArray(spec.direction?.references, "视觉方向 references", true);
  requireStringArray(spec.direction?.avoid, "视觉方向 avoid");
  for (const section of ["palette", "layoutTokens", "typography", "patterns"]) {
    if (!isObject(spec[section]) || Object.keys(spec[section]).length === 0) {
      throw new Error(`GAME_UI_SPEC.json 缺少有效 ${section}。`);
    }
  }
  for (const [token, color] of Object.entries(spec.palette)) {
    if (typeof color !== "string" || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color)) {
      throw new Error(`GAME_UI_SPEC.json 的颜色 ${token} 必须为 6 或 8 位十六进制。`);
    }
  }
  for (const [token, value] of Object.entries(spec.layoutTokens)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`GAME_UI_SPEC.json 的布局令牌 ${token} 必须是非负数。`);
    }
  }
  for (const [token, value] of Object.entries(spec.typography)) {
    if (
      (typeof value === "number" && (!Number.isFinite(value) || value <= 0)) ||
      (typeof value !== "number" && (typeof value !== "string" || value.length === 0))
    ) {
      throw new Error(`GAME_UI_SPEC.json 的字体令牌 ${token} 无效。`);
    }
  }
  return spec;
}

/** 校验场景用例以及用例引用的视口、状态和对比关系。 */
export function validateVisualCases(cases, viewportIds, { allowPlaceholders = false } = {}) {
  if (!isObject(cases) || cases.schemaVersion !== visualContractSchemaVersion) {
    throw new Error("视觉用例的 schemaVersion 必须为 1。");
  }
  requireString(cases.entryScene, "视觉用例 entryScene");
  requireStringArray(cases.expectedPageTitleIncludes, "expectedPageTitleIncludes");
  if (
    !allowPlaceholders &&
    cases.expectedPageTitleIncludes.some((marker) => /<[^>]+>/.test(marker))
  ) {
    throw new Error("expectedPageTitleIncludes 仍包含模板占位符。");
  }
  if (cases.coordinateSpace !== "design-top-left") {
    throw new Error("视觉用例坐标系必须为 design-top-left。");
  }
  if (!Array.isArray(cases.cases) || cases.cases.length === 0) {
    throw new Error("视觉用例至少需要一个 case。");
  }
  const ids = new Set();
  for (const reviewCase of cases.cases) {
    requireString(reviewCase?.id, "视觉用例 id");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(reviewCase.id)) {
      throw new Error(`视觉用例 id 格式无效：${reviewCase.id}`);
    }
    if (ids.has(reviewCase.id)) {
      throw new Error(`视觉用例 id 重复：${reviewCase.id}`);
    }
    ids.add(reviewCase.id);
    requireString(reviewCase.title, `${reviewCase.id}.title`);
    if (!Array.isArray(reviewCase.actions)) {
      throw new Error(`${reviewCase.id}.actions 必须是数组。`);
    }
    if (reviewCase.setup !== undefined && !Array.isArray(reviewCase.setup)) {
      throw new Error(`${reviewCase.id}.setup 必须是数组。`);
    }
    for (const action of [
      ...(reviewCase.setup ?? []),
      ...reviewCase.actions,
    ]) {
      if (!isObject(action) || typeof action.type !== "string" || action.type.length === 0) {
        throw new Error(`${reviewCase.id} 包含无效 setup 或 action。`);
      }
    }
    requireStringArray(reviewCase.freshnessCues, `${reviewCase.id}.freshnessCues`);
    requireStringArray(reviewCase.requiredVisuals, `${reviewCase.id}.requiredVisuals`);
    requireStringArray(reviewCase.screenshots, `${reviewCase.id}.screenshots`);
    for (const viewportId of reviewCase.screenshots) {
      if (!viewportIds.has(viewportId)) {
        throw new Error(`${reviewCase.id} 引用了未知视口：${viewportId}`);
      }
    }
    if (reviewCase.requiredStates !== undefined) {
      requireStringArray(reviewCase.requiredStates, `${reviewCase.id}.requiredStates`);
      if (new Set(reviewCase.requiredStates).size !== reviewCase.requiredStates.length) {
        throw new Error(`${reviewCase.id}.requiredStates 不得重复。`);
      }
      if (
        reviewCase.requiredStates.some(
          (state) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state),
        )
      ) {
        throw new Error(`${reviewCase.id}.requiredStates 只能使用小写字母、数字和短横线。`);
      }
      if (
        typeof reviewCase.minimumStateDifferenceRatio !== "number" ||
        reviewCase.minimumStateDifferenceRatio <= 0 ||
        reviewCase.minimumStateDifferenceRatio > 1
      ) {
        throw new Error(`${reviewCase.id} 的多状态用例必须声明有效 minimumStateDifferenceRatio。`);
      }
      if (!isObject(reviewCase.stateActions)) {
        throw new Error(`${reviewCase.id} 的多状态用例必须声明 stateActions。`);
      }
      const stateActionKeys = Object.keys(reviewCase.stateActions).sort();
      const requiredStateKeys = [...reviewCase.requiredStates].sort();
      if (JSON.stringify(stateActionKeys) !== JSON.stringify(requiredStateKeys)) {
        throw new Error(`${reviewCase.id}.stateActions 必须完整对应 requiredStates。`);
      }
      for (const state of reviewCase.requiredStates) {
        const actions = reviewCase.stateActions[state];
        if (
          !Array.isArray(actions) ||
          actions.length === 0 ||
          actions.some(
            (action) =>
              !isObject(action) ||
              typeof action.type !== "string" ||
              action.type.length === 0,
          )
        ) {
          throw new Error(`${reviewCase.id}.stateActions.${state} 必须是非空动作数组。`);
        }
      }
    }
    if (reviewCase.compareWith !== undefined) {
      requireString(reviewCase.compareWith, `${reviewCase.id}.compareWith`);
      if (
        typeof reviewCase.minimumDifferenceRatio !== "number" ||
        reviewCase.minimumDifferenceRatio <= 0 ||
        reviewCase.minimumDifferenceRatio > 1
      ) {
        throw new Error(`${reviewCase.id} 必须声明有效 minimumDifferenceRatio。`);
      }
    }
  }
  for (const reviewCase of cases.cases) {
    if (reviewCase.compareWith && !ids.has(reviewCase.compareWith)) {
      throw new Error(`${reviewCase.id} 对比了不存在的用例：${reviewCase.compareWith}`);
    }
    if (reviewCase.compareWith === reviewCase.id) {
      throw new Error(`${reviewCase.id} 不能与自身对比。`);
    }
    if (reviewCase.compareWith) {
      const baseline = cases.cases.find(
        (entry) => entry.id === reviewCase.compareWith,
      );
      for (const viewportId of reviewCase.screenshots) {
        if (!baseline.screenshots.includes(viewportId)) {
          throw new Error(
            `${reviewCase.id} 的对比用例 ${baseline.id} 缺少视口：${viewportId}`,
          );
        }
      }
      if (baseline.requiredStates && !baseline.requiredStates.includes("default")) {
        throw new Error(`${baseline.id} 作为对比基线时必须包含 default 状态。`);
      }
    }
  }
  const coveredViewportIds = new Set(
    cases.cases.flatMap((reviewCase) => reviewCase.screenshots),
  );
  for (const viewportId of viewportIds) {
    if (!coveredViewportIds.has(viewportId)) {
      throw new Error(`视觉用例没有覆盖必需视口：${viewportId}`);
    }
  }
  return cases;
}

/** 加载当前模式的 UI 规格和视觉用例。 */
export function loadVisualContracts(config) {
  const visual = config.visualReview;
  const templateMode = visual.mode === "framework-template";
  const uiSpecPath = templateMode
    ? visual.templates.uiSpec
    : visual.project.uiSpec;
  const casesPath = templateMode
    ? visual.templates.cases
    : visual.project.cases;
  const resolvedUiSpecPath = resolveProjectPath(uiSpecPath);
  const resolvedCasesPath = resolveProjectPath(casesPath);
  if (!fs.existsSync(resolvedUiSpecPath)) {
    throw new Error(`缺少 UI 规格：${uiSpecPath}`);
  }
  if (!fs.existsSync(resolvedCasesPath)) {
    throw new Error(`缺少视觉用例：${casesPath}`);
  }
  const uiSpec = validateUiSpec(readJson(resolvedUiSpecPath), {
    allowPlaceholders: templateMode,
  });
  const cases = validateVisualCases(
    readJson(resolvedCasesPath),
    new Set(visual.project.viewports.map((viewport) => viewport.id)),
    { allowPlaceholders: templateMode },
  );
  const designViewport = visual.project.viewports.find(
    (viewport) => viewport.class === "design",
  );
  const shortViewport = visual.project.viewports.find(
    (viewport) => viewport.class === "short",
  );
  const longViewport = visual.project.viewports.find(
    (viewport) => viewport.class === "long-safe",
  );
  if (
    designViewport.width !== uiSpec.display.width ||
    designViewport.height !== uiSpec.display.height
  ) {
    throw new Error("design 视口必须与 GAME_UI_SPEC.json 的设计尺寸一致。");
  }
  const primaryDimension = uiSpec.display.orientation === "portrait"
    ? "height"
    : "width";
  if (
    shortViewport[primaryDimension] >= designViewport[primaryDimension] ||
    longViewport[primaryDimension] <= designViewport[primaryDimension]
  ) {
    throw new Error("short 与 long-safe 视口必须分别短于和长于设计尺寸。");
  }
  if (
    !cases.expectedPageTitleIncludes.includes(uiSpec.game.repository)
  ) {
    throw new Error("expectedPageTitleIncludes 必须包含当前游戏仓库标识。");
  }
  for (const reviewCase of cases.cases) {
    for (const action of [
      ...(reviewCase.setup ?? []),
      ...reviewCase.actions,
      ...Object.values(reviewCase.stateActions ?? {}).flat(),
    ]) {
      if (
        action.type === "tap-design-point" &&
        (
          typeof action.x !== "number" ||
          typeof action.y !== "number" ||
          action.x < 0 ||
          action.x > uiSpec.display.width ||
          action.y < 0 ||
          action.y > uiSpec.display.height
        )
      ) {
        throw new Error(`${reviewCase.id} 包含越出设计尺寸的点击坐标。`);
      }
    }
  }
  return {
    mode: visual.mode,
    uiSpec,
    cases,
    uiSpecPath,
    casesPath,
  };
}

/** 生成每个用例、状态和视口必须提供的证据矩阵。 */
export function buildEvidenceRequirements(contracts) {
  return contracts.cases.cases.flatMap((reviewCase) => {
    const states = reviewCase.requiredStates ?? ["default"];
    return reviewCase.screenshots.flatMap((viewportId) =>
      states.map((state) => ({
        caseId: reviewCase.id,
        caseTitle: reviewCase.title,
        state,
        viewportId,
      })),
    );
  });
}

/** 返回证据的稳定复合键。 */
export function evidenceKey(item) {
  return `${item.caseId}::${item.viewportId}::${item.state ?? "default"}`;
}

/** PNG 过滤器使用的 Paeth 预测。 */
function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

/** 解码工作流支持的 8 位非交错 PNG，供黑屏和状态变化检查使用。 */
export function decodePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error("截图不是有效 PNG 文件。");
  }
  let offset = 8;
  let header = null;
  const compressed = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error("PNG 数据块长度越界。");
    }
    if (type === "IHDR") {
      header = {
        width: buffer.readUInt32BE(dataStart),
        height: buffer.readUInt32BE(dataStart + 4),
        bitDepth: buffer[dataStart + 8],
        colorType: buffer[dataStart + 9],
        compression: buffer[dataStart + 10],
        filter: buffer[dataStart + 11],
        interlace: buffer[dataStart + 12],
      };
    } else if (type === "IDAT") {
      compressed.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!header || compressed.length === 0) {
    throw new Error("PNG 缺少 IHDR 或 IDAT 数据块。");
  }
  const channelCounts = new Map([[0, 1], [2, 3], [4, 2], [6, 4]]);
  const channels = channelCounts.get(header.colorType);
  if (
    header.bitDepth !== 8 ||
    !channels ||
    header.compression !== 0 ||
    header.filter !== 0 ||
    header.interlace !== 0
  ) {
    throw new Error("截图必须是 8 位、非交错的灰度、RGB、灰度透明或 RGBA PNG。");
  }
  const rowLength = header.width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(compressed));
  if (inflated.length !== (rowLength + 1) * header.height) {
    throw new Error("PNG 解压后的像素长度与尺寸不一致。");
  }
  const rows = Buffer.alloc(rowLength * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const sourceOffset = y * (rowLength + 1);
    const filterType = inflated[sourceOffset];
    if (filterType > 4) {
      throw new Error(`PNG 使用了未知过滤器：${filterType}`);
    }
    const rowOffset = y * rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[sourceOffset + 1 + x];
      const left = x >= channels ? rows[rowOffset + x - channels] : 0;
      const above = y > 0 ? rows[rowOffset - rowLength + x] : 0;
      const upperLeft = y > 0 && x >= channels
        ? rows[rowOffset - rowLength + x - channels]
        : 0;
      let value = raw;
      if (filterType === 1) value += left;
      if (filterType === 2) value += above;
      if (filterType === 3) value += Math.floor((left + above) / 2);
      if (filterType === 4) value += paethPredictor(left, above, upperLeft);
      rows[rowOffset + x] = value & 255;
    }
  }
  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (let pixel = 0; pixel < header.width * header.height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    if (header.colorType === 0 || header.colorType === 4) {
      rgba[target] = rows[source];
      rgba[target + 1] = rows[source];
      rgba[target + 2] = rows[source];
      rgba[target + 3] = header.colorType === 4 ? rows[source + 1] : 255;
    } else {
      rgba[target] = rows[source];
      rgba[target + 1] = rows[source + 1];
      rgba[target + 2] = rows[source + 2];
      rgba[target + 3] = header.colorType === 6 ? rows[source + 3] : 255;
    }
  }
  return { width: header.width, height: header.height, rgba };
}

/** 分析截图尺寸、黑色像素比例和内容哈希。 */
export function analyzePng(filePath) {
  const buffer = fs.readFileSync(filePath);
  const decoded = decodePng(buffer);
  let blackPixels = 0;
  const pixelCount = decoded.width * decoded.height;
  for (let index = 0; index < decoded.rgba.length; index += 4) {
    const alpha = decoded.rgba[index + 3];
    const luminance =
      decoded.rgba[index] * 0.2126 +
      decoded.rgba[index + 1] * 0.7152 +
      decoded.rgba[index + 2] * 0.0722;
    if (alpha === 0 || luminance <= 8) {
      blackPixels += 1;
    }
  }
  return {
    ...decoded,
    blackPixelRatio: blackPixels / pixelCount,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

/** 计算两张同尺寸截图发生可感知变化的像素比例。 */
export function calculateImageDifference(first, second) {
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error("对比截图尺寸不一致。");
  }
  let changed = 0;
  const pixelCount = first.width * first.height;
  for (let index = 0; index < first.rgba.length; index += 4) {
    const delta =
      Math.abs(first.rgba[index] - second.rgba[index]) +
      Math.abs(first.rgba[index + 1] - second.rgba[index + 1]) +
      Math.abs(first.rgba[index + 2] - second.rgba[index + 2]) +
      Math.abs(first.rgba[index + 3] - second.rgba[index + 3]);
    if (delta >= 24) changed += 1;
  }
  return changed / pixelCount;
}

/** 确保记录的截图路径始终位于当前视觉会话目录。 */
function resolveEvidenceScreenshot(sessionDirectory, screenshotPath) {
  requireString(screenshotPath, "证据 screenshot");
  if (path.isAbsolute(screenshotPath)) {
    throw new Error("证据中的 screenshot 必须是会话相对路径。");
  }
  const resolved = path.resolve(sessionDirectory, screenshotPath);
  const relative = path.relative(sessionDirectory, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("证据截图越出当前视觉会话目录。");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`证据截图不存在：${screenshotPath}`);
  }
  return resolved;
}

/** 检查页面标识，阻止把别的项目或错误标签页当作证据。 */
export function validatePageIdentity(pageTitle, markers) {
  requireString(pageTitle, "页面标题");
  if (!markers.every((marker) => pageTitle.includes(marker))) {
    throw new Error(`页面标题与当前项目不一致：${pageTitle}`);
  }
}

/** 对完整会话执行证据矩阵、黑屏、陈旧画面、状态变化和运行错误检查。 */
export function validateVisualSession(config, contracts, session, sessionDirectory, now = Date.now()) {
  if (!isObject(session) || session.schemaVersion !== 1) {
    throw new Error("视觉验收会话格式无效。");
  }
  const policy = config.visualReview.policy;
  const startedAt = Date.parse(session.startedAt);
  const previewStartedAt = Date.parse(session.previewStartedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(previewStartedAt)) {
    throw new Error("视觉会话缺少有效开始时间或预览刷新时间。");
  }
  if (previewStartedAt < startedAt - 60_000) {
    throw new Error("预览刷新时间距离本次视觉会话过久，可能仍是旧预览。");
  }
  if (now - startedAt > policy.freshness.maxSessionAgeMinutes * 60_000) {
    throw new Error("视觉证据会话已经过期，请刷新预览后重新验收。");
  }
  validatePageIdentity(session.pageTitle, contracts.cases.expectedPageTitleIncludes);
  requireString(session.previewUrl, "视觉会话 previewUrl");

  const evidence = Array.isArray(session.evidence) ? session.evidence : [];
  const indexed = new Map();
  for (const item of evidence) {
    const key = evidenceKey(item);
    if (indexed.has(key)) {
      throw new Error(`视觉证据重复：${key}`);
    }
    indexed.set(key, item);
  }
  const requirements = buildEvidenceRequirements(contracts);
  const analyses = new Map();
  for (const requirement of requirements) {
    const key = evidenceKey(requirement);
    const item = indexed.get(key);
    if (!item) {
      throw new Error(`缺少视觉证据：${key}`);
    }
    const reviewCase = contracts.cases.cases.find((entry) => entry.id === item.caseId);
    const viewport = config.visualReview.project.viewports.find((entry) => entry.id === item.viewportId);
    validatePageIdentity(item.pageTitle, contracts.cases.expectedPageTitleIncludes);
    if (item.previewUrl !== session.previewUrl) {
      throw new Error(`${key} 来自不同预览地址，可能截错标签页。`);
    }
    if (item.captureMethod !== "browser-canvas-element") {
      throw new Error(`${key} 不是浏览器 Canvas 元素截图。`);
    }
    const capturedAt = Date.parse(item.capturedAt);
    const sourceModifiedAt = Date.parse(item.sourceModifiedAt);
    if (!Number.isFinite(capturedAt) || capturedAt < previewStartedAt || capturedAt < startedAt) {
      throw new Error(`${key} 的截图时间早于本次预览。`);
    }
    if (!Number.isFinite(sourceModifiedAt) || sourceModifiedAt < previewStartedAt - 1000) {
      throw new Error(`${key} 的原始 PNG 早于本次预览，疑似复用了旧截图。`);
    }
    if (item.canvasWidth !== viewport.width || item.canvasHeight !== viewport.height) {
      throw new Error(`${key} 的 Canvas 尺寸与视口契约不一致。`);
    }
    if (reviewCase.actions.length > 0 && item.actionCompleted !== true) {
      throw new Error(`${key} 未确认完成用例动作。`);
    }
    for (const cue of reviewCase.freshnessCues) {
      if (!item.passedFreshnessCues?.includes(cue)) {
        throw new Error(`${key} 未确认新鲜度线索：${cue}`);
      }
    }
    for (const visual of reviewCase.requiredVisuals) {
      if (!item.passedVisuals?.includes(visual)) {
        throw new Error(`${key} 未确认视觉项：${visual}`);
      }
    }
    const screenshotPath = resolveEvidenceScreenshot(sessionDirectory, item.screenshot);
    const analysis = analyzePng(screenshotPath);
    if (analysis.width !== viewport.width || analysis.height !== viewport.height) {
      throw new Error(`${key} 的 PNG 尺寸不是目标 Canvas 尺寸。`);
    }
    const expectedAspect = viewport.width / viewport.height;
    const actualAspect = analysis.width / analysis.height;
    if (Math.abs(actualAspect - expectedAspect) > policy.screenshot.aspectRatioTolerance) {
      throw new Error(`${key} 的截图宽高比不符合目标视口。`);
    }
    if (analysis.blackPixelRatio > policy.screenshot.maximumBlackPixelRatio) {
      throw new Error(`${key} 的黑色像素比例过高，疑似黑屏或截错窗口。`);
    }
    analyses.set(key, analysis);
  }

  for (const reviewCase of contracts.cases.cases) {
    const states = reviewCase.requiredStates ?? ["default"];
    for (const viewportId of reviewCase.screenshots) {
      if (reviewCase.compareWith) {
        const current = analyses.get(evidenceKey({ caseId: reviewCase.id, viewportId, state: states[0] }));
        const baseline = analyses.get(evidenceKey({ caseId: reviewCase.compareWith, viewportId, state: "default" }));
        if (!baseline) {
          throw new Error(`${reviewCase.id} 的对比用例缺少同视口证据：${viewportId}`);
        }
        const difference = calculateImageDifference(current, baseline);
        if (difference < reviewCase.minimumDifferenceRatio) {
          throw new Error(`${reviewCase.id} 与 ${reviewCase.compareWith} 的画面变化不足，疑似点击未生效或截图陈旧。`);
        }
      }
      if (states.length > 1) {
        for (let index = 1; index < states.length; index += 1) {
          const previous = analyses.get(evidenceKey({ caseId: reviewCase.id, viewportId, state: states[index - 1] }));
          const current = analyses.get(evidenceKey({ caseId: reviewCase.id, viewportId, state: states[index] }));
          const difference = calculateImageDifference(previous, current);
          if (difference < reviewCase.minimumStateDifferenceRatio) {
            throw new Error(`${reviewCase.id} 的 ${states[index - 1]} 与 ${states[index]} 状态变化不足。`);
          }
        }
      }
    }
  }

  if (!isObject(session.runtime)) {
    throw new Error("缺少浏览器与 Creator 运行错误统计。");
  }
  for (const [field, maximum] of Object.entries(policy.runtime)) {
    const actual = session.runtime[field];
    if (!Number.isInteger(actual) || actual < 0 || actual > maximum) {
      throw new Error(`运行检查未通过：${field}=${actual ?? "未记录"}，允许最大值 ${maximum}。`);
    }
  }
  return {
    requirementCount: requirements.length,
    screenshotCount: analyses.size,
    uiSpecStatus: contracts.uiSpec.status,
  };
}

/** 生成当前项目视觉契约的简洁摘要。 */
export function summarizeVisualContracts(config, contracts) {
  return {
    mode: contracts.mode,
    game: contracts.uiSpec.game,
    design: contracts.uiSpec.display,
    uiSpecStatus: contracts.uiSpec.status,
    viewports: config.visualReview.project.viewports,
    cases: contracts.cases.cases.map((reviewCase) => ({
      id: reviewCase.id,
      title: reviewCase.title,
      setup: reviewCase.setup ?? [],
      actions: reviewCase.actions,
      states: reviewCase.requiredStates ?? ["default"],
      stateActions: reviewCase.stateActions ?? {},
      viewports: reviewCase.screenshots,
      freshnessCues: reviewCase.freshnessCues,
      requiredVisuals: reviewCase.requiredVisuals,
      compareWith: reviewCase.compareWith ?? null,
      minimumDifferenceRatio:
        reviewCase.minimumDifferenceRatio ?? null,
      minimumStateDifferenceRatio:
        reviewCase.minimumStateDifferenceRatio ?? null,
      evidenceCount:
        (reviewCase.requiredStates?.length ?? 1) * reviewCase.screenshots.length,
    })),
    totalEvidence: buildEvidenceRequirements(contracts).length,
  };
}

/** 返回视觉证据目录的绝对路径。 */
export function resolveVisualEvidenceDirectory(config) {
  return resolveProjectPath(config.visualReview.project.evidenceDirectory);
}

/** 确认当前路径位于项目根目录内，便于错误信息统一。 */
export function relativeToProject(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}
