# AGENTS.md

## 项目基础

- 引擎版本：Cocos Creator 3.8.4。
- 设计尺寸：竖屏 `640 x 1136`。
- UI 输入来源：蓝湖页面、蓝湖 HTML/CSS、切图资源和策划案。
- 本文件中的规则适用于新增代码、资源、Prefab，以及对现有内容的修改和迁移。

## 需求偏差与返工

- 当用户明确表示初版结果与预期不一致，或因需求描述不完整、理解偏差导致实现方向错误时，必须停止在初版上继续叠加局部补丁。
- 返工前必须重新阅读用户最新要求、上下文、参考视频或图片以及当前工程，从目标效果、交互规则、数据结构、节点结构和资源关系重新分析实现方案。
- 必须先识别初版与预期不一致的根本原因，再重写受影响的代码、Prefab、配置或生成工具；不得通过增加临时判断、兜底节点、兼容分支或重复状态来掩盖错误结构。
- 仅可保留已经确认符合最新需求且边界清晰的基础能力；与新方案冲突的旧逻辑必须删除，避免新旧实现同时存在。
- 优先根据现有上下文和用户提供的参考还原目标；只有缺少决定实现方向的关键信息且无法从工程中确认时，才向用户提出必要问题。
- 重写完成后必须按照“完成前验证”重新验证完整流程，不得仅以局部功能生效或编译通过作为完成标准。
- 上述规则适用于方向性偏差和整体结构错误；范围明确、不会延续错误设计的普通缺陷可以直接修复。

## 模块目录

UI 代码、Prefab 和 Texture 使用同一套模块名：

| 模块 | 用途 | UI 代码 | Prefab | Texture |
| --- | --- | --- | --- | --- |
| `common` | 通用 UI 和资源 | `assets/app/ui/common` | `assets/resources/prefabs/common` | `assets/resources/textures/common` |
| `home` | 首页和大厅 | `assets/app/ui/home` | `assets/resources/prefabs/home` | `assets/resources/textures/home` |
| `game` | 游戏面板、玩法组件和关卡资源 | `assets/app/ui/game` | `assets/resources/prefabs/game` | `assets/resources/textures/game` |
| `popup` | 独立弹窗 | `assets/app/ui/popup` | `assets/resources/prefabs/popup` | `assets/resources/textures/popup` |
| `item` | 列表项和可复用小组件 | `assets/app/ui/item` | `assets/resources/prefabs/item` | `assets/resources/textures/item` |
| `lanhu` | 蓝湖工具生成的内容 | `assets/app/ui/lanhu` | `assets/resources/prefabs/lanhu` | `assets/resources/textures/lanhu` |

目录使用规则：

- UI 脚本、Prefab 和图片必须按模块存放，不得直接堆在 `ui`、`prefabs` 或 `textures` 根目录。
- 不允许重新建立集中收纳所有 UI 脚本的 `assets/app/ui/panels`。
- 模块内部可以继续按用途分层，例如关卡原图放在 `textures/game/levels/level_001`。
- 动态加载路径必须包含模块目录，例如 `prefabs/home/UIHomePanel`、`textures/game/levels/level_001/level_001_source/spriteFrame`。
- 移动脚本或资源时必须同时移动对应 `.meta`，保持脚本、Texture、SpriteFrame 的 UUID 及 Prefab 绑定不变。
- 迁移资源后必须同步修改动态加载路径、生成工具和相关文档。
- 新业务可以增加语义明确的模块目录，但代码、Prefab 和 Texture 的模块归属必须保持一致。

## Prefab 节点绑定

Prefab 是业务 UI 节点结构的唯一来源：

- 禁止在业务 UI 脚本中使用 `new Node()` 创建界面节点。
- 禁止使用递归、`getChildByName()`、`find()` 等方式查找或兜底补齐节点。
- 脚本需要读取或修改的 `Node`、`Label`、`Sprite`、`Button`、`ScrollView`、`Prefab` 等引用，必须通过 `@property` 暴露并在 Inspector 中显式绑定。
- 面板必须在 `onLoad()` 调用 `UIBase.assertRequiredBindings()` 校验必填引用。
- 缺失绑定必须抛出包含字段信息的明确错误；不得创建临时节点、填入默认 UI 或静默跳过事件绑定。

## Prefab 与 Scene 编辑

