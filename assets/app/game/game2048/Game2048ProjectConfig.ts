import type { AppInitOptions } from "../../core/app/App";

/** 2048 竞技场独立的框架初始化配置。 */
export const GAME2048_APP_INIT_OPTIONS: Readonly<AppInitOptions> = {
    /** 当前游戏独立存档命名空间。 */
    storagePrefix: "game-2048",

    /** 当前游戏独立日志前缀。 */
    logPrefix: "[2048 竞技场]",
};
