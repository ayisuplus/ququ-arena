# 圆形看台阶梯表面修正

2026-10-01 至 2026-10-02。看台继续采用正圆平面、九级同心圆台面、八个弧形座席区、四条放射楼梯与连续后环廊，设计目标见[圆形看台概念图](../../黑洞空间站升级方案/v015/circular-stands-review/README.md)。本轮修复前沿黑色碎线，不改变布局、材质或光照。

## 同机位前后对照

修复前，梯台前沿与立面板存在 64 处约 0.30m 高的共面重叠。重复表面在画面中形成碎裂黑线；将立面板上缘接到对应梯台底面后，条带恢复连续。

![修复前的阶梯前沿](before-riser-detail.png)

![修复后的阶梯前沿](after-riser-detail.png)

![修复后的圆形看台与环廊](after-concourse.png)

以上是 Unity Editor 原生相机渲染，复制玩家相机及完整 URP 附加设置，1800×1200；不是 AI 效果图或独立 Player 截图。前后相机配置见 [before-cameras.json](before-cameras.json) 与 [after-cameras.json](after-cameras.json)。未调整曝光、灯光、材质或修图；其它边缘与整站材质仍需持续审阅。

## 变更与保存范围

- 保留原网格，新增派生 `Circular stand tier fascias fitted.asset`；64 块立面共 9856 个上缘顶点接到对应地板底面。
- 半径、底边、顶点数量、三角形索引及 UV 保持。梯台、座席、楼梯、坡道、后环廊的网格和尺寸不变。
- 场景仅改该立面板的 MeshFilter 与 MeshCollider 两个网格引用；该碰撞网格同步变化，不能称为“所有碰撞体不变”。归属继续为 R1。
- 原对象、稳定身份和历史场景保留。核心玩法继续暂缓。

## 验证

| 项目 | 结果 |
| --- | --- |
| 修复前测量 | [64 处重叠](before-overlap.json) |
| 派生网格、拓扑与表面接缝 | [39495 项通过，重叠 0](surface-audit.json) |
| 看台楼梯、坡道、环廊和座席通道静态检查 | [5163 项通过](stand-audit.json) |
| 原对象与身份保存性 | [61656 项通过](real-building-audit.json)，14664 个源对象、148 个生活座位、6 个房间/居民 |
| Win64 独立构建 | [成功](build.json)，0 错误、1 警告，约 16 秒 |
| 独立 Player 完整看台路线，相位 97 | [7223 项通过](player-phase97/stands.json)，495.24 秒、2628.50m，无阻挡和支撑缺口 |

Player 使用正常时间、真实 CharacterController，完整往返四入口/升降旁路、四外侧坡道、整圈环廊、四放射楼梯、17 个座席层连接及四处边缘压力检查。本轮重跑一个相位，未重复整站路线或声称所有相位完成。运行测试为隐藏 batchmode D3D11；其结果证明通行，不作为视觉截图或动态反射验证。进程已自行退出。源码、场景、网格、程序集与本地图片哈希见 [checkpoint.json](checkpoint.json)；PNG 按项目规则留在本机，未强制加入 Git。

视觉改善不等于整站最终美术认可。动态反射另见[本轮失败对照](../station-v015-p4-reflections-runtime-20261001/README.md)。

复现脚本位于 `production/black-hole-station/v015/p4-stand-surfaces/`。`inspect.cs` 和 `repair.cs` 为修复前测量与一次性迁移，不能直接在已修复候选重复运行覆盖原证据；审计脚本可复核当前候选。日期目录沿用本轮开始时间 20261001。
