import { _decorator, Component, RigidBody2D, Vec2 } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 剑扉：用 Kinematic + 角速度打到目标角，不要 Dynamic 力矩（会肉）。
 * 节点锚点应放在外侧转轴。
 */
@ccclass('Flipper')
export class Flipper extends Component {
  @property
  restAngle = 25;

  @property
  upAngle = -35;

  @property
  motorSpeed = 18;

  private _pressed = false;
  private _body: RigidBody2D | null = null;

  onLoad() {
    this._body = this.getComponent(RigidBody2D);
  }

  setPressed(v: boolean) {
    this._pressed = v;
  }

  update(dt: number) {
    if (!this._body) return;
    const target = (this._pressed ? this.upAngle : this.restAngle) * (Math.PI / 180);
    const cur = this.node.eulerAngles.z * (Math.PI / 180);
    // 简化：直接插值角度（Creator 里请把 RigidBody2D.type 设为 Kinematic）
    const next = cur + (target - cur) * Math.min(1, this.motorSpeed * dt);
    this.node.setRotationFromEuler(0, 0, next * (180 / Math.PI));
    this._body.linearVelocity = new Vec2(0, 0);
    this._body.angularVelocity = 0;
  }
}
