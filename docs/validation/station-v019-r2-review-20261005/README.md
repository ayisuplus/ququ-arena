# R2 科研—阅读、阅读—咖啡成对审阅（v019 B 包首轮）

2026-10-06｜施工基线 `f63dfd31`｜方案入口[三项问题整改执行清单 v007](../../黑洞空间站升级方案/v019/三项问题整改执行清单_v007.md)

**结论**：本批技术面全部通过并绑定同一次 Win64 构建；视觉面三区均有具体返修项，不关闭 v007 第 2/3 节的三项整站问题，也不代表 P4/P5 完成或用户视觉认可。

## 1. 构建绑定与上一轮失败

上一轮通过编辑器桥发起的构建 `build_cb631e2441f2` 失败：`ExecutionEngineException: String conversion error: Illegal byte sequence encounted in the input`，栈在 `com.unity.inputsystem` 的 `LinkFileGenerator` → `Assembly.GetCodeBase`，未产出 Player；失败原文保留在 `build-failure-excerpt.txt`。排查时另发现 Unity 拒绝以 `.cache` 作为 `-logFile` 目录名（`.cache is not a valid directory name.`），命令行日志必须写到仓库外。

本轮改用新增的 batchmode 入口 `Assets/Editor/StationCandidateBuild.cs`（`-stationCandidateScene` / `-stationCandidateOutput` / `-stationCandidateReport`），日志写入 `%TEMP%`：

```
G:/unity/6000.3.24f1/Editor/Unity.exe -batchmode -quit \
  -projectPath "E:/projects/黑洞空间站/QuQuArena3D" \
  -executeMethod StationCandidateBuild.Build \
  -stationCandidateScene "Assets/Station/Scenes/Candidates/BlackHoleStationDistrictsV019.unity" \
  -stationCandidateOutput ".../.cache/v019-r2-review-player/StationV019.exe" \
  -stationCandidateReport ".../.cache/v019-r2-review-build-report.json" \
  -logFile "%TEMP%/v019-r2-review-build.log"
```

结果：`Succeeded`，0 错误 / 1 警告 / 1,206,304,603 字节 / 18.63s（`.cache/v019-r2-review-build-report.json`）。本目录所有 `process.json` 均指向该 Player；渲染与路线回归全部由它产出。

## 2. 本批安装内容与保护核对

20 处 MeshFilter／材质引用替换，登记见 `installed.json`（逐项含旧网格、新网格与派生材质名）。

- `native-audit.json`：20 项 `geometryUnchanged=true`、UV 正常，渲染器与预制体 ID 对齐。
- `preservation.json`：对基线 `f63dfd31` 逐项核对，43,348 原对象全部保留，授权变更仅限上述 20 处。
- `coverage.md`：登记 1,712 个可见 MeshRenderer 的对象包归属与当前材质；20 项标为本批修订，其余为保留引用。列入清单不等于每个隐藏面已看过。
- 新增资产目录 `Assets/Station/Models/ResearchFinishV019v001/`（20 个 metric 网格 + 5 个材质）此前从未入库，本批随场景引用一并提交。核对结果：`HEAD` 版场景的 1,521 个外部引用全部可解析且无未入库依赖，本批首次引入该目录后闭包仍然完整（其余 4 个引用为 URP 包内资源）。

## 3. 正常可见 Player 渲染（`final/`）

RTX 5090 / Direct3D11 / 1600×1000，`passed=true`，`errors` 为空，反射 261 次捕获 / 7 个周期，R2 相关 8 处探针与科研 2 处探针均完成运行期更新。

| 机位 | 帧数 | 渲染帧 | P95 (ms) | Draw calls |
| --- | --- | --- | --- | --- |
| research-arrival | 1404 | 1404 | 7.235 | 6428.0 |
| research-turn | 1816 | 1816 | 5.984 | 2200.6 |
| research-court | 2145 | 2145 | 4.941 | 2136.1 |
| research-near | 2080 | 2080 | 5.084 | 2399.3 |
| reading-arrival | 1948 | 1948 | 5.311 | 3609.4 |
| reading-turn | 1867 | 1867 | 5.754 | 3524.7 |
| reading-court | 1589 | 1589 | 6.955 | 2829.0 |
| cafe-arrival | 1566 | 1566 | 7.369 | 2054.8 |
| cafe-turn | 1723 | 1723 | 7.005 | 1308.4 |
| cafe-court | 1789 | 1789 | 5.990 | 2244.0 |
| cafe-street | 2024 | 2024 | 5.278 | 1941.0 |

