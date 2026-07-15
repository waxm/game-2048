# 拼图关卡图片目录

每个关卡使用独立目录，目录和整图统一按三位关卡编号命名：

```text
level_001/level_001_source.png
level_002/level_002_source.png
level_100/level_100_source.png
```

关卡运行时只加载完整原图的 SpriteFrame 子资源，再根据关卡配置切分网格，不在资源目录中保存运行时散图。

当前素材包含第 1 至 89 关和第 100 关；第 90 至 99 关没有源图，因此不创建空目录。
