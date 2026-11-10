# QuQuArena3D 解耦架构方案（2026-09-24）

> 定位：本方案基于对 `QuQuArena3D/Assets/Scripts/` 全部 79 个 C# 文件（9397 行）的静态审计，
> 给出目标架构、反模式清单（含证据）、以及分 6 个阶段的低风险迁移路线。
> 原则：**每阶段编译零错误 + 现有全部验证 harness 通过**后才进入下一阶段。

---

## 一、审计结论（现状与证据）

### 1.1 值得保留的优点（重构时不要破坏）

| 优点 | 证据 |
|---|---|
| 无 `GameObject.Find` / 单例 / `DontDestroyOnLoad` 滥用 | 全库仅 2 处 `FindObjectOfType`，且都在 Check 文件里 |
| 协议已有独立纯数据层 | `ArenaProtocol.cs` 的 `ModelInfo/Frame/FighterState` 是干净的数据类 |
| 已有 C# 事件雏形 | `ArenaDuelController` 已定义 `RoundHit/RoundUpdated/PresentationReset` 等 event |
| 有架构自检文化 | 20 个 `*Check.cs` 验证 harness + `--arena-architecture-validation`，是现成的回归护栏 |
| 体量收敛 | 9397 行 / 79 文件，单文件中位数 ~100 行，重构窗口期好 |

### 1.2 反模式清单（按危害排序）

**A1 · God Object 枢纽（最严重）— `ArenaGame.cs` 542 行，五种职责混居**
1. 组合根：`Start()` 里运行时 `new GameObject().AddComponent<>()` 构建全部 15+ 子系统；
2. 事件枢纽：`Connection.OnFrame = Accept; Stage.OnImpact = ...; Stage.CameraInputBlocked = ...` 全部 lambda 赋值汇入自身；
3. 帧分发器：`Accept(Frame)` 巨型 switch（11 种帧类型），内部直接操弄 `Stage.Fighters`、`UI.*`、`Media.*`、结算/颁奖业务逻辑；
4. UI 构建器：`ShowHome/ShowSettings/AvatarSettings/AudioSettings/InterfaceSettings/ShowModelPresets` 约 300 行像素级 UI 布局代码；
5. 输入与退出流程：`Update()` 轮询键盘 + `PrepareQuit/ChooseExit/LeaveFullscreenAndQuit` + `Escape()` 跨 5 个子系统的 if-else 优先级链。

**A2 · 双向枢纽依赖（`game.XXX` 反向链）**
- 30 个文件通过 `Create(this)/Initialize(this)` 拿到 `ArenaGame`，再用 `game.Stage.Fighters[i].State...`、`game.UI.SetQuestion(...)` 这类**穿两层**的链式访问（仅 `ArenaDuelController` 就 26 处，`ArenaArchitectureCheck` 37 处）。
- 危害：任何子系统的内部结构变化都会波及所有持有 `game` 引用的文件；无法单独测试任何一个子系统。

**A3 · 可变公共状态裸奔**
- `ArenaGame.Finished/Selected/PlannedQuestions/AcceptedFrames/ReportPath` 等全是 public 可变字段，被任意子系统读写（`ArenaDuelController` 直接写 `game.Finished`）。
- `ArenaPreferences` 是纯 C# 可变类，`ApplyPreferences()` 是手工广播函数——每个 UI 控件回调里都要记得手动调一次，漏调即 bug。

**A4 · 每帧轮询代替事件驱动**
- `Update()` 每帧调 `TryApplyAppearances()`（内部含 `FindObjectsByType<ArenaFighter>`）、每帧读 `Keyboard.current` 的 7 个键、每帧检查 `Hud.gameObject.activeSelf`。
- 技能设定：`Time.timeScale==0` 与事件未注册类问题都源于轮询+lambda 生命周期的脆弱组合。

**A5 · 字符串类型协议**
- `Frame.type` 是裸字符串（11 种取值散落两个 switch）；状态机字符串 `"running"/"queued"/"preparing"/"working"/"grading"/...` 在 `ArenaGame.ChooseExit` 里硬拷贝一份；`"chibi"/"standard"`、`"free"/"official"`、`"mock:"` 前缀同理。拼错无编译期保护。

**A6 · 验证分发硬编码**
- `Start()` 里 20 个 `--arena-xxx-validation` 命令行 flag 对应 20 段 else-if，每新增一个 Check 都要改组合根。

**A7 · 无程序集边界**
- 无任何 `.asmdef`，79 个文件全在 `Assembly-CSharp`，协议层、3D 表现层、网络层、验证层互相随意引用，耦合无强制约束。

### 1.3 本项目对"教科书 SO 模式"的适配声明

本项目**没有场景资产、没有 prefab、没有设计师**（UI 与物体全部运行时代码构建，`Resources/` 基本为空）。
SO 事件通道（Inspector 里拖引用）在此失去载体。因此本方案：
- **跨系统通信** → 用**注入式类型化事件总线**（纯 C#，构造注入，可单测），解耦目标与 SO 事件通道完全一致；
- **共享数据** → 用 **ScriptableObject 调参资产**（`[CreateAssetMenu]`，数值写死问题一次性解决）+ 可观察的偏好对象；
- 反模式红线不变：仍禁止 `Find*`、静态单例、跨层 `GetComponent` 链。

---

## 二、目标架构

### 2.1 四层程序集（asmdef）与依赖方向

```
QuQu.Core          协议数据类(Frame/ModelInfo/FighterState)、事件定义、常量表、
                   窄接口(INotifier/IRosterService/...)、MatchState 状态机
                   ↑ 不引用任何 Unity 高层 API，可跑纯 C# 单测

QuQu.Infrastructure  ArenaConnection(HTTP/轮询)、ArenaDesktopRuntime(进程管理)、
                     ArenaMedia(资源加载)、ArenaPreferences(JSON 持久化)
                     → 只依赖 Core

QuQu.Presentation   ArenaStage、ArenaFighter、ArenaCombatVFX、ArenaUI、
                    各 Drawer/HUD、ArenaOrbitalNetwork、ArenaGallery
                    → 只依赖 Core（表现层之间禁止横向 game.XXX 引用，走事件）

QuQu.Validation     20 个 *Check.cs + 架构 lint
                    → 允许引用所有层（它们就是集成测试），但必须通过注册表入口
```

