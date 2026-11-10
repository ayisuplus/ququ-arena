# v012 A1 家具候选 Windows 预览

独立 [Windows Player](../../../QuQuArena3D/BuildV012A1FurnishedPreview/QuQuArena3D.exe)仅包含 `BlackHoleStationVisualSampleV012A1.unity`，含咖啡服务推车与四把扶手椅候选；默认发行入口、W4P 场景和正式 Build Settings 未改。候选近景与前后对照见[推车](../station-v012-coffee-cart-a1-2026-09-29/README.md)及[四座椅](../station-v012-armchairs-a1-2026-09-29/README.md)。

沿用已存在的英文路径构建副本 `E:/tmp/ququ-v012-a1-20260929`，非删除式同步 `Assets`、`ProjectSettings`、`Packages`；同步了 54 个新／变更文件、24,530,202 字节。源与副本 A1 场景 SHA-256 同为 `7F10B82A85146EF3B62AB3831E04239BFCF2CCF6D57823967047CF23D97C6FDB`。原工作区预先存在的 `ArenaFont.asset` 未提交修改仍保留；副本使用 HEAD 字体，二者哈希差异见[核对数据](validation.json)，所以此 Player 不用于判断当前工作区字体效果。

[Unity CLI 构建来源](build-provenance.json)记录 Unity `6000.3.24f1`、Windows 64 位及包版本。[专用构建方法](../../../QuQuArena3D/Assets/Editor/StationVisualSampleBuild.cs)报告 `Succeeded`、1 warning、0 error、约 6.94 秒；唯一构建警告是未设置可选 Pipeline Runtime 配置。复制前后各 189 个文件、382,774,937 字节，`QuQuArena3D_Data/level0` SHA-256 均为 `F61A9D8109628386DB31B8054C6968EAA0BFA34B66E9228A4873483D1105B11C`。

在本机以隐藏窗口、1280×720 和独立存档目录启动该 Player，15 秒后进程仍运行，随后停止。[启动日志](player-startup.log)显示 Unity、Input System、PhysX、D3D11／RTX 5090 初始化，未见运行错误；[隔离存档](isolated-save.json)记录 A1 场景、安全出生点 `(205, 0.06, -209)` 和咖啡厅 ID `east-lounge-cafe-01`。这只验证打包与启动；尚未进行 Player 内的真人键鼠漫游、游戏画面采集、帧时间或长期稳定性测试。
