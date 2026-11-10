# 东侧客厅咖啡停留切片验证

日期：2026-09-28。Unity `6000.3.24f1`；隔离 Win64 构建 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-cafe-20260928\BlackHoleStationWorld.exe`。[构建日志](build.log)含 `Build Finished, Result: Success.` 和 `World preview build: Succeeded`。`level0` SHA-256：`9A61720A8FC46ECC8D8752C31A2C1577A5C3085EBA6A5E6F7B723F678161F9B7`；`Managed/QuQu.App.dll` SHA-256：`ED1A78F9D28AD27C5A1A2F8D61D8079A2DFFE85BA177EA6F50CFC5E4F9BDB228`。默认发行包未切换。

| 独立进程 | 结果 |
| --- | --- |
| [write.json](write.json) | 退出码 0；新档从玩家舱沿地板步行 65.2 m／327 步到东侧客厅，远处交互拒绝；取饮、入座、饮用、离座和写盘通过 |
| [read.json](read.json) | 退出码 0；主文件恢复饮用计数 `1`、无持杯状态和椅旁安全位置；再次入座、离座通过 |
| [legacy.json](legacy.json) | 退出码 0；[旧版无咖啡字段的 v1 样例](../station-world-save-2026-09-28/world-v1.json)载入，咖啡初始计数 `0`、原下层位置保留；写盘后生成[含新字段的文件](legacy-upgraded-world-v1.json) |
| [原世界回归](regression/probe.json) | 普通 Player 模式退出码 0；起点输入设备、地板、东北高台、接驳双门、封闭窗、停靠舱及货运工单通过 |

[Editor 路径与动作原始结果](editor-route.json)和[最终座位视角](seat-view.png)另存；[首个被墙面遮挡的视角](seat-view-initial-rejected.png)保留供对照。[新档最终内容](world-v1.json)含货运、温室与咖啡状态。Editor Play 测试使用关闭的存档组件，退出后从磁盘重开场景，确认组件在已保存场景中启用。

本次 Player 探针直接调用交互方法，没有模拟真人按键。座位截图来自 Editor 游戏视图；隐藏窗口 Player 没有用于画质判定。画面仍是灰盒：没有杯具或坐姿动画，窗外黑洞被现有结构遮挡；NPC 占座、完整日常循环、长期性能和正式美术未验收。

原世界回归首次以 `-batchmode` 启动，探针因无键鼠设备返回退出码 1，其他场景检查均通过；[失败原始结果](regression/probe-batchmode-inapplicable.json)保留。改用普通 Player 模式后同一构建退出码 0。该探针的隐藏窗口截图全黑，未用作画面或性能证据。
