# v012 A1 咖啡厅材质与灯具 Windows 预览

独立 [Windows Player](../../../QuQuArena3D/BuildV012A1CafeMountedPreview/QuQuArena3D.exe)仅构建 `BlackHoleStationVisualSampleV012A1.unity`，包含橡木共享桌、三盏暖光以及两条灯体的上盖／吊索／固定座候选；默认发行入口与 W4P 场景未改。画面对照分别见[桌面](../station-v012-oak-table-a1-2026-09-29/README.md)、[灯光](../station-v012-cafe-bar-lights-a1-2026-09-29/README.md)及[安装结构](../station-v012-cafe-bar-mounts-a1-2026-09-29/README.md)。Player 预览位于项目忽略目录，不作为 Git 提交的二进制。

沿用已有的隔离构建项目 `E:/tmp/ququ-v012-a1-20260929`，从当前提交非删除式同步 11 个 A1 场景／材质／原始贴图及 `.meta` 文件；11/11 个 SHA-256 与工作区一致，隔离项目使用的 `ArenaFont.asset` 与 HEAD 相同，未带入工作区预存的字体脏改。源场景 SHA-256 为 `4AEC78A219BC3E9B301964FB0056B41C2C068478C41FB72970B77AB5EC099240`。

[Unity CLI 构建来源](build-provenance.json)记录 Unity `6000.3.24f1` 与 Windows 64 位包版本；构建方法报告 `Succeeded`、1 warning、0 error、约 7.15 秒。唯一构建警告仍是未设置可选 Pipeline Runtime 配置；CLI 还记录了一条 `LicensingClient has failed validation; ignoring`，但没有阻止构建。拷入项目预览目录的 189 个文件、391,172,609 字节与隔离构建原件逐文件哈希相同，[核对数据](validation.json)保留 Player EXE 与 `level0` 哈希。

本机以隐藏窗口、1280×720 和独立存档目录启动 Player，15 秒后进程仍在运行，随后停止。[启动日志](player-startup.log)显示 D3D11／RTX 5090、Input System 与 PhysX 初始化，未见运行异常；[隔离存档](isolated-save.json)记录 A1 场景、安全出生点 `(205, 0.06, -209)` 和咖啡厅 ID `east-lounge-cafe-01`。这证明当前候选能打包和启动；Player 内真人键鼠漫游、实际 Player 画面、帧时间与长期稳定性仍未验收。
