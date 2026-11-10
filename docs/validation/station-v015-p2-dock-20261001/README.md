# v015 P2：固定港区气闸与登船路线

2026-10-01，接续 `d87354d9` 的移动门与室内通行修复。

## 本批修改

- 独立候选 `BlackHoleStationThreeRingBuildingsV015` 启用原 `StationDockAirlock` 与 `StationDockedVesselHatch` 两个组件，保留原门、互锁、防夹、Walker引用及世界坐标。原v014场景未改。[启用记录](enabled-doors.json)。本批场景差异仅两个组件的启用标志。
- 实测两道气闸中心约为 `(-6.792, 2.3, 339.473)`、`(-6.792, 2.3, 379.473)`；登船交互点约为 `(-6.792, 2.2, 424.973)`。坡道由地面升至约2.2m船内地板。港区全部保持固定，不属于旋转环。
- 新增 `StationRingDockProbe`，准备验证外环边缘→固定前庭→抵达厅→双门气闸→船坞→坡道→船内→原路返回外环。仅起点定位一次，途中使用实际CharacterController连续行走；检测关门物理阻挡、在另一扇门附近实际请求互锁、占位拒绝关闭、坡道承托和返回外环后的带随。
- 新增原生构建菜单 `Tools/Station/V015/Build ring dock` 和 `production/black-hole-station/v015/p2/run-dock.ps1`；运行时使用独立存档目录。

## 验证结果

原生重新编译通过：`recompile_status` 返回completed、failed=false、compilationFailed=false、errors为空。Editor与两个独立Player完成同一连续路线，均无阻挡或承托检查失败。

| 运行 | 检查 | 时长 | 累计路程 |
| --- | --- | --- | --- |
| [Editor 0°](editor-phase0/dock.json) | 107/107通过 | 98.446秒 | 565.209m |
| [Player 0°](player-phase0/dock.json) | 107/107通过 | 98.367秒 | 565.045m |
| [Player 97°](player-phase97/dock.json) | 107/107通过 | 98.414秒 | 565.301m |

检查覆盖两侧实际开关、物理门阻挡、另一道气闸在近距离拒绝开启、占位防夹、坡道上下行、船内2.2m地板、全程返回以及外环带随。门操作调用生产Use接口，非人体键鼠舒适度验收。未启用货运、居民或其他世界功能。[身份与引用复核](preservation.json)59,512项、零失败；14,664源对象、148座位、六住处/六居民与525场景引用保留。

## 构建等待记录与恢复

原生构建于约06:40开始，CLI在30秒后等待超时；没有据此重启或终止Unity。随后核对Unity PID 7448仍在，构建回执仍为running。Computer Use读取到Unity自己的 `Scene(s) Have Been Modified` 对话框，提示保存当前候选后才会纳入构建；其前方同时有Windows防火墙提示。没有自动操作防火墙、安全设置或允许网络。

恢复后重新观察确认对话框已消失；同一[构建](build.json)成功结束，3728.817秒包含对话框等待时间，不能当作正常构建耗时。原生[BuildReport消息](build-messages.json)确认两条Error均为 `/api/exec` 主线程等待超时；另有一条缺少RuntimePipelineConfig的既知警告。没有编译错误；上述Player直接由参数启动探针，不依赖远程Pipeline服务。两个运行日志未检出Exception或Error。保存后候选没有新增Git差异。

构建结束后finally恢复了其触及的五个源资产，`Assets/Settings/PC_RPAsset.asset` 的临时差异已消失。前置字体、第三方资产和旧验证目录变更保留。

## 接续验收

港区本条路线通过后，继续原六住处、赛场上层、外环观景坡道和边缘保护；本批仅恢复气闸与船门，不证明货运交互、座位或完整存档迁移已完成。

P2未完成；居民、座位、赛事、完整存档迁移、美术及整站性能仍待后续阶段。此处没有人体舒适度或最终视觉认可结论。
