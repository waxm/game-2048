import {
    DEFAULT_GAME2048_CONFIG,
    Game2048ActorKind,
    Game2048ActorSnapshot,
    Game2048Config,
    Game2048EffectKind,
    Game2048EffectSnapshot,
    Game2048Point,
    Game2048PropSnapshot,
    Game2048RankEntry,
    Game2048RunState,
    Game2048WorldSnapshot,
} from "./Game2048Model";

/** 领域层内部维护的数字道具。 */
interface MutableProp {
    /** 道具唯一编号。 */
    id: number;

    /** 道具数值。 */
    value: number;

    /** 道具世界坐标。 */
    position: Game2048Point;

    /** 呼吸动画相位。 */
    phase: number;
}

/** 领域层内部维护的角色。 */
interface MutableActor {
    /** 角色唯一编号。 */
    id: string;

    /** 角色显示名。 */
    name: string;

    /** 角色类型。 */
    kind: Game2048ActorKind;

    /** 当前是否参与移动和碰撞。 */
    active: boolean;

    /** 队首世界坐标。 */
    position: Game2048Point;

    /** 当前移动方向。 */
    direction: Game2048Point;

    /** 希望转向的方向。 */
    targetDirection: Game2048Point;

    /** 从大到小排列的数字队列。 */
    segments: number[];

    /** 记录队首历史位置的轨迹。 */
    trail: Game2048Point[];

    /** 最近一次按固定间隔写入轨迹的空间锚点。 */
    trailAnchor: Game2048Point;

    /** 每个队尾数字独立维护的弹性跟随状态。 */
    tailFollowers: MutableTailFollower[];

    /** 累计分数。 */
    score: number;

    /** 相对 AI 基础速度的倍率。 */
    speedScale: number;

    /** AI 下次重新决策前的剩余时间。 */
    aiThinkTimer: number;

    /** AI 被吞噬后的重生倒计时。 */
    respawnTimer: number;

    /** 触边动画强度。 */
    boundaryEffect: number;
}

/** 单个队尾数字沿历史轨迹追随时的运行状态。 */
interface MutableTailFollower {
    /** 当前世界坐标。 */
    position: Game2048Point;

    /** 平滑阻尼使用的当前速度。 */
    velocity: Game2048Point;

    /** 当前在队首历史轨迹上展开到的距离。 */
    pathDistance: number;
}

/** 领域层内部维护的短暂特效。 */
interface MutableEffect {
    /** 特效唯一编号。 */
    id: number;

    /** 特效种类。 */
    kind: Game2048EffectKind;

    /** 特效世界坐标。 */
    position: Game2048Point;

    /** 特效关联数字。 */
    value: number;

    /** 已播放时间。 */
    age: number;

    /** 总持续时间。 */
    duration: number;
}

/**
 * 把一组 2048 数字排序并执行连续合并。
 *
 * 先从小到大压栈可以自然处理连锁进位，例如 2、2、4 会连续合并成 8，
 * 最后反转为角色使用的从大到小队列。
 */
export function merge2048Values(values: readonly number[]): number[] {
    const sortedValues = values
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.max(2, Math.floor(value)))
        .sort((left, right) => left - right);
    const stack: number[] = [];

    for (const value of sortedValues) {
        stack.push(value);
        while (
            stack.length >= 2 &&
            stack[stack.length - 1] === stack[stack.length - 2]
        ) {
            const mergedValue = (stack.pop() ?? 0) * 2;
            stack.pop();
            stack.push(mergedValue);
        }
    }

    return stack.reverse();
}

