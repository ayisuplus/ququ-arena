# v012 A2 咖啡厅赛事屏 2560 × 1440 Player 性能实测

对[独立视觉样板](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)的[赛事屏修复](../station-v012-broadcast-player-fix-2026-09-29/README.md)做同机位成本和持续运行测量。仅在带 `--station-v012-performance-output` 与 `--station-v012-performance-seconds` 的隔离 Player 中运行[探针](../../../QuQuArena3D/Assets/Scripts/Validation/StationVisualSamplePerformanceProbe.cs)；普通游戏启动没有探针行为。场景文件 SHA-256 仍为 `1415CCED3CBFC63DB8E3234793CCCED6A225DAE5DE551CFE718B40B1074B3FFE`，没有改变默认发行入口。

Unity 6000.3.24f1 将候选场景构建为独立 Win64 Player，构建 `Succeeded`，0 错误、1 个缺少可选 Pipeline Runtime 配置的警告；[构建来源](build-provenance.json)已保存。探针源码与 ASCII 隔离构建工程中的副本 SHA-256 均为 `E445866D44AAEDC1D35FD4F9591A3AD08A8AD3DC7ABE0485353B921E498E4172`。在**可见窗口**运行，RTX 5090／Direct3D 11、PC 画质、2560 × 1440、关闭 VSync、无帧率上限。主视角固定于 `(205, 1.69, -205)`，距赛事屏中心约 10.08 m；这是静止视角，且显示的是待赛画面。使用全新隔离 QA 存档，不改变用户存档。早先隐藏窗口诊断没有 GPU 帧时间且得到不可信的亚毫秒空载数据，未纳入结果。

在同一机位分别关闭、开启 `StationLoungeBroadcast` 各 10 秒，并让开启状态持续 30 分钟。逐帧记录总帧时间及 Unity `FrameTimingManager` 可用的 CPU/GPU 时间；URP 摄像机渲染回调分别计数主摄像机和转播摄像机，避免把未渲染的隐藏窗口误作性能通过。每分钟落盘一次，[完整原始汇总](performance.json)有 32 个窗口并标为 `complete=true`，[Player 日志](player.log)没有 error／exception／missing／failed 行。

| 同机位 10 秒 | 总帧平均 / P99 | GPU 平均 / P99 | 主摄像机 / 转播摄像机渲染次数 |
| --- | ---: | ---: | ---: |
| 转播关闭 | 0.627 / 1.371 ms | 0.527 / 1.286 ms | 15,954 / 0 |
| 转播开启 | 0.995 / 1.779 ms | 0.952 / 1.657 ms | 10,051 / 10,051 |

赛事屏开启确实带来额外渲染成本；在这台电脑、这一场景和机位下，总帧平均约增加 0.37 ms，GPU 平均约增加 0.42 ms。这是无帧率上限的同机位比较，不外推为不同机器的固定成本。

30 个持续窗口共 `1800.016` 秒、`1,727,668` 帧，主摄像机与转播摄像机均各渲染 `1,727,668` 次。[逐分钟趋势图](performance-trend.png)显示总帧 P99 范围 `1.740–2.594 ms`，首分钟 `1.765 ms`、末分钟 `1.815 ms`；GPU P99 范围 `1.640–2.774 ms`。第 20 和 23 分钟的较慢窗口随后回落，未呈持续恶化。Unity 已分配内存范围 `187.746–187.886 MiB`、首末 `187.775 / 187.842 MiB`；已保留内存 `262.574 MiB` 不变。`301 / 1,727,668` 帧超过 16.67 ms（约 `0.0174%`），最慢单帧 `134.48 ms`，因此不能声称完全无卡顿。GPU 时间中有 41 个明显无效的超大读数（≥1000 ms），探针单独计数并排除出 GPU 分布；总帧时间没有因此被过滤。

这些数据证明 RTX 5090 上这个固定咖啡厅视角的转播画面在 30 分钟内有明显的 60 FPS 帧时间余量，且 Unity 内存未见累积增长。没有完成移动中的 2560 × 1440 全路线测试、真实进行中的比赛、逐分钟进程工作集／显存记录，也没有替代真人键鼠和用户审美验收。后续仍需按 v012 A2 对整段行走和复杂画面测量，再决定样板是否通过。
