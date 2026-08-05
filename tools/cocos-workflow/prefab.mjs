#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  projectRoot,
  workflowTempDirectory,
  writeJsonAtomic,
} from "./lib.mjs";
import { readEditorSession } from "./session.mjs";

/** 加载 Creator 扩展和 CLI 共用的参数校验。 */
const require = createRequire(import.meta.url);
const {
  normalizeNodeLocator,
  validatePrefabUrl,
} = require("../../extensions/cocos-workflow-bridge/prefab-command.js");

/** Prefab 编辑器事务帮助。 */
const helpText = `
通过已打开的 Cocos Creator 检查节点或创建 Prefab。

用法：
  npm run workflow:prefab -- list [--json]
  npm run workflow:prefab -- inspect (--node <uuid> | --path <层级路径>) [--json]
  npm run workflow:prefab -- create (--node <uuid> | --path <层级路径>) --url <db://assets/...prefab> [--json]

规则：
  - create 只调用 Creator 官方 scene/create-prefab，不写序列化 JSON。
  - 目标 Prefab 已存在时拒绝覆盖。
  - 层级和局部变换通过结构数据检查，截图不参与本命令。
`.trim();

/** 解析命令行参数。 */
export function parseArguments(argv) {
  const [action, ...rest] = argv;
  if (!action || action === "--help" || action === "help") {
    return { help: true };
  }
  if (!["list", "inspect", "create"].includes(action)) {
    throw new Error(`不支持的操作：${action}`);
  }

  const options = { action };
  const valueOptions = new Map([
    ["--node", "nodeUuid"],
    ["--path", "nodePath"],
    ["--url", "prefabUrl"],
    ["--timeout", "timeout"],
  ]);
  const seen = new Set();
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (seen.has(argument)) {
      throw new Error(`参数不能重复：${argument}`);
    }
    if (argument === "--json") {
      options.json = true;
      seen.add(argument);
      continue;
    }
    if (!valueOptions.has(argument)) {
      throw new Error(`未知参数：${argument}`);
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数缺少值：${argument}`);
    }
    options[valueOptions.get(argument)] = value;
    seen.add(argument);
    index += 1;
  }

  if (action !== "list") {
    Object.assign(options, normalizeNodeLocator(options));
  }
  if (action === "create") {
    options.prefabUrl = validatePrefabUrl(options.prefabUrl);
  } else if (options.prefabUrl) {
    throw new Error("--url 只能用于 create。");
  }
  if (options.timeout) {
    const timeout = Number(options.timeout);
    if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 60_000) {
      throw new Error("--timeout 必须是 1000 到 60000 之间的整数毫秒。");
    }
    options.timeout = timeout;
  }
  return options;
}

/** 构建只允许当前项目消费的命令。 */
export function createCommand(options, now = new Date()) {
  const actions = {
    list: "inspect-hierarchy",
    inspect: "inspect-node",
    create: "create-prefab",
  };
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    projectPath: projectRoot,
    action: actions[options.action],
    createdAt: now.toISOString(),
    args: {
      ...(options.nodeUuid ? { nodeUuid: options.nodeUuid } : {}),
      ...(options.nodePath ? { nodePath: options.nodePath } : {}),
      ...(options.prefabUrl ? { prefabUrl: options.prefabUrl } : {}),
    },
  };
}

/** 等待 Creator 扩展写回命令结果。 */
async function waitForResponse(commandId, timeout) {
  const responsePath = path.join(
    workflowTempDirectory,
    "prefab-responses",
    `${commandId}.json`,
  );
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fs.existsSync(responsePath)) {
      const response = JSON.parse(fs.readFileSync(responsePath, "utf8"));
      fs.rmSync(responsePath, { force: true });
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `等待 Creator Prefab 命令超时（${timeout}ms），请先执行 npm run workflow:doctor。`,
  );
}

/** 将命令原子写入当前项目的 Creator 请求队列。 */
function enqueueCommand(command) {
  const requestPath = path.join(
    workflowTempDirectory,
    "prefab-requests",
    `${command.id}.json`,
  );
  writeJsonAtomic(requestPath, command);
}

/** 输出适合开发内循环阅读的简明结果。 */
function printHumanReadable(result) {
  if (result.action === "inspect-hierarchy") {
    console.log(
      `场景 ${result.hierarchy.sceneName}：${result.hierarchy.nodeCount} 个节点`,
    );
    for (const node of result.hierarchy.nodes) {
      console.log(`${node.path}  ${node.uuid}`);
    }
    return;
  }
  if (result.action === "inspect-node") {
    console.log(JSON.stringify(result.node, null, 2));
    return;
  }
  console.log(
    `Prefab 已由 Creator 创建：${result.prefabUrl}（${result.assetUuid}）`,
  );
  console.log(
    `源节点：${result.sourceNode.path}（${result.sourceNode.childCount} 个直接子节点）`,
  );
}

/** Prefab 编辑器事务命令入口。 */
export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(helpText);
    return;
  }
  if (!readEditorSession()) {
    throw new Error(
      "当前项目没有已连接的 Creator 会话。请从 Dashboard 打开项目，等待 cocos-workflow-bridge 连接后重试。",
    );
  }
  const command = createCommand(options);
  enqueueCommand(command);
  const response = await waitForResponse(
    command.id,
    options.timeout ?? 15_000,
  );
  if (!response.success) {
    throw new Error(response.error ?? "Creator Prefab 命令执行失败。");
  }
  if (options.json) {
    console.log(JSON.stringify(response.result, null, 2));
  } else {
    printHumanReadable(response.result);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
