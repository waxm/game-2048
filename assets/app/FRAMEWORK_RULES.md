# Work AI 框架规范

## 项目目标

这个框架用于开发基于 Cocos Creator 3.8.4 的小型 2D 游戏。

第一版框架要保持小巧、清晰、容易复用，方便后续复制到新的小游戏项目中。

当前项目设计尺寸统一为竖屏 `640 x 1136`。

## 目录结构

```text
assets/
  app/
    core/              # 所有游戏都可以复用的框架代码
    game/              # 当前游戏的业务逻辑
    modules/           # 可复用的玩法模块或功能模块
    ui/                # UI 脚本和 UI 辅助工具
    config/            # 本地配置文件
    data/              # 运行时数据和存档模型
    audio/             # 音频定义和音频封装
    platform/          # 平台适配层
    utils/             # 项目级工具类
    scenes/            # 场景脚本
  scene/               # Cocos Creator 场景文件
  bundles/
    common/            # 通用分包资源
    lobby/             # 大厅和菜单资源
    gameplay/          # 游戏内资源
  resources/           # 少量全局动态加载资源
```

## 命名规范

- 类名使用 `PascalCase`。
- TypeScript 文件名和导出的类名保持一致。
- UI 面板脚本以 `UI` 开头，例如 `UIHomePanel.ts`。
- 管理器类以 `Manager` 结尾，例如 `AudioManager.ts`。
- 场景脚本以 `Scene` 结尾，例如 `BootScene.ts`。
- 数据类以 `Data` 结尾，例如 `PlayerData.ts`。
- 配置类以 `Config` 结尾，例如 `LevelConfig.ts`。
- 事件名统一放在一个枚举或常量文件中定义。

## 第一批框架模块

优先搭建这些模块：

```text
App
Logger
EventCenter
StorageManager
ResManager
UIBase
UIManager
SceneBase
SceneManager
AudioManager
PoolManager
TimerManager
```

## 启动流程

```text
BootScene
  -> App.init()
  -> ConfigManager.init()
  -> StorageManager.init()
  -> AudioManager.init()
  -> UIManager.init()
  -> SceneManager.load("Lobby")
```

当前已经实现 `BootScene -> App.init()`，并接入存档、音频、UI 和场景状态初始化。
等真正创建 `Lobby` 场景资源后，再让启动场景自动切换到大厅。

## 当前进度

```text
第 1 步：确认框架目标，已完成
第 2 步：创建项目目录规范，已完成
第 3 步：命名规范和核心脚本模板，已完成
第 4 步：启动流程，已完成
第 5 步：资源管理 ResManager，已完成
第 6 步：UI 管理 UIManager，已完成
第 7 步：场景管理 SceneManager，已完成
第 8 步：音频管理 AudioManager，已完成
第 9 步：本地存档 StorageManager，已完成
第 10 步：对象池和计时器，已完成
第 11 步：UI 和场景代码模板，已完成
第 12 步：小游戏 Demo 验证框架，已完成
```

## Demo 验证游戏

当前 Demo 是一个限时点击得分游戏：

```text
LobbyScene
  -> UIHomePanel
  -> 点击屏幕
  -> SceneManager.load("Game")

GameScene
  -> UIGamePanel
  -> DemoGameController
  -> 读取 DemoGameConfig.json
  -> 点击得分
  -> 倒计时结束或达成目标
  -> 保存最高分和金币
  -> 点击返回大厅
```

Demo 已经用到这些框架模块：

```text
App               # 启动框架
Logger            # 输出流程日志
EventCenter       # 游戏事件通信
ResManager        # 读取 Demo 配置
UIBase            # UI 面板生命周期
UIManager         # 管理首页和游戏面板
SceneBase         # 场景生命周期
SceneManager      # 大厅和游戏场景切换
AudioManager      # 音频入口和音量设置
StorageManager    # 保存最高分和金币
PoolManager       # 复用得分飘字节点
TimerManager      # 倒计时和飘字回收
```

在 Cocos Creator 中需要创建三个场景：

```text
assets/scene/Boot.scene        # 挂 BootScene
assets/scene/Lobby.scene       # 挂 LobbyScene
assets/scene/Game.scene        # 挂 GameScene
```

场景名称要和代码里的 `Boot`、`Lobby`、`Game` 保持一致。

## 开发规则

新增功能前，先判断代码应该放在哪里：

- 框架级通用能力放到 `app/core`。
- 当前游戏专属逻辑放到 `app/game`。
- 可复用功能模块放到 `app/modules`。
- UI 脚本放到 `app/ui`。
- 场景脚本放到 `app/scenes`。

## 注释规则

- 核心框架代码必须写中文注释。
- 类、重要属性、公开方法都要说明用途。
- 复杂逻辑前要补一行简短说明。
- 不写没有意义的逐行翻译式注释。
