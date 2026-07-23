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
  {
    kind: "scene",
    assetPath: "assets/scene/Game2048.scene",
    scripts: [
      {
        className: "Game2048SceneController",
        sourcePath: "assets/app/scenes/Game2048SceneController.ts",
        hostNodeName: "Canvas",
        objectBindings: {
          renderer: {
            type: "5ffefxOgIJLNZ28nq71g3Rw",
            nodeName: "GameView",
          },
          inputSurface: { type: "cc.Node", nodeName: "Canvas" },
          gameOverPanel: { type: "cc.Node", nodeName: "GameOverPanel" },
          restartButton: { type: "cc.Button", nodeName: "RestartButton" },
        },
      },
      {
        className: "Game2048Renderer",
        sourcePath: "assets/app/ui/game/Game2048Renderer.ts",
        hostNodeName: "GameView",
        objectBindings: {
          arenaGraphics: {
            type: "cc.Graphics",
            nodeName: "ArenaGraphics",
          },
          entityGraphics: {
            type: "cc.Graphics",
            nodeName: "EntityGraphics",
          },
          effectGraphics: {
            type: "cc.Graphics",
            nodeName: "EffectGraphics",
          },
          overlayGraphics: {
            type: "cc.Graphics",
            nodeName: "GameOverPanel",
          },
          scoreLabel: { type: "cc.Label", nodeName: "ScoreLabel" },
          rankLabel: { type: "cc.Label", nodeName: "RankLabel" },
          hintLabel: { type: "cc.Label", nodeName: "HintLabel" },
          finalResultLabel: {
            type: "cc.Label",
            nodeName: "FinalResultLabel",
          },
        },
      },
    ],
    checks: ["noCanvasAudio"],
  },
];
