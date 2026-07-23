#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "../../..");

/** Creator 生成的最小场景模板路径。 */
const templateScenePath = path.join(projectRoot, "assets/scene/Boot.scene");

/** SceneGlobals 必须完整保留的九种对象类型。 */
const sceneGlobalTypes = new Set([
  "cc.SceneGlobals",
  "cc.AmbientInfo",
  "cc.ShadowsInfo",
  "cc.SkyboxInfo",
  "cc.FogInfo",
  "cc.OctreeInfo",
  "cc.SkinInfo",
  "cc.LightProbeInfo",
  "cc.PostSettingsInfo",
]);

/** 当前场景缺失全局对象时使用的 Creator 3.8.4 默认配置。 */
const defaultSceneGlobalObjects = [
  {
    __type__: "cc.SceneGlobals",
    ambient: { __id__: 16 },
    shadows: { __id__: 17 },
    _skybox: { __id__: 18 },
    fog: { __id__: 19 },
    octree: { __id__: 20 },
    skin: { __id__: 21 },
    lightProbeInfo: { __id__: 22 },
    postSettings: { __id__: 23 },
    bakedWithStationaryMainLight: false,
    bakedWithHighpLightmap: false,
  },
  {
    __type__: "cc.AmbientInfo",
    _skyColorHDR: {
      __type__: "cc.Vec4",
      x: 0.2,
      y: 0.5,
      z: 0.8,
      w: 0.520833125,
    },
    _skyColor: {
      __type__: "cc.Vec4",
      x: 0.2,
      y: 0.5,
      z: 0.8,
      w: 0.520833125,
    },
    _skyIllumHDR: 20000,
    _skyIllum: 20000,
    _groundAlbedoHDR: {
      __type__: "cc.Vec4",
      x: 0.2,
      y: 0.2,
      z: 0.2,
      w: 1,
    },
    _groundAlbedo: {
      __type__: "cc.Vec4",
      x: 0.2,
      y: 0.2,
      z: 0.2,
      w: 1,
    },
    _skyColorLDR: {
      __type__: "cc.Vec4",
      x: 0.452588,
      y: 0.607642,
      z: 0.755699,
      w: 0,
    },
    _skyIllumLDR: 0.8,
    _groundAlbedoLDR: {
      __type__: "cc.Vec4",
      x: 0.618555,
      y: 0.577848,
      z: 0.544564,
      w: 0,
    },
  },
  {
    __type__: "cc.ShadowsInfo",
    _enabled: false,
    _type: 0,
    _normal: { __type__: "cc.Vec3", x: 0, y: 1, z: 0 },
    _distance: 0,
    _planeBias: 1,
    _shadowColor: {
      __type__: "cc.Color",
      r: 76,
      g: 76,
      b: 76,
      a: 255,
    },
    _maxReceived: 4,
    _size: { __type__: "cc.Vec2", x: 1024, y: 1024 },
  },
  {
    __type__: "cc.SkyboxInfo",
    _envLightingType: 0,
    _envmapHDR: {
      __uuid__: "d032ac98-05e1-4090-88bb-eb640dcb5fc1@b47c0",
      __expectedType__: "cc.TextureCube",
    },
    _envmap: {
      __uuid__: "d032ac98-05e1-4090-88bb-eb640dcb5fc1@b47c0",
      __expectedType__: "cc.TextureCube",
    },
    _envmapLDR: {
      __uuid__: "6f01cf7f-81bf-4a7e-bd5d-0afc19696480@b47c0",
      __expectedType__: "cc.TextureCube",
    },
    _diffuseMapHDR: null,
    _diffuseMapLDR: null,
    _enabled: true,
    _useHDR: true,
    _editableMaterial: null,
    _reflectionHDR: null,
    _reflectionLDR: null,
    _rotationAngle: 0,
  },
  {
    __type__: "cc.FogInfo",
    _type: 0,
    _fogColor: {
      __type__: "cc.Color",
      r: 200,
      g: 200,
      b: 200,
      a: 255,
    },
    _enabled: false,
    _fogDensity: 0.3,
    _fogStart: 0.5,
    _fogEnd: 300,
    _fogAtten: 5,
    _fogTop: 1.5,
    _fogRange: 1.2,
    _accurate: false,
  },
  {
    __type__: "cc.OctreeInfo",
    _enabled: false,
    _minPos: {
      __type__: "cc.Vec3",
      x: -1024,
      y: -1024,
      z: -1024,
    },
    _maxPos: {
      __type__: "cc.Vec3",
      x: 1024,
      y: 1024,
      z: 1024,
    },
    _depth: 8,
  },
  {
    __type__: "cc.SkinInfo",
    _enabled: true,
    _blurRadius: 0.01,
    _sssIntensity: 3,
  },
  {
    __type__: "cc.LightProbeInfo",
    _giScale: 1,
    _giSamples: 1024,
    _bounces: 2,
    _reduceRinging: 0,
    _showProbe: true,
    _showWireframe: true,
    _showConvex: false,
    _data: null,
    _lightProbeSphereVolume: 1,
  },
  {
    __type__: "cc.PostSettingsInfo",
    _toneMappingType: 0,
  },
];

