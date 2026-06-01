# Scenes 场景层

这里放启动、大厅、游戏、结算等场景脚本。

场景资源文件放在 `assets/scene`，这里不放 `.scene` 文件。

场景脚本类名建议以 `Scene` 结尾。

## 当前场景脚本

```text
BootScene.ts          # 启动场景脚本，负责调用 App.init()
LobbyScene.ts         # 大厅场景模板
GameScene.ts          # 游戏场景模板
```

在 Cocos Creator 中创建 `assets/scene/Boot.scene` 后，把 `BootScene` 挂到场景里的根节点或专用启动节点上。

要运行第 12 步 Demo，还需要在 `assets/scene` 下创建 `Lobby.scene` 和 `Game.scene`，并分别挂上 `LobbyScene`、`GameScene`。
