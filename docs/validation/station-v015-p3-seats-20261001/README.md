# v015 P3：148个生活座位随环交互

2026-10-01，基线提交 `5947b94e`。施工对象为独立候选 `BlackHoleStationThreeRingBuildingsV015`。

## 施工内容

恢复原148个 `StationGardenSeat`，保留StableId、所属建筑包及Walker引用。坐下时相机跟随座位，角色保留原安全站位，并通过既有 `MoveOnGround` 随地面旋转；起身恢复原本的第一/第三人称视图和角色显隐。不改变家具尺度，不把角色瞬移到座椅模型内部。

邻近多个座位时，只向距离最近者显示交互提示；每帧只消费一次E键，避免刚起身又被邻座立即坐下。同距时以StableId排序。禁用正在使用的座位会恢复站立状态。

原生启用脚本：[enable-life-seats.cs](../../../production/black-hole-station/v015/p3/enable-life-seats.cs)。运行探针：[StationRingSeatProbe.cs](../../../QuQuArena3D/Assets/Scripts/Validation/StationRingSeatProbe.cs)，独立运行脚本：[run-seats.ps1](../../../production/black-hole-station/v015/p3/run-seats.ps1)。

## 验证

| 检查 | 证据及范围 |
| --- | --- |
| Editor，相位97 | [1,783项通过](editor-final-phase97/seats.json)，148座位，78.79秒 |
| 独立Player，相位0 | [1,783项通过](player-phase0/seats.json)，148座位，77.96秒，进程已退出 |
| 独立Player，相位97 | [1,783项通过](player-phase97/seats.json)，148座位，77.99秒，进程已退出 |
| 原对象保存性 | [59,512项通过](preservation.json)，14,664原对象、148座位、六住处/六居民、525引用保留 |
| 场景差异 | [36,454条记录完整保留](scene-diff.json)，仅148个座位组件由停用改为启用，无增删对象 |
| 当前组件状态 | [启用后清单](behaviours-after.json)，148生活座位已启用，仍有50个原QuQu Behaviour停用 |
| Win64构建 | [Succeeded](build.json)，19.04秒，0错误、1警告 |

每个座位从独立放置的附近起点实际步行约0.8米，检查到达、远距离/阻塞输入拒绝、坐下、角色及相机随环、起身和脚下承托。固定组首座休息2秒，R2/R3首座分别休息8秒，其余座位0.2秒。正常旋转下逐帧检查三维环内位置漂移小于0.03米、朝向漂移小于0.01度、视点误差小于0.01米。第一/第三人称交替，每37座检查一次禁用时离座。此测试证明局部接近和座位状态转换，不代表全部座位均已从港区连续走到。

两相位Player最大三维位置漂移分别为0.01330米、0.01257米，最大朝向漂移分别为0.00092度、0.00025度。[最终校验点](checkpoint.json)绑定源码、场景、运行程序集与报告哈希；技术检查不等于玩家舒适度或最终视觉认可。

键盘验证使用Unity Input System虚拟键盘，选择有真实承托、胶囊不穿透且同时处于两个座位范围内的位置，按E只坐入最近座位，再按E只起身。未向操作系统发送键盘事件。

[首轮Editor记录](editor-phase97/seats.json)保留：148座位动作检查通过，但测试未找到同时覆盖两个座位的站位，整轮判失败。改为检查真实相邻座位间的可站立重叠区后，最终Editor及Player重新运行；未放宽交互成功条件。

## 实际视角

![固定抵达组坐姿](editor-final-phase97/fixed.png)

![中环生活组坐姿](editor-final-phase97/v015-r2.png)

![外环坐姿](editor-final-phase97/v015-r3.png)

三幅为实际Unity相机截图，已逐幅查看，不包含OnGUI提示层。它们用于检查坐姿朝向与遮挡；技术候选仍有大面积偏灰、空旷及建筑外壳未整合的问题，不作为最终效果图或美术完成证据。[三环概念效果图](../../黑洞空间站升级方案/v015/layout-review-v003/README.md)继续表示后续外观目标。

## 尚未完成

另一个 `StationSpectatorSeat` 与 `StationSpectatorCamera` 涉及观赛/自由相机往返，仍停用，须连同赛事相机适配，未计入上述148个生活座位。居民、生活功能、真实赛事链路和完整旧档迁移仍属P3；P2全量出口覆盖汇总、P4外形材质及P5集成验收继续。

[ownership-check.json](ownership-check.json)仅核对14,664源对象均有已知建筑包，包含已批准的科研座位归属修正；它不证明每个建筑出口与所有历史替换件都已完成路线验收。原v014场景哈希保持 `0FC1A6EBD2E536762D1E5CF42CC8A8590B1BDB11E7B7DF6DA39223E68B93134B`。
