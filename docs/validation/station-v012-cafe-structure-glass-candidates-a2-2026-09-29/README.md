# v012 A2 咖啡厅街架与玻璃饰面弃选记录

以已实际查看的 [Quaternius Standard 供应商预览](../../../production/black-hole-station/vendor/quaternius-modular-scifi-megakit-standard/Preview_2.png)中的深色结构与浅色舱壁层次为参考，在已保存的[独立视觉样板](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationVisualSampleV012A1.unity)上做临时同机位渲染；没有保存任何候选到场景。供应商预览是资产展示，以下截图才是本项目 Unity 6／URP 的实际候选画面。

第一组只给 `Southeast covered public street sample` 下的 6 根 `Cafe approach frame` 和 2 根梁试换现有 `P2-competition-graphite`、`P3-lounge-warm-charcoal`。与[原画面](frame-before-cafe.png)相比，[石墨灰试装](frame-graphite-cafe.png)只让局部线条变暗；咖啡厅入口与更远的浅色构件仍占主导，街口看向咖啡厅的构图几乎不变。因此两种换材均弃选，不把局部色块变化当完整结构设计。

第二组克隆原 `P3-pressure-window`，仅临时赋给咖啡厅及街口 9 片玻璃，试过中性清透 RGBA `(0.26, 0.29, 0.31, 0.14)`、中性烟灰 `(0.19, 0.21, 0.24, 0.32)` 和暖清透 `(0.32, 0.30, 0.27, 0.20)`；三者金属度 `.18`、光滑度 `.84`，原材质未改。[咖啡厅基线](frame-before-cafe.png)与[烟灰候选](glass-smoke-cafe.png)、[仰视基线](glass-before-roof.png)与[烟灰仰视](glass-smoke-roof.png)显示主要只是天空冷暖与明暗变化，没有解决空间显空、浅色构件和入口比例问题。三种玻璃候选均弃选。

临时替换在 Unity Editor 渲染后恢复原材质并重载场景；保存的场景 SHA-256 仍为 `1415CCED3CBFC63DB8E3234793CCCED6A225DAE5DE551CFE718B40B1074B3FFE`。本记录保留失败方向，避免下一轮重复用小幅调色掩盖陈设和结构问题；不代表用户对现有画面的审美认可。
