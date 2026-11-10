# v012 免费组件 A0b：Quaternius Modular Sci-Fi MegaKit Standard 试装

日期：2026-09-29。此记录只评价免费 Standard 版在当前 Unity 工程的局部试装，不代表完整样板、Player 或视觉验收。

## 来源与范围

- 作者：[Quaternius 官方包页](https://quaternius.com/packs/modularscifimegakit.html)、[官方下载页](https://quaternius.itch.io/modular-sci-fi-megakit)。通过作者的免费 Standard 下载流程获取；未购买 Pro 或 Source。
- [原始 ZIP](../../../production/black-hole-station/vendor/quaternius-modular-scifi-megakit-standard/Modular%20SciFi%20MegaKit%5BStandard%5D.zip) 为 48,559,316 字节，SHA-256 `6fae60cf5189e44dff0bd91097f094a765acc6d57d64a85a0cc0dd56e03035e3`；ZIP 完整性检查通过，共 1,195 个条目。保留包内 [License_Standard.txt](../../../production/black-hole-station/vendor/quaternius-modular-scifi-megakit-standard/License_Standard.txt) 和三张作者预览。许可文本写明 Standard 只含部分模型，CC0 1.0；付费 Source 版才提供预设 Unity URP 工程和自定义着色器。
- 从原包 `FBX (Unity)` 中只导入 10 个墙体、窗、门及平台模型，连同 21 张纹理进入 [隔离的第三方目录](../../../QuQuArena3D/Assets/ThirdParty/QuaterniusModularSciFiMegaKitStandard/)；未导入包内其他格式副本和演示逻辑。保留 Unity 生成的 `.meta` 与 GUID。

## 当前工程实测

在 Unity 6000.3.24f1／URP 17.3.0 的当前 Editor 内，[检查脚本](../../../production/black-hole-station/component-a0b/inspect_quaternius_import.cs)能加载全部 10 个 FBX；材质导入为 `Universal Render Pipeline/Lit`，主要色图自动关联。10 件均无 Collider。墙直段约 1.209 × 3.028 × 4.000 m；两件方转角约 4.4–4.8 m 宽、3.03 m 高；简单平台为 4 × 4 m、无厚度；门框高约 5.013 m，高于约 3 m 的墙件。还需核对模块接缝、门洞净高、玻璃透明和纹理通道，不能直接当可通行建筑使用。

[独立试装场景](../../../QuQuArena3D/Assets/Scenes/StationFreeKitTrial_QuaterniusA0b.unity)放置 10 件模型、中性光和概览相机。[Unity Game View 截图](quaternius-a0b-gameview-v2.png)已经目视核对：模型可渲染、无粉色材质；画面是分件陈列，尚未构成咖啡厅—短廊—观景台。作者预览与当前试装都偏深色工业／实验室风格，适合作为短廊局部备选；是否能成为生活区主建筑语言尚无证据。正式 W4P 场景已恢复，发行入口与业务脚本未改。

进一步用[隔离短廊场景](../../../QuQuArena3D/Assets/Scenes/StationFreeKitTrial_QuaterniusCorridorA0b.unity)验证 4 m 宽、8 m 长的两节拼接：[构建脚本](../../../production/black-hole-station/component-a0b/build_quaternius_corridor_trial.cs)只复用已导入的墙、窗和平台模型，布置两侧墙、地面、翻转的平台顶板和独立 Box Collider；未更改供应商模型。 [第一人称高度 Game View](quaternius-corridor-a0b-gameview.png)显示连续墙地顶、接缝可见但无明显断裂，也没有粉色材质；两端仍敞开，未接门或转角。当前 Edit 模式场景有 6 个 Collider，从廊内向下和向窗侧射线均命中预期 Collider。`M_Glass` 在当前导入材质中 `_Surface=0`、`renderQueue=2000`、`_BaseColor.a=1`，即为不透明渲染，窗不能算已通过透视验收。顶部复用零厚度平台，只验证了封顶画面，尚无真正顶板厚度或碰撞。

同日重新连接了 [Unity Asset Store 的 3D Free Modular Kit 页面](https://assetstore.unity.com/packages/3d/environments/3d-free-modular-kit-85732)：正文、官方预览、免费标价、版本 3.5、6000.3.11f1／URP 兼容表可读取。页面风格更贴近待验证的亮色室内方向，但这只是供应商预览；包内容已查看。用户登录后领取按钮仍无成功状态，“我的资源”页面显示为空，详见[主建筑包初筛](barking-dog-a0a.md)。故**未确认已领取、下载或导入**，也未将网页兼容声明记为本项目实测。

下一步优先解决商店包的正常获取与隔离试装，再以同一空间尺度和固定机位比较候选。当前 Quaternius A0b 已通过导入、分件渲染、短廊静态画面和局部碰撞射线检查；玻璃不透明，门、转角、完整装配、第一人称通行、Player、性能与审美认可均未完成。短廊只保留为备选，不据此替换 W4P 的视觉对象或业务锚点。
