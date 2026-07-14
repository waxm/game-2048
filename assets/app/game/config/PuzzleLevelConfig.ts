/** 拼图关卡配置。 */
export interface PuzzleLevelConfig {
    /** 关卡编号。 */
    level: number;

    /** 原图 SpriteFrame 子资源在 resources 中的加载路径。 */
    sourceImagePath: string;

    /** 纵向切分数量。 */
    rows: number;

    /** 横向切分数量。 */
    columns: number;

    /** 生成时的拼图块展示顺序。 */
    pieceOrder: number[];
}

/**
 * 第 1 关配置。
 *
 * 运行时会将一张 520×520 的整图切成 3×3 共 9 个 SpriteFrame。
 * 由于 520 不能被 3 整除，裁切器会把余下像素分配给边缘格子。
 * 不生成额外的切图文件，后续提升难度只需修改 rows 和 columns。
 */
export const PuzzleLevel001Config: PuzzleLevelConfig = {
    level: 1,
    // Creator 3.x 的图片会生成 spriteFrame 子资源，动态加载时必须明确写出子资源名。
    sourceImagePath: "textures/levels/level_001/level_001_source/spriteFrame",
    rows: 3,
    columns: 3,
    pieceOrder: [4, 0, 7, 2, 8, 3, 6, 1, 5],
};
