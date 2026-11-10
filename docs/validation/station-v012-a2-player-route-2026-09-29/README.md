# v012 A2 观景路线 Player 级画面与往返探针

[独立 Win64 Player](../../../QuQuArena3D/BuildV012A2RoutePreview/QuQuArena3D.exe)只打包 `BlackHoleStationVisualSampleV012A1.unity`。新增的[场景专用探针](../../../QuQuArena3D/Assets/Scripts/Validation/StationVisualSamplePlayerProbe.cs)仅在命令行明确给出 `--station-v012-visual-probe-output` 时运行；普通预览不会自动驱动玩家或退出。它沿现有控制器从咖啡厅起点走到短廊、西转角、悬挑观景窗，再沿原路返回，分别保存实际 Player 相机画面与逐段结果。

Unity 6000.3.24f1 的 Editor 重编译完成且无编译错误。将脚本及原始 `.meta` 定点同步到现有英文路径隔离构建副本，源和副本 SHA-256 一致；候选场景 SHA-256 仍为 `E5D191591F2BA661EB354F8C75F82F9986B230AB1253C9E440EA604C6AA610D5`。[构建来源](build-provenance.json)与[摘要](build-summary.txt)记录 Win64 `Succeeded`、0 个构建错误、1 个缺少可选 Pipeline Runtime 配置的构建警告，另有许可证服务访问令牌更新失败的环境日志。构建包为 189 个文件、391,598,363 字节；英文路径输出与项目预览目录全部 189 个文件逐个 SHA-256 相同，`level0` 哈希为 `199E91B48EC919865E4248888B30DE8C539F5829EFA1B8DEB0500D3AF0FD5AAC`。正式 Build Settings 与默认发行入口未改。

从项目预览目录本身，以 1280 × 720、隐藏窗口、全新隔离 QA 存档和输出目录运行探针。[逐段原始数据](route.json)显示 `complete=true`：34 段、侧碰 0、所有段都有地面支撑、最大水平误差 0.04494 m，最终返回 `(205, 0.08, -209)`。Player 报告识别到键盘、鼠标、第一人称视角、`east-lounge-cafe-01` 咖啡厅稳定 ID 与新存档；[Player 日志](player.log)无 `error`、`exception`、`missing`、`failed` 行。

实际 Player 相机画面：[咖啡厅起点](cafe.png)、[连接短廊窗口](connector-window.png)、[西转角](west-turn.png)、[观景窗前](observation-window.png)。观景窗能看到黑洞吸积盘；咖啡厅外与观景窗上方仍有大片浅色灰盒，玻璃与照明也未统一。这些画面证明当前机器上构建后的渲染结果，不代表用户审美认可。

本探针逐帧调用生产 `CharacterController.Move`，并确认键盘和鼠标设备存在；**它没有通过真实按键／鼠标输入驱动整段路线**，也没有取得持续帧率、内存或真人运动观看验收。此前工作区预存的 `ArenaFont.asset` 未提交改动仍未同步到隔离副本；Player 字体来自已提交 HEAD。完整 A2 样板与正式发行验收仍待完成。
