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
        objectBindings: {
          view: {
            type: "d115dmtPNlHdoWH+IFb6mIr",
            nodeName: "BootView",
          },
          retryButton: {
            type: "cc.Button",
            nodeName: "BootRetryButton",
          },
        },
      },
      {
        className: "BootSceneView",
        sourcePath: "assets/app/ui/common/BootSceneView.ts",
        hostNodeName: "BootView",
        objectBindings: {
          backgroundGraphics: {
            type: "cc.Graphics",
            nodeName: "BootBackgroundGraphics",
          },
          progressGraphics: {
            type: "cc.Graphics",
            nodeName: "BootProgressGraphics",
          },
          statusLabel: {
            type: "cc.Label",
            nodeName: "BootStatusLabel",
          },
          percentLabel: {
            type: "cc.Label",
            nodeName: "BootPercentLabel",
          },
          retryNode: {
            type: "cc.Node",
            nodeName: "BootRetryButton",
          },
        },
      },
    ],
    checks: ["noCanvasAudio"],
  },
  {
    kind: "scene",
    assetPath: "assets/scene/Lobby.scene",
    scripts: [
      {
        className: "LobbySceneController",
        sourcePath: "assets/app/scenes/LobbySceneController.ts",
        hostNodeName: "Canvas",
        objectBindings: {
          view: {
            type: "269b7u0CiVPwZLMOQuts54P",
            nodeName: "LobbyView",
          },
          startButton: {
            type: "cc.Button",
            nodeName: "StartGameButton",
          },
        },
      },
      {
        className: "LobbySceneView",
        sourcePath: "assets/app/ui/home/LobbySceneView.ts",
        hostNodeName: "LobbyView",
        objectBindings: {
          backgroundGraphics: {
            type: "cc.Graphics",
            nodeName: "LobbyBackgroundGraphics",
          },
          statusLabel: {
            type: "cc.Label",
            nodeName: "LobbyStatusLabel",
          },
          startLabel: {
            type: "cc.Label",
            nodeName: "StartGameButtonLabel",
          },
        },
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
          backButton: {
            type: "cc.Button",
            nodeName: "BackToLobbyButton",
          },
          gameOverLobbyButton: {
            type: "cc.Button",
            nodeName: "GameOverLobbyButton",
          },
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
