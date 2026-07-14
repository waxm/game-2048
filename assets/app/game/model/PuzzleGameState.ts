/** 第 1 关拼图的运行状态。 */
export interface PuzzleGameState {
    /** 当前关卡编号。 */
    level: number;

    /** 已正确放置的拼图数量。 */
    placedCount: number;

    /** 本关拼图总数量。 */
    totalCount: number;

    /** 是否已经完成本关。 */
    completed: boolean;
}

/** 单次拼图落点判定结果。 */
export interface PuzzlePieceResult {
    /** 拼图块编号。 */
    pieceId: number;

    /** 本次是否放置正确。 */
    correct: boolean;
}

/** UI 发给控制器的拼图块放下请求。 */
export interface PuzzlePieceDropRequest {
    /** 本次吸附后同一组合内的全部拼图编号。 */
    connectedPieceIds: number[];
}
