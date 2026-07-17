#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** PuzzlePiece Prefab 路径。 */
const prefabPath = path.join(
  projectRoot,
  "assets/resources/prefabs/game/PuzzlePiece.prefab",
);

/** 未连接拼图底框图片的 Meta 路径。 */
const backgroundMetaPath = path.join(
  projectRoot,
  "assets/resources/textures/common/com_item_bg1.png.meta",
);

/** PuzzlePiece 脚本 Meta 路径。 */
const scriptMetaPath = path.join(
  projectRoot,
  "assets/app/ui/game/PuzzlePiece.ts.meta",
);

/** 根据现有脚本类 ID 和资源 Meta 重建稳定的 PuzzlePiece Prefab。 */
function main() {
  const previousObjects = readJson(prefabPath);
  const scriptMeta = readJson(scriptMetaPath);
  const backgroundMeta = readJson(backgroundMetaPath);
  const scriptType = findBusinessScriptType(previousObjects);
  const spriteFrameMeta = Object.values(backgroundMeta.subMetas ?? {}).find(
    (meta) => meta.importer === "sprite-frame",
  );
  if (!scriptMeta.uuid || !spriteFrameMeta?.uuid) {
    throw new Error("PuzzlePiece 脚本或 com_item_bg1 SpriteFrame 缺少有效 UUID。");
  }

  const objects = createPrefabObjects(scriptType, spriteFrameMeta.uuid);
  validatePrefab(objects, scriptType, spriteFrameMeta.uuid);
  fs.writeFileSync(prefabPath, `${JSON.stringify(objects, null, 2)}\n`, "utf8");
  console.log("PuzzlePiece.prefab 层级、圆角遮罩和脚本绑定已配置完成。");
}

/** 创建完整且编号稳定的 Prefab 序列化对象。 */
function createPrefabObjects(scriptType, backgroundSpriteFrameUuid) {
  return [
    prefab("PuzzlePiece", 1),
    node("PuzzlePiece", null, [3, 6, 12], [2, 15], 16),
    transform(1, 149.33333333333334, 149.33333333333334),
    node("DisconnectedBackground", 1, [], [4, 5], 17),
    transform(3, 149.33333333333334, 149.33333333333334),
    sprite(3, backgroundSpriteFrameUuid, 1),
    node("ImageMask", 1, [9], [7, 8, 21], 18),
    transform(6, 137.38666666666668, 137.38666666666668),
    mask(6),
    node("Image", 6, [], [10, 11], 19),
    transform(9, 149.33333333333334, 149.33333333333334),
    sprite(9, null, 0),
    node("NumberLabel", 1, [], [13, 14], 20),
    transform(12, 120, 50),
    label(12),
    {
      __type__: scriptType,
      _name: "",
      _objFlags: 0,
      node: reference(1),
      _enabled: true,
      pieceTransform: reference(2),
      disconnectedBackgroundNode: reference(3),
      disconnectedBackgroundTransform: reference(4),
      imageMask: reference(8),
      imageMaskTransform: reference(7),
      imageSprite: reference(11),
      imageTransform: reference(10),
      numberLabel: reference(14),
      _id: "",
    },
    prefabInfo(1, "vzB0tYb7NtoM4nFHbhcx9z"),
    prefabInfo(3, "Bg4r2L0UfCkABXQ1jP8e2A"),
    prefabInfo(6, "Mk6n3H2VbQwR9sT5yE1d7C"),
    prefabInfo(9, "Im8a4G1NpLsU6xZ2cF7v3B"),
    prefabInfo(12, "XJIYWLzqadyXk4qOJlktCO"),
    sprite(6, backgroundSpriteFrameUuid, 0),
  ];
}

/** 创建 Prefab 资源对象。 */
function prefab(name, rootId) {
  return {
    __type__: "cc.Prefab",
    _name: name,
    _objFlags: 0,
    _native: "",
    data: reference(rootId),
    optimizationPolicy: 0,
    asyncLoadAssets: false,
    persistent: false,
  };
}

/** 创建标准 UI 节点对象。 */
function node(name, parentId, children, components, prefabInfoId) {
  return {
    __type__: "cc.Node",
    _name: name,
    _objFlags: 0,
    _parent: parentId === null ? null : reference(parentId),
    _children: children.map(reference),
    _active: true,
    _components: components.map(reference),
    _prefab: reference(prefabInfoId),
    _lpos: vec3(0, 0, 0),
    _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
    _lscale: vec3(1, 1, 1),
    _layer: 33554432,
    _euler: vec3(0, 0, 0),
    _id: "",
  };
}

