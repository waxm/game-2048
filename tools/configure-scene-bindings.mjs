#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** UI 节点使用的 Cocos 2D Layer。 */
const uiLayer = 33554432;

/** 需要配置显式节点绑定的场景。 */
const sceneConfigs = [
  {
    name: "Lobby",
    path: "assets/scene/Lobby.scene",
    requireAudioSource: false,
  },
  {
    name: "Game",
    path: "assets/scene/Game.scene",
    requireAudioSource: true,
  },
];

/** 配置全部场景并在写入前后校验引用结构。 */
function main() {
  for (const config of sceneConfigs) {
    configureScene(config);
  }
  console.log("Lobby.scene 与 Game.scene 的显式节点绑定已配置完成。");
}

/** 为单个场景创建或复用 UIRoot，并绑定场景脚本所需组件。 */
function configureScene(config) {
  const scenePath = path.join(projectRoot, config.path);
  const objects = JSON.parse(fs.readFileSync(scenePath, "utf8"));
  validateReferenceRange(objects, config.name);

  const canvasId = findNodeId(objects, "Canvas");
  const canvas = objects[canvasId];
  const scriptId = findSceneScriptId(objects, canvas, config.name);
  const script = objects[scriptId];
  const uiRootId = ensureUIRoot(objects, canvasId, config.name);
  script.uiRoot = reference(uiRootId);

  if (config.requireAudioSource) {
    const audioSourceId = ensureAudioSource(objects, canvasId, config.name);
    script.audioSource = reference(audioSourceId);
  }

  validateSceneBindings(objects, config, scriptId, uiRootId);
  fs.writeFileSync(scenePath, `${JSON.stringify(objects, null, 2)}\n`, "utf8");
}

/** 获取场景中名称唯一的节点编号。 */
function findNodeId(objects, nodeName) {
  const nodeIds = objects
    .map((object, index) => ({ object, index }))
    .filter(({ object }) => object.__type__ === "cc.Node" && object._name === nodeName)
    .map(({ index }) => index);
  if (nodeIds.length !== 1) {
    throw new Error(`场景中必须有且只有一个 ${nodeName} 节点。`);
  }
  return nodeIds[0];
}

/** 从 Canvas 已挂载组件中取得唯一的业务场景脚本。 */
function findSceneScriptId(objects, canvas, sceneName) {
  const scriptIds = (canvas._components ?? [])
    .map((item) => item.__id__)
    .filter((id) => !String(objects[id]?.__type__).startsWith("cc."));
  if (scriptIds.length !== 1) {
    throw new Error(`${sceneName}.Canvas 必须挂载且只挂载一个场景业务脚本。`);
  }
  return scriptIds[0];
}

/** 创建或复用 Canvas 下的 UIRoot 节点。 */
function ensureUIRoot(objects, canvasId, sceneName) {
  const canvas = objects[canvasId];
  const existingId = (canvas._children ?? [])
    .map((item) => item.__id__)
    .find((id) => objects[id]?.__type__ === "cc.Node" && objects[id]._name === "UIRoot");
  if (existingId !== undefined) {
    ensureUITransform(objects, existingId, sceneName);
    return existingId;
  }

  const nodeId = objects.length;
  const transformId = nodeId + 1;
  objects.push({
    __type__: "cc.Node",
    _name: "UIRoot",
    _objFlags: 0,
    __editorExtras__: {},
    _parent: reference(canvasId),
    _children: [],
    _active: true,
    _components: [reference(transformId)],
    _prefab: null,
    _lpos: vector3(0, 0, 0),
    _lrot: quaternionIdentity(),
    _lscale: vector3(1, 1, 1),
    _mobility: 0,
    _layer: uiLayer,
    _euler: vector3(0, 0, 0),
    _id: createStableId(`${sceneName}:UIRoot`),
  });
  objects.push(createUITransform(nodeId, `${sceneName}:UIRoot:UITransform`));
  canvas._children.push(reference(nodeId));
  return nodeId;
}

