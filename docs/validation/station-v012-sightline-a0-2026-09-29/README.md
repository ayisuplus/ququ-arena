# v012 东南观景端：W4P 视线与独立护栏候选

日期：2026-09-29。目标是为“生活街入口 → 东南咖啡厅 → 短廊 → 黑洞观景台”找一个实际可看的接入位置，并先验证护栏不会挡住黑洞。真实空间参考与取舍见 [A0a 参考板](../station-free-components-a0-2026-09-29/real-reference-a0a.md)；本页截图均由当前 Unity 工程渲染，不是供应商预览或最终美术。

## 基线与方法

- 基线为 [W4P 场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationSouthGardenLoopW4P.unity)，Unity 6000.3.24f1／URP 17.3.0，编辑器 Edit 模式且场景未脏。咖啡厅约以 `(205, 0, -205)` 为中心，黑洞对象中心在 `(0, -145, 0)`。
- 复用现有 `Southeast lookout connector floor`：中心 `(190, -0.3, -229)`，渲染范围 `12 × 0.5 × 26 m`，即大致 `x=184…196, z=-242…-216`。从咖啡厅走到其西缘候选点约 28–36 m；这只是空间距离，尚未做真人路线计时。
- [取景脚本](../../../production/black-hole-station/component-a0b/capture_v012_sightlines.cs)用临时相机在眼高 `y=1.6 m` 朝黑洞中心拍摄，所有画面固定 65° FOV、1280×720。临时相机未保存进场景，取景后 W4P 和候选场景均保持 `dirty=false`。
- W4P 碰撞粗扫了 `x=155…225, z=-275…-175` 的 5 m 网格：181 个位置有地板命中，其中 5 个到黑洞中心的射线无遮挡；最近的可走候选为 `(185, 1.6, -225)`，离咖啡厅中心约 28.3 m。再在 `z=-225/-230/-235` 的连接段西缘以 0.25 m 横向步长检查，无遮挡站位只落在 `x=184…186`。这些射线是选址辅助，不能替代实际画面和行走测试。

## 画面结论

| 同一目标与机位 | 观察 |
| --- | --- |
| [W4P 西缘 `(184,-230)`](w4p-clear-edge.png) | 黑洞完整显露，但连接段西边没有护栏；此点后来会落在护栏外侧，不能作为可通行的最终站位。 |
| [W4P 内侧 `(186,-230)`](w4p-inboard-occluded.png) | 同一目标被近处楼板严重遮挡。观景带要靠近西缘，不能把整块连接平台都称为观景台。 |
| [护栏第一版 `(185,-225)`](trial-v1-frame-blocks.png) | 竖框压在黑洞中心，判为失败。已保留失败画面，调整竖框间距后复拍。 |
| [第二版玻璃内侧北端 `(184.5,-225)`](trial-v2-glass-north.png)、[中段 `(184.5,-230)`](trial-v2-glass-center.png)、[南端 `(184.5,-235)`](trial-v2-glass-south.png) | 三个站位跨越 10 m，黑洞主体均在玻璃后清晰可辨；现有透明材质令黑色中心偏蓝灰，反射与曝光尚未调。 |
| [第二版内侧 `(186,-230)`](trial-v2-inboard-occluded.png) | 后退约 1.5 m 后原楼板仍遮住黑洞大部。当前只支持沿窗纵向移动观看，不能宣称整个通道的横向视线合格。 |

## 独立场景的当前施工

[v012 A1 候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)由 W4P 复制而来，尚未加入发行入口。[初建脚本](../../../production/black-hole-station/component-a0b/build_v012_observation_glazing_trial.cs)与[窗框调整脚本](../../../production/black-hole-station/component-a0b/revise_v012_observation_glazing_trial.cs)记录了从第一版到第二版的变更；现存第二版在 `x=184.05, z=-216…-242` 有 5 片透明窗、6 根立柱、上下收边，共 13 个可碰撞构件，材质复用项目既有 `P3-pressure-window` 和 `P2-habitat-structural-gray`。从 `(184.5,1.6,-230)` 向西射线约 0.39 m 命中透明窗，向下命中原连接段地板。六个居民 `RoomId` 与咖啡 `StableId=east-lounge-cafe-01`、4 个座位在复制场景中仍存在。

这是**局部防坠与构图试验**。后续已在同一独立候选场景加入 [免费模块短廊转折试验](route-a1.md)、[西侧观景带透明顶棚试装](promenade-canopy-a1.md)和[咖啡厅—短廊门框上窗](portal-transom-a1.md)，并完成[独立 Windows 预览的构建与启动验证](player-preview-a1.md)；仍未形成密闭压力舱、完整建筑、正式材质或 Player 键鼠漫游，也没有性能或用户审美验收。新场景名会让 `StationWorldSave` 使用独立档案目录，不能把复制场景当作 W4P 进度的自动继承。后续应验证玻璃近看与反射、连续键鼠通行，再完成整段建筑语言；不改原 W4P 或默认发行入口。

[Barking Dog 免费主建筑包](../station-free-components-a0-2026-09-29/barking-dog-a0a.md)在本轮复查时仍未进入账户“我的资源”，因此这次独立护栏试验未假装使用该包，也没有以其他在线来源替代它。
