"use strict";

const fs = require("fs");
const path = require("path");

const { createExtensionLogger } = require("./extension-logger");
const packageJson = require("./package.json");
const {
  createValidationFailure,
  createValidationState,
} = require("./validation-state");
const {
  executePrefabCommand,
  validatePrefabCommand,
} = require("./prefab-command");

/** Creator 扩展主进程日志适配器。 */
const logger = createExtensionLogger();

/** 扩展包名。 */
const PACKAGE_NAME = packageJson.name;

/** 会话心跳间隔。 */
const HEARTBEAT_INTERVAL_MS = 5_000;

/** 活动场景组件轮询间隔。 */
const VALIDATION_INTERVAL_MS = 3_000;

/** Prefab 编辑器事务轮询间隔。 */
const PREFAB_COMMAND_INTERVAL_MS = 250;

/** 心跳定时器。 */
let heartbeatTimer = null;

/** 组件校验定时器。 */
let validationTimer = null;

/** Prefab 编辑器事务定时器。 */
let prefabCommandTimer = null;

/** 防止异步轮询重入。 */
let prefabCommandPolling = false;

/** 上一次组件冲突签名，用于避免重复刷屏。 */
let lastIssueSignature = "";

/** 上一次组件校验异常签名，用于避免重复刷屏。 */
let lastFailureSignature = "";

/** 上一次活动场景组件校验结果。 */
let lastValidation = null;

/** 返回当前项目根目录。 */
function getProjectRoot() {
  if (!global.Editor || !Editor.Project || !Editor.Project.path) {
    throw new Error("Editor.Project.path 不可用。");
  }
  return Editor.Project.path;
}

/** 返回工作流临时目录。 */
function getWorkflowTempDirectory() {
  return path.join(getProjectRoot(), "temp/cocos-workflow");
}

/** 返回 Prefab 编辑器事务请求目录。 */
function getPrefabRequestDirectory() {
  return path.join(getWorkflowTempDirectory(), "prefab-requests");
}

/** 返回 Prefab 编辑器事务响应目录。 */
function getPrefabResponseDirectory() {
  return path.join(getWorkflowTempDirectory(), "prefab-responses");
}

/** 返回项目内组件规则。 */
function readComponentRules() {
  const configPath = path.join(
    getProjectRoot(),
    ".cocos-workflow.json",
  );
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const rulesPath = path.resolve(
    getProjectRoot(),
    config.componentRules,
  );
  return JSON.parse(fs.readFileSync(rulesPath, "utf8"));
}

