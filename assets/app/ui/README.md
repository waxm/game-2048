# UI 界面层

这里放 UI 面板脚本、UI 数据模型和 UI 专用工具。所有脚本必须继续按功能模块分类，不使用统一的 `panels` 目录。

面板类名建议以 `UI` 开头，例如 `UIHomePanel`。

## 目录结构

```text
common/               # 通用 UI
home/UIHomePanel.ts   # 首页和大厅 UI
game/UIGamePanel.ts   # 游戏内主面板
game/PuzzlePiece.ts   # 拼图玩法显示组件
popup/UIFailPanel.ts  # 独立弹窗
item/                 # 列表项和可复用小组件
lanhu/                # 蓝湖转换工具生成的 UI 脚本
```

后续创建对应 Prefab 时，Prefab 名、脚本类名和模块目录应保持一致。移动已有脚本时必须同时移动 `.meta`，避免 Prefab 丢失脚本绑定。
