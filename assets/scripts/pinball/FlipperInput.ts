import { _decorator, Component, EventTouch, Input, input, view } from 'cc';
import { Flipper } from './Flipper';
const { ccclass, property } = _decorator;

/** 左 40% / 右 40% 按住抬扉；键位 A/D 或左右 Shift 也可 */
@ccclass('FlipperInput')
export class FlipperInput extends Component {
  @property(Flipper)
  left: Flipper | null = null;

  @property(Flipper)
  right: Flipper | null = null;

  onEnable() {
    input.on(Input.EventType.TOUCH_START, this.onTouch, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouch, this);
    input.on(Input.EventType.TOUCH_END, this.onEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onEnd, this);
  }

  onDisable() {
    input.off(Input.EventType.TOUCH_START, this.onTouch, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouch, this);
    input.off(Input.EventType.TOUCH_END, this.onEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onEnd, this);
  }

  private onTouch(e: EventTouch) {
    const loc = e.getUILocation();
    const size = view.getVisibleSize();
    const r = loc.x / size.width;
    this.left?.setPressed(r < 0.4);
    this.right?.setPressed(r > 0.6);
  }

  private onEnd() {
    this.left?.setPressed(false);
    this.right?.setPressed(false);
  }
}
