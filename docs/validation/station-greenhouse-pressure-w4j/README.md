# W4J 温室双入口围护与穿行验证

2026-09-29。从 W4I 复制[独立候选场景](../../../QuQuArena3D/Assets/Station/Scenes/BlackHoleStationGreenhousePressureW4J.unity)。施工前在外环 48 段的地板中点、眼高 1.69 m 处抽样：48/48 有脚下支撑，但向上 20 m、向内外两侧各 10 m 均未碰到围护；这只是路线缺口筛查，不是气密测试。温室原北墙留 4 m 开口，南墙因旧位置的下降通道而停用，温室迁到西南后南侧仍敞开。

W4J 将停用的整片南墙改为两段墙，中间保留通往花园的出口；南北入口各加入透明侧壁／顶棚与默认关闭的双门，按 `E` 操作且两门不能同时开启。温室原屋顶改用项目现有透明窗材，并加三道结构肋；两个门槛加了不可作为重载出生点的区域。参考 [NASA Veggie 实物与透明伸缩围罩、LED 种植单元](https://www.nasa.gov/missions/station/veggie-plant-growth-system-activated-on-international-space-station/)的设备关系；此处是项目灰盒造型，没有移用 NASA 图片，也没有声称 NASA 的装置能作为 24 m 建筑压力壳。

[Win64 构建日志](../../../.game-production/station-greenhouse-pressure-w4j/build.log)记录 `Build Finished, Result: Success.`。主工程与隔离构建工程的 W4J 场景 SHA-256 一致，均为 `0D1DB8F6664701AE15CBCB44751439480AB4535975B31B5E5314B11EA0537E88`；Player 包内 `level0` 为 `C900737CE205D199FCB0686436C33EE41F2A07BBAC586D767941A1220FA777EA`，`QuQu.App.dll` 为 `644DB49FA65513432FB7AB6B90614E67B6FFB6FC5A3589AD3813EC9E7D196938`，`QuQu.Validation.dll` 为 `FCBF9CE0AF65D658B9AC9723BEDD39A167BBE1698A7F133109DB33B1B4D4D53A`。

[独立 Player 新档整圈](../../../.game-production/station-greenhouse-pressure-w4j/qa/tour.json)在每至多 0.2 m 的 CharacterController 步进中走完 34 段、3,922 m：从北双门进入温室、照料、绕过种植架、经南双门出花园并接回外环；两处都验证了另一门开启时不得开门，结束时四扇门关闭。探针从温室中心朝四侧与屋顶射线检查到门、墙和透明屋顶；原四区路线、赛事亭、观景、咖啡及核心入口也通过。[独立进程读档](../../../.game-production/station-greenhouse-pressure-w4j/qa/read.json)恢复核心位置与温室、咖啡、货运状态，两次退出码均为 0。

由 W4I Player 生成的真实源档经 W4J [跨进程迁入](../../../.game-production/station-greenhouse-pressure-w4j/migration-w4i/target-qa/migrate-w4i.json)，报告 `migrated-W4I-primary`，源档前后 SHA-256 均为 `9B4BC249403EA5AE8E6559EBDE27AAEB551E45991527EC06D5F7024D47E667DB`；再次启动[读档](../../../.game-production/station-greenhouse-pressure-w4j/migration-w4i/target-qa/read.json)报告 `primary`，三次进程退出码均为 0。主工程 Editor 打开场景后无丢失脚本，两个门槛区域覆盖门内位置而不覆盖温室中心或花园外路。

第一人称眼高的 URP 离屏画面：[北入口](../../../.game-production/station-greenhouse-pressure-w4j/visual/north-entry.png)、[种植区与透明屋顶](../../../.game-production/station-greenhouse-pressure-w4j/visual/grow-room.png)、[南门槛](../../../.game-production/station-greenhouse-pressure-w4j/visual/south-threshold.png)、[花园返望](../../../.game-production/station-greenhouse-pressure-w4j/visual/garden-return.png)。门体仍是大面积素色灰盒，缺少足够的方向标识；画面来自 Editor 相机，不能代替带 HUD 的独立 Player 或真人键鼠体验。

首轮验证的是单个温室边界的碰撞闭合与双门互锁，**不是**物理压力模拟、结构认证或全站气密。外环其余区间仍开放；真人操作、门口存档重载专项、真实大模型参赛、30 分钟性能和正式美术尚未验收。

## W4J 本地赛事联动复验

随后用项目自带 `arena/scripts/serve-game.ts --validation` 在 `127.0.0.1:8181` 启动隔离后端，使用免费 `mock:xueba-o9`、`mock:huatou-72b`，没有调用付费模型。最终 [Win64 Player 构建](../../../.game-production/station-greenhouse-pressure-w4j/live/player/QuQuArena3D.exe) 成功；主工程和 ASCII 隔离构建工程的探针 SHA-256 均为 `46C22ABDD09798D343B2F25B9749161948193F93249EC265B255E4B5F7267BFD`，场景 SHA-256 仍为 `0D1DB8F6664701AE15CBCB44751439480AB4535975B31B5E5314B11EA0537E88`。[构建日志](../../../.game-production/station-greenhouse-pressure-w4j/live/build.log)记录 `Build Finished, Result: Success.`；最终 Player `QuQu.Validation.dll` SHA-256 为 `99D118A824BB6315D036B7664797F5042DC29C3E677D8B75654A2AD6A34760C5`。

[独立 Player 赛事路线](../../../.game-production/station-greenhouse-pressure-w4j/live/qa/live.json)从东轴赛事亭启动并同步赛事，在离开时尚有 0 个结算回合、0 次颁奖；随后以至多 0.2 m 的 `CharacterController.Move` 步进走 3,039.4 m 到西南温室，北门互锁进入、照料一次，在温室收到后续赛事结果和冠军演出，再由南门经外环返回核心。结束时 3 回合、1 次颁奖、赛事 ID／获胜模型和步行相机均保持，四扇温室门关闭，核心存档成功。[另一 Player 进程读档](../../../.game-production/station-greenhouse-pressure-w4j/live/qa/live-read.json)恢复 `primary`、核心 `(60, 0.08, 6)` 和 1 次照料，源档哈希未变；两次进程退出码均为 0，Player 日志未见异常。

[服务端原始赛事](../../../.game-production/station-greenhouse-pressure-w4j/live/qa/backend-result.json)与[核对摘要](../../../.game-production/station-greenhouse-pressure-w4j/live/qa/backend-summary.json)记录同一赛事 ID、`completed`、相同获胜模型、3 个已结算回合、序号 36 和 1 次结束事件；原始文件 SHA-256 为 `BEAC230BB72CA5F7D5915DF5EE158D329EABC515015701CFF386A69CC6EFDF68`。隔离后端已停止。先前探针把新外环导览牌误计为原导览台，以及短局在出发前已结束的两次诊断，连同旧候选包保留在项目内 `live/diagnostics/`；最终包仅在 `live/player/`。这仍是自动路线与免费模拟选手验证，真人操作、真实大模型答题和 30 分钟性能仍未验收。
