import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    UITransform,
} from "cc";
import {
    Game2048ActorKind,
    Game2048ActorSnapshot,
    Game2048EffectKind,
    Game2048Point,
    Game2048RunState,
    Game2048WorldSnapshot,
} from "../../game/game2048/Game2048Model";

const { ccclass, property } = _decorator;

/** 数码管每个数字需要点亮的线段编号。 */
const DIGIT_SEGMENTS: Readonly<Record<string, readonly number[]>> = {
    "0": [0, 1, 2, 3, 4, 5],
    "1": [1, 2],
    "2": [0, 1, 6, 4, 3],
    "3": [0, 1, 6, 2, 3],
    "4": [5, 6, 1, 2],
    "5": [0, 5, 6, 2, 3],
    "6": [0, 5, 6, 4, 2, 3],
    "7": [0, 1, 2],
    "8": [0, 1, 2, 3, 4, 5, 6],
    "9": [0, 1, 2, 3, 5, 6],
};

/** 地图背景色。 */
const OUTSIDE_COLOR = new Color(5, 8, 18, 255);

/** 圆形竞技场内部颜色。 */
const ARENA_COLOR = new Color(12, 19, 35, 255);

/** 竞技场网格点颜色。 */
const GRID_COLOR = new Color(41, 56, 79, 155);

/** 圆形边界常态颜色。 */
const BORDER_COLOR = new Color(128, 151, 183, 225);

/** 玩家描边颜色。 */
const PLAYER_STROKE_COLOR = new Color(255, 255, 255, 255);

/** AI 描边颜色。 */
const BOT_STROKE_COLOR = new Color(35, 42, 58, 245);

/**
 * 2048 圆形竞技场程序化渲染器。
 *
 * 所有动态数字和图形都绘制在 Inspector 绑定的 Graphics 上，不在运行时创建 UI 节点。
 */
@ccclass("Game2048Renderer")
export class Game2048Renderer extends Component {
    /** 圆形地图、底色、网格和边界画布。 */
    @property(Graphics)
    public arenaGraphics: Graphics | null = null;

    /** 数字道具和角色队列画布。 */
    @property(Graphics)
    public entityGraphics: Graphics | null = null;

    /** 吞噬、合并和蹭边反馈画布。 */
    @property(Graphics)
    public effectGraphics: Graphics | null = null;

    /** 失败遮罩、结果卡片和重新开始按钮背景画布。 */
    @property(Graphics)
    public overlayGraphics: Graphics | null = null;

    /** 当前得分文本。 */
    @property(Label)
    public scoreLabel: Label | null = null;

    /** 当前排名和队首数字文本。 */
    @property(Label)
    public rankLabel: Label | null = null;

    /** 操作提示文本。 */
    @property(Label)
    public hintLabel: Label | null = null;

    /** 失败结算文本。 */
    @property(Label)
    public finalResultLabel: Label | null = null;

    /** 当前画布宽度。 */
    private _viewWidth = 640;

    /** 当前画布高度。 */
    private _viewHeight = 1136;

    /** 当前镜头坐标。 */
    private _cameraPosition: Game2048Point = { x: 0, y: 0 };

    /** Cocos 生命周期：校验全部必填引用并读取画布尺寸。 */
    protected onLoad(): void {
        const missingBindings = [
            ["arenaGraphics", this.arenaGraphics],
            ["entityGraphics", this.entityGraphics],
            ["effectGraphics", this.effectGraphics],
            ["overlayGraphics", this.overlayGraphics],
            ["scoreLabel", this.scoreLabel],
            ["rankLabel", this.rankLabel],
            ["hintLabel", this.hintLabel],
            ["finalResultLabel", this.finalResultLabel],
        ]
            .filter(([, value]) => value === null || value === undefined)
            .map(([name]) => name);
        if (missingBindings.length > 0) {
            throw new Error(
                `2048 渲染器 Inspector 绑定缺失：${missingBindings.join("、")}`,
            );
        }

        const transform = this.node.getComponent(UITransform);
        if (!transform) {
            throw new Error("2048 渲染器宿主节点缺少 UITransform。");
        }
        this._viewWidth = transform.contentSize.width;
        this._viewHeight = transform.contentSize.height;
        this.hintLabel!.string = "移动鼠标 / 拖动屏幕 / WASD 控制方向";
    }

