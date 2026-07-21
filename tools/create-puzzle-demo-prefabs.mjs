#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const prefabDir = path.join(projectRoot, "assets/resources/prefabs/game");
const popupPrefabDir = path.join(projectRoot, "assets/resources/prefabs/popup");
const creatorChunkDir = path.join(
  projectRoot,
  "temp/programming/packer-driver/targets/editor/chunks",
);
const uiLayer = 33554432;
let panelScriptType = "";
let pieceScriptType = "";
let resultPanelScriptType = "";
let piecePrefabUuid = "";
const preparedPrefabMetas = new Map();
// 第 1 关完整图片为 448×448，Prefab 初始尺寸与运行时 3×3 网格保持一致。
const level001PieceWidth = 448 / 3;
const level001PieceHeight = 448 / 3;

/** 生成拼图玩法使用的面板、拼图块和结算弹窗 Prefab。 */
function main() {
  fs.mkdirSync(prefabDir, { recursive: true });
  fs.mkdirSync(popupPrefabDir, { recursive: true });
  panelScriptType = resolveCreatorScriptType(
    "UIGamePanel",
    "assets/app/ui/game/UIGamePanel.ts.meta",
  );
  pieceScriptType = resolveCreatorScriptType(
    "PuzzlePiece",
    "assets/app/ui/game/PuzzlePiece.ts.meta",
  );
  resultPanelScriptType = resolveCreatorScriptType(
    "UIResultPanel",
    "assets/app/ui/popup/UIResultPanel.ts.meta",
  );

  piecePrefabUuid = preparePrefabMeta("PuzzlePiece", prefabDir).uuid;
  preparePrefabMeta("UIGamePanel", prefabDir);
  preparePrefabMeta("UIResultPanel", popupPrefabDir);
  writePrefab("PuzzlePiece", createPiecePrefab());
  writePrefab("UIGamePanel", createPanelPrefab());
  writePrefab("UIResultPanel", createResultPanelPrefab(), popupPrefabDir);
  console.log(
    "已生成 PuzzlePiece.prefab、UIGamePanel.prefab 和 UIResultPanel.prefab。",
  );
}

/**
 * 从脚本 meta 和 Creator 实际编译产物中取得 Prefab 使用的脚本类型 ID。
 *
 * 两边必须一致：meta 防止脚本 UUID 被写死，编译产物用于确认 Creator 已经完成导入，
 * 避免仅凭算法猜测类型 ID 后生成带 Missing Script 的 Prefab。
 */
function resolveCreatorScriptType(className, relativeMetaPath) {
  const metaPath = path.join(projectRoot, relativeMetaPath);
  const meta = readJson(metaPath, `${className} 脚本 meta`);
  if (meta.importer !== "typescript" || !isUuid(meta.uuid)) {
    throw new Error(`${relativeMetaPath} 缺少有效的 TypeScript UUID。`);
  }

  const expectedType = compressScriptUuid(meta.uuid);
  const compiledTypes = findCompiledScriptTypes(className);
  if (compiledTypes.size === 0) {
    throw new Error(
      `Creator 尚未编译 ${className}，请先在 Creator 中重新导入脚本后再运行生成器。`,
    );
  }
  if (compiledTypes.size > 1) {
    throw new Error(
      `${className} 在 Creator 编译产物中存在多个类型 ID：${[...compiledTypes].join(", ")}`,
    );
  }

  const compiledType = [...compiledTypes][0];
  if (compiledType !== expectedType) {
    throw new Error(
      `${className} 的 meta UUID 与 Creator 编译类型不一致：${expectedType} !== ${compiledType}`,
    );
  }
  return compiledType;
}

/** 递归扫描 Creator 编辑器编译产物，取得指定 ccclass 的实际类型 ID。 */
function findCompiledScriptTypes(className) {
  if (!fs.existsSync(creatorChunkDir)) {
    throw new Error("找不到 Creator 编辑器编译目录，请先打开项目并完成脚本导入。");
  }

  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `_RF\\.push\\(\\{\\},\\s*["']([^"']+)["'],\\s*["']${escapedClassName}["'],\\s*undefined\\)`,
    "g",
  );
  const types = new Set();
  for (const filePath of listFilesRecursively(creatorChunkDir)) {
    if (!filePath.endsWith(".js")) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    for (const match of content.matchAll(pattern)) {
      types.add(match[1]);
    }
  }
  return types;
}