/** 提取完整模板；业务对象永远从 SceneGlobals 之后开始追加。 */
const rawTemplateObjects = JSON.parse(
  fs.readFileSync(templateScenePath, "utf8"),
);
const importedSceneGlobalObjects = rawTemplateObjects.filter((object) =>
  sceneGlobalTypes.has(object?.__type__),
);
const templateObjects = [
  ...rawTemplateObjects.slice(0, 15),
  ...(importedSceneGlobalObjects.length === sceneGlobalTypes.size
    ? importedSceneGlobalObjects
    : defaultSceneGlobalObjects),
];

/** Creator 编辑器实际编译脚本目录。 */
const creatorChunkRoot = path.join(
  projectRoot,
  "temp/programming/packer-driver/targets/editor/chunks",
);

/** 三个正式场景的稳定 UUID。 */
const sceneDefinitions = {
  Boot: {
    uuid: readAssetUuid("assets/scene/Boot.scene"),
    path: "assets/scene/Boot.scene",
  },
  Lobby: {
    uuid: "8d9e4cf3-7208-4cc5-8b67-1d8b2ca50c40",
    path: "assets/scene/Lobby.scene",
  },
  Game2048: {
    uuid: "b6b24ad3-0bc8-4c9a-b81b-aec3e2ce63b8",
    path: "assets/scene/Game2048.scene",
  },
};

/** Cocos 压缩 UUID 使用的字符表。 */
const compressedUuidAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 当前正在生成的场景对象数组。 */
let objects = [];

/** 当前场景名，用于生成跨场景不冲突的稳定 fileId。 */
let currentSceneName = "";

/** 读取已存在资源 Meta 中的 UUID。 */
function readAssetUuid(sourcePath) {
  const metaPath = path.join(projectRoot, `${sourcePath}.meta`);
  if (!fs.existsSync(metaPath)) {
    throw new Error(`${sourcePath}.meta 不存在。`);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  if (typeof meta.uuid !== "string" || meta.uuid.length === 0) {
    throw new Error(`${sourcePath}.meta 缺少 UUID。`);
  }
  return meta.uuid;
}

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
    .update(`game2048:${currentSceneName}:${key}`)
    .digest("base64")
    .replaceAll("/", "_")
    .slice(0, 22);
}

/** 从最小模板初始化一个独立场景。 */
function prepareScene(sceneName, sceneUuid) {
  currentSceneName = sceneName;
  objects = structuredClone(templateObjects);
  objects[0]._name = sceneName;
  objects[1]._name = sceneName;
  objects[1]._id = sceneUuid;
  objects[14].fileId = sceneUuid;

  // 只保留模板相机，业务层全部由本生成器重新构建。
  objects[7]._children = [{ __id__: 8 }];
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

/** 创建一个透明命中节点、Button 组件和文字节点。 */
function createButton(
  name,
  parentId,
  text,
  position,
  size,
  fontSize = 28,
) {
  const nodeId = createNode(name, parentId, position);
  addUiTransform(nodeId, size.width, size.height);
  const buttonId = addButton(nodeId);
  const label = createLabel(
    `${name}Label`,
    nodeId,
    text,
    { x: 0, y: 0 },
    { width: size.width - 20, height: size.height - 8 },
    fontSize,
    { r: 255, g: 255, b: 255 },
  );
  return { nodeId, buttonId, labelId: label.labelId };
}

/** 替换模板画布上的业务控制器组件。 */
function setCanvasController(typeId, fields, componentName) {
  objects[12] = {
    __type__: typeId,
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: 7 },
    _enabled: true,
    __prefab: null,
    ...fields,
    _id: stableFileId(`component:${componentName}`),
  };
}