    /** 渲染一帧完整世界快照。 */
    public render(snapshot: Game2048WorldSnapshot): void {
        this._cameraPosition = snapshot.cameraPosition;
        this.drawArena(snapshot);
        this.drawEntities(snapshot);
        this.drawEffects(snapshot);
        this.drawHudGraphics(snapshot);
        this.drawHud(snapshot);
        this.drawGameOver(snapshot);
    }

    /** 清空全部动态画布，供场景退出时幂等清理。 */
    public clear(): void {
        this.arenaGraphics?.clear();
        this.entityGraphics?.clear();
        this.effectGraphics?.clear();
        this.overlayGraphics?.clear();
    }

    /** 绘制黑色外部区域、竞技场、网格和圆形边界。 */
    private drawArena(snapshot: Game2048WorldSnapshot): void {
        const graphics = this.arenaGraphics!;
        const halfWidth = this._viewWidth * 0.5;
        const halfHeight = this._viewHeight * 0.5;
        const arenaCenter = this.worldToScreen({ x: 0, y: 0 });
        graphics.clear();

        graphics.fillColor = OUTSIDE_COLOR;
        graphics.rect(-halfWidth, -halfHeight, this._viewWidth, this._viewHeight);
        graphics.fill();

        graphics.fillColor = ARENA_COLOR;
        graphics.circle(arenaCenter.x, arenaCenter.y, snapshot.arenaRadius);
        graphics.fill();

        graphics.fillColor = GRID_COLOR;
        const gridSize = 76;
        const minimumWorldX =
            Math.floor((this._cameraPosition.x - halfWidth) / gridSize) *
            gridSize;
        const maximumWorldX = this._cameraPosition.x + halfWidth;
        const minimumWorldY =
            Math.floor((this._cameraPosition.y - halfHeight) / gridSize) *
            gridSize;
        const maximumWorldY = this._cameraPosition.y + halfHeight;
        const arenaRadiusSquared =
            snapshot.arenaRadius * snapshot.arenaRadius;
        for (
            let worldX = minimumWorldX;
            worldX <= maximumWorldX;
            worldX += gridSize
        ) {
            for (
                let worldY = minimumWorldY;
                worldY <= maximumWorldY;
                worldY += gridSize
            ) {
                if (worldX * worldX + worldY * worldY > arenaRadiusSquared) {
                    continue;
                }
                const point = this.worldToScreen({ x: worldX, y: worldY });
                graphics.circle(point.x, point.y, 2.2);
                graphics.fill();
            }
        }

        graphics.lineWidth = 5;
        graphics.strokeColor = BORDER_COLOR;
        graphics.circle(arenaCenter.x, arenaCenter.y, snapshot.arenaRadius);
        graphics.stroke();
    }

    /** 绘制地图数字和全部存活角色数字队列。 */
    private drawEntities(snapshot: Game2048WorldSnapshot): void {
        const graphics = this.entityGraphics!;
        graphics.clear();

        for (const prop of snapshot.props) {
            const screenPosition = this.worldToScreen(prop.position);
            if (!this.isVisible(screenPosition, snapshot.tileSize)) {
                continue;
            }
            const pulse =
                1 + Math.sin(snapshot.elapsed * 2.8 + prop.phase) * 0.055;
            this.drawTile(
                graphics,
                screenPosition,
                prop.value,
                30 * pulse,
                new Color(255, 255, 255, 110),
                1.6,
                1,
            );
        }

        for (const actor of snapshot.actors) {
            if (!actor.active) {
                continue;
            }
            this.drawActor(
                graphics,
                actor,
                snapshot.tileSize,
                snapshot.playerProtectionRemaining,
                snapshot.elapsed,
            );
        }
    }