/** 返回数字队列的总值，用于计分和排名。 */
export function sum2048Values(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

/** 比较两个角色队首数字，正数代表左侧更强。 */
export function compare2048Heads(
    leftSegments: readonly number[],
    rightSegments: readonly number[],
): number {
    return (leftSegments[0] ?? 0) - (rightSegments[0] ?? 0);
}

/**
 * 2048 圆形竞技场领域对象。
 *
 * 本类不持有任何 Cocos 节点，便于在命令行验证合并、碰撞、AI 和边界规则。
 */
export class Game2048World {
    /** 当前实际使用的玩法参数。 */
    public readonly config: Readonly<Game2048Config>;

    /** 当前玩法状态。 */
    private _state = Game2048RunState.Initializing;

    /** 世界累计运行时间。 */
    private _elapsed = 0;

    /** 可重复伪随机数状态。 */
    private _randomState = 1;

    /** 下一个数字道具编号。 */
    private _nextPropId = 1;

    /** 下一个特效编号。 */
    private _nextEffectId = 1;

    /** 缺少道具时的累计生成时间。 */
    private _propSpawnAccumulator = 0;

    /** 当前全部角色。 */
    private readonly _actors: MutableActor[] = [];

    /** 当前全部地图数字道具。 */
    private readonly _props: MutableProp[] = [];

    /** 当前尚未结束的短暂特效。 */
    private readonly _effects: MutableEffect[] = [];

    /** 玩家最后有效坐标，失败后仍用于保持镜头位置。 */
    private _cameraPosition: Game2048Point = { x: 0, y: 0 };

    /** 玩家每局开始时的角色碰撞保护剩余秒数。 */
    private _playerProtectionRemaining = 0;

    /**
     * 创建一个玩法世界。
     *
     * 只覆盖调用方传入的参数，其他参数继续使用 Demo 默认值。
     */
    public constructor(config: Partial<Game2048Config> = {}) {
        this.config = {
            ...DEFAULT_GAME2048_CONFIG,
            ...config,
        };
    }

    /** 返回当前玩法状态。 */
    public get state(): Game2048RunState {
        return this._state;
    }

    /** 返回当前玩家队首数字。 */
    public get playerHeadValue(): number {
        return this.playerActor?.segments[0] ?? 0;
    }

    /**
     * 使用指定种子重建完整世界。
     *
     * 相同种子会得到相同的出生点、AI 速度和初始道具，方便复现问题。
     */
    public reset(seed = 2048): void {
        this._state = Game2048RunState.Initializing;
        this._elapsed = 0;
        this._randomState = Math.max(1, seed >>> 0);
        this._nextPropId = 1;
        this._nextEffectId = 1;
        this._propSpawnAccumulator = 0;
        this._actors.length = 0;
        this._props.length = 0;
        this._effects.length = 0;
        this._cameraPosition = { x: 0, y: 0 };
        this._playerProtectionRemaining =
            this.config.playerSpawnProtectionDuration;

        const playerSpawnPosition = { x: 0, y: -120 };
        this._actors.push(
            this.createActor(
                "player",
                "YOU",
                Game2048ActorKind.Player,
                playerSpawnPosition,
                { x: 0, y: 1 },
            ),
        );

        const botNames = ["橘子", "闪电", "小蓝", "方糖", "阿圆", "星星", "火箭", "积木"];
        for (let index = 0; index < this.config.botCount; index += 1) {
            const position = this.randomPointAwayFrom(
                playerSpawnPosition,
                this.config.arenaRadius * 0.62,
                0.5,
                0.84,
            );
            const direction = normalizePoint({
                x: -position.y + this.randomRange(-0.35, 0.35),
                y: position.x + this.randomRange(-0.35, 0.35),
            });
            const actor = this.createActor(
                `bot-${index + 1}`,
                botNames[index % botNames.length],
                Game2048ActorKind.Bot,
                position,
                direction,
            );
            actor.speedScale = this.randomRange(0.92, 1.16);
            this._actors.push(actor);
        }

        while (this._props.length < this.config.propTargetCount) {
            this.spawnProp();
        }

        this._state = Game2048RunState.Playing;
    }

    /** 更新玩家期望方向，零向量会被忽略。 */
    public setPlayerDirection(direction: Game2048Point): void {
        if (this._state !== Game2048RunState.Playing) {
            return;
        }
        const normalizedDirection = normalizePoint(direction);
        if (pointLengthSquared(normalizedDirection) <= 0.0001) {
            return;
        }
        const player = this.playerActor;
        if (player?.active) {
            player.targetDirection = normalizedDirection;
        }
    }

    /**
     * 推进一帧玩法状态。
     *
     * 大时间步会被切成多个短步，避免后台切回或调试暂停后角色穿透道具与边界。
     */
    public update(deltaTime: number): void {
        if (this._state !== Game2048RunState.Playing || deltaTime <= 0) {
            this.updateEffects(Math.max(0, deltaTime));
            return;
        }

        let remainingTime = Math.min(deltaTime, 0.25);
        while (remainingTime > 0) {
            const step = Math.min(remainingTime, this.config.maximumDeltaTime);
            this.updateStep(step);
            remainingTime -= step;
            if (this._state !== Game2048RunState.Playing) {
                break;
            }
        }
    }

    /** 返回与 Cocos 节点解耦的一帧深拷贝快照。 */
    public getSnapshot(): Game2048WorldSnapshot {
        const actors = this._actors.map((actor) => this.createActorSnapshot(actor));
        const ranking = this.createRanking();
        return {
            state: this._state,
            elapsed: this._elapsed,
            arenaRadius: this.config.arenaRadius,
            tileSize: this.config.tileSize,
            playerId: "player",
            cameraPosition: clonePoint(this._cameraPosition),
            playerProtectionRemaining: this._playerProtectionRemaining,
            props: this._props.map((prop): Game2048PropSnapshot => ({
                id: prop.id,
                value: prop.value,
                position: clonePoint(prop.position),
                phase: prop.phase,
            })),
            actors,
            effects: this._effects.map((effect): Game2048EffectSnapshot => ({
                id: effect.id,
                kind: effect.kind,
                position: clonePoint(effect.position),
                value: effect.value,
                age: effect.age,
                duration: effect.duration,
            })),
            ranking,
        };
    }

    /** 返回本地玩家的可变领域对象。 */
    private get playerActor(): MutableActor | undefined {
        return this._actors[0];
    }

    /** 推进一个不会超过最大时间步的稳定子帧。 */
    private updateStep(deltaTime: number): void {
        this._elapsed += deltaTime;
        this._playerProtectionRemaining = Math.max(
            0,
            this._playerProtectionRemaining - deltaTime,
        );
        this.updateEffects(deltaTime);
        this.updateBotRespawns(deltaTime);
        this.updateBotDirections(deltaTime);

        for (const actor of this._actors) {
            if (!actor.active) {
                continue;
            }
            this.moveActor(actor, deltaTime);
        }

        this.resolvePropCollections();
        this.resolveActorCollisions();
        this.updatePropPopulation(deltaTime);

        const player = this.playerActor;
        if (player?.active) {
            this._cameraPosition = clonePoint(player.position);
        }
    }

    /** 创建带有单个数字 2 的角色。 */
    private createActor(
        id: string,
        name: string,
        kind: Game2048ActorKind,
        position: Game2048Point,
        direction: Game2048Point,
    ): MutableActor {
        const normalizedDirection = normalizePoint(direction);
        return {
            id,
            name,
            kind,
            active: true,
            position: clonePoint(position),
            direction: normalizedDirection,
            targetDirection: normalizedDirection,
            segments: [2],
            trail: this.createInitialTrail(position, normalizedDirection),
            trailAnchor: clonePoint(position),
            tailFollowers: [],
            score: 0,
            speedScale: 1,
            aiThinkTimer: this.randomRange(0.08, 0.26),
            respawnTimer: 0,
            boundaryEffect: 0,
        };
    }

    /** 在角色身后建立足够长的初始轨迹，为首次吞噬预留自然展开空间。 */
    private createInitialTrail(
        position: Game2048Point,
        direction: Game2048Point,
    ): Game2048Point[] {
        const trail: Game2048Point[] = [];
        const initialTrailLength = this.config.trailSpacing * 12 + 160;
        const sampleSpacing = Math.max(1, this.config.trailSampleSpacing);
        const sampleCount = Math.ceil(initialTrailLength / sampleSpacing);
        for (let index = 0; index <= sampleCount; index += 1) {
            trail.push({
                x: position.x - direction.x * index * sampleSpacing,
                y: position.y - direction.y * index * sampleSpacing,
            });
        }
        return trail;
    }

    /** 移动单个角色并处理圆形边界回推。 */
    private moveActor(actor: MutableActor, deltaTime: number): void {
        const turnRatio = 1 - Math.exp(-this.config.turnSpeed * deltaTime);
        actor.direction = normalizePoint({
            x: lerp(actor.direction.x, actor.targetDirection.x, turnRatio),
            y: lerp(actor.direction.y, actor.targetDirection.y, turnRatio),
        });

        const baseSpeed =
            actor.kind === Game2048ActorKind.Player
                ? this.config.playerSpeed
                : this.config.botSpeed * actor.speedScale;
        actor.position.x += actor.direction.x * baseSpeed * deltaTime;
        actor.position.y += actor.direction.y * baseSpeed * deltaTime;
        actor.boundaryEffect = Math.max(0, actor.boundaryEffect - deltaTime * 2.4);

        const allowedRadius =
            this.config.arenaRadius - this.config.boundaryInset;
        const distanceFromCenter = pointLength(actor.position);
        if (distanceFromCenter > allowedRadius) {
            const outward = scalePoint(
                actor.position,
                1 / Math.max(distanceFromCenter, 0.0001),
            );
            actor.position = scalePoint(outward, allowedRadius);

            // 反射方向后再加入更强的向心分量，让角色沿边滑动并逐渐回到地图内部。
            const normalVelocity = dotPoint(actor.direction, outward);
            const reflected = {
                x: actor.direction.x - outward.x * Math.max(0, normalVelocity) * 1.7,
                y: actor.direction.y - outward.y * Math.max(0, normalVelocity) * 1.7,
            };
            const inward = scalePoint(outward, -1);
            actor.direction = normalizePoint(addPoint(reflected, scalePoint(inward, 0.58)));
            actor.targetDirection = normalizePoint(
                addPoint(actor.targetDirection, scalePoint(inward, 1.25)),
            );
            if (actor.boundaryEffect <= 0.3) {
                this.pushEffect(
                    Game2048EffectKind.Boundary,
                    actor.position,
                    actor.segments[0] ?? 2,
                    0.45,
                );
            }
            actor.boundaryEffect = 1;
        }

        this.recordTrail(actor);
        this.syncTailFollowers(actor, actor.position);
        this.updateTailFollowers(actor, deltaTime);
    }

    /** 按固定空间间隔记录队首轨迹并裁剪不再使用的尾部。 */
    private recordTrail(actor: MutableActor): void {
        const sampleSpacing = Math.max(1, this.config.trailSampleSpacing);
        const movedFromAnchor = distanceBetween(
            actor.trailAnchor,
            actor.position,
        );
        const previousHistory = actor.trail.slice(1);
        if (
            !previousHistory[0] ||
            distanceBetween(previousHistory[0], actor.trailAnchor) >
                sampleSpacing * 0.1
        ) {
            previousHistory.unshift(clonePoint(actor.trailAnchor));
        }

        const insertedSamples: Game2048Point[] = [];
        if (movedFromAnchor >= sampleSpacing) {
            const movementDirection = normalizePoint(
                subtractPoint(actor.position, actor.trailAnchor),
            );
            for (
                let sampleDistance = sampleSpacing;
                sampleDistance <= movedFromAnchor;
                sampleDistance += sampleSpacing
            ) {
                insertedSamples.push(
                    addPoint(
                        actor.trailAnchor,
                        scalePoint(movementDirection, sampleDistance),
                    ),
                );
            }
            actor.trailAnchor = clonePoint(
                insertedSamples[insertedSamples.length - 1],
            );
        }
        actor.trail = [
            clonePoint(actor.position),
            ...insertedSamples.reverse(),
            ...previousHistory,
        ];

        // 多保留十二节潜在尾巴的历史，连续吞噬时新数字也能沿旧路线展开。
        const requiredLength =
            (Math.max(1, actor.segments.length) + 12) *
                this.config.trailSpacing +
            160;
        let accumulatedLength = 0;
        let keepCount = actor.trail.length;
        for (let index = 1; index < actor.trail.length; index += 1) {
            accumulatedLength += distanceBetween(
                actor.trail[index - 1],
                actor.trail[index],
            );
            if (accumulatedLength >= requiredLength) {
                keepCount = index + 1;
                break;
            }
        }
        if (actor.trail.length > keepCount) {
            actor.trail.length = keepCount;
        }
    }

    /**
     * 让尾部状态数量与数字队列保持一致。
     *
     * 新数字从实际碰撞位置进入，而不是瞬间出现在固定队尾槽位；
     * 连锁合并缩短队列时则从最末端回收多余状态。
     */
    private syncTailFollowers(
        actor: MutableActor,
        joinPosition: Game2048Point,
    ): void {
        const requiredFollowerCount = Math.max(0, actor.segments.length - 1);
        if (actor.tailFollowers.length > requiredFollowerCount) {
            actor.tailFollowers.length = requiredFollowerCount;
        }
        while (actor.tailFollowers.length < requiredFollowerCount) {
            actor.tailFollowers.push({
                position: clonePoint(joinPosition),
                velocity: { x: 0, y: 0 },
                pathDistance: 0,
            });
        }
    }

    /**
     * 以历史轨迹为目标推进每一节尾巴。
     *
     * pathDistance 负责把新数字从碰撞点逐渐展开到目标间距，平滑阻尼负责
     * 吸收折线路径的生硬拐角；越靠后的数字响应略慢，形成连续而非刚性的尾巴。
     */
    private updateTailFollowers(
        actor: MutableActor,
        deltaTime: number,
    ): void {
        const joinRatio =
            1 - Math.exp(-this.config.tailJoinSpeed * deltaTime);
        for (
            let followerIndex = 0;
            followerIndex < actor.tailFollowers.length;
            followerIndex += 1
        ) {
            const follower = actor.tailFollowers[followerIndex];
            const targetDistance =
                (followerIndex + 1) * this.config.trailSpacing;
            follower.pathDistance = lerp(
                follower.pathDistance,
                targetDistance,
                joinRatio,
            );
            if (
                targetDistance - follower.pathDistance <
                this.config.trailSampleSpacing * 0.2
            ) {
                follower.pathDistance = targetDistance;
            }

            const targetPosition = this.sampleTrail(
                actor.trail,
                follower.pathDistance,
            );
            const smoothTime =
                this.config.tailFollowSmoothTime *
                (1 + Math.min(followerIndex, 8) * 0.055);
            const nextState = smoothDampPoint(
                follower.position,
                targetPosition,
                follower.velocity,
                smoothTime,
                deltaTime,
            );
            follower.position = nextState.position;
            follower.velocity = nextState.velocity;
        }
    }

    /** AI 定期选择道具、追击弱者或避让强者。 */
    private updateBotDirections(deltaTime: number): void {
        const player = this.playerActor;
        for (const bot of this._actors) {
            if (bot.kind !== Game2048ActorKind.Bot || !bot.active) {
                continue;
            }
            bot.aiThinkTimer -= deltaTime;
            if (bot.aiThinkTimer > 0) {
                continue;
            }
            bot.aiThinkTimer = this.randomRange(0.16, 0.32);

            const botHead = bot.segments[0] ?? 2;
            let desiredTarget: Game2048Point | null = null;
            if (
                player?.active &&
                this._playerProtectionRemaining <= 0
            ) {
                const playerDistance = distanceBetween(bot.position, player.position);
                const playerHead = player.segments[0] ?? 2;
                if (playerHead < botHead && playerDistance < 360) {
                    desiredTarget = player.position;
                } else if (playerHead > botHead && playerDistance < 330) {
                    const escapeDirection = normalizePoint(
                        subtractPoint(bot.position, player.position),
                    );
                    desiredTarget = addPoint(
                        bot.position,
                        scalePoint(escapeDirection, 420),
                    );
                }
            }

            if (!desiredTarget) {
                desiredTarget = this.findNearestPropPosition(bot.position);
            }
            if (!desiredTarget) {
                desiredTarget = rotatePoint(
                    bot.direction,
                    this.randomRange(-0.65, 0.65),
                );
            } else {
                desiredTarget = subtractPoint(desiredTarget, bot.position);
            }

            const edgeRatio =
                pointLength(bot.position) / Math.max(1, this.config.arenaRadius);
            if (edgeRatio > 0.78) {
                const inward = normalizePoint(scalePoint(bot.position, -1));
                desiredTarget = addPoint(
                    desiredTarget,
                    scalePoint(inward, 460 * (edgeRatio - 0.7)),
                );
            }
            bot.targetDirection = normalizePoint(desiredTarget);
        }
    }

    /** 返回离指定坐标最近的地图数字。 */
    private findNearestPropPosition(
        origin: Game2048Point,
    ): Game2048Point | null {
        let nearest: MutableProp | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const prop of this._props) {
            const distance = distanceBetweenSquared(origin, prop.position);
            if (distance < nearestDistance) {
                nearest = prop;
                nearestDistance = distance;
            }
        }
        return nearest ? clonePoint(nearest.position) : null;
    }

    /** 处理所有角色对地图数字的直接收集。 */
    private resolvePropCollections(): void {
        const pickupDistance =
            (this.config.tileSize + this.config.propSize) * 0.48;
        const pickupDistanceSquared = pickupDistance * pickupDistance;
        for (const actor of this._actors) {
            if (!actor.active) {
                continue;
            }
            for (let index = this._props.length - 1; index >= 0; index -= 1) {
                const prop = this._props[index];
                if (
                    distanceBetweenSquared(actor.position, prop.position) >
                    pickupDistanceSquared
                ) {
                    continue;
                }
                this._props.splice(index, 1);
                this.absorbValues(actor, [prop.value], prop.position);
                actor.score += prop.value;
                this.pushEffect(
                    Game2048EffectKind.Collect,
                    prop.position,
                    prop.value,
                    0.38,
                );
            }
        }
    }

    /** 检测角色队首与其他角色任一数字块的接触。 */
    private resolveActorCollisions(): void {
        const collisionDistance = this.config.tileSize * 0.76;
        const collisionDistanceSquared = collisionDistance * collisionDistance;
        for (let leftIndex = 0; leftIndex < this._actors.length; leftIndex += 1) {
            const left = this._actors[leftIndex];
            if (!left.active) {
                continue;
            }
            for (
                let rightIndex = leftIndex + 1;
                rightIndex < this._actors.length;
                rightIndex += 1
            ) {
                const right = this._actors[rightIndex];
                if (!right.active) {
                    continue;
                }
                if (
                    this._playerProtectionRemaining > 0 &&
                    (left.kind === Game2048ActorKind.Player ||
                        right.kind === Game2048ActorKind.Player)
                ) {
                    continue;
                }
                const leftPositions = this.getSegmentPositions(left);
                const rightPositions = this.getSegmentPositions(right);
                const leftTouchesRight = rightPositions.some(
                    (position) =>
                        distanceBetweenSquared(left.position, position) <=
                        collisionDistanceSquared,
                );
                const rightTouchesLeft = leftPositions.some(
                    (position) =>
                        distanceBetweenSquared(right.position, position) <=
                        collisionDistanceSquared,
                );
                if (!leftTouchesRight && !rightTouchesLeft) {
                    continue;
                }

                const [winner, loser] = this.chooseCollisionWinner(
                    left,
                    right,
                    leftTouchesRight,
                    rightTouchesLeft,
                );
                this.defeatActor(winner, loser);
                if (this._state !== Game2048RunState.Playing) {
                    return;
                }
            }
        }
    }

    /** 根据队首数字和同值归属规则选出碰撞胜方。 */
    private chooseCollisionWinner(
        left: MutableActor,
        right: MutableActor,
        leftTouchesRight: boolean,
        rightTouchesLeft: boolean,
    ): [MutableActor, MutableActor] {
        const headComparison = compare2048Heads(left.segments, right.segments);
        if (headComparison > 0) {
            return [left, right];
        }
        if (headComparison < 0) {
            return [right, left];
        }
        if (left.kind === Game2048ActorKind.Player) {
            return [left, right];
        }
        if (right.kind === Game2048ActorKind.Player) {
            return [right, left];
        }
        if (leftTouchesRight && !rightTouchesLeft) {
            return [left, right];
        }
        if (rightTouchesLeft && !leftTouchesRight) {
            return [right, left];
        }

        const leftClosingSpeed = dotPoint(
            left.direction,
            normalizePoint(subtractPoint(right.position, left.position)),
        );
        const rightClosingSpeed = dotPoint(
            right.direction,
            normalizePoint(subtractPoint(left.position, right.position)),
        );
        return leftClosingSpeed >= rightClosingSpeed
            ? [left, right]
            : [right, left];
    }

    /** 让胜方吸收败方全部数字，并处理玩家失败或 AI 重生。 */
    private defeatActor(winner: MutableActor, loser: MutableActor): void {
        if (!winner.active || !loser.active) {
            return;
        }
        const defeatedValue = sum2048Values(loser.segments);
        winner.score += defeatedValue;
        this.absorbValues(winner, loser.segments, loser.position);
        this.pushEffect(
            Game2048EffectKind.Defeat,
            loser.position,
            loser.segments[0] ?? 2,
            0.72,
        );

        loser.active = false;
        loser.respawnTimer = this.config.botRespawnDelay;
        if (loser.kind === Game2048ActorKind.Player) {
            this._state = Game2048RunState.GameOver;
            return;
        }
    }

    /** 把新数字加入角色队列，并在发生合并时生成反馈。 */
    private absorbValues(
        actor: MutableActor,
        values: readonly number[],
        effectPosition: Game2048Point,
    ): void {
        const beforeLength = actor.segments.length + values.length;
        const beforeHead = actor.segments[0] ?? 2;
        actor.segments = merge2048Values([...actor.segments, ...values]);
        this.syncTailFollowers(actor, effectPosition);
        if (
            actor.segments.length < beforeLength ||
            (actor.segments[0] ?? 2) > beforeHead
        ) {
            this.pushEffect(
                Game2048EffectKind.Merge,
                effectPosition,
                actor.segments[0] ?? beforeHead,
                0.56,
            );
        }
    }

    /** 推进 AI 重生计时并恢复单个数字 2。 */
    private updateBotRespawns(deltaTime: number): void {
        for (const actor of this._actors) {
            if (actor.kind !== Game2048ActorKind.Bot || actor.active) {
                continue;
            }
            actor.respawnTimer -= deltaTime;
            if (actor.respawnTimer > 0) {
                continue;
            }
            const player = this.playerActor;
            const spawnPosition = player?.active
                ? this.randomPointAwayFrom(
                      player.position,
                      this.config.arenaRadius * 0.46,
                      0.42,
                      0.82,
                  )
                : this.randomPointInArena(0.42, 0.82);
            const inward = normalizePoint(scalePoint(spawnPosition, -1));
            actor.active = true;
            actor.position = spawnPosition;
            actor.direction = rotatePoint(
                inward,
                this.randomRange(-0.8, 0.8),
            );
            actor.targetDirection = clonePoint(actor.direction);
            actor.segments = [2];
            actor.trail = this.createInitialTrail(
                actor.position,
                actor.direction,
            );
            actor.trailAnchor = clonePoint(actor.position);
            actor.tailFollowers.length = 0;
            actor.score = Math.floor(actor.score * 0.35);
            actor.boundaryEffect = 0;
            actor.aiThinkTimer = this.randomRange(0.05, 0.2);
        }
    }

    /** 按目标数量逐步补充地图数字，避免同一帧集中生成。 */
    private updatePropPopulation(deltaTime: number): void {
        if (this._props.length >= this.config.propTargetCount) {
            this._propSpawnAccumulator = 0;
            return;
        }
        this._propSpawnAccumulator += deltaTime;
        while (
            this._props.length < this.config.propTargetCount &&
            this._propSpawnAccumulator >= this.config.propSpawnInterval
        ) {
            this._propSpawnAccumulator -= this.config.propSpawnInterval;
            this.spawnProp();
        }
    }

    /** 在地图安全范围内生成一个带权重的 2、4 或 8。 */
    private spawnProp(): void {
        const roll = this.nextRandom();
        const value = roll < 0.72 ? 2 : roll < 0.94 ? 4 : 8;
        this._props.push({
            id: this._nextPropId++,
            value,
            position: this.randomPointInArena(0.08, 0.9),
            phase: this.randomRange(0, Math.PI * 2),
        });
    }

    /** 推进并删除已经播放结束的特效。 */
    private updateEffects(deltaTime: number): void {
        for (let index = this._effects.length - 1; index >= 0; index -= 1) {
            const effect = this._effects[index];
            effect.age += deltaTime;
            if (effect.age >= effect.duration) {
                this._effects.splice(index, 1);
            }
        }
    }

    /** 新增一个短暂的程序化特效。 */
    private pushEffect(
        kind: Game2048EffectKind,
        position: Game2048Point,
        value: number,
        duration: number,
    ): void {
        this._effects.push({
            id: this._nextEffectId++,
            kind,
            position: clonePoint(position),
            value,
            age: 0,
            duration,
        });
    }

    /** 把领域角色转换为不暴露内部状态的显示快照。 */
    private createActorSnapshot(actor: MutableActor): Game2048ActorSnapshot {
        return {
            id: actor.id,
            name: actor.name,
            kind: actor.kind,
            active: actor.active,
            direction: clonePoint(actor.direction),
            segments: [...actor.segments],
            segmentPositions: this.getSegmentPositions(actor),
            score: actor.score,
            boundaryEffect: actor.boundaryEffect,
        };
    }

    /** 返回队首和各个弹性尾块的当前世界坐标。 */
    private getSegmentPositions(actor: MutableActor): Game2048Point[] {
        return [
            clonePoint(actor.position),
            ...actor.tailFollowers.map((follower) =>
                clonePoint(follower.position),
            ),
        ];
    }

    /** 沿折线轨迹取出指定距离处的插值坐标。 */
    private sampleTrail(
        trail: readonly Game2048Point[],
        targetDistance: number,
    ): Game2048Point {
        if (trail.length === 0) {
            return { x: 0, y: 0 };
        }
        let accumulatedDistance = 0;
        for (let index = 1; index < trail.length; index += 1) {
            const previous = trail[index - 1];
            const current = trail[index];
            const segmentDistance = distanceBetween(previous, current);
            if (accumulatedDistance + segmentDistance >= targetDistance) {
                const ratio =
                    (targetDistance - accumulatedDistance) /
                    Math.max(segmentDistance, 0.0001);
                return {
                    x: lerp(previous.x, current.x, ratio),
                    y: lerp(previous.y, current.y, ratio),
                };
            }
            accumulatedDistance += segmentDistance;
        }
        return clonePoint(trail[trail.length - 1]);
    }

    /** 生成按全部数字总值排序的本地排行榜。 */
    private createRanking(): Game2048RankEntry[] {
        return this._actors
            .filter((actor) => actor.active || actor.kind === Game2048ActorKind.Player)
            .map((actor): Game2048RankEntry => ({
                id: actor.id,
                name: actor.name,
                headValue: actor.segments[0] ?? 0,
                totalValue: sum2048Values(actor.segments),
                isPlayer: actor.kind === Game2048ActorKind.Player,
            }))
            .sort((left, right) => {
                const valueDifference = right.totalValue - left.totalValue;
                if (valueDifference !== 0) {
                    return valueDifference;
                }
                return right.headValue - left.headValue;
            });
    }

    /** 返回圆形地图内指定半径比例之间的随机坐标。 */
    private randomPointInArena(
        minimumRadiusRatio: number,
        maximumRadiusRatio: number,
    ): Game2048Point {
        const angle = this.randomRange(0, Math.PI * 2);
        // 半径使用平方根分布，使道具在圆形面积内近似均匀。
        const minimumSquared = minimumRadiusRatio * minimumRadiusRatio;
        const maximumSquared = maximumRadiusRatio * maximumRadiusRatio;
        const radiusRatio = Math.sqrt(
            this.randomRange(minimumSquared, maximumSquared),
        );
        const radius = this.config.arenaRadius * radiusRatio;
        return {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
        };
    }

    /**
     * 在圆形地图内生成一个与指定角色保持安全距离的随机坐标。
     *
     * 通过有限次采样保持随机分布；极端情况下选用已采样的最远点，
     * 避免 AI 在玩家身边出生导致尚未获得操控机会就结束一局。
     */
    private randomPointAwayFrom(
        origin: Game2048Point,
        minimumDistance: number,
        minimumRadiusRatio: number,
        maximumRadiusRatio: number,
    ): Game2048Point {
        let farthestPoint = this.randomPointInArena(
            minimumRadiusRatio,
            maximumRadiusRatio,
        );
        let farthestDistanceSquared = distanceBetweenSquared(
            farthestPoint,
            origin,
        );
        const minimumDistanceSquared = minimumDistance * minimumDistance;

        for (let attempt = 0; attempt < 24; attempt += 1) {
            const candidate = this.randomPointInArena(
                minimumRadiusRatio,
                maximumRadiusRatio,
            );
            const candidateDistanceSquared = distanceBetweenSquared(
                candidate,
                origin,
            );
            if (candidateDistanceSquared >= minimumDistanceSquared) {
                return candidate;
            }
            if (candidateDistanceSquared > farthestDistanceSquared) {
                farthestPoint = candidate;
                farthestDistanceSquared = candidateDistanceSquared;
            }
        }

        return farthestPoint;
    }

    /** 返回包含起点、不包含终点的可重复随机数。 */
    private randomRange(minimum: number, maximum: number): number {
        return minimum + (maximum - minimum) * this.nextRandom();
    }

    /** 使用 Mulberry32 变体推进一次伪随机数状态。 */
    private nextRandom(): number {
        this._randomState = (this._randomState + 0x6d2b79f5) >>> 0;
        let value = this._randomState;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }
}