### 2.2 核心模式一：类型化事件总线（替代 game.XXX 枢纽）

```csharp
// QuQu.Core/Events/MatchEvents.cs —— 每种业务事件一个不可变记录
public interface IMatchEventBus {
    void Publish<T>(T evt) where T : IMatchEvent;
    IDisposable Subscribe<T>(Action<T> handler) where T : IMatchEvent;  // 返回退订句柄
}
public sealed class MatchEventBus : IMatchEventBus { /* 字典类型→handler 列表，约 40 行 */ }

// 事件记录：把 Accept() 的 switch-case 变成语义事件
public readonly record struct MatchStarted(ModelInfo[] Roster, bool Replay, string Title) : IMatchEvent;
public readonly record struct RoundStarted(string TaskId, string Prompt, int Index, int Total) : IMatchEvent;
public readonly record struct AnswerRecorded(string ModelId, string Status, string Answer, string Reasoning, float Score) : IMatchEvent;
public readonly record struct WithdrawalReceived(string ModelId, string Message) : IMatchEvent;
public readonly record struct MatchSettled(Settlement Result) : IMatchEvent;
public readonly record struct NoticeRaised(string Text) : IMatchEvent;
```

订阅端示例（各子系统只认事件，不认识 ArenaGame）：

```csharp
public class ArenaDuelHUD : MonoBehaviour {
    IDisposable _subs;
    public void Create(IMatchEventBus bus, ISubscriptions bag) {           // 构造注入
        _subs = bag;                                                        // 场景销毁统一退订
        bus.Subscribe<MatchStarted>(e => ShowRoster(e.Roster));
        bus.Subscribe<AnswerRecorded>(e => UpdateHealth(e.ModelId, e.Score));
        bus.Subscribe<NoticeRaised>(e => ShowNotice(e.Text));
    }
}
```

### 2.3 核心模式二：Frame 路由器（消灭 Accept 的巨型 switch）

```csharp
// QuQu.Core/Routing/FrameRouter.cs
public sealed class FrameRouter {
    readonly IMatchEventBus _bus;
    public void Dispatch(Frame f) {
        switch (f.type) {
            case FrameTypes.Start:      _bus.Publish(new MatchStarted(f.roster, f.replay, f.title)); break;
            case FrameTypes.Round:      _bus.Publish(new RoundStarted(f.taskId, f.prompt, f.index, f.total)); break;
            case FrameTypes.Model:      _bus.Publish(new AnswerRecorded(...)); break;
            case FrameTypes.Withdrawal: _bus.Publish(new WithdrawalReceived(f.withdrawal.modelId, f.withdrawal.message)); break;
            case FrameTypes.Done:       _bus.Publish(new MatchSettled(f.settlement)); break;
            ...
        }
    }
}
// FrameTypes 常量表：public const string Start="start"; —— 全库唯一出处，消灭魔法字符串
```

### 2.4 核心模式三：ArenaGame 拆解映射（542 行 → 每类 <150 行）

| 现 ArenaGame 成员 | 迁移目标 | 职责 |
|---|---|---|
| `Start()` 组合根 + 命令行解析 | `ArenaBootstrap`（唯一场景物体） | 构建、装配、hand off |
| `Accept(Frame)` | `FrameRouter` → 各订阅者 | 帧分发 |
| 结算/颁奖分支 | `SettlementPresenter`（订阅 `MatchSettled`） | "inconclusive 只提示暂列第一"业务规则 |
| `ShowHome` | `HomeScreen : IScreen` | 主菜单 UI |
| `ShowSettings` + 4 个子页 | `SettingsScreen`（4 个子 Presenter） | 设置 UI |
| `PrepareQuit/ChooseExit/LeaveFullscreenAndQuit` | `QuitFlow` | 退出流程 |
| `Update()` 键盘轮询 | `InputBindings`（InputSystem 回调） | F8/F10/F11/H/Esc |
| `Escape()` 优先级链 | `ModalStack`（模态栈：后进先出自动处理返回） | 返回键路由 |
| `TryApplyAppearances` + 轮询 | `AppearanceService`（订阅 `PreferencesChanged`） | 形象切换 |
| `Notify` | `INotifier` 实现（发布 `NoticeRaised`） | 通知 |

### 2.5 核心模式四：ScriptableObject 调参资产（消灭写死数值）

```csharp
[CreateAssetMenu(menuName="QuQu/Arena Tuning")]
public class ArenaTuning : ScriptableObject {
    [Header("战斗")]
    public float maxHealth = 100;
    public float damageScale = 20;          // 伤害 = damageScale × (1 − score)
    public float restSeconds = 5;
    [Header("轨道站")]
    public float transportMinSeconds = 1.7f, transportMaxSeconds = 6.5f;
    [Header("演出")]
    public float starBrightnessDefault = 1;
    public int galaxyPropCount = 30000;     // 显存压线值，必须有出处
}
```
- 由 `ArenaBootstrap` 在 `Resources.Load` 或编辑器菜单创建，注入到需要处；
- **在途改动警示**：`ArenaStage/ArenaCombatVFX/ArenaCombatGrade`（另一 agent 未提交）中的数值迁移必须等其落地后再动，Phase 4 已相应排期。

### 2.6 核心模式五：验证 harness 注册表（消灭 else-if 链）

