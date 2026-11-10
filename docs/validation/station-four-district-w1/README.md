# v009 W1 四区连通灰盒

候选场景：`Assets/Station/Scenes/BlackHoleStationFourDistrictsW1V3.unity`。原 `BlackHoleStationObservatory.unity` 未修改。按 v009 预留 720 m 候选外包络，当前实际修成四条径向公共路、四个区块基座和半径 330 m 的 48 段外环；环路外缘直径约 670 m，尚未建到 720 m 边界。第一人称为场景默认视角，步速设为 3.5 m/s。建筑体块仅标记后续目的地。

`route-results.json` 是从磁盘重开 V3 场景后在 Editor Play 中以 `CharacterController.Move` 运行的碰撞探针：13 条分段路线通过，外环一圈 2072.0 m，检查逐步水平偏差、脚下地板和中央井无碰撞。W2 V2 另以[完整往返结果](../station-southeast-life-w2/home-loop-results-v2.json)补证了玩家房间经东口到东南区、经南口回家的一次不传送闭环。它们不是人工键鼠游玩或性能验收。

本机截图：[总览](world-overview.png)、[东南区第一人称](southeast-first-person.png)。截图按仓库规则只保存在本机，不纳入 Git。V1 因东侧旧玻璃挡路弃选，V2 因南侧旧门槛挡路弃选；两份场景及构建脚本保留以追溯。V3 是 W1 连通基线，不代表四区内容建成。

首次 W1 Editor Play 发生在存档隔离修复之前：它把旧默认目录 `StationWorldCandidate/world-v1.json` 及同目录 `.bak` 写成 W1 场景数据；该目录中没有可恢复的先前副本。随后 `StationWorldSave` 将非原场景 Player 存档按场景名分开，Editor Play 改用临时场景目录；本轮后续探针未再写旧默认目录。旧场景存档的数据连续性因此不能声称已验证。
