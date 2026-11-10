# 候选空间站连续 Player 漫游验证

日期：2026-09-28。独立候选场景 `BlackHoleStationObservatory.unity`；本轮未改动场景结构。探针从玩家舱出发，在同一 Win64 Player 进程内用 `CharacterController.Move` 沿公共路径前进，每步检查阻挡和有地板支撑，不重置角色位置。

| 证据 | 实测 |
| --- | --- |
| [最终路线结果](continuous-world.json) | 4,239.8 m／16,978 次移动；上层、下层完整环路、东侧咖啡、西侧公开赛题研究台、南侧温室、北侧停靠舱和返舱全部通过；10 次气闸／舱门动作后均关闭，最终位置 `(104, 0.08, 35)`；`error` 为空 |
| [本机赛事原始记录](backend-results/game-competitions/cdd386080-bffe-4ecb-83e2-5f6e87476f43.json) | 免费 mock 双模型赛 `completed`、序号 116、11 回合、冠军 `mock:huatou-72b`。玩家在停靠舱内等到 Unity 的“冠军演出完成 · 双方已离场”，返回玩家舱后赛事 ID、冠军和回合数保持一致；原始记录 SHA-256 `DCE1CCAAE0C71597F2EA00C61C79C5B3892E9A25C4A1AEC34B3F2C115BC90ECE` |
| [最终世界存档](final-world-save.json) | 安全位置返回玩家舱，东侧咖啡 `served=1, drunk=1`，南侧温室 `careCount=1, stage=2`；SHA-256 `412BA33A00AA3EBA9B0A7B18A2C9946F69E84B78C09836AA1F8443EEB905B237` |
| [构建日志](build.log)、[Player 日志](player-final.log) | Win64 构建日志含 `Build Finished, Result: Success.`、`World preview build: Succeeded`；最终构建 `level0` SHA-256 `49ECC42678A47A7A31EF08E405692B852FFCF1A0EF475A39943A8A413A8B79B2`，`QuQu.Validation.dll` SHA-256 `CAC3048A3846286E5B90CC42924899033D43F3C667C44559673700839DFE1651` |

构建位置：`E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-continuous-20260928\BlackHoleStationWorld.exe`。测试使用隔离存档目录，不覆盖玩家当前存档。测试后本机后端进程已停止，`127.0.0.1:8181` 无监听。

[首次失败](continuous-world-attempt1.json)暴露上层西坡道落地后沿坡道轴线会重新爬坡；[第二次失败](continuous-world-attempt2.json)暴露西侧科研庭院的南墙不可穿越，必须从东侧公共门进入。[第三次结果](continuous-world-attempt3.json)已走通全程，但停在冠军接杯时，尚未等双方离场；最终结果把这一门槛收紧并重新跑通。路线采用现有公共门和坡道，未删除墙体或穿越私人房间。

4.24 km 是有意绕完两层环路并往返停靠舱的**累计行走距离**，不是地图直径，也不证明有同等规模的可玩内容。探针按预设路径驱动碰撞体并直接调用交互方法，尚不能代替方案指定的两条独立主层闭环、真人键鼠导航、20 分钟真实速度游玩和 30 分钟性能测量。旧的[灰盒总览](../station-bore-study-2026-09-28/bore-50m-overview.png)与[最初概念图](../../黑洞空间站升级方案/08_概念图/IMG-001_空间站总览_v001.png)仍只适于核对外方框、内菱形、中央环和北侧轴线；两图机位与完成度不同，本轮没有取得同机位新版画面，不能据此宣称视觉尺度和质感达标。