/** 将 Creator 脚本 UUID 转换为序列化文件使用的压缩类型 ID。 */
function compressScriptUuid(uuid) {
  const hex = uuid.replaceAll("-", "").toLowerCase();
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let compressed = hex.slice(0, 5);
  for (let index = 5; index < hex.length; index += 3) {
    const value = Number.parseInt(hex.slice(index, index + 3), 16);
    compressed += alphabet[value >> 6] + alphabet[value & 63];
  }
  return compressed;
}

/** 递归列出目录文件，供编译产物校验使用。 */
function listFilesRecursively(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
  });
}

/**
 * 读取或创建 Prefab meta。
 *
 * 已有 Prefab 必须保留原 UUID；Prefab 存在但 meta 丢失时直接终止，避免重新生成 UUID
 * 造成其他 Scene、Prefab 中的资源引用静默失效。
 */
function preparePrefabMeta(name, outputDir) {
  const prefabPath = path.join(outputDir, `${name}.prefab`);
  const metaPath = `${prefabPath}.meta`;
  if (fs.existsSync(prefabPath) && !fs.existsSync(metaPath)) {
    throw new Error(`${name}.prefab 已存在但缺少 meta，无法安全保留资源 UUID。`);
  }

  const meta = fs.existsSync(metaPath)
    ? readJson(metaPath, `${name} Prefab meta`)
    : {
        ver: "1.1.50",
        importer: "prefab",
        imported: true,
        uuid: crypto.randomUUID(),
        files: [".json"],
        subMetas: {},
        userData: {},
      };
  if (meta.importer !== "prefab" || !isUuid(meta.uuid)) {
    throw new Error(`${name}.prefab.meta 缺少有效的 Prefab UUID。`);
  }

  meta.userData = { ...meta.userData, syncNodeName: name };
  preparedPrefabMetas.set(prefabPath, { metaPath, meta });
  return meta;
}

/** 读取 JSON 文件并补充更明确的错误上下文。 */
function readJson(filePath, description) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`读取${description}失败：${filePath}`, { cause: error });
  }
}

/** 判断字符串是否为标准 UUID。 */
function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

/** 创建单块拼图 Prefab。 */
function createPiecePrefab() {
  const objects = [createPrefabAsset("PuzzlePiece")];
  const rootId = addNode(
    objects,
    "PuzzlePiece",
    null,
    0,
    0,
    level001PieceWidth,
    level001PieceHeight,
  );
  const pieceTransformId = objects[rootId]._components[0].__id__;
  const imageSpriteId = addSprite(objects, rootId);
  const numberNodeId = addNode(objects, "NumberLabel", rootId, 0, 0, 120, 50);
  const numberLabelId = addLabel(
    objects,
    numberNodeId,
    "1",
    32,
    color(255, 255, 255),
  );
  // 排错编号默认隐藏，实例化到 setData 之前也不能短暂闪出占位文本。
  objects[numberNodeId]._active = false;
  const scriptId = addObject(objects, {
    __type__: pieceScriptType,
    _name: "",
    _objFlags: 0,
    node: ref(rootId),
    _enabled: true,
    pieceTransform: ref(pieceTransformId),
    imageSprite: ref(imageSpriteId),
    numberLabel: ref(numberLabelId),
    _id: "",
  });
  objects[rootId]._components.push(ref(scriptId));
  attachPrefabInfos(objects);
  return objects;
}

