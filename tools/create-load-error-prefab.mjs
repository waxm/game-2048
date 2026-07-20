#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** 作为稳定结构模板读取的现有结算弹窗。 */
const sourcePrefabPath = path.join(
  projectRoot,
  "assets/resources/prefabs/popup/UIResultPanel.prefab",
);

/** 通用加载失败 Prefab 输出目录。 */
const outputDirectory = path.join(
  projectRoot,
  "assets/resources/prefabs/common",
);

/** 通用加载失败 Prefab 输出路径。 */
const outputPrefabPath = path.join(
  outputDirectory,
  "UILoadErrorPanel.prefab",
);

/** Creator 编辑器实际脚本编译产物目录。 */
const creatorChunkDirectory = path.join(
  projectRoot,
  "temp/programming/packer-driver/targets/editor/chunks",
);

/** 生成通用加载失败 Prefab，并在写入前校验完整绑定。 */
function main() {
  ensureOutputDirectory();
  const scriptType = resolveCreatorScriptType(
    "UILoadErrorPanel",
    "assets/app/ui/common/UILoadErrorPanel.ts.meta",
  );
  const objects = createPrefabObjects(scriptType);
  validatePrefab(objects, scriptType);
  writeJsonIfChanged(outputPrefabPath, objects);
  preparePrefabMeta();
  console.log("已生成并校验 UILoadErrorPanel.prefab。");
}

/** 创建输出目录及其稳定的 Cocos 目录 meta。 */
function ensureOutputDirectory() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const directoryMetaPath = `${outputDirectory}.meta`;
  if (fs.existsSync(directoryMetaPath)) {
    return;
  }
  writeJsonIfChanged(directoryMetaPath, {
    ver: "1.2.0",
    importer: "directory",
    imported: true,
    uuid: crypto.randomUUID(),
    files: [],
    subMetas: {},
    userData: {},
  });
}

/**
 * 从脚本 meta 和 Creator 实际编译产物中取得序列化脚本类型 ID。
 *
 * 只有两者一致才允许生成，避免凭算法写入尚未被 Creator 导入的 Missing Script。
 */
function resolveCreatorScriptType(className, relativeMetaPath) {
  const meta = readJson(path.join(projectRoot, relativeMetaPath), "脚本 meta");
  if (meta.importer !== "typescript" || !isUuid(meta.uuid)) {
    throw new Error(`${relativeMetaPath} 缺少有效的 TypeScript UUID。`);
  }

  const expectedType = compressScriptUuid(meta.uuid);
  const compiledTypes = findCompiledScriptTypes(className);
  if (compiledTypes.size === 0) {
    throw new Error(
      `Creator 尚未编译 ${className}，请先在 Creator 中完成脚本导入。`,
    );
  }
  if (compiledTypes.size !== 1 || !compiledTypes.has(expectedType)) {
    throw new Error(
      `${className} 的脚本 meta 与 Creator 编译类型不一致：` +
        `${expectedType} / ${[...compiledTypes].join(", ")}`,
    );
  }
  return expectedType;
}

/** 递归扫描 Creator 编译产物，读取指定 ccclass 的实际类型 ID。 */
function findCompiledScriptTypes(className) {
  if (!fs.existsSync(creatorChunkDirectory)) {
    return new Set();
  }
  const escapedName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `_RF\\.push\\(\\{\\},\\s*["']([^"']+)["'],\\s*["']${escapedName}["'],\\s*undefined\\)`,
    "g",
  );
  const types = new Set();
  for (const filePath of listFilesRecursively(creatorChunkDirectory)) {
    if (!filePath.endsWith(".js")) {
      continue;
    }
    const source = fs.readFileSync(filePath, "utf8");
    for (const match of source.matchAll(pattern)) {
      types.add(match[1]);
    }
  }
  return types;
}

/** 递归列出指定目录中的全部文件。 */
function listFilesRecursively(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
  });
}

/** 将标准脚本 UUID 转换为 Creator 序列化文件使用的压缩类型 ID。 */
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

/**
 * 以现有结算弹窗的稳定节点结构为模板创建新 Prefab。
 *
 * 这里只复用节点和引擎组件布局，业务脚本、节点名称、默认文案和 Inspector 字段
 * 都重新明确设置，避免两个弹窗继续共享业务语义。
 */
