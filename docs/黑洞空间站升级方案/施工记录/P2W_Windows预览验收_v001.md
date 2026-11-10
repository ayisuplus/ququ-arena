# P2W Windows 预览与玩家起点碰撞验收 v001

日期：2026-09-28。接续[东北角实体高位观景](P2W_东北角实体高位观景_v001.md)。目标是在独立 Windows Player 中验证小规模开放世界候选场景能启动、玩家不会从舱室地板坠落、东北高台和中央井按概念图保持空间关系；本轮仍属于灰盒施工。

## 构建与修复

- 新增 `StationWorldPreviewBuild.Build`，只构建 `BlackHoleStationObservatory.unity`，检查赛事、步行、观测和 QA 脚本映射，并显式使用 D3D11／D3D12。默认 `EditorBuildSettings` 和旧场馆发行入口不变。
- 从中文工程路径直接批处理构建时，Unity 增量构建报 `String conversion error: Illegal byte sequence encounted in the input`；换成纯英文输出路径仍失败。因此从干净 Git 工作树复制 `Assets`、`Packages`、`ProjectSettings` 到英文工程路径再构建。此为本机可重复构建路径，不把 Unicode 原因当成已证明的 Unity 通用缺陷。工作区原有字体修改和未跟踪证据未进入复制源。
- 初版 Player 虽启动，玩家从 `(104, 0.06, 35)` 坠至地板下方。诊断显示 GLB 地板的场景碰撞组件及其网格引用在 Player 中依次缺失。只对玩家舱外框地板和中央环台做修复：将模型实例碰撞固化到候选场景，把原 GLB 碰撞网格各复制为独立 `.asset`；可见模型和环台升降绑定仍沿用原物件。未以跨越中央井的隐形地板掩盖问题。
- 从磁盘重开后，玩家舱起点地板、环台绑定、东北角 23 段外窗与 45 段坡道、中央井净空检查通过。Editor Play 的十条 P2W 路线全通过：上层整圈 864 m、下层整圈 680 m、东侧公共绕行 410.2 m、舱室经两层至北接驳区连续 1877.2 m；东北高台上／下／上 147.3 m、698 次移动通过。

## Windows Player 实测

最终隔离源截至 Git `3b32896`，Unity `6000.3.24f1`，`StandaloneWindows64` 构建成功。预览程序：`E:\projects\AI斗兽场\.game-production\validation-history\root-spillover-2026-09-28\station-world-preview-release-20260928\BlackHoleStationWorld.exe`，构建文件 189 个、157,931,475 字节。[构建来源与画面证据](../../validation/station-world-player-2026-09-28/README.md)。

| 检查 | 结果 |
| --- | --- |
| 正常启动 | 无 QA 参数时进程连续存活 15 秒，D3D11 和场景初始化；主动停止后无自然退出码。 |
| 明确 QA 模式 | `--station-world-probe-output` 写出报告与实际帧图，自动退出码 0；玩家舱起点保持 `Y=0.06`，射线命中地板，`CharacterController.Move` 向下报告 `Below`。 |
| 输入与高台 | Player 检测到键鼠，HUD 未阻断移动；传送至已在 Editor 实走的东北高台后，脚下地板命中，第一人称可见中央环与洞口。该取景不等同于 Player 内实际按键走完路线。 |
| 异常 | QA Player 日志无异常或错误；已提交版本的 `ArenaFont` 缺少部分中文字形，出现 30 条替换提示。 |

## 当前边界与下一轮

最初 [IMG-001](../08_概念图/IMG-001_空间站总览_v001.png) 的外方框、内菱形、中央环与贯通黑洞仍是空间骨架。本轮实机画面里的走廊与环台明显仍为结构灰盒；没有完成真实黑洞景观、四角内容密度、正式室内、站外气闸、日常活动。120 帧无节流短采样不能代表目标硬件性能；实体键鼠或手柄的完整漫游、真实赛事和中文 UI 逐字检查也未验收。

下一轮先让可到达的上下层、北接驳和其他角部拥有能停留的景观／互动，并沿概念图核查导览与空间辨识；再做实际操作路线和有约束的性能采样。每处新增建筑继续避开中央井与两块选手平台的运动包络。
