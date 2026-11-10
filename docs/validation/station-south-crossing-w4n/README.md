# W4N 南侧跨区回程支路

2026-09-29。从 [W4M 候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationSoutheastCafeW4M.unity)复制[独立 W4N 场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationSouthCrossingW4N.unity)。原有温室南门至东南咖啡厅的地板已连续，W4M 的碰撞实走基线为 428.5 m，但主游逛路线只验证了绕外环到咖啡厅，眼高视角中的横道缺少辨识和方向信息。W4N 保留这条直路、原有环路与既有活动，在横道放五处局部透明门架、两处朝外的停留小台，以及花园端／中央十字路／咖啡端三个可打开的导览台。中央导览明确给出向北回核心、向南接外环的选择；导览中的赛事状态仍来自现有 `ArenaStationLiveMatch`，没有新建赛事或生活进度源。

场景构件只沿用项目已有的结构灰、透明窗和导向色材质，参考总图中 [Marina One](https://www.christophingenhovenarchitects.com/projects/marina-one) 的公共花园连接关系和 [Jewel Changi](https://www.safdiearchitects.com/projects/jewel-changi-airport) 的室内公共步道关系；这些建成项目的照片没有进入游戏资产。门架、观景小台和端口没有连续围护，不能作为压力边界。

第一次 Editor Play 实走发现西侧观景小台入口与门架立柱冲突；把小台移到门架之后。随后发现中央门架及导览台阻断向南分路；中央改为四角支撑的十字平台，导览台移到通行线侧边。修正后的 Editor Play 和[独立 Player 双向路线](../../../.game-production/station-south-crossing-w4n/qa/crossing/crossing.json)均通过：由温室南出口到咖啡厅、进入两个观景小台并走中央南轴分支，再返回温室南侧。Player 实际碰撞路线含停留点和折返共 925.1 m，三个导览都可打开并显示既有赛事状态。这是自动角色控制器探针，尚不是真人键鼠体验。

[同机位原横道](../../../.game-production/station-south-crossing-w4n/visual/cross-east-before.png)与[W4N 中央交汇处](../../../.game-production/station-south-crossing-w4n/visual/crossroad-west-final.png)、[南轴视角](../../../.game-production/station-south-crossing-w4n/visual/crossroad-south-final.png)、[观景小台视角](../../../.game-production/station-south-crossing-w4n/visual/pause-south-final.png)已用第一人称眼高离屏画面目视核对。门架让既有直路和交叉口可辨，横道大部分仍为空旷白色灰盒，观景小台朝向星云而非黑洞暗心；不能据此宣称达到每 20–40 秒都有实质内容变化的设计目标。此类离屏画面也不包含 Player 交互 UI。

[独立 Player 四区原整圈](../../../.game-production/station-south-crossing-w4n/qa/tour/tour.json)继续走通 3,975.6 m，进入四个观察湾；温室照料 +1、咖啡供应与饮用各 +1，外环 48 段顶棚和两侧窗命中。其[跨进程读档](../../../.game-production/station-south-crossing-w4n/qa/tour/read.json)为 `primary`。复制 W4M 实际存档后，[W4M → W4N 迁入](../../../.game-production/station-south-crossing-w4n/qa/migration-report/migrate-w4m.json)为 `migrated-W4M-primary`，[再次启动](../../../.game-production/station-south-crossing-w4n/qa/migration-report/read.json)为 `primary`；温室照料、咖啡供应／饮用各 1，原安全位置恢复。来源存档前后 SHA-256 均为 `506116461FA8A81DC823A0DDE4773CB4BB8F5196D9F7EBF720C278C605DCC09E`。五次 Player 进程退出码均为 0。

主工程与 ASCII 隔离构建工程的 W4N 场景 SHA-256 同为 `DD070B1A36F1234033185C29EAE5C4ADA1AC730D9463374F2FD53F89D9524511`；[构建日志](../../../.game-production/station-south-crossing-w4n/logs/build.log)报告 `Build Finished, Result: Success.`。[独立候选 Player](../../../.game-production/station-south-crossing-w4n/player/QuQuArena3D.exe)没有替换默认发行入口。仍待做真实键鼠选择路线、内容密度、完整压力围护、正式视觉、真实模型赛事和持续性能验收。
