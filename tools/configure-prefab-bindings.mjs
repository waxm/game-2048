#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** 为需要动态显示关卡编号的首页按钮配置显式 Label 绑定。 */
function main() {
  const prefabPath = path.join(
    projectRoot,
    "assets/resources/prefabs/home/UIHomePanel.prefab",
  );
  const objects = JSON.parse(fs.readFileSync(prefabPath, "utf8"));
  validateReferenceRange(objects, "UIHomePanel.prefab");

  const rootId = findUniqueNodeId(objects, "UIHomePanel");
  const startButtonId = findDirectChildId(objects, rootId, "StartButton");
  const labelNodeId = findDirectChildId(objects, startButtonId, "Label");
  const labelId = findComponentId(objects, labelNodeId, "cc.Label");
  const scriptId = findBusinessScriptId(objects, rootId);

  objects[scriptId].startButtonLabel = reference(labelId);
  validateHomeBindings(objects, scriptId, labelId);
  fs.writeFileSync(prefabPath, `${JSON.stringify(objects, null, 2)}\n`, "utf8");
  console.log("UIHomePanel.startButtonLabel 显式绑定已配置完成。");
}

/** 获取名称唯一的节点编号，防止绑定到同名错误节点。 */
function findUniqueNodeId(objects, nodeName) {
  const ids = objects
    .map((object, index) => ({ object, index }))
    .filter(({ object }) => object.__type__ === "cc.Node" && object._name === nodeName)
    .map(({ index }) => index);
  if (ids.length !== 1) {
    throw new Error(`Prefab 中必须有且只有一个 ${nodeName} 节点。`);
  }
  return ids[0];
}

/** 在指定父节点下获取名称唯一的直属子节点。 */
function findDirectChildId(objects, parentId, childName) {
  const ids = (objects[parentId]._children ?? [])
    .map((item) => item.__id__)
    .filter((id) => objects[id]?.__type__ === "cc.Node" && objects[id]._name === childName);
  if (ids.length !== 1) {
    throw new Error(`${objects[parentId]._name} 下必须有且只有一个 ${childName} 节点。`);
  }
  return ids[0];
}

/** 获取节点上指定类型的唯一组件。 */
function findComponentId(objects, nodeId, componentType) {
  const ids = (objects[nodeId]._components ?? [])
    .map((item) => item.__id__)
    .filter((id) => objects[id]?.__type__ === componentType);
  if (ids.length !== 1) {
    throw new Error(`${objects[nodeId]._name} 必须挂载且只挂载一个 ${componentType}。`);
  }
  return ids[0];
}

/** 获取根节点上唯一的非引擎业务脚本，不依赖压缩类 ID。 */
function findBusinessScriptId(objects, rootId) {
  const ids = (objects[rootId]._components ?? [])
    .map((item) => item.__id__)
    .filter((id) => !String(objects[id]?.__type__).startsWith("cc."));
  if (ids.length !== 1) {
    throw new Error("UIHomePanel 根节点必须挂载且只挂载一个业务脚本。");
  }
  return ids[0];
}

/** 校验脚本属性确实指向开始按钮内部的 Label 组件。 */
function validateHomeBindings(objects, scriptId, expectedLabelId) {
  validateReferenceRange(objects, "UIHomePanel.prefab");
  const actualId = objects[scriptId].startButtonLabel?.__id__;
  if (actualId !== expectedLabelId || objects[actualId]?.__type__ !== "cc.Label") {
    throw new Error("UIHomePanel.startButtonLabel 绑定失败。");
  }
}

/** 递归校验所有内部引用均位于序列化对象数组范围内。 */
function validateReferenceRange(objects, assetName) {
  visitValue(objects, (referenceId) => {
    if (!Number.isInteger(referenceId) || referenceId < 0 || referenceId >= objects.length) {
      throw new Error(`${assetName} 存在越界引用：__id__=${referenceId}`);
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

/** 创建 Cocos 序列化对象内部引用。 */
function reference(id) {
  return { __id__: id };
}

main();
