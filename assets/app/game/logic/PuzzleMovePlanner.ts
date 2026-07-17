/** 拼图移动失败的明确原因，界面层据此显示对应反馈。 */
export enum PuzzleMoveFailureReason {
  /** 移动计划有效。 */
  None = "none",

  /** 网格尺寸或格子占用表本身无效。 */
  InvalidBoard = "invalid-board",

  /** 格子与拼图编号的占用关系不完整或重复。 */
  InvalidOccupancy = "invalid-occupancy",

  /** 拖拽组不是当前连接组的完整集合。 */
  InvalidMovingGroup = "invalid-moving-group",

  /** 拖拽锚点或目标锚点无效。 */
  InvalidAnchor = "invalid-anchor",

  /** 整个拖拽组平移后有拼图超出棋盘。 */
  TargetOutOfBounds = "target-out-of-bounds",

  /** 目标中的已连接组合没有被拖拽区域完整覆盖。 */
  IncompleteTargetGroup = "incomplete-target-group",

  /** 目标连接组合回填后无法保持原有形状。 */
  TargetGroupDeformed = "target-group-deformed",

  /** 计算出的移动步骤出现重复来源、重复目标或遗漏。 */
  MoveCollision = "move-collision",
}

/** 单块拼图在一次原子移动中的来源格与目标格。 */
export interface PuzzleMoveStep {
  /** 被移动的拼图编号。 */
  readonly pieceId: number;

  /** 移动前占用的格子编号。 */
  readonly sourceCellIndex: number;

  /** 移动后占用的格子编号。 */
  readonly targetCellIndex: number;
}

/** 一次拖拽所需的完整棋盘移动计划。 */
export interface PuzzleMovePlan {
  /** 当前计划是否可以一次性提交。 */
  readonly valid: boolean;

  /** 无效计划的具体原因；有效时为 None。 */
  readonly reason: PuzzleMoveFailureReason;

  /** 拖拽组在行方向上的整体位移。 */
  readonly rowOffset: number;

  /** 拖拽组在列方向上的整体位移。 */
  readonly columnOffset: number;

  /** 拖拽组及所有被置换拼图的完整移动步骤。 */
  readonly moves: readonly PuzzleMoveStep[];
}

/** 生成移动计划所需的当前棋盘快照。 */
export interface PuzzleMovePlanRequest {
  /** 当前棋盘行数。 */
  readonly rows: number;

  /** 当前棋盘列数。 */
  readonly columns: number;

  /** 按格子编号保存的拼图编号。 */
  readonly pieceIdsByCell: readonly number[];

  /** 本轮需要保持形状并整体移动的连接组。 */
  readonly movingPieceIds: ReadonlySet<number>;

  /** 拖拽开始时，移动组内每块拼图所在的格子。 */
  readonly sourceCellByPieceId: ReadonlyMap<number, number>;

  /** 当前每块拼图所属的完整连接组。 */
  readonly connectedGroupByPieceId: ReadonlyMap<
    number,
    ReadonlySet<number>
  >;

  /** 用户实际按住的拼图编号，用它计算整组位移。 */
  readonly anchorPieceId: number;

  /** 锚点松手后最接近的目标格子编号。 */
  readonly targetAnchorCellIndex: number;
}

/**
 * 规则网格拼图的纯移动规划器。
 *
 * 本类不读写 Cocos 节点，只根据棋盘快照生成完整置换。拖拽组沿同一位移平移时，
 * 重叠区域会形成若干条移动链；每条链末端被覆盖的拼图回填到链首腾出的格子。
 * 这样三格组合平移一格时表现为 `[A A A X] -> [X A A A]`，不会依赖格子排序。
 */
