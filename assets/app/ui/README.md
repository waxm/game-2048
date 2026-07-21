# UI 界面层

UI 脚本和 Prefab 使用一致的模块目录，不建立集中存放所有面板的 `panels` 目录。

```text
common/UILoadErrorPanel.ts          # 资源或界面加载失败恢复
home/UIHomePanel.ts                 # 大厅和关卡入口
game/UIGamePanel.ts                 # 拼图显示、计时、道具和拖拽编排
game/PuzzlePiece.ts                 # 单块图片显示与触摸输入
game/PuzzleGroupBorderRenderer.ts   # 组合外框绘制
popup/UIResultPanel.ts              # 通关和失败结算
```

业务 UI 不得运行时创建、查找或补齐节点。脚本要操作的节点、组件和 Prefab 必须通过 `@property` 在 Inspector 显式绑定，并在 `onLoad()` 校验必填引用。
