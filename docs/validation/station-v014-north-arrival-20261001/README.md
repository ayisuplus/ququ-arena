# 北侧抵达厅曲面屋顶候选

2026-10-01。候选 Assets/Station/Scenes/Candidates/BlackHoleStationEcologicalGardenV014.unity，基线dc56a881。延续降低刺眼感与恢复蓝色区分的调整，本轮改造屋顶轮廓与厅内视线。正式四翼场景未改，并非最终视觉验收。

![候选第一人称实景](../../黑洞空间站升级方案/v014/north-arrival-20261001/hall.png)

![曲面与上层通廊关系](../../黑洞空间站升级方案/v014/north-arrival-20261001/side.png)

以上为Editor Play离屏截图，未后期调色，非效果图、非独立Player截图。

## 实装

- 原创Blender曲面包络54.11×46.11m、最高8.65m，10渲染对象、45,680三角面、4碰撞网格。无新增实时灯、运行时脚本、散树或地面护栏。
- 原平屋顶、3组旧拼缝、2道中间装饰门架停用，旧对象及ID保留。家具、货台、压力门、两端门架和上层通廊保留。
- 保持上轮主光、曝光与材质，完成烘焙与54个反射探针更新。第一次自动UV烘焙出现规则暗点，0.1.1模型分离顶/底/侧面光照UV并重烘焙，初次记录保留。
- 实际查看 [KPF机场官方摄影](https://www.kpf.com/project/zayed-international-airport)，仅参考空间关系；未下载图片、未复制第三方模型、无Meshy消费。

## 验证与边界

| 项目 | 结果与证据 |
| --- | --- |
| 空间碰撞 | audit.json：158项通过，143处屋顶采样最低6.502m，上层通廊保守间隔0.750m |
| 静态通行 | runtime/routes.json：18段约366m通过；CharacterController.Move每步0.1m，各路线起点明确放置，居民暂时停用；不代替真人或动态避让验收 |
| 首次路线失败 | 初始侧廊路线穿过既有Port end glazing，碰撞正确阻挡；保留routes-through-closed-window-rejected.json。改走实际入口后通过，未删窗或放松断言 |
| 保留范围 | preservation.json：35,643个旧场景ID保留，15,610个受保护块不变；限定6个视觉根节点停用；正式场景、曝光、珍珠白材质不变 |
| 截图存档 | 4机位Editor Play完成，原存档状态恢复；runtime/capture.json与save-restoration.json |
| Win64构建 | Unity6000.3.24f1，0错误/1警告；build-result.json。ASCII隔离快照2,710项输入哈希见build-snapshot.json；含工作区既有字体修改但本轮不提交字体 |
| 引擎诊断 | 历史字符串转换异常及Pipeline请求超时见console-summary.json；后续Play就绪轮询、完整截图与通行成功。未宣称历史Console错误全部修复 |
| 发布性能 | 未运行本轮独立Player、未做设备性能验收、未获用户最终美术认可 |

构建位置：E:/builds/black-hole-station-v014-arrival-roof-20261001/BlackHoleStation.exe，产物抽样哈希见build-hashes.json。

## 视觉判断

厅内蓝座椅、浅蓝地面和白色家具已有区分，侧视能辨曲面。但鸟瞰屋面仍偏灰，顶棚受蓝色间接光影响，高光不足，斜视仍有细小反光斑点。本轮完成结构候选与局部技术验证；材质和反射层次仍需改善，不能靠提高全场曝光掩盖问题。