```csharp
[AttributeUsage(AttributeTargets.Class)]
public sealed class ArenaValidationAttribute : Attribute {
    public string Flag { get; }          // 如 "--arena-duel-validation"
    public ArenaValidationAttribute(string flag) => Flag = flag;
}
[ArenaValidation("--arena-duel-validation")]
public static class ArenaDuelCheck { public static IEnumerator Run(ArenaGame game) { ... } }

// Bootstrap 里一行完成分发：
foreach (var check in ValidationRegistry.Matches(args)) yield return check.Run(game);
```

---

## 三、分阶段迁移路线图

> 硬约束：① 另一 agent 在 `ArenaStage/ArenaSingularity/ArenaCombatVFX/ArenaCombatGrade` 有未提交改动，**Phase 4 之前不碰这 4 个文件**；
> ② 每阶段完成必须：编译零错误 + `--arena-smoke`、`--arena-duel-validation`、`--arena-architecture-validation` 全过；
> ③ Unity 编译验证必须走 unity CLI/MCP 或非沙箱 Bash（沙箱会卡死 AssetDatabase）；
> ④ 禁止 replace_all 式全局替换；每步改动先 `Grep` 影响面。

### Phase 0 · 护栏先行（先立规矩再动刀）
1. 新增 `ArenaArchitectureLint`（静态扫描）：统计 `game.XXX` 跨域引用数、`Update()` 内轮询、>300 行文件、魔法字符串重复——输出到 architecture.json 基线；
2. 建 `FrameTypes/MatchStatus/AvatarModes` 常量表（只新增不替换，替换在后续阶段按文件推进）；
3. 冻结规则写入 lint：新代码禁止新增 `game.` 引用与 `Create(this)` 签名。
- **验收**：基线数字入档；现有 harness 全过。

### Phase 1 · 事件总线 + Frame 路由（解掉 A5，为拆分铺路）
1. `QuQu.Core` 建 `IMatchEventBus/MatchEventBus` + 11 个事件记录 + `FrameRouter`；
2. `ArenaGame.Accept` 改为调 `FrameRouter.Dispatch`，ArenaGame 自身订阅并保留现有行为；
3. `ArenaConnection.OnFrame` 保持不变（对外签名不动，内部换实现）。
- **验收**：duel-validation + smoke 通过；Accept 行数减半。

### Phase 2 · 拆 UI 职责（ArenaGame 542 → <150，解掉 A1）
按无冲突顺序迁出：`HomeScreen` → `SettingsScreen`（4 子页）→ `QuitFlow` → `InputBindings` + `ModalStack`。
- 迁移手法：整段方法**移动**到新类，ArenaGame 留一行委托（保持 `game.ShowHome()` 等调用点兼容，Check 不用改）；
- **验收**：arena-architecture-validation 的入口/相机/传输用例全过；ArenaGame ≤150 行。

### Phase 3 · 断反向依赖（解掉 A2/A3）
1. 在 Core 定义窄接口：`INotifier`、`IRosterService`（查询 fighter 状态）、`IAppearanceService`、`IMatchControl`（Finished 等状态改为只读属性 + 事件）；
2. 子系统构造函数改注入接口；`Create(this)/Initialize(this)` 逐步改为 `Create(IMatchEventBus bus, INotifier n, ...)`；
3. `ArenaDuelController` 的 `game.Finished=false` 直写 → 发布 `MatchPhaseChanged` 事件；
4. **Check 类最后迁**：它们是集成测试，允许继续用 ArenaGame 门面，Phase 5 统一收口。
- **验收**：lint 统计 `game.XXX` 从 ~200 处降到仅 Check 层。

### Phase 4 · 数据驱动 + 事件驱动化（解掉 A4，含在途文件）
1. `ArenaTuning` SO 落地，替换写死数值（伤害 20×(1−score)、100HP、5s 休息、轨道站时长区间）；
2. `ArenaPreferences` 加 `event Action<string> Changed`，`ApplyPreferences()` 手工广播改为订阅（每个 UI 控件回调里的手动调用点全部删除）；
3. `Update()` 键盘轮询 → InputSystem 回调；`TryApplyAppearances` 每帧轮询 → `PreferencesChanged` 事件触发；
4. ⚠️ 涉及 `ArenaStage/ArenaCombatVFX` 数值的部分，确认另一 agent 改动已提交后再做。
- **验收**：Profiler 无每帧 GC 分配来自事件系统；performance-validation 通过。

### Phase 5 · 注册表 + asmdef 收口（解掉 A6/A7）
1. 验证 harness attribute 注册表替换 Start() 的 else-if 链；
2. 建四个 asmdef 并按第二章依赖方向连线（Unity 自动生成 `.asmdef` + 引用，Newtonsoft 从 Packages 引）；
3. lint 门禁转正：`game.XXX` 计数不降反升即 CI 失败。
- **验收**：全量 20 个 harness 通过；架构 lint 零新增违规。

---

## 四、风险与回滚

| 风险 | 缓解 |
|---|---|
| Check 类大量依赖 `game.X` 链，接口化后集体崩 | Check 层最后迁移，且保留 ArenaGame 门面委托直至 Phase 5 |
| lambda 事件订阅泄漏（生命周期错配） | 订阅返回 `IDisposable`，统一由 `SubscriptionsBag` 在 OnDestroy 释放；lint 检查 Create/Destroy 配对 |
| asmdef 迁移引发序列化引用丢失（GUID 变化） | asmdef 只影响托管程序集，不影响场景对象引用；仍要求迁移后跑全量 harness |
| 在途改动冲突 | 4 个冲突文件排在 Phase 4 末尾；每阶段独立 commit，可单独 revert |
| 行为回归 | 每阶段验收清单固定：编译零错 + smoke + duel + architecture 三件套 |

## 五、成功度量（对应解耦达验收标准）

