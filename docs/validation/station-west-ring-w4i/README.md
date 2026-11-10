# W4I 西环观景支路验证

2026-09-29。W4I 从 W4H 复制独立候选场景，在西环正西交汇处增加可步行进入的下层透窗观景台。原西北至西南约 518 m 的外环段被新停留点分成两段约 259 m；坡道和平接桥面接回既有环路。场景仍在 [候选文件](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationWestRingW4I.unity)，未替换发行入口。

[Win64 构建日志](../../../.game-production/station-west-ring-w4i/build.log)显示 `Build Finished, Result: Success.`。主工程场景与用于构建的隔离工程场景 SHA-256 相同，均为 `775D8FF7CCE638E7B1DF09058CFF00F296A4657F6711E9E0626DFB75AEBA5F86`；Player 包内 `level0` 为 `2BBFEAAA4FFEE2F6A5D10B212BB7CFFE668E1DC4F572A994F844450F07FAC2A3`，`QuQu.App.dll` 为 `884B3DB5246C2EF42A6ED5EC09EE78EE41B90ECBCA457DC6C00B936A7E6296FE`，`QuQu.Validation.dll` 为 `5A77924E5E95BFCCF3813EF0E53783BBBCA03F0FF63BA3C5F03A1C2170606BD7`。导入后主工程 Editor 能打开 W4I，观景支路和平接桥面均存在，场景未被改脏。

[独立 Player 新档整圈](../../../.game-production/station-west-ring-w4i/qa/tour.json)走完 28 段、3,935 m。探针沿路径每至多 0.2 m 用 CharacterController 前进并检查碰撞与脚下支撑；西侧支路往返、观景窗前无不透明遮挡、原科研／花园／东南观景、货运、档案、温室、咖啡、赛事亭与核心门均通过，保存成功。独立进程[读档](../../../.game-production/station-west-ring-w4i/qa/read.json)恢复核心位置、温室 1 次、咖啡供应／饮用各 1 次和货运状态。两次进程退出码均为 0。

用 W4H Player 生成的真实源档经 W4I Player [迁入](../../../.game-production/station-west-ring-w4i/migration-w4h/target-qa/migrate-w4h.json)，报告 `migrated-W4H-primary`，进度保留；再启动[读档](../../../.game-production/station-west-ring-w4i/migration-w4h/target-qa/read.json)报告 `primary`。W4H 源档迁入前后 SHA-256 均为 `C6E44341AAE47E58C454E92DFF986C16F4FFE1212F98EF8F9E87A45D4569D251`，三次进程退出码均为 0。

Unity 6000.3.24f1 的 URP 相机在第一人称眼高离屏渲染了[环路接近](../../../.game-production/station-west-ring-w4i/visual/ring-approach.png)、[支路入口](../../../.game-production/station-west-ring-w4i/visual/branch-entry.png)、[观景窗](../../../.game-production/station-west-ring-w4i/visual/lookout-window.png)与[返程方向](../../../.game-production/station-west-ring-w4i/visual/return-route.png)。窗外可见黑洞主体；画面也清楚显示平台和坡道仍有开放侧与灰盒构件。最初的入口护栏、立柱及返程接缝碰撞失败证据保留在项目内 `diagnostics/`，修正后才重新构建并通过整圈。

本候选只验证一处新停留点的程序路径与离屏画面。其余长环段的内容、完整压力围护、真人键鼠体验、真实赛事服务正向联动、30 分钟性能和正式美术均未通过验收。