/** 创建游戏主面板 Prefab。 */
function createPanelPrefab() {
  const objects = [createPrefabAsset("UIGamePanel")];
  const rootId = addNode(objects, "UIGamePanel", null, 0, 0, 640, 1136);
  const titleNodeId = addNode(objects, "TitleLabel", rootId, 0, 500, 300, 60);
  const titleLabelId = addLabel(
    objects,
    titleNodeId,
    "关卡 1",
    42,
    color(255, 255, 255),
  );
  const progressNodeId = addNode(
    objects,
    "ProgressLabel",
    rootId,
    0,
    450,
    320,
    45,
  );
  const progressLabelId = addLabel(
    objects,
    progressNodeId,
    "已连接 0 / 9",
    26,
    color(190, 220, 255),
  );
  const feedbackNodeId = addNode(
    objects,
    "FeedbackLabel",
    rootId,
    0,
    -520,
    560,
    45,
  );
  const feedbackLabelId = addLabel(
    objects,
    feedbackNodeId,
    "拖动相邻图片，让正确边缘靠近",
    24,
    color(255, 225, 120),
  );
  const puzzleContainerId = addNode(
    objects,
    "PuzzleContainer",
    rootId,
    0,
    0,
    640,
    1136,
  );
  const puzzleContainerTransformId =
    objects[puzzleContainerId]._components[0].__id__;
  const restingGroupBorderNodeId = addNode(
    objects,
    "RestingGroupBorderLayer",
    rootId,
    0,
    0,
    640,
    1136,
  );
  const restingGroupBorderGraphicsId = addGraphics(
    objects,
    restingGroupBorderNodeId,
  );
  const activeGroupRootId = addNode(
    objects,
    "ActiveGroupRoot",
    rootId,
    0,
    0,
    640,
    1136,
  );
  const activePieceContainerId = addNode(
    objects,
    "ActivePieceContainer",
    activeGroupRootId,
    0,
    0,
    640,
    1136,
  );
  const activeGroupBorderNodeId = addNode(
    objects,
    "ActiveGroupBorderLayer",
    activeGroupRootId,
    0,
    0,
    640,
    1136,
  );
  const activeGroupBorderGraphicsId = addGraphics(
    objects,
    activeGroupBorderNodeId,
  );
  const timerBarBackgroundNodeId = addNode(
    objects,
    "TimerBarBackground",
    rootId,
    0,
    375,
    448,
    24,
  );
  const timerBarBackgroundId = addGraphics(objects, timerBarBackgroundNodeId);
  const timerBarFillNodeId = addNode(
    objects,
    "TimerBarFill",
    rootId,
    -224,
    375,
    448,
    24,
  );
  const timerBarFillId = addGraphics(objects, timerBarFillNodeId);
  const timerLabelNodeId = addNode(
    objects,
    "TimerLabel",
    rootId,
    0,
    405,
    180,
    36,
  );
  const timerLabelId = addLabel(
    objects,
    timerLabelNodeId,
    "30 秒",
    24,
    color(255, 255, 255),
  );

  const restart = addButtonWithLabel(
    objects,
    rootId,
    "RestartButton",
    "重玩",
    245,
    500,
  );
  const back = addButtonWithLabel(
    objects,
    rootId,
    "BackButton",
    "返回",
    -245,
    500,
  );
  const addTimeTool = addTextToolButton(
    objects,
    rootId,
    "AddTimeToolButton",
    "增加时间 +10秒",
    -205,
    -445,
  );
  const viewSourceTool = addTextToolButton(
    objects,
    rootId,
    "ViewSourceToolButton",
    "查看原图 3秒",
    0,
    -445,
  );
  const autoMergeTool = addTextToolButton(
    objects,
    rootId,
    "AutoMergeToolButton",
    "自动组合 1块",
    205,
    -445,
  );
  const sourcePreviewNodeId = addNode(
    objects,
    "SourcePreview",
    rootId,
    0,
    0,
    640,
    1136,
  );
  const sourcePreviewOverlayId = addGraphics(objects, sourcePreviewNodeId);
  addBlockInputEvents(objects, sourcePreviewNodeId);
  const sourcePreviewImageNodeId = addNode(
    objects,
    "SourceImage",
    sourcePreviewNodeId,
    0,
    20,
    448,
    448,
  );
  const sourcePreviewSpriteId = addSprite(objects, sourcePreviewImageNodeId);
  const sourcePreviewLabelNodeId = addNode(
    objects,
    "PreviewLabel",
    sourcePreviewNodeId,
    0,
    290,
    360,
    50,
  );
  const sourcePreviewCountdownLabelId = addLabel(
    objects,
    sourcePreviewLabelNodeId,
    "观察原图  3",
    30,
    color(255, 225, 120),
  );
  // 默认隐藏预览节点，完整原图加载完成后再由 UIGamePanel 打开。
  objects[sourcePreviewNodeId]._active = false;
  const scriptId = addObject(objects, {
    __type__: panelScriptType,
    _name: "",
    _objFlags: 0,
    node: ref(rootId),
    _enabled: true,
    titleLabel: ref(titleLabelId),
    progressLabel: ref(progressLabelId),
    feedbackLabel: ref(feedbackLabelId),
    puzzleContainer: ref(puzzleContainerId),
    puzzleContainerTransform: ref(puzzleContainerTransformId),
    restingGroupBorderGraphics: ref(restingGroupBorderGraphicsId),
    activeGroupRoot: ref(activeGroupRootId),
    activePieceContainer: ref(activePieceContainerId),
    activeGroupBorderGraphics: ref(activeGroupBorderGraphicsId),
    piecePrefab: {
      __uuid__: piecePrefabUuid,
      __expectedType__: "cc.Prefab",
    },
    sourcePreviewNode: ref(sourcePreviewNodeId),
    sourcePreviewOverlay: ref(sourcePreviewOverlayId),
    sourcePreviewSprite: ref(sourcePreviewSpriteId),
    sourcePreviewCountdownLabel: ref(sourcePreviewCountdownLabelId),
    timerBarBackground: ref(timerBarBackgroundId),
    timerBarFill: ref(timerBarFillId),
    timerLabel: ref(timerLabelId),
    restartButton: ref(restart.buttonId),
    backButton: ref(back.buttonId),
    addTimeToolButton: ref(addTimeTool.buttonId),
    viewSourceToolButton: ref(viewSourceTool.buttonId),
    autoMergeToolButton: ref(autoMergeTool.buttonId),
    _id: "",
  });
  objects[rootId]._components.push(ref(scriptId));
  attachPrefabInfos(objects);
  return objects;
}

