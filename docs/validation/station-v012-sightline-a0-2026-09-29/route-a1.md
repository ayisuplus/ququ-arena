# v012 A1 咖啡厅—观景窗短廊试验

日期：2026-09-29。施工范围仅为 [v012 A1 独立候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)。假设访客从东南咖啡厅的现有西侧出口进入生活街，向南经过约 8 m 的短廊，再向西转至原连接平台的观景窗。先复用已导入、免费 CC0 的 [Quaternius 模块](../station-free-components-a0-2026-09-29/quaternius-a0b.md)验证比例与路线；Barking Dog 包尚未进入 Unity 账号“我的资源”，因此本试验没有使用或替代它。

## 场景变更

[搭建脚本](../../../production/black-hole-station/component-a0b/add_v012_quaternius_turn_trial.cs)只在干净的独立场景运行，保存了 `V012 A1 modular turn trial` 根对象。它实例化 2 块 Quaternius 地面、2 块顶面、4 块墙面，并在候选场景内为墙加 4 个 BoxCollider；供应商 FBX、材质、GUID 与原 W4P 场景未修改。原 W4P 地面承重，新增模型地板仅作表面试摆；屋顶也是零厚度模型，不能视为密闭舱结构。短廊西侧故意留出转向观景窗的开口，南端墙引导访客向西转。

## 路线与画面

[静态路线探针](../../../production/black-hole-station/component-a0b/analyze_v012_cafe_to_window_route.cs)从咖啡厅中心 `(205,-205)` 绕过现有座位，经西门、生活街、短廊到窗前 `(184.7,-230)`；11 个停点、10 段折线约 49.22 m。探针用半径 0.30 m 的站立胶囊检查障碍物，用每 0.5 m 的向下射线检查地板。原 W4P 与 A1 候选均无停点站立障碍、段间胶囊阻挡或地板缺口；[W4P](route-probe-w4p.json)和[A1](route-probe-a1.json)的静态检测结果记录全部坐标。`StationGrayboxWalker` 的实际半径为 0.32 m，故静态探针只能作初筛。

下列画面由 [取景脚本](../../../production/black-hole-station/component-a0b/capture_v012_route_trial.cs)在 Edit 模式以眼高 1.6 m、70° FOV、1280×720 截取，临时相机没有保存进场景：

| 机位 | 观察 |
| --- | --- |
| [咖啡厅走道](route-cafe-to-door.png) | 现有座位留在原位，去西门的路线需要绕过座位。 |
| [生活街看短廊](route-street-to-corridor.png) | 模块化入口体量成立，但深色工业风模块和现有浅色白盒结构衔接生硬。 |
| [短廊内](route-corridor-inside.png) | 墙、顶和终端墙让访客看见西转提示；西侧仍向观景平台敞开，未形成完整室内围护。 |
| [转角向西](route-turn-west.png) | 能看见原平台护栏与玻璃；此朝向尚未把黑洞作为视觉中心。 |
| [转出短廊](route-black-hole-reveal.png) | 黑洞只从楼板边缘露出一部分，不能把转角称为合格主观景点。 |
| [窗前停点](route-window-stop.png) | 黑洞中心及吸积盘可见；上方仍被既有楼板与构架压住，西缘观景带比整个平台更适合作为正式站位。 |

上表截图保留初版 `x=184.5` 站位的视觉证据。Unity Play 模式下用现有 `StationGrayboxWalker` 的 `CharacterController` 连续移动时，该站位会踩上 `Window sill` 碰撞体：角色脚点从约 `y=0.08` 抬到 `y=0.269`。窗台最高 `y=0.30`，玩家控制器的 `stepOffset=0.30`，静态半径 0.30 m 的探针漏掉了这个接触。路线终点内移 0.20 m 至 `x=184.7` 后，原控制器半径 0.32 m、高 1.8 m 连续走完 10 段、492 个 0.1 m 步，全部接地且没有侧向碰撞；[控制器检测结果](route-controller-a1.json)记录了逐段终点。沿同一 `x=184.7` 窗带向南 5 m、再向北 10 m，另有 [150 步侧移结果](route-window-slide-a1.json)，高度始终约 `y=0.08`，没有侧向碰撞。[运行中的角色相机画面](route-player-window-stop.png)确认内移后的站位仍能看到黑洞。

这轮确认了**约 49 m 路线在 Editor Play 模式下可由项目现有角色碰撞体连续通过**，以及窗前 10 m 侧移带的平地碰撞；上述控制器结果取于**加门框之前**的候选场景。后续入口[免费门框试装](threshold-a1.md)改变了入口碰撞，另有独立复测记录。测试脚本暂时禁用 `StationGrayboxWalker.Update` 并直接调用同一 `CharacterController.Move`，因此仍需实际键鼠输入与独立 Windows Player 漫游。压力舱封闭、建筑材质一致性、反射、运行性能与用户审美亦未验收。接下来应检查近看接缝与实际输入，再决定模块是否保留及如何统一建筑语言；门、墙、地、顶和生活街的整体衔接完成后，才能称作 v012 A1 完成。
