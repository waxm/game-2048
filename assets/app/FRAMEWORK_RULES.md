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
    ui/                # 按功能模块分类的 UI 脚本和 UI 辅助工具
      common/          # 通用 UI
      home/            # 首页和大厅 UI
      game/            # 游戏内面板和玩法显示组件
      popup/           # 独立弹窗
      item/            # 列表项和可复用小组件
      lanhu/           # 蓝湖工具生成的 UI 脚本
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

## Prefab 目录规范

所有动态加载的 Prefab 统一放在 `assets/resources/prefabs`，并按用途分类：

```text
assets/resources/prefabs/
  common/               # 通用组件，例如通用按钮、通用弹窗、加载界面
  home/                 # 首页和大厅 UI，例如 UIHomePanel
  game/                 # 游戏内 UI 和玩法对象，例如 UIGamePanel、PuzzlePiece
  popup/                # 独立弹窗，例如设置、通关、失败弹窗
  item/                 # 列表项和可复用小组件
  lanhu/                # 蓝湖转换工具生成的 Prefab
```

- 不要把新增 Prefab 直接放在 `assets/resources/prefabs` 根目录。
- 加载路径必须包含模块目录，例如首页 Prefab 使用 `prefabs/home/UIHomePanel`。
- 蓝湖转换生成的 Prefab 统一使用 `prefabs/lanhu/` 路径，避免与手工制作的业务 Prefab 混放。

## UI 代码目录规范

UI TypeScript 脚本必须在 `assets/app/ui` 下按功能模块分类，禁止统一堆放到 `ui/panels`：

```text
assets/app/ui/
  common/               # 通用 UI
  home/                 # 首页和大厅 UI
  game/                 # 游戏内 UI 和玩法显示组件
  popup/                # 独立弹窗
  item/                 # 列表项和可复用小组件
  lanhu/                # 蓝湖工具生成的 UI 脚本
```

- UI 脚本和手工 Prefab 应尽量使用相同模块目录，例如 `ui/game/UIGamePanel.ts` 对应 `prefabs/game/UIGamePanel.prefab`。
- 蓝湖生成脚本和 Prefab 分别放在 `ui/lanhu`、`prefabs/lanhu`。
- 移动已经绑定 Prefab 的脚本时，必须同时移动其 `.meta` 文件，禁止重新生成 UUID。
- 新增模块可以创建语义明确的新目录，但不能重新建立收纳所有面板的 `panels` 目录。

## Texture 目录规范

动态加载和 Prefab 使用的图片统一放在 `assets/resources/textures`，并与 UI、Prefab 使用同一套模块名：

```text
assets/resources/textures/
  common/               # 通用图片
  home/                 # 首页和大厅图片
  game/                 # 游戏内图片和关卡原图
    levels/             # 按关卡继续分类的整图资源
  popup/                # 弹窗图片
  item/                 # 列表项和小组件图片
  lanhu/                # 蓝湖 Prefab 使用的切图
```

- 不允许把新增图片直接放在 `assets/resources` 或 `assets/resources/textures` 根目录。
- 代码、Prefab 和 Texture 的模块归属应保持一致；通用资源必须进入 `common`。
- 加载路径必须包含模块目录，例如关卡图使用 `textures/game/levels/level_001/level_001_source/spriteFrame`。
- 移动图片时必须同时移动 `.meta`，保持 Texture 和 SpriteFrame UUID 不变；有动态加载代码时同步修改路径。
- 蓝湖生成工具必须把切图写入 `textures/lanhu`，不能恢复旧的 `resources/lanhu` 目录。

## Prefab 节点绑定与校验

Prefab 驱动的 UI 必须让 Prefab 成为唯一的节点结构来源：

- 不在 UI 脚本中用 `new Node()` 创建界面节点。
- 不使用递归、`getChildByName()`、`find()` 等运行时节点查找作为兜底。
- 所有需要读取或修改的 UI 节点，使用 `@property` 暴露并在 Inspector 中绑定。
- 在 `onLoad()` 调用 `UIBase.assertRequiredBindings()`；任何缺失引用都会直接抛出错误，便于第一时间定位 Prefab 配置问题。
- 不为缺失绑定创建替代节点，也不静默跳过按钮、列表或文本刷新逻辑。

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
- UI 脚本放到 `app/ui`，并继续按 `common`、`home`、`game`、`popup`、`item`、`lanhu` 等模块分类。
- 场景脚本放到 `app/scenes`。

## 注释规则

- 核心框架代码必须写中文注释。
- 类、接口、枚举、成员变量、常量、公开方法和生命周期方法都要说明用途。
- 私有函数只要包含状态判断、事件通信、资源释放、坐标换算、数据转换、循环构建或其他非直观逻辑，也要说明用途。
- 复杂逻辑块前要说明“为什么这样做”，例如吸附阈值、缓存策略、状态变更顺序。
- 新增或修改代码时，要同步补齐受影响变量、函数和复杂逻辑的注释。
- 不写没有意义的逐行翻译式注释。
