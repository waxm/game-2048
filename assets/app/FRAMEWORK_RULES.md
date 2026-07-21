# Work AI 框架说明

## 框架目标

这个分支只维护可复用的小型 2D 游戏框架，不包含任何具体玩法、业务 UI、关卡数据或美术资源。新游戏从 `dev` 创建独立分支后再添加业务内容。

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

## 新游戏接入

1. 从 `dev` 创建游戏分支。
2. 在 `assets/app/game` 添加业务状态和逻辑。
3. 在 `assets/app/ui/<module>` 添加 UI 脚本，并建立对应的 `prefabs/<module>`、`textures/<module>`。
4. 在 `assets/app/scenes` 和 `assets/scene` 添加业务场景。
5. 将新增正式 Scene 和 Prefab 登记到 `tools/cocos-asset-manifest.mjs`。
6. 为玩法规则增加独立自动化测试，并接入该分支的 `npm run verify`。

## 验证命令

```text
npm run typecheck        # TypeScript 编译检查
npm run verify:core      # 28 个核心框架用例
npm run validate:cocos   # Scene、脚本类 ID、UUID 和绑定校验
npm run verify           # 执行全部框架验证
```
