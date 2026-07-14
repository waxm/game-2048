import { EventCenter } from "../../core/event/EventCenter";
import { Logger } from "../../core/utils/Logger";
import { PuzzleLevel001Config } from "../config/PuzzleLevelConfig";
import { GameEvent } from "../GameEvent";
import {
    PuzzleGameState,
    PuzzlePieceDropRequest,
    PuzzlePieceResult,
} from "../model/PuzzleGameState";

/** 第 1 关拼图状态控制器。 */
export class PuzzleGameController {
    /** 当前关卡的拼图总数，由行列数计算，避免配置重复。 */
    private readonly _totalPieces =
        PuzzleLevel001Config.rows * PuzzleLevel001Config.columns;

    /** 当前关卡状态。 */
    private _state: PuzzleGameState = this.createInitialState();

    /** 启动关卡并派发初始状态。 */
    public start(): void {
        this.bindEvents();
        this.restart();
        Logger.info(
            `${PuzzleLevel001Config.rows}×${PuzzleLevel001Config.columns} 拼图第 1 关已启动。`,
        );
    }

    /** 销毁控制器并注销事件。 */
    public destroy(): void {
        EventCenter.off(
            GameEvent.PuzzlePieceDropRequest,
            this.onPieceDropRequest,
            this,
        );
        EventCenter.off(GameEvent.PuzzleRestart, this.onRestartRequest, this);
    }

    /** 判定拼图落点，并依次派发单块结果、进度和通关事件。 */
    private onPieceDropRequest = (request?: PuzzlePieceDropRequest): void => {
        if (
            !request ||
            !this.arePieceIdsValid(request.connectedPieceIds) ||
            this._state.completed
        ) {
            return;
        }

        // 进度取当前合并组合的大小，不能累计两个彼此分离的小组合，否则会提前通关。
        this._state.placedCount = request.connectedPieceIds.length;
        this._state.completed =
            this._state.placedCount === this._state.totalCount;

        const result: PuzzlePieceResult = {
            pieceId: request.connectedPieceIds[0],
            correct: true,
        };
        EventCenter.emit(GameEvent.PuzzlePieceDropped, result);
        EventCenter.emit(GameEvent.PuzzleStateChanged, this.getState());

        if (this._state.completed) {
            EventCenter.emit(GameEvent.PuzzleCompleted, this.getState());
        }
    };

    /** 响应 UI 的重玩请求。 */
    private onRestartRequest = (): void => this.restart();

    /** 清空完成记录并恢复初始状态。 */
    private restart(): void {
        this._state = this.createInitialState();
        EventCenter.emit(GameEvent.PuzzleStateChanged, this.getState());
    }

    /** 注册关卡业务事件。 */
    private bindEvents(): void {
        EventCenter.on(
            GameEvent.PuzzlePieceDropRequest,
            this.onPieceDropRequest,
            this,
        );
        EventCenter.on(GameEvent.PuzzleRestart, this.onRestartRequest, this);
    }

    /** 创建全新的第 1 关状态。 */
    private createInitialState(): PuzzleGameState {
        return {
            level: 1,
            placedCount: 0,
            totalCount: this._totalPieces,
            completed: false,
        };
    }

    /** 返回状态副本，防止 UI 意外修改控制器内部数据。 */
    private getState(): PuzzleGameState {
        return { ...this._state };
    }

    /** 校验组合编号无重复且全部属于当前规则网格关卡。 */
    private arePieceIdsValid(pieceIds: number[]): boolean {
        const uniqueIds = new Set(pieceIds);
        return (
            pieceIds.length >= 2 &&
            uniqueIds.size === pieceIds.length &&
            pieceIds.every(
                (pieceId) =>
                    Number.isInteger(pieceId) &&
                    pieceId >= 0 &&
                    pieceId < this._totalPieces,
            )
        );
    }
}
