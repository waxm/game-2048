/**
 * 正式 Cocos 序列化资源校验清单。
 *
 * 纯框架分支只保留最小 Boot 场景。游戏分支新增 Scene 或 Prefab 时必须在这里登记，
 * 每项脚本配置需要关联源码、ccclass、宿主节点和 Inspector 必填绑定。
 */
export const cocosAssetManifest = [
  {
    kind: "scene",
    assetPath: "assets/scene/Boot.scene",
    scripts: [
      {
        className: "BootScene",
        sourcePath: "assets/app/scenes/BootScene.ts",
        hostNodeName: "Canvas",
      },
    ],
    checks: ["noCanvasAudio"],
  },
];
