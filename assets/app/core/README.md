# Core 核心层

这里放多个小游戏都可以复用的框架代码。

尽量不要在这里写某一个游戏专属的规则，让核心层保持通用。

## 当前基础模板

```text
app/App.ts             # 框架总入口和服务注册表
utils/Logger.ts        # 统一日志输出
event/EventCenter.ts   # 全局事件中心
resource/ResManager.ts # 统一资源加载
ui/UIBase.ts           # UI 面板基类
ui/UIManager.ts        # UI 打开关闭管理
scene/SceneBase.ts     # 场景脚本基类
scene/SceneManager.ts  # 场景切换管理
audio/AudioManager.ts  # 音频播放管理
data/StorageManager.ts # 本地存档管理
pool/PoolManager.ts    # 节点对象池
timer/TimerManager.ts  # 延迟和循环计时器
```

后续新增核心模块时，优先沿用这个目录分类方式。
