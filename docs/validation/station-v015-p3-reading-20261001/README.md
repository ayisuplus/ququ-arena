# v015 P3：三环导览与公开资料阅读

2026-10-01，基线 `0537bbc5`。在独立三环候选恢复7个导览、4个状态台、2个档案桌、2面档案墙，共15个原组件。没有新增建筑或移动原物件。

## 导览与阅读行为

原导览中的四翼、固定东南西北和旧下层路线改为R1赛事、R2公共生活、R3居住生态及固定港区；跨环说明使用公共街巷、环边与固定换乘带。固定船坞导览不再称为“北侧外环”。两个档案桌分别使用“中环科研馆”和“中环研修讨论馆”。原对象ID、档案来源和场景引用保留。[原生修改脚本](../../../production/black-hole-station/v015/p3/enable-reading.cs)、[逐组件前后记录](enabled.json)。

三个阅读组件共用 `StationReadingPanel`：相邻阅读点按距离选择，一次E只打开一个；阅读期间阻止移动、视角切换和其它交互，保留角色随地面运动。E/Esc关闭、组件停用均恢复原移动锁、HUD、输入委托及光标状态；关闭键的输入阻断持续到本帧末尾，避免同一E落到附近座位。研究桌原Opened事件保留。

档案继续读取既有 `ArenaStationLiveMatch.CurrentRound`，未结算回合不公开答卷或评分。**真实后端仍未启用**。测试用内存夹具设置未结算/已结算回合，仅检验显示门槛，随即恢复原状态；不构成真实赛事或网络验收。状态台继续只读原咖啡、照料、货运及科研组件。

## 验证范围

[近身路线审计](approaches.json)为13个操作点各选一段1.4米接近路径，逐点独立放置角色，再使用真实CharacterController步行到台前和返回。**这些不是连接13个目的地的一条全站旅程**。检查地板所属环、无穿透、E打开、E/Esc关闭、原状态恢复、禁用拒绝操作和阅读中的位置/朝向保持。

每种地面（R2、R3、固定）首点阅读保持5秒，其余至少0.2秒，均以正常环速运行；通过条件为局部位置偏移小于4厘米、朝向偏移小于0.1度。另在首点临时生成一个更远导览与近身座位夹具，检查阅读优先、面板独占、关闭键不误触座位，释放后仍可坐下。夹具仅存在于测试运行中，未写入场景。

| 检查 | 证据 |
| --- | --- |
| Win64 Player，相位0 | [224项通过](player-phase0/reading.json)，31.08秒、34.54米，已退出 |
| Win64 Player，相位97 | [224项通过](player-phase97/reading.json)，31.05秒、34.46米，已退出 |
| 图形模式隐藏Player，相位0 | [224项通过](player-graphical-phase0/reading.json)，31.04秒；截图黑屏，不作为视觉证据，已退出 |
| Editor Game视图，相位97 | [224项通过](editor-phase97/reading.json)，31.89秒、34.64米；四张真实界面截图已查看，Play已停止 |
| 对象保存性 | [59,512项通过](preservation.json)，14,664源对象、148生活座位、六住处/六居民、525场景引用保留 |
| 场景差异 | [36,454条记录完整保留](scene-diff.json)，只改变15个原MonoBehaviour记录 |
| Win64构建 | [Succeeded](build.json)，19.39秒，0错误；[两条既有警告](build-warnings.json)：Pipeline运行配置缺失、ArenaGame.AddComponent的new修饰符 |
| 剩余功能 | [29个原组件停用](behaviours-after.json)，包括居民、真实赛事、观赛、声音及完整存档相关组件 |

测试源码：[StationRingReadingProbe.cs](../../../QuQuArena3D/Assets/Scripts/Validation/StationRingReadingProbe.cs)。[运行脚本](../../../production/black-hole-station/v015/p3/run-reading.ps1)，构建菜单 `Tools/Station/V015/Build reading interactions`。源码、场景、程序集和证据哈希见[checkpoint.json](checkpoint.json)。

## 实际界面

隐藏Player在批处理和图形模式下均产生黑屏截图，原始文件留存但不用于验收。以下是Editor Game视图原始截图，中文和返回提示可读，已检查无重叠；不是Player画面验收，也不是P4美术效果图。建筑、甲板与光照仍待P4处理。

![中环导览](editor-phase97/Cafe%20south%20walk%20guide.png)

![中环科研档案](editor-phase97/Observation%20instrument%20plinth%202.png)

![外环生态状态台](editor-phase97/花园温室观察湾状态台.png)

原v014场景SHA256仍为 `0FC1A6EBD2E536762D1E5CF42CC8A8590B1BDB11E7B7DF6DA39223E68B93134B`。完整世界存档、居民、赛事及观赛功能、P2出口汇总和P4–P5仍未完成。
