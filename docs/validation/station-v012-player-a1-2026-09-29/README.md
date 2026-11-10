# v012 A1 当前候选场景 Windows 预览

日期：2026-09-29。更新后的独立预览位于 [BuildV012A1CollisionPreview](../../../QuQuArena3D/BuildV012A1CollisionPreview/QuQuArena3D.exe)，仅打包 `BlackHoleStationVisualSampleV012A1.unity`。正式 Build Settings、默认发行入口和 W4P 场景未更改。本轮预览包含已提交的短廊局部补光 `8144bde` 与门框碰撞修复 `53fd716`，用于检查最新 A1 技术状态，不代表 A1/A2 完成。

因项目中文路径下批量构建曾在 Input System 链接阶段报 `Illegal byte sequence`，沿用既有纯英文副本 `E:/tmp/ququ-v012-a1-20260929`。本轮以非删除方式同步 `Assets` 与 `ProjectSettings` 的新增／变更文件；构建前源场景和副本场景 SHA-256 均为 `D9F0D473F68D202AA3E124ABFEBCACF35B2EFA2FD9EAB38FEEF02A1249D718D2`。副本保有以前遗留的一个无模型 `Props.meta`，未把它写回工作区。[Unity CLI provenance](build-provenance.json)记录 6000.3.24f1、StandaloneWindows64 和包版本。[专用构建方法](../../../QuQuArena3D/Assets/Editor/StationVisualSampleBuild.cs)只包含此候选场景，报告 `Build Finished, Result: Success`、`Succeeded`、1 warning、0 error，耗时 7.43 秒；警告为缺少可选的 Pipeline Runtime 配置。

构建产物复制到新的预览目录，源和目标各 **188 个文件、376,095,921 字节**；两边 `QuQuArena3D_Data/level0` SHA-256 同为 `CA96EAF87EE4E21E2EA531ADB5E84DC100C104FFAED48F4428AE81B2C9F14FFE`。本机用隐藏窗口、1280×720 和独立 `qa-save-a1-collision` 目录启动该 EXE，15 秒后进程仍存活，随后主动停止。[Player 日志](player-startup.log)记录 Unity、Input System、PhysX、D3D11／RTX 5090 初始化，没有 `error`、`exception`、`missing` 或 `failed`。隔离存档记录 `sceneId=BlackHoleStationVisualSampleV012A1`、安全位置 `(205, 0.06, -209)`、咖啡厅 ID `east-lounge-cafe-01`；未写入正式存档目录。

本地预先存在的 `ArenaFont.asset` 未提交改动仍保留在工作区。构建前同步时其源／副本 SHA-256 为 `FE20EC74130A8C7733228E3957230D0D233BFBB80D0FBAA61EC74DCD095CE137`，构建结束后副本变为 `E53E494FD6886048083EAA556F04BF23BA2ABDF96760A0EB32294EE426A81317`，源文件仍为前一哈希；因此这份 Player 不能用来断言工作区当前字体效果。

Editor Play 中的[门框修复行走记录](../station-v012-threshold-collision-a1-2026-09-29/README.md)已验证 10 段路线与两侧旁路侧碰为 0。本轮 Player 验证只证明打包、启动、输入／图形／物理初始化和初始存档；没有实际键鼠走完全程、Player 画面截图或帧率测量，视觉和性能门槛继续待验。
