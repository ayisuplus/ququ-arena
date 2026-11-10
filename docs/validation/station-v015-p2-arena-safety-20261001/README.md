# v015：赛场旋转参考系与机构边界防护

2026-10-01。施工基线 `1ef3041b`，候选场景 `BlackHoleStationThreeRingBuildingsV015.unity`。本轮恢复原赛场机构在旋转内环中的位置表达，补齐井口运板通道、赛场外缘及两处入口升降孔的联动防护。

## 已实施

- 原 `ArenaDuelPlatforms` 的升降、运板、选手站位、奖杯位置与重连恢复使用R1参考系；未指定参考系时继续使用旧世界坐标。选手在等待、出手和机构暂停期间随环移动，赛事控制器销毁时清理已经挂到内环的选手与奖杯。
- 新增8处受控开口：井口两处、固定赛场外缘两处、随赛场升降的外缘两处、入口升降孔两处。完整井口旧防护保留为停用历史对象。
- 开口读取实际平台Collider的承托。两侧均有平齐地面才开放；赛场升起后，底层外缘和升起平台自身的外缘分别闭合，避免只保护其中一层。
- 玩家站在升降台、运板、升降赛场或开放门槛时，机构等待；玩家走出后继续原协程。门口显示等待提示，后端胜负与结算逻辑保持原权威。
- 防护沿用项目已有蓝色建筑玻璃、瓷白及银色材质。此候选仍处于空间/功能施工阶段，当前照明和材质画面不构成P4美术验收。

## 验证

| 证据 | 结果与覆盖 |
| --- | --- |
| [静态防护采样](static-audit.json) | 3,551项通过；三个圆形边界、升降孔各边、开口状态、引用与米制缩放；属于采样检查 |
| [Editor相位97](editor-final-phase97/arena.json) | 142项通过，约126.6秒；原机构完整流程、真实CharacterController阻挡/穿行、占用暂停恢复、对象清理 |
| [Player相位0](player-phase0/arena.json)、[Player相位97](player-phase97/arena.json) | 各166项通过，约132.5秒；在上述覆盖之外增加八个升降孔角点的斜向实际行走检查 |
| [原对象保留审计](preservation.json) | 59,512项通过；14,664源对象、148座位、六住处、六居民、525场景引用保留 |
| [Player构建](build.json)、[构建消息](build-messages.json) | Succeeded，0错误、2警告，约20.3秒；既有Pipeline运行配置缺失及ArenaGame CS0109警告，未声称零警告 |

机构流程覆盖普通入场与双方退场、左右各一轮冠军落败者运板移除/颁奖/胜者退场、重复结算呈现只移除一次、战斗画面恢复后退场、旧静态坐标兼容。所有测试使用明确的测试选手身份，没有接入真实赛事后端，因此不是P3真实赛事链路验收。

同一Player的[高位路线回归](upper-regression97/upper.json)498项、[港区回归](dock-regression97/dock.json)107项通过。测试日志和独立存档目录保留在各Player证据目录，主报告的`passed`与失败项为准。

## 实际画面

![入口升降孔闭合防护](lift-closed.png)

![井口受控开口处于关闭状态](well-closed.png)

![停靠赛场内外通道开放](arena-open-passage.png)

以上为原生Unity候选画面，未修改图像。运行过程的[停靠画面](editor-final-phase97/parked.png)与[升起画面](editor-final-phase97/raised.png)亦保留，但被原高位看台遮挡较多，不能用它们替代通道验证。高位看台外形与全站美术尚未完成。

## 调试记录与边界

- [第一次Editor报告](editor-phase97/arena.json)有4个极小旋转角误报；实际环在正常转动，Quaternion.Angle对短窗口的极小夹角发生精度截断。改为计算欧拉偏航差后重跑通过，不改变正式转速。
- [第一次静态报告](static-audit-initial.json)有8个角点射线未命中。角点处一条射线起点已在相邻栏杆实体内，单面Mesh射线忽略出口背面；补用另一侧向内射线，并增加Player真实胶囊的角点斜行检查。未通过隐藏角点或关闭碰撞规避。
- v014源场景SHA256仍为 `0FC1A6EBD2E536762D1E5CF42CC8A8590B1BDB11E7B7DF6DA39223E68B93134B`。对本轮候选的序列化对象做只读对比：36,180→36,394个记录，删除0；原有仅4个记录改变，分别为旧井口根对象停用、两处父节点新增子项、原机构组件接线及启用。文件行移动不是旧对象删除。
- 当前待适配的原QuQu Behaviour为198个。原LiveMatch仍停用；本轮只启用机构组件和新防护，不宣称居民、座位、实际赛事及完整存档迁移完成。
- P2其余高低层路线及高位边缘缺口继续施工；P3真实功能迁移、P4外观材质、P5集成性能与用户体验验收仍未完成。

## 复现入口

原生创建、静态审计及画面采集脚本位于 `production/black-hole-station/v015/p2/` 的 `create-arena-safety.cs`、`audit-arena-safety.cs`、`capture-arena-safety.cs`。创建脚本拒绝覆盖已有资产，应在独立候选执行。

Unity菜单 `Tools/Station/V015/Build arena safety` 构建本候选；`run-arena-safety.ps1`启动独立Player，要求新的绝对证据目录，支持`arena`、`upper`、`dock`测试。每个过程以`process.json`中的PID及最终报告观察，不因观测超时重启。