export class PuzzleMovePlanner {
  /** 根据当前占用、连接关系和目标锚点生成可原子提交的移动计划。 */
  public static createPlan(request: PuzzleMovePlanRequest): PuzzleMovePlan {
    const boardReason = this.validateBoard(request);
    if (boardReason !== PuzzleMoveFailureReason.None) {
      return this.fail(boardReason);
    }

    const movingReason = this.validateMovingGroup(request);
    if (movingReason !== PuzzleMoveFailureReason.None) {
      return this.fail(movingReason);
    }

    const totalCells = request.rows * request.columns;
    const sourceAnchorCellIndex = request.sourceCellByPieceId.get(
      request.anchorPieceId,
    );
    if (
      sourceAnchorCellIndex === undefined ||
      !this.isCellIndex(request.targetAnchorCellIndex, totalCells)
    ) {
      return this.fail(PuzzleMoveFailureReason.InvalidAnchor);
    }

    const sourceAnchor = this.toCell(
      sourceAnchorCellIndex,
      request.columns,
    );
    const targetAnchor = this.toCell(
      request.targetAnchorCellIndex,
      request.columns,
    );
    const rowOffset = targetAnchor.row - sourceAnchor.row;
    const columnOffset = targetAnchor.column - sourceAnchor.column;
    const sourcePieceByCell = new Map<number, number>();
    const movingSteps: PuzzleMoveStep[] = [];

    for (const pieceId of request.movingPieceIds) {
      const sourceCellIndex = request.sourceCellByPieceId.get(pieceId)!;
      const sourceCell = this.toCell(sourceCellIndex, request.columns);
      const targetCellIndex = this.toCellIndex(
        sourceCell.row + rowOffset,
        sourceCell.column + columnOffset,
        request.rows,
        request.columns,
      );
      if (targetCellIndex === null) {
        return this.fail(
          PuzzleMoveFailureReason.TargetOutOfBounds,
          rowOffset,
          columnOffset,
        );
      }
      sourcePieceByCell.set(sourceCellIndex, pieceId);
      movingSteps.push({ pieceId, sourceCellIndex, targetCellIndex });
    }

    // 原地松手仍生成完整计划，界面层可统一把节点吸附回标准格子中心。
    if (rowOffset === 0 && columnOffset === 0) {
      return this.success(rowOffset, columnOffset, movingSteps);
    }

    const displacedSteps: PuzzleMoveStep[] = [];
    const visitedSourceCells = new Set<number>();

    for (const sourceCellIndex of sourcePieceByCell.keys()) {
      const sourceCell = this.toCell(sourceCellIndex, request.columns);
      const predecessorCellIndex = this.toCellIndex(
        sourceCell.row - rowOffset,
        sourceCell.column - columnOffset,
        request.rows,
        request.columns,
      );
      if (
        predecessorCellIndex !== null &&
        sourcePieceByCell.has(predecessorCellIndex)
      ) {
        continue;
      }

      let currentCellIndex = sourceCellIndex;
      while (sourcePieceByCell.has(currentCellIndex)) {
        if (visitedSourceCells.has(currentCellIndex)) {
          return this.fail(
            PuzzleMoveFailureReason.MoveCollision,
            rowOffset,
            columnOffset,
          );
        }
        visitedSourceCells.add(currentCellIndex);
        const currentCell = this.toCell(currentCellIndex, request.columns);
        currentCellIndex = this.toCellIndex(
          currentCell.row + rowOffset,
          currentCell.column + columnOffset,
          request.rows,
          request.columns,
        )!;
      }

      const displacedPieceId = request.pieceIdsByCell[currentCellIndex];
      if (request.movingPieceIds.has(displacedPieceId)) {
        return this.fail(
          PuzzleMoveFailureReason.MoveCollision,
          rowOffset,
          columnOffset,
        );
      }
      displacedSteps.push({
        pieceId: displacedPieceId,
        sourceCellIndex: currentCellIndex,
        targetCellIndex: sourceCellIndex,
      });
    }

    if (visitedSourceCells.size !== sourcePieceByCell.size) {
      return this.fail(
        PuzzleMoveFailureReason.MoveCollision,
        rowOffset,
        columnOffset,
      );
    }

    const allMoves = [...movingSteps, ...displacedSteps];
    const shapeReason = this.validateDisplacedGroups(request, displacedSteps);
    if (shapeReason !== PuzzleMoveFailureReason.None) {
      return this.fail(shapeReason, rowOffset, columnOffset);
    }
    if (!this.hasCompleteBijection(allMoves)) {
      return this.fail(
        PuzzleMoveFailureReason.MoveCollision,
        rowOffset,
        columnOffset,
      );
    }
    return this.success(rowOffset, columnOffset, allMoves);
  }

