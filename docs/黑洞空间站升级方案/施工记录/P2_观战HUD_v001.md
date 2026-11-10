# P2：独立空间站观战 HUD v001

日期：2026-09-27。范围为 `BlackHoleStationLive` 的赛事信息与操作入口。比赛结果、伤害和评分仍由现有 `BattleEngine`／`GameCompetitions` 决定；空间站只展示收到的比赛快照和已结算事件。

## 本轮施工

- 将原来常驻左上角的大表单收成可展开的赛事 ID 输入框。比赛状态与服务状态移到右上，双方名字、血量、答题摘录和当前赛题移到下缘；按钮打开完整答卷、赛程、解说或切换近景／自由／原视角。H 隐藏 HUD。
- 答卷抽屉展示当前题的完整题目、双方回答、公开推理、异常与得分。打开时固定题目，后续回合不自动顶替；切换赛事清除固定状态。赛程和解说读取已有快照，未新增业务结果。
- HUD 仅接收 `ArenaStationLiveMatch` 的展示状态，观看请求回传给其现有 `Watch` 方法。输入框聚焦或鼠标位于交互区时，暂停步行、座椅和镜头输入；连接使用已有本机端点偏好。
- 修复已进行对局从快照恢复时双方角色仍显示满血的问题：按快照 `duel.hp` 恢复角色血量，再由同一数值驱动大屏和 HUD。

## 验证

| 检查 | 结果 |
| --- | --- |
| 编译 | Unity 6000.3.24f1 `recompile_status`：`completed`、`failed=false` |
| 状态同步 | Play 模式内存赛事快照的角色、大屏和 HUD 均显示左 80／右 90 HP；`WatchRequested` 与镜头输入阻断回调已接线 |
| 答卷行为 | 内存夹具验证固定的第 1 题在第 2 题到来后仍显示；切换赛事 ID 后恢复到新题；输入框聚焦时镜头输入阻断为真 |
| 本机赛事重放 | 启动项目原有 `GameCompetitions` 服务，读取隔离复制的已完成赛事；通过 HUD 的观看回调收到 `c2ff4c49a-6007-4e05-8326-1745e6ce0226` 序号 136、已结算状态、第 13 题、双方 80／100 HP 和冠军名称“滑头-72B”。[本机重放画面](../../validation/station-hud-2026-09-27/hud-local-completed-replay-v2.png) |
| 常驻画面 | [近景 HUD](../../validation/station-hud-2026-09-27/hud-close-up-v2.png)：双方角色和大屏保持可见，血条为 80／90 HP |
| 完整答卷 | [答卷抽屉](../../validation/station-hud-2026-09-27/hud-answer-drawer-v2.png)：完整题目、回答、公开推理和得分可读；抽屉覆盖右侧画面但未遮住两名角色 |
| 观看入口 | [展开赛事 ID](../../validation/station-hud-2026-09-27/hud-watch-panel.png)：输入框只在需要连接时占用左上角 |
| 独立 Windows 构建 | 纯英文路径隔离源工程批处理构建成功，日志为 `Build Finished, Result: Success` 与 `Exiting batchmode successfully now!`；中文交付路径的 15 秒检查只证明进程与引擎启动，后续脚本映射风险见文末补充 |

截图使用 Unity `ScreenCapture` 保存完整 Game 画面及 OnGUI。战斗中画面是内存夹具；本机重放通过同一 `GameCompetitions` 服务读取已完成的免费模拟赛，验证了真实连接和快照恢复，不是实时付费模型对局。验证结束后已停止本轮启动的 8181 服务。本轮未完成实体键盘按键、Windows 包交互和所有席位／分辨率的视觉验收。当前编辑器中的 `ArenaFont.asset` 是施工前已有的未提交修改，本轮没有提交或覆盖它；独立预览构建继续使用上一轮隔离源工程中的字体版本，因此预览包的中文字形与这些编辑器截图尚未逐字对比。

独立 Windows 预览包为 `QuQuArena3D/Builds/BlackHoleStationHUDPreview/BlackHoleStation.exe`，交付目录 193 个文件、356,977,912 字节，含四份素材许可。隔离构建源与工作区的场景、App／Presentation 本轮源码及 `.meta` 哈希均相同；`ArenaStationLiveMatch.cs` SHA-256 为 `D3527983EB84DC0F72F6FBDE6E7F7076E8749216323C81878AC632B6B02CE16A`，`StationMatchHUD.cs` 为 `D15F466638501756F57805E63F5023EADA8B994BD342FB9AE438F9D9F37FDB38`，交付包 `QuQu.App.dll` 为 `92B80798559052D2773FCBA95A5EC44294CE678CBFC65E37E2AADE5C953E23F4`。独立包只做了启动检查，尚未完成包内鼠标／键盘、答卷抽屉或中文字形的人工视觉验收。默认发行入口仍是原场馆，待独立场景后续全链验收后再切换。

后续核查补充：下一轮的 P7 包在只确认进程存活的检查之后，进一步运行 Player 时发现隔离源工程的赛事脚本映射可能缺失，导致场景组件丢失；原 P6 检查也没有验证到该组件。因此 `BlackHoleStationHUDPreview` 只能作为历史构建候选，**不能据上面的启动信号判定为功能可用**。后续新增构建前脚本映射门禁，见[独立预览启动链记录](P2_独立预览启动链_v001.md)。
