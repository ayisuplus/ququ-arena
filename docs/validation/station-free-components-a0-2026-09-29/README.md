# v012 免费组件 A0 首轮：Kenney Space Station Kit

日期：2026-09-29。当前工程 `QuQuArena3D`，Unity 6000.3.24f1／URP 17.3.0，基线 Git `52aa300`。本轮只完成 Kenney 资源的获取、包内核查、9 件模型的 Unity 技术导入和官方随包预览目视；未制作或验收 v012 的完整视觉样板。

## 来源与原包

- 作者与页面：[Kenney — Space Station Kit](https://kenney.nl/assets/space-station-kit)，免费 CC0；[原始 ZIP](../../../production/black-hole-station/vendor/kenney-space-station-kit-1.0/kenney_space-station-kit.zip)与随包 [License.txt](../../../production/black-hole-station/vendor/kenney-space-station-kit-1.0/License.txt)保留。
- 原始下载链接：`https://kenney.nl/media/pages/assets/space-station-kit/6475288f2e-1712749919/kenney_space-station-kit.zip`；ZIP SHA-256：`215e79bd5415cff93665183390f0343ed9acf87780306331013b78520170c6d8`，与本次官方直链下载内容一致。
- ZIP 有 506 个条目；含 97 个 FBX、97 个 GLB、97 个 OBJ、贴图与预览。未把全部模型塞入 Unity。测试导入 [9 个 FBX 和色图](../../../QuQuArena3D/Assets/ThirdParty/KenneySpaceStationKit/Models/)，原始材质／模型文件保持供应商命名。

## Unity 导入结果

运行中的当前工程 Editor 已确认 `ready`、处于非 Play 模式、打开的 W4P 场景无未保存改动。通过 [检查脚本](../../../production/black-hole-station/component-a0b/inspect_kenney_import.cs)用 `eval_file` 实测：9 个模型都能被 `AssetDatabase` 加载，材质着色器为 `Universal Render Pipeline/Lit`；墙、转角、门洞、窗墙、地板、地板板件、单门、椅、桌都没有自带 Collider。首次 `Refresh()` 耗时超过 Pipeline 单次 5 秒限制，随后 Editor 返回 `ready`；去掉重复刷新后同一批资产检查成功。该超时不是导入失败证据。

| 实测模型 | Unity 原始包围盒 | 三角面 | 对样板的含义 |
| --- | --- | ---: | --- |
| `wall.fbx` | 1.0 × 1.0 × 0.3 m | 44 | 人眼高样板需要明确缩放与模块间距 |
| `wall-corner.fbx` | 0.8 × 1.0 × 0.8 m | 92 | 与直墙边长不同，需验证接缝 |
| `wall-door.fbx` | 1.0 × 1.0 × 0.3 m | 98 | 单独检查真实门洞净高 |
| `wall-window.fbx` | 1.0 × 1.0 × 0.3 m | 104 | 单独检查黑洞视线与窗框遮挡 |
| `floor.fbx` | 1.0 × 0.3 × 1.0 m | 12 | 楼板厚度与通行碰撞需项目侧处理 |
| `door-single.fbx` | 0.4 × 0.7 × 0.1 m | 52 | 原尺寸低于成人通行尺度 |
| `chair.fbx`／`table.fbx` | 0.3 × 0.55 × 0.35 m／1.1 × 0.4 × 0.6 m | 62／104 | 家具与建筑不能按一个缩放系数机械放大 |

已查看随包 [官方预览](../../../production/black-hole-station/vendor/kenney-space-station-kit-1.0/Preview.png)：低多边形、圆润且橙白配色鲜明，更适合简化／玩具化画面。基于该预览及尺寸，**本轮不采用它作为“咖啡厅—短廊—黑洞观景台”的正式近景主建筑包**；保留原包和导入候选供接口试验或后续局部用途复核。尚未生成独立样板场景、设置碰撞、完成纹理绑定检查或运行 Player，不能据此宣称实机视觉通过。

## 下一步

优先检查 v012 所列免费 [3D Free Modular Kit](https://marketplace.unity.com/packages/3d/environments/3d-free-modular-kit-85732) 的真实预览和内容，并在隔离样板中试装。该包官方页面当前列免费、Unity 6000.3.11f1／URP 支持，当前工程导入、近景风格与性能仍未验证。内置浏览器多次超时；尝试外部 computer-use 时，工具因无法可靠确认浏览器 URL 而自动停止，本轮不继续浏览器窗口操作。工具可用后再完成商店包目视与获取。

原有 `ArenaFont.asset` 未提交修改保持原状；本轮未触及 W4P 场景、正式发行入口或存档。
