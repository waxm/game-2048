# AGENTS.md

## 项目概况

- 引擎版本：Cocos Creator 3.8.4。
- 项目 UI 尺寸：640 x 1136。
- UI 来源：蓝湖页面、蓝湖代码页签 HTML/CSS、切图资源、策划案。

## Prefab 目录规范

- 所有需要动态加载的 Prefab 放在 `assets/resources/prefabs`。
- Prefab 必须按功能模块分类：`common`、`home`、`game`、`popup`、`item`。
- 蓝湖转换生成的 Prefab 统一放在 `assets/resources/prefabs/lanhu`。
- 新增 Prefab 不要直接放在 `assets/resources/prefabs` 根目录。
- 加载 Prefab 时必须使用包含模块目录的资源路径，例如 `prefabs/home/UIHomePanel`。

## Prefab 节点绑定与校验

- Prefab 驱动的业务 UI 不允许在脚本中使用 `new Node()` 创建界面节点，也不允许通过递归、`getChildByName()`、`find()` 等方式兜底查找节点。
- 脚本需要读取或修改的 Label、Sprite、Button、ScrollView、Prefab、Node 等，必须通过 `@property` 暴露，并在 Prefab 的 Inspector 中显式绑定。
- 面板在 `onLoad()` 时必须调用 `UIBase.assertRequiredBindings()` 校验所有必填引用；缺失绑定必须直接抛出明确错误。
- 不允许为缺失引用创建临时节点、赋默认 UI 或静默跳过事件绑定。

## 代码注释规范

- 所有 TypeScript 代码使用中文注释。
- 类、接口、枚举、成员变量、常量、公开方法和生命周期方法必须说明用途。
- 私有函数只要包含状态判断、事件通信、资源释放、坐标换算、数据转换、循环构建或其他非直观逻辑，也必须补充用途注释。
- 复杂逻辑块前说明“为什么这样做”，例如吸附阈值、缓存策略、状态变更顺序；不写逐行翻译代码的无效注释。
- 新增或修改代码时，同步补齐受影响变量、函数和复杂逻辑的注释。

## 蓝湖转 Cocos 规则

- 蓝湖 HTML/CSS 优先作为视觉规格；切图用于 Sprite 资源。
- UI 面板脚本生成到 `assets/app/ui/panels`。
- 生成的面板脚本继承 `assets/app/core/ui/UIBase.ts` 中的 `UIBase`。
- 生成文件里不要写具体业务逻辑，按钮事件只生成空方法或 TODO。

## 节点映射

- `image` -> `Node + UITransform + Sprite`。
- `text` -> `Node + UITransform + Label`。
- `button` -> `Node + UITransform + Sprite + Button`。
- 重复列表结构 -> `ScrollView + View + Content + ItemPrefab`，不要把多条数据静态拼死在主 prefab 里。
- 按钮节点需要暴露 `@property(Button)` 字段，并注册点击事件。
- 如果文本属于按钮上的文字，必须作为按钮节点的子节点，不要和按钮背景做成同级节点。
- 按钮默认使用缩放点击反馈：`Button.transition = SCALE`，按下缩放到 `0.90`。

## 列表识别规则

- 如果蓝湖 HTML/CSS 中出现连续重复容器，例如 `box_12`、`box_13`、`box_14`，并且内部结构一致，应判定为列表。
- 典型列表项特征：头像/图标 + 名称文本 + 数值文本 + 操作按钮，且多项按固定 y 间距排列。
- 判定为列表后，主 prefab 只生成列表容器，不要把每一条都作为业务数据静态节点铺进去。
- 主 prefab 应包含 `ScrollView`、`View`、`Content`。
- 列表项应拆成独立 prefab，例如 `UIVisitFriendItem.prefab`。
- 面板脚本应暴露 `@property(ScrollView)`、`@property(Node)` content、`@property(Prefab)` itemPrefab。
- Item 脚本应暴露头像、名称、数值、按钮等字段，并提供 `setData()` 入口。

## 文本绑定默认规则

- 未提供策划案时，先按默认规则判断文本是否需要绑定；策划案字段说明优先级高于默认规则。
- 默认固定文案：面板标题、tab 文案、普通按钮文字、说明文案、固定功能入口文案。
- 默认绑定文案：昵称、名称、ID、房间号、输入框内容或 placeholder、数字、数量、资产、持有数、等级、经验、进度、声望、价格、货币、倒计时、列表项字段。
- 按钮子文本仍然挂在按钮节点下；如果按钮文字是价格/货币，例如 `50灵玉`，默认也标记为可绑定。

## 图片绑定默认规则

- 未提供策划案时，图片资源也按默认规则判断是否需要绑定；策划案字段说明优先级高于默认规则。
- 默认固定图片：面板背景、弹窗底板、标题条、输入框背景、按钮底图、tab 选中底图、关闭按钮、固定装饰。
- 默认绑定图片：头像、宠物/角色图、道具图标、货币图标、奖励图标、状态/品质图标、列表项里的动态图。
- 生成规格文件时应标注文本和图片的 `binding`、`bindingReason`，方便后续根据策划案修正。

## 九宫拉伸规则

- 按钮背景、输入框背景、弹窗底板、面板底板、列表项背景默认优先识别为九宫拉伸候选。
- Cocos 中使用 `Sprite.type = SLICED`，并在图片 meta 中设置 `borderTop / borderBottom / borderLeft / borderRight`。
- 默认边距取 CSS radius 或 `min(width, height) / 2` 的合理值；复杂纹理按钮需要策划案或人工复核。
