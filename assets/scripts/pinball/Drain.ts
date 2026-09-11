import { _decorator, Component, Contact2DType, Collider2D, IPhysics2DContact } from 'cc';
import { LifeStock } from './LifeStock';
import { TableBootstrap } from './TableBootstrap';
const { ccclass, property } = _decorator;

/** 浊沟传感器：球进入则销毁并扣魂 */
@ccclass('Drain')
export class Drain extends Component {
  @property(LifeStock)
  lives: LifeStock | null = null;

  @property(TableBootstrap)
  table: TableBootstrap | null = null;

  onEnable() {
    const col = this.getComponent(Collider2D);
    col?.on(Contact2DType.BEGIN_CONTACT, this.onBegin, this);
  }

  onDisable() {
    const col = this.getComponent(Collider2D);
    col?.off(Contact2DType.BEGIN_CONTACT, this.onBegin, this);
  }

  private onBegin(_s: Collider2D, other: Collider2D, _c: IPhysics2DContact | null) {
    if (other.node.name !== 'Ball') return;
    if (this.table?.isDrainImmune()) return;
    other.node.destroy();
    const over = this.lives?.loseOne() ?? true;
    this.table?.onBallLost(over);
  }
}
