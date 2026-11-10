# ta2 断言对齐 · 透明底档（用户复核后 /commit）

范围：`QuQuArena3D/Assets/Scripts/Validation/` 七处 + `ArenaPlayModeGate.cs` 一处 + 同族补充一处。
**产品代码零改动**——本批全部改动都在测试侧（Validation/Editor）。

处置方针（用户拍板「最小语义对齐」）：只把过期断言对齐到当前产品语义，原意图与精度保留；
逐处考古注释写进代码；不为凑绿放松任何精度阈值。

过程申报：工程执行者 `eng-qa-align` 在 29 分钟处因 Internal Server Error（服务端故障，非执行错误）中断，
SendMessage 续接失败（团队已回收）。中断现场勘查：5/7 处已落盘且 diff 逐块审阅合格、
ArenaArchitectureCheck.cs:66 未做、复跑零启动。收尾（第 6/7 处对齐 + 复跑 + 本档）由主代理接手完成。

---

## 1. QA 通道修复（结构性缺陷，3 处 + 预算 1 处）

| 文件:行 | 变更前 → 变更后 | 考古依据 |
|---|---|---|
| `ArenaGalleryCheck.cs:19-20,42`<br>`ArenaBoothCheck.cs:18-19,39`<br>`ArenaResearchCheck.cs:18-19,34` | 无门禁产物 → +`GateResult` 序列化类 + 收尾写 `runtime.json`（原 gallery.json/booths.json/research.json 报告不动） | `ArenaPlayModeGate` 只认 `runtime.json`；三 Check 原只写各自报告 + `Application.Quit`（编辑器 no-op）→ 走 gate 必超时。历史上 tmp 只有 duel/smoke/lint/compile 跑批痕迹，五 Check 从未走过 gate |
| `ArenaPlayModeGate.cs:32,42` | 预算 `60*8` → `60*20` | GalleryCheck 含 600s 真实时 soak + 三档分辨率采样，8 分钟必超；soak 断言口径不缩水，只能放宽预算 |

## 2. 断言对齐（过期断言考古学，6 处 + 同族补充 2 处）

### ① `ArenaVisualCheck.cs:60` — v05→v06 大屏保留 HUD
- **前**：`Require(nativeFullscreen && !UI.Root.activeSelf && IsSpectating, "Large screen did not occupy the native display")`
- **后**：`Require(nativeFullscreen && UI.Root.activeSelf && IsSpectating, "...with HUD retained")`
- **考古**：v05 时代观战隐藏 HUD（ToggleSpectator 曾 `SetActive(!enter)`）；v06 起**有意保留**
  （`ArenaGame.cs:174 SetActive(true)`，`ArenaSpectator.cs:4` 注释明说 F10 换显示时 same HUD stays）。
  陈旧绿证：`docs/validation/visual-v02/runtime.json`（2026-09-18 18:25，passed:true，player 3840×2160）。
  深入大屏语义由 ArenaSpectatorCheck 承担。
- **精度**：nativeFullscreen/IsSpectating 主体断言不动。

### ② `ArenaPerformanceCheck.cs:101,105` — v23 slap 重写后的 contact 语义
- **前**：`impacts==1`；`blocked==(variant==2) && returnedHome && !Busy`
- **后**：`impacts==(variant==2?0:1)`；`returnedHome && !Busy`
- **考古**：v23 slap 重写后 `Strike()` 仅 score>0 起演（`ArenaFighter.cs:180-181`）、
  `ArenaStage.PresentRound` 对 damage<=0 直接 continue 不落 contact；`ArenaV22Check.cs:74` 以同一口径绿证
  （score>0 恰 1 次、score=0 恰 0 次）。v05 InvokeDivinity「score=0 也打 1 contact、blocked=true」已废。
  陈旧绿证：`docs/validation/performance-v03/editor-v2/runtime.json`（2026-09-18 19:18，passed:true，
  AttackC impacts=1/blocked=true 即废止前形态）。
- **精度**：score>0 保持 exactly-one；恢复检查（returnedHome/!Busy）不动；blocked 语义由 impacts==0 表达。

### ③ `ArenaGalleryCheck.cs:106` — Esc 复位时机
- **前**：Esc 后立即验相机复位 → 必炸（行程未结束）
- **后**：`yield return Until(()=>!shell.Stations.Moving); yield return null;` 行程真正终了再验
- **考古**：v22 接驳运输变更后 Esc 现为 4~7s 载具行程（TransportLongHop 4.35s / SkyLift 6.66s），
  行程终了才 RestoreView（Travel 完成回调落位）；行程中二次 Esc 走跳过路径，同样行程终了落位。
