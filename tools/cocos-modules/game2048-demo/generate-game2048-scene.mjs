#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "../../..");

/** 可复用的最小框架场景模板。 */
const templateScenePath = path.join(projectRoot, "assets/scene/Boot.scene");

/** 生成的正式玩法场景。 */
const outputScenePath = path.join(projectRoot, "assets/scene/Game2048.scene");

/** 生成场景的 Meta。 */
const outputMetaPath = `${outputScenePath}.meta`;

/** Creator 编辑器实际编译脚本目录。 */
const creatorChunkRoot = path.join(
  projectRoot,
  "temp/programming/packer-driver/targets/editor/chunks",
);

/** 玩法场景稳定 UUID。 */
const gameSceneUuid = "b6b24ad3-0bc8-4c9a-b81b-aec3e2ce63b8";

/** Cocos 压缩 UUID 使用的字符表。 */
const compressedUuidAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 当前场景对象数组。 */
const objects = JSON.parse(fs.readFileSync(templateScenePath, "utf8"));

/** 根据脚本 Meta 和 Creator 实际编译结果返回可靠类 ID。 */
function resolveScriptTypeId(className, sourcePath) {
  const metaPath = path.join(projectRoot, `${sourcePath}.meta`);
  if (!fs.existsSync(metaPath)) {
    throw new Error(
      `${sourcePath}.meta 不存在，请先用 Cocos Creator 3.8.4 导入脚本。`,
    );
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  if (meta.importer !== "typescript" || meta.imported !== true) {
    throw new Error(`${sourcePath}.meta 尚未被 Creator 成功导入。`);
  }
  const expectedTypeId = compressUuid(meta.uuid);
  const actualTypeIds = new Set();
  for (const chunkFile of collectFiles(creatorChunkRoot, ".js")) {
    const content = fs.readFileSync(chunkFile, "utf8");
    const pattern =
      /_RF\.push\(\{\},\s*["']([^"']+)["'],\s*["']([^"']+)["']/g;
    for (const match of content.matchAll(pattern)) {
      if (match[2] === className) {
        actualTypeIds.add(match[1]);
      }
    }
  }
  if (actualTypeIds.size !== 1 || !actualTypeIds.has(expectedTypeId)) {
    throw new Error(
      `${className} 的 Meta 类 ID ${expectedTypeId} 与 Creator 编译结果 ` +
        `${[...actualTypeIds].join("、") || "缺失"} 不一致。`,
    );
  }
  return expectedTypeId;
}

/** 递归收集指定目录下的目标后缀文件。 */
function collectFiles(root, extension) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(entryPath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      result.push(entryPath);
    }
  }
  return result.sort();
}

/** 把标准 UUID 压缩成 Creator 序列化类 ID。 */
function compressUuid(uuid) {
  const hex = uuid.replaceAll("-", "");
  let result = hex.slice(0, 5);
  for (let index = 5; index < 32; index += 3) {
    const first = Number.parseInt(hex[index], 16);
    const second = Number.parseInt(hex[index + 1], 16);
    const third =
      index + 2 < 32 ? Number.parseInt(hex[index + 2], 16) : 0;
    result += compressedUuidAlphabet[(first << 2) | (second >> 2)];
    result += compressedUuidAlphabet[((second & 3) << 4) | third];
  }
  return result;
}

/** 为生成对象建立稳定且符合 Creator 习惯的 fileId。 */
function stableFileId(key) {
  return crypto
    .createHash("sha1")
    .update(`game2048:${key}`)
    .digest("base64")
    .replaceAll("/", "_")
    .slice(0, 22);
}

/** 向序列化对象数组末尾追加对象并返回其 __id__。 */
function appendObject(object) {
  const id = objects.length;
  objects.push(object);
  return id;
}

/** 创建通用 2D 场景节点。 */
function createNode(name, parentId, position, active = true) {
  const nodeId = appendObject({
    __type__: "cc.Node",
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: parentId === null ? null : { __id__: parentId },
    _children: [],
    _active: active,
    _components: [],
    _prefab: null,
    _lpos: {
      __type__: "cc.Vec3",
      x: position.x,
      y: position.y,
      z: position.z ?? 0,
    },
    _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: "cc.Vec3", x: 1, y: 1, z: 1 },
    _mobility: 0,
    _layer: 33554432,
    _euler: { __type__: "cc.Vec3", x: 0, y: 0, z: 0 },
    _id: stableFileId(`node:${name}`),
  });
  if (parentId !== null) {
    objects[parentId]._children.push({ __id__: nodeId });
  }
  return nodeId;
}

/** 为节点追加 UITransform。 */
function addUiTransform(nodeId, width, height) {
  const componentId = appendObject({
    __type__: "cc.UITransform",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _contentSize: { __type__: "cc.Size", width, height },
    _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
    _id: stableFileId(`ui-transform:${objects[nodeId]._name}`),
  });
  objects[nodeId]._components.push({ __id__: componentId });
  return componentId;
}

