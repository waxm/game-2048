#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import validationState from "../../extensions/cocos-workflow-bridge/validation-state.js";
import {
  loadWorkflowConfig,
  projectRoot,
  readJson,
  resolveProjectPath,
  runCommand,
} from "./lib.mjs";
import {
  discoverEditorProcess,
  discoverPreviewState,
  readEditorSession,
} from "./session.mjs";
import {
  loadVisualContracts,
  summarizeVisualContracts,
} from "./visual-review-lib.mjs";

const {
  formatValidationState,
  isValidationBlocking,
} = validationState;

/** 运行跨电脑工作流环境检查。 */
async function main() {
  const config = loadWorkflowConfig();
  const packageJson = readJson(path.join(projectRoot, "package.json"));
  const editorState = discoverEditorProcess();
  const extensionSession = readEditorSession();
  const editorPid =
    extensionSession?.pid ?? editorState.targetProcess?.pid ?? null;
  const previewState = editorPid
    ? await discoverPreviewState(editorPid)
    : {
        urls: [],
        portDiscovery: {
          available: false,
          platform: process.platform,
          reason: "Creator 未打开，未执行预览端口发现。",
        },
      };
  const previewUrls = previewState.urls;
  const hookPath = runCommand("git", ["config", "--get", "core.hooksPath"], {
    allowFailure: true,
  }).stdout;
  const componentValidation =
    extensionSession?.componentValidation ?? null;
  const visualContracts = loadVisualContracts(config);
  const visualSummary = summarizeVisualContracts(
    config,
    visualContracts,
  );
  const visualBlockers = [];
  if (config.visualReview.mode !== "project") {
    visualBlockers.push("当前是框架模板模式");
  }
  if (visualSummary.uiSpecStatus !== "approved") {
    visualBlockers.push("GAME_UI_SPEC.json 尚未 approved");
  }
  if (config.machine.browserControl !== "available") {
    visualBlockers.push("本机浏览器控制能力尚未确认可用");
  }
  if (previewUrls.length === 0) {
    visualBlockers.push("尚未发现当前项目动态预览 URL");
  }

  const report = {
    platform: process.platform,
    project: packageJson.name,
    projectRoot,
    creatorVersion: {
      expected: config.creator.version,
      project: packageJson.creator?.version ?? null,
      matches:
        packageJson.creator?.version === config.creator.version,
    },
    launchPolicy: config.creator.launchPolicy,
    editor: {
      reuseOpenedProject: config.creator.reuseOpenedProject,
      targetProjectOpen: Boolean(editorPid),
      pid: editorPid,
      dashboardRunning: editorState.dashboardRunning,
      otherCreatorProjects: editorState.otherCreatorProjects,
      extensionConnected: Boolean(extensionSession),
      componentValidation,
      processDiscovery: editorState.processDiscovery,
    },
    preview: {
      urls: previewUrls,
      browserReuseRequired: config.preview.reuseExistingBrowserTab,
      createTabOnlyWhenMissing:
        config.preview.createTabOnlyWhenMissing,
      browserControlRequirement:
        config.preview.browserControlRequirement,
      browserControl: {
        status: config.machine.browserControl,
        available: config.machine.browserControl === "available",
        reason: getBrowserControlReason(
          config.machine.browserControl,
        ),
      },
      errorInspectionOrder:
        config.preview.errorInspectionOrder,
      screenshotPolicy: config.preview.screenshotPolicy,
      portDiscovery: previewState.portDiscovery,
    },
    logs: {
      editor: fs.existsSync(resolveProjectPath(config.logs.editor)),
      programming: fs.existsSync(
        resolveProjectPath(config.logs.programming),
      ),
      assetDbDirectory: fs.existsSync(
        resolveProjectPath(config.logs.assetDbDirectory),
      ),
      builderDirectory: fs.existsSync(
        resolveProjectPath(config.logs.builderDirectory),
      ),
    },
    git: {
      chineseCommitHookEnabled: hookPath === ".githooks",
    },
    validation: {
      developmentBuildPolicy:
        config.validation.developmentBuildPolicy,
      submissionValidationScript:
        config.validation.submissionValidationScript,
      failureReassessmentLimit:
        config.validation.failureReassessmentLimit,
    },
    prefab: config.prefab,
    visualReview: {
      mode: config.visualReview.mode,
      uiSpec: visualContracts.uiSpecPath,
      cases: visualContracts.casesPath,
      uiSpecStatus: visualSummary.uiSpecStatus,
      caseCount: visualSummary.cases.length,
      requiredEvidenceCount: visualSummary.totalEvidence,
      captureSurface: config.visualReview.policy.captureSurface,
      evidenceDirectory:
        config.visualReview.project.evidenceDirectory,
      ready: visualBlockers.length === 0,
      blockers: visualBlockers,
    },
  };
  const componentValidationFailed =
    isValidationBlocking(componentValidation);
  if (!report.creatorVersion.matches || componentValidationFailed) {
    process.exitCode = 1;
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`工作流环境：${report.project}（${report.platform}）`);
  console.log(
    `Creator：${report.editor.targetProjectOpen ? `已复用 PID ${editorPid}` : "目标项目未打开"}；Dashboard：${report.editor.dashboardRunning ? "运行中" : "未运行"}`,
  );
  console.log(
    `进程发现：${formatCapability(report.editor.processDiscovery)}`,
  );
  console.log(
    `桥接扩展：${report.editor.extensionConnected ? "已连接" : "未连接"}；预览：${previewUrls.join("、") || "未发现"}`,
  );
  console.log(
    `端口发现：${formatCapability(report.preview.portDiscovery)}`,
  );
  console.log(
    `浏览器控制：${formatBrowserControl(report.preview.browserControl)}；标签策略：优先复用，仅缺失时新建`,
  );
  console.log(
    `组件校验：${formatValidationState(componentValidation)}`,
  );
  console.log(
    `日志：编辑器 ${report.logs.editor ? "可读" : "缺失"}，脚本 ${report.logs.programming ? "可读" : "缺失"}，资源库 ${report.logs.assetDbDirectory ? "可读" : "缺失"}，构建 ${report.logs.builderDirectory ? "可读" : "缺失"}`,
  );
  console.log(
    `中文提交钩子：${report.git.chineseCommitHookEnabled ? "已启用" : "未启用，请执行 npm run workflow:setup"}`,
  );
  console.log(
    `完整验证：npm run ${report.validation.submissionValidationScript}；连续 ${report.validation.failureReassessmentLimit} 次未改变首个错误后重新定位。`,
  );
  console.log(
    "Prefab：只允许 Creator 官方事件创建；校验顺序为结构 -> 导入 -> 运行 -> 视觉。",
  );
  console.log(
    `视觉验收：${report.visualReview.ready ? "可开始" : `未就绪（${report.visualReview.blockers.join("；")}）`}；${report.visualReview.caseCount} 个用例，${report.visualReview.requiredEvidenceCount} 份证据。`,
  );
  console.log("开发阶段构建策略：仅在用户明确要求时执行。");
}

/** 把平台能力状态转换为简明诊断文本。 */
function formatCapability(capability) {
  return capability.available
    ? `可用（${capability.platform}）`
    : `受限（${capability.reason}）`;
}

/** 返回浏览器控制能力的缺省说明。 */
function getBrowserControlReason(status) {
  switch (status) {
    case "available":
      return null;
    case "unavailable":
      return "本机已声明浏览器控制不可用。";
    default:
      return "尚未在本机配置中确认浏览器控制能力。";
  }
}

/** 把浏览器控制状态转换为简明诊断文本。 */
function formatBrowserControl(capability) {
  return capability.available
    ? "可用"
    : `${capability.status}（${capability.reason}）`;
}

await main();
