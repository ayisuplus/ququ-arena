# v015 观赛与观景设备恢复

2026-10-01；基线 `46cca794`。本轮恢复原 `StationSpectatorSeat`、`StationSpectatorCamera`、`StationObservationPoint` 三个组件。候选仍为 `BlackHoleStationThreeRingBuildingsV015`，旧场景与旧存档保留。

## 行为变更

- 观赛时保留角色的安全站位和 CharacterController，由原 Walker 持续跟随 R1；只改变视点。离座不再恢复过期世界坐标。
- F9 镜头随 R1 赛事参考系，F8 自由镜头临时脱离角色层级；角色本体继续随地面。R 返回原步行或坐姿状态，恢复镜头父节点、局部姿态、视场角与近裁剪面。镜头和座位禁用时分别释放所持状态。
- 观赛、自由镜头尊重 Walker 的输入锁定。飞行期间 E 不会同时离座。
- 观景台沿用公共阅读面板的单次 E、输入锁定、E/Esc 退出及禁用清理；屋顶镜头随 R3 建筑运动并指向 R1。保留原 Walker、Match、ObservationCamera 引用，退出恢复原相机启用和局部旋转；取消旋转后失效的东北/东侧方位文字。
- 查看测试选手画面时发现原观赛视点被防护横梁遮挡下半身；视点提高 0.15m 后复验，原防护、座椅和安全站位不移动。

## 当前证据

| 范围 | 证据与结果 |
| --- | --- |
| Unity 编译/Win64 Development 构建 | [build.json](build.json)，0 错误、1 条既有 Pipeline Runtime 配置警告；11.35s |
| 正常转速 Player，初始相位 0° | [final-phase0/spectator.json](final-phase0/spectator.json)，79 项通过 |
| 正常转速 Player，初始相位 97° | [final-phase97/spectator.json](final-phase97/spectator.json)，79 项通过 |
| 原资料阅读回归 | [reading-regression/reading.json](reading-regression/reading.json)，224 项通过，使用本轮包含观察面板的 Player；发生在最后仅调整观赛视点高度之前 |
| 源对象、身份及引用 | [real-building-audit.json](real-building-audit.json)，59,512 项、0 失败；14,664 源对象、148 生活座位、六房间/六居民、525 原引用 |
| 场景修改 | [scene-diff.json](scene-diff.json)，只改三个原 MonoBehaviour，启用并新增两个 R1 引用，无新增/删除场景对象 |
| 原场景、旧档与提交范围 | [checkpoint.json](checkpoint.json)记录文件哈希；前置字体、灯具与 v014 测试资料未纳入本轮 |
| 后续待恢复 | [behaviours-after.json](behaviours-after.json)，仍有 14 个原 Behaviour 停用 |

观赛验证从既有高位平台的局部站位开始，实际走到座位；不是重跑抵达厅至看台完整路线。分别检查第一/第三人称下 E 坐下 → F9 近景 → F8 自由移动 → R 返回 → E 离座，以及步行直接进入自由镜头、禁用座位/相机时清理。每种镜头停留 2–5 秒，在正常转速下逐帧检查环内位置、有效地面及身体碰撞。观景设备从附近独立落点步行接近，检查锁定 W/V/F8/F9、E/Esc、禁用和走离。

测试选手使用原 ArenaDuelPlatforms 的真实进场、升降与退场协程；视锥和脚部视线检查对应实际生成的两名测试选手。没有连接赛事后端或伪造正式比赛结果，不作为真实赛事验收。

## 实际画面

![修正后观赛席视线](final-phase0/seat-0.png)

![另一环相位的赛事近景](final-phase97/close-0.png)

![原屋顶光学镜头](final-phase97/observation.png)

均为本轮 Player 相机 RenderTexture 实际渲染，未含 OnGUI；不是概念效果图。已检查选手全身可见及近景构图。运行日志有附加灯光阴影图集自动降采样提示，本轮未调整灯光或质量设置。灰色技术候选、材质、整体美术和用户审美认可仍待 P4，不能把技术截图记为视觉完成。

## 失败和证据边界

- `editor-initial`、`editor-focused`、`editor-final` 的原流程分别失败；`editor-combat` 加入测试选手后仍有合成按键未可靠触发。聚焦 GameView、改变排队时机和临时克隆 Editor 输入设置均未消除，后者无效方案已从代码移除，未保存项目设置。保留四份失败报告；Editor 输入端到端尚未通过，待 P5 继续定位。
- 独立 Player 的停靠状态 `player-phase0/97` 各 71 项通过；加入真实进退场的 `combat-phase0/97` 各 77 项通过，但截图揭示横梁遮挡，不能因此认定画面合格。最后新增视线检查并提高视点的 `final-phase0/97` 各 79 项才是本轮最终 Player 证据。
- 首次构建 CLI 等待超时，但构建回执已成功；未因超时重复启动同一构建。若干 native eval 返回 5 秒超时，均先检查输出或活组件再决定下一步。
- 真实后端、赛事信息面板/广播、声音、完整存档、P2 归属出口汇总、P4 与 P5 仍未完成。整站目标保持进行中。

## 复现入口

1. Unity 菜单 `Tools/Station/V015/Build spectator interactions`。
2. `production/black-hole-station/v015/p3/run-spectators.ps1 -OutputDirectory <新的绝对路径> -Phase 0`，另一新目录取 `-Phase 97`。运行器使用独立存档目录，记录 PID；等待同一进程退出并读取 `spectator.json`。
3. 原资料阅读回归使用同一个 spectator Player，参数沿用 `run-reading.ps1` 中的 `--station-reading-probe-*`，提供原 `station-v015-p3-reading-20261001/approaches.json`。
4. 原生场景接入脚本为 `production/black-hole-station/v015/p3/enable-spectators.cs`；只对三个原停用组件执行一次，不重复运行。
