#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  loadWorkflowConfig,
  projectRoot,
  readJson,
  validateMachineConfig,
} from "./lib.mjs";
import {
  loadVisualContracts,
  summarizeVisualContracts,
} from "./visual-review-lib.mjs";

/** 校验 Creator 桥接扩展和工作流脚本契约。 */
function main() {
  const config = loadWorkflowConfig();
  const packageJson = readJson(path.join(projectRoot, "package.json"));
  const extensionPackage = readJson(
    path.join(
      projectRoot,
      "extensions/cocos-workflow-bridge/package.json",
    ),
  );
  if (extensionPackage.editor !== `>=${config.creator.version}`) {
    throw new Error("Creator 桥接扩展版本范围与工作流配置不一致。");
  }
  if (extensionPackage.version !== config.workflowVersion) {
    throw new Error("Creator 桥接扩展版本与工作流版本不一致。");
  }
  for (const scriptName of [
    "create:prefab",
    "workflow:setup",
    "workflow:doctor",
    "workflow:log:mark",
    "workflow:log:read",
    "workflow:preview",
    "workflow:prefab",
    "workflow:visual",
    "workflow:visual:verify",
    "workflow:verify",
    "validate:components",
    "verify:changed",
    "verify:module",
  ]) {
    if (!packageJson.scripts?.[scriptName]) {
      throw new Error(`package.json 缺少工作流脚本：${scriptName}`);
    }
  }
  if (
    config.prefab.creationPolicy !== "creator-event-only" ||
    config.prefab.fallbackPolicy !== "stop-without-json"
  ) {
    throw new Error("Prefab 创建策略未锁定为 Creator 官方事件。");
  }
  for (const requiredPath of [
    "extensions/cocos-workflow-bridge/prefab-command.js",
    "tools/cocos-workflow/prefab.mjs",
    "tools/cocos-workflow/visual-review-lib.mjs",
    "tools/cocos-workflow/visual-review.mjs",
    config.visualReview.templates.uiSpec,
    config.visualReview.templates.cases,
  ]) {
    if (!fs.existsSync(path.join(projectRoot, requiredPath))) {
      throw new Error(`缺少 Creator-first Prefab 工作流文件：${requiredPath}`);
    }
  }
  const visualContracts = loadVisualContracts(config);
  const visualSummary = summarizeVisualContracts(config, visualContracts);
  if (visualSummary.totalEvidence < 3) {
    throw new Error("视觉验收契约没有覆盖足够的状态和视口。");
  }
  if (config.visualReview.mode === "project") {
    if (visualContracts.uiSpec.game.repository !== packageJson.name) {
      throw new Error("GAME_UI_SPEC.json 的仓库标识与 package.json.name 不一致。");
    }
    if (!Object.hasOwn(config.modules, visualContracts.uiSpec.game.id)) {
      throw new Error("GAME_UI_SPEC.json 的游戏 id 没有对应模块验收配置。");
    }
  }
  if (
    !packageJson.scripts?.[
      config.validation.submissionValidationScript
    ]
  ) {
    throw new Error(
      `package.json 缺少完整验证脚本：${config.validation.submissionValidationScript}`,
    );
  }
  const localExample = readJson(
    path.join(
      projectRoot,
      ".cocos-workflow.local.example.json",
    ),
  );
  if (localExample.schemaVersion !== 1) {
    throw new Error("本机工作流配置示例版本必须为 1。");
  }
  validateMachineConfig(
    localExample.machine,
    "本机工作流配置示例的 machine",
  );
  const hookSource = fs.readFileSync(
    path.join(projectRoot, ".githooks/commit-msg"),
    "utf8",
  );
  if (!hookSource.includes("verify-commit-message.mjs")) {
    throw new Error("Git commit-msg 没有接入中文提交校验。");
  }
  if (packageJson.name !== "cocos-game-framework") {
    const baselinePath = path.join(
      projectRoot,
      "COCOS_WORKFLOW_BASELINE.json",
    );
    if (!fs.existsSync(baselinePath)) {
      throw new Error("游戏仓库缺少 COCOS_WORKFLOW_BASELINE.json。");
    }
    const baseline = readJson(baselinePath);
    if (
      baseline.workflowVersion !== config.workflowVersion ||
      baseline.creatorVersion !== config.creator.version
    ) {
      throw new Error("工作流来源记录与当前配置版本不一致。");
    }
  }
  console.log(
    `工作流契约检查通过：版本 ${config.workflowVersion}，Creator ${config.creator.version}。`,
  );
}

main();