/** 使用临时文件原子写入会话，避免外部工具读取半截 JSON。 */
function writeSession(active) {
  const directory = getWorkflowTempDirectory();
  fs.mkdirSync(directory, { recursive: true });
  const sessionPath = path.join(directory, "editor-session.json");
  const temporaryPath = `${sessionPath}.${process.pid}.tmp`;
  const session = {
    schemaVersion: 1,
    extensionVersion: packageJson.version,
    active,
    pid: process.pid,
    projectPath: getProjectRoot(),
    creatorVersion: String(Editor.App?.version ?? "3.8.4"),
    platform: process.platform,
    heartbeatAt: new Date().toISOString(),
    componentValidation: lastValidation,
  };
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(session, null, 2)}\n`,
    "utf8",
  );
  fs.renameSync(temporaryPath, sessionPath);
  return session;
}

/** 使用临时文件原子写入 JSON，避免命令方读取半截响应。 */
function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  fs.renameSync(temporaryPath, filePath);
}

/** 调用场景进程中的节点检查方法。 */
function executeSceneMethod(method, args = []) {
  return Editor.Message.request("scene", "execute-scene-script", {
    name: PACKAGE_NAME,
    method,
    args,
  });
}

/** 返回执行 Prefab 命令所需的 Creator 官方消息适配器。 */
function createPrefabOperations() {
  return {
    inspectHierarchy() {
      return executeSceneMethod("inspectHierarchy");
    },
    inspectNode(locator) {
      return executeSceneMethod("inspectNode", [locator]);
    },
    queryAssetInfo(prefabUrl) {
      return Editor.Message.request(
        "asset-db",
        "query-asset-info",
        prefabUrl,
      );
    },
    createPrefab(nodeUuid, prefabUrl) {
      return Editor.Message.request("scene", "create-prefab", {
        nodeUuid,
        url: prefabUrl,
      });
    },
    refreshAsset(prefabUrl) {
      return Editor.Message.request(
        "asset-db",
        "refresh-asset",
        prefabUrl,
      );
    },
    wait(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    },
  };
}

/** 执行一条已经限定到当前项目的 Prefab 编辑器事务。 */
async function runPrefabCommand(command) {
  const validated = validatePrefabCommand(command, getProjectRoot());
  return executePrefabCommand(validated, createPrefabOperations());
}

/** 把异常转换成不会丢失 Creator 原始错误的稳定文本。 */
function getErrorMessage(error) {
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return String(error ?? "未知错误");
}

/** 处理项目临时目录中的 Prefab 编辑器事务。 */
async function pollPrefabCommands() {
  if (prefabCommandPolling) {
    return;
  }
  prefabCommandPolling = true;
  try {
    const requestDirectory = getPrefabRequestDirectory();
    if (!fs.existsSync(requestDirectory)) {
      return;
    }
    const requestFiles = fs
      .readdirSync(requestDirectory)
      .filter((fileName) => /^[a-f0-9-]{36}\.json$/i.test(fileName))
      .sort()
      .slice(0, 8);

    for (const fileName of requestFiles) {
      const requestPath = path.join(requestDirectory, fileName);
      const fallbackId = fileName.replace(/\.json$/i, "");
      let command = null;
      let response;
      try {
        command = JSON.parse(fs.readFileSync(requestPath, "utf8"));
        const result = await runPrefabCommand(command);
        response = {
          schemaVersion: 1,
          id: command.id,
          success: true,
          completedAt: new Date().toISOString(),
          result,
        };
      } catch (error) {
        response = {
          schemaVersion: 1,
          id: command?.id ?? fallbackId,
          success: false,
          completedAt: new Date().toISOString(),
          error: getErrorMessage(error),
        };
      }
      writeJsonAtomic(
        path.join(getPrefabResponseDirectory(), `${response.id}.json`),
        response,
      );
      fs.rmSync(requestPath, { force: true });
    }
  } finally {
    prefabCommandPolling = false;
  }
}

/** 调用场景进程执行组件规则检查。 */
async function validateActiveScene() {
  try {
    const result = await Editor.Message.request(
      "scene",
      "execute-scene-script",
      {
        name: PACKAGE_NAME,
        method: "validateActiveScene",
        args: [readComponentRules()],
      },
    );
    lastValidation = createValidationState(result);

    const issueSignature = JSON.stringify(result?.issues ?? []);
    if (
      lastValidation.status === "issues" &&
      issueSignature !== lastIssueSignature
    ) {
      logger.error(
        `[${PACKAGE_NAME}] 发现 ${lastValidation.issueCount} 个组件挂载问题，首个问题：${lastValidation.firstIssue}`,
      );
    } else if (
      lastValidation.status === "passed" &&
      lastIssueSignature &&
      lastIssueSignature !== "[]"
    ) {
      logger.info(`[${PACKAGE_NAME}] 当前场景组件挂载问题已消除。`);
    }
    lastIssueSignature = issueSignature;
    if (lastFailureSignature) {
      logger.info(`[${PACKAGE_NAME}] 活动场景组件校验已恢复。`);
      lastFailureSignature = "";
    }
    writeSession(true);
    return result;
  } catch (error) {
    lastValidation = createValidationFailure(error);
    const failureSignature = JSON.stringify([
      lastValidation.errorCode,
      lastValidation.errorMessage,
    ]);
    if (failureSignature !== lastFailureSignature) {
      logger.error(
        `[${PACKAGE_NAME}] 活动场景组件校验执行失败：${lastValidation.errorMessage}`,
      );
    }
    lastFailureSignature = failureSignature;
    writeSession(true);
    return {
      sceneName: "",
      nodeCount: 0,
      issues: [],
      failed: true,
      errorCode: lastValidation.errorCode,
      errorMessage: lastValidation.errorMessage,
    };
  }
}

/** 启动项目会话心跳和低频组件检查。 */
function load() {
  writeSession(true);
  heartbeatTimer = setInterval(
    () => writeSession(true),
    HEARTBEAT_INTERVAL_MS,
  );
  validationTimer = setInterval(
    () => void validateActiveScene(),
    VALIDATION_INTERVAL_MS,
  );
  prefabCommandTimer = setInterval(
    () => void pollPrefabCommands(),
    PREFAB_COMMAND_INTERVAL_MS,
  );
  void validateActiveScene();
  void pollPrefabCommands();
  logger.info(`[${PACKAGE_NAME}] 跨电脑开发工作流已连接。`);
}

/** 清理定时器并把会话标记为离线。 */
function unload() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (validationTimer) {
    clearInterval(validationTimer);
    validationTimer = null;
  }
  if (prefabCommandTimer) {
    clearInterval(prefabCommandTimer);
    prefabCommandTimer = null;
  }
  writeSession(false);
}

module.exports = {
  load,
  unload,
  methods: {
    /** 返回当前项目会话状态。 */
    status() {
      return writeSession(true);
    },

    /** 手动触发一次活动场景组件校验。 */
    async validateActiveScene() {
      return validateActiveScene();
    },

    /** 执行公开的 Creator-first Prefab 命令。 */
    async prefabCommand(command) {
      return runPrefabCommand(command);
    },
  },
};