/** 校验引用范围、父子关系、脚本数量和所有必填绑定类型。 */
function validateGeneratedScene(scriptDefinitions) {
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

  const sceneGlobals = objects.find(
    (object) => object?.__type__ === "cc.SceneGlobals",
  );
  const sceneGlobalBindings = {
    ambient: "cc.AmbientInfo",
    shadows: "cc.ShadowsInfo",
    _skybox: "cc.SkyboxInfo",
    fog: "cc.FogInfo",
    octree: "cc.OctreeInfo",
    skin: "cc.SkinInfo",
    lightProbeInfo: "cc.LightProbeInfo",
    postSettings: "cc.PostSettingsInfo",
  };
  for (const [field, expectedType] of Object.entries(sceneGlobalBindings)) {
    const target = objects[sceneGlobals?.[field]?.__id__];
    if (target?.__type__ !== expectedType) {
      throw new Error(
        `${currentSceneName} 的 SceneGlobals.${field} 未绑定到 ${expectedType}。`,
      );
    }
  }

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
    for (const componentReference of object._components ?? []) {
      const component = objects[componentReference.__id__];
      if (component?.node?.__id__ !== objectId) {
        throw new Error(
          `${object._name} 与组件 ${component?.__type__ ?? "unknown"} 节点引用不一致。`,
        );
      }
    }
  }

  for (const definition of scriptDefinitions) {
    const scripts = objects.filter(
      (object) => object?.__type__ === definition.typeId,
    );
    if (scripts.length !== 1) {
      throw new Error(
        `${currentSceneName} 必须包含一个 ${definition.name}，实际 ${scripts.length} 个。`,
      );
    }
    for (const [field, expectedType] of Object.entries(
      definition.bindings,
    )) {
      const target = objects[scripts[0][field]?.__id__];
      if (target?.__type__ !== expectedType) {
        throw new Error(
          `${definition.name}.${field} 未绑定到预期类型 ${expectedType}。`,
        );
      }
    }
  }
}

