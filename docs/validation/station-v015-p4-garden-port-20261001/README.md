# v015 P4：生态中央舱与固定抵达前庭

2026-10-01，基于 `01cf9adc` 继续景观施工。原生候选：`Assets/Station/Scenes/Candidates/BlackHoleStationThreeRingBuildingsV015.unity`。本轮保持三环运动与已有生活内容，斗蛐蛐核心玩法及完整世界存档继续暂缓。

## 本轮实装

- 生态中央照料舱：原屋顶对象换为低矮瓷白曲面，中央保留约4×11.2m天窗；原玻璃屋顶保留，旧不透明吊顶同步开口。补浅绿窗下饰带、银色窗沿及两门收边。外罩、作物、照料功能和家具保持原有归属。
- 生态园外入口小亭：原顶冠换为曲面，吊顶、灯带和支柱保留。所有生态新增构件归R3。
- 固定抵达区07访客楼、09候舱阅览楼：两块曲面屋顶及蓝/绿饰带，原高拱收回檐下，原楼与室内对象保留。
- 固定前庭：164m长、11m宽的蓝色铺装连接三栋建筑，附楼门前补接入段。两段7m宽曲面廊檐配八根支柱；与原中央门廊分段衔接，仍有窄的屋面间隙，步行地面连续。新增固定构件均在主圆盘半径254m以外。
- 未新增植物，未调整全局曝光、灯光或渲染器。船坞后段的旧黑色屋顶、上层框架及整站材质精细度仍需后续施工。

## 真实参考

设计前在内置浏览器实际查看 [Gardens by the Bay 官方 Flower Dome 图库](https://www.gardensbythebay.com.sg/en/things-to-do/attractions/flower-dome.html)的第6张照片，参考浅色连续步道、集中花床与细玻璃罩骨架；查看 [KPF 官方 Zayed International Airport](https://www.kpf.com/project/zayed-international-airport)的曲面屋顶和遮蔽连接组织。参考照片未下载、导入项目或上传生成服务。沿用本项目已建的瓷白、蓝绿和银色材质关系，不照搬机场总平面。

## 实际画面

所有图片为Unity Editor原生相机渲染，非AI概念图。临时相机复制玩家的URP附加相机设置（RendererIndex=1、SMAA、后处理及Volume），1800×1200；前后七机位位置一致。仰视天窗和廊下路线为补充机位。

![生态中央舱曲面屋顶和天窗](final-garden-overview.png)

![生态中央舱浅绿饰带](final-garden-interior.png)

![固定抵达区共同前庭](final-port-overview.png)

![访客楼与廊道](final-visitor.png)

其他实景：[候舱阅览楼](final-waiting.png)、[中央抵达入口](final-arrival-entry.png)、[廊下步行](final-covered-route.png)、[生态入口小亭](final-garden-pavilion.png)、[室内天窗仰视](final-skylight.png)。

同机位修改前：[生态中央舱](before-garden-interior.png)、[生态鸟瞰](before-garden-overview.png)、[入口小亭](before-garden-pavilion.png)、[港区鸟瞰](before-port-overview.png)、[中央入口](before-arrival-entry.png)、[访客楼](before-visitor.png)、[候舱楼](before-waiting.png)。当前仍为景观候选；屋檐反光、旧构件衔接和整体密度未作最终视觉通过。

## 检查与修正

- [施工前调查](source-structures.json)记录七组建筑的原生顶点包络；[前庭预检](preflight.json)确认八柱位无原有碰撞、地面由固定甲板承托。
- [几何检查](detail-audit.json)：905项通过，检查新增归属、运动环边缘退让、匹配碰撞、三栋楼门口净空、前庭承托和通道、两层天窗开口。门口静态检查针对本轮新增碰撞，完整运行通行另外验证。
- [保存性检查](real-building-audit.json)：61,656项通过，包含14,664个原对象、148个生活座位、6个房间和6位居民、330个稳定字段及525个场景引用。
- [场景差异](scene-diff.json)：原记录无删除，原Behaviour无改变；本轮新增22个对象（含2个组根）、20个MeshRenderer、14个MeshCollider及8个柱碰撞，另有3条用于引用原Prefab对象的stripped GameObject记录。原网格、屋面材质和父级子对象列表的修改与施工项对应。只读差异解析已覆盖stripped记录，避免把这些记录误计入相邻MeshFilter修改。
- 仰视发现原不透明吊顶仍堵住天窗，已开通：[初次发现画面](initial-blocked-skylight.png)、[原生修正记录](skylight-correction.json)。最终仰视确认可以看到罩顶骨架与星空。初次画面受生长灯遮挡，最终仰视换至中央通道，二者不作同机位对比。
- [Win64构建](build.json)成功，0错误、1条警告。新增构建菜单为 `Tools/Station/V015/Build garden and arrival courts`。
- [固定抵达—两附楼—气闸—飞船完整往返](player-dock-97/dock.json)：独立Player相位97，157项通过，约1,013.02m、173.00s。包含07/09前后门、共同前庭与廊下横向往返；原气闸互锁、防夹、船门和跨回旋转外环均通过。初次构建的程序哈希见`checkpoint-initial.json`，随后只给生活路线探针增加诊断字段，景观和运行功能未改。
- [生活与生态联合路线初次运行](player-daily-97/daily.json)：454项中452项通过，约632.68m；两项咖啡座位起身视角恢复失败。初次与港区验证为两个独立进程同时运行，不作性能证据。
- [单独运行复现与诊断](player-daily-diagnostic-97/daily.json)：454项中452项通过，约632.72m、124.44s；同样两个第三人称座位失败。`viewRestores`记录座位4/6的位置误差为0.0010170/0.0010708m，朝向差为0；原阈值0.001m保持。所有生态照料、门互锁及本轮路线检查通过，但联合报告整体仍为失败，不能写成全绿。`StationRingDailyProbe`只加诊断，没有放宽断言或改动咖啡逻辑；后续继续区分入座前采样、保存视角和起身后相机更新。
- 三个Player进程均已结束并生成最终报告，未因轮询超时重启。Player日志没有Exception/Error；存在额外灯光阴影图集降分辨率提示。隐藏Player截图不作视觉通过证据，实景使用上面的原生Editor相机图。

## 复核与继续施工

本轮原生制作脚本与审计位于 `production/black-hole-station/v015/p4-garden-port/`，顺序为 `run-authoring.ps1` → `open-underside.cs` → 两项audit → capture。脚本仅用于指定基线的一次性制作，不得对已制作场景重复执行。场景及资产由Unity API生成，未手改YAML。

旧v014场景、旧存档和第三方源资产保持；[文件哈希](checkpoint.json)将本轮脚本、网格、实景、检查结果和带诊断的Player构建关联。技术通过、当前画面审阅与用户最终视觉认可分开记录。后续继续港区后段、观景构件及整站材质；咖啡起身视角两项失败、两处历史整站圆弧偏差、P2出口汇总和P5集成验收仍待处理。
