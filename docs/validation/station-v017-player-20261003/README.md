# v017 开敞生态公园：技术验收与实机画面

2026-10-03。用户要求主园不要屋顶；独立v017候选已拆除24个顶棚/入口遮棚对象，扩大检查0残留。自然层次、睡莲/纸莎草、低喷泉和亲和光照已实装。**技术通过、有记录的限制；完整视觉与水声听感待用户审阅。** 未将候选或AI图标为正式视觉认可。

## 已验证

| 检查 | 结果及证据 |
| --- | --- |
| 原生空间与保护区域 | [871项通过](../station-v017-open-park-20261003/spatial-audit.json)，检查4,589,741个全LOD顶点和420个角色胶囊采样；这不是实际可见三角面数 |
| 拆顶与交互对象 | [扩大顶棚检查](../station-v017-open-park-20261003/roof-final-eval.json)0残留，四门、两个原门交互保留；六作物、照料台和原座位沿用 |
| Win64构建 | 原v016与v017均Development + DetailedBuildReport成功，0错误；[最终候选](metrics-final-candidate-build-report.json)有1条既有Pipeline运行时未启用警告；[最终基线](metrics-final-baseline-build-report.json)另记录ArenaGame的CS0109；未为测试打开运行时HTTP服务 |
| 日常路线与交互 | 两相位0/97各[488](daily-phase0/daily.json)/[488](daily-phase97/daily.json)项通过，0卡点；含咖啡、座位随环、照料、主园回游和外侧通路 |
| B03副馆 | 两相位各[59](interior-phase0/route.json)/[59](interior-phase97/route.json)项通过；入口、中央/环路和出口检查。新蕨曾落在铺装/低于床土，已否决并收进原种植床；203,168个顶点检查在床包络内，旧证据在`*-before-b03-fix`明确退役 |
| 资源与Shader | [最终原生审查](final-asset-audit.json)：1367项依赖、0缺脚本、0水Shader编译错误；依赖与tracked+本轮资产核对，0遗漏 |
| 座位与稳定身份 | [原生核对](completion-state.json)四座均有新增橡木接触材质，[施工](oak-contact-install.json)8片且0新增碰撞；[身份比较](stable-identities.json)158/158个序列化StableId及重复数完全一致 |
| 水面动态 | 环、反射和粒子停用时，两张相隔2秒的正常Player相机水面截图，水色区域62,809像素中70.80%变化至少2级；[原始帧A](perf-visible-candidate/water-motion-a.png)、[帧B](perf-visible-candidate/water-motion-b.png)，轻微法线波动验证，不是流体模拟 |

## 正常独立窗口性能

同一RTX5090、D3D11、1600×1000、玩家RendererIndex=1/后处理/抗锯齿，曝光不变；原v016和新v017分别独立运行，不重叠采样。两份最终构建使用哈希相同的探针程序集。每机位稳定3秒后采8秒，之前预热24秒。每个采样帧都有主相机渲染回调，水/叶片/玻璃与反射按原运行组件工作。原始报告：[基线](perf-visible-baseline/performance.json)、[候选](perf-visible-candidate/performance.json)、[评价](evaluation.json)。

| 机位 | 施工前p95(ms) | 施工后p95(ms) | 增幅 |
| --- | ---: | ---: | ---: |
| 入口 | 3.217 | 3.411 | 6.02% |
| 林下 | 3.289 | 3.382 | 2.82% |
| 水岸 | 2.992 | 3.085 | 3.11% |
| 喷泉 | 3.729 | 4.035 | 8.20% |

实际每渲染帧均值如下；批次计数与绘制调用计数在这次数据中相同。计数覆盖整站渲染、阴影及反射相机，不能解释为公园独立可见面数。入口/林下三角面增加约44%/41%，实测帧时间增幅另表列出，不承诺较低配置性能。

