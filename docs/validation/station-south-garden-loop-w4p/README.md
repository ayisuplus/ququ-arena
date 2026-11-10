# W4P 南侧生活街花园绕行

2026-09-29。从 [W4O 候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationPublicMatchNoticeW4O.unity)复制[独立 W4P 场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationSouthGardenLoopW4P.unity)。在南侧横道东段保留原直达路，增加两个入口、一条带透明护栏和顶棚的南侧绕行，以及复用温室六株种植模块的展示台。玩家可以绕入再从另一入口回到主路；没有新增虚构店铺、任务或赛事结算逻辑。

空间关系参考真实建成的 [Jewel Changi Airport](https://www.safdiearchitects.com/projects/jewel-changi-airport) 中交通连接与公共花园相邻的组织方式，以及 [Marina One](https://www.christophingenhovenarchitects.com/projects/marina-one) 中花园与日常公共空间相接的做法。只借鉴通行与停留的关系，没有复制建筑形状或使用其照片作为游戏资产。内置浏览器两次超时，参考照片的大图目视未完成；本场景仍是空间灰盒，不是冻结的美术方案。

[独立图形 Player 的支路报告](../../../.game-production/station-south-loop-w4p/qa/loop-v2/loop.json)记录西入口到东入口 94 m，往返 188 m；原横道 `x=100→140` 的直行往返 80 m 也通过。碰撞探针逐段检查地板与障碍，两个入口可双向通行，六株展示齐全，安全位置可写档。[西入口眼高画面](../../../.game-production/station-south-loop-w4p/qa/loop-v2/west-entry.png)与[种植端点画面](../../../.game-production/station-south-loop-w4p/qa/loop-v2/plant-terrace.png)由 Player 相机离屏渲染，只呈现三维场景，不含屏幕 GUI。

[四区整圈](../../../.game-production/station-south-loop-w4p/qa/tour/tour.json)仍为 3,975.6 m：四处区内观察湾、温室照料、咖啡供应与饮用、核心东门及外环碰撞均通过；[重启读档](../../../.game-production/station-south-loop-w4p/qa/tour/read.json)为 `primary`。[W4O 旧档迁入](../../../.game-production/station-south-loop-w4p/qa/migration/report/migrate-w4o.json)为 `migrated-W4O-primary`，[再启动](../../../.game-production/station-south-loop-w4p/qa/migration/report/read.json)为 `primary`；安全位置、温室与咖啡进度保留。来源存档及迁移复制件 SHA-256 均为 `EF5B44FD7EC6271E04C0F3A4C8729A3C5233CCD53F0EC962B8DB3BF4F6A63D24`。各 Player 进程退出码为 0。

主工程和隔离 ASCII 构建工程的 W4P 场景 SHA-256 同为 `97AA27004E73D62B092F18C772B06AD5973734E34C9963BC4D25B634CD89E705`；[构建日志](../../../.game-production/station-south-loop-w4p/logs/build.log)报告 `Build Finished, Result: Success.`。[独立候选 Player](../../../.game-production/station-south-loop-w4p/player/QuQuArena3D.exe)未替换默认发行入口。新增绕行只改变这一段的空间选择；整条生活街内容密度、完整压力围护、正式视觉、真人键鼠游玩和连续 30 分钟性能仍未验收。
