import { Vec3 } from "cc";

/** 拼图块在规则网格中的行列坐标。 */
export interface PuzzleGridCell {
    /** 从上向下递增的行号。 */
    row: number;

    /** 从左向右递增的列号。 */
    column: number;
}

/**
 * 规则拼图网格。
 *
 * 统一负责编号、行列和正确相对位置的换算。关卡扩展到 2×3、3×3 时，
 * 业务层不需要分别编写上下左右四套吸附规则。
 */
export class PuzzleGrid {
    /** 网格总行数。 */
    public readonly rows: number;

    /** 网格总列数。 */
    public readonly columns: number;

    /** 单个格子的显示尺寸。 */
    public readonly cellSize: number;

    /** 创建规则网格并校验基础参数。 */
    public constructor(rows: number, columns: number, cellSize: number) {
        if (rows <= 0 || columns <= 0 || cellSize <= 0) {
            throw new Error(
                `拼图网格参数无效：${rows}×${columns}，格子尺寸 ${cellSize}`,
            );
        }
        this.rows = rows;
        this.columns = columns;
        this.cellSize = cellSize;
    }

    /** 根据从左到右、从上到下的编号取得网格坐标。 */
    public getCell(pieceId: number): PuzzleGridCell {
        if (!this.contains(pieceId)) {
            throw new Error(`拼图编号 ${pieceId} 不属于当前网格。`);
        }
        return {
            row: Math.floor(pieceId / this.columns),
            column: pieceId % this.columns,
        };
    }

    /** 判断两个格子是否在完整图片中上下或左右相邻。 */
    public areAdjacent(firstId: number, secondId: number): boolean {
        const first = this.getCell(firstId);
        const second = this.getCell(secondId);
        return (
            Math.abs(first.row - second.row) +
                Math.abs(first.column - second.column) ===
            1
        );
    }

    /**
     * 计算移动格相对目标格的正确中心偏移。
     *
     * UI 坐标 y 轴向上，而网格行号向下递增，所以纵向偏移需要取反。
     */
    public getRelativeOffset(movingId: number, targetId: number): Vec3 {
        const moving = this.getCell(movingId);
        const target = this.getCell(targetId);
        return new Vec3(
            (moving.column - target.column) * this.cellSize,
            -(moving.row - target.row) * this.cellSize,
            0,
        );
    }

    /** 判断拼图编号是否属于当前网格。 */
    private contains(pieceId: number): boolean {
        return (
            Number.isInteger(pieceId) &&
            pieceId >= 0 &&
            pieceId < this.rows * this.columns
        );
    }
}