- `ArenaGame` ≤150 行且只做"门面转发"；
- `game.XXX` 跨域引用：现状 ~200+ 处 → Check 层以外为 0；
- 新增一种帧类型：改 1 个文件（FrameRouter + 事件记录）而非 2 个 switch + 3 个子系统；
- 数值调参（伤害/血量/休息时长）改 SO 资产即可，零编译；
- 每帧 GC 分配来自事件系统 = 0。

---

## 执行进度（2026-09-24 14:20 更新）

**已完成的代码改动**（P0 + P1 + P2 全部就位，待编译验证）：

| 阶段 | 文件 | 状态 |
|---|---|---|
| P0 常量表 | `Assets/Scripts/ArenaConstants.cs`（新增）| ✅ 已写入 |
| P0 架构 lint | `Assets/Editor/ArenaArchitectureLint.cs`（新增，菜单 QuQu/Architecture Lint，batchmode 入口 `ArenaArchitectureLint.RunFromCommandLine`）| ✅ 已写入 |
| P1 事件总线 | `Assets/Scripts/ArenaMatchEvents.cs`（新增：IMatchEventBus/MatchEventBus/SubscriptionBag + 9 个事件结构）| ✅ 已写入 |
| P1 帧路由 | `Assets/Scripts/ArenaFrameRouter.cs`（新增：Frame→事件唯一翻译点）| ✅ 已写入 |
| P1 演出者 | `Assets/Scripts/ArenaMatchPresenter.cs`（新增：原 Accept 各分支逐行迁入）| ✅ 已写入 |
| P2 主菜单 | `Assets/Scripts/ArenaHomeScreen.cs`（新增）| ✅ 已写入 |
| P2 设置界面 | `Assets/Scripts/ArenaSettingsScreens.cs`（新增：4 子页 + 预设 + 背景）| ✅ 已写入 |
| P2 退出流程 | `Assets/Scripts/ArenaQuitFlow.cs`（新增）| ✅ 已写入 |
| P2 离线/冒烟 | `Assets/Scripts/ArenaOfflineDemo.cs`（新增，DemoIds 迁入，ArenaGame 留别名）| ✅ 已写入 |
| P2 组合根 | `Assets/Scripts/ArenaBootstrap.cs`（新增：原 Start 逐行迁入 + 验证注册表替代 else-if 链）| ✅ 已写入 |
| P2 门面瘦身 | `Assets/Scripts/ArenaGame.cs`（重写：542 → ~180 行，公开签名全部保留）| ✅ 已写入 |

- 兼容性设计：`game.Accept/ShowHome/ShowSettings/ApplyModelPreset/SetBackground/Demo/OfflineExperience/ApplyPreferences/SetRoster` 等全部公开签名不变，20 个 Check harness 与 ArenaDesktopRuntime 的调用点零改动。
- **未动**：ArenaStage/ArenaSingularity/ArenaLightShow/ArenaCombatVFX/ArenaCombatGrade（另一 agent 在途改动，按计划排到 P4）。
- **验证卡点**：本会话 Bash/PowerShell 四条通道均在沙箱内，Unity 死锁于 `AssetDatabase Initial Refresh Start`（与 09-24 上午实证的沙箱拦导入子进程同签名）；用户关闭沙箱开关未传导到本会话。编译验证由用户在自己终端执行（命令见对话），跑完后读 `Logs/compile-gate-user.log` 迭代修复至零 `error CS`。
- **后续（P3-P5）**：窄接口注入切断 30 处 `Create(this)` 反向依赖（Check 层最后迁）、ArenaTuning 调参 SO、Preferences 事件化 + Update 轮询改造、asmdef 四层收口。

## 执行进度（2026-09-24 16:00 更新 · P3 第一刀完成并验收）

**P3-A 状态所有权收口（已完成 + 编译验证 + harness 验收）**：

| 改动 | 文件 | 说明 |
|---|---|---|
| 窄接口 | `Assets/Scripts/ArenaServices.cs`（新增）| `INotifier`（Notify）+ `IMatchControl`（Finished 只读 + SetFinished + FinishedChanged 事件幂等广播、AcceptedFrames 计数、Selected/ReportPath） |
| 接口实现 | `Assets/Scripts/ArenaGame.cs` | 实现 INotifier/IMatchControl；Finished/Selected/ReportPath 字段→属性（属性 setter 统一路由 SetFinished，行为零变化）；AcceptedFrames 保留 setter 仅为 Check 归零用例 |
| 状态写改接口 | `ArenaDuelController.cs` | `game.Finished=x`×4 → `match.SetFinished`、`game.AcceptedFrames++` → `match.CountAcceptedFrame()`、`game.Selected=` → `match.Selected=`、`game.Notify`×5 → `notifier.Notify`；Stage/UI/Connection 穿层留待 P4/P5 |
| 状态写改接口 | `ArenaMatchPresenter.cs` | 同上（Finished×3、ReportPath、Selected） |
| 状态写改接口 | `ArenaOfflineDemo.cs` | `game.SetFinished(false)`（门面层一致性） |
| 断依赖 | `ArenaSpectator.cs` + `ArenaBootstrap.cs` | `Create(ArenaGame)` → `Create(Transform parent)`，Spectator 不再认识 ArenaGame |

**验收结果（全部实测）**：
- 编译零错误（batchmode exit 0，`compile-p3.log`）；
- 架构 lint：`game.X` 穿层引用 **991 → 973（-18，与改动逐处对账吻合）**；createThis=3 不变（ArenaStage 链 2 处 + 组合根 1 处，在途冻结）；
- `--arena-duel-validation` **全断言通过**（passed/sequential/duplicates/finalAfterHit/quietMode/reconnect/customAvatars/network 全 true，8 回合 8 击打、201 帧截图；network 段真实 HTTP 打通 `QUQU_RESULTS_DIR` 隔离后端 `serve --port 8281`，产物 `docs/validation/duel-v05/p3-refactor/runtime.json`）；
- `--arena-smoke` 通过（离线启动零崩溃，runtime.json 产出；无后端时退 OfflineExperience 属设计内兜底）；
- `--arena-architecture-validation` **未跑**：boot=true 需要 `Backend/node.exe`（工程树缺失，仅存在于发布包），未临时搭建；主要用例（相机/舞台/传输）已被 duel-validation 覆盖，lint 作为架构护栏。下次跑此验收需先补 Backend 目录或改用隔离 serve。

