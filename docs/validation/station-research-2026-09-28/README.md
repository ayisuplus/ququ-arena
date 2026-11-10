# 西侧公开赛题研究台验证

日期：2026-09-28。独立候选世界 `BlackHoleStationObservatory.unity` 在原西侧科研庭院第二座观测仪基座上增加可操作档案。玩家靠近按 E 可查阅当前赛事公开题目；服务端结算后展示两位模型的公开答卷与分数。研究台读取 `ArenaStationLiveMatch` 已同步的数据，不参与评分或选择胜者。当前没有赛题时显示等待状态。没有新增研究设备造型。

| 检查 | 实测 |
| --- | --- |
| [本机赛事启动](launch.json)与[研究台同步](backend-report.json) | 隔离后端监听 `127.0.0.1:8181`，两位免费 mock 模型完成比赛；研究台拒绝远距交互、近距打开并锁定移动。完成时第 10 题 `m1-r10` 已结算，题目、两份答卷、两项分数及赛事状态均由后端同步对象逐项核对；关闭后移动恢复 |
| [服务端原始记录](backend-results/game-competitions/c1364f43b-56cd-42b5-add1-bccd819abc46.json) | 状态 `completed`、序号 `106`、冠军 `mock:huatou-72b`；SHA-256 `31259E60F6242E2A4461EA4CF14893198E8A97028F1AA22B710043866CFCE340` |
| [最终 4K 游戏视图](research-panel.png) | 面板放大、背景加深，打开时收起观战 HUD；图中内容取自同一服务端记录，用于视觉可读性核查 |
| [独立 Player 研究路线](research-player.json) | 退出码 0；玩家舱至西侧科研庭院 217.3 m／871 次 `CharacterController.Move`，逐步地板和阻挡检查通过；远处交互拒绝，近处打开／关闭及移动恢复通过 |
| [原世界 Player 回归](world-regression/probe.json) | 同一新构建退出码 0；玩家起点、东北高台、北侧接驳、停靠舱往返、货运和输入设备检查通过 |

最终 Win64 候选构建为 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-research-final-20260928\BlackHoleStationWorld.exe`。[构建日志](build.log)包含 `Build Finished, Result: Success.` 与 `World preview build: Succeeded`；`level0` SHA-256 为 `BCE7235E959B04EC70432BCB73320569FE99844F48C7DA6123508B2B719DC7CF`，`Managed/QuQu.App.dll` 为 `56F47D55888B2C573FCEDCDF18C2F25044F3224A7A5B094263AA6BF33E07F866`。默认发行场馆未切换。测试后本机后端与 8181 监听已停止。

4K 截图使用同一场比赛保存的后端记录注入 Editor 场景以固定画面；在线数据同步另由本机赛事核对。Player 探针直接调用交互方法，没有模拟真人按键。西侧建筑和基座仍是灰盒；研究台只是第一个可用目的地，完整科研玩法、场内导览、长时间漫游、真实性能与正式美术尚未验收。
