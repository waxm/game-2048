# AGENTS.md

## 项目基础

- 引擎版本：Cocos Creator 3.8.4。
- 设计尺寸：竖屏 `640 x 1136`。
- 仓库名称：`game-2048`。
- `main` 保存完整 2048 游戏源码、业务 UI、场景、配置和资源。
- 通用框架来源：`waxm/cocos-game-framework`。
- 本文件适用于本游戏仓库的全部开发工作。

## 分支职责

- `main`：稳定游戏版本，只接收已经验证完成的 2048 玩法和资源。
- 功能开发使用短期功能分支，完成后合入 `main`，不使用永久分支承载其他游戏。
- `assets/app/core` 不得依赖 2048 玩法、业务 UI、业务场景或具体资源路径。
- 游戏中产生的通用优化必须先从业务依赖中抽离并形成独立提交，再同步到框架仓库 `dev`。
- 框架仓库验证后的通用提交，按需同步到本仓库和其他游戏仓库。

## 需求偏差与返工

- 当初版结果与预期不一致，必须停止继续叠加局部补丁。
- 返工前重新阅读最新要求、参考资料和当前工程，从交互、数据、节点和资源关系重新分析根因。
- 与新方案冲突的旧逻辑必须删除，不得增加临时判断、兜底节点或重复状态掩盖错误结构。
- 重写完成后必须验证完整流程，不能只以编译通过或局部生效作为完成标准。

## 代码边界

```text
assets/app/core/       # 与具体玩法无关的通用框架
assets/app/scenes/     # 框架只保留最小 BootScene
assets/scene/          # 框架只保留最小 Boot.scene
tools/                 # 框架验证和序列化资源检查
```

- `assets/app/core` 不得依赖 `game`、业务 `ui`、业务场景或具体资源路径。
- 2048 业务逻辑放在 `assets/app/game`，UI、Prefab 和 Texture 按业务模块分类。
- 禁止把脚本直接堆在 `ui`、`prefabs` 或 `textures` 根目录，也不得建立集中收纳所有面板的 `ui/panels`。
- 移动脚本或资源时必须同时移动对应 `.meta`，保持 UUID 和 Prefab 绑定稳定。
- 一次性验证脚本、临时生成资源和外部设计转换产物不得混入正式 `assets` 目录。

## Prefab 节点绑定

- Prefab 是业务 UI 节点结构的唯一来源。
- 禁止在业务 UI 脚本中使用 `new Node()` 创建界面节点。
- 禁止使用递归、`getChildByName()`、`find()` 等方式查找或兜底补齐节点。
- 脚本需要操作的 `Node`、`Label`、`Sprite`、`Button`、`ScrollView`、`Prefab` 等引用必须通过 `@property` 暴露并在 Inspector 显式绑定。
- 面板必须在 `onLoad()` 调用 `UIBase.assertRequiredBindings()` 校验必填引用。
- 缺失绑定必须抛出包含字段信息的明确错误，不得静默跳过或创建替代 UI。

## Prefab 与 Scene 编辑

- 禁止直接手写、局部拼接或凭经验修改 `.prefab`、`.scene` 序列化 JSON。
- Prefab 和 Scene 优先通过 Cocos Creator 编辑器创建；批量生成必须使用可重复执行且带结构校验的工具。
- 生成工具不得猜测脚本压缩类 ID，必须核对脚本 `.meta` UUID 和 Creator 实际编译结果。
- 修改后必须校验 `__id__`、父子关系、脚本组件、资源 UUID 和全部必填绑定。
- 文件必须经过 Creator 重新导入，确认不存在 `Can not find class`、`Missing Script`、反序列化失败或 UUID 丢失。
- 新增正式 Scene 或 Prefab 时必须登记到 `tools/cocos-asset-manifest.mjs`。

## 生命周期与清理

- `EventCenter.on()` 必须有对应的 `EventCenter.off()`；`Node.on()` 必须有对应的 `Node.off()`。
- 按钮、触摸、键盘、全局事件、计时器、`schedule`、Tween 和自定义回调必须在对应生命周期结束时清理。
- 注册函数必须可重复调用且不会重复绑定，清理函数也必须允许重复调用。
- 销毁控制器或运行对象时必须清空事件监听、计时任务、节点引用和外部回调。
- 场景退出应使用 `SceneBase` 的 owner 级清理能力，不在业务场景重复实现全局清理机制。

## 异步资源加载

- 业务统一通过 `ResManager` 加载和实例化资源，禁止散落调用 `resources.load()` 或重复封装 Bundle API。
- 加载 SpriteFrame 子资源时必须使用包含 `/spriteFrame` 的完整路径。
- `await` 返回后必须确认组件、节点、请求序号和业务状态仍然有效。
- 面板关闭、场景切换或连续请求时，必须阻止旧异步结果覆盖新状态。
- 加载失败必须记录资源类型、完整路径和原始错误，并提供明确恢复状态。
- 必须明确资源持有和释放责任，仍被节点、Prefab、SpriteFrame 或缓存引用的资源不得提前释放。

## 完成前验证

- 修改 TypeScript 后执行 `npm run typecheck`。
- 修改核心管理器后执行 `npm run verify:core`。
- 修改 Scene、Prefab、脚本绑定或资源 UUID 后执行 `npm run validate:cocos`。
- 提交前执行 `npm run verify`。
- 玩法规则必须补充独立自动化测试，并加入本仓库的 `verify` 命令。
- 用户可操作功能必须运行实际预览，并检查 Chrome 控制台第一条红色错误。
- UI 必须在 `640 x 1136` 下检查位置、层级、遮挡、越界、触摸区域和文本显示。
- 无法执行 Creator 导入或实际预览时必须明确说明，不能用静态检查代替。

## TypeScript 注释

- 所有 TypeScript 注释使用中文。
- 类、接口、枚举、成员变量、常量、公开方法和生命周期方法必须说明用途。
- 状态判断、事件通信、资源释放、坐标换算、数据转换和循环构建等非直观私有逻辑必须写注释。
- 复杂逻辑块应说明为什么这样处理，不写逐行翻译代码的无效注释。
- 新增或修改代码时同步补齐受影响代码的注释。