/** 写入场景并在首次生成时创建稳定 Meta。 */
function writeScene(sceneName) {
  const definition = sceneDefinitions[sceneName];
  const outputPath = path.join(projectRoot, definition.path);
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(objects, null, 2)}\n`,
    "utf8",
  );

  const metaPath = `${outputPath}.meta`;
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(
      metaPath,
      `${JSON.stringify(
        {
          ver: "1.1.50",
          importer: "scene",
          imported: false,
          uuid: definition.uuid,
          files: [".json"],
          subMetas: {},
          userData: {},
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } else {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (meta.uuid !== definition.uuid) {
      throw new Error(
        `${definition.path}.meta UUID ${meta.uuid} 与稳定 UUID ${definition.uuid} 不一致。`,
      );
    }
  }
  console.log(
    `已生成 ${definition.path}，共 ${objects.length} 个序列化对象。`,
  );
}

const bootControllerTypeId = resolveScriptTypeId(
  "BootScene",
  "assets/app/scenes/BootScene.ts",
);
const bootViewTypeId = resolveScriptTypeId(
  "BootSceneView",
  "assets/app/ui/common/BootSceneView.ts",
);
const lobbyControllerTypeId = resolveScriptTypeId(
  "LobbySceneController",
  "assets/app/scenes/LobbySceneController.ts",
);
const lobbyViewTypeId = resolveScriptTypeId(
  "LobbySceneView",
  "assets/app/ui/home/LobbySceneView.ts",
);
const gameControllerTypeId = resolveScriptTypeId(
  "Game2048SceneController",
  "assets/app/scenes/Game2048SceneController.ts",
);
const gameRendererTypeId = resolveScriptTypeId(
  "Game2048Renderer",
  "assets/app/ui/game/Game2048Renderer.ts",
);

/** 生成独立启动场景。 */
function generateBootScene() {
  const definition = sceneDefinitions.Boot;
  prepareScene("Boot", definition.uuid);

  const viewNodeId = createNode("BootView", 7, { x: 0, y: 0 });
  addUiTransform(viewNodeId, 640, 1136);
  const backgroundLayer = createGraphicsLayer(
    "BootBackgroundGraphics",
    viewNodeId,
  );
  const progressLayer = createGraphicsLayer(
    "BootProgressGraphics",
    viewNodeId,
  );
  createLabel(
    "BootTitleLabel",
    viewNodeId,
    "2048",
    { x: 0, y: 302 },
    { width: 420, height: 100 },
    82,
    { r: 255, g: 255, b: 255 },
  );
  createLabel(
    "BootSubtitleLabel",
    viewNodeId,
    "ARENA",
    { x: 0, y: 232 },
    { width: 360, height: 58 },
    30,
    { r: 171, g: 188, b: 218 },
  );
  const statusLabel = createLabel(
    "BootStatusLabel",
    viewNodeId,
    "正在初始化核心模块",
    { x: 0, y: -162 },
    { width: 520, height: 52 },
    24,
    { r: 215, g: 226, b: 244 },
  );
  const percentLabel = createLabel(
    "BootPercentLabel",
    viewNodeId,
    "0%",
    { x: 0, y: -270 },
    { width: 160, height: 54 },
    28,
    { r: 157, g: 146, b: 255 },
  );
  const retryButton = createButton(
    "BootRetryButton",
    viewNodeId,
    "重试",
    { x: 0, y: -350 },
    { width: 260, height: 70 },
  );

  const viewComponentId = appendObject({
    __type__: bootViewTypeId,
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: viewNodeId },
    _enabled: true,
    __prefab: null,
    backgroundGraphics: { __id__: backgroundLayer.graphicsId },
    progressGraphics: { __id__: progressLayer.graphicsId },
    statusLabel: { __id__: statusLabel.labelId },
    percentLabel: { __id__: percentLabel.labelId },
    retryNode: { __id__: retryButton.nodeId },
    _id: stableFileId("component:BootSceneView"),
  });
  objects[viewNodeId]._components.push({ __id__: viewComponentId });

  setCanvasController(
    bootControllerTypeId,
    {
      view: { __id__: viewComponentId },
      retryButton: { __id__: retryButton.buttonId },
    },
    "BootScene",
  );

  validateGeneratedScene([
    {
      name: "BootScene",
      typeId: bootControllerTypeId,
      bindings: {
        view: bootViewTypeId,
        retryButton: "cc.Button",
      },
    },
    {
      name: "BootSceneView",
      typeId: bootViewTypeId,
      bindings: {
        backgroundGraphics: "cc.Graphics",
        progressGraphics: "cc.Graphics",
        statusLabel: "cc.Label",
        percentLabel: "cc.Label",
        retryNode: "cc.Node",
      },
    },
  ]);
  writeScene("Boot");
}

/** 生成 2048 大厅场景。 */
function generateLobbyScene() {
  const definition = sceneDefinitions.Lobby;
  prepareScene("Lobby", definition.uuid);

  const viewNodeId = createNode("LobbyView", 7, { x: 0, y: 0 });
  addUiTransform(viewNodeId, 640, 1136);
  const backgroundLayer = createGraphicsLayer(
    "LobbyBackgroundGraphics",
    viewNodeId,
  );
  createLabel(
    "LobbyTitleLabel",
    viewNodeId,
    "2048 ARENA",
    { x: 0, y: 440 },
    { width: 540, height: 78 },
    50,
    { r: 255, g: 255, b: 255 },
  );
  createLabel(
    "LobbySubtitleLabel",
    viewNodeId,
    "数字吞噬 · 圆形竞技场",
    { x: 0, y: 382 },
    { width: 500, height: 48 },
    23,
    { r: 166, g: 184, b: 214 },
  );
  createLabel(
    "LobbyRuleLabel",
    viewNodeId,
    "收集数字直接成长\n角色相撞时大数吞噬小数，相同数字合并",
    { x: 0, y: -232 },
    { width: 480, height: 94 },
    22,
    { r: 212, g: 224, b: 244 },
  );
  const startButton = createButton(
    "StartGameButton",
    viewNodeId,
    "开始游戏",
    { x: 0, y: -382 },
    { width: 380, height: 88 },
    32,
  );
  const statusLabel = createLabel(
    "LobbyStatusLabel",
    viewNodeId,
    "滑动或 WASD 控制方向 · 相同数字自动合并",
    { x: 0, y: -490 },
    { width: 580, height: 48 },
    19,
    { r: 145, g: 163, b: 192 },
  );

  const viewComponentId = appendObject({
    __type__: lobbyViewTypeId,
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: viewNodeId },
    _enabled: true,
    __prefab: null,
    backgroundGraphics: { __id__: backgroundLayer.graphicsId },
    statusLabel: { __id__: statusLabel.labelId },
    startLabel: { __id__: startButton.labelId },
    _id: stableFileId("component:LobbySceneView"),
  });
  objects[viewNodeId]._components.push({ __id__: viewComponentId });

  setCanvasController(
    lobbyControllerTypeId,
    {
      view: { __id__: viewComponentId },
      startButton: { __id__: startButton.buttonId },
    },
    "LobbySceneController",
  );

  validateGeneratedScene([
    {
      name: "LobbySceneController",
      typeId: lobbyControllerTypeId,
      bindings: {
        view: lobbyViewTypeId,
        startButton: "cc.Button",
      },
    },
    {
      name: "LobbySceneView",
      typeId: lobbyViewTypeId,
      bindings: {
        backgroundGraphics: "cc.Graphics",
        statusLabel: "cc.Label",
        startLabel: "cc.Label",
      },
    },
  ]);
  writeScene("Lobby");
}

