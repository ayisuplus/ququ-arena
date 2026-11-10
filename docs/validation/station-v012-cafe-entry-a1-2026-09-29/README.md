# v012 A1 咖啡厅西入口框架试装

本轮只改[隔离候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)。原西侧 6 m 开口在生活街视角几乎没有明确门洞边界，且从咖啡厅回看与室外连成一片。延续[咖啡厅全景窗收边记录](../station-v012-cafe-frame-a1-2026-09-29/README.md)中已查看的 SOM Moon Village、ESA Cupola 参考关系，使用现有明色围护、透明玻璃和铜色饰条，做一个入口可读性的局部试装；不把它称作经过验证的压力舱门。

[试装脚本](../../../production/black-hole-station/component-a0b/add_v012_cafe_west_entry_trial.cs)在现有咖啡对象下新增两根边柱、一道上方透明窗及其中梃、上下横梁。6 件均无 Collider，留出约 5.96 m 净宽、2.9 m 净高的中央通道；原地面、玻璃围护和业务组件未改。复用项目已有 `P3-cabin-warm-wall`、`P3-lounge-bronze-trim` 和 `P3-pressure-window` 材质；未导入新包。场景 SHA-256：`EAD03C3319BBE0F675A50F8F99F49633187051140BC43ACC859126A1C8CA8E6D`。

固定 70°、1280×720 第一人称机位对照：[街道看入口：前](before-street-to-cafe.png)／[后](after-street-to-cafe.png)，[咖啡厅向街道：前](before-cafe-to-street.png)／[后](after-cafe-to-street.png)。入口轮廓更清楚，桌椅和街景仍可见；这只是当前视觉判断，整体造型仍待用户认可。图像由[机位脚本](../../../production/black-hole-station/component-a0b/capture_v012_route_trial.cs)生成。

编辑模式路线的咖啡厅入口、街道及短廊没有新增障碍或地面缺口；唯一报告的起始障碍是原第一人称角色自身。Play 模式的 [CharacterController 记录](controller-route.json)显示咖啡厅至观景窗 10/10 段到达，侧向碰撞 0，最大水平终点误差 0.045 m。`StationCafeMoment.StableId=east-lounge-cafe-01` 与原 4 个座位仍在。场景原有 8,807 个序列化对象 ID 均保留，新增 26 个；当前 Unity Console ground truth 为 0 编译错误、0 控制台错误、0 警告。

该试装保留在 A1 候选场景。上方玻璃为视觉件，没有定义门的开闭或压力功能。现有 Windows Player 构建早于这次场景修改，尚不能用它验收这一入口；整段键鼠漫游、性能和审美认可仍是 A2 后续门槛。