/** 返回坐标副本，防止快照和领域对象共享引用。 */
function clonePoint(point: Game2048Point): Game2048Point {
    return { x: point.x, y: point.y };
}

/** 返回两个坐标相加的结果。 */
function addPoint(left: Game2048Point, right: Game2048Point): Game2048Point {
    return { x: left.x + right.x, y: left.y + right.y };
}

/** 返回左侧坐标减去右侧坐标的结果。 */
function subtractPoint(
    left: Game2048Point,
    right: Game2048Point,
): Game2048Point {
    return { x: left.x - right.x, y: left.y - right.y };
}

/** 返回坐标乘以标量的结果。 */
function scalePoint(point: Game2048Point, scalar: number): Game2048Point {
    return { x: point.x * scalar, y: point.y * scalar };
}

/** 返回坐标向量长度。 */
function pointLength(point: Game2048Point): number {
    return Math.sqrt(pointLengthSquared(point));
}

/** 返回坐标向量长度的平方。 */
function pointLengthSquared(point: Game2048Point): number {
    return point.x * point.x + point.y * point.y;
}

/** 返回归一化向量，零向量会保持为零。 */
function normalizePoint(point: Game2048Point): Game2048Point {
    const length = pointLength(point);
    if (length <= 0.0001) {
        return { x: 0, y: 0 };
    }
    return { x: point.x / length, y: point.y / length };
}

