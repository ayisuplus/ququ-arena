# v012 A1 短廊门框碰撞修复

日期：2026-09-29。仅修改[独立 A1 样板场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)中门框的场景级碰撞；Quaternius 原模型、材质、供应商 GUID、默认发行场景、业务 ID 和存档代码不变。

原门框的非凸 `MeshCollider` 在玩家沿入口中心线穿越 `z≈-215.5` 时，给 1.8 m 高、半径 0.32 m 的原有 `CharacterController` 报出[4 次轻微侧碰](../station-v012-corridor-lighting-a1-2026-09-29/controller-route-after.json)。在 Play 模式临时关闭该 `MeshCollider` 后，同一路线侧碰为 0，定位了故障源；但直接关闭会让门柱也失去实体阻挡。

[修复脚本](../../../production/black-hole-station/component-a0b/fix_v012_threshold_collision_trial.cs)在样板场景关闭原门框的 `MeshCollider`，另加项目侧的左右门柱和顶梁三个 `BoxCollider`，不增添可见几何。门框原网格射线检查显示玩家高度处中间开口约 `x=188.8–191.2`，两边为实体；新碰撞盒分别覆盖两根门柱。顶梁盒覆盖 `y=2.35–3.0`；试验中从 `y=2.1` 开始的盒仍带来 2 次侧碰，因此选取不触及当前角色通行高度的范围。Play 模式射线复核：两侧门柱和顶梁命中，中间 `x=190,y=1` 保持畅通。

正式保存后，静态路线除咖啡厅内玩家自身挡住向下射线外，其余 10 个站点命中地面；10 段无地板断口。前两段的胶囊扫描命中玩家自身，后 8 段无其他阻挡。Editor Play 用同一个 `CharacterController` 完成[10 段咖啡厅到窗前路线](controller-route-after.json)，总侧碰 **0**、每步接地、最大水平误差约 0.045 m；[左右旁路四段往返](portal-side-lanes-after.json)也全部完成、侧碰 0。退出 Play 后当前 Console 错误／警告 0，编译通过。固定机位截图仍显示原门框外形，碰撞修复没有改可见模型。

本轮只验证当前 1.8 m 访客控制器与已测路线；顶梁盒是对视觉模型的简化碰撞近似，后续若加入跳跃、较高角色或搬运大物件，须重新核对开口高度与宽度。实际键鼠行走和 Windows Player 手感仍需单独验收。
