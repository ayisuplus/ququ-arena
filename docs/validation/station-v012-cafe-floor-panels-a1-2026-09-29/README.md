# v012 A1 咖啡厅地板分格候选

独立候选场景原有咖啡厅地面是一整块 21.4 × 21.4 m 的深色平面，固定视角和近看都缺少结构尺度。先实际查看项目已引入的 [Quaternius 官方预览](../../../production/black-hole-station/vendor/quaternius-modular-scifi-megakit-standard/Preview_2.png)，以及项目已有的短廊模块地面；只在原平面上试加其 `T_Trim_03_BaseColor.png` 的临时材质，纹理仍不足以表达板缝。于是制作 8 × 8 块轻微倒角的地板视觉覆盖件。供应商 Standard 包的许可是 [CC0 1.0](../../../production/black-hole-station/vendor/quaternius-modular-scifi-megakit-standard/License_Standard.txt)；这里的新网格由 Blender 生成，不改动供应商网格或原始贴图。

[Blender 生成脚本](../../../production/black-hole-station/derived/cafe-floor-v012a1/build_cafe_floor_panels.py)、[可编辑源](../../../production/black-hole-station/derived/cafe-floor-v012a1/CafeFloorPanelsV012A1.blend)、[原始导出 FBX](../../../production/black-hole-station/derived/cafe-floor-v012a1/CafeFloorPanelsV012A1.fbx)、[预览](../../../production/black-hole-station/derived/cafe-floor-v012a1/CafeFloorPanelsV012A1-preview.png)和[来源清单](../../../production/black-hole-station/derived/cafe-floor-v012a1/source-manifest.json)均保留。导出 FBX 与 [Unity 导入副本](../../../QuQuArena3D/Assets/Station/Models/CafeFloorPanelsV012A1.fbx)的 SHA-256 同为 `945A735CD4DF0B7439E169CC6FBFD1CF334F6B0F686E35F9F61DD6C9E3AAE0CA`。模型有 64 块、512 顶点、Unity 内 640 三角面；项目侧 [URP 材质](../../../QuQuArena3D/Assets/Station/Materials/V012CafeFloorPanelsTrial.mat)复用已导入的 Quaternius 色图，没有改其 `.meta` 或 GUID。

[接入脚本](../../../production/black-hole-station/component-a0b/add_v012_cafe_floor_panels.cs)仅在[独立 A1 场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)原咖啡厅地面之上挂一件视觉 Prefab，关闭投影且不加 Collider。地板在 Unity 的世界边界约 21.35 × 21.35 m。中心及两处座椅附近向下射线都继续命中原有 `Southeast civic life outer-ring street floor`，新增模型不会抢走行走碰撞。`east-lounge-cafe-01` 和四座锚点仍在；原有 8,898 个序列化对象 ID 全保留，只增加 Prefab 实例相关 2 个对象，并在咖啡厅父节点的子列表中添 1 条引用。

固定 70°、1280 × 720 Editor 渲染：[入口前](before-entry.png)／[后](after-entry.png)，[桌边近景前](before-floor-close.png)／[后](after-floor-close.png)。保存场景与材质后重新渲染，两张“后”图的 SHA-256 均与试装图逐字节相同。板缝让主桌、四座椅与空间尺度更易读，尚有材质粗糙度、灯光和连续运动下的纹理密度需要 A2 统一。

此项是 A1 候选的局部视觉与静态碰撞验证。本轮未重新构建 Windows Player，真人键鼠路线、Player 画面、目标硬件性能和用户审美认可均不能据此宣称通过；现有咖啡交互和其他街区没有在本轮重新回归。
