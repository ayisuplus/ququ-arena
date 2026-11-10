# v012 咖啡厅空间密度候选（2026-09-29）

## 结论

本轮没有修改正式场景。当前 22 × 22 m 咖啡厅从西入口看，主桌、四座、柜台之间留有大片空地；局部增加一组植物或桌椅不能独立解决空间尺度与重心。三种三维植物陈列和一组附加座位均仅在已打开的 A1 场景中临时实例化、同机位截图、销毁，最终 `sceneDirty=false`。下一步应先确定入口视线与咖啡厅的功能分区和主陈设体量，再决定绿植应处于什么位置，避免继续堆单件道具。

| 试摆 | 入口同机位 | 判断 |
| --- | --- | --- |
| 原场景 | [基线](baseline-entry.png) | 仅作比较；黑色赛事屏幕是 Editor 离屏截图状态，上一轮 Player 中已验证实际广播。 |
| 两处低花槽，植物原始尺度 | [入口](low-planters-entry.png) | 叶片太低，几乎不进入主画面；不采用。 |
| 两处放大花槽，植物 2 倍尺度 | [入口](large-planters-entry.png) | 植物可见，但花槽像隔挡，右侧逼近柜台行走和视线；不采用。 |
| 两处三级垂直种植架 | [入口](vertical-racks-entry.png) | 体量可见，但稀疏叶片与层板读成普通货架，遮挡窗景；不采用。 |
| 第二组已有桌椅、两座与吊灯 | [入口](second-seating-entry.png)、[南侧](second-seating-south.png) | 南侧近景可用，但入口主视角几乎无变化；在确定分区之前不加进场景。新增座位如果正式采用，必须追加到原 `StationCafeMoment.Seats` 而不改变前四座的顺序。 |

这些图是 Unity Editor 中固定 1280 × 720、70° FOV 的离屏试摆，不是 Player 实机美术验收，也未对候选进行性能、碰撞或长时运行验收。试摆时关闭了新增几何体碰撞；未改房间 ID、四座索引、路网或存档。

## 免费素材边界

选用 [Poly Haven Anthurium Botany 01](https://polyhaven.com/a/anthurium_botany_01) 作为植物候选，供应商页面预览已目视，选择官方 FBX 1K 和其依赖纹理。来源、作者 Rico Cilliers / Rob Tuytel、CC0、URL、文件大小与 MD5 / SHA-256 在[原包清单](../../../production/black-hole-station/vendor/polyhaven-anthurium-botany-01/source-manifest.json)中。原包存于 `production/black-hole-station/vendor/polyhaven-anthurium-botany-01/`；Unity 导入副本存于 `QuQuArena3D/Assets/ThirdParty/PolyHavenAnthuriumBotany01/Original/`，保留自动生成的 `.meta` / GUID。

实际 FBX 在 Unity 导入为六组网格，合计 67,152 三角面；不能直接采用导入器生成的单一 URP/Lit 材质，因为它没有叶片漫反射图和 alpha clipping。项目侧[派生脚本](../../../production/black-hole-station/derived/anthurium-botany-01/make_leaf_cutout.py)将原始漫反射 JPG 与独立透明 PNG 合成 RGBA，派生纹理及来源哈希见[派生清单](../../../production/black-hole-station/derived/anthurium-botany-01/source-manifest.json)。试摆只在内存中设置双面裁切材质；没有把材质或植物放入正式场景。素材仍可供重新设计明确位置后复评，当前三个陈列方案均弃选。

供应商宣传图、编辑器导入成功和本项目视角截图分别作为不同证据；不能据此宣称视觉、性能或用户认可通过。
