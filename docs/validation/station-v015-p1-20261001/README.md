# v015 P1：慢转地面、跨缝步行与玩家存档首轮

2026-10-01。施工基线 `d58904ce`。用户已要求“按照v015方案施工”。本轮完成独立两环技术候选和第一轮 Editor / Win64 Player 验证，继续推进P2；**整站三环、建筑迁移、美术与集成验收尚未完成**。

候选：`Assets/Station/Scenes/Candidates/BlackHoleStationRingPrototypeV015.unity`。内圈半径40–64m，固定步道64–72m，外圈72–100m，两运动环最外缘分别以±0.075m/s运动。两个退让边界块仅代表错位建筑入口边界，尚不能代替完整的错位横向街巷验证；P1该项需补齐后才能批量迁移。P2目前仅做只读调查。本图不是建筑效果或最终站体尺寸。

![两环与固定换乘带技术原型](prototype.png)

## 本轮实现

- `StationRotatingRing`：独立运动参考系、半径边界、稳定环ID、环内位置/朝向转换。建筑及内部构件未来随同一环，固定步道不挂到运动环。
- `StationGrayboxWalker`：继续使用原CharacterController；先应用上帧支撑环的位移与朝向，再执行原步行/重力。跨界重新获取地面，传送后重置支撑参考，不通过父子重挂来替代碰撞。
- `StationWorldSave`：旧v1世界坐标读取保留，旋转环位置写v2 `ringLocation`（环ID、局部位置、局部偏航角）。新会话采用场景初始环相位，再把局部位置转换到该相位；本阶段不持久化整站环相位。接缝两侧0.8m内不作新落点，回退到前一个安全环内位置；恢复位置检查支撑与角色胶囊净空。
- 真实存档服务用于原型验证；咖啡、温室、货运采用同类型的最小测试夹具，居民列表为空。这不构成原住处、六名居民、货运线路或真实赛事已经迁入的证明。

## 已执行验证

| 环境 | 证据 | 结果 |
| --- | --- | --- |
| Editor Play，60fps目标，正常慢转 | [walk](editor60/walk.json) | 55/55项，4,679帧；0°、47°、173°三相位，直走、斜走、折返、固定带/接缝停留、反向环站立带随及保存回退 |
| Editor重新进入Play | [read](editor60/read.json) | 7/7项；主存档恢复、位置和偏航角、恢复后站立；恢复位置误差约1.3mm |
| Win64 Development构建 | [build](build.json) | 最终构建成功，0错误、2警告，约11.6秒；首轮构建约17.4秒。未修改ProjectSettings |
| 独立Player，D3D11，60fps目标 | [walk](player60/walk.json) / [运行日志](player60/walk.log) | 55/55项，4,681帧；同样的实际逐帧路线，运行设备RTX5090 |
| 第二次独立Player进程 | [read](player60/read.json) / [运行日志](player60/read.log) | 7/7项；跨进程读取和环内位置恢复、继续带随 |
| 旧版v1固定位置回归 | [input-v1](legacy-fixed/input-v1.json) / [read-fixed](legacy-fixed/read-fixed.json) | 最终Player构建6/6项；从实际测试存档制成v1固定地面夹具，读取、站立和继续保存通过；不等同于所有历史住处旧档迁址 |
| 最终构建v2重载回归 | [read](latest-read/read.json) | 7/7项；v1兼容处理明确清空环位置后，重验v2恢复与带随 |
| 编译与Console | [console-after](console-after.json) | 无新错误；警告为既有ArenaGame.cs的CS0109和Player未启用Pipeline运行时远程控制配置，不影响本地测试组件 |

测试通过角色的正式 `MoveOnGround` 路径驱动，不在一帧内循环伪造行走；只在独立路线开始时明确放置角色。环按真实 `Time.deltaTime` 慢转，未加速旋转或伪造时间。站立稳定性检查采用环内位置与相对偏航，跨缝检查到达误差和垂直位移。60fps为目标上限，不是整站性能测量或人工舒适度认可。

## 发现并修复的问题

1. [首轮失败记录](editor/walk-failed-v001.json)：CharacterController默认1mm最小移动过滤了高帧率下的缓慢位移，站立2秒滑移约12cm。将最小移动距离设为0后，Editor正常慢转站立最大漂移约1.7mm，Player对应测试通过。
2. 首轮接缝仅检查旋转面，固定侧仍会更新安全落点。改为同时排除固定面两侧的接缝范围，验证保存保留先前的环内位置。
3. [直接eval构建失败记录](build-failed-eval.json)：Pipeline开发构建的`CodeReloadLinkXmlGenerator.CollectPlayerAssemblyNames`调用动态程序集`GetName()`时触发`Illegal byte sequence`。使用编译后的正式Editor菜单入口，并在重新编译清理动态程序集后构建成功；没有修改包源码。首次失败回执的0错误是异常捕获覆盖汇总后的字段，不代表那次构建无错误。

## 复现与证据边界

1. 初次创建候选使用[create-prototype.cs](../../../production/black-hole-station/v015/p1/create-prototype.cs)通过Unity原生eval运行。脚本拒绝覆盖已有候选或离开dirty场景。
2. 脚本编译结束后，直接调用Unity菜单 `Tools/Station/V015/Build ring prototype`。构建前若已使用动态eval，先recompile；不要在recompile与menu之间调用eval。
3. 使用[run-player.ps1](../../../production/black-hole-station/v015/p1/run-player.ps1)，给新的绝对输出目录先运行`-Stage walk`，检查进程结束且walk.json通过，再在同目录运行`-Stage read`。脚本不会覆盖同阶段已有证据；5秒命令观察超时不能视为Unity工作已经停止。

测试存档隔离在候选场景自己的Editor目录和`player60/save`，旧场景/旧档未迁移或覆盖。旧字体、第三方灯具、咖啡候选和历史测试变更未纳入本轮提交。

P2/P3必须继续验证：完整街巷与三环扫掠、固定抵达接入、座位模式（原代码会禁用Walker）、六名居民的世界坐标路线与保存、赛事舞台参考系及旧档迁址。多帧率、墙边恢复拒绝、损坏主档回退、人工相机舒适度和整站性能仍需后续补齐。不能把两环原型通过写成v015全部施工完成。

最终源文件、候选场景和Player哈希见[checkpoint.json](checkpoint.json)。55项路线套件在增加v1固定落点读取回归前运行；最终变动仅增加v1读取时清空环位置与该回归分支，最终构建已补验v1六项和v2七项，未重复跑未改动的整套路线。