function createPrefabObjects(scriptType) {
  const sourceObjects = readJson(sourcePrefabPath, "UIResultPanel Prefab");
  const objects = JSON.parse(JSON.stringify(sourceObjects));
  const prefabAsset = objects[0];
  const rootId = prefabAsset?.data?.__id__;
  const root = objects[rootId];
  if (prefabAsset?.__type__ !== "cc.Prefab" || root?.__type__ !== "cc.Node") {
    throw new Error("UIResultPanel.prefab 缺少有效的 Prefab 根节点。");
  }

  prefabAsset._name = "UILoadErrorPanel";
  root._name = "UILoadErrorPanel";
  const retryNodeId = findUniqueNode(objects, "PrimaryButton");
  const backNodeId = findUniqueNode(objects, "HomeButton");
  objects[retryNodeId]._name = "RetryButton";
  objects[backNodeId]._name = "BackButton";

  const titleLabelId = findUniqueComponentOnNamedNode(
    objects,
    "TitleLabel",
    "cc.Label",
  );
  const messageLabelId = findUniqueComponentOnNamedNode(
    objects,
    "MessageLabel",
    "cc.Label",
  );
  const retryButtonId = findUniqueComponent(objects, retryNodeId, "cc.Button");
  const retryGraphicsId = findUniqueComponent(
    objects,
    retryNodeId,
    "cc.Graphics",
  );
  const retryLabelId = findChildLabel(objects, retryNodeId);
  const backButtonId = findUniqueComponent(objects, backNodeId, "cc.Button");
  const backGraphicsId = findUniqueComponent(
    objects,
    backNodeId,
    "cc.Graphics",
  );
  const backLabelId = findChildLabel(objects, backNodeId);
  objects[titleLabelId]._string = "加载失败";
  objects[messageLabelId]._string = "资源暂时无法加载，请重新尝试。";
  objects[retryLabelId]._string = "重新尝试";
  objects[backLabelId]._string = "返回大厅";

  const oldScriptIds = root._components
    .map((reference) => reference.__id__)
    .filter((id) => !String(objects[id]?.__type__).startsWith("cc."));
  if (oldScriptIds.length !== 1) {
    throw new Error("UIResultPanel 根节点的业务脚本数量不是 1。");
  }
  const scriptId = oldScriptIds[0];
  const overlayGraphicsId = findUniqueComponent(objects, rootId, "cc.Graphics");
  const panelGraphicsId = findUniqueComponentOnNamedNode(
    objects,
    "Panel",
    "cc.Graphics",
  );
  objects[scriptId] = {
    __type__: scriptType,
    _name: "",
    _objFlags: 0,
    node: ref(rootId),
    _enabled: true,
    overlayGraphics: ref(overlayGraphicsId),
    panelGraphics: ref(panelGraphicsId),
    titleLabel: ref(titleLabelId),
    messageLabel: ref(messageLabelId),
    retryButton: ref(retryButtonId),
    retryButtonGraphics: ref(retryGraphicsId),
    retryButtonLabel: ref(retryLabelId),
    backButton: ref(backButtonId),
    backButtonGraphics: ref(backGraphicsId),
    backButtonLabel: ref(backLabelId),
    _id: "",
  };
  return objects;
}

/** 按节点名取得唯一节点编号。 */
function findUniqueNode(objects, nodeName) {
  const ids = objects
    .map((object, id) => ({ object, id }))
    .filter(
      ({ object }) =>
        object?.__type__ === "cc.Node" && object._name === nodeName,
    )
    .map(({ id }) => id);
  if (ids.length !== 1) {
    throw new Error(`无法确定唯一节点：${nodeName}`);
  }
  return ids[0];
}

/** 取得指定节点上的唯一组件。 */
function findUniqueComponent(objects, nodeId, componentType) {
  const ids = (objects[nodeId]?._components ?? [])
    .map((reference) => reference.__id__)
    .filter((id) => objects[id]?.__type__ === componentType);
  if (ids.length !== 1) {
    throw new Error(
      `${objects[nodeId]?._name ?? nodeId} 上无法确定唯一 ${componentType}。`,
    );
  }
  return ids[0];
}