- **精度**：复位 2cm/0.05° 不放松，不调用 Skip() 绕过行程。

### ④ `ArenaBoothCheck.cs:54` — Transport duration 上限 7→8
- **前**：`duration>4 && duration<7` → **后**：`duration>4 && duration<8`（下限 4 不动）
- **考古**：v27 SkyLift upperRide≈6.66s 移动 + 0.3s 尾拍，实测 219 帧@30fps≈7.3s 顶破旧上界；
  `docs/validation/lift-v27/lift-01/lift.json` trips 四程 6.65s×4（movingFrames 154）与 ArenaLiftCheck 绿证同源。

### ⑤ 分辨率循环三处（`ArenaBoothCheck.cs:100` / `ArenaGalleryCheck.cs:150` / `ArenaResearchCheck.cs:56`）
- **前**：`Require(Screen.width==width && ...)` 编辑器必炸 → **后**：
  `if(Application.isEditor) report["renderSize-"+width]=...; else Require(...)`（player 保留原硬断言）
- **考古**：工具现实——`Screen.SetResolution` 在编辑器是 no-op（player-build-only API）；
  实拍 PNG 全为 3830×2043 GameView 原生尺寸。非产品语义变更。
- **精度**：player 硬断言原样保留；PNG 文件名保留惯例档名（MANIFEST 如实记实际像素）。

### ⑥ `ArenaArchitectureCheck.cs:73` — 同族运输边界 1.7-6.5 → 1.7-8
- **考古**：1.7-6.5 是捷径时代口径——layout-v24/facilities-05、structure-v25/facilities-01
  travel 数组（当时全绿）实测 2.03~5.08s（Referee→Commentary 捷径 2.03s 定了下界）；
  v27 后涉 Commentary 行程全走 SkyLift（`ArenaStationTransport.cs:84` upperRide=from/to 涉 Commentary），
  捷径消失、壁钟≈7.3s 顶破 6.5。上限 6.5→8 与 BoothCheck 的 4~8 同族同界；下限 1.7 不动（瞬移/跳过守卫原意）。

### ⑦ `ArenaV22Check.cs:51` — 同族断言（一字不差、同因过期）
- 与 ⑥ 同边界同修法（1.7-6.5 → 1.7-8）。
- **申报**：这是 ⑥ 考古中发现的第七处，不在此前六处清单内。若复核认为超出「最小」范围，
  revert 此条不影响其余六处。

### ⑧ `ArenaVisualCheck.cs:82-84` — Spectator 独立 HUD 时代的两处查找（复跑揪出，NRE）
- **前**：`Spectator.GetComponentsInChildren<TMP_Text>() 找「长题目」` + `Spectator.transform.Find("Live contestants").childCount==8`
- **后**：`UI.Question.text/UI.Question.rectTransform.sizeDelta.y>500` + `UI.Left 下 "Fighter " 前缀行数==8`
- **考古**：v06 起大屏观战**共用同一套 HUD**（ArenaGame.cs:174 SetActive(true)、ArenaSpectator.cs:4
  same HUD stays——与 ① 同一次产品变更）；ArenaSpectator 成空壳挂载点（ArenaBootstrap.cs:50
  "Large screen HUD" 仅 RectTransform+SetActive 开关，零子内容）——旧 Find("Live contestants") 必 null（NRE），
  GetComponentsInChildren 必空。"Live contestants" 节点全库仅剩 harness 这一行（git -S 考古：基线即有，
  672a93f P1+P2 把 UI 拆 Header/Roster/AnswerDesk/ControlsBar 后消亡）。现役语义：题目文本挂 UI.Question
  （ArenaAnswerDesk.SetQuestion 显式按内容撑高 sizeDelta，长文可滚动断言原样平移）；选手卡挂 UI.Left
  「Contestants」面板（ArenaRosterPanel P2 收口，每行 "Fighter "+id，8 人上屏语义不变）。
- **精度**：>500 阈值、8 人计数、断言文案全不动；只换查找域（Spectator 子树→现役 HUD 节点）。
- **复跑**：ta3 visual 复跑 passed:true（longText/rosterChanged 全绿，eightFighterFps 59.99）。

## 3. 未做（残余缺口，透明申报）

### ⑨ `ArenaPerformanceCheck.cs:128`「Scale/protocol regression」——**已按 A+ 处置（用户拍板 2026-09-26）**
- 复跑红点：protocol 循环（2/8 人事件边界）第一个 case 即挂 `impacts==1` 断言（protocolCases=0）。
- **考古铁证**：09-18 绿证 `docs/validation/performance-v03/editor-v2/runtime.json` **protocolCases:2**——
  「done 帧直触攻击、重复帧不双击」的桥当年是活的；此后产品重构（权威结算口径：`FighterState.Accept`
  纯状态化+去重，注释明写 "Health is set only by authoritative competition settlements/snapshots"；
  攻击统一走回合结算 `ArenaStage.PresentRound→Strike` 桥）把 done→攻击桥拆了。
