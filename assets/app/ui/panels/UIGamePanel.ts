import { _decorator, Color, Label, Node, UITransform, Vec3 } from "cc";
import { EventCenter } from "../../core/event/EventCenter";
import { PoolManager } from "../../core/pool/PoolManager";
import { TimerManager } from "../../core/timer/TimerManager";
import { UIBase } from "../../core/ui/UIBase";
import { GameEvent } from "../../game/GameEvent";
import { DemoGameResult, DemoGameState } from "../../game/model/DemoGameState";

const { ccclass } = _decorator;

/**
 * 点击得分 Demo 游戏面板。
 *
 * 这个面板用代码创建基础文本，方便在没有 Prefab 的情况下先验证框架流程。
 */
@ccclass("UIGamePanel")
export class UIGamePanel extends UIBase {
  /** 分数文本。 */
  private _scoreLabel: Label | null = null;

  /** 剩余时间文本。 */
  private _timeLabel: Label | null = null;

  /** 最高分文本。 */
  private _bestLabel: Label | null = null;

  /** 金币文本。 */
  private _coinLabel: Label | null = null;

  /** 提示文本。 */
  private _tipLabel: Label | null = null;

  /** 当前是否已经构建过界面。 */
  private _viewBuilt = false;

  /** 当前游戏是否已经结束。 */
  private _gameOver = false;

  /** 当前每次点击增加的分数。 */
  private _scorePerClick = 1;

  /** 得分飘字回收延迟，单位秒。 */
  private _popupRecycleDelay = 0.35;

  /**
   * UI 打开时调用。
   */
  protected onOpen(params?: unknown): void {
    super.onOpen(params);
    this.buildView();
    this.bindEvents();

    if (params) {
      this.updateState(params as DemoGameState);
    }
  }

  /**
   * UI 关闭时调用。
   */
  protected onClose(): void {
    this.unbindEvents();
    super.onClose();
  }

  /**
   * 构建 Demo 基础界面。
   */
  private buildView(): void {
    if (this._viewBuilt) {
      return;
    }

    this._viewBuilt = true;
    this.node.name = "UIGamePanel";
    this.node.addComponent(UITransform).setContentSize(720, 1280);

    this._scoreLabel = this.createLabel("ScoreLabel", "分数：0", 0, 220, 44, Color.WHITE);
    this._timeLabel = this.createLabel("TimeLabel", "时间：0", 0, 150, 36, Color.WHITE);
    this._bestLabel = this.createLabel("BestLabel", "最高分：0", 0, 90, 30, Color.WHITE);
    this._coinLabel = this.createLabel("CoinLabel", "金币：0", 0, 45, 30, Color.WHITE);
    this._tipLabel = this.createLabel("TipLabel", "点击屏幕得分", 0, -130, 34, new Color(255, 230, 120));
  }

  /**
   * 注册 UI 事件。
   */
  private bindEvents(): void {
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    EventCenter.on<DemoGameState>(GameEvent.ScoreChanged, this.onScoreChanged, this);
    EventCenter.on<DemoGameState>(GameEvent.TimeChanged, this.onTimeChanged, this);
    EventCenter.on<DemoGameResult>(GameEvent.GameOver, this.onGameOver, this);
  }

  /**
   * 注销 UI 事件。
   */
  private unbindEvents(): void {
    EventCenter.off(GameEvent.ScoreChanged, this.onScoreChanged, this);
    EventCenter.off(GameEvent.TimeChanged, this.onTimeChanged, this);
    EventCenter.off(GameEvent.GameOver, this.onGameOver, this);
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  /**
   * 创建一个文本节点。
   */
  private createLabel(name: string, text: string, x: number, y: number, fontSize: number, color: Color): Label {
    const node = new Node(name);
    node.setPosition(new Vec3(x, y, 0));
    this.node.addChild(node);

    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;

    return label;
  }

  /**
   * 响应屏幕点击。
   */
  private onTouchEnd(): void {
    if (this._gameOver) {
      EventCenter.emit(GameEvent.BackToLobby);
      return;
    }

    EventCenter.emit(GameEvent.DemoClick);
  }

  /**
   * 响应分数变化。
   */
  private onScoreChanged = (state?: DemoGameState): void => {
    if (!state) {
      return;
    }

    this.updateState(state);

    if (state.running && state.score > 0) {
      this.spawnScorePopup();
    }
  };

  /**
   * 响应时间变化。
   */
  private onTimeChanged = (state?: DemoGameState): void => {
    if (!state) {
      return;
    }

    this.updateState(state);
  };

  /**
   * 响应游戏结束。
   */
  private onGameOver = (result?: DemoGameResult): void => {
    if (!result) {
      return;
    }

    this._gameOver = true;
    this.setText(this._scoreLabel, `分数：${result.score}`);
    this.setText(this._bestLabel, `最高分：${result.bestScore}`);
    this.setText(this._coinLabel, `金币：${result.coins}`);
    this.setText(this._tipLabel, result.passed ? "达成目标！点击返回大厅" : "时间到！点击返回大厅");
  };

  /**
   * 刷新状态文本。
   */
  private updateState(state: DemoGameState): void {
    this._gameOver = !state.running;
    this._scorePerClick = state.scorePerClick;
    this._popupRecycleDelay = state.popupRecycleDelay;
    this.setText(this._scoreLabel, `分数：${state.score}`);
    this.setText(this._timeLabel, `时间：${state.timeLeft}`);
    this.setText(this._bestLabel, `最高分：${state.bestScore}`);
    this.setText(this._coinLabel, `金币：${state.coins}`);
    this.setText(this._tipLabel, state.running ? "点击屏幕得分" : "点击屏幕开始返回流程");
  }

  /**
   * 显示得分飘字。
   *
   * 节点优先从对象池取，显示结束后再放回对象池。
   */
  private spawnScorePopup(): void {
    let popup = PoolManager.get("ScorePopup");

    if (!popup) {
      popup = this.createPopupNode();
    }

    popup.setPosition(new Vec3(this.randomRange(-180, 180), this.randomRange(-20, 120), 0));
    popup.getComponent(Label)!.string = `+${this._scorePerClick}`;
    this.node.addChild(popup);

    TimerManager.delay(() => {
      popup?.removeFromParent();

      if (popup) {
        PoolManager.put("ScorePopup", popup);
      }
    }, this._popupRecycleDelay);
  }

  /**
   * 创建得分飘字节点。
   */
  private createPopupNode(): Node {
    const node = new Node("ScorePopup");
    const label = node.addComponent(Label);
    label.string = "+1";
    label.fontSize = 32;
    label.lineHeight = 40;
    label.color = new Color(80, 255, 160);
    return node;
  }

  /**
   * 设置文本内容。
   */
  private setText(label: Label | null, text: string): void {
    if (label) {
      label.string = text;
    }
  }

  /**
   * 生成指定范围内的随机数。
   */
  private randomRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
}
