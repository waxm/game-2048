import { Rect, Size, SpriteFrame, Vec2 } from "cc";

/** 整图运行时裁切工具。 */
export class PuzzleImageSlicer {
    /**
     * 将整图 SpriteFrame 背后的原始纹理按行列裁成多个 SpriteFrame。
     *
     * 不直接使用传入 SpriteFrame 的 rect，是因为 Creator 可能对资源执行自动裁边；
     * 这里始终按完整纹理尺寸裁切，确保透明边缘和整张关卡图都不会丢失。
     * 所有结果复用同一张纹理，不生成散图文件，也不会复制像素数据。
     * 返回顺序为从左到右、从上到下。
     */
    public static slice(
        sourceFrame: SpriteFrame,
        rows: number,
        columns: number,
    ): SpriteFrame[] {
        if (rows <= 0 || columns <= 0) {
            throw new Error(`拼图裁切行列数无效：${rows} × ${columns}`);
        }

        const texture = sourceFrame.texture;
        const frames: SpriteFrame[] = [];

        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                // Creator 的 SpriteFrame rect 和逻辑网格都从纹理上方开始计算行号。
                // 保持相同行序后，上下邻块的逻辑编号才会和实际图片内容一致。
                // 使用相邻整数边界分配不能整除的余数，保证所有像素只出现一次且没有缝隙。
                const rectX = Math.floor((column * texture.width) / columns);
                const rectRight = Math.floor(
                    ((column + 1) * texture.width) / columns,
                );
                const rectY = Math.floor((row * texture.height) / rows);
                const rectBottom = Math.floor(
                    ((row + 1) * texture.height) / rows,
                );
                const pieceWidth = rectRight - rectX;
                const pieceHeight = rectBottom - rectY;
                const frame = new SpriteFrame();
                frame.reset({
                    texture,
                    rect: new Rect(rectX, rectY, pieceWidth, pieceHeight),
                    originalSize: new Size(pieceWidth, pieceHeight),
                    offset: new Vec2(),
                    isRotate: false,
                });
                frames.push(frame);
            }
        }

        return frames;
    }
}