该结果只适用于本构建与上述机位，没有同配置的施工前增量对照。

## 4. 路线与身份回归（`route-*/`）

同一 Player，相位 0 / 97 各一轮，全部 `passed=true`、`obstructions=0`、`unsupportedSamples=0`、退出码 0。

| 路线 | 相位 | 检查项 | 距离 (m) | 用时 (s) |
| --- | --- | --- | --- | --- |
| research | 0 | 345 | 559.774 | 239.4 |
| research | 97 | 345 | 559.842 | 239.4 |
| reading | 0 | 253 | 303.010 | 138.9 |
| reading | 97 | 253 | 302.956 | 138.9 |
| cafe | 0 | 361 | 539.674 | 236.3 |
| cafe | 97 | 361 | 539.494 | 236.1 |

两个相位不足以替代最不利相位扫描；本批也未覆盖居民日常、跨缝运动与公园照料回归。

## 5. 视觉审阅结论（11 机位逐张查看）

**科研**：布局与立面节奏在 `research-turn` 上成立——竖向白色鳍片、深蓝凹入面、可见折返楼梯，是三区中区分度最好的一处。返修项：① `research-arrival` 画面上三分之一是一整块无分缝的纯白檐底板；② 入口雨棚为一块薄板加一根极细立柱，缺少厚度与落位；③ `research-court`／`research-near` 室内天花为大面积平白，家具与地面之间没有接触暗部，投影边缘过硬；④ `research-arrival` 近处地面出现方向性拉花，疑似反射或 UV 尺度问题；⑤ 相邻体量右侧为整片无纹理橙棕平面。

**阅读**：三层与退台在 `reading-court` 上可读，室内书架、木格栅与暖白顶灯可见。返修项：① 深蓝窗间板横贯整面立面，无分缝与退台变化；② 玻璃在近景与远景读不出反射差异，栏板近乎不透明；③ `reading-turn` 下半幅是几乎无差别的白甲板，网格线极弱；④ 木檐／檐底为单色棕，无方向与尺度；⑤ 右侧园内仍见线框式圆顶残留，与露天公园方向不一致。

**咖啡**：开放木檐与柱廊成立。返修项：① `cafe-turn` 檐底占画面近一半且为单色平 brown；② `cafe-arrival` 前庭为绿／蓝／青三块大色面，读作色卡而非街道；③ `cafe-street` 俯视为整圈白甲板加几个绿顶盒，缺少屋面处理与街道家具；④ 白柱为纸薄圆柱，无柱脚与倒角；⑤ 甲板边缘出现白色锯齿边（疑似共面闪烁）。

三区共同的系统性缺陷：没有接触阴影、窗为灰片、纯色板占主导。这些不是本批引入，但正是 v007 第 4 节要关闭的对象。

## 6. 未关闭与证据边界

- `trial/`（10 张）与 `installed/`（11 张）没有 `process.json`，绑定不到任何一次构建，只作为安装前后对照参考，不计入通过结论。`baseline-r2` / `baseline-cafe` / `baseline-reading` 使用的是更早的 `.cache/v019-r3-finish-player`。
- 本批只审 R2 三区。其余五区、公园与港区边界、固定抵达组、R1 赛事接口均未进入本批。
- 跨区辨识、最不利相位连续漫游、整站性能对照与用户最终视觉认可仍未关闭；核心赛事接入与完整世界存档继续按原范围暂缓。
- 本目录的 PNG 按 `.gitignore` 第 35 行 `docs/validation/**/*.png` 不入库，只保留在本机；报告、日志、覆盖表与 `process.json` 随提交入库，图片缺失时以本机证据目录为准。