# v012 A1 独立 Windows 预览

日期：2026-09-29。此预览只用于检查东南咖啡厅至观景短廊的候选场景，正式发行入口和 W4P 场景未变。候选场景的第一人称访客改从咖啡厅走道 `(205, 0.06, -209)` 面向西侧出口出发；[设定脚本](../../../production/black-hole-station/component-a0b/set_v012_review_spawn.cs)在 Edit 模式确认角色胶囊无重叠、脚下有地板后保存。场景 diff 仅改角色位置、朝向和相机俯仰 3 行。原正式出生点 `(210, 0.06, 180)` 仍留在 W4P。

[预览程序](../../../QuQuArena3D/BuildV012A1PreviewVerified/QuQuArena3D.exe)位于独立的 `BuildV012A1PreviewVerified` 目录，必须保留同目录 `QuQuArena3D_Data`、`MonoBleedingEdge`、`D3D12` 和 `UnityPlayer.dll`。EXE SHA-256 为 `E1A9D9E062BBCDB91F76983FAE8BB1E4FB8036D55289318EF91033F130D38ECC`；候选场景 SHA-256 为 `3FA7A26D3E095B14A9FAFDA375CF0BF19B4889E23A9E60EF18EFED635689F110`。构建命令如下，`-buildOutput` 由 Unity CLI 从 `--output-path` 转发给[专用构建方法](../../../QuQuArena3D/Assets/Editor/StationVisualSampleBuild.cs)：

```powershell
unity build 'E:\tmp\ququ-v012-a1-20260929' --target StandaloneWindows64 --execute-method StationVisualSampleBuild.Build --output-path 'E:\tmp\ququ-v012-a1-20260929\Build\QuQuArena3D.exe' --log-file 'E:\tmp\ququ-v012-a1-20260929\build.log' --no-tail --timeout 1800
```

构建副本只包含原工程的 `Assets`、`Packages`、`ProjectSettings`，候选场景和构建方法与原工程 SHA-256 一致。副本也包含工作区事先存在、未纳入本轮提交的 `ArenaFont.asset` 改动；其构建时 SHA-256 为 `E53E494FD6886048083EAA556F04BF23BA2ABDF96760A0EB32294EE426A81317`，本轮未修改该文件。必须从纯英文路径启动 Unity 6000.3.24f1 的批量构建：在原中文项目路径直接构建时，Input System 的链接配置生成于 `Assembly.GetName` 抛出 `Illegal byte sequence`，报告为 Failed；仓库过去的构建也记录了相同限制。英文副本的构建报告为 **Succeeded，75.59 秒，2 个 warning、0 个 error**；[Unity CLI provenance](player-preview-a1-provenance.json)记录了版本、包和输出。仅打包 `BlackHoleStationVisualSampleV012A1.unity`，正式 `EditorBuildSettings.asset` 仍只启用 `QuQuArena.unity`。复制回来的程序有 188 个运行文件，总计 376,068,817 字节，与英文副本逐项文件数及总字节数相同；没有复制 `_DoNotShip` 调试目录。

对复制回来的 EXE 用隐藏窗口、1280×720、独立 `--station-world-save-dir E:\tmp\ququ-v012-a1-20260929\qa-save` 启动 20 秒。进程存活，Player 日志显示 Unity、Input System、PhysX 和 D3D11/RTX 5090 已初始化，未出现 `error`、`exception`、`missing` 或 `failed`；新存档 `sceneId=BlackHoleStationVisualSampleV012A1`，`safePosition=(205, 0.06, -209)`，咖啡厅 ID 为 `east-lounge-cafe-01`，并保有 6 位居民、2 个货运位及温室 ID。测试进程随后停止，QA 存档没有写入正式档案目录。编辑器 Play 模式另拍摄[咖啡厅走道第一人称画面](player-review-start-a1.png)：为避开编辑器旧测试档自动恢复到窗前，截图前临时关闭该次运行的保存组件并把角色移回预览起点；截图是运行时相机画面，不是 Player 窗口截图。

本轮确认独立 Player 能启动并使用安全起点。键鼠连续漫游、帧率、玻璃近看以及美术品质尚未验收；画面仍以白盒结构为主，短廊没有完整围护，不能视为 A1 完成或 A2 视觉样板。下一步应完成墙、顶、地与生活街的接缝，再以 Player 键鼠从咖啡厅走到窗前，比较固定机位和性能。
