/** 2048 大厅业务 UI 的注册名称。 */
export const GAME2048_HOME_UI_NAME = {
    /** 冷色设置弹窗。 */
    Settings: "game2048.home.settings",

    /** 玩家头像与名称编辑弹窗。 */
    Profile: "game2048.home.profile",
} as const;

/** 2048 大厅业务 UI 的 resources 加载配置。 */
export const GAME2048_HOME_UI_CONFIG = {
    /** 设置弹窗 Prefab 配置。 */
    Settings: {
        name: GAME2048_HOME_UI_NAME.Settings,
        path: "prefabs/home/Game2048SettingsPanel",
        cache: true,
    },

    /** 玩家资料弹窗 Prefab 配置。 */
    Profile: {
        name: GAME2048_HOME_UI_NAME.Profile,
        path: "prefabs/home/Game2048ProfilePanel",
        cache: true,
    },
} as const;

/** 2048 大厅版本化业务存档键。 */
export const GAME2048_HOME_STORAGE_KEY = {
    /** 玩家名称与头像资料。 */
    Profile: "game2048.profile",

    /** 声音与震动设置。 */
    Settings: "game2048.settings",
} as const;

/** 2048 大厅使用的具名对象池。 */
export const GAME2048_HOME_POOL_NAME = {
    /** 资料页头像选择项。 */
    AvatarItem: "game2048.avatar-item",
} as const;

/** 2048 大厅通过资源管理器加载的稳定路径。 */
export const GAME2048_HOME_RESOURCE_PATH = {
    /** 头像列表项 Prefab。 */
    AvatarItemPrefab: "prefabs/home/Game2048AvatarItem",
} as const;

/** 2048 大厅模块使用的具名事件。 */
export const GAME2048_HOME_EVENT = {
    /** 玩家资料发生持久化变更。 */
    ProfileChanged: "game2048.home.profile-changed",

    /** 声音或震动设置发生持久化变更。 */
    SettingsChanged: "game2048.home.settings-changed",
} as const;