    /** 从队尾到队首绘制一个角色，保证队首始终位于最上层。 */
    private drawActor(
        graphics: Graphics,
        actor: Game2048ActorSnapshot,
        tileSize: number,
        playerProtectionRemaining: number,
        elapsed: number,
    ): void {
        for (
            let index = actor.segmentPositions.length - 1;
            index >= 0;
            index -= 1
        ) {
            const position = this.worldToScreen(actor.segmentPositions[index]);
            if (!this.isVisible(position, tileSize)) {
                continue;
            }
            const isHead = index === 0;
            const scrapeScale = isHead
                ? 1 + actor.boundaryEffect * 0.08
                : 1;
            const strokeColor =
                actor.kind === Game2048ActorKind.Player
                    ? PLAYER_STROKE_COLOR
                    : BOT_STROKE_COLOR;
            this.drawTile(
                graphics,
                position,
                actor.segments[index] ?? 2,
                tileSize * scrapeScale,
                strokeColor,
                isHead ? 3.5 : 2,
                isHead ? 1 : 0.92,
            );

            if (isHead) {
                this.drawDirectionMark(
                    graphics,
                    position,
                    actor.direction,
                    tileSize,
                    actor.kind === Game2048ActorKind.Player,
                );
                if (
                    actor.kind === Game2048ActorKind.Player &&
                    playerProtectionRemaining > 0
                ) {
                    this.drawSpawnProtection(
                        graphics,
                        position,
                        tileSize,
                        elapsed,
                    );
                }
            }
        }
    }

    /** 绘制玩家出生保护的脉冲护盾轮廓。 */
    private drawSpawnProtection(
        graphics: Graphics,
        position: Game2048Point,
        tileSize: number,
        elapsed: number,
    ): void {
        const pulse = 1 + Math.sin(elapsed * 7) * 0.08;
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(91, 218, 255, 215);
        graphics.circle(
            position.x,
            position.y,
            tileSize * 0.78 * pulse,
        );
        graphics.stroke();
    }

    /** 绘制队首前方的小方向标记，保持头部仍是完整方形。 */
    private drawDirectionMark(
        graphics: Graphics,
        position: Game2048Point,
        direction: Game2048Point,
        tileSize: number,
        isPlayer: boolean,
    ): void {
        const perpendicular = { x: -direction.y, y: direction.x };
        const tip = {
            x: position.x + direction.x * tileSize * 0.62,
            y: position.y + direction.y * tileSize * 0.62,
        };
        const left = {
            x:
                position.x +
                direction.x * tileSize * 0.35 +
                perpendicular.x * tileSize * 0.12,
            y:
                position.y +
                direction.y * tileSize * 0.35 +
                perpendicular.y * tileSize * 0.12,
        };
        const right = {
            x:
                position.x +
                direction.x * tileSize * 0.35 -
                perpendicular.x * tileSize * 0.12,
            y:
                position.y +
                direction.y * tileSize * 0.35 -
                perpendicular.y * tileSize * 0.12,
        };
        graphics.fillColor = isPlayer
            ? new Color(255, 255, 255, 245)
            : new Color(214, 225, 240, 215);
        graphics.moveTo(tip.x, tip.y);
        graphics.lineTo(left.x, left.y);
        graphics.lineTo(right.x, right.y);
        graphics.close();
        graphics.fill();
    }

    /** 绘制吞噬、合并和触边产生的扩散圈反馈。 */
    private drawEffects(snapshot: Game2048WorldSnapshot): void {
        const graphics = this.effectGraphics!;
        graphics.clear();
        for (const effect of snapshot.effects) {
            const position = this.worldToScreen(effect.position);
            if (!this.isVisible(position, 120)) {
                continue;
            }
            const progress = Math.min(1, effect.age / effect.duration);
            const baseColor = this.colorForValue(effect.value);
            const radiusBase =
                effect.kind === Game2048EffectKind.Defeat
                    ? 34
                    : effect.kind === Game2048EffectKind.Boundary
                      ? 24
                      : 18;
            const radius = radiusBase + progress * 52;
            graphics.lineWidth =
                effect.kind === Game2048EffectKind.Boundary ? 5 : 3;
            graphics.strokeColor = new Color(
                baseColor.r,
                baseColor.g,
                baseColor.b,
                Math.round(220 * (1 - progress)),
            );
            graphics.circle(position.x, position.y, radius);
            graphics.stroke();

            if (effect.kind === Game2048EffectKind.Boundary) {
                this.drawBoundarySparks(
                    graphics,
                    position,
                    progress,
                    baseColor,
                );
            }
        }
    }

