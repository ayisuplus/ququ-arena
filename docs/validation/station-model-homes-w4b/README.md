# v010 W4B：W3V2 → 模型住宅候选的存档迁移

迁移只针对 `BlackHoleStationThreeDestinationsW3V2` → `BlackHoleStationModelHomesW4A`。W4A 首次启动且自己的主档、备份都不存在时，读取同一父目录下 W3V2 的主档；主档无效则尝试 W3V2 备份。原文件保持原样，恢复后立即写出场景 ID 为 W4A 的新档。只要 W4A 主档或备份已存在，就按原有 W4A 加载／回退规则处理，不回头用旧 W3V2 状态覆盖。

| W3V2 旧安全位置 | W4A 落点 | 理由 |
| --- | --- | --- |
| 旧玩家舱主层，`x∈(100,121), z∈(29,41)` | 东北港区公共抵达点 `(210,0.06,180)` | 旧舱已交给 DeepSeek，玩家没有家 |
| 西侧旧观测展厅主层，`x∈(-96,-68), z∈(50,74)` | 西侧住宅共享廊 `(-82,0.06,62)` | 旧公共展厅已分出模型房间 |
| 东侧 ChatGPT、Claude 房间主层 | 对应东侧公共廊 `(94,0.06,62)`／`(94,0.06,89)` | 不从模型私人房间恢复访客 |
| 其他位置 | 原坐标 | 仅在 W4A 的地板安全检查仍通过时保留；否则拒绝导入 |

位置映射只适用于主层约 `y=0` 的旧房间。导入前仍检查存档版本、原场景 ID、货运／温室／咖啡状态与安全落点。不能被验证的旧档会按当前规则从 W4A 的东北港区新生，而不会被错误地放入墙中或中心井。

验证使用两类来源：[可审计的合成 W3V2 进度档](fixtures/synthetic-w3-progress.json)同时含左货台完工、温室照料一次、咖啡一杯；[本轮 W3V2 Player 实际写出的档](authentic-w3/source-w3-save.json)含温室照料一次，未人为改动。九种隔离 Player 情形的[逐项结果](player-v2/case-summary.json)覆盖旧玩家舱、旧西侧展厅、ChatGPT／Claude 房间、可保留坐标、旧档备份、已有 W4A 档优先、无效源场景 ID 和迁移后重启；各进程退出码为 0，旧档哈希前后不变。导入后的[新场景副本](player-v2/old-home-migrated-save.json)保留三组进度，访客位置改到港区；[真实 W3V2 Player 存档导入结果](authentic-w3/authentic-w3.json)也通过。

全局存档组件改动后，另用当前代码构建 W3V2，完成[写档](w3-regression/write.json)与[另一个进程恢复](w3-regression/read.json)：植物进度保留，步行与档案交互通过。构建版本、二进制哈希和测试夹具哈希见[汇总](build-summary.json)。隔离测试目录及 Win64 二进制留在本机临时目录，Git 仅收录可复核的 JSON、日志和代码。

这不等于对所有历史存档的迁移：更早的 `BlackHoleStationObservatory`、W1、W2 等场景仍需单独来源映射，真实用户旧档未读取。赛事数据和模型自定义不属于 `StationWorldSave`，本轮未改；默认发行入口仍未切换。
