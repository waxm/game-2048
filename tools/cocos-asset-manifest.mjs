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
          settingsButton: {
            type: "cc.Button",
            nodeName: "LobbySettingsButton",
          },
          profileButton: {
            type: "cc.Button",
            nodeName: "LobbyProfileButton",
          },
          uiRoot: {
            type: "cc.Node",
            nodeName: "LobbyUIRoot",
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
          playerNameLabel: {
            type: "cc.Label",
            nodeName: "LobbyPlayerNameLabel",
          },
          playerAvatarRenderer: {
            type: "5c26amnpY5Ky7pJ4JITde/K",
            nodeName: "LobbyProfileAvatar",
          },
        },
      },
      {
        className: "Game2048AvatarRenderer",
        sourcePath: "assets/app/ui/home/Game2048AvatarRenderer.ts",
        hostNodeName: "LobbyProfileAvatar",
        objectBindings: {
          graphics: {
            type: "cc.Graphics",
            nodeName: "LobbyProfileAvatar",
          },
          symbolLabel: {
            type: "cc.Label",
            nodeName: "LobbyProfileAvatarSymbolLabel",
          },
        },
      },
    ],
    checks: ["noCanvasAudio"],
  },
  {
    kind: "prefab",
    assetPath:
      "assets/resources/prefabs/home/Game2048SettingsPanel.prefab",
    scripts: [
      {
        className: "Game2048SettingsPanel",
        sourcePath: "assets/app/ui/home/Game2048SettingsPanel.ts",
        hostNodeName: "Game2048SettingsPanel",
        objectBindings: {
          panelGraphics: {
            type: "cc.Graphics",
            nodeName: "Game2048SettingsPanel",
          },
          soundButton: {
            type: "cc.Button",
            nodeName: "SoundToggleButton",
          },
          vibrationButton: {
            type: "cc.Button",
            nodeName: "VibrationToggleButton",
          },
          closeButton: {
            type: "cc.Button",
            nodeName: "SettingsCloseButton",
          },
          backdropButton: {
            type: "cc.Button",
            nodeName: "SettingsBackdropButton",
          },
          soundStateLabel: {
            type: "cc.Label",
            nodeName: "SoundStateLabel",
          },
          vibrationStateLabel: {
            type: "cc.Label",
            nodeName: "VibrationStateLabel",
          },
        },
      },
    ],
  },
  {
    kind: "prefab",
    assetPath:
      "assets/resources/prefabs/home/Game2048ProfilePanel.prefab",
    scripts: [
      {
        className: "Game2048ProfilePanel",
        sourcePath: "assets/app/ui/home/Game2048ProfilePanel.ts",
        hostNodeName: "Game2048ProfilePanel",
        objectBindings: {
          overlayGraphics: {
            type: "cc.Graphics",
            nodeName: "Game2048ProfilePanel",
          },
          panelGraphics: {
            type: "cc.Graphics",
            nodeName: "ProfilePanel",
          },
          closeButton: {
            type: "cc.Button",
            nodeName: "ProfileCloseButton",
          },
          closeButtonGraphics: {
            type: "cc.Graphics",
            nodeName: "ProfileCloseButton",
          },
          currentAvatarRenderer: {
            type: "5c26amnpY5Ky7pJ4JITde/K",
            nodeName: "CurrentAvatar",
          },
          currentNameLabel: {
            type: "cc.Label",
            nodeName: "CurrentPlayerNameLabel",
          },
          nameEditBox: {
            type: "cc.EditBox",
            nodeName: "ProfileNameEditBox",
          },
          nameInputDisplayLabel: {
            type: "cc.Label",
            nodeName: "ProfileNameDisplayLabel",
          },
          nameInputGraphics: {
            type: "cc.Graphics",
            nodeName: "ProfileNameEditBoxBackground",
          },
          saveNameButton: {
            type: "cc.Button",
            nodeName: "ProfileSaveNameButton",
          },
          saveNameGraphics: {
            type: "cc.Graphics",
            nodeName: "ProfileSaveNameButton",
          },
          avatarListContent: {
            type: "cc.Node",
            nodeName: "AvatarListContent",
          },
          feedbackLabel: {
            type: "cc.Label",
            nodeName: "ProfileFeedbackLabel",
          },
        },
      },
      {
        className: "Game2048AvatarRenderer",
        sourcePath: "assets/app/ui/home/Game2048AvatarRenderer.ts",
        hostNodeName: "CurrentAvatar",
        objectBindings: {
          graphics: {
            type: "cc.Graphics",
            nodeName: "CurrentAvatar",
          },
          symbolLabel: {
            type: "cc.Label",
            nodeName: "CurrentAvatarSymbolLabel",
          },
        },
      },
    ],
  },
  {
    kind: "prefab",
    assetPath:
      "assets/resources/prefabs/home/Game2048AvatarItem.prefab",
    scripts: [
      {
        className: "Game2048AvatarItem",
        sourcePath: "assets/app/ui/home/Game2048AvatarItem.ts",
        hostNodeName: "Game2048AvatarItem",
        objectBindings: {
          selectButton: {
            type: "cc.Button",
            nodeName: "Game2048AvatarItem",
          },
          avatarRenderer: {
            type: "5c26amnpY5Ky7pJ4JITde/K",
            nodeName: "Avatar",
          },
          nameLabel: {
            type: "cc.Label",
            nodeName: "AvatarNameLabel",
          },
          selectedLabel: {
            type: "cc.Label",
            nodeName: "AvatarSelectedLabel",
          },
        },
      },
      {
        className: "Game2048AvatarRenderer",
        sourcePath: "assets/app/ui/home/Game2048AvatarRenderer.ts",
        hostNodeName: "Avatar",
        objectBindings: {
          graphics: {
            type: "cc.Graphics",
            nodeName: "Avatar",
          },
          symbolLabel: {
            type: "cc.Label",
            nodeName: "AvatarSymbolLabel",
          },
        },
      },
    ],
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
