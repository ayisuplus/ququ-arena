# v013 咖啡厅反射修复 · 2026-09-30

基线 `61b9aee`。本节点修复局部反射缺失，不代表 P1/P2 或全站视觉竣工。Unity Essentials（插件内部名称 `unity-workbench` 0.1.3）的构建验证规范用于核对本次证据。

## 原因与改动

`Cafe local reflections` 原为 Realtime，但当前 QualitySettings.realtimeReflectionProbes=false，实际 texture=null。材质只使用默认环境反射，缺少室内信息。

在 v013 候选场景将该探针改为 Custom，使用 Unity Lightmapping.BakeReflectionProbe 生成 256px HDR Cubemap；包含非静态家具，烘焙期间暂时隐藏访客灰盒身体并在 finally 恢复。保留原体积、位置、强度、盒投影及全局质量设置。源资产 `Assets/Station/Textures/SereneReflectionsV013/CafeInterior.exr` 和 meta 随工程保留。室内结构或照明后续改变时，使用生产目录 `reflection-repair/repair.cs` 重新烘焙。

## 验证

| 判据 | 结果与证据 |
| --- | --- |
| 原故障复现 | [修复记录](repair.json)：Realtime、texture=null、全局实时探针关闭 |
| 同机位实际变化 | [左右对比](service-comparison.png)，左修复前、右修复后；[像素差异](pixel-difference.json)中咖啡厅4个机位有变化，廊道/观景/黑洞5个机位逐像素一致（共9个机位） |
| Win64 构建 | [日志](build.log) V013_BUILD_RESULT Succeeded errors=0；[989项快照](build-snapshot.json)逐项SHA256核对 |
| 实机反射绑定 | [Player记录](player/route.json)：Custom、CafeInterior、256px；全局Realtime仍false |
| 路线与座位 | 同一Player：34段往返、10座全部通过，使用隔离fresh存档；新六座实际通道行走，旧四座保持既有传送到近座测试边界 |
| 身份与旧版 | [清单](artifact-manifest.json)：原9714序列化ID全部保留；原v012场景SHA256不变 |
| 视觉核查 | 实际查看修复前后吧台及Player第6座画面，室内反射恢复；尚无用户审美验收 |

构建输出 `E:/builds/black-hole-station-v013-reflection-repair-20260930/BlackHoleStation.exe`，RTX5090、D3D11、窗口1600×900，探针截图1280×720。构建日志保留既有 LicensingClient validation ignored 信息，构建最终成功；Player日志无异常。未声称长时性能、真人键鼠游玩或全站发行验收。

Unity/Meshy/GDS/Blender 本节点初始核查均可调用；Meshy余额1546，本次无生成消费。后续按用户新指示直接施工，不重复工具链体检。预存字体、Poly Haven 吊灯和缓存改动未提交。

