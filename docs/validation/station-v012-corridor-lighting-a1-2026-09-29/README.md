# v012 A1 短廊局部补光试装

日期：2026-09-29。仅修改[独立 A1 样板场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)；默认发行场景、既有 Quaternius 模型与材质、业务锚点和存档逻辑未动。

沿用[真实参考记录](../station-free-components-a0-2026-09-29/real-reference-a0a.md)与现有 Quaternius 短廊。固定第一人称机位显示：屋顶遮住主光后，[未补光画面](corridor-before.png)的内墙和顶板偏暗，门口亮度与廊内落差明显。本轮不更换已验证可通行的模型，只在两个 4 m 模块中心 `(190, 2, -218/-222)` 放置冷白色、无阴影、半径 5 m、强度 1.2 的点光，得到[补光画面](corridor-after.png)及[街道看短廊](street-after.png)。三个机位截图由同一[取景脚本](../../../production/black-hole-station/component-a0b/capture_v012_route_trial.cs)以 70° FOV、1280×720 在 Edit 模式拍摄；前后仅切换这两盏灯。更高位置／更强点光会在顶板产生刺眼白斑，向下的聚光灯又没有有效照亮墙面，因此未采用。用于重建的[搭建脚本](../../../production/black-hole-station/component-a0b/add_v012_corridor_lighting_trial.cs)只添加本轮根节点和两盏灯。

技术核对：Unity 6000.3.24f1／URP 17.3.0 在 Edit 模式保存后场景无 dirty；灯光没有 Collider。静态 11 个站点均有地面，后 8 段胶囊扫描无阻挡或地板断口。Editor Play 使用原有 `CharacterController` 的[10 段行走记录](controller-route-after.json)到达窗前 `(184.701, 0.080, -229.991)`，`complete: true`；门框前沿仍有原先 4 次轻微侧碰，未冒充已解决。退出 Play 后 Console 当前错误／警告 0，编译通过。场景 Git 差异仅新增补光根节点、两盏灯及根列表引用，除根列表外未改既有对象块。预先存在的 `ArenaFont.asset` dirty 保留在工作区，本轮不提交。

这是 A1 候选画面的局部可读性修复；灯具本体、咖啡厅主要陈设、材质过渡、键鼠实走、Windows Player 性能和审美确认仍待后续验收，不能据此宣布 A1 或 A2 完成。