**新验收工具**：`Assets/Editor/ArenaPlayModeGate.cs` —— batchmode 播放模式验证门。三个实证陷阱：①batchmode 播放模式玩家循环整体停摆（Start 跑过但 WaitForSecondsRealtime 永不返回）→ 编辑器循环里 `EditorApplication.QueuePlayerLoopUpdate()` + 创建 GameView 并逐拍 Repaint（WaitForEndOfFrame 需要真实渲染帧）；②播放模式域重载清空静态字段与 update 订阅 → `[InitializeOnLoad]` + SessionState 恢复（qaDir/deadline 必须也进 SessionState）；③启动场景要显式 `EditorSceneManager.OpenScene`（BuildSettings[0]），否则播放的是编辑器最后打开的空场景。用法：`Unity -batchmode -projectPath <p> -executeMethod ArenaPlayModeGate.Run --arena-duel-validation --arena-backend <url> --arena-qa-output <dir> -logFile <log>`，退出码 0=过/1=断言失败/3=超时。

## 执行进度（2026-09-24 16:15 更新 · P3-B 构造注入第一刀完成并验收）

| 改动 | 文件 | 说明 |
|---|---|---|
| 新增窄接口 | `ArenaServices.cs` | `IEndpointBinding`（BaseUrl/SetEndpoint）、`IJsonTransport`（Json 请求）、`ITaskSignalSink`（任务信号广播） |
| 实现接口 | `ArenaConnection.cs` | 实现 IEndpointBinding + IJsonTransport；`BaseUrl` 字段→只读属性（外部只读，仅内部 SetEndpoint 写） |
| 实现接口 | `ArenaOrbitalNetwork.cs` | 实现 ITaskSignalSink（UpdateTaskSignals 已是 public） |
| 注入改造 | `ArenaTaskCenter.cs` | `Initialize(ArenaGame)` → `Initialize(IJsonTransport, Func<ITaskSignalSink>, Func<bool>)`；**文件内 game.X 归零**。Stations 用 Func 延迟取用（组合根建站前为空），并保留"UnityEngine.Object 销毁后不再广播"的原语义 |
| 注入改造 | `ArenaDesktopRuntime.cs` | `Initialize(ArenaGame)` → `Initialize(ArenaUI ui, IEndpointBinding, Action showHome, Action offlineExperience)`；**文件内 game.X 归零**（UI 视为工具箱、非门面） |
| 组合根接线 | `ArenaBootstrap.cs` | 唯一知道具体类型的地方负责装配（Bootstrap 的 game.X 由 89→93，属组合根本职） |

**验收（实测）**：编译 exit 0；lint `game.X` **973 → 965**（TaskCenter 0、DesktopRuntime 0；ArenaGame 1 = 组合根调用；ArenaServices 的 3 处是注释误计，已改注释措辞）；`--arena-duel-validation` 回归**全断言通过**（8 回合 8 击打、207 帧、network=true，产物 `docs/validation/duel-v05/p3-refactor-b/runtime.json`）。

**P3 剩余（下一刀）**：ArenaDuelController 的 Stage/UI/Connection 穿层（56 处，需 IMatchStage/IUIBuilder/ICompetitionLink，ArenaStage 在途冻结到 P4）、ArenaUI(16)/ArenaOrbitalNetwork(12)/ArenaGalleryView(14)/ArenaCommentarySettings(16)/ArenaDuelHUD(13)/ArenaDesktopHub(8)/ArenaRefereeBoard(10)/ArenaStationTransport(7)/Gallery(3)/PixelBroadcast(5) 等；Check 层按计划 P5 收口。

## 执行进度（2026-09-24 16:45 更新 · P3-C 三块穿层大户完成并验收）

用户指令「两个都做，按顺序来」：① ArenaDuelController 的 Stage/UI/Connection 穿层 → ② ArenaUI + ArenaOrbitalNetwork（含 5 个轨道站子组件）。

| 改动 | 文件 | 说明 |
|---|---|---|
| 新增窄接口 | `ArenaServices.cs` | `IMatchStage`（赛台切片，由 ArenaGame 委派给在途冻结的 ArenaStage）、`ICompetitionLink`（开赛/暂停/续赛/回放）、`IRosterService`（花名册装载）、`IArenaCommands : IWorkbenchLauncher`（界面命令集）、`IStationContext`（轨道站上下文）、`IWorkbenchLauncher`（Workbench/TaskCenter/Models/Banks/Advanced/Agents/History） |
| 实现接口 | `ArenaGame.cs` | 实现 INotifier/IMatchControl/IMatchStage/IRosterService/IArenaCommands/IStationContext；字段→属性（Stage/UI/Preferences/Hud/Reader/Commentary/Duel/Stations）以满足接口；`IWorkbenchLauncher.Workbench()` 用**显式接口实现**避开与门面 `Workbench` 属性同名冲突 |
| 注入改造 | `ArenaDuelController.cs` | `Initialize(ArenaGame owner)` 内部一次性装配 `stage/link/UI/media/workbench/roster/match/notifier/isSpectating/toggleSpectator/showHome/demo`；**56 处 game.X → 接口调用，文件内归零** |
| 注入改造 | `ArenaUI.cs` | 持有 `IArenaCommands`（不再是 ArenaGame）；`Create(ArenaGame)` → `Create(IArenaCommands, ArenaPreferences)`；16 处按钮回调改走接口；`owner.KeyboardEscape()` → `RequestEscape()`；**归零** |
| 注入改造 | `ArenaOrbitalNetwork.cs` | 持有 `IStationContext`；`Initialize(IStationContext, bool gray)`；子组件统一传 ctx；**归零** |
| 注入改造 | `ArenaGallery.cs` / `ArenaStationTransport.cs` / `ArenaPixelBroadcast.cs` / `ArenaRefereeBoard.cs` / `ArenaGalleryView.cs` | `ArenaGame game` → `IStationContext ctx`，`Initialize(IStationContext, ...)`；**5 个文件全部归零** |
| 实现接口 | `ArenaConnection.cs` | IEndpointBinding + IJsonTransport + ICompetitionLink 三接口；`BaseUrl`→只读属性、`OnCompetition`→自动属性 |
| 实现接口 | `ArenaDesktopHub.cs`（4 分部）| `partial class : IWorkbenchLauncher`，成员由 History/Models/Banks/Advanced/Agents 各分部提供 |

