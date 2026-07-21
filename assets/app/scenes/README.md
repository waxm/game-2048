# Scenes 场景层

场景脚本放在这里，场景资源放在 `assets/scene`。

```text
BootScene.ts       # 初始化框架并进入大厅
LobbyScene.ts      # 打开大厅、选择关卡并进入游戏
GameScene.ts       # 创建关卡、处理结算、重玩、切关和返回大厅
```

项目当前包含 `Boot.scene`、`Lobby.scene` 和 `Game.scene`。场景脚本需要的节点必须在 Scene 中显式绑定；加载失败由通用错误面板提供重试或返回入口。