  /** 校验棋盘占用表完整包含 0 到格子总数减一，且没有重复拼图。 */
  private static validateBoard(
    request: PuzzleMovePlanRequest,
  ): PuzzleMoveFailureReason {
    if (
      !Number.isInteger(request.rows) ||
      request.rows <= 0 ||
      !Number.isInteger(request.columns) ||
      request.columns <= 0
    ) {
      return PuzzleMoveFailureReason.InvalidBoard;
    }
    const totalCells = request.rows * request.columns;
    if (request.pieceIdsByCell.length !== totalCells) {
      return PuzzleMoveFailureReason.InvalidBoard;
    }
    const pieceIds = new Set<number>();
    for (const pieceId of request.pieceIdsByCell) {
      if (!this.isCellIndex(pieceId, totalCells) || pieceIds.has(pieceId)) {
        return PuzzleMoveFailureReason.InvalidOccupancy;
      }
      pieceIds.add(pieceId);
    }
    return PuzzleMoveFailureReason.None;
  }

  /** 校验拖拽集合就是锚点当前完整连接组，并与占用反向索引一致。 */
  private static validateMovingGroup(
    request: PuzzleMovePlanRequest,
  ): PuzzleMoveFailureReason {
    if (
      request.movingPieceIds.size === 0 ||
      !request.movingPieceIds.has(request.anchorPieceId) ||
      request.sourceCellByPieceId.size !== request.movingPieceIds.size
    ) {
      return PuzzleMoveFailureReason.InvalidMovingGroup;
    }

    const anchorGroup = request.connectedGroupByPieceId.get(
      request.anchorPieceId,
    );
    if (
      !anchorGroup ||
      !this.areSameMembers(anchorGroup, request.movingPieceIds)
    ) {
      return PuzzleMoveFailureReason.InvalidMovingGroup;
    }

    const sourceCells = new Set<number>();
    for (const pieceId of request.movingPieceIds) {
      const sourceCellIndex = request.sourceCellByPieceId.get(pieceId);
      const pieceGroup = request.connectedGroupByPieceId.get(pieceId);
      if (
        sourceCellIndex === undefined ||
        request.pieceIdsByCell[sourceCellIndex] !== pieceId ||
        sourceCells.has(sourceCellIndex) ||
        !pieceGroup ||
        !this.areSameMembers(pieceGroup, request.movingPieceIds)
      ) {
        return PuzzleMoveFailureReason.InvalidMovingGroup;
      }
      sourceCells.add(sourceCellIndex);
    }
    return PuzzleMoveFailureReason.None;
  }