/** 创建拼图成功和失败共用的结算弹窗 Prefab。 */
function createResultPanelPrefab() {
  const objects = [createPrefabAsset("UIResultPanel")];
  const rootId = addNode(objects, "UIResultPanel", null, 0, 0, 640, 1136);
  const overlayGraphicsId = addGraphics(objects, rootId);
  addBlockInputEvents(objects, rootId);

  const panelNodeId = addNode(objects, "Panel", rootId, 0, 0, 500, 380);
  const panelGraphicsId = addGraphics(objects, panelNodeId);
  const titleNodeId = addNode(objects, "TitleLabel", rootId, 0, 115, 360, 60);
  const titleLabelId = addLabel(
    objects,
    titleNodeId,
    "挑战失败",
    42,
    color(224, 70, 70),
  );
  const messageNodeId = addNode(
    objects,
    "MessageLabel",
    rootId,
    0,
    52,
    420,
    48,
  );
  const messageLabelId = addLabel(
    objects,
    messageNodeId,
    "时间已经用完，再试一次吧",
    24,
    color(62, 70, 82),
  );
  const primary = addGraphicsButton(
    objects,
    rootId,
    "PrimaryButton",
    "下一关",
    0,
    -45,
  );
  const home = addGraphicsButton(
    objects,
    rootId,
    "HomeButton",
    "返回首页",
    0,
    -130,
  );
  const scriptId = addObject(objects, {
    __type__: resultPanelScriptType,
    _name: "",
    _objFlags: 0,
    node: ref(rootId),
    _enabled: true,
    overlayGraphics: ref(overlayGraphicsId),
    panelGraphics: ref(panelGraphicsId),
    titleLabel: ref(titleLabelId),
    messageLabel: ref(messageLabelId),
    primaryButton: ref(primary.buttonId),
    primaryButtonGraphics: ref(primary.graphicsId),
    primaryButtonLabel: ref(primary.labelId),
    homeButton: ref(home.buttonId),
    homeButtonGraphics: ref(home.graphicsId),
    _id: "",
  });
  objects[rootId]._components.push(ref(scriptId));
  attachPrefabInfos(objects);
  return objects;
}

