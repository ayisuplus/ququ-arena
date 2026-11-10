# v012 A0a/A0b：Barking Dog 免费模块包试装

日期：2026-09-29。当前工程 Unity 6000.3.24f1／URP 17.3.0。本轮从已拥有的海外资源中试装 **3D Free Modular Kit**，结果只适用于独立[候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationComponentTrialV012A0B.unity)，未替换 W4P、A1 咖啡厅、业务锚点、存档或默认发行入口。

## 来源、许可与版本

- [作者商店页](https://assetstore.unity.com/packages/3d/environments/3d-free-modular-kit-85732)当前显示免费、Standard Unity Asset Store EULA、v3.5／10.3 MB、2026-09-25 更新，并声明适用 6000.3.11f1／URP。实际查看官方图廊首图：白色模块、深色腰线、圆角和发光门框适合短廊候选；宣传图不等于本工程效果。
- 账号的原生 Package Manager 在 **Releases** 中只列 v2.5（2026-04-07）及 Original；本机 Download 后显示 **Import 2.5 to project**，缓存为 39.93 MiB。网页 v3.5 与可下载 v2.5 的差异未解决，不声称拿到了新版。
- 本地原包及备份路径、41,872,996 字节和 SHA-256 `829A1C14839137D5951991DF5F908AE1DB3AC8E679A78698816F3C026EA09761` 见[下载记录](../unity-asset-store-download-2026-09-29/README.md)。原包中的嵌套 URP 包 SHA-256 为 `5119BEB494ADCF82320381DE4B5C5C3FEF0D3EF58B4730879914A26DEC6B274F`。随包 Readme 允许用于游戏／应用，但不允许把网格、数据或贴图当素材转售；项目仅保留在本地 Git 工作区，发行与共享仍须遵守商店 EULA。

## 现有资源与选型

| 候选 | 实际检查 | 决定 |
| --- | --- | --- |
| 本包 v2.5 | 官方预览与本工程截图均已目视；包内有 17 个 FBX、22 个 Prefab、3 个 URP 材质及贴图。直墙、90° 弧墙、门框、带小窗门扇、地板、顶板和灯可用；**没有独立墙窗模块或家具** | 保留为短廊主候选；不能单包覆盖观景台和咖啡厅 |
| [Kenney Space Station Kit](https://kenney.nl/assets/space-station-kit) | 前轮已看随包预览、导入九件；圆润低多边形、橙白配色，与本轮包的较写实硬表面不统一 | 仅保留接口测试，不混作近景正式主包 |
| 工程已有 Quaternius 免费部分 | 本地有 `WallWindow_Straight.fbx` 等窗墙和材质源；本轮没有完成与 Barking Dog 同机位材质目视 | 暂不混入；先核对跨包接缝与统一材料成本 |
| 原 A1 咖啡厅壳体与玻璃 | [同机位实机图](../station-v012-cafe-frame-a1-2026-09-29/README.md)已核对，具备可视向外的玻璃与现有业务锚点，但仍是候选灰盒 | 保持原状；短廊过渡接口需另做 |

真实建筑参考仍沿用 v011 的 SOM Moon Village 研究图、ESA／NASA Cupola 实物资料和 NASA 黑洞可视化，分别用于结构／观景关系与黑洞识别；尚未据本次试装冻结整站美术方向。本轮没有用 Meshy 积分，也没有购买组件。

## 导入边界和技术结果

只从已下载原包的**嵌套 URP 包**解出 `Assets/Barking_Dog/3D Free Modular Kit_URP` 下的 `Meshes`、`Prefabs`、`Textures`、Readme 及原始 `.meta`，保留供应商路径与 GUID。未导入外层 Built-in／HDRP 包、`Common Scripts`、演示场景、光照数据、Volume Profile 和 URP 项目设置。新增 TIFF 的 Git LFS 规则；未更改已有项目配置。场景构建及检查脚本位于 [component-a0b](../../../production/black-hole-station/component-a0b/)。

原包和备份保留原始字节；Unity 导入后按本项目 Force Text 设置把 **21 个 Prefab、3 个材质**重序列化为 YAML。对照嵌套包的 102 个选中资产／meta 文件，差异只在这 24 个可重序列化文件，`.meta`／GUID、FBX、贴图和 Readme 均与包内相同。后续供应商升级须从原包重新比对，不能把项目中的 YAML 当作供应商原始字节。

- Unity `AssetDatabase` 核对 **22/22 Prefab**：缺失脚本 0、缺失 Mesh 0、缺失材质 0；七个代表件的材质均为受支持的 `Universal Render Pipeline/Lit`，无粉色材质。
- 代表件包围盒：直墙 **0.25 × 3 × 3 m**，90° 弧墙 **3 × 3 × 3 m**，门框 **3 × 3.75 × 1 m**，地板 **3 × 0 × 3 m**，顶板 **3 × 0.75 × 3 m**。七件三角面数为 2–132；原 Prefab 除灯外已有 Collider。实际需要按枢轴与墙面朝向拼接，首次朝向错误的黑面已在候选场景修正。
- 中性 3 m 网格试廊在 Game View 渲染，另放转角及门扇供独立查看：[短廊画面](corridor-final.png)、[转角与门画面](corner-trial.png)。当前画面与供应商宣传图分开评估；发光/灯光色调偏冷紫，和 A1 咖啡厅的暖橙照明之间需要材料与过渡设计，尚未获用户审美认可。
- Editor Play 中，中央位置向下射线命中地板，左右射线命中两侧墙；门框中央半径 0.3 m、高约 1.9 m 的胶囊体不与 Collider 重叠，前向射线穿过门框。退出 Play 后场景已保存。`console_status` 显示编译未失败、当前 Console 错误和警告均为 0。最初两盏供应商灯的软阴影触发阴影图集降采样警告，候选场景已关闭这两盏灯的阴影，不改供应商 Prefab。
- 供应商 `Metal_01.tif` 当前导入为 sRGB 纹理；作为金属度/光滑度贴图是否需要项目侧纠正仍待对照，不改原始 `.meta`。缺墙窗、端部封口与门扇开合也未通过试装证明。

## 下一步

先查明新版 v3.5 是否能通过官方 Package Manager 正常取得；若仍只提供 v2.5，继续用现有 A1 玻璃结构满足观景视线，并用 Blender 精确补短廊与咖啡厅的收边，暂不把不一致的窗墙包硬混入。随后在独立视觉样板中做入口—咖啡厅—短廊—观景台的完整装配，检查业务稳定 ID、连续键鼠路线、固定机位对照、Windows Player 和性能；本轮的静态试廊不能代替这些验收。