  /**
   * 校验目标中的连接组合可以完整、刚性地回填。
   *
   * 完整覆盖防止只拿走组合的一部分；所有成员使用同一行列位移，保证横条、竖条和
   * 不规则形状都不会在置换后被拉伸、翻转或拆散。
   */
  private static validateDisplacedGroups(
    request: PuzzleMovePlanRequest,
    displacedSteps: readonly PuzzleMoveStep[],
  ): PuzzleMoveFailureReason {
    const displacedPieceIds = new Set(
      displacedSteps.map((step) => step.pieceId),
    );
    const stepByPieceId = new Map(
      displacedSteps.map((step) => [step.pieceId, step]),
    );
    const checkedPieceIds = new Set<number>();

    for (const step of displacedSteps) {
      if (checkedPieceIds.has(step.pieceId)) {
        continue;
      }
      const group = request.connectedGroupByPieceId.get(step.pieceId);
      if (!group || !group.has(step.pieceId)) {
        return PuzzleMoveFailureReason.InvalidOccupancy;
      }
      for (const groupPieceId of group) {
        const memberGroup = request.connectedGroupByPieceId.get(groupPieceId);
        if (!memberGroup || !this.areSameMembers(memberGroup, group)) {
          return PuzzleMoveFailureReason.InvalidOccupancy;
        }
        if (!displacedPieceIds.has(groupPieceId)) {
          return PuzzleMoveFailureReason.IncompleteTargetGroup;
        }
      }

      let expectedRowOffset: number | null = null;
      let expectedColumnOffset: number | null = null;
      for (const groupPieceId of group) {
        const groupStep = stepByPieceId.get(groupPieceId);
        if (!groupStep) {
          return PuzzleMoveFailureReason.IncompleteTargetGroup;
        }
        const source = this.toCell(
          groupStep.sourceCellIndex,
          request.columns,
        );
        const target = this.toCell(
          groupStep.targetCellIndex,
          request.columns,
        );
        const memberRowOffset = target.row - source.row;
        const memberColumnOffset = target.column - source.column;
        if (expectedRowOffset === null) {
          expectedRowOffset = memberRowOffset;
          expectedColumnOffset = memberColumnOffset;
        } else if (
          expectedRowOffset !== memberRowOffset ||
          expectedColumnOffset !== memberColumnOffset
        ) {
          return PuzzleMoveFailureReason.TargetGroupDeformed;
        }
        checkedPieceIds.add(groupPieceId);
      }
    }
    return PuzzleMoveFailureReason.None;
  }

  /** 校验移动步骤对受影响格子构成一一对应，提交时不会覆盖未移动拼图。 */
  private static hasCompleteBijection(
    moves: readonly PuzzleMoveStep[],
  ): boolean {
    const pieceIds = new Set<number>();
    const sourceCells = new Set<number>();
    const targetCells = new Set<number>();
    for (const move of moves) {
      if (
        pieceIds.has(move.pieceId) ||
        sourceCells.has(move.sourceCellIndex) ||
        targetCells.has(move.targetCellIndex)
      ) {
        return false;
      }
      pieceIds.add(move.pieceId);
      sourceCells.add(move.sourceCellIndex);
      targetCells.add(move.targetCellIndex);
    }
    return this.areSameMembers(sourceCells, targetCells);
  }

  /** 返回两个只读集合是否包含完全相同的成员。 */
  private static areSameMembers<T>(
    first: ReadonlySet<T>,
    second: ReadonlySet<T>,
  ): boolean {
    if (first.size !== second.size) {
      return false;
    }
    for (const value of first) {
      if (!second.has(value)) {
        return false;
      }
    }
    return true;
  }

  /** 把合法格子编号换算为从上向下、从左向右的行列坐标。 */
  private static toCell(
    cellIndex: number,
    columns: number,
  ): { row: number; column: number } {
    return {
      row: Math.floor(cellIndex / columns),
      column: cellIndex % columns,
    };
  }

  /** 把行列坐标换算为格子编号，任何越界坐标均返回 null。 */
  private static toCellIndex(
    row: number,
    column: number,
    rows: number,
    columns: number,
  ): number | null {
    if (row < 0 || row >= rows || column < 0 || column >= columns) {
      return null;
    }
    return row * columns + column;
  }

  /** 判断编号是否为当前棋盘内的整数格子编号。 */
  private static isCellIndex(cellIndex: number, totalCells: number): boolean {
    return (
      Number.isInteger(cellIndex) &&
      cellIndex >= 0 &&
      cellIndex < totalCells
    );
  }

  /** 创建带明确原因的空失败计划。 */
  private static fail(
    reason: PuzzleMoveFailureReason,
    rowOffset = 0,
    columnOffset = 0,
  ): PuzzleMovePlan {
    return { valid: false, reason, rowOffset, columnOffset, moves: [] };
  }

  /** 创建已经通过全部边界和组合校验的成功计划。 */
  private static success(
    rowOffset: number,
    columnOffset: number,
    moves: readonly PuzzleMoveStep[],
  ): PuzzleMovePlan {
    return {
      valid: true,
      reason: PuzzleMoveFailureReason.None,
      rowOffset,
      columnOffset,
      moves,
    };
  }
}
