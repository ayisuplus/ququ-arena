# W4H 东南生活街局部样板

W4H 从 W4G 四区候选复制场景，保留咖啡厅、下层观景、外环和核心入口。在东南公共地面上，用可进入的赛事亭替换原 12 × 12 × 8 m 实心“未来目的地”占位块；亭内复用现有赛事连接状态导览，咖啡厅西侧步道增加透明顶棚和局部玻璃侧面，两个停留点通过一条有转折的公共路线相连。新场景为 [`BlackHoleStationLifeStreetW4H.unity`](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationLifeStreetW4H.unity)，生成步骤见 [`StationSoutheastLifeBuild.cs`](../../../QuQuArena3D/Assets/Editor/StationSoutheastLifeBuild.cs)。W4G 源场景未改动。

空间关系参考 [Safdie Architects 的 Jewel Changi Airport](https://www.safdiearchitects.com/projects/jewel-changi-airport) 对多向入口、步行路线与公共停留的组织，以及 [Marina One 官方项目页](https://www.christophingenhovenarchitects.com/projects/marina-one) 的多层公共空间与日常服务连接。这里只借鉴关系，继续复用工程已有材质和灰盒长椅；没有复制参考项目外形或引入照片资产。官方网页文字已核读，参考照片的大图未完成内置浏览器目视审查，因此不冻结正式立面与材质。

[步道离屏渲染](../../../.game-production/station-southeast-life-w4h/visual/street.png)和[赛事亭离屏渲染](../../../.game-production/station-southeast-life-w4h/visual/pavilion.png)来自 Unity 6000.3.24f1 的 URP 相机、1280 × 720、第一人称眼高；原始 PNG 留在项目内。它们证实顶棚、玻璃侧面、赛事终端和长椅的位置，但还不是游戏窗口截图或真人键鼠评估。首版只有屋顶与柱子的[弃选画面和构建](../../../.game-production/station-southeast-life-w4h/diagnostics/initial/)保留作对照。

独立 Win64 Player 包位于项目内 `.game-production/station-southeast-life-w4h/player/`。场景 SHA-256 为 `E938B94E20D2BA2BF6DFB02AA8FAC9A2B5645FA5E4D4620DEA77636E9EDEE458`；包内 `level0` SHA-256 为 `D1BCAC11A6AC3C6322E510F9247A83BDAEC5A11329C5E2442245C2157BAFC4C9`，`QuQu.App.dll` 为 `867531CBB1D5B3B0660BA4D9580E848B7EA0C36ACA1D694405B2EC8C27578449`，`QuQu.Validation.dll` 为 `97D1D8CB501FD74168595924F4439424C5AA98890D8D186293F1D0AA914AA2E4`。[构建日志](../../../.game-production/station-southeast-life-w4h/build.log)包含 `Build Finished, Result: Success.`，原预迁移包保存在项目内部诊断目录。

[新档四区整圈](../../../.game-production/station-southeast-life-w4h/qa/tour.json)在每 0.2 m 检查碰撞与脚下支撑，走完 25 段、3,872.5 m；赛事亭可打开并显示当前比赛状态，原货运、档案、温室、咖啡、三处透窗观景和核心门都通过，存档成功。Player 退出码 0。[独立进程读档](../../../.game-production/station-southeast-life-w4h/qa/read.json)从主档恢复核心位置、温室照料与咖啡计数，保存成功，退出码 0。两次使用隔离存档，不影响其他候选包。

首次 W4H 包遗漏了从 W4G 导入旧进度的场景映射。修正后的包以独立 W4G Player 生成真实源档，再由 W4H [跨进程迁入](../../../.game-production/station-southeast-life-w4h/migration-w4g/target-qa/migrate-w4g.json)：`LastLoadSource=migrated-W4G-primary`，核心安全位置、温室照料 1 次、咖啡供应／饮用各 1 次保留并写入 W4H 新档；W4G 源档前后 SHA-256 均为 `AA2A35503422C916D9F84A1868F4414F3FDC345A40192F56A7F95FED82A035AD`。[再次启动读档](../../../.game-production/station-southeast-life-w4h/migration-w4g/target-qa/read.json)显示 `LastLoadSource=primary` 并保留相同计数，两次退出码均为 0。修正包的新档整圈与普通读档也重新通过。迁移只覆盖已有的候选场景与已实现的存档字段，未拿真实用户历史档作验收。

这只是东南区的第二个用途不同的停留点和局部有顶步道。赛事亭与步道两端仍向外敞开，不能算气密围护；大量平台仍空旷。整圈脚本路线按 3.5 m/s 无停留约 18.4 分钟，不代表有 20 分钟非重复内容。真人键鼠、实际窗口中的文字可读性、真实模型比赛、30 分钟性能与正式美术仍未通过，W4H 不切换默认发行入口。
