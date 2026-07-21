# Game 拼图业务层

这里存放当前拼图游戏的配置、状态、控制器和纯逻辑。业务层可以依赖 `app/core`，核心框架不得反向依赖拼图代码。

```text
GameEvent.ts                              # 拼图与场景、UI 的事件协议
config/PuzzleLevelConfig.ts               # 关卡配置类型和生成目录出口
config/PuzzleLevelCatalog.generated.ts    # 根据关卡资源自动生成
controller/PuzzleGameController.ts        # 单关进度、完成和失败状态
logic/PuzzleGrid.ts                       # 规则网格和坐标关系
logic/PuzzleImageSlicer.ts                # 完整原图运行时切分
logic/PuzzleMovePlanner.ts                # 无空格棋盘移动规划
logic/PuzzleGroupContour.ts               # 组合外围轮廓计算
model/PuzzleGameState.ts                  # 关卡运行状态和事件参数
model/PuzzleGroup.ts                      # 软组合模型与重建管理
progress/PuzzleLevelSession.ts            # 当前选择关卡
progress/PuzzleProgressManager.ts         # 通关和解锁存档
```

关卡参数维护在 `tools/config/puzzle-levels.json`，图片放在 `assets/resources/textures/game/levels`。新增、删除或调整关卡后运行 `npm run generate:levels`，不要手写生成文件中的资源路径。