/** 生成 2048 圆形竞技场场景。 */
function generateGameScene() {
  const definition = sceneDefinitions.Game2048;
  prepareScene("Game2048", definition.uuid);

  const gameViewNodeId = createNode("GameView", 7, { x: 0, y: 0 });
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
  const backButton = createButton(
    "BackToLobbyButton",
    hudNodeId,
    "大厅",
    { x: -241, y: 178 },
    { width: 126, height: 50 },
    22,
  );

  const gameOverPanel = createGraphicsLayer("GameOverPanel", 7, false);
  createLabel(
    "GameOverTitle",
    gameOverPanel.nodeId,
    "GAME OVER",
    { x: 0, y: 126 },
    { width: 440, height: 72 },
    52,
    { r: 255, g: 255, b: 255 },
  );
  const finalResultLabel = createLabel(
    "FinalResultLabel",
    gameOverPanel.nodeId,
    "最终队首  2\n最终得分  0",
    { x: 0, y: 20 },
    { width: 440, height: 118 },
    30,
    { r: 219, g: 229, b: 245 },
  );
  const restartButton = createButton(
    "RestartButton",
    gameOverPanel.nodeId,
    "重新开始",
    { x: 0, y: -114 },
    { width: 348, height: 72 },
    29,
  );
  const gameOverLobbyButton = createButton(
    "GameOverLobbyButton",
    gameOverPanel.nodeId,
    "返回大厅",
    { x: 0, y: -210 },
    { width: 348, height: 64 },
    26,
  );

  const rendererComponentId = appendObject({
    __type__: gameRendererTypeId,
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

  setCanvasController(
    gameControllerTypeId,
    {
      renderer: { __id__: rendererComponentId },
      inputSurface: { __id__: 7 },
      gameOverPanel: { __id__: gameOverPanel.nodeId },
      restartButton: { __id__: restartButton.buttonId },
      backButton: { __id__: backButton.buttonId },
      gameOverLobbyButton: { __id__: gameOverLobbyButton.buttonId },
    },
    "Game2048SceneController",
  );

  validateGeneratedScene([
    {
      name: "Game2048SceneController",
      typeId: gameControllerTypeId,
      bindings: {
        renderer: gameRendererTypeId,
        inputSurface: "cc.Node",
        gameOverPanel: "cc.Node",
        restartButton: "cc.Button",
        backButton: "cc.Button",
        gameOverLobbyButton: "cc.Button",
      },
    },
    {
      name: "Game2048Renderer",
      typeId: gameRendererTypeId,
      bindings: {
        arenaGraphics: "cc.Graphics",
        entityGraphics: "cc.Graphics",
        effectGraphics: "cc.Graphics",
        overlayGraphics: "cc.Graphics",
        scoreLabel: "cc.Label",
        rankLabel: "cc.Label",
        hintLabel: "cc.Label",
        finalResultLabel: "cc.Label",
      },
    },
  ]);
  writeScene("Game2048");
}

generateBootScene();
generateLobbyScene();
generateGameScene();

console.log(
  "三场景脚本类 ID：" +
    [
      bootControllerTypeId,
      bootViewTypeId,
      lobbyControllerTypeId,
      lobbyViewTypeId,
      gameControllerTypeId,
      gameRendererTypeId,
    ].join("、"),
);