/** 为节点追加 Graphics。 */
function addGraphics(nodeId) {
  const componentId = appendObject({
    __type__: "cc.Graphics",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 },
    _lineWidth: 1,
    _strokeColor: {
      __type__: "cc.Color",
      r: 0,
      g: 0,
      b: 0,
      a: 255,
    },
    _lineJoin: 0,
    _lineCap: 0,
    _fillColor: {
      __type__: "cc.Color",
      r: 255,
      g: 255,
      b: 255,
      a: 255,
    },
    _miterLimit: 10,
    _id: stableFileId(`graphics:${objects[nodeId]._name}`),
  });
  objects[nodeId]._components.push({ __id__: componentId });
  return componentId;
}

/** 创建带 UITransform 和 Graphics 的画布层节点。 */
function createGraphicsLayer(name, parentId, active = true) {
  const nodeId = createNode(name, parentId, { x: 0, y: 0 }, active);
  addUiTransform(nodeId, 640, 1136);
  const graphicsId = addGraphics(nodeId);
  return { nodeId, graphicsId };
}

/** 创建带 UITransform 和 Label 的文本节点。 */
function createLabel(
  name,
  parentId,
  text,
  position,
  size,
  fontSize,
  color,
  horizontalAlign = 1,
) {
  const nodeId = createNode(name, parentId, position);
  addUiTransform(nodeId, size.width, size.height);
  const labelId = appendObject({
    __type__: "cc.Label",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _color: {
      __type__: "cc.Color",
      r: color.r,
      g: color.g,
      b: color.b,
      a: color.a ?? 255,
    },
    _string: text,
    _horizontalAlign: horizontalAlign,
    _verticalAlign: 1,
    _actualFontSize: fontSize,
    _fontSize: fontSize,
    _fontFamily: "Arial",
    _lineHeight: Math.round(fontSize * 1.28),
    _overflow: 1,
    _enableWrapText: true,
    _font: null,
    _isSystemFontUsed: true,
    _id: stableFileId(`label:${name}`),
  });
  objects[nodeId]._components.push({ __id__: labelId });
  return { nodeId, labelId };
}

/** 为节点追加 Button。 */
function addButton(nodeId) {
  const buttonId = appendObject({
    __type__: "cc.Button",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    transition: 3,
    duration: 0.1,
    zoomScale: 0.92,
    _target: { __id__: nodeId },
    _clickEvents: [],
    _interactable: true,
    _id: stableFileId(`button:${objects[nodeId]._name}`),
  });
  objects[nodeId]._components.push({ __id__: buttonId });
  return buttonId;
}

/** 校验引用范围、父子关系、脚本类型和必填绑定。 */
function validateGeneratedScene(
  controllerTypeId,
  rendererTypeId,
  expectedBindings,
) {
  const visit = (value) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (
      Object.keys(value).length === 1 &&
      Number.isInteger(value.__id__) &&
      (value.__id__ < 0 || value.__id__ >= objects.length)
    ) {
      throw new Error(`生成场景包含越界 __id__：${value.__id__}`);
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  };
  visit(objects);

  for (let objectId = 0; objectId < objects.length; objectId += 1) {
    const object = objects[objectId];
    if (object?.__type__ !== "cc.Node") {
      continue;
    }
    for (const childReference of object._children ?? []) {
      const child = objects[childReference.__id__];
      if (child?._parent?.__id__ !== objectId) {
        throw new Error(
          `${object._name} 与子节点 ${child?._name ?? "unknown"} 父子关系不一致。`,
        );
      }
    }
  }

  const controllers = objects.filter(
    (object) => object?.__type__ === controllerTypeId,
  );
  const renderers = objects.filter(
    (object) => object?.__type__ === rendererTypeId,
  );
  if (controllers.length !== 1 || renderers.length !== 1) {
    throw new Error("生成场景必须各包含一个控制器和渲染器。");
  }
  for (const [script, bindings] of [
    [controllers[0], expectedBindings.controller],
    [renderers[0], expectedBindings.renderer],
  ]) {
    for (const [field, type] of Object.entries(bindings)) {
      const target = objects[script[field]?.__id__];
      if (target?.__type__ !== type) {
        throw new Error(`${field} 未绑定到预期类型 ${type}。`);
      }
    }
  }
}

const controllerTypeId = resolveScriptTypeId(
  "Game2048SceneController",
  "assets/app/scenes/Game2048SceneController.ts",
);
const rendererTypeId = resolveScriptTypeId(
  "Game2048Renderer",
  "assets/app/ui/game/Game2048Renderer.ts",
);

// 保留 Boot 模板中经过 Creator 生成的相机和 SceneGlobals，只替换业务层结构。
objects[0]._name = "Game2048";
objects[1]._name = "Game2048";
objects[1]._id = gameSceneUuid;
objects[14].fileId = gameSceneUuid;
objects[7]._children = [{ __id__: 8 }];

const gameViewNodeId = createNode(
  "GameView",
  7,
  { x: 0, y: 0, z: 0 },
);
addUiTransform(gameViewNodeId, 640, 1136);
const arenaLayer = createGraphicsLayer("ArenaGraphics", gameViewNodeId);
const entityLayer = createGraphicsLayer("EntityGraphics", gameViewNodeId);
const effectLayer = createGraphicsLayer("EffectGraphics", gameViewNodeId);

