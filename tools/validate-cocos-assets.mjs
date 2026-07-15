#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** 需要验证的正式 Scene 目录。 */
const sceneRoot = path.join(projectRoot, "assets/scene");

/** 需要验证的正式 Prefab 目录；蓝湖试验模块不纳入框架验收。 */
const prefabRoot = path.join(projectRoot, "assets/resources/prefabs");

/** 扫描并验证项目正式使用的 Cocos 序列化资源。 */
function main() {
  const files = [
    ...collectFiles(sceneRoot, ".scene"),
    ...collectFiles(prefabRoot, ".prefab").filter(
      (filePath) => !filePath.includes(`${path.sep}lanhu${path.sep}`),
    ),
  ];
  for (const filePath of files) {
    validateSerializedAsset(filePath);
  }
  console.log(`已校验 ${files.length} 个正式 Scene/Prefab 序列化资源。`);
}

/** 递归收集指定后缀的文件。 */
function collectFiles(root, extension) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

/** 校验单个 Scene 或 Prefab 的引用范围与节点组件关系。 */
function validateSerializedAsset(filePath) {
  const relativePath = path.relative(projectRoot, filePath);
  const objects = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(objects) || objects.length === 0) {
    throw new Error(`${relativePath} 不是有效的 Cocos 序列化对象数组。`);
  }

  validateReferenceRange(objects, relativePath);
  validateNodeRelations(objects, relativePath);

  if (filePath.endsWith("Lobby.scene")) {
    validateSceneBindings(objects, relativePath, false);
  } else if (filePath.endsWith("Game.scene")) {
    validateSceneBindings(objects, relativePath, true);
  } else if (filePath.endsWith("UIHomePanel.prefab")) {
    validatePrefabBindings(objects, relativePath, {
      titleLabel: "cc.Label",
      startButton: "cc.Button",
      startButtonLabel: "cc.Label",
      tipLabel: "cc.Label",
    });
  } else if (filePath.endsWith("UIResultPanel.prefab")) {
    validatePrefabBindings(objects, relativePath, {
      overlayGraphics: "cc.Graphics",
      panelGraphics: "cc.Graphics",
      titleLabel: "cc.Label",
      messageLabel: "cc.Label",
      primaryButton: "cc.Button",
      primaryButtonGraphics: "cc.Graphics",
      primaryButtonLabel: "cc.Label",
      homeButton: "cc.Button",
      homeButtonGraphics: "cc.Graphics",
    });
  }
}

/** 校验所有内部 __id__ 引用都没有越界。 */
function validateReferenceRange(objects, relativePath) {
  visitValue(objects, (referenceId) => {
    if (!Number.isInteger(referenceId) || referenceId < 0 || referenceId >= objects.length) {
      throw new Error(`${relativePath} 存在越界引用：__id__=${referenceId}`);
    }
  });
}

/** 校验节点父子关系和组件所属节点保持双向一致。 */
function validateNodeRelations(objects, relativePath) {
  objects.forEach((object, objectId) => {
    if (object.__type__ !== "cc.Node") {
      validateComponentOwner(objects, object, objectId, relativePath);
      return;
    }

    // 除 Prefab 根节点外，每个节点登记的父对象也必须反向包含当前节点。
    if (object._parent?.__id__ !== undefined) {
      const parent = objects[object._parent.__id__];
      const parentContainsNode = (parent?._children ?? []).some(
        (childReference) => childReference.__id__ === objectId,
      );
      if (!parentContainsNode) {
        throw new Error(
          `${relativePath} 的节点 ${object._name} 没有登记在父节点 children 中。`,
        );
      }
    }

    for (const childReference of object._children ?? []) {
      const child = objects[childReference.__id__];
      if (child?.__type__ !== "cc.Node" || child._parent?.__id__ !== objectId) {
        throw new Error(
          `${relativePath} 的节点 ${object._name} 存在不一致的父子引用。`,
        );
      }
    }

    for (const componentReference of object._components ?? []) {
      const component = objects[componentReference.__id__];
      if (!component || component.node?.__id__ !== objectId) {
        throw new Error(
          `${relativePath} 的节点 ${object._name} 存在不一致的组件引用。`,
        );
      }
    }
  });
}

/** 校验带 node 引用的组件也登记在所属节点 components 中。 */
function validateComponentOwner(objects, component, componentId, relativePath) {
  if (component.node?.__id__ === undefined) {
    return;
  }
  const ownerNode = objects[component.node.__id__];
  const ownerContainsComponent = (ownerNode?._components ?? []).some(
    (componentReference) => componentReference.__id__ === componentId,
  );
  if (ownerNode?.__type__ !== "cc.Node" || !ownerContainsComponent) {
    throw new Error(
      `${relativePath} 的组件 ${component.__type__} 没有登记在所属节点 components 中。`,
    );
  }
}

/** 校验 Lobby/Game 场景脚本的必填 Inspector 引用。 */
function validateSceneBindings(objects, relativePath, requireAudioSource) {
  const canvasId = objects.findIndex(
    (object) => object.__type__ === "cc.Node" && object._name === "Canvas",
  );
  if (canvasId < 0) {
    throw new Error(`${relativePath} 缺少 Canvas 节点。`);
  }

  const canvas = objects[canvasId];
  const scriptIds = (canvas._components ?? [])
    .map((item) => item.__id__)
    .filter((id) => !String(objects[id]?.__type__).startsWith("cc."));
  if (scriptIds.length !== 1) {
    throw new Error(`${relativePath} 的 Canvas 场景脚本数量不是 1。`);
  }

  const script = objects[scriptIds[0]];
  const uiRoot = objects[script.uiRoot?.__id__];
  if (uiRoot?.__type__ !== "cc.Node" || uiRoot._name !== "UIRoot") {
    throw new Error(`${relativePath} 的场景脚本没有正确绑定 UIRoot。`);
  }
  if (
    requireAudioSource &&
    objects[script.audioSource?.__id__]?.__type__ !== "cc.AudioSource"
  ) {
    throw new Error(`${relativePath} 的 GameScene 没有正确绑定 AudioSource。`);
  }
}

/** 校验业务 Prefab 脚本的必填属性绑定及目标组件类型。 */
function validatePrefabBindings(objects, relativePath, requiredBindings) {
  const candidateScripts = objects.filter(
    (object) =>
      object?.node?.__id__ !== undefined &&
      !String(object.__type__).startsWith("cc.") &&
      Object.keys(requiredBindings).some((field) => Object.hasOwn(object, field)),
  );
  if (candidateScripts.length !== 1) {
    throw new Error(`${relativePath} 无法确定唯一的业务面板脚本。`);
  }

  const script = candidateScripts[0];
  for (const [field, expectedType] of Object.entries(requiredBindings)) {
    const component = objects[script[field]?.__id__];
    if (component?.__type__ !== expectedType) {
      throw new Error(
        `${relativePath} 的必填字段 ${field} 未绑定到 ${expectedType}。`,
      );
    }
  }
}

/** 递归遍历 JSON 中的 Cocos 内部引用。 */
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

main();