/** 添加带文字子节点的按钮。 */
function addButtonWithLabel(objects, parentId, name, text, x, y) {
  const nodeId = addNode(objects, name, parentId, x, y, 120, 64);
  const buttonId = addButton(objects, nodeId);
  const labelNodeId = addNode(objects, "Label", nodeId, 0, 0, 100, 50);
  addLabel(objects, labelNodeId, text, 28, color(120, 190, 255));
  return { nodeId, buttonId };
}

/** 添加底部文字道具按钮；当前没有正式图片，只保留文字和点击区域。 */
function addTextToolButton(objects, parentId, name, text, x, y) {
  const nodeId = addNode(objects, name, parentId, x, y, 190, 64);
  const buttonId = addButton(objects, nodeId);
  const labelNodeId = addNode(objects, "Label", nodeId, 0, 0, 186, 56);
  addLabel(objects, labelNodeId, text, 22, color(120, 205, 255));
  return { nodeId, buttonId };
}

/** 添加由 Graphics 绘制背景的文字按钮。 */
function addGraphicsButton(objects, parentId, name, text, x, y) {
  const nodeId = addNode(objects, name, parentId, x, y, 200, 68);
  const graphicsId = addGraphics(objects, nodeId);
  const buttonId = addButton(objects, nodeId);
  const labelNodeId = addNode(objects, "Label", nodeId, 0, 0, 180, 56);
  const labelId = addLabel(
    objects,
    labelNodeId,
    text,
    28,
    color(255, 255, 255),
  );
  return { nodeId, graphicsId, buttonId, labelId };
}

/** 添加节点及其 UITransform。 */
function addNode(objects, name, parentId, x, y, width, height) {
  const nodeId = addObject(objects, {
    __type__: "cc.Node",
    _name: name,
    _objFlags: 0,
    _parent: parentId === null ? null : ref(parentId),
    _children: [],
    _active: true,
    _components: [],
    _prefab: null,
    _lpos: vec3(x, y, 0),
    _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
    _lscale: vec3(1, 1, 1),
    _layer: uiLayer,
    _euler: vec3(0, 0, 0),
    _id: "",
  });
  if (parentId !== null) {
    objects[parentId]._children.push(ref(nodeId));
  }
  const transformId = addObject(objects, {
    __type__: "cc.UITransform",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _contentSize: { __type__: "cc.Size", width, height },
    _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
    _id: "",
  });
  objects[nodeId]._components.push(ref(transformId));
  return nodeId;
}

/** 添加 Label 组件。 */
function addLabel(objects, nodeId, text, fontSize, labelColor) {
  const componentId = addObject(objects, {
    __type__: "cc.Label",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _color: labelColor,
    _string: text,
    _horizontalAlign: 1,
    _verticalAlign: 1,
    _actualFontSize: fontSize,
    _fontSize: fontSize,
    _fontFamily: "Arial",
    _lineHeight: fontSize + 8,
    _overflow: 0,
    _enableWrapText: true,
    _font: null,
    _isSystemFontUsed: true,
    _id: "",
  });
  objects[nodeId]._components.push(ref(componentId));
  return componentId;
}

/** 添加没有初始图片的 Sprite，运行时由 PuzzlePiece.setData 设置切图。 */
function addSprite(objects, nodeId) {
  const componentId = addObject(objects, {
    __type__: "cc.Sprite",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _color: color(255, 255, 255),
    _spriteFrame: null,
    _type: 0,
    _sizeMode: 0,
    _isTrimmedMode: false,
    _id: "",
  });
  objects[nodeId]._components.push(ref(componentId));
  return componentId;
}

