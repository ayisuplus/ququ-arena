# v015 P4：固定船坞屋面与进站廊道

2026-10-01，基于 `738b2e97` 继续景观施工。候选为 `Assets/Station/Scenes/Candidates/BlackHoleStationThreeRingBuildingsV015.unity`。圆形看台、三环旋转、居民与已有生活功能继续保留，斗蛐蛐核心玩法和完整世界存档暂缓。

## 本轮变化

- 原船坞大厅顶棚换为44×44m瓷白曲面，保留原柱、横梁、灯带和外围玻璃。
- 原船舱和登船连接舱屋顶换为曲面；高低屋顶之间的原实心上封板改用已有蓝色建筑玻璃，原黑色顶部门楣改为瓷白。门、封闭碰撞与船舱内部没有迁移。
- 七段原进站廊顶换成横向浅拱，同样的曲面截面在段端对齐；原5m底面净高、灯带、气闸和入口保持。
- 89m长、5.5m宽蓝色步行带接向登船坡道，两侧各补10.5×10.5m候船前庭铺装。所有新增内容属于固定港区，不进入旋转圆盘。
- 改造10个原屋面对象，新增一个组根和两件合批地面网格；原对象、源模型与GUID保留。没有新增植物、购买资产或改动曝光。

## 参考与实景

沿用上一轮已在内置浏览器实际查看的 [KPF Zayed International Airport 官方参考](https://www.kpf.com/project/zayed-international-airport)，借鉴连续浅色屋顶、玻璃下部和有遮蔽的连接关系；采用项目已有瓷白曲面语言。参考未下载、导入或上传生成服务。实景通过原生Unity相机取得，复制玩家URP附加设置（RendererIndex=1、SMAA、后处理和Volume），1800×1200；前后五机位完全相同。

![港区后段当前鸟瞰](final-dock-overview.png)

![船坞入口和候船前庭](final-dock-entry.png)

![船舱曲面屋顶和高窗](final-vessel.png)

其他实景：[船坞内部与登船坡道](final-dock-inside.png)、[进站廊道](final-approach.png)。同机位施工前：[鸟瞰](before-dock-overview.png)、[入口](before-dock-entry.png)、[船舱](before-vessel.png)、[船坞内部](before-dock-inside.png)、[进站廊道](before-approach.png)。均为Editor实景，不是AI图或独立Player截图。材质层次、边缘锯齿、空间密度及原构件精细度继续完善，未声明最终视觉通过。

## 几何和保存性

- [原生调查](source-structures.json)、[登船口高部件调查](adapter-survey.json)与[施工前承托](preflight.json)记录来源和位置；270个步行带地面采样全部承托。
- [686项几何检查](detail-audit.json)通过：固定归属、10块屋顶碰撞匹配、屋面顶面射线、段端高度连续、步行净高、前庭和步道地面承托。
- [61,656项保存性检查](real-building-audit.json)通过，包含14,664个原对象、148个生活座位、6房间和6居民、330个稳定字段及525个场景引用。
- [制作记录](authored.json)和[高窗材质记录](clerestory.json)保留原网格/材质路径。原生修改脚本在 `production/black-hole-station/v015/p4-dock-landscape/`：先运行`run-authoring.ps1`，再执行`finish-clerestory.cs`。只适用于指定基线的一次性制作，已完成场景不能重复运行。
- [只读场景差异](scene-diff.json)确认原序列化记录无删除，原Behaviour无修改。7块旧廊顶的BoxCollider停用但保留，改用匹配曲面的MeshCollider；其他屋顶复用原MeshCollider。场景及资产通过Unity API修改，未手改YAML。

## 咖啡起身镜头检查的定位

上一轮两个座位的最终镜头位置相差约1.02/1.07mm，超出原1mm断言。本轮先在**尚未修改港区几何**的独立Player中增加采样，复现见[时序诊断](player-camera-timing-97/daily.json)，仍为452/454通过，原失败保留。

诊断中的`viewRestores`同时记录入座前、保存视角、起身当帧和后续LateUpdate后的坐标。入座前、保存值及起身当帧一致；以座位6为例，起身后的防穿墙跟随重新计算距离，镜头变化0.0010559m，角色相对环的站位变化0.0010536m，朝向始终一致。

`StationCafeMoment.Stand()`恢复视角后，`StationGrayboxWalker.LateUpdate()`本来就需要重新做第三人称防穿墙。旧探针的`Press()`跨过该更新后才检查冻结的旧位置，因此误把正常防穿墙调整算作恢复失败。本轮仅修正验证采样时机：E键仍走真实输入，在Update结束、LateUpdate前记录恢复结果；保留原1mm位置及0.05°朝向阈值，另查随后镜头周围5cm内没有场景碰撞。没有修改咖啡/行走逻辑，没有放宽原断言。

## 构建和运行

最终[Win64构建](build.json)成功，0错误、1警告，用时21.692秒。构建入口：`Tools/Station/V015/Build dock landscape`。独立Player均已退出并写入最终报告：

| 路线 | 相位 | 通过检查 | 行走距离 | 用时 |
| --- | --- | --- | --- | --- |
| [生活与生态往返](player-daily-final-0/daily.json) | 0 | 464/464 | 632.74m | 124.45s |
| [生活与生态往返](player-daily-final-97/daily.json) | 97 | 464/464 | 632.57m | 124.42s |
| [固定港区完整往返](player-dock-final-97/dock.json) | 97 | 157/157 | 1013.05m | 173.01s |

生活路线包括10处咖啡座位的真实输入、起身当帧恢复与更新后镜头周围碰撞检查，以及生态园往返；两个相位均通过。玩家日志未发现Error或Exception；两个相位的生活路线均出现光源阴影图集自动降低分辨率的提示，保留日志。隐藏Player截屏未作为视觉验收，以上图像均来自Editor原生相机。

场景、模型、脚本、实际画面及最终Player文件哈希见[checkpoint](checkpoint.json)。`checkpoint-before-final-build.json`仅用于保留诊断构建的程序哈希及当时工作文件，不代表这些文件共同组成该诊断版本；该诊断使用738b2e97场景。

## 后续边界

本轮改善港区屋面和行走空间；观景构件、旧附属细节及整站反射/材质仍需续建。两处历史整站圆弧偏差、P2出口与归属汇总和P5集成验收仍未完成。局部技术通过与用户最终视觉认可分开记录，整站目标保持进行中。