- **产品不是坏的**：真实对战链路完好（duel 全绿、strikes 循环同文件绿、slap 演出正常）——
  是 protocol 断言测的旧语义死了。
- **A+ 处置（用户拍板）**：攻击语义对齐新口径（`impacts==0`：done 帧不再直触攻击）+
  「重复帧不双击」考点**搬到状态层**——同 key 同 seq 重复交卷必须被 `State.Accept` 去重拒收
  （`answer:"first"/"duplicate"` 双发，断言 State.Answer=="first"），验证强度不降；
  攻击次数语义由 ArenaSlapCheck 承担（现成覆盖「一次结算恰打一次」）。
- **复跑**：ta3p performance passed:true，**protocolCases:2 回到 09-18 绿证水平**，全链路
  （quietMode/cancellation/music/strikes 18 行）全绿，shaderErrors=0。

### 其他遗留（不入本批提交圈定）
- ⑥⑦（ArchitectureCheck/V22Check）不走 gate 通道、本次**未复跑验证**（改动系考古对齐，人工复核为准）。
- `ArenaArchitectureCheck` / `ArenaV22Check` 仍走「写各自报告 + Quit」通道，**未补** GateResult/runtime.json——
  不在七件套、本次不经 gate 跑；未来若要走 gate 需各补一行（与 §1 同款）。
- 工作区遗留（上场会话产物，不入本批提交圈定）：`ArenaFont.asset`+1890 行 TMP kerning、
  `ObservatoryCJK.asset`、若干 `.png.meta` 再序列化、`architecture-lint-baseline.json` 行数刷新（lint 跑批副产物）、
  5 个玻璃/发光 `.mat` 的 `_SrcBlend` 混合模式微调（5→1，技术美术收尾语义调整，归属待用户定夺）。
- 工具链修复（独立提交圈）：`ArenaArchitectureLint.cs` 成功路径补 `EditorApplication.Exit(0)`——
  原先失败分支有 Exit(2)、成功分支只 Debug.Log，batchmode 不带 -quit 时 Unity 永久挂着（ta2 卡死根因，
  「成功卡死、失败反退」）。

## 4. 复核清单

- [ ] 本档八处逐条核对（可任意点名抽 diff）
- [ ] 七件套全表（§5）确认「诚实红→绿」的每一条都属于上述对齐，无一硬凑
- [ ] ⑨ 三个拍板选项择一（A 最小对齐 / B 语义重写 / C 保持红另立任务）
- [ ] 若发现任何一处属「产品行为真坏了」而非断言过期——立即停手回报，不进提交

## 5. 复跑全表（ta3，2026-09-26 01:36-01:58，RTX 5090）

| 件 | 前（ta1/复跑前） | 后（ta3） | 翻绿依据 |
|---|---|---|---|
| lint | 卡死（ta2 事故） | **EXIT=0**，gameRefs=94 基线通过 | ArenaArchitectureLint 成功路径 Exit(0) + 命令补 -quit |
| visual | 红（⑧ NRE：Find("Live contestants")=null） | **passed:true** | ① 大屏 HUD + ⑧ 查找域对齐；longText/rosterChanged/cameraFocused 全绿，59.99fps |
| performance | 红（② impacts 口径） | **passed:true**（protocolCases:2） | ② strikes 口径翻绿实证（AttackA/B impacts=1、AttackC impacts=0 全过）+ ⑨ A+ 处置翻绿（去重断言 State.Answer=="first" 过） |
| gallery | 红（③ Esc 复位 + ⑤ 分辨率） | **passed:true** | ③ 等 Moving=false 再验复位（2cm/0.05° 未放松）+ ⑤ 编辑器如实记录不断言；600s soak 过 |
| booth | 红（④ 运输 7s 顶界 + ⑤ 分辨率） | **passed:true** | ④ 上限 7→8 对齐 v27 SkyLift 实测 + ⑤ |
| research | 红（⑤ 分辨率） | **passed:true** | ⑤ |

- shaderErrors 全件 0（回归口径补条：log 里 "Shader error" 行=回归信号，已逐件 grep）。
- 五件 gate 产物：`docs/validation/ta-ab-2026-09-25/{visual,performance,gallery,booth,research}/runtime.json`（png gitignore）。
- 复跑命令：`ta3-resume.sh`（.workbuddy/tmp/，lint 带 -quit；gate 不带——gate 自己 Exit）。