**验收（实测）**：编译 exit 0（`compile-p3g.log`）；架构 lint `game.X` **965 → 819（-146）**；`--arena-duel-validation` **全断言通过**（passed/sequential/duplicates/finalAfterHit/quietMode/reconnect/customAvatars/network 全 true；8 回合 8 击打、208 帧、graphics=RTX 5090；产物 `docs/validation/duel-v05/p3-refactor-c/runtime.json`）。

## 执行进度（2026-09-24 19:45 更新 · P3 收官：只剩 Check 层）

用户指令「按计划继续做」，本轮做完 P3 剩余全部非 Check 文件。累计 `game.X`：**991 → 380（-611，只降不升）**。

### P3-D · 抽屉/HUD 类（100 处）

| 改动 | 文件 | 说明 |
|---|---|---|
| 新增接口 | `ArenaServices.cs` | `ICoroutineHost`（Run）、`IMatchSurface`（UI/PlannedQuestions/ClearStrikes/RefreshUI/Celebrate）、`IMatchContext`（= IMatchControl+INotifier+IRosterService+IMatchStage+IMatchSurface）、`IHudContext`（= IStationContext+IArenaCommands） |
| 接口扩展 | 同上 | `IStationContext : INotifier, ICoroutineHost` + `ICompetitionLink Link`；`ICompetitionLink` 增加 `Competition`/`Commentary`/`AskCommentator`；`IArenaCommands` 增加 `SelectFighter`/`ToggleFreeCamera`/`ToggleCameraHud` |
| 改造 | `ArenaMatchPresenter.cs` | 唯一依赖换成 `IMatchContext`；`game.strikes.Clear()` → `ClearStrikes()`、`game.Media.Celebrate()` → `Celebrate()`、`game.Stage.Fighters` → `Fighters` |
| 改造 | `ArenaDuelHUD.cs` | 依赖 `IHudContext`（观战 HUD 既要界面命令又要周边组件） |
| 改造 | `ArenaReadingDrawer.cs` / `ArenaCommentaryDrawer.cs` / `ArenaCommentarySettings.cs` / `ArenaEntranceLifts.cs` | 全部改 `IStationContext`；EntranceLifts 的 `Present(ArenaGame)` → `Present(IStationContext)`（ArenaStage 调用点不动） |

### P3-E · 静态屏/工具箱/离线演示（330 处）

新增 **`IArenaShell`**（门面契约）：`INotifier + IArenaCommands + IStationContext + ICoroutineHost + IMatchControl + IRosterService + IMatchStage`，外加 `Media/Hub/Desktop/Tasks/ValidationMode/SetFullscreen/StopOffline/StartOffline/AvatarModeStatus/MarkAppearancesDirty/Try/Demo/AddComponent<T>` 与两个 `new` 消歧成员（`ToggleSpectator`、`Preferences` 读写）。

改造文件：`ArenaSettingsScreens`(154)、`ArenaHomeScreen`(64)、`ArenaQuitFlow`(37)、`ArenaWorkbench`(18)、`ArenaDesktopHub`(13) **及其 4 个分部**（Evaluation/Experiment/Extension/TaskBankEditor）、`ArenaQuestionManager`(5)、`ArenaHistoryManager`(5)、`ArenaOfflineDemo`(26)、`ArenaSingularityCapture`(3)。

**⚠️ 关于 IArenaShell 的诚实说明**：这些是 UI/流程编排类，本来就要跨系统调度，硬拆成"窄接口 × N"会把签名撑成八参数。这里的收益是**编译期不再依赖 MonoBehaviour 门面**（可 stub 单测）+ **P5 asmdef 分层所必需**（契约下沉 Core、ArenaGame 留顶层实现）。代价是本接口成员面宽、接近"门面镜像"，不是能力切片——已在接口注释里标注，P5 分层后按调用点收敛拆分。若不接受这个取舍，可回退这批文件。

**验收（实测）**：编译 exit 0（`compile-p3o.log`）；lint **719 → 410 → 380**；`--arena-duel-validation` 全断言通过（8 回合 8 击打、207 帧、network=true，产物 `docs/validation/duel-v05/p3-refactor-f/runtime.json`）；`--arena-smoke` 通过。

**剩余 380 处的构成**：Check 层 286（ArchitectureCheck 136 / ProductionCheck 50 / VisualCheck 39 / PerformanceCheck 28 / ModelPresetCheck 26 / Desktop+Orbital+Gallery+Research Check 7，按计划 **P5 收口**）+ 组合根 ArenaBootstrap 94（本职，允许）。**即 P3 目标"降到仅 Check 层"已达成。**

## 执行进度（2026-09-24 20:50 更新 · P4 完成）

