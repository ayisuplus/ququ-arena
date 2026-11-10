# v010 W4A 模型住宅与港区访客入口：验证范围

候选场景：`Assets/Station/Scenes/BlackHoleStationModelHomesW4A.unity`。从已提交的 W3V2 独立复制，旧候选场景不覆盖。只有当前六位模型获得住房 ID：ChatGPT、Claude、DeepSeek、Gemini、GLM、Kimi。玩家是访客，没有住房 ID；首次出生点在东北港区 `(210, 0.06, 180)`。

| 证据 | 检查内容 | 结果 |
| --- | --- | --- |
| [路线结果](route-results.json) | 第一人称访客从港区沿有地板、无阻挡的路线到 DeepSeek 房间，进入西侧共享廊，再往返 Gemini、GLM、Kimi 房间 | 港区至 DeepSeek 约 589 m；各西侧房间可进出；Editor 场景独立存档写入通过 |
| [居民结果](resident-results.json) | 新增 DeepSeek、Gemini、GLM、Kimi 各自从模型房间到共享空间并返回；原 ChatGPT、Claude 保留 | 四位新居民各完成一次外出与返家；共六个居民对象 |
| [扩建位结果](extension-results.json) | 西侧 7 × 6 m 未分配位的碰撞净空、共享廊往返路线、朝西外墙 | 室内净空无碰撞物；31 m 往返有连续地板；`Exhibit west pressure wall` 仍封闭；已分配房间保持六间 |
| [Win64 构建](player/build-summary.json)、[首次启动](player/write.json)、[重启恢复](player/read.json) | 独立 Player 核对六位模型住房身份、东北港区首次出生、预留位净空，并在另一进程恢复访客位置 | 两次进程退出码均为 0；首次 `fresh` 起点 `(210, 0.06, 180)`，步行到 `(190, 0.08, 180)` 保存；重启从 `primary` 恢复该位置 |

这些是 Editor Play 中的自动 CharacterController 与组件探针，不能代替真人键鼠、完整视觉审查和街区内容密度验收。东北港区的访客点是公共地面灰盒，尚无完整下船动线或抵达演出；港区至核心的 589 m 路线很长，需要沿途增加有效内容或收紧道路。西侧预留标记不是第七间已建成住房，外墙也尚未开口；新增舱段时需另验承重、压力围护、通行和性能。

Win64 构建使用隔离英文路径的工程副本与独立存档目录；[两次启动日志](player/write-player.log)和[重启日志](player/read-player.log)保留，构建二进制未纳入 Git。W4A 还未验证旧场景存档迁移、外围真实赛事、30 分钟性能、默认发行入口或全部旧公共建筑改住房；均不计为已通过。
