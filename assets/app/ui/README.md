# UI 界面层

这里放 UI 面板脚本、UI 数据模型和 UI 专用工具。

面板类名建议以 `UI` 开头，例如 `UIHomePanel`。

## 当前 UI 模板

```text
panels/UIHomePanel.ts # 首页面板模板
panels/UIGamePanel.ts # 点击得分 Demo 游戏面板
```

后续创建对应 Prefab 时，建议让 Prefab 名和脚本类名保持一致。

当前 Demo 阶段 UI 由代码创建，不强制依赖 Prefab。
