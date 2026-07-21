# Work_AI

基于 Cocos Creator 3.8.4 的小型 2D 游戏框架，设计尺寸为竖屏 `640 x 1136`。

## 分支模型

```text
master          # 稳定框架
dev             # 框架开发基线，新游戏从这里创建分支
codex/puzzle    # 拼图游戏完整实现
```

开发新小游戏时，从 `dev` 创建独立分支，只在该分支添加业务场景、UI、Prefab、配置和资源。通用框架改进先回到 `dev` 独立完成，再同步到 `master` 和需要它的游戏分支。

## 框架验证

```bash
npm run typecheck
npm run verify:core
npm run validate:cocos
npm run verify
```

框架的详细模块和开发约束见 `assets/app/FRAMEWORK_RULES.md` 与 `AGENTS.md`。
