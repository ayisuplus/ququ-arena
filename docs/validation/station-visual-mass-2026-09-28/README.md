# 外方框建筑体量：同镜头候选与主场景复验

2026-09-28，Unity 6000.3.24f1。对象是独立候选场景 `BlackHoleStationObservatory.unity`；240 m 核心外框、72 m 环台及 50 m 中孔未改。原始概念图 [IMG-001 v001](../../黑洞空间站升级方案/08_概念图/IMG-001_空间站总览_v001.png)决定方框、菱形、四角节点和中心轴线。建筑语言另参考 [SOM Moon Village](https://www.som.com/research/moon-village/) 的模块化围护，以及 [ESA Cupola](https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/International_Space_Station/Cupola) 的分段观测窗；没有照搬真实舱体尺寸。

## 改动与视觉判断

- 主候选场景新增下层外环四段屋面、四段窗带、44 条外立面肋和四角抬高的八边形观测节点，共 124 个场景构件。四角底盘使用与圆柱网格一致的 `MeshCollider`，地面绕行路线从节点下方通过。生成脚本是 [add_outer_habitat_mass.cs](../../../production/black-hole-station/add_outer_habitat_mass.cs)。
- [改动前总览](before/concept-overview.png)与[从磁盘重开的主场景总览](promoted/concept-overview.png)使用同一台临时摄像机：位置 `(0,125,-195)`、目标 `(0,-35,0)`、视角 58°、1200×675。另有相同机位的中心井、下层走廊和南侧图，分别在 `before/`、`promoted/`。主场景总览与通过的 V4 候选图 SHA-256 完全相同。
- 方框近侧从薄边变为可辨认的两层舱体，四角节点可见；菱形和中心环仍完整可见。**中心环在总览里仍显小，两侧大块平面也仍空旷**。概念图没有精确相机参数，因此这里的“同镜头”只指改动前后 Unity 截图，并不声称与概念图采用同一相机。

## 被拒的候选与碰撞原因

`BlackHoleStationVisualMassStudy.unity`、`V2`、`V3` 均保留在 `Assets/Station/Scenes/`，各版总览截图在 `after/`、`after-v2/`、`after-v3/`，通过版在 `after-v4/`。V1 节点堵住西侧地面环路，V2 外移后堵住东侧绕行。V3 已抬高节点，但 Unity 默认圆柱 `CapsuleCollider` 在横向放大后呈 24 m 高的碰撞包络，仍挡住地面；[碰撞诊断脚本](../../../production/black-hole-station/diagnose_visual_mass_block.cs)测得节点可视底盘位于 Y=10，而碰撞包络高度为 24 m。V4 将其换为圆柱网格碰撞体，才通过路线探针。V4 候选由 [研究脚本](../../../production/black-hole-station/study_outer_habitat_mass.cs)生成。

## 保存后复验

- [主场景路线结果](promoted-routes.json)：编辑器 Play 模式 `CharacterController.Move` 完成 11 组路线；其中上层完整外圈 864.0 m、下层完整外圈 680.0 m、东侧绕行到船坞 410.2 m，舱室→上层→下层→船坞连续路线 1,877.2 m / 7,513 步。路线脚本检查沿途地板承托和水平碰撞，不能代替真人键鼠游玩。
- [坠落井结果](promoted-shaft.json)：从磁盘重开的主场景中，中央射线到 Y=-200 没有撞到新增屋面；下层九个地板采样点仍承重，黑洞无碰撞体。
- 主场景保存后 802 条原有 `m_Name` 记录都仍存在；Unity 重新序列化了部分旧对象 ID，故 YAML 行差异大于 124 个新构件本身。`ArenaFont.asset` 是施工前已脏文件，未纳入本轮。

本轮只补外框可见体量，没有增加可进入房间、实际世界边界或环台尺寸。下一次视觉比例研究要同时检查环台相对菱形的可见尺寸、北侧抵达轴和左右功能区的立体层次，再决定是否调整环台几何；任何调整都要复验移动平台、坠落井、看台视线和漫游路线。
