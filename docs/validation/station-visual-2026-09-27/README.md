# P3 东侧客厅概念图对齐：材质与观景线核查

日期：2026-09-27。场景：`QuQuArena3D/Assets/Station/Scenes/BlackHoleStationLive.unity`。

## 对照依据

- [最初空间站总览 IMG-001 v001](../../黑洞空间站升级方案/08_概念图/IMG-001_空间站总览_v001.png) 决定方形环站、中央黑洞与两侧生活／科研空间的身份；[当前总览 v003](../../黑洞空间站升级方案/08_概念图/IMG-001_空间站总览_v003.png) 补足两侧三角区；[生活区与观景咖啡厅](../../黑洞空间站升级方案/08_概念图/IMG-003_生活区与观景咖啡厅_v001.png) 提供暖浅色舱壁、深色步道、锈橙色座位、分段观景窗及黑洞景观的局部目标。
- [ESA Cupola 实拍说明](https://www.esa.int/ESA_Multimedia/Images/2022/09/Samantha_Cristoforetti_inside_cupola) 是观景窗功能和分段窗的真实参考；[NASA 黑洞吸积盘可视化](https://svs.gsfc.nasa.gov/13326) 用于辨认暗心、吸积盘与随视角变化的透镜外观。没有将外部媒体作为游戏贴图。

## 本轮接受的场景改动

- 将客厅九处既有舱壁、顶棚和吧台基座改用项目内已有的 `P3-cabin-warm-wall.mat`；南侧压力窗保留原透明材质和碰撞体。
- 在原有可走地板上方加一层 **无碰撞体** 的局部暖炭色视觉面，材质为 `P3-lounge-warm-charcoal.mat`，保留青色路线边线、原地板及原碰撞网格。
- 四把现有 `SeatUnit` 只在客厅场景实例上换用 `P3-lounge-rust-velvet.mat` 和 `P3-lounge-bronze-trim.mat`；座椅模型、位置和原 Prefab 材质未改。
- [吧台方向](counter-after.png)、[共享座位方向](seating-after.png)、[窗边方向](window-after.png) 为保存场景后重新进入 Unity Editor Play 拍摄的 1600 × 900 Game 视图。可与 [座位改色前](seating-before.png)、[窗边改色前](window-before.png) 对照。

## 验证与未采用试放

- Unity 6000.3.24f1 的脚本编译状态为 `completed`，无错误。退出 Play 后已保存场景 `dirty=False`；窗墙仍为 `P3-pressure-window`，视觉地板无 Collider。
- `verify_lounge_palette.cs` 在 Editor Play 检查四把椅子的绒面和饰条、地面、顶棚与压力窗；玩家沿 `z=62` 从 `x=69` 到 `x=94` 走 125 步，阻挡数为 0。
- [原西向视角](west-before.png) 与 [原窗边视角](window-before.png) 表明：客厅平视下的窗外被竞赛回廊、楼板等结构占据，中央井下的黑洞不在可见视线上。由客厅眼点 `(80, 1.73, 54)` 指向井下目标 `(0, -85, 0)` 的 Unity 射线，首先在 2.59 m 处命中 `Habitat square floor.001`，坐标 `(78.40, 0, 52.92)`；这是楼板遮挡，不是缺一张背景图。临时试放项目已有 `QuQu/Celestial Sky` 和 `QuQu/Spatial Singularity`（48 步积分）后，分别留下 [星空试放](west-sky-probe.png)、[西向黑洞试放](west-hole-probe.png)、[窗边黑洞试放](window-hole-probe.png)。这些试放**未保存到场景**，因为没有带来概念图要求的真实黑洞窗景。
- [整体配色试放](palette-probe.png)、[增加灯光范围试放](light-probe.png)、[座椅改色试放](seat-probe.png) 留作比较记录；增加灯光范围未采用。

## 后续施工门槛

本轮只是材质与座位配色样板，仍缺植物、布艺陈设、完整咖啡设施和空间层次。**黑洞观景线未通过**：下一轮应先从真实步行视角检查大厅、环台与东侧客厅的楼板／窗位／井口关系，选择能真正看见中央井或站外黑洞的位置，再决定观景走廊或抬高视点的结构；不得靠贴图假窗代替几何视线。真实赛事和 Windows Player 效果仍须分别验收。
