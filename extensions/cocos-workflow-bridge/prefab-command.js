"use strict";

/** Prefab 编辑器事务支持的命令。 */
const SUPPORTED_ACTIONS = new Set([
  "inspect-hierarchy",
  "inspect-node",
  "create-prefab",
]);

/** 校验并标准化节点定位参数。 */
function normalizeNodeLocator(value) {
  const nodeUuid =
    typeof value?.nodeUuid === "string" ? value.nodeUuid.trim() : "";
  const nodePath =
    typeof value?.nodePath === "string" ? value.nodePath.trim() : "";
  if (Boolean(nodeUuid) === Boolean(nodePath)) {
    throw new Error("必须且只能提供 nodeUuid 或 nodePath。");
  }
  return nodeUuid ? { nodeUuid } : { nodePath };
}

/** 校验 Prefab 目标必须是项目 assets 内的 db URL。 */
function validatePrefabUrl(value) {
  const url = typeof value === "string" ? value.trim() : "";
  if (
    !url.startsWith("db://assets/") ||
    !url.endsWith(".prefab") ||
    url.includes("\\") ||
    url.split("/").includes("..")
  ) {
    throw new Error(
      `Prefab 目标必须是 db://assets/ 下的 .prefab：${url || "<空>"}`,
    );
  }
  return url;
}

/** 校验来自项目临时目录的编辑器命令。 */
function validatePrefabCommand(command, expectedProjectPath) {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    throw new Error("Prefab 命令必须是对象。");
  }
  if (command.schemaVersion !== 1) {
    throw new Error("Prefab 命令 schemaVersion 必须为 1。");
  }
  if (
    typeof command.id !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(command.id)
  ) {
    throw new Error("Prefab 命令缺少有效 id。");
  }
  if (!SUPPORTED_ACTIONS.has(command.action)) {
    throw new Error(`不支持的 Prefab 命令：${command.action}`);
  }
  if (command.projectPath !== expectedProjectPath) {
    throw new Error("Prefab 命令目标项目与当前 Creator 项目不一致。");
  }
  const createdAt = Date.parse(command.createdAt ?? "");
  if (
    !Number.isFinite(createdAt) ||
    Math.abs(Date.now() - createdAt) > 60_000
  ) {
    throw new Error("Prefab 命令已过期或缺少有效创建时间。");
  }
  return command;
}

/**
 * 执行一条 Prefab 编辑器事务。
 *
 * operations 由 Creator 主进程注入，测试可使用纯内存替身验证调用顺序。
 */
async function executePrefabCommand(command, operations) {
  if (command.action === "inspect-hierarchy") {
    return {
      action: command.action,
      hierarchy: await operations.inspectHierarchy(),
    };
  }

  const locator = normalizeNodeLocator(command.args);
  if (command.action === "inspect-node") {
    return {
      action: command.action,
      node: await requireSourceNode(operations, locator),
    };
  }

  const prefabUrl = validatePrefabUrl(command.args?.prefabUrl);
  const existingAsset = await operations.queryAssetInfo(prefabUrl);
  if (existingAsset) {
    throw new Error(
      `目标 Prefab 已存在，已拒绝覆盖：${prefabUrl}`,
    );
  }

  const sourceNode = await requireSourceNode(operations, locator);
  await operations.createPrefab(sourceNode.uuid, prefabUrl);
  let refreshWarning = null;
  try {
    await operations.refreshAsset(prefabUrl);
  } catch (error) {
    refreshWarning =
      typeof error?.message === "string" ? error.message : String(error);
  }

  let assetInfo = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assetInfo = await operations.queryAssetInfo(prefabUrl);
    if (assetInfo?.uuid) {
      break;
    }
    await operations.wait(150);
  }
  if (!assetInfo?.uuid) {
    throw new Error(
      `Creator 已返回创建结果，但 Asset Database 未发现 Prefab：${prefabUrl}`,
    );
  }

  return {
    action: command.action,
    creationMethod: "scene/create-prefab",
    prefabUrl,
    assetUuid: assetInfo.uuid,
    sourceNode,
    checks: {
      sourceNodeResolved: true,
      targetDidNotExist: true,
      assetImported: true,
    },
    refreshWarning,
  };
}

/** 解析源节点，并拒绝含糊或不存在的层级路径。 */
async function requireSourceNode(operations, locator) {
  const node = await operations.inspectNode(locator);
  if (!node?.uuid) {
    const description = locator.nodeUuid ?? locator.nodePath;
    throw new Error(`Creator 活动场景中找不到源节点：${description}`);
  }
  return node;
}

module.exports = {
  executePrefabCommand,
  normalizeNodeLocator,
  validatePrefabCommand,
  validatePrefabUrl,
};
