# v012 A1 咖啡厅共用桌试装

本轮只改隔离候选场景 `BlackHoleStationVisualSampleV012A1.unity`。试装前的共用桌只有悬空桌板；在相同 70°、1280×720 第一人称机位中，[入口视角改前](table-before-entry.png)与[改后](table-after-entry.png)、[柜台视角改前](table-before-counter.png)与[改后](table-after-counter.png)显示桌面下方已有落地支撑。

支撑复用项目已导入的 [Kenney Space Station Kit `table.fbx`](../../../QuQuArena3D/Assets/ThirdParty/KenneySpaceStationKit/Models/table.fbx)。[A0 来源和 CC0 记录](../station-free-components-a0-2026-09-29/README.md)仍适用；这里仅试用桌架几何，覆盖为现有 `P3-lounge-warm-charcoal` 材质，保留原共用桌面与碰撞。Kenney 原配色的放大桌子偏玩具感，本轮没有采用原配色，也没有将该包升级为样板主建筑语言。新增桌架可见范围为 `2.8 × 0.69 × 2.0 m`，配有同范围的实体碰撞盒。

候选场景通过 [装配脚本](../../../production/black-hole-station/component-a0b/add_v012_cafe_table_trial.cs)在运行中的 Unity Editor 保存。场景差异为新增预制体、材质覆盖和碰撞盒，共 108 行新增、零删除；原有对象引用未改写。`StationCafeMoment.StableId=east-lounge-cafe-01`，四个原座位仍在，桌面渲染与原碰撞均启用；每个座位锚点距新增支撑表面约 2.56 m。Play 模式 [CharacterController 连续路线](controller-route.json)从咖啡厅到观景窗 10/10 段到达且逐步落地，咖啡厅内两段没有侧向碰撞；街道入口有原有的四次轻微侧碰，但未阻断路线。此验证没有模拟真人逐个按 E 入座。

更新后的独立 Windows [预览程序](../../../QuQuArena3D/BuildV012A1CafePreview/QuQuArena3D.exe)从与当前场景 SHA-256 相同的英文路径工程构建，日志为 `Build Finished, Result: Success`，Unity 报告 `Succeeded, warnings=1, errors=0`；一条警告是未配置可选的 Pipeline Runtime 资产。在隐藏窗口和独立 QA 存档目录启动 15 秒后进程仍存活，日志确认 Input System、PhysX、D3D11 初始化；QA 存档包含本候选场景、同一咖啡厅 ID、两处货运位、六位居民和 `(205, 0.06, -209)` 预览起点。构建与启动的散列及范围见 [Player 验证记录](player-smoke.json)。

这是一处 A1 家具补件，咖啡厅其余墙面、赛况屏、设备和灯光仍需要统一美术；A1 全段样板、A2–A5 与审美确认未完成。Asset Store 当前已登录且能浏览，但账号“我的资源”为空，`3D Free Modular Kit` 的入库操作未成功，因此本试装不依赖该包。
