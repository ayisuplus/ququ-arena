# v015 P4：生态园入口与常住舱立面

2026-10-01，基于 `b0a8f576` 的三环建筑候选继续景观施工。场景为 `BlackHoleStationThreeRingBuildingsV015`；新构件全部归 R3。核心玩法继续暂缓。

## 本轮建成的候选

- 玻璃生态园四个原入口各加瓷白曲面檐口、浅绿横向收边和门前铺装。檐口宽11.2m，底高3.5m；三处外挑3.5m，靠原候亭的一处外挑1.5m，避开上方既有候亭。八根细支柱靠墙布置在门轴两侧4.8m处，留出原玻璃门的完整滑动范围。
- 原候亭侧前庭延伸11m，其余前庭4m，表面贴合已有连续甲板，由原甲板承担碰撞。保持四扇自动门、玻璃罩、中央照料舱、植物与座位。室外没有新增植物。
- 三个独立常住舱和三户共用住宅楼的17块原墙面改用已有瓷白材质，补银色低基座与细竖缝；四个建筑入口增加门框与浅蓝/浅绿色板。门框净宽2.84m、净高3.82m，原门洞与室内布局保留。公共起居厅与短住楼立面不在本轮修改范围内。
- 共26个新增网格/渲染对象，按建筑和材料合并细节；22个具有匹配的网格碰撞，四块铺装仅作表面层。没有新运行时玩法组件，没有修改角色移动实现。

## 当前实际画面

以下为1800×1200 Unity Editor原生相机渲染。临时相机完整复制玩家相机的 URP 附加设置；不是AI概念图，也不是独立Player截图。`final-`表示本轮取景修正版，不代表最终美术批准。

![生态园入口](final-ecology-entrance.png)

![常住舱入口与立面](final-resident-portico.png)

- 同配置比较：[生态园原入口](before-corrected-ecology-entrance.png) / [本轮入口](final-ecology-entrance.png)、[原住宅立面](before-corrected-resident-portico.png) / [本轮立面](final-resident-portico.png)。
- [三户共用楼入口](final-shared-homes-portico.png)、[生态组团](final-ecology-group.png)、[当前全站鸟瞰](final-station-overview.png)。

`before-corrected-`通过临时停用本轮新增根对象、恢复17块原墙材质重建修改前视觉；取景后在finally中恢复全部状态，没有保存该临时状态。前后均使用同一机位、光照、曝光和玩家渲染设置。

### 取景错误的定位与修正

首轮`before-`、`after-`及`diagnostic-no-shadows-`保留作历史诊断，不作为最终画面。旧取景脚本只调用 `Camera.CopyFrom`，没有复制 `UniversalAdditionalCameraData`，临时相机因而使用默认Renderer 0，遮蔽强度1.3、半径1.2m且降采样；实际玩家用Renderer 1，遮蔽强度0.6、半径0.28m且不降采样，并启用SMAA。旧图的墙面噪点和部分锯齿不能直接归因于玩家画面。

临时关闭光源阴影的诊断仍存在墙面边缘噪点，随后复制玩家附加相机设置后，当前人视图的大面积墙面噪点消失。该对照同时恢复了渲染器与抗锯齿，不能据此定量拆分二者贡献。没有以修改全局光照、曝光或管线资产补偿取景错误。[相机与渲染器记录](capture-settings.json)确认恢复后的场景为干净Edit状态、新增根对象启用、玩家RendererIndex为1。历史其它图集保留，其取景配置需要后续逐项校核。

## 验证

| 范围 | 结果与证据 |
| --- | --- |
| 新构件半径归属、网格碰撞一致性、门扇完整运动包络、入口胶囊净空、顶棚与原墙保留 | [651项，0失败](detail-audit.json) |
| 14,664原对象、148生活座位、六房间/六居民、330稳定字段及525场景引用 | [61,656项保存性检查，0失败](real-building-audit.json) |
| Win64开发构建 | [成功，0错误、1警告](build.json) |
| 六户实际往返，相位0 | [201项通过，433.69m](homes-phase0/homes.json) |
| 六户实际往返，相位97 | [201项通过，431.08m](homes-phase97/homes.json) |
| 八短住门、四生态门及六公共楼室内，相位97 | [899项通过，2,252.84m](access-phase97/access.json) |
| 咖啡与生态照料、两互锁门、外部返回路线，相位0 | [454项通过，632.75m](daily-phase0/daily.json) |

以上四个Player进程均正常结束，最终报告无阻挡。使用正常时间和实际CharacterController；未用静态检查代替开门与行走。运行参数与PID保留在各目录的`process.json`。这些是指定路线结果，不是整站性能或全路线验收。

[原生场景差异](scene-diff.json)无原记录删除、无原MonoBehaviour记录改变；原记录变更仅17个墙面渲染器的材质和R3父节点子列表。[文件哈希](checkpoint.json)绑定场景、新网格、验证脚本、Player产物及图片。原v014场景与旧存档原件保留。

## 参考与复现

本轮在内置浏览器实际查看两处官方实景：

- [Gardens by the Bay Flower Dome](https://www.gardensbythebay.com.sg/en/things-to-do/attractions/flower-dome.html)画廊第六张：玻璃曲面网格、连续步道与种植床边界。参考其通透结构与清晰动线，没有照搬体量或新增室外树木。
- [ZHA Capital Hill Residence](https://www.zha.com/projects/architecture/capital-hill-residence)主页建筑照片：白色曲面檐口、细分缝和深色开窗的层次。沿用前轮住宅参考方向，没有复制高塔。

外部照片未下载、导入项目或上传生成服务。新增形体是适配已有建筑尺寸的原生网格。

脚本在[production/p4-ecology-facades](../../../production/black-hole-station/v015/p4-ecology-facades/)。创建脚本仅在前置版本运行一次；原生场景、网格及meta由Unity API创建保存。构建菜单为 `Tools/Station/V015/Build ecology and facades`。`run-player.ps1`使用独立绝对输出目录，可选homes/access/daily及相位。当前`capture.cs`用于最终配置；`capture-before-corrected.cs`仅用于本轮前后对照。

## 后续施工

生态园中央舱与旧候亭屋面、公共起居厅/短住楼及公共楼立面、固定抵达组轮廓、玻璃与金属的反射层次仍需继续。全站鸟瞰仍可见建筑之间较大的空白与细节不足。后续整站审阅必须使用玩家相机配置重新取景。此前两处整站圆弧路线偏差尚未在本轮复测；最终视觉与性能验收仍未完成。斗蛐蛐核心玩法及完整世界存档继续暂缓。
