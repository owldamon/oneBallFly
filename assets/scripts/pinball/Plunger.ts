import { _decorator, Component, Node, RigidBody2D, Vec2, EventTouch, input, Input, view } from 'cc';
const { ccclass, property } = _decorator;

/** 底部右侧蓄力发射：上拉松开发球 */
@ccclass('Plunger')
export class Plunger extends Component {
  @property(Node)
  ball: Node | null = null;

  @property
  maxSpeed = 42;

  private _charging = false;
  private _startY = 0;
  private _power = 0;

  onEnable() {
    input.on(Input.EventType.TOUCH_START, this.onDown, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onMove, this);
    input.on(Input.EventType.TOUCH_END, this.onUp, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onUp, this);
  }

  onDisable() {
    input.off(Input.EventType.TOUCH_START, this.onDown, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onMove, this);
    input.off(Input.EventType.TOUCH_END, this.onUp, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onUp, this);
  }

  private onDown(e: EventTouch) {
    const loc = e.getUILocation();
    const size = view.getVisibleSize();
    if (loc.x / size.width < 0.72) return;
    this._charging = true;
    this._startY = loc.y;
    this._power = 0;
  }

  private onMove(e: EventTouch) {
    if (!this._charging) return;
    const y = e.getUILocation().y;
    this._power = Math.min(Math.max((this._startY - y) / 180, 0), 1);
  }

  private onUp() {
    if (!this._charging) return;
    this._charging = false;
    const body = this.ball?.getComponent(RigidBody2D);
    if (!body) return;
    const p = Math.max(this._power, 0.35);
    body.linearVelocity = new Vec2(-2 - p * 4, this.maxSpeed * p);
  }
}
