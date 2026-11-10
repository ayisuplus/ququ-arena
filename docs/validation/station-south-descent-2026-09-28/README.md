# 南侧温室至下层闭环：Win64 Player 与总览证据

日期：2026-09-28。最终隔离构建：`E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-south-keel-clean-20260928\BlackHoleStationWorld.exe`，Unity `6000.3.24f1`。构建日志 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-south-keel-clean-20260928-build.log` 含 `Build Finished, Result: Success.` 和 `World preview build: Succeeded`。候选场景 SHA-256 为 `EC650D90D0ADA3867B3C80711BDAE23CF13A6437EF07E0711094B3825B654AEE`；构建 `level0` 为 `5B7541A44B3F5D55CD76BC20CA1FA4FCE6FBCEF562227AF666023610512FE036`，`QuQu.Validation.dll` 为 `19D6D3628DAA9118B94B4F6FCE7B691D9A83DC2FF51888DCFB862227E64FC257`。默认发行包未切换。

全部测试使用隔离存档目录，每次启动 Player 后退出码均为 `0`：

| 检查 | 原始结果 | 实测 |
| --- | --- | --- |
| 温室下行、写入下层位置 | [write.json](write.json)、[下层安全档](lower-safe-save.json) | 玩家舱→温室→贴壳坡道→下层南回廊，340.2 m／1365 次 `CharacterController.Move`；逐步地板与碰撞通过 |
| 新进程恢复并闭环返回 | [read.json](read.json)、[返回后存档](return-save.json) | 主文件恢复 x=-18、y≈-11.92、z=-85 的下层位置；经西侧旧坡道回温室，496.8 m／1988 步 |
| 原温室照料 | [write](greenhouse-write.json)、[read](greenhouse-read.json) | 六种植位的首次照料计数 1、重启恢复及居住舱到温室地板回归通过 |
| 原世界北侧功能 | [world-regression.json](world-regression.json) | 起点地板、东北高台、北侧双门互锁、货箱占道暂停、密封窗与检修工单通过 |

可见 Player 画面：[坡道入口](south-descent-top.png)、[下层转角](south-keel-turn.png)、[南回廊看中央环](south-lower-arrival.png)。[贴壳方案总览](overview-hull-aligned.png)与[弃选长尾总览](overview-rejected-spur.png)使用同一 Editor 相机；[弃选场景快照](rejected-spur-scene.zip)保留供追溯。ZIP 内只有原场景文件，解包字节与保留源文件一致，SHA-256 为 `8FC9D6E5C305A3D8C821B8AE86C446AC742F2FCD9E117A793B0ACB7108FD2816`。弃选版本虽通过步行，但南侧偏东长尾削弱了原概念图外方的主轮廓；最终结构沿南外壳横向下降，外伸约 10 m。

Player 探针使用脚本驱动角色碰撞体，不证明玩家手动 WASD 的完整体验；原温室交互仍由脚本直接调用，没有实际按 E 键的端到端验证。画面中的材质、角色和窗体仍是灰盒，且本轮未做稳定帧率、内存或正式气密验收。隐藏窗口执行的回归只用作功能证据，其截图未用于视觉结论。