/** 返回两个向量点积。 */
function dotPoint(left: Game2048Point, right: Game2048Point): number {
    return left.x * right.x + left.y * right.y;
}

/** 返回两个坐标之间的直线距离。 */
function distanceBetween(left: Game2048Point, right: Game2048Point): number {
    return Math.sqrt(distanceBetweenSquared(left, right));
}

/** 返回两个坐标之间距离的平方。 */
function distanceBetweenSquared(
    left: Game2048Point,
    right: Game2048Point,
): number {
    const deltaX = left.x - right.x;
    const deltaY = left.y - right.y;
    return deltaX * deltaX + deltaY * deltaY;
}

/** 围绕原点旋转一个方向向量。 */
function rotatePoint(point: Game2048Point, radians: number): Game2048Point {
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return {
        x: point.x * cosine - point.y * sine,
        y: point.x * sine + point.y * cosine,
    };
}

/** 对两个数字执行线性插值。 */
function lerp(start: number, end: number, ratio: number): number {
    return start + (end - start) * ratio;
}

/** 平滑阻尼计算结果。 */
interface SmoothDampPointResult {
    /** 下一帧坐标。 */
    position: Game2048Point;

    /** 下一帧速度。 */
    velocity: Game2048Point;
}

/**
 * 使用临界阻尼把坐标平滑推向目标。
 *
 * 该离散公式在不同帧率下保持稳定，并避免简单线性插值在急转弯时产生
 * 明显顿挫或因大时间步发生过冲。
 */
function smoothDampPoint(
    current: Game2048Point,
    target: Game2048Point,
    velocity: Game2048Point,
    smoothTime: number,
    deltaTime: number,
): SmoothDampPointResult {
    const safeSmoothTime = Math.max(0.0001, smoothTime);
    const angularFrequency = 2 / safeSmoothTime;
    const scaledTime = angularFrequency * deltaTime;
    const decay =
        1 /
        (1 +
            scaledTime +
            0.48 * scaledTime * scaledTime +
            0.235 * scaledTime * scaledTime * scaledTime);

    const change = subtractPoint(current, target);
    const temporary = scalePoint(
        addPoint(velocity, scalePoint(change, angularFrequency)),
        deltaTime,
    );
    return {
        position: addPoint(
            target,
            scalePoint(addPoint(change, temporary), decay),
        ),
        velocity: scalePoint(
            subtractPoint(
                velocity,
                scalePoint(temporary, angularFrequency),
            ),
            decay,
        ),
    };
}
