# SSAO 单区试片（v019 科研四机位）— 判定：回退

## 前提修正

SSAO 并未缺失。`Assets/Settings/PC_Renderer.asset` 的 `m_RendererFeatures[0]` 已是
`ScreenSpaceAmbientOcclusion` 且 `m_Active: 1`。当前序列化值：`Downsample 1`（半分辨率）、
`Source 0`（仅 Depth）、`Radius 1.2`、`Intensity 1.3`、`Samples 1`、`AfterOpaque 0`。

试片改的正是这四项：`Downsample 0`、`Source 1`（DepthNormals）、`Radius 0.35`、`Intensity 0.9`。
`AfterOpaque`、`Samples`、`BlurQuality` 不动。改动通过
`StationR2Rework.ConfigureSsaoTrial` 写入既有 feature，不新建 feature，
也未复用 `ArenaDivineBuild.Configure()` 的参数常量（那套是 Radius 0.24 / Intensity 1.15 / Source 0）。

参数前后对照见 `ssao-settings.json`；试片前的资产原文留档在 `pc-renderer-before.asset.txt`。

## A/B 方法

同一探针（`StationAnnexRenderProbeV018` 的 `--station-r2-ssao-render`，只跑科研四机位）、
同一分辨率（1600×1000）、同一相位、同一场景，唯一变量是 `PC_Renderer.asset`。
两次都绑定 `QuQuArena3D/BuildV019/StationV019.exe`，构建报告 `result: Succeeded / errors: 0`。

- `research-before/`：还原后的原参数（`Downsample 1 / Source 0 / Radius 1.2 / Intensity 1.3`）
- `research/`：试片参数

## 逐像素结果

|机位|meanAbsDiff|maxAbsDiff|最亮15%像素亮度变化|场景整体亮度（改前→改后）|
|---|---|---|---|---|
|research-arrival|0.164|142|-0.01%|125.45 → 125.53|
|research-turn|0.387|157|+0.20%|73.89 → 74.03|
|research-court|0.510|87|-0.02%|99.39 → 99.63|
|**research-near**|**9.743**|97|**-14.82%**|129.02 → 122.31|

## 判定

**回退。** 两项验收标准里第二项不达标：`research-near` 的最亮 15% 像素平均亮度下降
14.82%，超过计划里 8% 的上限；目视也确认整个白墙与白地面被整体压成脏灰，而不是
只在家具与地面交界处出现接触暗部（见 `research-near-after-small.png` 对比
`research-near-before-small.png`）。其余三个机位几乎没有变化（meanAbsDiff ≤ 0.51），
说明半径 0.35 + 全分辨率的接触暗部在科研区这种大尺度开敞空间里基本不显现。

`PC_Renderer.asset` 已用 `git checkout --` 还原到 `Downsample 1 / Source 0 / Radius 1.2 /
Intensity 1.3`。全站推开不做。

## 结论

单区试片已经回答了问题：当前 SSAO 配置真正造成"发灰"的是**半径远大于建筑尺度**，
而不是分辨率或深度源。若日后要改，应单独试更小半径（如 0.1–0.2）并保持
`Downsample 1 / Source 0`，而不是本次这组"全分辨率 + 小半径"的组合——后者在大开敞区
既不产生接触暗部，又把墙面整体压暗。