    /** 绘制触边时向地图内散开的三条短火花。 */
    private drawBoundarySparks(
        graphics: Graphics,
        position: Game2048Point,
        progress: number,
        color: Color,
    ): void {
        const inward = normalizePoint({
            x: -this._cameraPosition.x,
            y: -this._cameraPosition.y,
        });
        const perpendicular = { x: -inward.y, y: inward.x };
        graphics.lineWidth = 4;
        graphics.strokeColor = new Color(
            color.r,
            color.g,
            color.b,
            Math.round(240 * (1 - progress)),
        );
        for (let index = -1; index <= 1; index += 1) {
            const start = {
                x: position.x + perpendicular.x * index * 9,
                y: position.y + perpendicular.y * index * 9,
            };
            const end = {
                x:
                    start.x +
                    inward.x * (24 + progress * 22) +
                    perpendicular.x * index * 5,
                y:
                    start.y +
                    inward.y * (24 + progress * 22) +
                    perpendicular.y * index * 5,
            };
            graphics.moveTo(start.x, start.y);
            graphics.lineTo(end.x, end.y);
        }
        graphics.stroke();
    }

    /**
     * 在特效层顶部绘制始终可见的数值 HUD。
     *
     * 关键数值同步画到持续渲染的实体层末尾，并向下避开网页预览工具栏，
     * 确保 Creator 预览和竖屏真机都能直接看到当前局状态。
     */
    private drawHudGraphics(snapshot: Game2048WorldSnapshot): void {
        const graphics = this.entityGraphics!;
        const player = snapshot.actors.find(
            (actor) => actor.id === snapshot.playerId,
        );
        const playerRankIndex = snapshot.ranking.findIndex(
            (entry) => entry.id === snapshot.playerId,
        );
        const panelY = this._viewHeight * 0.23;

        graphics.fillColor = new Color(4, 9, 20, 218);
        graphics.roundRect(-304, panelY - 35, 608, 70, 20);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(69, 91, 124, 230);
        graphics.roundRect(-304, panelY - 35, 608, 70, 20);
        graphics.stroke();

        this.drawScoreIcon(graphics, { x: -268, y: panelY });
        this.drawVectorNumber(
            graphics,
            { x: -197, y: panelY },
            player?.score ?? 0,
            64,
            new Color(255, 221, 112, 255),
        );
        this.drawRankIcon(graphics, { x: -42, y: panelY });
        this.drawVectorNumber(
            graphics,
            { x: 18, y: panelY },
            Math.max(1, playerRankIndex + 1),
            60,
            new Color(202, 220, 245, 255),
        );
        this.drawHeadIcon(graphics, { x: 147, y: panelY });
        this.drawVectorNumber(
            graphics,
            { x: 226, y: panelY },
            player?.segments[0] ?? 0,
            64,
            new Color(111, 218, 255, 255),
        );
    }

    /** 绘制代表得分的菱形图标。 */
    private drawScoreIcon(
        graphics: Graphics,
        position: Game2048Point,
    ): void {
        graphics.fillColor = new Color(255, 221, 112, 255);
        graphics.moveTo(position.x, position.y + 14);
        graphics.lineTo(position.x + 14, position.y);
        graphics.lineTo(position.x, position.y - 14);
        graphics.lineTo(position.x - 14, position.y);
        graphics.close();
        graphics.fill();
    }

    /** 绘制代表当前排名的三段领奖台图标。 */
    private drawRankIcon(
        graphics: Graphics,
        position: Game2048Point,
    ): void {
        graphics.fillColor = new Color(202, 220, 245, 255);
        graphics.roundRect(position.x - 17, position.y - 13, 10, 18, 2);
        graphics.roundRect(position.x - 5, position.y - 13, 10, 29, 2);
        graphics.roundRect(position.x + 7, position.y - 13, 10, 23, 2);
        graphics.fill();
    }

