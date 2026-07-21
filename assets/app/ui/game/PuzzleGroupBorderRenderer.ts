import { Color, Graphics } from "cc";
import { PuzzleGroupContour } from "../../game/logic/PuzzleGroupContour";
import type { PuzzleGroup } from "../../game/model/PuzzleGroup";

/** 组合边框在当前关卡中的网格布局。 */
export interface PuzzleGroupBorderLayout {
  /** 棋盘行数。 */
  readonly rows: number;

  /** 棋盘列数。 */
  readonly columns: number;

  /** 单个格子的显示宽度。 */
  readonly pieceWidth: number;

  /** 单个格子的显示高度。 */
  readonly pieceHeight: number;

  /** 棋盘中心相对面板中心的纵向偏移。 */
  readonly boardCenterY: number;
}

/** 活动组合边框相对其临时根节点的坐标偏移。 */
export interface PuzzleGroupBorderOffset {
  /** 横向偏移。 */
  readonly x: number;

  /** 纵向偏移。 */
  readonly y: number;
}

/**
 * 拼图组合边框渲染器。
 *
 * 静止组合共用一个 Graphics，拖拽或合并动画中的组合使用另一个 Graphics。
 * 因此无论 2×2 还是 10×10，常态最多只增加两个绘制组件；拖动过程中仅移动
 * 活动根节点，不重复计算轮廓，也不逐帧重建 Graphics 网格。
 */
export class PuzzleGroupBorderRenderer {
  /** 与原单块背景图一致的青绿色边框。 */
  private static readonly BORDER_COLOR = new Color(42, 166, 162, 255);

  /** 边框宽度，线条中心与组合外边界重合。 */
  private static readonly BORDER_WIDTH = 6;

  /** 静止组合共用的边框绘制组件。 */
  private readonly _restingGraphics: Graphics;

  /** 拖拽和合并动画共用的活动边框绘制组件。 */
  private readonly _activeGraphics: Graphics;

  /** 当前关卡网格布局；配置前禁止绘制。 */
  private _layout: PuzzleGroupBorderLayout | null = null;

  /** 使用 Prefab 已显式绑定的两个 Graphics 创建渲染器。 */
  public constructor(restingGraphics: Graphics, activeGraphics: Graphics) {
    this._restingGraphics = restingGraphics;
    this._activeGraphics = activeGraphics;
    this.configureGraphics(this._restingGraphics);
    this.configureGraphics(this._activeGraphics);
  }

  /** 切换关卡时更新网格尺寸和棋盘位置。 */
  public configure(layout: PuzzleGroupBorderLayout): void {
    if (
      !Number.isInteger(layout.rows) ||
      layout.rows <= 0 ||
      !Number.isInteger(layout.columns) ||
      layout.columns <= 0 ||
      layout.pieceWidth <= 0 ||
      layout.pieceHeight <= 0
    ) {
      throw new Error("拼图组合边框布局无效。");
    }
    this._layout = { ...layout };
    this.clear();
  }

  /**
   * 重绘全部静止组合，可排除正在拖拽或播放合并动画的一个组合。
   *
   * 组合只有在落点提交、回滚或连接关系变化后才调用本方法，拖动每帧不调用。
   */
  public renderRestingGroups(
    groups: readonly PuzzleGroup[],
    cellIndexByPieceId: ReadonlyMap<number, number>,
    excludedGroupId: number | null = null,
  ): void {
    this._restingGraphics.clear();
    this.drawGroups(
      this._restingGraphics,
      groups.filter((group) => group.id !== excludedGroupId),
      cellIndexByPieceId,
      { x: 0, y: 0 },
    );
  }

  /** 绘制当前活动组合，坐标偏移用于匹配活动根节点的局部原点。 */
  public renderActiveGroup(
    group: PuzzleGroup,
    cellIndexByPieceId: ReadonlyMap<number, number>,
    offset: PuzzleGroupBorderOffset = { x: 0, y: 0 },
  ): void {
    this._activeGraphics.clear();
    this.drawGroups(
      this._activeGraphics,
      [group],
      cellIndexByPieceId,
      offset,
    );
  }

  /** 清除活动组合边框；允许在成功、失败和销毁路径重复调用。 */
  public clearActiveGroup(): void {
    this._activeGraphics.clear();
  }

  /** 清除静止和活动两层边框。 */
  public clear(): void {
    this._restingGraphics.clear();
    this._activeGraphics.clear();
  }

  /** 设置固定线宽、颜色和圆角连接样式。 */
  private configureGraphics(graphics: Graphics): void {
    graphics.lineWidth = PuzzleGroupBorderRenderer.BORDER_WIDTH;
    graphics.strokeColor = PuzzleGroupBorderRenderer.BORDER_COLOR;
    graphics.lineJoin = Graphics.LineJoin.ROUND;
    graphics.lineCap = Graphics.LineCap.ROUND;
  }

  /** 把真实组合转换为网格轮廓，并一次性提交到指定 Graphics。 */
  private drawGroups(
    graphics: Graphics,
    groups: readonly PuzzleGroup[],
    cellIndexByPieceId: ReadonlyMap<number, number>,
    offset: PuzzleGroupBorderOffset,
  ): void {
    if (groups.length === 0) {
      return;
    }
    const layout = this.getLayout();

    for (const group of groups) {
      const cellIndices = new Set<number>();
      group.pieceIds.forEach((pieceId) => {
        const cellIndex = cellIndexByPieceId.get(pieceId);
        if (cellIndex === undefined || cellIndices.has(cellIndex)) {
          throw new Error(
            `组合 ${group.id} 缺少拼图 ${pieceId} 的唯一格子位置。`,
          );
        }
        cellIndices.add(cellIndex);
      });

      const loops = PuzzleGroupContour.trace(cellIndices, layout.columns);
      loops.forEach((loop) => {
        const firstPoint = this.toLocalPosition(loop.points[0], layout, offset);
        graphics.moveTo(firstPoint.x, firstPoint.y);
        for (let index = 1; index < loop.points.length; index += 1) {
          const position = this.toLocalPosition(
            loop.points[index],
            layout,
            offset,
          );
          graphics.lineTo(position.x, position.y);
        }
        graphics.close();
      });
    }
    graphics.stroke();
  }

  /** 把网格边界顶点转换为面板或活动根节点中的本地坐标。 */
  private toLocalPosition(
    point: { readonly column: number; readonly row: number },
    layout: PuzzleGroupBorderLayout,
    offset: PuzzleGroupBorderOffset,
  ): { x: number; y: number } {
    return {
      x:
        (point.column - layout.columns / 2) * layout.pieceWidth + offset.x,
      y:
        layout.boardCenterY +
        (layout.rows / 2 - point.row) * layout.pieceHeight +
        offset.y,
    };
  }

  /** 返回已经校验的布局；调用方遗漏 configure 时立即抛出明确错误。 */
  private getLayout(): PuzzleGroupBorderLayout {
    if (!this._layout) {
      throw new Error("拼图组合边框渲染器尚未配置关卡布局。");
    }
    return this._layout;
  }
}
