/**
 * 2048 竞技场二维坐标。
 *
 * 领域层使用普通数字对象，避免玩法规则依赖 Cocos 节点或 Vec2。
 */
export interface Game2048Point {
    /** 水平坐标。 */
    x: number;

    /** 垂直坐标。 */
    y: number;
}

/** 2048 竞技场当前运行状态。 */
export enum Game2048RunState {
    /** 世界正在初始化。 */
    Initializing = "initializing",

    /** 正常进行游戏。 */
    Playing = "playing",

    /** 玩家已被吞噬。 */
    GameOver = "game-over",
}

/** 竞技场角色类型。 */
export enum Game2048ActorKind {
    /** 本地玩家。 */
    Player = "player",

    /** 本地 AI 敌人。 */
    Bot = "bot",
}

/** 玩法特效类型。 */
export enum Game2048EffectKind {
    /** 吃到地图数字。 */
    Collect = "collect",

    /** 相同数字完成合并。 */
    Merge = "merge",

    /** 一个角色吞噬另一个角色。 */
    Defeat = "defeat",

    /** 角色擦碰圆形边界。 */
    Boundary = "boundary",
}

/** 地图中可直接收集的数字道具。 */
export interface Game2048PropSnapshot {
    /** 道具唯一编号。 */
    id: number;

    /** 道具的 2048 数字。 */
    value: number;

    /** 道具世界坐标。 */
    position: Game2048Point;

    /** 用于呼吸动画的随机相位。 */
    phase: number;
}

/** 角色的一帧只读显示数据。 */
export interface Game2048ActorSnapshot {
    /** 角色唯一编号。 */
    id: string;

    /** 角色显示名。 */
    name: string;

    /** 玩家或 AI 类型。 */
    kind: Game2048ActorKind;

    /** 当前是否仍在场上。 */
    active: boolean;

    /** 角色移动方向。 */
    direction: Game2048Point;

    /** 从队首到队尾排序后的数字。 */
    segments: number[];

    /** 每个数字块对应的世界坐标。 */
    segmentPositions: Game2048Point[];

    /** 收集与吞噬累计得到的分数。 */
    score: number;

    /** 触边压缩动画剩余强度。 */
    boundaryEffect: number;
}

/** 一次短暂的程序化玩法反馈。 */
export interface Game2048EffectSnapshot {
    /** 特效唯一编号。 */
    id: number;

    /** 特效种类。 */
    kind: Game2048EffectKind;

    /** 特效发生位置。 */
    position: Game2048Point;

    /** 特效颜色对应的 2048 数字。 */
    value: number;

    /** 当前已经播放的秒数。 */
    age: number;

    /** 特效总持续时间。 */
    duration: number;
}

/** 排行榜中的一条角色数据。 */
export interface Game2048RankEntry {
    /** 角色唯一编号。 */
    id: string;

    /** 角色显示名。 */
    name: string;

    /** 当前队首数字。 */
    headValue: number;

    /** 当前全部数字的总和。 */
    totalValue: number;

    /** 是否为本地玩家。 */
    isPlayer: boolean;
}

/** 渲染器消费的完整世界快照。 */
export interface Game2048WorldSnapshot {
    /** 当前玩法状态。 */
    state: Game2048RunState;

    /** 已运行的世界时间。 */
    elapsed: number;

    /** 圆形竞技场半径。 */
    arenaRadius: number;

    /** 数字块基础边长。 */
    tileSize: number;

    /** 本地玩家唯一编号。 */
    playerId: string;

    /** 本地玩家最后有效坐标，用作镜头中心。 */
    cameraPosition: Game2048Point;

    /** 玩家出生保护剩余秒数。 */
    playerProtectionRemaining: number;

    /** 场上全部数字道具。 */
    props: Game2048PropSnapshot[];

    /** 包含已失败玩家在内的角色显示数据。 */
    actors: Game2048ActorSnapshot[];

    /** 当前尚未播放结束的玩法特效。 */
    effects: Game2048EffectSnapshot[];

    /** 按总数字从高到低排列的排行榜。 */
    ranking: Game2048RankEntry[];
}

/** 2048 圆形竞技场可调参数。 */
export interface Game2048Config {
    /** 圆形地图半径。 */
    arenaRadius: number;

    /** 角色数字块边长。 */
    tileSize: number;

    /** 地图数字道具边长。 */
    propSize: number;

    /** 地图期望维持的道具数量。 */
    propTargetCount: number;

    /** 场上 AI 数量。 */
    botCount: number;

    /** 玩家每秒移动距离。 */
    playerSpeed: number;

    /** AI 基础每秒移动距离。 */
    botSpeed: number;

    /** 角色朝向插值速度。 */
    turnSpeed: number;

    /** 数字段中心之间的跟随距离。 */
    trailSpacing: number;

    /** 角色中心与边界保持的安全距离。 */
    boundaryInset: number;

    /** AI 被吞噬后的重生延迟。 */
    botRespawnDelay: number;

    /** 每局开始时玩家不会参与角色碰撞的保护秒数。 */
    playerSpawnProtectionDuration: number;

    /** 缺少道具时的生成间隔。 */
    propSpawnInterval: number;

    /** 单帧允许推进的最大时间，避免切回前台后穿透。 */
    maximumDeltaTime: number;
}

/** Demo 默认玩法参数。 */
export const DEFAULT_GAME2048_CONFIG: Readonly<Game2048Config> = {
    arenaRadius: 1040,
    tileSize: 48,
    propSize: 30,
    propTargetCount: 56,
    botCount: 6,
    playerSpeed: 182,
    botSpeed: 132,
    turnSpeed: 5.8,
    trailSpacing: 42,
    boundaryInset: 27,
    botRespawnDelay: 2.4,
    playerSpawnProtectionDuration: 4,
    propSpawnInterval: 0.16,
    maximumDeltaTime: 0.05,
};
