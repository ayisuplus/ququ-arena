# 南侧温室候选世界 Win64 Player 证据

日期：2026-09-28。Unity `6000.3.24f1`；隔离构建 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-greenhouse-fixed-20260928\BlackHoleStationWorld.exe`。构建日志 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-greenhouse-fixed-20260928-build.log` 含 `Build Finished, Result: Success.` 与 `World preview build: Succeeded`。`BlackHoleStationWorld_Data/level0` SHA-256 为 `7EBB3B1CD0F44D00E3FEE5546ACC8BDFE1DA4BF8A72CA407BC773A585F872B13`，`Managed/QuQu.App.dll` 为 `D2A6863787879929CD81E6F890CB5F0063F358268B357351175A9F38E1BACC42`。默认发行包未切换。

所有运行使用隔离 QA 存档目录；每行都单独启动、退出 Player，退出码为 `0`：

| 运行 | 结果 | 实测 |
| --- | --- | --- |
| [write.json](write.json) | 新档 | 从玩家舱沿主路到温室 `214 m`、`856` 次 `CharacterController.Move`，每步地板与碰撞通过；远处操作拒绝，检查、补水、叶片反馈和写盘通过 |
| [read.json](read.json) | 主文件 | 下一进程恢复温室完成状态、计数 `1` 和玩家位置 |
| [repeat.json](repeat.json) | 主文件 | 重新开始巡检、第二次补水，计数 `2`，写盘通过 |
| [repeat-read.json](repeat-read.json) | 主文件 | 再次重启后计数 `2` 与玩家位置保留 |
| [legacy.json](legacy.json) | 上一轮 v1 主文件 | [原无温室字段的样例](../station-world-save-2026-09-28/world-v1.json)载入，原下层安全位置保留，温室初始计数 `0`；写盘后生成[带温室字段的文件](legacy-upgraded-world-v1.json) |
| [world-regression.json](world-regression.json) | 原世界探针 | 玩家舱地面、东北高台、北侧双门互锁、密封观景窗、货箱占道暂停及工单完成通过 |

可见运行画面：[照料前](greenhouse-before-care.png)、[照料后](greenhouse-after-care.png)、[重启恢复](greenhouse-resumed.png)。[最终照料存档](world-v1.json)保留南侧位置与计数 `2`。叶片、种植枕和灯带仍是几何灰盒；画面不代表正式美术验收。

旧档首次试跑暴露 Unity `JsonUtility` 对缺失子对象生成空对象，导致整份旧档拒载；修正后用新的 Win64 构建重跑上表所有项目。世界回归在隐藏窗口运行，其截图未作为画面证据。探针通过脚本调用交互方法，未验证玩家手动按 E 键走完流程；持续性能和完整公共区体验也未验收。
