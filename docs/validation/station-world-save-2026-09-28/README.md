# 候选空间站世界存档 Player 证据

源 Git `4c649d9`，Unity `6000.3.24f1`；隔离 Win64 候选程序为 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-save-20260928\BlackHoleStationWorld.exe`。最终构建日志 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-save-20260928-build-final.log` 含 `World preview build: Succeeded`；`BlackHoleStationWorld_Data/level0` SHA-256 为 `52667BCE7A54775EAD599AD86C1D81447B0B40260FA3FC3F94B5B27EAB642291`。默认发行版未切换。

测试均在 `--station-world-save-dir` 指定的隔离目录中，逐次退出 Player 后重新启动，以下各次退出码均为 `0`：

| 检查 | 原始结果 | 已验证状态 |
| --- | --- | --- |
| 开始检修并写盘 | [write.json](write.json) | 左货箱在检修位，玩家在北侧安全地板 |
| 新进程载入 | [read.json](read.json) | 从主文件恢复货箱、检查进度和玩家位置 |
| 主文件故意损坏 | [recover-corrupt.json](recover-corrupt.json) | 从 `.bak` 恢复同一状态 |
| 主文件改为中央井坐标 | [recover-unsafe.json](recover-unsafe.json) | 拒绝危险坐标，从 `.bak` 回到北侧安全点 |
| 送回并完成工单 | [finish.json](finish.json)、[complete.json](complete.json) | 完成状态写入，下一进程仍为完成 |
| 上层、下层分别保存／载入 | [upper.json](upper.json)、[upper-read.json](upper-read.json)、[lower.json](lower.json)、[lower-read.json](lower-read.json) | 两层实体步道位置恢复，工单仍完成 |

[最终样例存档](world-v1.json)只含 `version`、候选场景 ID、安全位置与两个稳定货台 ID 的状态，不含赛事后端凭据或角色自定义。原有[世界回归探针](world-regression.json)再次通过双门互锁、封闭观察窗、货箱占道暂停和工单完成；它的自动存档位于 QA 结果目录。

探针通过脚本调用交互方法并设置玩家位置；真实键盘完整漫游、长期性能、其他生活内容的保存，以及旧版本数据迁移仍未验收。隐藏窗口执行的运行结果不能作为画面证据；北侧工单的可见截图见[上一轮证据](../station-dock-workorder-2026-09-28/README.md)。
