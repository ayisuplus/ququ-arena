# v012 A1 西侧观景带透明顶棚试装

日期：2026-09-29。施工只落在[独立候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)；原 W4P、正式发行入口、供应商模型和 GUID 均未改。现有观景玻璃在 `x=184.05, z=-216…-242`，原地板在 `x=184…196, z=-216…-242`；西转口到窗前 `x≈186,z=-222…-236` 原先没有顶面碰撞或视觉围护。[真实参考记录](../station-free-components-a0-2026-09-29/real-reference-a0a.md)里 ESA Cupola 的厚窗框及 Safdie Jewel 的透光网格顶棚用于判断“结构可读、天空不消失”的关系，未复制照片或原建筑形制。

[搭建脚本](../../../production/black-hole-station/component-a0b/add_v012_west_promenade_canopy_trial.cs)沿用免费 CC0 Quaternius Standard 的 `Platforms/Platform_Simple.fbx` 做 4 块 `4×4 m` 地面表层；原地板仍承担行走碰撞。上方在 `y≈3.03 m` 装 4 块项目既有透明窗材质顶片、5 根横肋、一根东侧纵梁和 3 根东侧细立柱，结构材质沿用项目既有灰色。整体为 17 个项目侧对象，其中顶片和梁柱有 13 个碰撞体。`(186,1.6,-230)` 向上射线约 1.38 m 命中顶片，东侧柱间仍有横向出入口。没有额外供应商脚本或玩法组件。按 Unity YAML 对象 fileID 比较本轮场景与提交前版本：新增 75 个对象块、移除 0 个，既有对象块只有场景根列表因增加试装根对象而变化。Git 的行级 `diff --check` 会把重新排序的旧居民组件空 `m_Name` 行报作新增尾随空格；该 fileID 在提交前内容完全相同，未为消除误报而改动旧对象。

先试过 4 块 Quaternius 不透明顶板；[弃选画面](promenade-opaque-rejected-turn-west.png)显示转角上方变成一整片压低星空的暗板，因此撤掉该试摆，保留地面表层并改成透明顶棚。同一[取景脚本](../../../production/black-hole-station/component-a0b/capture_v012_route_trial.cs)在 Edit 模式以 70° FOV、1280×720 固定机位拍摄：

| 机位 | 加顶棚前 | 透明顶棚后 | 观察 |
| --- | --- | --- | --- |
| 短廊西转 | [前](promenade-before-turn-west.png) | [后](promenade-after-turn-west.png) | 横肋和东侧纵梁给出可读的顶面边界，仍能透过顶片看星空；地面颜色与生活街还不统一。 |
| 窗前看黑洞 | [前](promenade-before-window-stop.png) | [后](promenade-after-window-stop.png) | 黑洞主体仍在画面中，新顶面没有切掉该构图；现有大平台和白盒骨架仍占据上半部。 |

上述视觉机位沿用旧脚本的 `x=184.5`，只用于同条件对照；安全行走终点仍是 `x=184.7`。Editor Play 模式复用现有 `CharacterController`：[咖啡厅到窗前](promenade-controller-route.json) 10 段完成，门框前沿有此前已记录的 4 次轻微侧向接触，无新增停顿或抬升；[窗前 5 m 南移加 10 m 北移](promenade-window-slide.json)完成且零侧碰；[观景带 `z=-230` 东西横穿往返](promenade-cross-controller.json)两段全部接地、零侧碰。后两项保持邻区通路。测试直接调用同一控制器的 `Move`，不是键盘输入。

最新[独立 Windows 预览](../../../QuQuArena3D/BuildV012A1CanopyPreview/QuQuArena3D.exe)只打包该候选场景。纯英文路径副本的 Unity 6000.3.24f1 构建报告 `Succeeded`，10.52 秒、1 warning、0 error；[provenance](promenade-canopy-player-provenance.json)记录 Unity CLI 和包版本。复制回项目的 188 个运行文件共 376,078,737 字节，与构建副本的文件数和总字节数相同；场景 SHA-256 为 `EF39979C416514DC0F8A72A3AAE5D1D7BB902D0528878A851357761767F798D8`，`QuQuArena3D_Data/level0` SHA-256 为 `D6140ECE74BBA11E8985953F7BC176F9F73B92FC087F6926E7243CCE9A71DBA1`。EXE 以隐藏窗口和独立 QA 存档运行 15 秒仍存活；[启动日志](promenade-player-startup.log)显示 D3D11 初始化且无 `error/exception/missing/failed`，新存档记录场景、起点 `(205,0.06,-209)`、咖啡厅 ID 和 6 位居民。正式 `EditorBuildSettings.asset` 仍只启用 `QuQuArena.unity`。

这是**顶面与地面局部试装**，东侧柱间和南北端仍开敞，透明片的厚度、反射、承重表达、接缝与密闭压力舱都未验收。整个咖啡厅—生活街—短廊仍有白盒与深色模块的断层；A1 的完整围护和主要陈设、Player 键鼠漫游、性能及审美认可继续待办。
