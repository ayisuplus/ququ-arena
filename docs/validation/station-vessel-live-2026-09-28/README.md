# 停靠舱远端赛事持续性与待续状态验证

日期：2026-09-28。场景为 `Assets/Station/Scenes/BlackHoleStationObservatory.unity`，沿用[施工方案 v008](../../黑洞空间站升级方案/施工方案_v008.md)中的同一空间站连续世界及[最初概念图](../../黑洞空间站升级方案/08_概念图/IMG-001_空间站总览_v001.png)的北侧抵达轴线。测试服务仅监听 `127.0.0.1:8181`，`QUQU_RESULTS_DIR` 指向本目录的 `backend-results`；两个比赛均使用免费 mock 选手，但创建、题目、评分、事件与胜负都经过当前本机赛事后端。没有调用付费模型。

## 实测

| 赛事 | 服务端事实 | 玩家在停靠舱 z=245 时的 Unity 观察 | 返回赛场 |
| --- | --- | --- | --- |
| [四人赛 c399…](backend-results/game-competitions/c399dca96-675f-4148-82c1-f7083099996b.json) | 199 个有序事件；因平局或异常进入 `waiting`，没有冠军。SHA-256 `2ADE3AFB84964F481D6A0ECC8E32A38E4C4AA383719736B7646F1CB4C8E317C2`。 | [远端中段](vessel-mid-1.json)序号 102、10 回合；[后段](vessel-mid-2.json)序号 199、19 回合、5 次掌击接触。玩家和步行相机未移出停靠舱；原显示在事件收完后仍是“普通对局结算”。 | [修复后重连](vessel-reconnect-fixed.json)显示服务端待续原因；[定向 `pending` 夹具](pending-fixture-fixed.json)验证实时待续事件也更新显示。之后[实走 263.8 m 返回](vessel-return.json)，同一赛事 ID、待续显示和相机保持不变，6 次舱门操作后全关。 |
| [两人赛 caae…](backend-results/game-competitions/caaebd34b-3d2d-44e2-aeca-bdf5b569cace.json) | 76 个有序事件；`completed`，冠军 `mock:huatou-72b`。SHA-256 `31F35C35D5F5B11F9B3BE423182CA7912636EA8B84A09A16825884BB47BFE35D`。 | [开赛时](two-player-vessel-start.json)序号 32；[远端终局演出](two-player-vessel-mid.json)序号 76、7 个回合、1 次实际掌击接触、1 次冠军颁奖；[双板恢复后](two-player-vessel-finished.json)角色仍在停靠舱，步行相机未被赛事接管。败者平台撤去计数为 1，最终平台相位 `docked`，见本轮 CLI 记录。 | [实走 263.8 m 返回](two-player-return.json)，同一赛事 ID 和冠军完成状态保留，6 次舱门操作后全关，场景未切换。 |

状态缺口仅在 `ArenaStationLiveMatch` 的显示层：`pending` 发生于平台已停靠时原代码不更新 `Status`，重连 `waiting` 快照又显示成“等待下一场赛事”。改动后，两种路径都显示“赛事待续”及服务端原因。[修复前重连结果](vessel-reconnect-waiting.json)和[修复后结果](vessel-reconnect-fixed.json)针对同一赛事 ID；[Unity 重编译状态](recompile-status.json)无错误。没有修改后端结算规则。

## 边界

本轮在 Editor Play 中把测试角色放到已验证可步行抵达的停靠舱，再从舱内用真实 `CharacterController.Move` 每 0.2 m 检查地板与碰撞，返回赛场。住处到停靠舱的完整步行与三进程存档另见[上一轮证据](../station-north-shortcut-2026-09-28/README.md)。Editor 的 `StationWorldSave` 在移动测试角色前停用，重新 Play 时在编辑态临时停用以避免读写用户候选存档；测试后从磁盘重开，场景干净且存档组件恢复启用。场景 SHA-256 仍为 `20BAF3BBAADEFB60CF1A5CF2EC4B2F8816E55E27E81B126C871FE37C86D45772`。隔离后端进程和 8181 监听均已停止。

这里证明远处赛事事件、表现与玩家相机在**当前同一场景**中持续，且两种服务端终态可回到赛场。尚未证明 Windows Player 中的远端赛事、付费／真实大模型对局、分区卸载、NPC 日程、30 分钟漫游或画质帧率。四人赛的 `waiting` 是保留的真实负例，不能被写成“冠军已产生”。
