# 中央井口 50 米比例复验

日期：2026-09-28。依据是[最初空间站总览](../../黑洞空间站升级方案/08_概念图/IMG-001_空间站总览_v001.png)。这张图是视觉锚点而非测量图：本轮保留外方框、内菱形、72 米环台外沿、双电梯和北侧抵达轴，只把中央开口由约 32.73 米扩至 50 米，环台开口／外径比由约 45% 提到约 69%。[场景网格调查](survey.json)记录了原始渲染与碰撞网格半径、地板内缘和平台坐标。

| 同一相机 | 原 32.73 米井口 | 50 米井口 |
| --- | --- | --- |
| 空间站俯视 | [current-overview.png](current-overview.png) | [bore-50m-overview.png](bore-50m-overview.png) |
| 主席位附近 | [current-seat.png](current-seat.png) | [bore-50m-seat.png](bore-50m-seat.png) |

两组图片均来自已保存场景的相同位置、朝向和视角。50 米版的洞口更接近概念图的大开口视觉重心；这只是灰盒比例判断，不代表正式材质、灯光或画质通过。独立研究场景 `BlackHoleStationBoreStudy50.unity` 与原场景保留，随后将通过检查的网格写回独立空间站候选场景 `BlackHoleStationObservatory.unity`。默认发行场馆未切换。

| 验证 | 结果 |
| --- | --- |
| [环台机械](mechanics.json) | Editor Play 使用原 `ArenaDuelPlatforms` 流程及固定时间步：普通入场、双人返航、决赛单侧撤板坠落、冠军升起和复位均通过，共 987 个协程步骤；井口内沿 22 米无环台碰撞，27 米处有支撑 |
| [独立 Win64 构建](build.log) | Unity `6000.3.24f1`；`Build Finished, Result: Success.`、`World preview build: Succeeded`；构建位置 `E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-bore50-20260928\BlackHoleStationWorld.exe`；`level0` SHA-256 `CE28113EC1790F949F2EC1E6EF3CA4806432E03A702D71650B3F42CDCBDA0619`，`Managed/QuQu.App.dll` SHA-256 `99F674BCDE7B791B09BC816C54511FC04473587B8277859D75847B1010872263` |
| [原世界 Player 回归](world-player/probe.json) | 退出码 0；玩家载入后有地板，东北高位、北侧接驳、停靠舱往返、货运工单与输入设备通过 |
| [居民 Player 回归](resident-player/resident-player.json) | 退出码 0；两位居民往返客厅、同名选手避让、近距离短对话与存档组件检查通过 |
| [咖啡 Player 回归](cafe-player/write.json) | 退出码 0；玩家舱至客厅约 65.2 米／327 步、取饮、入座、饮用、离座、写盘通过 |

机械测试使用夹具选手和快进协程，没有跑新井口下的真实后端比赛。Player 测试在隐藏窗口运行，其截图和帧时间不用于画质或性能判断。当前仍是灰盒，外侧区内容密度、全部座位视线、井边防护、正式可编辑环台美术源、真实比赛和长时间漫游均需继续验证。
