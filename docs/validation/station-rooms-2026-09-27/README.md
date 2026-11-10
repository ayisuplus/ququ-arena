# P3 东侧居住舱样板：玩家房与两间角色房

日期：2026-09-27。对象：独立场景 `QuQuArena3D/Assets/Station/Scenes/BlackHoleStationLive.unity` 的 LOC-02 东侧居住区。本轮把原有三间 16 × 15 m 灰盒里的占位陈设，改成各自 8 × 5 m（40 m²）的居住模块；保留灰盒外侧供后续走廊、门和设备深化。每间有卧铺、储物、工作台、现有座椅和灯。玩家房有纪念品位；ChatGPT 房采用已有角色的淡紫色与图表位；Claude 房采用暖橙色与阅读架。三间朝东的窗保留碰撞围护。当前门洞未安装门扇，不能称为完整密闭舱室。

## 依据与资产

- [NASA Scott Kelly 舱室实拍](https://www.nasa.gov/image-article/scott-kellys-living-quarters/)和 [ESA Thomas Pesquet 舱室实拍](https://www.esa.int/ESA_Multimedia/Images/2021/05/Thomas_Pesquet_in_crew_quarter/)用于核对私密睡眠、工作和个人物品的功能组合；只借鉴用途，没有复制照片、宣称满足航天居住标准或引入外部媒体。
- 角色身份和配色来自工程的 `ArenaModelPresets.cs` 及现有头像。头像原图由用户提供，来源和限制见[模型角色预设验证](../model-presets-v01/README.md)。**房间的稳定居民 ID 与比赛模型配置 ID 分离**：外观预设可重新分配给任意参赛模型，不把当前 API 模型名作为房间主键。
- 座椅复用 `Assets/Resources/Art/PropsV29/Seat.prefab`；基础材质复用 `Assets/Art/ObservatoryV13`；东侧透明压窗沿用 `P3-pressure-window.mat`。新增两套角色强调色与头像材质，不修改源头像或旧场馆资产。
- 对照施工方案指定的[当前总览 IMG-001 v003](../../黑洞空间站升级方案/08_概念图/IMG-001_空间站总览_v003.png)与[生活区 IMG-003](../../黑洞空间站升级方案/08_概念图/IMG-003_生活区与观景咖啡厅_v001.png)：保留东侧外缘居住区、朝外分段窗和向内开门的布局；将冷白舱室改为暖米色墙、暖色照明、金色顶线及门框。概念图里的公共区绿植、织物、设备细节和黑洞景观尚未在这三间房的视角实现，不能把本轮灰盒称为概念图效果达成。

| 房间 ID | 居民 ID | 区别 |
| --- | --- | --- |
| `room/player/001` | 留空，待玩家档案绑定 | 冰蓝饰条、纪念品位 |
| `room/resident/chatgpt` | `resident/chatgpt` | 淡紫饰条、图表位、原有 ChatGPT 头像 |
| `room/resident/claude` | `resident/claude` | 暖橙饰条、阅读架、原有 Claude 头像 |

版本 `P3-LOC02-SAMPLE-001`／v001。场景 SHA-256：`e6c06097d068eff5d9133bcb927cf51e6f90936057a9275a5efb50dfc1f7e081`；组件 `StationRoomIdentity.cs`：`b6418e859075122a099ff9dc2b53faf4718645f6e571f266c76aad796898dcc6`；暖墙材质 `P3-cabin-warm-wall.mat`：`ef7e5202171a32102d1594ceac5ac3ad11cff53d98248591372c1d3c55013731`。ChatGPT／Claude 源头像 SHA-256 分别为 `f59121d5782e7d9c48f982baf7d221257c76070808ac3ea648144794d903e34d`／`e33f13b06d7d327ccd6cf573a5ee974500415a318e2c53a5422dfcc027b4d184`。施工复现脚本为 `production/black-hole-station/furnish_station_rooms.cs`，只适用于原始灰盒场景一次构建；当前场景已构建，不能在其上重复运行。

## 验证

| 检查 | 结果 |
| --- | --- |
| Unity 编译、保存与重开 | Unity 6000.3.24f1 的 `recompile_status` 为 completed、failed=false、无错误。场景从磁盘重开后无未保存改动；有且仅有 3 个不同房间 ID、两张不同居民 ID、3 个带碰撞的东侧窗段；各房均有暖墙材质、2 个门框侧边和 2 个窗竖框；两张头像朝向房内。 |
| 步行与围护 | 编辑器 Play 模式下，玩家 `CharacterController.Move` 分别沿 Z=35／62／89，从 X=97 到 X=117，各 100 步 × 0.2 m，受阻步数均为 0。由窗内向东射线分别命中 `East pressure window 1/3/5`；中央井向下 30 m 射线命中 0。座椅初版挡住中心路，移位后复测通过。 |
| 实景目视 | 编辑器 Play 模式、玩家眼高 1600 × 900 截图：[玩家房](player-room.png)、[ChatGPT 房](chatgpt-room.png)、[Claude 房](claude-room.png)、[走廊看房间入口](corridor-room-entry.png)、[ChatGPT 肖像](chatgpt-portrait.png)、[Claude 肖像](claude-portrait.png)。初版肖像背面朝房内，翻转并保存后两张均可见。 |

这是 P3 的房间结构和身份样板。门扇与门牌、个人纪念物、工作台设备、声音、房间 UI、居民日程与存档均未完成；没有生成第二套角色实体。已核查编辑器 Play 视角，尚无 Windows Player 实景验收，也未完成 P3 整体视听样板。
