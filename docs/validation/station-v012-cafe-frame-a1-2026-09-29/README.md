# v012 A1 咖啡厅全景窗收边试装

本轮只修改[隔离候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)，不获取或导入新的组件库资源。场景原有北、东、西玻璃墙、南侧设备墙和透明屋顶都有实体围护；问题是 22 m 宽的玻璃面缺少可读的分格，从第一人称看像没有室内边界。

[SOM 的 Moon Village 研究与结构示意](https://www.som.com/research/moon-village/)显示明色刚性周边框与分段开窗的关系；[ESA Cupola 官方资料](https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/International_Space_Station/Cupola)记录铝制壳体与独立窗组件。这里只借鉴“可辨认的框架承托连续视野”的设计关系，不复制现实舱体尺寸，也不把本场景当成经过工程验证的压力结构。实际画面与项目原有银白外壳、暖色内装和深色地面核对；第三方图片没有进入游戏资产。

[装配脚本](../../../production/black-hole-station/component-a0b/add_v012_cafe_perimeter_frame_trial.cs)在北、东两面原玻璃内侧各添 3 根明色分格、0.72 m 低窗槛和 0.28 m 顶沿，复用现有 `P3-cabin-warm-wall` 与 `P3-lounge-bronze-trim` 材质。新 10 件均为无 Collider 的视觉件，原玻璃碰撞仍负责围护；西侧入口、南设备墙、咖啡业务对象及材质资产未改。场景 SHA-256 为 `DC6EDC78C5E69302EFCEA15264CB5EEE591792E79118DC84C74FF2DE7CCFECE9`。

70°、1280×720 的相同机位对照：[入口前](entry-before.png)／[入口后](entry-after.png)、[柜台前](counter-before.png)／[柜台后](counter-after.png)。收边使北、东墙与屋顶连接更清楚，窗外景观仍可见；柜台回看没有堵住通往生活街的方向。这是视觉判断，尚需用户对整体风格认可。

Unity Editor Play 模式的 [CharacterController 路线](controller-route.json)从咖啡厅到观景窗 10/10 段到达，咖啡厅内两段无侧向碰撞，最大水平终点误差约 0.045 m；街道入口的 4 次侧碰与上一轮相同。`StationCafeMoment.StableId=east-lounge-cafe-01` 和原 4 个座位仍在。YAML 对照中原有 8,744 个对象 ID 均保留，只新增 42 个序列化对象；原有对象只有咖啡厅父节点的子列表变化。当前 A1 其余陈设、近景材质和整段连续视觉还未完成，本次未更新 Windows Player 或声称 A2 性能通过。