/** 添加运行时绘制矩形和进度条的 Graphics 组件。 */
function addGraphics(objects, nodeId) {
  const componentId = addObject(objects, {
    __type__: "cc.Graphics",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: color(255, 255, 255),
    _lineWidth: 1,
    _strokeColor: color(0, 0, 0),
    _lineJoin: 0,
    _lineCap: 0,
    _fillColor: color(255, 255, 255),
    _miterLimit: 10,
    _id: "",
  });
  objects[nodeId]._components.push(ref(componentId));
  return componentId;
}

/** 添加全屏输入拦截组件，避免弹窗显示时继续拖动底层拼图。 */
function addBlockInputEvents(objects, nodeId) {
  const componentId = addObject(objects, {
    __type__: "cc.BlockInputEvents",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _id: "",
  });
  objects[nodeId]._components.push(ref(componentId));
  return componentId;
}

/** 添加缩放反馈按钮。 */
function addButton(objects, nodeId) {
  const componentId = addObject(objects, {
    __type__: "cc.Button",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    transition: 3,
    duration: 0.1,
    zoomScale: 0.9,
    _target: ref(nodeId),
    _clickEvents: [],
    _interactable: true,
    _id: "",
  });
  objects[nodeId]._components.push(ref(componentId));
  return componentId;
}

/** 为每个节点补齐 Creator PrefabInfo。 */
function attachPrefabInfos(objects) {
  const nodeIds = objects
    .map((item, index) => (item.__type__ === "cc.Node" ? index : -1))
    .filter((index) => index >= 0);
  for (const nodeId of nodeIds) {
    // fileId 根据 Prefab、节点索引和节点名稳定生成，重复执行工具不会产生无意义变化。
    const fileId = crypto
      .createHash("sha1")
      .update(`${objects[0]._name}:${nodeId}:${objects[nodeId]._name}`)
      .digest("base64")
      .replace(/[=+/]/g, "")
      .slice(0, 22);
    const infoId = addObject(objects, {
      __type__: "cc.PrefabInfo",
      root: ref(nodeId),
      asset: ref(0),
      fileId,
    });
    objects[nodeId]._prefab = ref(infoId);
  }
}