| 机位 | 绘制调用 前→后 | SetPass 前→后 | 三角面(百万) 前→后 | 阴影对象 前→后 |
| --- | ---: | ---: | ---: | ---: |
| 入口 | 1963→1912 | 122→125 | 3.515→5.044 | 498→427 |
| 林下 | 1867→1848 | 129→132 | 2.891→4.078 | 209→176 |
| 水岸 | 919→871 | 85→92 | 2.558→2.848 | 574→512 |
| 喷泉 | 3357→3308 | 232→233 | 5.011→5.098 | 443→373 |

P01保持原`lodBias=2`，根据原生包络/阈值计算两道切换边界31.82m和89.09m，实际保存相机距离30.03/33.85m、83.87/94.56m及[四张切换对照](perf-visible-candidate/performance.json)。这是高位诊断取景，未强制LOD，与四个人视性能机位分开；静帧可检查切换两侧形态，不将它当作所有植被运动观感的用户验收。

候选运行前冻结[性能门槛](performance-contract.json)：p95不超过max(16.67ms，基线×1.25)。此硬件与设置通过；未测试较低配置或其它图形API，不由此作低端设备承诺。最初隐藏窗口仅采更新帧、没有绘制回调计数，已在`perf-baseline/status.json`明确退役，不混入性能结论。

## 画面与制作

正常Player相机原生截图：[入口](perf-visible-candidate/entry.png)、[林下](perf-visible-candidate/plant-layers.png)、[水岸](perf-visible-candidate/water.png)、[喷泉](perf-visible-candidate/fountain.png)。当前主园[无顶总览](../station-v017-plants-20261003/final-v007-garden-overview.png)、[园内人视](../station-v017-plants-20261003/final-v007-garden-interior.png)、[休憩低视点](../station-v017-plants-20261003/final-v007-garden-rest.png)、[木色接触面](../station-v017-plants-20261003/final-v007-seat-wood-contact.png)与[P01特写](../station-v017-plants-20261003/detail-p01-canopy.png)/[B03 P03特写](../station-v017-plants-20261003/detail-p03-collection.png)为原生Editor取景，完整复制玩家URP配置，另记相机位置，不称作Player性能图。休憩图是1.45m眼高的坐姿构图参考，非触发坐下交互后的截图；旧v006主园画面为木片加入前的阶段。

P01/P02/P03/W01合计115积分；原模型、采用/否决版本、供应商CC0、任务与哈希见[制作记录](../../../production/black-hole-station/v017/README.md)。全站30处反射已有v017初始烘焙；动态更新仍由原组件运行。基础5600K、园区补光5300K、停留3500K；首次暖染白墙试样否决，未通过全局曝光补偿。

## 保留与限制

原v016场景SHA256仍为`22EAD44324BD2E8FA42318D6CB97D28E3A6B4553857C546599DEB27471A203BB`。构建钩子的性能测试文件和URP标志按预先字节备份恢复。**字体原有dirty仍留在工作区；首次构建后动态字距/连字缓存哈希不同，未取得原始字节副本，未猜测重构或回退，未纳入本轮提交。** 详见[preservation-status](preservation-status.json)，不能声称全部前置文件逐字节未变。

[最终证据封存](final-evidence-seal.json)绑定最终候选`build_ce5960423447`、基线`build_04eaa618415f`、关键构建文件、24份原始报告与105张原生图片的本地SHA256。日常回归使用较早构建；B03通路来自归根后的`build_590fb8e5fd15`，本次8片木条无碰撞、未改交互，另有最终871项空间和158个身份核对。最终可见性能、绘制计数、LOD画面来自当前同探针构建。旧性能在`*-before-metrics`退役，旧证据封存见`final-evidence-seal-before-wood.json`（对应提交7359960e的历史阶段）。全部v017原生图片强制纳入Git归档；[提交范围检查](precommit-audit.json)核对前置文件排除、GUID和敏感内容，不将`.cache`里的本机构建物纳入提交。[完成审计](completion-audit-v001.md)逐条列出规格与证据，视觉任务仍待用户。

本轮候选不接核心赛事、完整世界存档或生态模拟。`GardenWater.wav`局部循环声已接入，尚未作人工听感审阅；完整园区视觉认可继续由用户决定。源场景、旧版本、前置未跟踪玻璃/灯具与v016脚本都保留。
