# v012 A1 咖啡厅橡木共享桌台面候选

共享桌原有 3 × 2.2 m 台面、Kenney 桌架、碰撞和四座交互，但台面仍使用发白的舱壁材质。候选取自 [Poly Haven Oak Veneer 05](https://polyhaven.com/a/oak_veneer_05)，作者 Jenelle van Heerden，[官方许可](https://polyhaven.com/license)为 CC0；本轮实际查看了[原始 2K 漫反射贴图](../../../production/black-hole-station/vendor/polyhaven-oak-veneer-05/oak_veneer_05_diff_2k.jpg)与项目场景近景，网页大图未完成目视核验。

[原始文件清单](../../../production/black-hole-station/vendor/polyhaven-oak-veneer-05/source-manifest.json)记录 2K 漫反射 JPG、OpenGL 法线 PNG、粗糙度 JPG 的官方地址、MD5 与本地 SHA-256；三件共 23,642,733 字节，原件及 Unity 导入件 6/6 次哈希核对通过。原始文件保留在 `production/black-hole-station/vendor/polyhaven-oak-veneer-05/` 和 `Assets/ThirdParty/PolyHavenOakVeneer05/Original/`，没有覆盖供应商贴图。

[候选装配脚本](../../../production/black-hole-station/component-a0b/add_v012_cafe_oak_table_trial.cs)只创建项目侧 [URP/Lit 材质](../../../QuQuArena3D/Assets/Station/Materials/V012CafeOakTableTrial.mat)，把木纹按台面 3 × 2.2 m 平铺，连接漫反射及法线，平滑度暂取 0.32。原粗糙度贴图已保留，尚未转换进 Unity 遮罩通道。脚本仅替换 A1 候选场景的桌面材质；台面网格、碰撞、桌架、四座锚点和咖啡厅稳定 ID 均未改，场景 8,846 个序列化对象 ID 全保留。

固定 70°、1280×720 机位：[入口前](before-entry.png)／[后](after-entry.png)、[柜台旁前](before-counter.png)／[后](after-counter.png)。55° 近景：[前](before-close.png)／[后](after-close.png)。近景可见木纹和较柔和的反射，远景台面不再发白；桌边仍是锐角灰盒形状，墙地灯光也未统一，因此只记为材质候选。Unity 检查确认法线以 `NormalMap` 导入、`_NORMALMAP` 已启用，当前 Console 无编译错误、0 错误、0 警告。场景 SHA-256：`FB4CBA59D6CE7F98D45C269E3AD2C26E2DCFB270CE95EA629146491F04864638`。上一版 Windows Player 不包含本次材质修改。
