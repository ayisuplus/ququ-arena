# v015 P4：公共楼、短住楼与共享起居厅立面

2026-10-01，基于 `6d9a8353`，继续景观施工；真实赛事与完整世界存档仍暂缓。场景为 `BlackHoleStationThreeRingBuildingsV015`。

## 本轮施工

- 05共享会客、06研修、08阅读活动、10共享工作四栋公共附楼补窗下蓝/绿瓷面、银色窗台收边与入口门框。沿用各自曲面/折面屋顶、房间及家具，构件归R2。
- 四栋附楼旧 `Facade Pearl` 高处拱饰曾穿出新屋顶。对其原网格创建派生版本，只保留包裹坐标Y≤5.54m部分；原FBX、对象与低处几何保留。修正后屋面上的月牙状穿插消失。
- 11/12短住楼补蓝色窗下饰带、侧墙细缝和条形饰面、银色基座以及前后入口收边，归R3。
- 共享起居厅八块既有白墙换用既有瓷白材质；东西侧浅绿饰面和四个入口门框补齐。南北门沿原X=12m偏置位置，侧门沿原Z=0.15m位置。底部收边分段止于墙体，保留2.8m原门洞。
- 新增21组网格与匹配碰撞，按建筑与材质合并；4个原立面网格使用派生资产。咖啡馆和研究馆已有窗框层次，本轮只取景核对。

实际查看了[ZHA KAPSARC官方建筑照片](https://www.zha.com/projects/architecture/king-abdullah-petroleum-studies-and-research-center)，参考白色分缝、深色玻璃和檐下收口关系；没有采用其蜂巢总平面，也未下载或导入参考照片。材料全部复用项目已有资产，没有新增采购。

## 本轮原生画面

以下是Unity Editor原生相机渲染，1800×1200；临时相机复制玩家Camera及URP AdditionalCameraData，使用相同Renderer、抗锯齿、后处理与Volume。不是AI图，也不是Player屏幕截图；未调全局光照。

![公共会客楼](final-commons.png)

![短住楼](final-guest.png)

![共享起居厅](final-lounge.png)

| 部位 | 修改前 | 本轮 |
| --- | --- | --- |
| 05共享会客 | [原状](before-commons.png) | [修正](final-commons.png) |
| 06研修 | [原状](before-study.png) | [修正](final-study.png) |
| 08阅读活动 | [原状](before-activity.png) | [修正](final-activity.png) |
| 10共享工作 | [原状](before-workroom.png) | [修正](final-workroom.png) |
| 11短住 | [原状](before-guest.png) | [修正](final-guest.png) |
| 共享起居厅 | [原状](before-lounge.png) | [修正](final-lounge.png) |

补充：[12短住](final-guest12.png)、[起居厅东门](final-lounge-east.png)、[北门](final-lounge-north.png)、[南门](final-lounge-south.png)。咖啡与研究馆核对图为 `before/final-cafe.png` 和 `before/final-research.png`，这两栋没有新增立面施工。

## 验证

- [几何与净空检查](detail-audit.json)：885项通过，覆盖21组网格/碰撞/材质、R2/R3内外环街退让、12个公共/短住入口及4个起居厅入口的宽度采样、旧拱饰下方原顶点保存。跨门洞检查只筛选新增碰撞；完整场景通行另由Player验证。
- [原对象保存性](real-building-audit.json)：61,656项通过，14,664个源对象、148生活座位、六住处/六居民、330稳定字段及525引用保留。
- [Win64构建](build.json)：成功，0错误、1警告。警告为未配置Player运行时Pipeline，不影响本轮内置路线探针。编译没有新增错误。
- [独立Player相位97联合入口路线](access-phase97/access.json)：939项全部通过，约2300.10m、489.38秒。覆盖八套短住门完整交互、四扇生态门、六公共楼室内、起居厅四门往返及门槛驻留跟随。正常时间、实际CharacterController移动，没有停环或移除碰撞；本轮仅执行该相位，不宣称两相位复测。
- [序列化差异](scene-diff.json)：原记录无删除、原MonoBehaviour记录无变化；原改动限于四个派生网格引用、八墙材质及R2/R3子列表。3个Prefab实例记录包含立面网格覆盖。源FBX未改。[哈希清单](checkpoint.json)绑定最终场景、模型、脚本、截图、程序与报告；v014旧场景与旧世界档哈希保持。

初次[静态检查](detail-audit-initial.json)4项失败源于检查器假设裁切面必须留下5.54m高度的顶点。旧高拱是独立几何，裁切后剩余部分最高4.47m；检查改为“全部低处原顶点保留且没有高于上限的顶点”，没有为通过检查进一步改动模型。冷启动eval曾超过工具5秒观察时限，输出文件证实操作已完成，没有重复执行创建脚本。

## 复现与范围

原生创建脚本：[create-facades.cs](../../../production/black-hole-station/v015/p4-building-facades/create-facades.cs)，由同目录 `run-authoring.ps1`插入网格助手并通过Unity API执行。只适用于原始前置版本，不在已经施工的场景重复运行；未手改场景或资产YAML。构建菜单为 `Tools/Station/V015/Build building facades`。`run-player.ps1 -Probe access -Phase 97 -OutputDirectory <新绝对目录>`执行八套短住门、四生态门、六公共楼及起居厅四门往返；探针仅在命令行明确启用时运行。

当前景观仍为候选：大面积墙体、窗玻璃与金属的反射差异、生态园中央舱和旧亭、固定抵达组以及整站密度仍需完善。此前整站两处圆弧偏差尚未由本轮证明修复；整站性能、最终视觉认可与核心玩法不在本轮通过范围内。前置字体及其他未归属修改保留。
