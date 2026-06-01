# Game 游戏层

这里放当前项目的游戏业务逻辑。

这里的代码可以依赖 `app/core`，但 `app/core` 不应该反过来依赖这里。

## 当前游戏模板

```text
GameEvent.ts                         # 当前游戏事件名枚举
config/DemoGameConfig.ts             # 点击得分 Demo 配置类型
controller/DemoGameController.ts     # 点击得分 Demo 控制器
model/DemoGameState.ts               # 点击得分 Demo 状态类型
```

Demo 的实际配置文件在 `assets/resources/config/DemoGameConfig.json`。
