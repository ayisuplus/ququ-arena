# v012 A1 咖啡厅—短廊门框上窗试装

日期：2026-09-29。施工只改[独立候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)。实测发现咖啡厅西出口至短廊北端约 11 m 已有连续地板、西侧玻璃、东侧咖啡厅外墙和 `y≈6.02 m` 的透明顶棚；不再重复铺一条低矮封闭廊。现有免费 Quaternius 门框顶约 `y=2.99 m`，与高顶棚之间约 3 m 的竖向断层才是本轮缺口。[真实参考记录](../station-free-components-a0-2026-09-29/real-reference-a0a.md)中 ESA Cupola 的厚窗框和 Jewel Changi 的透光网格顶棚用于判断框架与透光面的关系，未复制照片或建筑形制。

[搭建脚本](../../../production/black-hole-station/component-a0b/add_v012_portal_transom_trial.cs)在门框上方加入 4 m 宽的透明上窗、三根竖向收边、门框顶的小窗台、上窗顶梁，并以一根 `9.36 m` 横梁连接两侧现有 `x=184.5/193.5` 的高框架。玻璃和结构灰均复用项目既有材质；7 个项目侧 Cube/BoxCollider 的最低处约 `y=2.94 m`，不进入高 1.8 m 的玩家通道。构件相交检查确认横梁接触两侧高框架与透明顶棚，小窗台实际压入旧门框顶缘。初版仅有上窗时，近看像独立竖牌；加横梁后才有[正面](portal-after-close-front.png)和[侧面](portal-after-close-side.png)可读的连接。门框模型、供应商目录、原 W4P、默认发行入口和业务脚本未动。Unity YAML fileID 对比提交前场景：新增 37 个对象块、删除 0 个，既有对象块只有场景根列表改变。

同一[固定机位取景脚本](../../../production/black-hole-station/component-a0b/capture_v012_route_trial.cs)在 Edit 模式以 70° FOV、1280×720 拍摄[街道看门框施工前](portal-before-street.png)与[施工后](portal-after-street.png)。现在高顶棚、透光上窗和深色门框形成连续竖向层次；两侧白色结构与门框的材质反差仍明显，上窗玻璃的反射、厚度和最终受力表达未通过 A2 视觉验收。

Editor Play 使用项目原有 `CharacterController`：[咖啡厅至窗前 10 段路线](portal-controller-route.json)完成、逐步接地，仍只有门框前沿原有的 4 次轻微侧碰。[两侧旁路](portal-side-lanes.json)沿 `x=186.0` 与 `x=193.0` 分别南北往返 10 m，4 段均零侧碰、逐步接地。探索性扫描也暴露东侧余量窄：`x=193.1` 南行在门框附近有 5 次侧碰，`x=193.4` 在 `z≈-215.425` 停住；因此只证明已测中心线连续，不能声称整条东侧旁路宽敞。新增件都在玩家身高以上，低位接触不是上窗直接造成；具体原有接触面和可用宽度仍待定位。上述移动由测试脚本调用同一控制器的 `Move`，不等于实际键盘漫游。

更新后的[独立 Windows 预览](../../../QuQuArena3D/BuildV012A1PortalPreview/QuQuArena3D.exe)只打包候选场景；纯英文路径副本的 Unity 6000.3.24f1 构建报告 `Succeeded`，7.19 秒、1 warning、0 error。[provenance](portal-player-provenance.json)记录包与构建版本，候选场景 SHA-256 为 `9CE654F1ED2963B8AAF95A1CC596D86F941ABCB2EE8B7B33046077D39F23C3F5`，`QuQuArena3D_Data/level0` SHA-256 为 `127995597F55AAF9A4BFF2D9581DCEF62625D41C614D2AA6F4DC90ACD4CD85E6`。复制回项目的 188 个运行文件共 376,083,105 字节，和构建副本一致；未复制 `_DoNotShip`。隐藏窗口运行 15 秒仍存活，[Player 启动日志](portal-player-startup.log)显示 D3D11 初始化且未出现 `error/exception/missing/failed`；独立 QA 存档记下候选场景、安全起点 `(205,0.06,-209)`、咖啡厅 ID 和 6 位居民。构建副本沿用事先存在的 `ArenaFont.asset` 本地快照（SHA-256 `E53E494FD6886048083EAA556F04BF23BA2ABDF96760A0EB32294EE426A81317`）；源工作区该文件在验证后为另一哈希，仍保持未提交，本轮预览不代表其后续字体状态。

本轮只补齐门框上方一处视觉和构造断层。门框两侧仍有公共通行口，整段并非密闭压力舱；东侧旁路余量、门槛手感、咖啡厅主要陈设、Player 键鼠、性能和用户审美仍未验收，A1 继续施工。