/** 创建 UITransform 组件。 */
function transform(nodeId, width, height) {
  return {
    __type__: "cc.UITransform",
    _name: "",
    _objFlags: 0,
    node: reference(nodeId),
    _enabled: true,
    _contentSize: { __type__: "cc.Size", width, height },
    _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
    _id: "",
  };
}

/** 创建 Sprite 组件；背景使用九宫格，运行时切片使用普通模式。 */
function sprite(nodeId, spriteFrameUuid, type) {
  return {
    __type__: "cc.Sprite",
    _name: "",
    _objFlags: 0,
    node: reference(nodeId),
    _enabled: true,
    _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 },
    _spriteFrame: spriteFrameUuid ? { __uuid__: spriteFrameUuid } : null,
    _type: type,
    _sizeMode: 0,
    _isTrimmedMode: false,
    _id: "",
  };
}

/** 创建图片模板遮罩组件。 */
function mask(nodeId) {
  return {
    __type__: "cc.Mask",
    _name: "",
    _objFlags: 0,
    node: reference(nodeId),
    _enabled: true,
    _type: 3,
    _segements: 64,
    _alphaThreshold: 0.1,
    _inverted: false,
    _id: "",
  };
}

/** 创建隐藏的排错编号 Label。 */
function label(nodeId) {
  return {
    __type__: "cc.Label",
    _name: "",
    _objFlags: 0,
    node: reference(nodeId),
    _enabled: true,
    _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 },
    _string: "1",
    _horizontalAlign: 1,
    _verticalAlign: 1,
    _actualFontSize: 32,
    _fontSize: 32,
    _fontFamily: "Arial",
    _lineHeight: 40,
    _overflow: 0,
    _enableWrapText: true,
    _font: null,
    _isSystemFontUsed: true,
    _id: "",
  };
}

/** 创建 PrefabInfo，并保持根节点原有 fileId。 */
function prefabInfo(rootId, fileId) {
  return {
    __type__: "cc.PrefabInfo",
    root: reference(rootId),
    asset: reference(0),
    fileId,
  };
}

/** 从现有 Prefab 读取 Creator 已编译出的脚本压缩类 ID，禁止自行猜测。 */
function findBusinessScriptType(objects) {
  const types = objects
    .filter(
      (object) =>
        typeof object?.__type__ === "string" &&
        !object.__type__.startsWith("cc."),
    )
    .map((object) => object.__type__);
  if (types.length !== 1) {
    throw new Error("PuzzlePiece.prefab 必须包含唯一的业务脚本组件。");
  }
  return types[0];
}

/** 校验节点关系、引用范围、资源 UUID 和所有必填脚本绑定。 */
function validatePrefab(objects, scriptType, spriteFrameUuid) {
  visitValue(objects, (referenceId) => {
    if (
      !Number.isInteger(referenceId) ||
      referenceId < 0 ||
      referenceId >= objects.length
    ) {
      throw new Error(`PuzzlePiece.prefab 存在越界引用：${referenceId}`);
    }
  });
  const script = objects.find((object) => object.__type__ === scriptType);
  const requiredBindings = [
    "pieceTransform",
    "disconnectedBackgroundNode",
    "disconnectedBackgroundTransform",
    "imageMask",
    "imageMaskTransform",
    "imageSprite",
    "imageTransform",
    "numberLabel",
  ];
  requiredBindings.forEach((field) => {
    if (!Number.isInteger(script?.[field]?.__id__)) {
      throw new Error(`PuzzlePiece.${field} 未完成显式绑定。`);
    }
  });
  const assetReferences = JSON.stringify(objects).match(
    /cbf8af07-3cfb-4a39-b574-6c64f936ef86@f9941/g,
  );
  if (spriteFrameUuid !== "cbf8af07-3cfb-4a39-b574-6c64f936ef86@f9941") {
    throw new Error("com_item_bg1 SpriteFrame UUID 与预期资源不一致。");
  }
  if (assetReferences?.length !== 2) {
    throw new Error("背景 Sprite 与图片 Mask 必须同时引用 com_item_bg1。");
  }
}

/** 递归遍历对象中的内部 __id__ 引用。 */
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

/** 创建内部对象引用。 */
function reference(id) {
  return { __id__: id };
}

/** 创建三维向量序列化值。 */
function vec3(x, y, z) {
  return { __type__: "cc.Vec3", x, y, z };
}

/** 读取 JSON 文件并保留明确错误来源。 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

main();
