import { EventCenter } from "../../core/event/EventCenter";
import { Logger } from "../../core/utils/Logger";
import type { PuzzleLevelConfig } from "../config/PuzzleLevelConfig";
import { GameEvent } from "../GameEvent";
import {
  PuzzleGameState,
  PuzzlePieceDropRequest,
} from "../model/PuzzleGameState";

/** 单个拼图关卡的状态控制器。 */
export class PuzzleGameController {
  /** 当前关卡的拼图总数，由行列数计算，避免配置重复。 */
  private readonly _totalPieces: number;

  /** 当前关卡状态。 */
  private _state: PuzzleGameState;

  /** 是否已经注册关卡业务事件，防止重复启动时重复监听。 */
  private _eventsBound = false;

  /** 使用场景传入的关卡配置创建独立控制器。 */
  public constructor(private readonly _levelConfig: PuzzleLevelConfig) {
    this._totalPieces = _levelConfig.rows * _levelConfig.columns;
    this._state = this.createInitialState();
  }

  /** 启动关卡并派发初始状态。 */
  public start(): void {
    this.bindEvents();
    this.restart();
    Logger.info(
      `${this._levelConfig.rows}×${this._levelConfig.columns} 拼图第 ${this._levelConfig.level} 关已启动。`,
    );
  }

  /** 销毁控制器并注销事件。 */
  public destroy(): void {
    this.unbindEvents();
  }

  /** 注销关卡业务事件；允许重复调用。 */
  private unbindEvents(): void {
    if (!this._eventsBound) {
      return;
    }
    this._eventsBound = false;
    EventCenter.off(
      GameEvent.PuzzlePieceDropRequest,
      this.onPieceDropRequest,
      this,
    );
    EventCenter.off(GameEvent.PuzzleRestart, this.onRestartRequest, this);
    EventCenter.off(
      GameEvent.PuzzleTimeExpired,
      this.onTimeExpiredRequest,
      this,
    );
  }

  /** 判定拼图落点，并依次派发进度和通关事件。 */
  private onPieceDropRequest = (request?: PuzzlePieceDropRequest): void => {
    if (
      !request ||
      !this.arePieceIdsValid(request.connectedPieceIds) ||
      this._state.completed ||
      this._state.failed
    ) {
      return;
    }

    // 自动组合道具按使用次数增加一点；普通交换使用当前真实连接数量，允许拆开后回退。
    this._state.placedCount = request.fromAutoMergeTool
      ? Math.min(this._state.totalCount, this._state.placedCount + 1)
      : request.connectedPieceIds.length;

    // 无论显示进度是多少，只要全部拼图已进入同一组合就应立即完成关卡。
    if (request.connectedPieceIds.length === this._state.totalCount) {
      this._state.placedCount = this._state.totalCount;
    }
    this._state.completed = this._state.placedCount === this._state.totalCount;

    EventCenter.emit(GameEvent.PuzzleStateChanged, this.getState());

    if (this._state.completed) {
      EventCenter.emit(GameEvent.PuzzleCompleted, this.getState());
    }
  };

  /** 响应 UI 的重玩请求。 */
  private onRestartRequest = (): void => this.restart();

  /** 时间耗尽时锁定本关状态并通知场景打开失败弹窗。 */
  private onTimeExpiredRequest = (): void => {
    if (this._state.completed || this._state.failed) {
      return;
    }
    this._state.failed = true;
    EventCenter.emit(GameEvent.PuzzleStateChanged, this.getState());
    EventCenter.emit(GameEvent.PuzzleFailed, this.getState());
  };

  /** 清空完成记录并恢复初始状态。 */
  private restart(): void {
    this._state = this.createInitialState();
    EventCenter.emit(GameEvent.PuzzleStateChanged, this.getState());
  }

  /** 注册关卡业务事件。 */
  private bindEvents(): void {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    EventCenter.on(
      GameEvent.PuzzlePieceDropRequest,
      this.onPieceDropRequest,
      this,
    );
    EventCenter.on(GameEvent.PuzzleRestart, this.onRestartRequest, this);
    EventCenter.on(
      GameEvent.PuzzleTimeExpired,
      this.onTimeExpiredRequest,
      this,
    );
  }

  /** 创建当前关卡的全新运行状态。 */
  private createInitialState(): PuzzleGameState {
    return {
      level: this._levelConfig.level,
      placedCount: 0,
      totalCount: this._totalPieces,
      completed: false,
      failed: false,
    };
  }

  /** 返回状态副本，防止 UI 意外修改控制器内部数据。 */
  private getState(): PuzzleGameState {
    return { ...this._state };
  }

  /** 校验连接编号无重复且全部属于当前规则网格关卡；空数组表示当前没有连接。 */
  private arePieceIdsValid(pieceIds: number[]): boolean {
    const uniqueIds = new Set(pieceIds);
    return (
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
