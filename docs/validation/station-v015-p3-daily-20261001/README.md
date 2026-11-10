# v015 P3：咖啡与生态照料流程

2026-10-01，基线 `9ea65de0`，独立候选 `BlackHoleStationThreeRingBuildingsV015`。本轮恢复咖啡、生态照料和两套照料舱互锁门，共4个原组件；原稳定ID、引用、建筑位置及家具尺寸保留。

## 施工

- 咖啡使用其原有10个专用座位，和上一轮148个 `StationGardenSeat` 不重复。修复入座后相机停留在世界坐标的问题，复用Walker地面带随，视点每帧跟随座位。取饮、入座、饮用、离座的原顺序及计数保留；禁用组件时安全离座。
- 两套照料舱互锁门按门当前旋转后的坐标轴判断距离和门槛占用，不使用旧世界X/Z轴。保留内外门不得同时打开、门槛有人时不能关闭的规则。
- 恢复生态照料循环，原六株作物随父级生长显示；提示名称为“外环生态园”。照料组件停用或玩家处于禁用步行状态时拒绝操作。

原生启用脚本：[enable-daily-life.cs](../../../production/black-hole-station/v015/p3/enable-daily-life.cs)，[启用记录](enabled.json)。验证使用 [StationRingDailyProbe.cs](../../../QuQuArena3D/Assets/Scripts/Validation/StationRingDailyProbe.cs) 和 [独立Player运行脚本](../../../production/black-hole-station/v015/p3/run-daily.ps1)。

## 验证范围

咖啡路线从本组公共街道起点进入大门、走到柜台，逐一取饮并使用全部10座，返回柜台，再从入口返回公共路。全过程真实CharacterController步行，正常速度旋转；不在柜台与各座位之间放置玩家。首座休息8秒，其余各1秒，检查三维站位、朝向、视点带随和起身恢复，第一/第三人称交替。

生态路线另从玻璃罩外北入口开始，经自动门与北侧互锁舱进入，完成两轮照料，绕开种植架，经南侧互锁舱和玻璃罩自动门离开，再沿外部公共地面返回起点。检查两套门的两道门槛占用、舱内可同时够到两门时的互锁，以及真实E键关闭/打开的选择。两条路线分别起步，不当作咖啡跨环到生态园的一次连续旅程。

键盘使用Unity Input System虚拟设备，不向操作系统发送按键。状态测试将组件的原CaptureState结果写入独立JSON，再重置并RestoreState，核对饮品/照料计数和事件次数；同时拒绝错误身份、非法计数与非法阶段。**完整StationWorldSave及旧档迁移仍停用，此项不能替代跨进程整站存档验收。**

| 检查 | 证据 |
| --- | --- |
| 最终Player，相位0 | [454项通过](player-phase0/daily.json)，124.54秒，632.72米，进程正常结束 |
| 最终Player，相位97 | [454项通过](player-phase97/daily.json)，124.47秒，632.70米，进程正常结束 |
| 最终Win64构建 | [Succeeded](build.json)，0错误，19.01秒 |
| 构建警告 | [2条](build-warnings.json)：既有Pipeline缺少RuntimePipelineConfig，以及未修改的ArenaGame.cs的CS0109警告 |
| 原对象保存性 | [59,512项通过](preservation.json)，14,664原对象、148生活座位、六住处/六居民及525引用保留 |
| 场景差异 | [36,454条记录全部保留](scene-diff.json)，仅4个原组件启用及一个提示名称字段，无新增/删除场景对象 |
| 组件状态 | [剩余46个原QuQu组件停用](behaviours-after.json) |

最终运行报告见 [相位0](player-phase0/daily.json)、[相位97](player-phase97/daily.json)。源码、场景、构建程序集与证据哈希见 [checkpoint.json](checkpoint.json)。

两相位最大坐姿站位漂移分别约1.12毫米、6.55毫米；最大视点误差小于0.001毫米。旧v014场景SHA256仍为 `0FC1A6EBD2E536762D1E5CF42CC8A8590B1BDB11E7B7DF6DA39223E68B93134B`。

## 首轮记录

[Editor首轮](editor-phase97/daily.json)共451项，其中450项通过；路线和交互无阻挡，唯一失败是把Foliage的全部子物件数量当作作物数量。实际有18个历史叶片占位件和6个 `Living crop` 对象，运行中父级高度从0.55恢复至1。最终检查改为确认六个实际作物都激活且有渲染器，再验证高度增长；未删除历史件或改变作物数量。

最终探针还补上人在舱内、能同时够到两门时的互锁检查，以及照料停用时的拒绝检查。首轮失败保留，最终通过仅以重新构建后的Player报告为准。

## 实际画面与后续

![咖啡专用座位](player-phase97/cafe-seated.png)

![生态照料作物](player-phase97/garden-care.png)

图片为实际运行相机画面，不含OnGUI提示。此轮验证空间和功能，材质灰闷、照料架遮挡和建筑外壳细化仍属于P4；不宣称最终视觉完成。

其余46个原组件包含导览/资料展示、居民、港区货运、赛事相机、真实赛事及完整存档。已核实港区货台仍带旧检修终点154，而新货箱泊位Z约301.47，须和坐标表达及旧状态迁移一起修正；导览仍有旧四翼固定方位文案，也需按三环目的地改写。P2全量出口覆盖汇总、P4美术和P5集成验收继续。
