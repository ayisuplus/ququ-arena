# v016 B04 叠庭休憩馆外壳候选

2026-10-02。**B04已完成真实Meshy草模、本地模块整理与候选安装，两个旋转相位Player检查通过。当前为封闭外壳，玻璃反射、内部和露台通行、最终视觉认可仍未完成。**

## 生成与接入

- 任务 `01a0fb79-b327-7181-a696-0ad054f9646d`，仅一次标准几何生成，实际20积分，1360→1340；v016四栋累计80积分。原始模型247,528三角面、原始预览和输入哈希均保存于[生产目录](../../../production/black-hole-station/v016/b04-terraced-lounge/README.md)。
- Meshy草模背侧融合、窗框波纹，等比缩放也超过主体深度和高度上限；保留原件和48,000面检查版，本地重建五个独立舱块及中央核/支承。未追加付费生成。后侧布局为推演。
- 实际25.40×15.43×14.89m，GLB30,268面；Unity FBX导入29,936渲染面、25网格、5材质。碰撞导出4,000面，Unity运行读取3,664面，两种格式分别记录。
- 仅增加R3下的 `V016 B04 terraced lounge exterior trial`。原住户、房间、家具及B01/B02/B03保持，不产生新房间ID，不启用赛事。

## 完整包络

- R3局部中心 `(-218.627321,0,-38.549895)`，偏航260°，完整占地36×30m，主体探索上限28×22×15m。
- 全包络径向207–237.683m；旧几何额外净距4.019m，距最近原短住组中心38.552m。原短住组入口、家具、居民/房间身份均保留。
- 地块搜索保护了全部旧R3构筑物以及B03已冻结的38×26m地块。保留184–192m及246–254m的连续环街预留。
- 使用B03的13个大型R3网格调查与原3460渲染器调查，脚本支持提交后的压缩调查文件。详见 `production/black-hole-station/v016/b04-terraced-lounge/place.py`。
- 早期临时体量截图复制玩家相机完整URP配置；拍摄后方块和相机均清除。现安装外壳使用同一冻结地块。

## 原生实景

四组取景只切换B04显隐，复制玩家相机完整URP数据（RendererIndex=1、抗锯齿、后处理与Volume设置）；[相机记录](cameras.json)。没有改全局光照以补偿取景。

![B04街侧实景](after-street.png)

[街侧施工前](before-street.png) · [入口前](before-entry.png) / [入口后](after-entry.png) · [环境前](before-context.png) / [环境后](after-context.png) · [短住侧环街看赛场前](before-guest-promenade-to-arena.png) / [后](after-guest-promenade-to-arena.png)

初始“旧短住看赛场”机位落入旧屋顶，灰色画面无效；原图及参数保留在[失败取景记录](rejected-inside-old-roof/README.md)。修正为R3内侧环街的有效机位，不能将其标作旧房屋内部视线证明。当前绿色窗面缺少反射层次，视觉尚未通过。

## 技术验证

- [保存性](preservation.json)：相对本轮前`2e1ba3c2`的37,808条记录，37,807条逐条一致，仅R3新增子节点引用，增加8条记录，无删除。原v015场景字节SHA256保持；原建筑身份与引用保持不等于全量交互回归。
- [构建](build.json)：Win64 Development `build_ba58e440e59e` 成功，0错误、2条既有警告（RuntimePipelineConfig缺失、ArenaGame的CS0109）。构建改动的5个配置文件按本轮备份恢复并校验。
- 动态求值程序集曾导致`Assembly.GetName/CodeBase`非法字节序列，单纯请求脚本重载未解决；保留[失败记录](build-domain-reload-failed.json)，完整清缓存脚本重编译后使用原生build命令成功。没有修改Unity插件或项目全局配置。
- [相位0](runtime-phase0/route.json)与[相位97](runtime-phase97/route.json)各21项通过，外围实走各约123.64m，无阻挡。检查涵盖五独立模块、碰撞预算及对齐、周边通路、R3地面支承、正常转速和站立带随。
- 同构建[B01](runtime-b01-regression/route.json)20项、[B02](runtime-b02-regression/route.json)20项、[B03](runtime-b03-regression/route.json)21项回归通过，分别约131.65m、111.63m、119.64m；连同B04两相位合计103项，5次Player均退出0，日志无error/exception/failed。证据与文件哈希见[清单](manifest.json)。验证仅覆盖所列路线，不等于室内、全量旧路线、完整存档或性能验收。运行条件为RTX5090、隐藏960×600 Player。
- 后续继续各馆玻璃/反射、B01壳口与底边、B03内部生态；B04若启用内部和露台，另行完成竖向交通与出入口。当前不承诺可入住或可上露台。

## 地块与白盒历史

![完整地块](placement-map.png)

![临时体量](whitebox.png)
