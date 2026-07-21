# Scenes 场景层

纯框架只保留 `BootScene.ts`，负责调用 `App.init()`。它不会预设或加载任何具体游戏场景。

游戏分支新增的场景脚本继续放在这里，对应 `.scene` 文件放在 `assets/scene`。场景脚本需要的节点必须在 Inspector 显式绑定，并通过 `SceneBase` 管理进入、退出和失败回滚。
