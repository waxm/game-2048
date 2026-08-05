# 游戏视觉验收工作流

本文件随框架工作流同步到每个游戏，说明不依赖某台电脑的视觉设计与截图验收方式。

## 文件所有权

| 内容 | 路径 | 提交 Git | 更新者 |
| --- | --- | --- | --- |
| UI 方向、颜色、间距、字体、组件模式 | `GAME_UI_SPEC.json` | 是 | 当前游戏 |
| 页面、动作、状态和检查项 | `tools/visual-review/cases.json` | 是 | 当前游戏 |
| 截图规则、验证器、模板 | `.cocos-workflow.json`、`tools/cocos-workflow/` | 是 | 框架同步 |
| 进程、端口和浏览器能力 | `.cocos-workflow.local.json` | 否 | 当前电脑 |
| PNG、会话和报告 | `temp/cocos-workflow/visual-review/` | 否 | 自动生成 |

框架升级不得覆盖已有游戏的前两项。新游戏创建或旧游戏首次升级时，只有在文件缺失的
情况下才从模板生成。

## 新电脑

克隆游戏仓库并安装依赖后执行：

```bash
npm run workflow:setup
npm run workflow:doctor
npm run workflow:visual -- plan
```

本机能力需要调整时，复制 `.cocos-workflow.local.example.json` 为
`.cocos-workflow.local.json`。本机文件只能覆盖 `machine`，不能关闭截图或错误门禁。

## 开始前

先根据需求、参考图和已有项目确认 `GAME_UI_SPEC.json`。未确认时保持 `draft`；视觉
方向得到确认后改为 `approved`。每个动态页面至少在 `cases.json` 中登记默认状态、
长文本或空数据等边界状态、动作后的可见结果和需要截图的视口。

运行 `npm run workflow:visual -- plan --json`，确认用例、状态和视口矩阵完整。随后复用
已打开的 Creator，从 Dashboard 打开缺失项目，动态发现预览 URL，并刷新对应浏览器
标签。不得把旧端口、旧标签 ID 或旧截图写进配置。

## 采集

刷新完成后立即创建会话：

```bash
npm run workflow:visual -- start \
  --preview-url <动态预览 URL> \
  --page-title <当前标签标题> \
  --preview-started-at <ISO 时间>
```

浏览器控制工具应设置契约中的视口和 `deviceScaleFactor=1`，按设计坐标执行用例动作，
并使用 Canvas 元素截图。记录时必须提供：

- 会话、用例、状态和视口；
- `--capture-method browser-canvas-element`；
- 当前预览 URL、页面标题、Canvas 宽高；
- 用例声明的每条新鲜度线索和每条视觉检查结果；
- 有动作的用例提供 `--action-completed`。

完成所有截图后记录本次浏览器 Console 与 Creator 日志增量，再完成会话。详细参数使用
`npm run workflow:visual -- help` 查看。

## 自动拒绝条件

以下任一情况不能形成通过报告：

- 页面标题不含当前游戏标识，或截图 URL 与会话 URL 不一致；
- 不是浏览器 Canvas 元素截图，PNG 尺寸、宽高比或像素比不符合视口；
- PNG 接近全黑，或原始文件早于本次预览刷新；
- 动作后的截图与基线几乎相同，或多个必需状态没有可感知差异；
- 新鲜度线索、逐项视觉检查或必需状态缺失；
- 浏览器 Console、Creator 错误或警告出现新增记录；
- 会话超过 30 分钟，或 UI 规格仍为 `draft`。

截图只证明可见结果。Scene/Prefab 层级、组件、Inspector 绑定、输入和生命周期仍由
资源校验、运行验证和自动化测试负责。
