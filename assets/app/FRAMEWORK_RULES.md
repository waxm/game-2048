# Work AI 框架说明

## 框架目标

本目录维护从 `cocos-game-framework` 同步而来的通用能力。框架代码不得依赖 2048 玩法、业务 UI、关卡数据或美术资源；通用优化必须拆成独立提交回流框架仓库。

## 当前结构

```text
assets/app/core/
  app/App.ts                 # 初始化、服务注册和全局重置
  audio/AudioManager.ts      # 音乐、音效和前后台生命周期
  data/StorageManager.ts     # 本地存档
  event/EventCenter.ts       # 全局事件与 owner 清理
  pool/PoolManager.ts        # 节点池和 Prefab 资源所有权
  resource/ResManager.ts     # 资源句柄、引用计数和 Bundle 管理
  scene/SceneBase.ts         # 场景进入、回滚和退出清理
  scene/SceneManager.ts      # 场景切换状态与并发保护
  timer/TimerManager.ts      # 延迟、循环和 owner 清理
  ui/UIBase.ts               # 面板生命周期和绑定校验
  ui/UIManager.ts            # UI 加载、缓存和并发请求管理
  utils/Logger.ts            # 分级日志

assets/app/scenes/BootScene.ts # 最小框架启动入口
assets/scene/Boot.scene         # 唯一框架场景
tools/                          # 核心测试和 Cocos 资源校验
```

## 启动流程

```text
Boot.scene
  -> BootScene.onEnter()
  -> App.init()
  -> 初始化 Storage、Audio、UI 和 Scene 管理器
  -> 等待具体游戏分支接入首个业务场景
```

框架不预设 `Lobby`、`Game` 或其他业务场景，也不自动加载业务 Prefab。

## 所有权规则

- `EventCenter` 和 `TimerManager` 使用 owner 清理。
- `ResManager` 通过资源句柄负责 `addRef/decRef`。
- `UIManager` 将动态 Prefab 句柄绑定到实例节点销毁。
- `PoolManager` 在池与全部节点结束后释放 Prefab 句柄。
- `AudioManager` 独立持有音乐和音效资源句柄。
- `SceneBase` 在进入失败或退出时统一清理事件、计时器、Tween、调度和跟踪资源。

## 框架同步

1. 在游戏仓库中把通用优化与 2048 业务修改拆成不同提交。
2. 确认 `assets/app/core` 不依赖 `game`、业务 UI、业务场景或具体资源。
3. 将通用提交同步到框架仓库 `dev` 并执行完整框架验证。
4. 框架验证通过后，把正式框架提交同步给需要它的其他游戏仓库。
5. 2048 的 Scene、Prefab 和玩法测试继续只在本仓库维护。

## 验证命令

```text
npm run typecheck        # TypeScript 编译检查
npm run verify:core      # 28 个核心框架用例
npm run validate:cocos   # Scene、脚本类 ID、UUID 和绑定校验
npm run verify           # 执行全部框架验证
```
