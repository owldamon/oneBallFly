# 在 Cocos Creator 3.8 里接线

1. 用 Creator 打开本仓库根目录（需有 `package.json` + `assets`）。
2. 新建场景 `assets/scene/Table.scene`，设计分辨率 720×1280，开启 2D 物理，重力 Y ≈ -320。
3. 摆静态墙、左右浊沟（Collider2D Sensor）、左右 Flipper（RigidBody2D = Kinematic）、发射点空节点。
4. 做 Ball 预制体：圆碰撞 + Dynamic RigidBody2D，名字必须是 `Ball`。
5. 挂脚本：
   - `Flipper` ×2 → `FlipperInput`
   - `Drain` ×N → 引用 `LifeStock` + `TableBootstrap`
   - `Plunger`、`TableBootstrap`、`LifeStock` 挂到管理节点
6. 先到浏览器打开 `preview/index.html` 验证手感；Creator 场景按同样手感调参。