/** 确保已有 UIRoot 带有尺寸正确的 UITransform。 */
function ensureUITransform(objects, nodeId, sceneName) {
  const node = objects[nodeId];
  const transformId = (node._components ?? [])
    .map((item) => item.__id__)
    .find((id) => objects[id]?.__type__ === "cc.UITransform");
  if (transformId !== undefined) {
    objects[transformId]._contentSize = size(640, 1136);
    return transformId;
  }

  const newTransformId = objects.length;
  objects.push(createUITransform(nodeId, `${sceneName}:UIRoot:UITransform`));
  node._components.push(reference(newTransformId));
  return newTransformId;
}

/** 创建或复用 Game Canvas 上的 AudioSource。 */
function ensureAudioSource(objects, canvasId, sceneName) {
  const canvas = objects[canvasId];
  const existingId = (canvas._components ?? [])
    .map((item) => item.__id__)
    .find((id) => objects[id]?.__type__ === "cc.AudioSource");
  if (existingId !== undefined) {
    return existingId;
  }

  const audioSourceId = objects.length;
  objects.push({
    __type__: "cc.AudioSource",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: reference(canvasId),
    _enabled: true,
    __prefab: null,
    _clip: null,
    _loop: false,
    _playOnAwake: false,
    _volume: 1,
    _id: createStableId(`${sceneName}:AudioSource`),
  });
  canvas._components.push(reference(audioSourceId));
  return audioSourceId;
}

/** 创建固定为设计分辨率的 UITransform 序列化对象。 */
function createUITransform(nodeId, seed) {
  return {
    __type__: "cc.UITransform",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: reference(nodeId),
    _enabled: true,
    __prefab: null,
    _contentSize: size(640, 1136),
    _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
    _id: createStableId(seed),
  };
}

/** 校验生成后的节点、组件和脚本属性绑定完整。 */
function validateSceneBindings(objects, config, scriptId, uiRootId) {
  validateReferenceRange(objects, config.name);
  const script = objects[scriptId];
  if (script.uiRoot?.__id__ !== uiRootId) {
    throw new Error(`${config.name}Scene.uiRoot 绑定失败。`);
  }
  if (
    config.requireAudioSource &&
    objects[script.audioSource?.__id__]?.__type__ !== "cc.AudioSource"
  ) {
    throw new Error(`${config.name}Scene.audioSource 绑定失败。`);
  }
}

/** 递归校验所有 __id__ 引用都位于序列化对象数组范围内。 */
function validateReferenceRange(objects, sceneName) {
  visitValue(objects, (referenceId) => {
    if (!Number.isInteger(referenceId) || referenceId < 0 || referenceId >= objects.length) {
      throw new Error(`${sceneName}.scene 存在越界引用：__id__=${referenceId}`);
    }
  });
}

/** 递归遍历 JSON 值中的内部引用。 */
function visitValue(value, onReference) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitValue(item, onReference));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Object.keys(value).length === 1 && Object.hasOwn(value, "__id__")) {
    onReference(value.__id__);
    return;
  }
  Object.values(value).forEach((item) => visitValue(item, onReference));
}

/** 创建稳定的 Cocos 对象内部 ID，重复运行不会改变。 */
function createStableId(seed) {
  return crypto.createHash("sha256").update(seed).digest("base64").slice(0, 22);
}

/** 创建序列化对象内部引用。 */
function reference(id) {
  return { __id__: id };
}

/** 创建 Cocos Vec3 序列化值。 */
function vector3(x, y, z) {
  return { __type__: "cc.Vec3", x, y, z };
}

/** 创建 Cocos 四元数单位旋转。 */
function quaternionIdentity() {
  return { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 };
}

/** 创建 Cocos Size 序列化值。 */
function size(width, height) {
  return { __type__: "cc.Size", width, height };
}

main();
