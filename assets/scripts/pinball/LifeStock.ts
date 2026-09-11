import { _decorator, Component, Label } from 'cc';
const { ccclass, property } = _decorator;

/** 魂条：默认 3，掉沟 -1，耗尽派发 game-over */
@ccclass('LifeStock')
export class LifeStock extends Component {
  @property
  maxLives = 3;

  @property(Label)
  hud: Label | null = null;

  private _lives = 3;

  onLoad() {
    this.reset();
  }

  reset() {
    this._lives = this.maxLives;
    this.refresh();
  }

  get lives() {
    return this._lives;
  }

  loseOne(): boolean {
    if (this._lives <= 0) return true;
    this._lives -= 1;
    this.refresh();
    return this._lives <= 0;
  }

  private refresh() {
    if (this.hud) this.hud.string = `魂 ${this._lives}`;
  }
}