const hudNodeId = createNode("HUD", 7, { x: 0, y: 0 });
addUiTransform(hudNodeId, 640, 1136);
createLabel(
  "TitleLabel",
  hudNodeId,
  "2048  ARENA",
  { x: 0, y: 520 },
  { width: 360, height: 56 },
  34,
  { r: 255, g: 255, b: 255 },
);
const scoreLabel = createLabel(
  "ScoreLabel",
  hudNodeId,
  "得分  0",
  { x: -205, y: 470 },
  { width: 210, height: 48 },
  28,
  { r: 255, g: 221, b: 112 },
  0,
);
const rankLabel = createLabel(
  "RankLabel",
  hudNodeId,
  "排名 1/7    队首 2    队列 1",
  { x: 0, y: 426 },
  { width: 560, height: 44 },
  23,
  { r: 207, g: 220, b: 239 },
);
const hintLabel = createLabel(
  "HintLabel",
  hudNodeId,
  "移动鼠标 / 拖动屏幕 / WASD 控制方向",
  { x: 0, y: -520 },
  { width: 590, height: 42 },
  20,
  { r: 166, g: 181, b: 204 },
);

const gameOverPanel = createGraphicsLayer("GameOverPanel", 7, false);
const gameOverTitle = createLabel(
  "GameOverTitle",
  gameOverPanel.nodeId,
  "GAME OVER",
  { x: 0, y: 125 },
  { width: 440, height: 72 },
  52,
  { r: 255, g: 255, b: 255 },
);
const finalResultLabel = createLabel(
  "FinalResultLabel",
  gameOverPanel.nodeId,
  "最终队首  2\n最终得分  0",
  { x: 0, y: 12 },
  { width: 440, height: 130 },
  30,
  { r: 219, g: 229, b: 245 },
);
const restartButtonNodeId = createNode(
  "RestartButton",
  gameOverPanel.nodeId,
  { x: 0, y: -121 },
);
addUiTransform(restartButtonNodeId, 276, 78);
const restartButtonId = addButton(restartButtonNodeId);
createLabel(
  "RestartButtonLabel",
  restartButtonNodeId,
  "重新开始",
  { x: 0, y: 0 },
  { width: 240, height: 68 },
  30,
  { r: 255, g: 255, b: 255 },
);

const rendererComponentId = appendObject({
  __type__: rendererTypeId,
  _name: "",
  _objFlags: 0,
  __editorExtras__: {},
  node: { __id__: gameViewNodeId },
  _enabled: true,
  __prefab: null,
  arenaGraphics: { __id__: arenaLayer.graphicsId },
  entityGraphics: { __id__: entityLayer.graphicsId },
  effectGraphics: { __id__: effectLayer.graphicsId },
  overlayGraphics: { __id__: gameOverPanel.graphicsId },
  scoreLabel: { __id__: scoreLabel.labelId },
  rankLabel: { __id__: rankLabel.labelId },
  hintLabel: { __id__: hintLabel.labelId },
  finalResultLabel: { __id__: finalResultLabel.labelId },
  _id: stableFileId("component:Game2048Renderer"),
});
objects[gameViewNodeId]._components.push({ __id__: rendererComponentId });

objects[12] = {
  __type__: controllerTypeId,
  _name: "",
  _objFlags: 0,
  __editorExtras__: {},
  node: { __id__: 7 },
  _enabled: true,
  __prefab: null,
  renderer: { __id__: rendererComponentId },
  inputSurface: { __id__: 7 },
  gameOverPanel: { __id__: gameOverPanel.nodeId },
  restartButton: { __id__: restartButtonId },
  _id: stableFileId("component:Game2048SceneController"),
};

validateGeneratedScene(controllerTypeId, rendererTypeId, {
  controller: {
    renderer: rendererTypeId,
    inputSurface: "cc.Node",
    gameOverPanel: "cc.Node",
    restartButton: "cc.Button",
  },
  renderer: {
    arenaGraphics: "cc.Graphics",
    entityGraphics: "cc.Graphics",
    effectGraphics: "cc.Graphics",
    overlayGraphics: "cc.Graphics",
    scoreLabel: "cc.Label",
    rankLabel: "cc.Label",
    hintLabel: "cc.Label",
    finalResultLabel: "cc.Label",
  },
});

fs.writeFileSync(outputScenePath, `${JSON.stringify(objects, null, 2)}\n`, "utf8");

if (!fs.existsSync(outputMetaPath)) {
  fs.writeFileSync(
    outputMetaPath,
    `${JSON.stringify(
      {
        ver: "1.1.50",
        importer: "scene",
        imported: false,
        uuid: gameSceneUuid,
        files: [".json"],
        subMetas: {},
        userData: {},
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

console.log(
  `已生成 assets/scene/Game2048.scene，共 ${objects.length} 个序列化对象；` +
    `控制器 ${controllerTypeId}，渲染器 ${rendererTypeId}。`,
);
