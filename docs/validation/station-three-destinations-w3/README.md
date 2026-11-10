# v009 W3 三区功能迁移灰盒

当前候选：`Assets/Station/Scenes/BlackHoleStationThreeDestinationsW3V2.unity`，从 W2V2 独立复制。V1 把西南地标柱放在温室入口线上，第一条实走探针挡在 `(-190,-179.6)`；V2 将柱移到步道外后保留为当前候选，V1 不覆盖。

西北区迁入原公开赛题研究台并增加观测亭、仪器高柱和外环停留台。西南区整体迁入原温室外壳及 `south-greenhouse-veggie-01` 照料组件，另接弯折花园步道与停留台。东北区把两组 `north-dock-left`／`north-dock-right` 货台的控制台和货箱迁入新港区，保留稳定 ID 与 202→190 m 的检修行程，另设抵达灯柱和停留台。中央擂台、玩家房间、咖啡厅、北侧旧接驳厅和飞船接口保留；旧科研与货运场地外壳尚未转成最终角色房间。

`route-interaction-results.json` 记录三区内六条逐步碰撞路线和公开档案、植物照料、左货台启动。`core-access-results.json` 从原玩家房间分别走到西北、西南、东北入口，路线长约 769、749、549 m；这些是脚本最短候选路径，不是实测游玩时间，也暴露了当前道路组织偏长。`cargo-cycle-start.json`／`cargo-cycle-finish.json` 验证左货台从启动、到检修位、近身检查、返回原位并写盘；退出并重新进入 Editor Play 后，`reload-results.json` 确认同一温室照料进度和货台完工状态从主存档恢复。右货台仅检查了稳定 ID、引用和停泊位置，完整工单仍待做。

同一 [Win64 独立构建](player/build-summary.json)在两个 Player 进程中复验迁移：首进程从房间沿连续碰撞路走约 765 m 到西南温室，完成两次照料并保存；[write.json](player/write.json) 的加载源是 `fresh`。第二进程从西南安全位置与照料次数 1 恢复，再走约 405 m 到西北档案亭并查阅；[read.json](player/read.json) 的加载源是 `primary`。两个进程都以 0 退出，保留各自[日志](player/write-player.log)与[恢复日志](player/read-player.log)。构建仍需纯英文临时工程副本以避开 Unity 对中文工程路径的错误，默认发行入口没有切换。

本机第一人称画面：[西北档案亭](northwest-archive.png)、[西南温室](southwest-garden.png)、[东北港区](northeast-port.png)、[四区总览](world-overview.png)。PNG 按仓库规则不纳入 Git。总览已呈现中央方框、十字道路、四区节点和外环，但三区仅各有一个迁入的行为点及一个观景停留点。没有完成可信压力围护、室内外层次、足够的漫游内容、真实素材或同机位美术验收。

Editor 与 Player 探针均使用 `CharacterController.Move` 和直接交互调用。实际键鼠、外围真实赛事、旧场景存档迁移、完整 20 分钟内容与长期性能都未验证；新场景使用按场景隔离的存档目录，不能把旧场景进度自动视为已迁移。Win64 复验只覆盖西南照料与西北档案，东北左货台的完整周期目前只有 Editor 证据。
