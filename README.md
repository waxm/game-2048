# 2048 竞技场

基于 Cocos Creator 3.8.4 开发的 2D 数字吞噬游戏，设计尺寸为竖屏 `640 x 1136`。

玩家控制队首在圆形竞技场中移动，吞噬地图数字形成沿移动轨迹跟随的队列，并与智能 Bot 按双方队首数字结算吞噬关系。

## 仓库职责

- `main` 保存完整、可发布的 2048 游戏源码。
- 游戏业务位于 `assets/app/game`、业务 UI 和业务场景目录。
- 通用框架位于 `assets/app/core`，来源于 [`cocos-game-framework`](https://github.com/waxm/cocos-game-framework)。
- 游戏中产生的通用优化需要拆成独立提交，回流框架仓库验证后再同步给其他游戏。

## 验证

首次克隆后先用 Cocos Creator 3.8.4 打开项目，等待它生成 `temp/tsconfig.cocos.json`，再执行：

```bash
npm run typecheck
npm run verify:core
npm run verify:game2048
npm run validate:cocos
npm run verify
```

完整开发约束见 `AGENTS.md`。