/** 写入已经完成结构校验的 Prefab；资源 UUID 由 preparePrefabMeta 单独维护。 */
function writePrefab(name, objects, outputDir = prefabDir) {
  validatePrefab(name, objects);
  const prefabPath = path.join(outputDir, `${name}.prefab`);
  const preparedMeta = preparedPrefabMetas.get(prefabPath);
  if (!preparedMeta) {
    throw new Error(`${name}.prefab 写入前尚未准备 meta。`);
  }
  fs.writeFileSync(prefabPath, `${JSON.stringify(objects, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    preparedMeta.metaPath,
    `${JSON.stringify(preparedMeta.meta, null, 2)}\n`,
    "utf8",
  );
}

/**
 * 在写入磁盘前校验序列化结构。
 *
 * 生成工具必须尽早阻止越界引用、错误父子关系和业务脚本缺失，避免把损坏文件交给 Creator 导入。
 */
function validatePrefab(name, objects) {
  const visit = (value, fieldPath) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Number.isInteger(value.__id__)) {
      if (value.__id__ < 0 || value.__id__ >= objects.length) {
        throw new Error(
          `${name}.${fieldPath} 包含无效 __id__：${value.__id__}`,
        );
      }
    }
    Object.entries(value).forEach(([key, child]) =>
      visit(child, `${fieldPath}.${key}`),
    );
  };
  visit(objects, "root");

  objects.forEach((object, objectId) => {
    if (object?.__type__ !== "cc.Node") {
      return;
    }
    object._children.forEach((childRef) => {
      const child = objects[childRef.__id__];
      if (child?._parent?.__id__ !== objectId) {
        throw new Error(
          `${name}.${child?._name ?? childRef.__id__} 父子关系不一致。`,
        );
      }
    });
  });

  const expectedScriptTypes = {
    UIGamePanel: panelScriptType,
    PuzzlePiece: pieceScriptType,
    UIResultPanel: resultPanelScriptType,
  };
  const expectedScriptType = expectedScriptTypes[name];
  if (!expectedScriptType) {
    throw new Error(`${name} 没有配置业务脚本类型。`);
  }
  if (!objects.some((object) => object?.__type__ === expectedScriptType)) {
    throw new Error(`${name} 缺少业务脚本组件 ${expectedScriptType}。`);
  }
  validateRequiredBindings(name, objects, expectedScriptType);
}

/** 校验生成后的业务字段都指向预期组件或节点。 */
function validateRequiredBindings(name, objects, scriptType) {
  const requiredBindingsByPrefab = {
    PuzzlePiece: {
      pieceTransform: "cc.UITransform",
      imageSprite: "cc.Sprite",
      numberLabel: "cc.Label",
    },
    UIGamePanel: {
      titleLabel: "cc.Label",
      progressLabel: "cc.Label",
      feedbackLabel: "cc.Label",
      puzzleContainer: "cc.Node",
      puzzleContainerTransform: "cc.UITransform",
      restingGroupBorderGraphics: "cc.Graphics",
      activeGroupRoot: "cc.Node",
      activePieceContainer: "cc.Node",
      activeGroupBorderGraphics: "cc.Graphics",
      sourcePreviewNode: "cc.Node",
      sourcePreviewOverlay: "cc.Graphics",
      sourcePreviewSprite: "cc.Sprite",
      sourcePreviewCountdownLabel: "cc.Label",
      timerBarBackground: "cc.Graphics",
      timerBarFill: "cc.Graphics",
      timerLabel: "cc.Label",
      restartButton: "cc.Button",
      backButton: "cc.Button",
      addTimeToolButton: "cc.Button",
      viewSourceToolButton: "cc.Button",
      autoMergeToolButton: "cc.Button",
    },
    UIResultPanel: {
      overlayGraphics: "cc.Graphics",
      panelGraphics: "cc.Graphics",
      titleLabel: "cc.Label",
      messageLabel: "cc.Label",
      primaryButton: "cc.Button",
      primaryButtonGraphics: "cc.Graphics",
      primaryButtonLabel: "cc.Label",
      homeButton: "cc.Button",
      homeButtonGraphics: "cc.Graphics",
    },
  };
  const requiredBindings = requiredBindingsByPrefab[name];
  const script = objects.find((object) => object?.__type__ === scriptType);
  for (const [field, expectedType] of Object.entries(requiredBindings)) {
    const target = objects[script?.[field]?.__id__];
    if (target?.__type__ !== expectedType) {
      throw new Error(
        `${name}.${field} 必须显式绑定到 ${expectedType}，实际为 ${target?.__type__ ?? "空"}。`,
      );
    }
  }
  if (
    name === "UIGamePanel" &&
    (script.piecePrefab?.__uuid__ !== piecePrefabUuid ||
      script.piecePrefab?.__expectedType__ !== "cc.Prefab")
  ) {
    throw new Error("UIGamePanel.piecePrefab 没有绑定正式 PuzzlePiece Prefab。");
  }
}

/** 创建 Prefab 资源头。 */
function createPrefabAsset(name) {
  return {
    __type__: "cc.Prefab",
    _name: name,
    _objFlags: 0,
    _native: "",
    data: ref(1),
    optimizationPolicy: 0,
    asyncLoadAssets: false,
    persistent: false,
  };
}

/** 向序列化对象表追加对象并返回索引。 */
function addObject(objects, object) {
  objects.push(object);
  return objects.length - 1;
}

/** 创建对象表引用。 */
function ref(id) {
  return { __id__: id };
}

/** 创建三维向量。 */
function vec3(x, y, z) {
  return { __type__: "cc.Vec3", x, y, z };
}

/** 创建颜色。 */
function color(r, g, b, a = 255) {
  return { __type__: "cc.Color", r, g, b, a };
}

main();
