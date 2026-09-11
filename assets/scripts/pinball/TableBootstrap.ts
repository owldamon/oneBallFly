import { _decorator, Component, Node, Prefab, instantiate, Label } from 'cc';
import { LifeStock } from './LifeStock';
const { ccclass, property } = _decorator;

/** 开局 / 掉沟后发球；阵停 UI */
@ccclass('TableBootstrap')
export class TableBootstrap extends Component {
  @property(Prefab)
  ballPrefab: Prefab | null = null;

  @property(Node)
  spawnPoint: Node | null = null;

  @property(LifeStock)
  lives: LifeStock | null = null;

  @property(Node)
  gameOverPanel: Node | null = null;

  @property(Label)
  statusLabel: Label | null = null;

  private _immuneUntil = 0;
  private _ball: Node | null = null;

  start() {
    this.spawnBall();
  }

  isDrainImmune() {
    return Date.now() < this._immuneUntil;
  }

  markLaunched() {
    this._immuneUntil = Date.now() + 350;
  }

  spawnBall() {
    if (!this.ballPrefab || !this.spawnPoint) return;
    if (this._ball?.isValid) this._ball.destroy();
    this._ball = instantiate(this.ballPrefab);
    this._ball.name = 'Ball';
    this.node.addChild(this._ball);
    this._ball.setWorldPosition(this.spawnPoint.worldPosition);
    if (this.statusLabel) this.statusLabel.string = '上拉发射 · 左右按住挡板';
  }

  onBallLost(gameOver: boolean) {
    if (gameOver) {
      if (this.gameOverPanel) this.gameOverPanel.active = true;
      if (this.statusLabel) this.statusLabel.string = '阵停了';
      return;
    }
    if (this.statusLabel) this.statusLabel.string = `走火。还剩 ${this.lives?.lives ?? 0} 魂。`;
    this.scheduleOnce(() => this.spawnBall(), 0.5);
  }

  /** UI 按钮绑定 */
  restart() {
    if (this.gameOverPanel) this.gameOverPanel.active = false;
    this.lives?.reset();
    this.spawnBall();
  }
}
