# v015 四处状态观察湾归属与玻璃收边

2026-10-02，基线 `90efaeaf`。本轮处理鸟瞰中几处像散件的透明框体：查明其功能，统一遗留玻璃材质，补可辨认的瓷白细框。四处原地保留，不改核心玩法。整站景观仍在施工。

## 归属与用途

| 观察湾 | 稳定 ID | 运动归属 / 用途 |
| --- | --- | --- |
| 港区货运观察湾 | ring-port-status | 固定港区；查看原货运状态 |
| 科研公开答卷观察湾 | ring-research-status | R2；查看原科研资料 |
| 生活街赛事观察湾 | ring-civic-status | R2；查看原咖啡和赛事连接状态，真实赛事仍停用 |
| 花园温室观察湾 | ring-garden-status | R3；查看原照料进度 |

来源为原 `StationDistrictRingBaysBuild.cs` 和当前候选实物。[初始部件清单](bays-inventory.json)、[最终活动状态与稳定 ID 清单](bays-final-inventory.json)记录可定位对象。原后台引用由既有运行初始化接入，本轮没有更改组件或接通赛事。

[七个导览控制台清单](guide-inventory.json)确认它们来自既有 Console 资产，各有明确归属；没有将其当作孤立垃圾移除。[透明对象初筛](transparent-inventory.json)仅用于定位窗、护栏和罩体，不能代替活动状态检查或全站归属验收。

## 本轮施工

原顶棚和两端窗共12块仍使用早期 `P3-pressure-window`。本轮改用项目已有 `BlueArchitecturalGlass`；每亭增加一个合并的瓷白边框网格，四亭共用同一240顶点、120三角形资产，每亭一个 Renderer。四角竖框、顶部环边和两端下框勾出玻璃轮廓。原地板、尺度、位置、状态台、稳定 ID、旧碰撞体保持。

通过内置浏览器实际查看 [ZHA Capital Hill Residence 官方实景](https://www.zha.com/projects/architecture/capital-hill-residence)，参考白色结构与深浅玻璃的边缘区分；不复制住宅造型、照片或资产。施工复用项目既有瓷白和蓝玻璃材质，未下载新资源，未改全局光照和曝光。

初次检查发现原后墙已经停用：观察湾两条长边均为开口。初稿误加后侧竖框与底框，已从共享网格中移除，避免产生可穿过的假墙。`initial-*` 留存初稿与失败检查；`after-*` 是网格原地更新后、重新加载前的缓存画面，仍显示旧框，不能作为最终结果。**下方及所有 `final-*` 才是重新加载保存资产后的最终取景。**

## 前后实景

![科研观察湾修改前](before-ring-research-status.png)

![科研观察湾最终候选](final-ring-research-status.png)

![港区观察湾最终候选](final-ring-port-status.png)

![生态观察湾最终候选](final-ring-garden-status.png)

![生活街观察湾最终候选](final-ring-civic-status.png)

取景复制玩家 Camera 与完整 URP 设置，1800×1200、同位置/FOV；[相机记录](final-cameras.json)。图像属于 Unity Editor 原生渲染，不是 Player 性能或动态反射验收。瓷白轮廓和蓝玻璃端部已可辨认；原6米高度、周边大面积空白和状态台外形仍为既有布局，四亭与各自建筑群的到达关系尚待整理。

## 验证

- [几何与开口检查](frame-audit.json)：886项通过，包括所有非退化三角形、低位框体限于两端既有墙厚范围、两条长边开放、旧后墙停用、无新增碰撞或行为组件。
- [对象保存性](real-building-audit.json)：61,728项通过；14,664源对象、148生活座位、六房间、六居民、330稳定字段及525场景引用保留。
- [场景逐记录差异](scene-diff.json)：37,750个原记录不变，12个Renderer仅改材质，4个组团父Transform各追加一个子节点；新增16条记录，无删除。全部原碰撞体、Behaviour、GameObject和MeshFilter记录逐字保留。
- [Win64构建](build.json)：Succeeded，0错误、1警告，16.26秒。没有改运行脚本；构建菜单为 `Tools/Station/V015/Build status bay frames`。
- Player 阅读回归：[相位0](player-phase0/reading.json)224项通过，31.05秒、34.46米；[相位97](player-phase97/reading.json)224项通过，31.06秒、34.54米，两进程均已退出。场景内原13处阅读操作点逐个近身往返，检查E打开、E/Esc关闭、随环保持和输入恢复，包含四个观察湾。这不是13点之间的整站连续旅程；测试内存赛事夹具不代表接入真实玩法。
- [最终Editor状态](final-state.json)为保存后的Edit场景，临时取景相机已清理。源码、场景、共享网格、Player和证据哈希见 `manifest.json`。

## 剩余范围

四观察湾的未知用途问题已关闭，七个导览台保留。仍需核对生态园旧高门架与新入口的关系、上述四亭至建筑群的到达铺装与导向、全量出口归属汇总；整站白色层次与玻璃/金属反射、历史两处圆弧路线偏差和P5集成仍待完成。核心玩法及完整世界存档继续按用户要求暂缓；本轮通过不代表整站完成。
