# Scene 场景资源

这里专门存放 Cocos Creator 场景文件。

推荐结构：

```text
assets/scene/
  Boot.scene
  Lobby.scene
  Game.scene
```

对应的场景脚本仍然放在 `assets/app/scenes`：

```text
assets/app/scenes/
  BootScene.ts
  LobbyScene.ts
  GameScene.ts
```

这样可以把“场景资源”和“业务脚本”分开管理。