    /** 绘制代表队首数字的方形图标。 */
    private drawHeadIcon(
        graphics: Graphics,
        position: Game2048Point,
    ): void {
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(111, 218, 255, 255);
        graphics.roundRect(position.x - 15, position.y - 15, 30, 30, 7);
        graphics.stroke();
    }

    /** 更新得分、排名、队首数字和提示文本。 */
    private drawHud(snapshot: Game2048WorldSnapshot): void {
        const player = snapshot.actors.find(
            (actor) => actor.id === snapshot.playerId,
        );
        const playerRankIndex = snapshot.ranking.findIndex(
            (entry) => entry.id === snapshot.playerId,
        );
        const headValue = player?.segments[0] ?? 0;
        this.scoreLabel!.string = `得分  ${player?.score ?? 0}`;
        this.rankLabel!.string =
            `排名 ${Math.max(1, playerRankIndex + 1)}/${snapshot.ranking.length}` +
            `    队首 ${headValue}` +
            `    队列 ${player?.segments.length ?? 0}`;
        this.hintLabel!.string =
            snapshot.playerProtectionRemaining > 0
                ? `出生保护 ${Math.ceil(snapshot.playerProtectionRemaining)} 秒 · 移动鼠标 / 拖动 / WASD`
                : "移动鼠标 / 拖动屏幕 / WASD 控制方向";
    }

    /** 根据玩法状态绘制或清空失败遮罩与结果卡片。 */
    private drawGameOver(snapshot: Game2048WorldSnapshot): void {
        const graphics = this.overlayGraphics!;
        graphics.clear();
        if (snapshot.state !== Game2048RunState.GameOver) {
            return;
        }

        const player = snapshot.actors.find(
            (actor) => actor.id === snapshot.playerId,
        );
        this.finalResultLabel!.string =
            `最终队首  ${player?.segments[0] ?? 0}\n` +
            `最终得分  ${player?.score ?? 0}`;

        graphics.fillColor = new Color(2, 5, 13, 205);
        graphics.rect(
            -this._viewWidth * 0.5,
            -this._viewHeight * 0.5,
            this._viewWidth,
            this._viewHeight,
        );
        graphics.fill();

        graphics.fillColor = new Color(24, 33, 53, 250);
        graphics.roundRect(-260, -224, 520, 448, 34);
        graphics.fill();
        graphics.lineWidth = 3;
        graphics.strokeColor = new Color(104, 129, 165, 255);
        graphics.roundRect(-260, -224, 520, 448, 34);
        graphics.stroke();

        graphics.fillColor = new Color(108, 92, 231, 255);
        graphics.roundRect(-138, -160, 276, 78, 22);
        graphics.fill();
    }

    /** 绘制一个带颜色、描边和矢量数字的方形块。 */
    private drawTile(
        graphics: Graphics,
        position: Game2048Point,
        value: number,
        size: number,
        strokeColor: Color,
        strokeWidth: number,
        opacity: number,
    ): void {
        const color = this.colorForValue(value);
        const halfSize = size * 0.5;
        graphics.fillColor = new Color(
            color.r,
            color.g,
            color.b,
            Math.round(255 * opacity),
        );
        graphics.roundRect(
            position.x - halfSize,
            position.y - halfSize,
            size,
            size,
            Math.max(5, size * 0.18),
        );
        graphics.fill();

        graphics.lineWidth = strokeWidth;
        graphics.strokeColor = strokeColor;
        graphics.roundRect(
            position.x - halfSize,
            position.y - halfSize,
            size,
            size,
            Math.max(5, size * 0.18),
        );
        graphics.stroke();

        const textColor =
            value <= 4
                ? new Color(48, 50, 60, Math.round(255 * opacity))
                : new Color(255, 255, 255, Math.round(255 * opacity));
        this.drawVectorNumber(graphics, position, value, size, textColor);
    }