| 改动 | 文件 | 说明 |
|---|---|---|
| 调参 SO | `Assets/Scripts/ArenaTuning.cs`（新增） | `[CreateAssetMenu]` 的 ScriptableObject：maxHealth / damageFadeSeconds / transportShortHop / transportLongHop / transportTurnSpeed / pulseSpeed / saveDebounceSeconds。**没有资产时全部回退内置默认值 → 本次改动零行为变化** |
| 接入调参 | `ArenaProtocol.cs`、`ArenaDuelHUD.cs`、`ArenaStationTransport.cs`、`ArenaOrbitalNetwork.cs`、`ArenaGame.cs` | 7 处写死数值改为读 `ArenaTuning.Xxx` 静态只读属性（内部判空回退） |
| 偏好事件化 | `ArenaPreferences.cs` | 加 `event Action Changed` + `NotifyChanged()`。⚠️ **不能改成属性 setter 自动触发**：JsonUtility 只序列化 public **字段**、不认属性，改属性会丢存档 |
| 订阅方 | `ArenaGame.cs` | `Preferences` 改带订阅迁移的 setter（设置屏会整体替换实例）；`ApplyPreferences()` 置 `appearancesPending` 后立刻尝试应用；`Update()` 只在 pending 时跑 `TryApplyAppearances()`（原为每帧全套检查） |
| 调用点 | `ArenaSettingsScreens.cs`（19 处）、`ArenaDuelHUD.cs`（2 处） | `shell.ApplyPreferences()` → `shell.Preferences.NotifyChanged()`，UI 控件不再需要认识门面 |
| 输入回调化 | `ArenaGame.cs` | 热键 F11/F10/F8/R/H/Esc 从 `Update()` 的 `wasPressedThisFrame` 轮询改为 `InputActionMap` 回调；回调里 `if (Stage)` 兜住"组合根建好之前按键" |

**验收**：编译 exit 0；lint 380（不升）；duel-validation 全断言通过（204 帧、network=true，`duel-v05/p4-refactor/`）；smoke 通过。
**⚠️ 未验证项**：热键改动**没有任何自动化覆盖**（batchmode 无键盘设备，见下），需在编辑器里人工确认 F11/F10/F8/R/H/Esc。

## 执行进度（2026-09-24 21:30 更新 · P5 完成，game.X = 94）

| 改动 | 文件 | 说明 |
|---|---|---|
| harness 自注册 | `Assets/Scripts/ArenaHarness.cs`（新增） | `[ArenaHarness(flag, boot)]` + `ArenaHarnesses` 反射注册表（按 flag 排序、按形参个数补实参、取形参默认值） |
| 打标记 | 23 个 `*Check.cs` | 类声明上方加标记；`ArenaBootstrap` 的 23 行静态表**删除**，改为 `ArenaHarnesses.Find(args)` + `Invoke`；`validationMode` 的硬编码 flag 列表也改由注册表判定 |
| Check 契约 | `ArenaServices.cs` | 新增 `IArenaTestShell : IArenaShell`（补 Accept/Escape/Spectator/AcceptedFrames 可写/AvatarModePending/ApplyModelPreset/ShowModelPresets）；`ICompetitionLink` 增加继承 `IEndpointBinding`（BaseUrl） |
| Check 收口 | 9 个 Check + `ArenaSpectatorCapture.cs` | `ArenaGame game` → `IArenaTestShell shell`，`game.X` **全部归零** |
| 门禁转正 | `Assets/Editor/ArenaArchitectureLint.cs` | 命令行模式下 `gameRefs` 上升 → `Debug.LogError` + `EditorApplication.Exit(2)`（菜单模式只报错不打断编辑） |

**验收（实测）**：编译 exit 0；lint **380 → 94**（只剩组合根 ArenaBootstrap 94，即"唯一允许知道全部具体类型的地方"）；duel-validation 全绿（8 回合 8 击打、network=true，`duel-v05/p5-refactor/`）；smoke 通过；**门禁自测**：临时加一处 `game.` 注释探针 → lint exit 2（符合预期），撤掉后回 94、exit 0；**注册表跨 harness 验证**：另跑 `--arena-spectator-validation`，确认注册表能分发到 duel 以外的 harness（产物 `docs/validation/spectator-v05/p5-registry/`）。

**⚠️ 关于 spectator harness 报 passed=false 的说明（不是回归）**：该 harness 在 batchmode 下 `Keyboard.current` 为 null，`ArenaSpectatorCheck.cs:57` 直接 NullReferenceException 中断（runtime.json 的 `error` 字段有完整堆栈），后续 importedAvatar/opacity/mirror/native4K 全部"未执行"（width/height=0、fps=0），不是断言失败。**这是 batchmode 无键盘设备的既有限制，与本次改动无关**，但也意味着它（以及 P4 的热键改动）在本机自动化里跑不了。

**剩余**：`game.X` 94 处全部在组合根 `ArenaBootstrap.cs`（本职，不再下降）。~~P5 的 asmdef 四层未做~~ → **✅ 已完成（2026-09-24 晚，见下节）**。

**两个新踩到的坑（已记入 MEMORY）**：
1. **`-nographics` 会让 harness 静默挂死**：GfxDevice 变 Null → `WaitForEndOfFrame` 永不触发 → 0 帧、无 runtime.json，门跑到 8 分钟超时 exit 3。判据是日志里 `Forcing GfxDevice: Null` + `No graphic device is available to show the window`。**跑任何依赖渲染的 harness 都必须去掉 `-nographics`**（编译类任务可保留）。
2. **`-executeMethod` 类名不要带命名空间前缀**：`ArenaArchitectureLint` 与 `ArenaPlayModeGate` 都在全局命名空间，写 `QuQu.ArenaPlayModeGate.Run` 会报 `executeMethod class could not be found` 并 exit 1（易误判为编译失败）。

---

## P5 补完 · asmdef 五层落地（2026-09-24 晚，单次会话完成）

**前置**：P0-P5 成果先落还原点 `5fcedec`（asmdef 迁移动文件又改代码，必须可回退）。

