/** 头像背景色的 RGB 三元组。 */
export type Game2048AvatarColor = readonly [number, number, number];

/** 2048 可选择头像的稳定定义。 */
export interface Game2048AvatarDefinition {
    /** 写入存档的稳定头像编号。 */
    id: string;

    /** 图形头像中央显示的符号。 */
    symbol: string;

    /** 选择列表中的可读名称。 */
    displayName: string;

    /** 冷色头像背景色。 */
    color: Game2048AvatarColor;
}

/** 当前内置冷色头像目录；新增项不得修改已有编号。 */
export const GAME2048_AVATAR_CATALOG: readonly Game2048AvatarDefinition[] = [
    { id: "frost-2", symbol: "2", displayName: "霜晶", color: [51, 171, 201] },
    { id: "wave-4", symbol: "4", displayName: "潮汐", color: [55, 132, 211] },
    { id: "sky-8", symbol: "8", displayName: "天青", color: [75, 103, 211] },
    { id: "violet-16", symbol: "16", displayName: "星雾", color: [112, 83, 205] },
    { id: "aurora-32", symbol: "32", displayName: "极光", color: [35, 181, 169] },
    { id: "night-64", symbol: "64", displayName: "深空", color: [50, 68, 120] },
] as const;

/** 默认头像编号。 */
export const DEFAULT_GAME2048_AVATAR_ID = GAME2048_AVATAR_CATALOG[0].id;

/** 按稳定编号取得头像；不存在时返回默认头像。 */
export function getGame2048Avatar(
    avatarId: string,
): Game2048AvatarDefinition {
    return (
        GAME2048_AVATAR_CATALOG.find((avatar) => avatar.id === avatarId) ??
        GAME2048_AVATAR_CATALOG[0]
    );
}

/** 判断指定编号是否属于正式头像目录。 */
export function isGame2048AvatarId(avatarId: string): boolean {
    return GAME2048_AVATAR_CATALOG.some((avatar) => avatar.id === avatarId);
}