/** 按节点名取得其唯一指定类型组件。 */
function findUniqueComponentOnNamedNode(objects, nodeName, componentType) {
  return findUniqueComponent(objects, findUniqueNode(objects, nodeName), componentType);
}

/** 取得按钮唯一文字子节点上的 Label 组件。 */
function findChildLabel(objects, buttonNodeId) {
  const childIds = objects[buttonNodeId]?._children?.map(
    (reference) => reference.__id__,
  );
  if (childIds?.length !== 1) {
    throw new Error(`${objects[buttonNodeId]?._name} 的文字子节点数量不是 1。`);
  }
  return findUniqueComponent(objects, childIds[0], "cc.Label");
}

/** 校验内部引用、父子关系、脚本类型和全部必填 Inspector 绑定。 */
function validatePrefab(objects, scriptType) {
  visitValue(objects, (referenceId) => {
    if (
      !Number.isInteger(referenceId) ||
      referenceId < 0 ||
      referenceId >= objects.length
    ) {
      throw new Error(`UILoadErrorPanel 存在越界引用：${referenceId}`);
    }
  });

  objects.forEach((object, objectId) => {
    if (object?.__type__ !== "cc.Node") {
      return;
    }
    for (const childReference of object._children ?? []) {
      if (objects[childReference.__id__]?._parent?.__id__ !== objectId) {
        throw new Error(`节点 ${object._name} 的父子引用不一致。`);
      }
    }
    for (const componentReference of object._components ?? []) {
      if (objects[componentReference.__id__]?.node?.__id__ !== objectId) {
        throw new Error(`节点 ${object._name} 的组件归属不一致。`);
      }
    }
  });

  const script = objects.find((object) => object?.__type__ === scriptType);
  if (!script) {
    throw new Error(`UILoadErrorPanel 缺少业务脚本 ${scriptType}。`);
  }
  const requiredBindings = {
    overlayGraphics: "cc.Graphics",
    panelGraphics: "cc.Graphics",
    titleLabel: "cc.Label",
    messageLabel: "cc.Label",
    retryButton: "cc.Button",
    retryButtonGraphics: "cc.Graphics",
    retryButtonLabel: "cc.Label",
    backButton: "cc.Button",
    backButtonGraphics: "cc.Graphics",
    backButtonLabel: "cc.Label",
  };
  for (const [field, expectedType] of Object.entries(requiredBindings)) {
    if (objects[script[field]?.__id__]?.__type__ !== expectedType) {
      throw new Error(`必填字段 ${field} 未绑定到 ${expectedType}。`);
    }
  }
}

/** 递归遍历序列化数据中的内部对象引用。 */
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

/** 创建或保留现有 Prefab meta，重新生成时不得改变资源 UUID。 */
function preparePrefabMeta() {
  const metaPath = `${outputPrefabPath}.meta`;
  if (fs.existsSync(outputPrefabPath) && !fs.existsSync(metaPath)) {
    const meta = {
      ver: "1.1.50",
      importer: "prefab",
      imported: true,
      uuid: crypto.randomUUID(),
      files: [".json"],
      subMetas: {},
      userData: { syncNodeName: "UILoadErrorPanel" },
    };
    writeJsonIfChanged(metaPath, meta);
    return;
  }
  if (!fs.existsSync(metaPath)) {
    throw new Error("UILoadErrorPanel.prefab 已存在但缺少 meta。");
  }
  const meta = readJson(metaPath, "UILoadErrorPanel Prefab meta");
  if (meta.importer !== "prefab" || !isUuid(meta.uuid)) {
    throw new Error("UILoadErrorPanel.prefab.meta 缺少有效 UUID。");
  }
  meta.userData = {
    ...(meta.userData ?? {}),
    syncNodeName: "UILoadErrorPanel",
  };
  writeJsonIfChanged(metaPath, meta);
}

/** 读取并解析 JSON 文件。 */
function readJson(filePath, description) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`读取${description}失败：${filePath}`, { cause: error });
  }
}

/** 仅在内容变化时写入格式化 JSON，避免无意义文件时间和版本差异。 */
function writeJsonIfChanged(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === content) {
    return;
  }
  fs.writeFileSync(filePath, content, "utf8");
}

/** 判断值是否为标准 UUID。 */
function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

/** 创建 Cocos 内部对象引用。 */
function ref(id) {
  return { __id__: id };
}

main();
