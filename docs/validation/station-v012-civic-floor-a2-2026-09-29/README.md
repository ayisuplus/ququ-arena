# v012 A2 咖啡厅窗外生活区地坪饰面候选

在[独立视觉样板场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)里，咖啡厅朝西的第一人称视野正对两块浅色灰盒地面：`Southeast civic life public floor` 与 `Southeast civic life outer-ring street floor`。两块地面占据窗外大面积亮区。参考已实际查看的 [Quaternius Standard 供应商预览](../../../production/black-hole-station/vendor/quaternius-modular-scifi-megakit-standard/Preview_2.png)中深色地板、浅色结构的层次，并复用项目已有 [V012CafeFloorPanelsTrial 材质](../../../QuQuArena3D/Assets/Station/Materials/V012CafeFloorPanelsTrial.mat)；没有新购资源或修改供应商原件。

固定 70°、1280 × 720 机位的[咖啡厅出口改前](before-cafe-exit.png)与[两块地坪同材质候选](selected-cafe-exit.png)显示窗外亮白地面收敛，室内外地坪连续。曾分别试过浅结构灰、只改公共区、公共区深炭色配环街结构灰；只改一块留下突兀矩形边界，浅灰仍偏亮。采用的[场景修改脚本](../../../production/black-hole-station/component-a0b/tune_v012_civic_life_floor_trial.cs)只替换这两个 MeshRenderer 的材质引用；Git 场景差异恰为两处引用，未动对象 ID、几何、碰撞、咖啡座位与稳定 ID。保存后场景 SHA-256 为 `1415CCED3CBFC63DB8E3234793CCCED6A225DAE5DE551CFE718B40B1074B3FFE`。

另外两条视觉试验留在此处作为弃选证据。[现有透明咖啡顶棚](roof-baseline-cafe.png)覆盖主要座位区；临时增加 [12 m 顶饰](roof-wide-rejected-cafe.png)并未改善常规视角的窗外构图，反而压暗地面，8 m 版本同样没有形成有效改善。[桌面原灯强度 24](table-light-24.png)提高到 [48](table-light-48-rejected.png)主要使桌面过曝，常规站位画面没有相称收益。顶饰和灯光改动均未写入场景，避免把失败试验当成成果。

用更新后的场景构建[隔离 Win64 Player](../../../QuQuArena3D/BuildV012A2CivicFloorPreview/QuQuArena3D.exe)：Unity 6000.3.24f1 构建 `Succeeded`，0 个构建错误、1 个缺少可选 Pipeline Runtime 配置的警告；许可证令牌更新失败见构建环境日志，但未阻止构建。源构建包与项目预览包的 188 个文件逐个 SHA-256 一致，共 391,260,039 字节；`level0` SHA-256 为 `693073ACEBB65179B2C564EC2401B9CC27F0A5E3A0231638F818127976612D92`。来源见[构建清单](build-provenance.json)和[摘要](build-summary.txt)。正式 Build Settings 与默认发行入口未变。

在项目预览包中以 RTX 5090／Direct3D 11、1280 × 720、隐藏窗口及全新隔离 QA 存档运行。实际 [Player 咖啡厅画面](player-cafe.png)可与[前一版本 Player 画面](../station-v012-a2-player-route-2026-09-29/cafe.png)直接对照。[逐段结果](route.json)为 `complete=true`：34 段往返、侧碰 0、所有段有地面支撑、最大水平误差 0.04494 m；检测到键盘、鼠标、第一人称及原咖啡厅 ID `east-lounge-cafe-01`。[Player 日志](player.log)无 error/exception/missing/failed 行。该探针通过现有 CharacterController 逐帧行走，仍不是人工键鼠操控、连续帧率或用户审美验收。

窗外浅色构件、玻璃与灯光层次仍有明显灰盒感。当前是 A2 的局部材质候选与 Player 验证，不代表完整视觉样板已定稿；下一步继续处理咖啡厅到观景端的整体结构与照明，再做真人运动观看和目标硬件性能验收。
