# v012 咖啡柜台与座位尺度（2026-09-29）

本轮已改入 A2 候选场景：用精确制作的三维柜台替换方块外观，将原四张椅子收拢到共享桌边。空间分区、照明、墙面平面植物和整体密度仍需继续制作，本轮不宣称 A2 视觉验收完成。

## 场景改动

- 四座从 `x=201/207, z=-199/-205` 调至 `x=201.85/206.15, z=-201.35/-202.65`；顺序、引用与朝向保留。[之前](seats-before.png) / [之后](seats-after.png)。原先椅子围成约 6 × 6 m 方阵，远离 3 × 2.2 m 桌面；现在成为紧凑完整的座位组，外围保留绕行空间。
- [柜台之前](counter-before.png) / [之后](counter-after.png)：新柜台为 6 × 1.35 × 1.6 m，4,324 三角面、三个材质网格；包含圆角台面、凹入踢脚、嵌板、背面柜门与把手。采用项目侧 URP/Lit 石墨色、哑光黄铜、暖白台面材质，没有使用生成候选的贴图。
- [Prefab](../../../QuQuArena3D/Assets/Station/Models/CafeCounterV012/Counter.prefab)在 `(210,0,-211)`。只关闭原柜体和台面的 Renderer，原碰撞体、Counter 锚点和 `StableId=east-lounge-cafe-01` 保留。旧场景 9,193 个序列化对象 ID 全部保留，仅增加柜台 PrefabInstance 及其 Transform 两个场景条目。

上面前后对照是 Editor 固定相机截图。柜台对照临时隐藏第一人称角色的可见替身；座椅对照保留其原显示状态。截图条件在各组内部相同，不能当作真人键鼠验收。

## 制作与候选

已实际查看项目保存的 [Quaternius 供应商预览](../../../production/black-hole-station/vendor/quaternius-modular-scifi-megakit-standard/Preview_2.png)，沿用精确嵌板、深浅结构分层和克制金属收边。柜台尺寸来自当前场景。另检索了 [Norm Architects Chancery House](https://normcph.com/project/chancery-house/)的真实公共咖啡空间，但内置浏览器图片加载超时，仅核读文字，未把该照片列为已目视的设计证据，也未上传第三方照片生成。

用户明确允许直接使用生成积分。本轮 Meshy preview 与 refine 均 `SUCCEEDED`，实际消耗 20 + 10 = **30 积分**。[任务记录与提示词](../../../production/black-hole-station/cafe-counter-v012/candidate-a/generation.json)、[原始 GLB](../../../production/black-hole-station/cafe-counter-v012/candidate-a/source.glb)已保存。原 GLB SHA-256：`18c1550f7d039405f7bfc0c5b0ed3b6a6a2966b25470daa54c2aa909b5e2cb2d`。该模型从 257,662 面减至 45,000 面后，在 [Unity 近景](meshy-candidate-rejected.png)可见边缘波浪、面板凹凸与偏传统线条，因此未采用。其完整本地 run 和带 GUID 的已导入副本保存在 `QuQuArena3D/.game-production/runs/v012-cafe-counter-20260929-a/`；活动 Assets 中移除了弃选导入。

最终柜台是[Blender 脚本](../../../production/black-hole-station/cafe-counter-v012/build_clean_counter.py)精确重建的新几何；[源 Blend 与 FBX](../../../production/black-hole-station/derived/cafe-counter-v012/)保留。它只沿用了候选提出的材质方向，不能将其描述成 Meshy 原模直接通过。

## 验证

[Editor Play 记录](editor-interaction.json)：13 段 CharacterController 实际移动均有地面支撑、0 侧碰撞，最大水平误差约 0.05343 m；按索引 2、0、1、3 分别入座、离座全部成功，供应与饮用各增加一次。使用 Editor QA 状态，随后退出 Play。退出后保留场景副本与已保存文件逐字比较一致，才重新打开已保存场景。

独立 Win64 构建成功，`warnings=1, errors=0`；一条警告为可选 Pipeline Runtime 配置。构建来源见 [provenance](build-provenance.json)。主项目与 ASCII 隔离构建工程中的场景 SHA-256 同为 `810FF03AB8A35B7F0DB6BE9C95C727F5F37F3BBD6233EDB19D12DE854D7E731B`。

[Player 往返记录](player-route.json)在全新 QA 存档下完成 34 段路线，`complete=true`、无 error；[Player 图](player-cafe.png)显示新柜台与赛事屏，转播图像非黑像素 338,742。[日志](player.log)未检出 error/exception/failed/missing。候选程序位于 `.game-production/station-v012-cafe-counter-a2/player/QuQuArena3D.exe`，默认发行入口未切换。此次为图形 Player 的自动路线与截图，不是新的性能测试、真人键鼠或用户审美认可。
