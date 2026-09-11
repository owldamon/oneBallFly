# 《一球飞升》oneBallFly

竖屏搞笑修仙弹珠。当前仓库里程碑：**物理沙盒**（先证明挡板手感）。

## 立刻可玩（不用等 Creator）

用浏览器打开：

```text
preview/index.html
```

（本地可 `npx serve preview` 或直接用浏览器打开该文件；若 CDN 被墙，需能访问 cdnjs 上的 matter-js。）

操作：

| 操作 | 作用 |
|---|---|
| 屏幕左 40% 按住 | 左挡板 |
| 屏幕右 40%（偏中右）按住 | 右挡板 |
| 右下发射道上拉 | 蓄力发射 |
| A / D 或左右 Shift | 键盘挡板 |
| Space | 快捷发射 |
| 掉沟 | -1 魂；3 魂耗尽「阵停了」可重开 |

过关标准：**挡板不肉，还会想再打一球。**

## Cocos Creator 3.8+

1. 安装 Cocos Creator **3.8.x**
2. 仪表盘 → 打开本仓库根目录
3. 按 `assets/scripts/pinball/SETUP_IN_CREATOR.md` 建场景并挂脚本
4. 项目重力建议 `(0, -320)`，设计分辨率 `720×1280`

> 说明：完整可点预览的 Creator 场景需要编辑器生成 `.meta` / `.scene`。本仓已提供可打开的工程标记 + TypeScript 组件；**手感请先用 `preview/` 打**，再迁到 Creator。

## 本阶段明确不做

洞府 UI、炼丹、秘境切台、微信小游戏接入、广告、货影。

## 文档

- `docs/CURRENT.md` — 现行骨架要点
