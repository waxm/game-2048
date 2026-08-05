"use strict";

const { director, js, UITransform } = require("cc");

/** 返回组件稳定的 ccclass 名称。 */
function getComponentType(component) {
  return js.getClassName(component) || component?.constructor?.name || "";
}

/** 校验一个节点的组件挂载规则。 */
function validateNode(node, rules) {
  const componentTypes = (node.components ?? [])
    .map(getComponentType)
    .filter(Boolean);
  const componentTypeSet = new Set(componentTypes);
  const issues = [];

  for (const singletonType of rules.singletons ?? []) {
    const count = componentTypes.filter(
      (type) => type === singletonType,
    ).length;
    if (count > 1) {
      issues.push(`${singletonType} 重复挂载 ${count} 次`);
    }
  }

  for (const group of rules.exclusiveGroups ?? []) {
    const matchedTypes = componentTypes.filter((type) =>
      group.types.includes(type),
    );
    if (matchedTypes.length > group.max) {
      issues.push(
        `${group.description} 当前为 ${matchedTypes.join("、")}`,
      );
    }
  }

  for (const [componentType, requiredTypes] of Object.entries(
    rules.requirements ?? {},
  )) {
    if (!componentTypeSet.has(componentType)) {
      continue;
    }
    for (const requiredType of requiredTypes) {
      if (!componentTypeSet.has(requiredType)) {
        issues.push(`${componentType} 缺少依赖 ${requiredType}`);
      }
    }
  }

  for (const [leftType, rightType] of rules.forbiddenPairs ?? []) {
    if (
      componentTypeSet.has(leftType) &&
      componentTypeSet.has(rightType)
    ) {
      issues.push(`${leftType} 与 ${rightType} 不能挂在同一节点`);
    }
  }

  return issues.map(
    (message) => `${node.getPathInHierarchy()}：${message}`,
  );
}

/** 递归校验当前活动场景。 */
function validateActiveScene(rules) {
  const scene = director.getScene();
  if (!scene) {
    return {
      sceneName: "",
      nodeCount: 0,
      issues: [],
      unavailable: true,
      reason: "当前没有打开活动场景。",
    };
  }
  const issues = [];
  let nodeCount = 0;
  const visit = (node) => {
    nodeCount += 1;
    issues.push(...validateNode(node, rules));
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(scene);
  return {
    sceneName: scene.name,
    nodeCount,
    issues,
  };
}

/** 将 Creator 向量转换成稳定的普通对象。 */
function serializeVector(vector) {
  return {
    x: Number(vector?.x ?? 0),
    y: Number(vector?.y ?? 0),
    z: Number(vector?.z ?? 0),
  };
}

/** 返回节点在创建 Prefab 前需要核对的结构快照。 */
function describeNode(node) {
  const uiTransform = node.getComponent(UITransform);
  return {
    uuid: node.uuid,
    name: node.name,
    path: node.getPathInHierarchy(),
    parentUuid: node.parent?.uuid ?? null,
    active: node.active,
    activeInHierarchy: node.activeInHierarchy,
    siblingIndex: node.getSiblingIndex(),
    childCount: node.children.length,
    children: node.children.map((child) => ({
      uuid: child.uuid,
      name: child.name,
    })),
    components: (node.components ?? [])
      .map(getComponentType)
      .filter(Boolean),
    transform: {
      position: serializeVector(node.position),
      rotation: serializeVector(node.eulerAngles),
      scale: serializeVector(node.scale),
    },
    uiTransform: uiTransform
      ? {
          width: uiTransform.width,
          height: uiTransform.height,
          anchorX: uiTransform.anchorX,
          anchorY: uiTransform.anchorY,
        }
      : null,
  };
}

/** 收集活动场景的节点，供精确路径或 UUID 定位。 */
function collectSceneNodes() {
  const scene = director.getScene();
  if (!scene) {
    throw new Error("当前没有打开活动场景。");
  }
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(scene);
  return { scene, nodes };
}

/** 使用 UUID 或完整/场景内层级路径解析唯一节点。 */
function resolveNode(locator) {
  const { scene, nodes } = collectSceneNodes();
  if (locator?.nodeUuid) {
    return nodes.find((node) => node.uuid === locator.nodeUuid) ?? null;
  }
  const expectedPath = String(locator?.nodePath ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!expectedPath) {
    throw new Error("节点层级路径不能为空。");
  }
  const matches = nodes.filter((node) => {
    const actualPath = node.getPathInHierarchy();
    return (
      actualPath === expectedPath ||
      actualPath === `${scene.name}/${expectedPath}`
    );
  });
  if (matches.length > 1) {
    throw new Error(
      `节点层级路径不唯一，请改用 UUID：${expectedPath}`,
    );
  }
  return matches[0] ?? null;
}

/** 返回活动场景的扁平层级快照，不通过截图猜测内部结构。 */
function inspectHierarchy() {
  const { scene, nodes } = collectSceneNodes();
  return {
    sceneName: scene.name,
    nodeCount: nodes.length,
    nodes: nodes.map(describeNode),
  };
}

/** 返回一个源节点及其直接结构和局部变换。 */
function inspectNode(locator) {
  const node = resolveNode(locator);
  return node ? describeNode(node) : null;
}

exports.load = function load() {};
exports.unload = function unload() {};
exports.methods = {
  inspectHierarchy,
  inspectNode,
  validateActiveScene,
};
