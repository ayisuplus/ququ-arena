# v010 W4C：东北港区至核心东轴公共入口

W4A 的访客能从港区走到东轴尽头，但核心东墙在 `(120, 0, 0)` 挡住直行；[修建前的碰撞审计](../station-port-core-w4c/route-audit.json)记录了这一断点。W4C 从 W4A 复制独立候选场景，在原东墙分段开一处可操作的公共门，保留墙外南北绕行通道。门默认关闭，第一人称靠近按 `E` 开关；玩家位于门洞内时不能关门。它是单门灰盒入口，**不是已完成的压差气闸或完整外围压力围护**。

[Editor Play 路线结果](editor-route-results.json)验证：访客从东北港区至东门 265 m；开门后经避让原有结构柱的公共路线，继续 70 m 到竞技场一侧；门外南北绕行 40 m 不被截断，关门能阻挡进入，六名大模型居民仍在场。编辑器结果不能替代独立 Player；同一源码构建的 Win64 候选已跑[跨进程结果](player/w4c-fresh.json)：从港区经门进入核心，累计 336 m，并在核心公共地板保存；[重启](player/w4c-read.json)恢复 `(60, 0.08, 6)`。门洞另挂通用不可存档区域，Player 在敞开的门洞中心尝试保存时确认没有把该点写为重启位置。这是程序控制的碰撞路径，真人键鼠、可读导视和正式视觉仍未验收。

新场景存档优先级为 **W4C 自己的主档／备份 → W4A 主档／备份 → 仅在 W4A 文件完全不存在时尝试 W3V2 主档／备份 → 新访客**。旧档只读，首次导入立即写出 W4C 场景档。实测 [W4A 进度导入](player/w4c-migrate-w4a.json)、[无 W4A 时的 W3V2 导入](player/w4c-migrate-w3.json)、[W4A 损坏时不越级采用 W3V2](player/w4c-invalid-w4a.json)以及[已有 W4C 档压过两个旧来源](player/w4c-priority.json)；旧源哈希前后不变。进度夹具包含左货台完工、一次温室照料和一杯咖啡，导入后的[W4A 来源快照](player/w4a-imported-world.json)与[W3 来源快照](player/w3-imported-world.json)可查。

由于修改了通用 `StationWorldSave`，同一源码还重新构建 W4A 和 W3V2，分别完成 [W4A 写入](player/w4a-regression-write.json)／[恢复](player/w4a-regression-read.json)及 [W3V2 写入](player/w3-regression-write.json)／[恢复](player/w3-regression-read.json)。十个 Player 进程退出码为 0；场景数据哈希、Unity 版本与来源夹具哈希记录在[构建汇总](build-summary.json)，逐次 Player 日志在 `player/`。构建二进制仅保留在本机隔离临时目录，没有替换发行入口。

W4C 只修通一处核心公共入口。它不证明四个核心出口、四区内容密度、外围密封、黑洞视线、实际赛事、默认发行或真人 30 分钟游玩。后续扩建应保留这条港区—核心路和门外绕行；新增区块采用稳定身份并为新场景存档增加明确迁移，不能直接以场景改名让既有 W4C 用户回到出生点。