    /** 使用七段数码管矩形绘制整数，避免为动态数字创建 Label 节点。 */
    private drawVectorNumber(
        graphics: Graphics,
        position: Game2048Point,
        value: number,
        tileSize: number,
        color: Color,
    ): void {
        const digits = String(Math.max(0, Math.floor(value)));
        const digitHeight = Math.min(
            tileSize * 0.48,
            tileSize / (digits.length * 0.62 + 0.35),
        );
        const digitWidth = digitHeight * 0.52;
        const gap = digitWidth * 0.22;
        const totalWidth =
            digits.length * digitWidth + Math.max(0, digits.length - 1) * gap;
        let left = position.x - totalWidth * 0.5;
        const bottom = position.y - digitHeight * 0.5;
        graphics.fillColor = color;

        for (const digit of digits) {
            this.drawVectorDigit(
                graphics,
                digit,
                left,
                bottom,
                digitWidth,
                digitHeight,
            );
            left += digitWidth + gap;
        }
    }

    /** 绘制单个七段数码管数字。 */
    private drawVectorDigit(
        graphics: Graphics,
        digit: string,
        left: number,
        bottom: number,
        width: number,
        height: number,
    ): void {
        const thickness = Math.max(1.5, width * 0.2);
        const horizontalWidth = width - thickness;
        const verticalHeight = height * 0.5 - thickness * 1.25;
        const segments = [
            [left + thickness * 0.5, bottom + height - thickness, horizontalWidth, thickness],
            [left + width - thickness, bottom + height * 0.5 + thickness * 0.25, thickness, verticalHeight],
            [left + width - thickness, bottom + thickness, thickness, verticalHeight],
            [left + thickness * 0.5, bottom, horizontalWidth, thickness],
            [left, bottom + thickness, thickness, verticalHeight],
            [left, bottom + height * 0.5 + thickness * 0.25, thickness, verticalHeight],
            [left + thickness * 0.5, bottom + height * 0.5 - thickness * 0.5, horizontalWidth, thickness],
        ] as const;

        for (const segmentIndex of DIGIT_SEGMENTS[digit] ?? []) {
            const [x, y, segmentWidth, segmentHeight] = segments[segmentIndex];
            graphics.roundRect(
                x,
                y,
                segmentWidth,
                segmentHeight,
                thickness * 0.45,
            );
            graphics.fill();
        }
    }

    /** 返回不同 2048 数字对应的颜色。 */
    private colorForValue(value: number): Color {
        const palette: Readonly<Record<number, Color>> = {
            2: new Color(238, 228, 218, 255),
            4: new Color(237, 224, 200, 255),
            8: new Color(242, 177, 121, 255),
            16: new Color(245, 149, 99, 255),
            32: new Color(246, 124, 95, 255),
            64: new Color(246, 94, 59, 255),
            128: new Color(237, 207, 114, 255),
            256: new Color(237, 204, 97, 255),
            512: new Color(237, 200, 80, 255),
            1024: new Color(237, 197, 63, 255),
            2048: new Color(108, 92, 231, 255),
        };
        if (palette[value]) {
            return palette[value];
        }
        const colorIndex = Math.max(0, Math.round(Math.log2(Math.max(2, value))) - 11);
        const overflowPalette = [
            new Color(68, 189, 187, 255),
            new Color(55, 142, 240, 255),
            new Color(145, 92, 230, 255),
            new Color(224, 81, 150, 255),
        ];
        return overflowPalette[colorIndex % overflowPalette.length];
    }

    /** 把世界坐标转换为以玩家为中心的画布坐标。 */
    private worldToScreen(point: Game2048Point): Game2048Point {
        return {
            x: point.x - this._cameraPosition.x,
            y: point.y - this._cameraPosition.y,
        };
    }

    /** 判断一个带半径的图形是否仍处于可视区域。 */
    private isVisible(position: Game2048Point, margin: number): boolean {
        return (
            position.x >= -this._viewWidth * 0.5 - margin &&
            position.x <= this._viewWidth * 0.5 + margin &&
            position.y >= -this._viewHeight * 0.5 - margin &&
            position.y <= this._viewHeight * 0.5 + margin
        );
    }
}

/** 返回归一化向量，零向量保持为零。 */
function normalizePoint(point: Game2048Point): Game2048Point {
    const length = Math.sqrt(point.x * point.x + point.y * point.y);
    if (length <= 0.0001) {
        return { x: 0, y: 0 };
    }
    return { x: point.x / length, y: point.y / length };
}