- 禁止直接手写、局部拼接或凭经验修改 `.prefab`、`.scene` 的序列化 JSON。
- Prefab 和 Scene 优先通过 Cocos Creator 编辑器创建；需要批量生成时，必须使用可重复执行且带结构校验的生成工具。
- 生成工具不得猜测脚本压缩类 ID；必须根据脚本 `.meta` UUID 和 Creator 实际编译结果取得正确类型 ID。
- 修改或生成 Prefab、Scene 后，必须校验对象 `__id__` 引用范围、节点父子关系、脚本组件、资源 UUID 和所有必填 `@property` 绑定。
- 文件必须经过 Creator 重新导入，确认控制台不存在 `Can not find class`、`Missing Script`、反序列化失败或资源 UUID 丢失后，才视为完成。
- 生成工具应保持稳定的资源 UUID；重新生成现有文件时不得无故改变 Prefab、Scene 或脚本绑定使用的 UUID。

## 生命周期与清理

- `EventCenter.on()` 必须有对应的 `EventCenter.off()`；`Node.on()` 必须有对应的 `Node.off()`。
- 按钮、触摸、键盘、全局事件、计时器、`schedule`、Tween 和自定义回调必须在面板关闭、组件销毁或场景退出时清理。
- 事件注册函数必须可重复调用且不会重复绑定；需要使用状态标记或其他明确方式保证幂等。
- 在 `onLoad()`、`onEnable()`、`onOpen()` 注册的内容，应分别在对应的 `onDestroy()`、`onDisable()`、`onClose()` 阶段释放。
- 销毁控制器或运行对象时必须清空其事件监听、计时任务、节点引用和外部回调，避免重玩或再次进入场景后重复响应。
- 清理函数必须允许重复调用，不得因节点已销毁、事件已注销或任务已结束而再次抛错。

## 异步资源加载

- 业务代码统一通过 `ResManager` 加载和实例化资源，禁止散落使用 `resources.load()`、Bundle API 或重复封装加载逻辑；框架资源层和生成工具除外。
- 动态加载路径必须与资源类型一致；加载图片的 SpriteFrame 子资源时必须使用包含 `/spriteFrame` 的完整路径。
- `await` 返回后必须确认组件、节点和当前业务状态仍然有效，再修改 UI 或写入运行状态。
- 面板关闭、场景切换、重玩或连续发起同类请求时，必须通过请求序号、状态标记或取消机制阻止旧请求覆盖新状态。
- 加载失败必须记录资源类型、完整路径和原始错误，并向当前界面提供明确的失败状态；不得静默失败或创建替代 UI 掩盖问题。
- 必须明确资源的持有和释放责任；仍被场景、Prefab、SpriteFrame、缓存或其他对象引用的资源不得提前释放。
- 重复加载的公共资源应使用现有缓存或资源管理能力，不得在多个业务模块中分别维护不一致的缓存。

## 完成前验证

- 新增或修改 TypeScript 后必须执行 `tsc --noEmit`，确认项目代码编译通过。
- 修改 Prefab 或 Scene 后必须校验序列化结构、脚本类 ID、资源 UUID、节点父子关系和所有必填绑定。
- 新增、移动或重命名资源后必须确认 `.meta` 保留、动态加载路径正确，并检查 Creator 资源导入日志没有错误。
- Creator 必须完成相关脚本和资源的重新导入；仅修改磁盘文件但尚未进入 Creator 资源数据库，不视为完成。
- 用户可操作功能必须运行实际预览，检查 Chrome 控制台第一条红色错误，并验证主要操作流程、重复进入、重玩和退出流程。
- UI 修改必须在 `640 x 1136` 设计尺寸下检查位置、尺寸、层级、遮挡、越界、触摸区域和文本显示。
- 无法执行某项验证时必须明确说明未验证的项目和原因，不得用静态检查结果代替实际运行结果。

## TypeScript 注释

- 所有 TypeScript 注释使用中文。
- 类、接口、枚举、成员变量、常量、公开方法和生命周期方法必须说明用途。
- 包含状态判断、事件通信、资源释放、坐标换算、数据转换、循环构建等非直观逻辑的私有函数必须写注释。
- 复杂逻辑块应说明“为什么这样做”，例如吸附阈值、缓存策略和状态变更顺序。
- 新增或修改代码时，同步补齐受影响代码的注释；不写逐行翻译代码的无效注释。
