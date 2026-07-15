# Lanhu To Cocos

本目录用于保存蓝湖 UI 转 Cocos Creator prefab 的本地工具和生成记录。

蓝湖切图统一生成到 `assets/resources/textures/lanhu`，不再直接放在 `assets/resources/lanhu`。

## 当前恢复状态

2026-07-14 已从蓝湖资源重新恢复以下产物：

- `assets/resources/prefabs/lanhu/UIHtmlCssPanel.prefab`
- `assets/resources/prefabs/lanhu/UIRenameConfirmPanel.prefab`
- `assets/resources/prefabs/lanhu/UIRenamePanel.prefab`
- `assets/resources/prefabs/lanhu/UIUpgradePanel.prefab`
- `assets/resources/prefabs/lanhu/UIVisitFriendsPanel.prefab`
- `assets/resources/prefabs/lanhu/UIVisitFriendItem.prefab`
- `assets/app/ui/lanhu/UIRenameConfirmPanel.ts`
- `assets/app/ui/lanhu/UIRenamePanel.ts`
- `assets/app/ui/lanhu/UIVisitFriendsPanel.ts`
- `assets/app/ui/lanhu/UIVisitFriendItem.ts`

## 已恢复规则

- 按钮文字作为按钮节点子节点。
- 按钮使用缩放点击反馈，按下缩放到 `0.90`。
- 重复列表结构使用 `ScrollView + View + Content + ItemPrefab`。
- 文本和图片按默认规则判断是否需要绑定，策划案可覆盖。
- 按钮背景、输入框、弹窗底板、面板背景默认作为九宫拉伸候选。

## 注意

如果工程再次被还原，优先检查：

```bash
git -C /Users/huafang/Work/Work_AI status --short
find /Users/huafang/Work/Work_AI/assets/resources/prefabs/lanhu -maxdepth 1 -type f
find /Users/huafang/Work/Work_AI/assets/app/ui/lanhu -maxdepth 1 -type f -name 'UI*.ts'
```

然后重新从蓝湖 MCP 拉取切图并生成 prefab。
