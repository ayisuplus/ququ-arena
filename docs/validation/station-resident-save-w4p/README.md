# W4P 居民行程存档验证（2026-09-29）

在 W4P 场景中，原存档仅记录玩家安全位置、货运、温室和咖啡。居民在半路退出后会从房间重新开始。现在同一份世界存档额外记录六名居民的稳定 ID、位置、下一路点、往返方向、停留剩余时间和到访/返家次数。读取旧存档时，缺少居民字段就沿用原来的房间起点；与当前路线不兼容的单个居民状态会跳过，不影响其余世界状态。

验证使用独立的 Windows Player，两次启动共用 `save-v2`，报告和日志位于 `E:\projects\AI斗兽场\.game-production\station-resident-save-w4p`：

- `qa-v2/resident-write.json`：六名居民已离开初始位置，写入成功；ChatGPT 位于 `(85, 0.08, -63.03)`，在第 6 段路上。
- `qa-v2/resident-read.json`：新进程从 primary 读取，六人的位置、路线阶段、方向和计数均与写入时一致；ChatGPT 继续向下一路点移动。
- `legacy-report/resident-legacy.json`：读取 W4P 原版 `world-v1.json`（无居民字段）成功，六名居民安全地从房间起点出发。
- `resident-cycle/resident-player.json`：9992 个 0.05 秒模拟步内六人均至少一次到达目的地并返回；路线地面支持、ChatGPT/Claude 间距、赛事选手唯一实例交接及公开答卷边界均通过。
- `tour-regression/tour.json` 与 `read.json`：原有四区漫游、货运/咖啡/温室状态及下一进程读档均通过。

旧的 `StationWorldSaveProbe` 货运 `write` 阶段在 W4P 场景失败；用改动前的 W4P Player 对照运行也得到同一失败，因此不能把它作为本次改动的通过证据。上述四区漫游探针覆盖当前场景的货运、咖啡、温室及读档回归。

此项仅保证已实现的居民路线不会因读档重置。现有咖啡厅居民仍然站立，真人键鼠体验、视觉质量和长时性能尚未据此验收。
