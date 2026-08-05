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

/** 大厅头像和设置模块的稳定 Prefab 定义。 */
const prefabDefinitions = {
  Game2048SettingsPanel: {
    uuid: "ba7226c3-aa8a-44d5-bf59-0002b0d05121",
    path: "assets/resources/game/game2048/prefabs/Game2048SettingsPanel.prefab",
  },
  Game2048ProfilePanel: {
    uuid: "c33717a4-8d7a-4fa4-bb17-01c388c9ec29",
    path: "assets/resources/game/game2048/prefabs/Game2048ProfilePanel.prefab",
  },
  Game2048AvatarItem: {
    uuid: "ee7e45b0-c111-4736-ab96-c18251240877",
    path: "assets/resources/game/game2048/prefabs/Game2048AvatarItem.prefab",
  },
};

/** 生成器负责创建的正式资源目录及其稳定 UUID。 */
const resourceDirectoryUuids = {
  "assets/resources": "f4164d30-f176-4820-a47f-d8479689cf67",
  "assets/resources/game": "2173710f-e8b3-4394-a593-611974c87d89",
  "assets/resources/game/game2048": "57d00583-b3b6-4c5a-9137-6bdc21651e7b",
  "assets/resources/game/game2048/prefabs":
    "e3333c2c-8b08-4caf-99a1-f8177cb435c8",
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

/** 为节点追加全屏输入拦截组件。 */
function addBlockInputEvents(nodeId) {
  const componentId = appendObject({
    __type__: "cc.BlockInputEvents",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _id: stableFileId(`block-input:${objects[nodeId]._name}`),
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

/** 为输入框宿主追加透明 Sprite，满足 Creator EditBox 运行时约束。 */
function addTransparentSprite(nodeId) {
  const componentId = appendObject({
    __type__: "cc.Sprite",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 0 },
    _spriteFrame: null,
    _type: 0,
    _fillType: 0,
    _sizeMode: 1,
    _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 },
    _fillStart: 0,
    _fillRange: 0,
    _isTrimmedMode: true,
    _useGrayscale: false,
    _atlas: null,
    _id: stableFileId(`sprite:${objects[nodeId]._name}`),
  });
  objects[nodeId]._components.push({ __id__: componentId });
  return componentId;
}

/** 创建带独立 Graphics 底板的名称输入框。 */
function createEditBox(name, parentId, text, position, size) {
  const backgroundNodeId = createNode(
    `${name}Background`,
    parentId,
    position,
  );
  addUiTransform(backgroundNodeId, size.width, size.height);
  const graphicsId = addGraphics(backgroundNodeId);
  const nodeId = createNode(name, parentId, position);
  addUiTransform(nodeId, size.width, size.height);
  const textLabel = createLabel(
    `${name}TextLabel`,
    nodeId,
    text,
    { x: 0, y: 0 },
    { width: size.width - 28, height: size.height - 8 },
    24,
    { r: 218, g: 232, b: 248 },
    0,
  );
  const placeholderLabel = createLabel(
    `${name}PlaceholderLabel`,
    nodeId,
    "请输入名称",
    { x: 0, y: 0 },
    { width: size.width - 28, height: size.height - 8 },
    24,
    { r: 124, g: 148, b: 177 },
    0,
  );
  objects[placeholderLabel.nodeId]._active = false;
  const editBoxId = appendObject({
    __type__: "cc.EditBox",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    _textLabel: { __id__: textLabel.labelId },
    _placeholderLabel: { __id__: placeholderLabel.labelId },
    _returnType: 0,
    _string: text,
    _tabIndex: 0,
    _backgroundImage: null,
    _inputFlag: 5,
    _inputMode: 6,
    _maxLength: 10,
    editingDidBegan: [],
    textChanged: [],
    editingDidEnded: [],
    editingReturn: [],
    _id: stableFileId(`edit-box:${name}`),
  });
  objects[nodeId]._components.push({ __id__: editBoxId });
  addTransparentSprite(nodeId);
  return { nodeId, editBoxId, graphicsId };
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

/** 为任意节点追加业务脚本组件并返回组件编号。 */
function addBusinessScript(nodeId, typeId, fields, componentName) {
  const componentId = appendObject({
    __type__: typeId,
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: null,
    ...fields,
    _id: stableFileId(`component:${componentName}`),
  });
  objects[nodeId]._components.push({ __id__: componentId });
  return componentId;
}

/** 创建图形头像节点及其显式渲染器绑定。 */
function createAvatarRenderer(
  name,
  parentId,
  position,
  diameter,
  symbol,
) {
  const nodeId = createNode(name, parentId, position);
  addUiTransform(nodeId, diameter, diameter);
  const graphicsId = addGraphics(nodeId);
  const symbolLabel = createLabel(
    `${name}SymbolLabel`,
    nodeId,
    symbol,
    { x: 0, y: 0 },
    { width: diameter, height: diameter },
    Math.round(diameter * 0.35),
    { r: 255, g: 255, b: 255 },
  );
  const rendererId = addBusinessScript(
    nodeId,
    avatarRendererTypeId,
    {
      graphics: { __id__: graphicsId },
      symbolLabel: { __id__: symbolLabel.labelId },
    },
    `${name}:Game2048AvatarRenderer`,
  );
  return { nodeId, graphicsId, rendererId, symbolLabelId: symbolLabel.labelId };
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

/** 初始化一个独立 Prefab 对象表并返回根节点编号。 */
function preparePrefab(prefabName, width = 640, height = 1136) {
  currentSceneName = prefabName;
  objects = [
    {
      __type__: "cc.Prefab",
      _name: prefabName,
      _objFlags: 0,
      _native: "",
      data: { __id__: 1 },
      optimizationPolicy: 0,
      asyncLoadAssets: false,
      persistent: false,
    },
  ];
  const rootId = createNode(prefabName, null, { x: 0, y: 0 });
  addUiTransform(rootId, width, height);
  return rootId;
}

/** 为 Prefab 中每个节点补齐稳定 PrefabInfo。 */
function attachPrefabInfos() {
  for (let nodeId = 0; nodeId < objects.length; nodeId += 1) {
    const node = objects[nodeId];
    if (node?.__type__ !== "cc.Node") {
      continue;
    }
    const infoId = appendObject({
      __type__: "cc.PrefabInfo",
      root: { __id__: nodeId },
      asset: { __id__: 0 },
      fileId: stableFileId(`prefab-info:${node._name}:${nodeId}`),
    });
    node._prefab = { __id__: infoId };
  }
}

/** 校验 Prefab 内部引用、父子关系和脚本必填绑定。 */
function validateGeneratedPrefab(prefabName, scriptDefinitions) {
  const visit = (value) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (
      Object.keys(value).length === 1 &&
      Object.hasOwn(value, "__id__") &&
      (!Number.isInteger(value.__id__) ||
        value.__id__ < 0 ||
        value.__id__ >= objects.length)
    ) {
      throw new Error(`${prefabName} 包含越界 __id__：${value.__id__}`);
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  };
  visit(objects);

  for (const definition of scriptDefinitions) {
    const scripts = objects.filter(
      (object) => object?.__type__ === definition.typeId,
    );
    if (scripts.length !== definition.count) {
      throw new Error(
        `${prefabName} 必须包含 ${definition.count} 个 ${definition.name}，实际 ${scripts.length} 个。`,
      );
    }
    for (const script of scripts) {
      for (const [field, expectedType] of Object.entries(
        definition.bindings,
      )) {
        const target = objects[script[field]?.__id__];
        if (target?.__type__ !== expectedType) {
          throw new Error(
            `${definition.name}.${field} 未绑定到 ${expectedType}。`,
          );
        }
      }
    }
  }
}

/** 创建正式资源目录及其目录 Meta。 */
function ensureDirectory(directoryPath) {
  const relativeDirectory = path
    .relative(projectRoot, directoryPath)
    .split(path.sep)
    .join("/");
  const segments = relativeDirectory.split("/");
  for (let index = 1; index <= segments.length; index += 1) {
    const relativePath = segments.slice(0, index).join("/");
    const absolutePath = path.join(projectRoot, relativePath);
    fs.mkdirSync(absolutePath, { recursive: true });
    if (relativePath === "assets") {
      continue;
    }
    const metaPath = `${absolutePath}.meta`;
    if (fs.existsSync(metaPath)) {
      const expectedUuid = resourceDirectoryUuids[relativePath];
      if (expectedUuid) {
        const actualUuid = JSON.parse(
          fs.readFileSync(metaPath, "utf8"),
        ).uuid;
        if (actualUuid !== expectedUuid) {
          throw new Error(
            `${relativePath}.meta UUID ${actualUuid} 与稳定 UUID ${expectedUuid} 不一致。`,
          );
        }
      }
      continue;
    }
    const uuid = resourceDirectoryUuids[relativePath];
    if (!uuid) {
      throw new Error(`缺少正式资源目录 ${relativePath} 的稳定 UUID。`);
    }
    fs.writeFileSync(
      metaPath,
      `${JSON.stringify(
        {
          ver: "1.2.0",
          importer: "directory",
          imported: false,
          uuid,
          files: [],
          subMetas: {},
          userData: {},
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
}

/** 写入 Prefab 并保留定义中的稳定 UUID。 */
function writePrefab(prefabName) {
  const definition = prefabDefinitions[prefabName];
  const outputPath = path.join(projectRoot, definition.path);
  ensureDirectory(path.dirname(outputPath));
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(objects, null, 2)}\n`,
    "utf8",
  );
  const metaPath = `${outputPath}.meta`;
  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
    : {
        ver: "1.1.50",
        importer: "prefab",
        imported: false,
        uuid: definition.uuid,
        files: [".json"],
        subMetas: {},
        userData: {},
      };
  if (meta.uuid !== definition.uuid) {
    throw new Error(
      `${definition.path}.meta UUID ${meta.uuid} 与稳定 UUID ${definition.uuid} 不一致。`,
    );
  }
  meta.userData = { ...meta.userData, syncNodeName: prefabName };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  console.log(`已生成 ${definition.path}，共 ${objects.length} 个序列化对象。`);
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
const settingsPanelTypeId = resolveScriptTypeId(
  "Game2048SettingsPanel",
  "assets/app/ui/home/Game2048SettingsPanel.ts",
);
const profilePanelTypeId = resolveScriptTypeId(
  "Game2048ProfilePanel",
  "assets/app/ui/home/Game2048ProfilePanel.ts",
);
const avatarRendererTypeId = resolveScriptTypeId(
  "Game2048AvatarRenderer",
  "assets/app/ui/home/Game2048AvatarRenderer.ts",
);
const avatarItemTypeId = resolveScriptTypeId(
  "Game2048AvatarItem",
  "assets/app/ui/home/Game2048AvatarItem.ts",
);

/** 生成 2048 冷色设置弹窗 Prefab。 */
function generateSettingsPrefab() {
  const rootId = preparePrefab("Game2048SettingsPanel");
  const panelGraphicsId = addGraphics(rootId);
  addBlockInputEvents(rootId);

  const backdropNodeId = createNode(
    "SettingsBackdropButton",
    rootId,
    { x: 0, y: 270 },
  );
  addUiTransform(backdropNodeId, 640, 596);
  const backdropButtonId = addButton(backdropNodeId);

  createLabel(
    "SettingsTitleLabel",
    rootId,
    "设置",
    { x: 0, y: -69 },
    { width: 320, height: 56 },
    40,
    { r: 226, g: 242, b: 255 },
  );
  createLabel(
    "SettingsSubtitleLabel",
    rootId,
    "调整你的竞技场体验",
    { x: 0, y: -115 },
    { width: 360, height: 32 },
    18,
    { r: 133, g: 170, b: 205 },
  );
  const closeButton = createButton(
    "SettingsCloseButton",
    rootId,
    "关闭",
    { x: 216, y: -74 },
    { width: 72, height: 72 },
    17,
  );
  createLabel(
    "SoundTitleLabel",
    rootId,
    "游戏声音",
    { x: -135, y: -192 },
    { width: 190, height: 50 },
    28,
    { r: 220, g: 235, b: 252 },
    0,
  );
  const soundStateLabel = createLabel(
    "SoundStateLabel",
    rootId,
    "已开启",
    { x: 62, y: -192 },
    { width: 82, height: 38 },
    17,
    { r: 112, g: 218, b: 228 },
    2,
  );
  const soundButton = createButton(
    "SoundToggleButton",
    rootId,
    "",
    { x: 176, y: -192 },
    { width: 112, height: 72 },
    17,
  );
  createLabel(
    "VibrationTitleLabel",
    rootId,
    "震动反馈",
    { x: -135, y: -318 },
    { width: 190, height: 50 },
    28,
    { r: 220, g: 235, b: 252 },
    0,
  );
  const vibrationStateLabel = createLabel(
    "VibrationStateLabel",
    rootId,
    "已开启",
    { x: 62, y: -318 },
    { width: 82, height: 38 },
    17,
    { r: 112, g: 218, b: 228 },
    2,
  );
  const vibrationButton = createButton(
    "VibrationToggleButton",
    rootId,
    "",
    { x: 176, y: -318 },
    { width: 112, height: 72 },
    17,
  );
  createLabel(
    "SettingsHintLabel",
    rootId,
    "设置会自动保存",
    { x: 0, y: -472 },
    { width: 360, height: 40 },
    17,
    { r: 133, g: 170, b: 205 },
  );

  addBusinessScript(
    rootId,
    settingsPanelTypeId,
    {
      panelGraphics: { __id__: panelGraphicsId },
      soundButton: { __id__: soundButton.buttonId },
      vibrationButton: { __id__: vibrationButton.buttonId },
      closeButton: { __id__: closeButton.buttonId },
      backdropButton: { __id__: backdropButtonId },
      soundStateLabel: { __id__: soundStateLabel.labelId },
      vibrationStateLabel: { __id__: vibrationStateLabel.labelId },
    },
    "Game2048SettingsPanel",
  );
  attachPrefabInfos();
  validateGeneratedPrefab("Game2048SettingsPanel", [
    {
      name: "Game2048SettingsPanel",
      typeId: settingsPanelTypeId,
      count: 1,
      bindings: {
        panelGraphics: "cc.Graphics",
        soundButton: "cc.Button",
        vibrationButton: "cc.Button",
        closeButton: "cc.Button",
        backdropButton: "cc.Button",
        soundStateLabel: "cc.Label",
        vibrationStateLabel: "cc.Label",
      },
    },
  ]);
  writePrefab("Game2048SettingsPanel");
}

/** 生成 2048 玩家资料与头像选择弹窗 Prefab。 */
function generateProfilePrefab() {
  const rootId = preparePrefab("Game2048ProfilePanel");
  const overlayGraphicsId = addGraphics(rootId);
  addBlockInputEvents(rootId);
  const panelNodeId = createNode(
    "ProfilePanel",
    rootId,
    { x: 0, y: 0 },
  );
  addUiTransform(panelNodeId, 540, 910);
  const panelGraphicsId = addGraphics(panelNodeId);
  createLabel(
    "ProfileTitleLabel",
    panelNodeId,
    "玩家资料",
    { x: 0, y: 390 },
    { width: 320, height: 64 },
    40,
    { r: 224, g: 240, b: 255 },
  );
  const closeButton = createButton(
    "ProfileCloseButton",
    panelNodeId,
    "关闭",
    { x: 210, y: 390 },
    { width: 82, height: 72 },
    18,
  );
  const currentAvatar = createAvatarRenderer(
    "CurrentAvatar",
    panelNodeId,
    { x: -156, y: 280 },
    92,
    "2",
  );
  const currentNameLabel = createLabel(
    "CurrentPlayerNameLabel",
    panelNodeId,
    "霜蓝玩家",
    { x: 55, y: 292 },
    { width: 290, height: 50 },
    30,
    { r: 228, g: 244, b: 255 },
    0,
  );
  objects[currentNameLabel.labelId]._overflow = 2;
  createLabel(
    "CurrentPlayerCaptionLabel",
    panelNodeId,
    "当前玩家 · 可在下方修改名称",
    { x: 55, y: 250 },
    { width: 290, height: 34 },
    17,
    { r: 128, g: 173, b: 207 },
    0,
  );
  createLabel(
    "ProfileNameTitleLabel",
    panelNodeId,
    "修改名称",
    { x: -142, y: 170 },
    { width: 160, height: 48 },
    28,
    { r: 178, g: 205, b: 232 },
    0,
  );
  const nameInput = createEditBox(
    "ProfileNameEditBox",
    panelNodeId,
    "霜蓝玩家",
    { x: -72, y: 108 },
    { width: 300, height: 72 },
  );
  const nameInputDisplayLabel = createLabel(
    "ProfileNameDisplayLabel",
    panelNodeId,
    "霜蓝玩家",
    { x: -72, y: 108 },
    { width: 272, height: 48 },
    24,
    { r: 218, g: 232, b: 248 },
    0,
  );
  const saveNameButton = createButton(
    "ProfileSaveNameButton",
    panelNodeId,
    "保存",
    { x: 158, y: 108 },
    { width: 128, height: 72 },
    24,
  );
  const saveNameGraphicsId = addGraphics(saveNameButton.nodeId);
  createLabel(
    "AvatarListTitleLabel",
    panelNodeId,
    "选择头像",
    { x: -132, y: 30 },
    { width: 180, height: 48 },
    28,
    { r: 178, g: 205, b: 232 },
    0,
  );
  const avatarListContentId = createNode(
    "AvatarListContent",
    panelNodeId,
    { x: 0, y: -160 },
  );
  addUiTransform(avatarListContentId, 500, 330);
  const feedbackLabel = createLabel(
    "ProfileFeedbackLabel",
    panelNodeId,
    "点击头像立即切换，名称修改后请保存",
    { x: 0, y: -405 },
    { width: 460, height: 36 },
    17,
    { r: 92, g: 211, b: 201 },
  );
  const closeButtonGraphicsId = addGraphics(closeButton.nodeId);

  addBusinessScript(
    rootId,
    profilePanelTypeId,
    {
      overlayGraphics: { __id__: overlayGraphicsId },
      panelGraphics: { __id__: panelGraphicsId },
      closeButton: { __id__: closeButton.buttonId },
      closeButtonGraphics: { __id__: closeButtonGraphicsId },
      currentAvatarRenderer: { __id__: currentAvatar.rendererId },
      currentNameLabel: { __id__: currentNameLabel.labelId },
      nameEditBox: { __id__: nameInput.editBoxId },
      nameInputDisplayLabel: { __id__: nameInputDisplayLabel.labelId },
      nameInputGraphics: { __id__: nameInput.graphicsId },
      saveNameButton: { __id__: saveNameButton.buttonId },
      saveNameGraphics: { __id__: saveNameGraphicsId },
      avatarListContent: { __id__: avatarListContentId },
      feedbackLabel: { __id__: feedbackLabel.labelId },
    },
    "Game2048ProfilePanel",
  );
  attachPrefabInfos();
  validateGeneratedPrefab("Game2048ProfilePanel", [
    {
      name: "Game2048ProfilePanel",
      typeId: profilePanelTypeId,
      count: 1,
      bindings: {
        overlayGraphics: "cc.Graphics",
        panelGraphics: "cc.Graphics",
        closeButton: "cc.Button",
        closeButtonGraphics: "cc.Graphics",
        currentAvatarRenderer: avatarRendererTypeId,
        currentNameLabel: "cc.Label",
        nameEditBox: "cc.EditBox",
        nameInputDisplayLabel: "cc.Label",
        nameInputGraphics: "cc.Graphics",
        saveNameButton: "cc.Button",
        saveNameGraphics: "cc.Graphics",
        avatarListContent: "cc.Node",
        feedbackLabel: "cc.Label",
      },
    },
    {
      name: "Game2048AvatarRenderer",
      typeId: avatarRendererTypeId,
      count: 1,
      bindings: {
        graphics: "cc.Graphics",
        symbolLabel: "cc.Label",
      },
    },
  ]);
  writePrefab("Game2048ProfilePanel");
}

/** 生成对象池复用的 2048 头像列表项 Prefab。 */
function generateAvatarItemPrefab() {
  const rootId = preparePrefab("Game2048AvatarItem", 140, 145);
  const selectButtonId = addButton(rootId);
  const avatar = createAvatarRenderer(
    "Avatar",
    rootId,
    { x: 0, y: 22 },
    78,
    "2",
  );
  const nameLabel = createLabel(
    "AvatarNameLabel",
    rootId,
    "霜晶",
    { x: 0, y: -38 },
    { width: 130, height: 34 },
    22,
    { r: 205, g: 225, b: 245 },
  );
  const selectedLabel = createLabel(
    "AvatarSelectedLabel",
    rootId,
    "当前",
    { x: 0, y: -66 },
    { width: 120, height: 28 },
    18,
    { r: 105, g: 226, b: 232 },
  );
  addBusinessScript(
    rootId,
    avatarItemTypeId,
    {
      selectButton: { __id__: selectButtonId },
      avatarRenderer: { __id__: avatar.rendererId },
      nameLabel: { __id__: nameLabel.labelId },
      selectedLabel: { __id__: selectedLabel.labelId },
    },
    "Game2048AvatarItem",
  );
  attachPrefabInfos();
  validateGeneratedPrefab("Game2048AvatarItem", [
    {
      name: "Game2048AvatarItem",
      typeId: avatarItemTypeId,
      count: 1,
      bindings: {
        selectButton: "cc.Button",
        avatarRenderer: avatarRendererTypeId,
        nameLabel: "cc.Label",
        selectedLabel: "cc.Label",
      },
    },
    {
      name: "Game2048AvatarRenderer",
      typeId: avatarRendererTypeId,
      count: 1,
      bindings: {
        graphics: "cc.Graphics",
        symbolLabel: "cc.Label",
      },
    },
  ]);
  writePrefab("Game2048AvatarItem");
}

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
    { x: 0, y: 380 },
    { width: 540, height: 78 },
    50,
    { r: 255, g: 255, b: 255 },
  );
  createLabel(
    "LobbySubtitleLabel",
    viewNodeId,
    "数字吞噬 · 圆形竞技场",
    { x: 0, y: 326 },
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

  const profileNodeId = createNode(
    "LobbyProfileButton",
    viewNodeId,
    { x: -95, y: 500 },
  );
  addUiTransform(profileNodeId, 406, 92);
  const profileButtonId = addButton(profileNodeId);
  const profileAvatar = createAvatarRenderer(
    "LobbyProfileAvatar",
    profileNodeId,
    { x: -155, y: 0 },
    64,
    "2",
  );
  const playerNameLabel = createLabel(
    "LobbyPlayerNameLabel",
    profileNodeId,
    "霜蓝玩家",
    { x: -8, y: 13 },
    { width: 190, height: 40 },
    25,
    { r: 228, g: 244, b: 255 },
    0,
  );
  objects[playerNameLabel.labelId]._overflow = 2;
  createLabel(
    "LobbyPlayerCaptionLabel",
    profileNodeId,
    "2048 竞技者 · 点击编辑资料",
    { x: 32, y: -20 },
    { width: 270, height: 34 },
    16,
    { r: 125, g: 169, b: 204 },
    0,
  );
  const settingsButton = createButton(
    "LobbySettingsButton",
    viewNodeId,
    "设置",
    { x: 256, y: 500 },
    { width: 84, height: 84 },
    21,
  );

  const uiRootNodeId = createNode("LobbyUIRoot", 7, { x: 0, y: 0 });
  addUiTransform(uiRootNodeId, 640, 1136);

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
    playerNameLabel: { __id__: playerNameLabel.labelId },
    playerAvatarRenderer: { __id__: profileAvatar.rendererId },
    _id: stableFileId("component:LobbySceneView"),
  });
  objects[viewNodeId]._components.push({ __id__: viewComponentId });

  setCanvasController(
    lobbyControllerTypeId,
    {
      view: { __id__: viewComponentId },
      startButton: { __id__: startButton.buttonId },
      settingsButton: { __id__: settingsButton.buttonId },
      profileButton: { __id__: profileButtonId },
      uiRoot: { __id__: uiRootNodeId },
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
        settingsButton: "cc.Button",
        profileButton: "cc.Button",
        uiRoot: "cc.Node",
      },
    },
    {
      name: "LobbySceneView",
      typeId: lobbyViewTypeId,
      bindings: {
        backgroundGraphics: "cc.Graphics",
        statusLabel: "cc.Label",
        startLabel: "cc.Label",
        playerNameLabel: "cc.Label",
        playerAvatarRenderer: avatarRendererTypeId,
      },
    },
    {
      name: "Game2048AvatarRenderer",
      typeId: avatarRendererTypeId,
      bindings: {
        graphics: "cc.Graphics",
        symbolLabel: "cc.Label",
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

generateSettingsPrefab();
generateProfilePrefab();
generateAvatarItemPrefab();
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
      settingsPanelTypeId,
      profilePanelTypeId,
      avatarRendererTypeId,
      avatarItemTypeId,
    ].join("、"),
);
