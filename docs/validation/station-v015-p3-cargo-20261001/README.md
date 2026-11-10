# v015 P3：固定港区货运与状态迁移

2026-10-01，基线 `b63499cc`。在独立三环候选恢复左右两台原货运控制器，保留原货箱模型、碰撞体、稳定ID及控制台引用。

## 施工与状态格式

原v014货箱泊位Z=166，检修位Z=154，行程12米。固定港区整体平移后，泊位已在Z=301.4725，但控制器检修终点仍为154。本轮依照原迁移清单将终点修正为289.4725，行程及4m/s速度保持；没有移动港区建筑或货箱初始摆放。

原生施工脚本：[enable-cargo.cs](../../../production/black-hole-station/v015/p3/enable-cargo.cs)，[逐台转换记录](enabled.json)。仅两个原组件启用并更新终点与旧坐标偏移；[36,454条场景记录完整保留](scene-diff.json)。

`StationDockCargoState` 的版本是货运子状态版本，与整站Snapshot版本分开：

- 缺少version或version=0：按旧世界Z坐标读取，仅加一次该候选明确配置的旧港区偏移135.4725。
- version=1：按progress保存泊位到检修位的0–1行程进度，恢复时根据当前端点重建位置，不再加旧偏移。z字段继续记录捕获时的位置，不用于新版位置恢复。
- 未知版本、非法浮点数/进度、错误ID、越界坐标及互相矛盾的阶段标志拒绝恢复，失败时不改变现有状态。

原静态场景未配置偏移时仍按原世界坐标读取旧格式。旧v014场景未改。该偏移只对应本次已核实的固定港区平移，不声称能识别任意历史布局。

## 运行验证

[StationRingCargoProbe.cs](../../../QuQuArena3D/Assets/Scripts/Validation/StationRingCargoProbe.cs)及[运行脚本](../../../production/black-hole-station/v015/p3/run-cargo.ps1)包含以下范围：

- 从转动外环跨入固定港区，走到两控制台，逐台通过E键启动、检修、返回泊位并完成工单，再回到外环。检查地板承托、碰撞、不可远程操作、检修前不得返回、重复检修拒绝、进度事件次数及停用时拒绝操作。
- 两台货箱分别检查去程、回程的人体占道暂停；每个压力场景先独立放置角色和货箱阶段，再等待真实货箱运动接近，验证无穿透、暂停不爬行，角色实际走出后继续运输。不是一次自然连续穿越移动货道的旅程。
- [原旧档货运条目](legacy-cargo.json)从既有v014验证存档只读提取，[来源及SHA256](legacy-source.json)记录原文件；原件未改。真实旧档条目证明泊位状态迁移，五种其它旧阶段由测试构造，分别检查移动中、等待检修、已检修及完成状态。
- 写进程最后构造一台去程、一台回程的有效旧阶段，转换后实际推进一帧，写出新版 `resume.json`。另一独立进程读取该文件，核对进度，等待自动抵达，再实际完成余下工单。此项证明货运子状态的跨进程续接，**完整StationWorldSave、玩家位置及居民旧档迁移仍待集成**。

最终报告：[写入与压力，相位0](player-final-write-phase0/cargo.json)、[跨进程恢复，相位97](player-read-phase97/cargo.json)。源码、场景、程序集、报告及输入文件哈希见 [checkpoint.json](checkpoint.json)。

| 检查 | 证据 |
| --- | --- |
| 最终写入Player，相位0 | [192项通过](player-final-write-phase0/cargo.json)，85.47秒，339.92米，包含两台货箱四组占道压力；进程已退出 |
| 恢复Player，相位97 | [111项通过](player-read-phase97/cargo.json)，65.43秒，323.97米；两台工单最终完成，进程已退出 |
| 货台全行程静态碰撞采样 | [196个形状位置、98次候选物件相交检查，无穿透失败](travel-clearance.json)；每0.25m采样，不代替连续运动或人体占道检查 |
| 原对象保存性 | [59,512项通过](preservation.json)，14,664源对象、148生活座位、六住处/六居民及525引用保留 |
| 最终Win64构建 | [Succeeded](build.json)，10.08秒，0错误，1条既有Pipeline运行配置警告；见[构建警告](build-warnings.json) |
| 当前停用功能 | [44个原QuQu组件](behaviours-after.json)，仍需继续适配 |

## 路线问题与修正

[首轮Editor记录](editor-phase97/progress.json)在前往右控制台时被原有 `Port arrival beacon` 指示柱挡住。[第一版Player绕行](player-write-phase0/progress.json)又被港区端部玻璃挡住，异常保留在该目录日志；确认探针已异常停止后才终止该专用Player进程。

最终公共后通道取Z=314.6725，再垂直接近各控制台Z=313.6725，绕过指示柱并留在端部玻璃内侧。左右服务侧道距货箱中轴4m；修正后的8段静态胶囊预检无阻挡，再重新构建运行。建筑、柱子、玻璃及货道都没有为通过测试而撤除。

## 实际画面与后续

![左货台检修位置](player-final-write-phase0/north-dock-left.png)

![右货台检修位置](player-final-write-phase0/north-dock-right.png)

图为实际Player检修视角，不含OnGUI提示；属于功能验证，材质与近景造型仍需P4处理。导览与资料展示、居民、真实赛事、观赛相机、完整存档迁移及P2出口汇总仍未完成；P4美术、P5集成验收继续。

原旧档SHA256仍为 `ca72d00a1007b6991e808c8721b25492777fe4d45264ab39808f593cb8ec19e7`，原v014场景SHA256仍为 `0FC1A6EBD2E536762D1E5CF42CC8A8590B1BDB11E7B7DF6DA39223E68B93134B`。