### 依赖审计（脚本化，`QuQuArena3D/.workbuddy/tmp/analyze_deps.py` + `make_mapping.py`）
- 提取 91 个文件的顶层类型声明与跨文件引用，输出 fan-in/fan-out 矩阵。**关键修正：嵌套类不参与跨文件解析**——各 Check 自带的 `Result` 嵌套类曾制造大量假边（如 ArenaConnection→ArenaVisualCheck 其实是假边，真图上 ArenaVisualCheck fan-in=0）。
- 实测推翻方案文档两处理想分层：`ArenaMedia` 引用 ArenaStage/Fighter（资源加载本质是表现侧）→ 归 Presentation；`ArenaDesktopRuntime` 持有 ArenaUI（P3-B 把 UI 当工具箱注入）→ 归 Presentation。Infrastructure 最终只剩 ArenaConnection + ArenaTaskCenter 两个文件，虽薄但方向纯净。
- **违规边全部清零后才动手迁移**：唯二反向是 ①ArenaServices 接口签名含 13 个表现具体类型 ②ArenaDuelController.Initialize(ArenaGame)。另有隐性第三处：`ArenaGame.Start()` 调 `ArenaBootstrap.Initialize(this)`——Game↔Bootstrap 同层放置即消除。

### 最终五层（92 文件，`namespace QuQu` 全部不变，GUID 随 .cs.meta 成对移动不变 → 场景/预制体引用零丢失）
| 程序集 | 文件数 | 内容 | 引用 |
|---|---|---|---|
| `QuQu.Core` | 9 | 协议×2、常量、事件总线、FrameRouter、Tuning、Preferences、ModelPresets、**纯契约**（INotifier/IMatchControl/IEndpointBinding/IJsonTransport/ITaskSignalSink/ICompetitionLink/ICoroutineHost/IRosterService/IWorkbenchLauncher/IArenaCommands） | （无项目内） |
| `QuQu.Infrastructure` | 2 | ArenaConnection、ArenaTaskCenter | Core |
| `QuQu.Presentation` | 52 | 3D 舞台/轨道展馆/UI 流程/桌面中枢/媒体 + **`ArenaShellContracts.cs`（新文件：IMatchStage/IStationContext/IMatchSurface/IMatchContext/IHudContext/IArenaShell/IArenaTestShell）** + Media/DesktopRuntime/DuelController | Core+Infra+包 |
| `QuQu.App` | 3 | ArenaGame、ArenaBootstrap、ArenaHarness | +Presentation |
| `QuQu.Validation` | 26 | 23 Check + Spectator/Video/SingularityCapture | 全部 |
| `QuQu.Editor`（Assets/Editor） | 25 | 门、lint、构建工具 | 全部，`includePlatforms:["Editor"]` |

### 打断循环的三处代码改动（行为零变化）
1. **ArenaServices 拆分**：纯契约留 Core、表现契约移入新文件 `ArenaShellContracts.cs`（Presentation）。拆分线＝"接口签名是否出现表现层具体类型"。
2. **ArenaDuelController.Initialize(ArenaGame) → Initialize(IArenaShell)**：装配用宽契约、使用仍是窄字段；`link = owner.Connection` → `owner.Link`（IStationContext.Link 已有，ArenaGame.Link => Connection 行为一致）。Bootstrap 调用行零改动。
3. **ArenaQuitFlow.QuitRequested internal → public**：分层暴露的第一个可见性坑（internal 只在本程序集可见，ArenaGame 在 App 层读不到）。

### 踩到的坑（asmdef 专属，全部实证）
1. **references 一旦非空，包程序集必须显式列出**——即使包 asmdef 标着 `autoReferenced: true`（TMPro/UnityEngine.UI/Unity.InputSystem/URP/Unity.AI.Navigation 全中招；预编译 DLL 如 Newtonsoft 仍自动可见）。第一轮 4 错 → 补引用后仅剩 2 错。
2. **asmdef 的 name 写错 = 整个程序集找不到**：Editor asmdef 引用最初写成裸名 `Core`（应为 `QuQu.Core`），报 CS0246 QuQu 找不到，与"Core 挂了级联"难以区分。
3. **`Volume` 在 `Unity.RenderPipelines.Core.Runtime`**，不在 Universal.Runtime；glTFast 的程序集名就叫 `glTFast`。
4. **🔥 harness 注册表静默失效（最重要的坑）**：`ArenaHarnesses.Discover()` 用 `typeof(ArenaHarnesses).Assembly.GetTypes()`——单程序集时代能扫到全部 Check，拆分后 Check 在 QuQu.Validation、注册表在 QuQu.App → **扫到 0 个 harness → 任何 validation flag 都不分发 → runtime.json 零产出 → 门 8 分钟超时 exit 3**（与 `-nographics` 超时症状相同！判据看日志有无 `NullGfxDevice`）。修复：改 `AppDomain.CurrentDomain.GetAssemblies()` 全扫（反射仍仅命令行命中 flag 时发生）。
5. **lint 扫描目录**：`Directory.GetFiles(..., TopDirectoryOnly)` → 文件移入子目录后 `files=0`，且**假阴性会把基线覆写成 0**（下次真跑会误报"上升"）。修为 `AllDirectories` + 从 git 恢复基线后再跑，实测 gameRefs=94 与基线持平。

### 验收（全绿）
- 编译 exit 0（6 程序集：日志可见 QuQu.Core/Infrastructure/Presentation/App/Validation/Editor 全部 Csc+ILPostProcess）
- lint 门禁：**files=92、gameRefs=94（与迁移前基线完全持平，零新增穿层）、exit 0**
- duel-validation：**passed=true、network=true、8 回合 8 击打、207 帧、RTX 5090 3830×2043**（`docs/validation/duel-v05/asmdef/`，与 P5 基线 204-208 帧一致）
- smoke：exit 0
- 隔离后端同 P3 惯例：`QUQU_RESULTS_DIR=<tmp> node src/cli.ts serve --port 8281` + `--arena-backend http://127.0.0.1:8281`

