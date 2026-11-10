# B01 连续瓷白窗沿与柔和反光

2026-10-02；基线 `44d08173`，仅独立 v016 候选。本批新增 Meshy 消费 **0**，原模型、旧版本和否决试件均保留。

## 采用的修改

沿用[原概念与真实建筑参考](../../黑洞空间站升级方案/v016/meshy-architecture-concepts/references.md)的连续白色曲壳方向，处理近景中窗顶粗糙的生成几何。按四片既有窗的轮廓裁掉局部毛边，建立连续实体瓷白收口。收口保留规则拓扑，上侧回折藏入原壳，未用布尔合并再次破坏其正面。它与壳面是相交的闭合部件，不据此宣称结构工程成立。

主壳经0.04m体素重采样、减面；移除减面产生的12个孤立平三角片，总面积0.009253m²。最终GLB和Unity均49,254三角面、四个渲染组和四种材质，原独立碰撞4,000面。宽×深×高25.516×21.956×14.622m，保留原26×22×16m上限和40×30m地块。

玻璃、实体内衬、银色窗框和木饰条的顶点/面完全不变。材质新增 `B01_SatinPorcelain_v004`，替换外壳和内衬的两个旧瓷白槽；底色不变，金属度0.18→0.08、光滑度0.71→0.56。玻璃、窗框与木材材质保持。只更新B01初始反射贴图，灯光和曝光未改。

[几何保存性](geometry-preservation.json)记录9,996个远离收口的外壳采样：到新表面的距离p99为0.01144m，最大0.03707m。此结论明确排除了收口修整区域，以及原窗腔左端、实体地面下方的一条窄边（73个采样，重采样后最大距离0.96858m，单独记录）。因此不声称整壳逐顶点不变。108条窗面短射线均未被新壳遮挡，三个其他材质组几何摘要一致。

## 取舍与诊断

- `rejected-direct-smoothing/`：直接平滑长三角面后，窗沿被拉离窗框，未采用。
- `rejected-remesh/`：均匀重采样后局部平滑，仍有皱褶和外沿断续，未采用。
- `rejected-normal-only/`：只调整法线，未消除真实几何折痕，未采用。
- `rejected-unioned-collar/`：新收口与原壳布尔合并再减面，细碎拓扑和锯齿接缝不合格，未采用。
- `diagnostic-no-lining.png`：临时去掉内衬的诊断画面，证明外沿折痕并非由内衬遮挡造成；取景后立即恢复，不是交付状态。

对应模型和脚本在 `production/black-hole-station/v016/b01-moon-sail/rejected-v004-*`。部分试件报告的几何passed不等于视觉采用；合并试件的failed也原样保留。

## 同配置原生实景

基线直接拍摄，六机位均1800×1200，复制完整玩家URP附加数据。最终图已更新B01反射贴图；六视角均实际查看。改动为本批壳/收口、瓷白粗糙度及初始反射，不是单变量几何对照。

| 视角 | 施工前 | 施工后 |
| --- | --- | --- |
| 街景 | [前](before-street.png) | [后](after-street.png) |
| 入口 | [前](before-entry.png) | [后](after-entry.png) |
| 背面 | [前](before-back.png) | [后](after-back.png) |
| 侧面 | [前](before-side.png) | [后](after-side.png) |
| 前窗近景 | [前](before-front-window.png) | [后](after-front-window.png) |
| 后窗近景 | [前](before-rear-window.png) | [后](after-rear-window.png) |

![连续瓷白窗沿](after-front-window.png)

## 验证

- [模型报告](../../../production/black-hole-station/v016/b01-moon-sail/refined-v004/geometry-report.json)：闭合、有效、预算及尺寸通过；[采样与108条窗面射线](geometry-preservation.json)通过。
- [Unity静态16项](audit.json)通过；[资产7项](asset-validation.json)与[包哈希](package-verify.json)通过。包 `pkg_b1c41aa071dd2d3d2d81d30b`，0.4.0。第一次验证误把整份包元数据作为平铺policy传入，触发默认UV要求，结果保留在 `asset-validation-wrong-request.json`；纠正为原既定纯材质policy后重测，未改模型或放宽原预算。
- [Editor旋转反射136项](runtime-reflection-editor.json)通过，含四馆与旧26区、初态/45°/97°；初态不称精确冻结0°。
- [保存性](preservation.json)：38,524条场景记录中38,522相同，只有B01 Prefab内的一条网格引用、两个瓷白材质槽和B01探针贴图改变；0增删，111个既有资产/运行源码及v015保持。
- [Win64构建](build.json) `build_0101d2587c7b`成功，0错误、既有2警告（RuntimePipelineConfig缺失、ArenaGame CS0109）；五个构建副作用文件已恢复，完整原生报告压缩存档。
- 同构建隐藏D3D11 Player在0°/97°各20项、共40项通过；路线分别131.6424/131.6405m，无阻挡/错误日志、退出码0。[封存清单](manifest.json)绑定实际326个构建输出；前置dirty字体保留并单独记录输入哈希，不提交字体。

收口近景明显减少皱褶，主帆轮廓保持；边缘分段转折、局部底边和连接细节仍需最终视觉审阅。房间仍空置/封闭，未增加家具、门、室内路线或身份。技术检查、静态视觉、正常可见Player性能与用户认可分别记录，v016整体验收未完成。
