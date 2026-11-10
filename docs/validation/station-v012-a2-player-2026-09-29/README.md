# v012 A2 当前观景路线 Win64 预览

[本机独立 Player](../../../QuQuArena3D/BuildV012A2OuterPreview/QuQuArena3D.exe)包含已提交的观景端、L 形连接廊与深色外平台候选，专用 [Build 方法](../../../QuQuArena3D/Assets/Editor/StationVisualSampleBuild.cs)只打包 `BlackHoleStationVisualSampleV012A1.unity`。正式 Build Settings、W4P 场景及默认发行入口未更改。

为避开项目中文路径下曾出现的 Input System 链接失败，沿用既有英文路径隔离副本 `E:/tmp/ququ-v012-a1-20260929`。从 `ae0fe48` 以后提交的资源差异只有 7 个场景／模型／材质及 `.meta` 文件，本轮全部定点同步并核对 SHA-256；源和副本场景同为 `E5D191591F2BA661EB354F8C75F82F9986B230AB1253C9E440EA604C6AA610D5`。另外对 2,144 个已跟踪的 `Assets`、`Packages`、`ProjectSettings` 文件做逐文件哈希核对，均一致；4 个性能测试框架生成的 JSON／`.meta` 在批量构建结束后的副本中不存在，不属于游戏资源。预存的 `ArenaFont.asset` 工作区脏改未同步，副本字体与已提交 HEAD 一致，不能以此 Player 判断那份未提交字体效果。

[构建来源](build-provenance.json)与[构建摘要](build-summary.txt)记录 Unity 6000.3.24f1、`StandaloneWindows64`、`Succeeded`、1 个可选 Pipeline Runtime 配置警告、0 个构建错误，耗时 7.18 秒。包内 188 个文件共 391,255,089 字节；隔离副本输出与项目预览目录的 188 个文件逐个 SHA-256 相同，`level0` 哈希为 `A0E3EE797FE588CE864EF2ACE30C8FF95AD1D0CA3DE962536981353166FCEC07`。

从项目预览目录本身用隐藏窗口、1280 × 720 和新建的隔离 QA 存档目录启动 EXE；15 秒后进程仍存活，随后主动停止。[Player 日志](player-startup.log)显示 Unity、Input System、PhysX、D3D11／RTX 5090 初始化，没有 `error`、`exception`、`missing` 或 `failed` 行。QA 存档记录场景 ID `BlackHoleStationVisualSampleV012A1`、安全位置 `(205, 0.06, -209)` 和咖啡厅稳定 ID `east-lounge-cafe-01`；[结构化结果](validation.json)可供复核。

这证明当前候选可以构建、复制并从项目路径启动。没有取得 Player 内实际运动画面、真人键鼠全程漫游或帧率／内存数据；此前 Editor 控制器路线与离屏画面不能替代这些 A2 验收项，用户审美认可也未发生。
