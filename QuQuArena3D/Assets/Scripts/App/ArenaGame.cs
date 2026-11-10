using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    /** 门面：比赛公共状态 + 跨系统便捷入口 + 场景输入路由。
     *  P1-P2 解耦后的职责边界：组合根在 ArenaBootstrap、帧分发在 ArenaFrameRouter、
     *  演出订阅在 ArenaMatchPresenter、主菜单在 ArenaHomeScreen、设置在 ArenaSettingsScreens、
     *  退出在 ArenaQuitFlow、离线演示与冒烟在 ArenaOfflineDemo。
     *  冻结规则：本类不再新增业务逻辑；对门面穿层引用的新增需过架构 lint（QuQu/Architecture Lint）。 */
    public class ArenaGame : MonoBehaviour, INotifier, IMatchControl, IMatchStage, IRosterService, IArenaCommands, IStationContext, IHudContext, IMatchContext, IArenaShell, IArenaTestShell
    {
        // P3：这几个同时是 IStationContext 的成员，接口要求属性 → 字段改属性（调用点源码兼容）
        public ArenaStage Stage { get; set; }
        public ArenaUI UI { get; set; }
        public ArenaConnection Connection;
        public ArenaMedia Media { get; set; }
        ArenaPreferences preferences;
        /** P4：偏好实例可被整体替换（设置屏导入预设），setter 负责迁移 Changed 订阅，避免丢事件。 */
        public ArenaPreferences Preferences
        {
            get => preferences;
            set
            {
                if (preferences != null) preferences.Changed -= ApplyPreferences;
                preferences = value;
                if (preferences != null) preferences.Changed += ApplyPreferences;
            }
        }
        public string ReportPath { get; set; }
        public string Selected { get; set; }
        public bool ShowReasoning;
        public int PlannedQuestions { get; set; } // P3-D：IMatchSurface 要求是属性
        public int AcceptedFrames { get; set; } // P3：递增统一走 CountAcceptedFrame()；保留 setter 仅为 Check 归零用例（ArenaProductionCheck）
        bool finished;
        public bool Finished { get => finished; set => SetFinished(value); }
        public event Action<bool> FinishedChanged;
        /** P3 比赛状态唯一写入口（IMatchControl）：幂等，变更时广播 FinishedChanged。 */
        public void SetFinished(bool value) { if (finished == value) return; finished = value; FinishedChanged?.Invoke(value); }
        public void CountAcceptedFrame() { AcceptedFrames++; }
        public ArenaSpectator Spectator { get; set; }
        public ArenaDuelHUD Hud { get; set; }
        public ArenaReadingDrawer Reader { get; set; }
        public ArenaCommentaryDrawer Commentary { get; set; }
        public ArenaDuelController Duel { get; set; }
        public ArenaDesktopRuntime Desktop { get; set; }
        public ArenaDesktopHub Hub { get; set; }
        public ArenaTaskCenter Tasks { get; set; }
        public ArenaOrbitalNetwork Stations { get; set; }
        public bool IsSpectating => Spectator && Spectator.gameObject.activeSelf;
        internal MatchEventBus MatchBus;
        internal ArenaFrameRouter MatchRouter;
        ArenaQuitFlow quit; // 字段初始化器里不能用 this（CS0027），改为 Awake 构造（Awake 先于 OnEnable，时序安全）
        void Awake() { quit = new ArenaQuitFlow(this); }
        int windowWidth, windowHeight;
        bool spectatorWasFullscreen;
        internal readonly HashSet<string> strikes = new HashSet<string>();
        float saveAt = -1;
        internal bool validationMode;
        public bool ValidationMode => validationMode; // IArenaShell
        int escapeFrame = -1;
        internal Coroutine offline;
        internal bool appearancesDirty;
        bool appliedMirror;
        /** P4：形象/镜像面板的改动待应用标记。Update 只在 pending 时跑 TryApplyAppearances，
         *  不再每帧做整套检查（原实现每帧都跑 AvatarModePending + Any(Busy)）。 */
        bool appearancesPending;
        public TMP_Text AvatarModeStatus { get; set; } // IArenaShell（原 internal 字段 avatarModeStatus）
        public bool AvatarModePending => ArenaAvatarMode.Chibi != (Preferences.avatarMode == ArenaAvatarModes.Chibi) || appearancesDirty;
        public static readonly string[] DemoIds = ArenaOfflineDemo.DemoIds;
        public static readonly string[] DemoNames = ArenaOfflineDemo.DemoNames;

        InputActionMap hotkeys;
        void OnEnable() { Application.wantsToQuit += quit.PrepareQuit; BindHotkeys(); }
        void OnDisable() { Application.wantsToQuit -= quit.PrepareQuit; hotkeys?.Disable(); }

        /** P4-3：热键改 InputSystem 回调，取代 Update 里每帧 `wasPressedThisFrame` 轮询。
         *  ⚠️ 自动化 harness 不覆盖热键（无键盘设备），改动后需人工确认 F11/F10/F8/R/H/Esc。 */
        void BindHotkeys()
        {
            hotkeys = new InputActionMap("Arena hotkeys");
            Bind("fullscreen", "<Keyboard>/f11", () => SetFullscreen(!Screen.fullScreen));
            Bind("spectator", "<Keyboard>/f10", () => ToggleSpectator());
            Bind("freeCamera", "<Keyboard>/f8", () => { if (!CameraBlocked()) ToggleFreeCamera(); });
            Bind("resetCamera", "<Keyboard>/r", () => { if (!CameraBlocked()) Stage.ResetCamera(); });
            Bind("toggleHud", "<Keyboard>/h", () => { if (!CameraBlocked()) ToggleCameraHud(); });
            Bind("escape", "<Keyboard>/escape", () => KeyboardEscape()); // 与 OnGUI 的 Esc 路径共存，靠 escapeFrame 同帧去重
            hotkeys.Enable();
        }
        void Bind(string name, string path, Action run)
        {
            var action = hotkeys.AddAction(name, binding: path);
            // Stage 等子系统由组合根在 Start 里建好；入场第一帧之前按下的键直接忽略，避免空引用。
            action.performed += _ => { if (Stage) run(); };
        }
        bool CameraBlocked() => Stage && Stage.CameraInputBlocked?.Invoke() == true;
        void Start() { ArenaBootstrap.Initialize(this); UI.ClickSound = Media.Click; ArenaRoutes.Bind(UI.Nav, this); }

        /** 协议帧唯一入口：翻译为类型化事件后由各订阅者消化（P1）。 */
        public void Accept(Frame f) { MatchRouter.Dispatch(f); }

        public void SetRoster(ModelInfo[] roster)
        {
            foreach (var old in Stage.Fighters) Media.ReleaseAvatar(old, true);
            Stage.SetRoster(roster, Preferences); UI.SetRoster(Stage.Fighters); Selected = roster.FirstOrDefault()?.id;
            appliedMirror = Preferences.mirrorPanels;
            foreach (var f in Stage.Fighters) RestoreAvatar(f);
        }
        async void RestoreAvatar(ArenaFighter f)
        {
            if (ArenaAvatarMode.Chibi) { Stage.Refit(); return; }
            if (!string.IsNullOrEmpty(f.Look.modelPath)) await Media.LoadAvatar(f, f.Look.modelPath, Notify);
            else if (!string.IsNullOrEmpty(f.Look.facePath)) Try(() => ArenaMedia.Face(f, f.Look.facePath));
            Stage.Refit();
        }
        public void RefreshUI() { UI.Refresh(Stage.Fighters, Selected, ShowReasoning); } // P3-D：IMatchSurface 要求 public
        public void ClearStrikes() { strikes.Clear(); }
        public void Celebrate() => Media.Celebrate();
        public void Run(IEnumerator routine) => StartCoroutine(routine); // ICoroutineHost
        public ICompetitionLink Link => Connection;
        public void SelectFighter(string id) { Selected = id; RefreshUI(); if (Stage.Focused) FocusSelected(); }
        public void FocusSelected() { Stage.Focus(Stage.Fighters.FirstOrDefault(f => f.State.Id == Selected)); }
        public void ToggleFreeCamera() { Stage.ToggleFlight(); if (Stage.Flight.Active) Notify("自由镜头 · 右键转向 · WASD / Q E 移动 · R 回到全场"); }
        public void ToggleCameraHud() { if (Stage.Flight.Active) Hud.gameObject.SetActive(!Hud.gameObject.activeSelf); }

        // —— P3 IMatchStage：赛台能力切片，委派给 ArenaStage（在途文件，不改动其源码）——
        public List<ArenaFighter> Fighters => Stage.Fighters;
        public float Motion => Stage.Motion;
        public bool FlightActive => Stage.Flight.Active;
        public bool CameraDirected => Stage.CameraDirected;
        public bool HasEntrance => Stage.Lifts; // UnityEngine.Object 隐式 bool：销毁即为 false
        public void EndCombat() => Stage.EndCombat();
        public void ResetCamera() => Stage.ResetCamera();
        public void SetJudge(ModelInfo model) => Stage.Venue.SetJudge(model);
        public void CancelEntrance() => Stage.Lifts?.Cancel();
        public IEnumerator PresentEntrance() => Stage.Lifts != null ? Stage.Lifts.Present(this) : null;
        public IEnumerator PresentRound(CompetitionRound round, Action applied, Action<CompetitionAttack> contact = null) => Stage.PresentRound(round, applied, contact);
        public void CelebrateWinner(ArenaFighter fighter) => Stage.Celebrate(fighter);

        // —— P3 IArenaCommands / IStationContext：门面转发，一行一个，不新增业务逻辑 ——
        public void ShowBracket() => Duel.ShowBracket();
        public void Control(string action) => Connection.Control(action);
        public void RequestEscape() => KeyboardEscape();
        public bool CameraOrbit { get => Stage.Orbit; set => Stage.Orbit = value; }
        public void Agents() => Hub.Agents();
        public void Banks() => Hub.Banks();
        public void Advanced() => Hub.Advanced();
        void IWorkbenchLauncher.Workbench() => Hub.Workbench(); // 显式实现：避开与门面 Workbench 属性的同名冲突
        void IWorkbenchLauncher.TaskCenter() => Hub.TaskCenter();
        public void History(bool legacy = false, int offset = 0, string query = "") => Hub.History(legacy, offset, query);
        public void Models(Action back = null, bool refresh = false) => Hub.Models(back, refresh);
        public IJsonTransport Transport => Connection;
        public IWorkbenchLauncher Workbench => Hub;
        public void SetFullscreen(bool value)
        {
            if (value)
            {
                if (!Screen.fullScreen) { windowWidth = Screen.width; windowHeight = Screen.height; }
                var native = Screen.currentResolution;
                Screen.SetResolution(native.width, native.height, FullScreenMode.FullScreenWindow);
            }
            else Screen.SetResolution(windowWidth > 0 ? windowWidth : 1600, windowHeight > 0 ? windowHeight : 900, FullScreenMode.Windowed);
        }
        public void ToggleSpectator()
        {
            bool enter = !IsSpectating;
            UI.CloseModal(); Hud.CloseMenu();
            if (enter) { spectatorWasFullscreen = Screen.fullScreen; SetFullscreen(true); }
            else SetFullscreen(spectatorWasFullscreen);
            UI.Root.gameObject.SetActive(true); Spectator.gameObject.SetActive(enter); Stage.SetSpectating(enter);
            if (!enter) UI.Apply(Preferences);
        }
        public void Notify(string text) { if (UI) { UI.Status.text = text ?? ""; UI.Footer.text = text ?? ""; UI.ShowNotice(text ?? ""); if (Hud) Hud.ShowNotice(text ?? ""); } }
        public void ToggleReasoning() { ShowReasoning = !ShowReasoning; RefreshUI(); }
        public void OpenWeb(string path) { Application.OpenURL(Connection.BaseUrl + (path.StartsWith("/") ? path : "/results")); }
        public void ApplyPreferences()
        {
            Preferences.Validate(); Stage.SetOverviewPitch(Preferences.spectator.pitch); Stage.Motion = Preferences.motion; Media.Apply(Preferences); UI.Apply(Preferences); if (Reader) Reader.Resize(); saveAt = Time.unscaledTime + ArenaTuning.SaveDebounceSeconds;
            if (Stage.Singularity) Stage.Singularity.gameObject.SetActive(Preferences.blackHoleEnabled);
            Shader.SetGlobalFloat("_ArenaStarBrightness", Preferences.starBrightness);
            appearancesPending = true; // P4：标记待应用，Update 里重试（演出忙时不能立刻换形象）
            TryApplyAppearances();
        }
        public void TryApplyAppearances()
        {
            if (!AvatarModePending && appliedMirror == Preferences.mirrorPanels) { appearancesPending = false; return; }
            if (Duel && Duel.Presenting || Stage.Fighters.Any(f => f.Busy)) return; // 保持 pending，等演出空闲
            bool changedMode = ArenaAvatarMode.Chibi != (Preferences.avatarMode == ArenaAvatarModes.Chibi);
            if (AvatarModePending)
            {
                ArenaAvatarMode.Set(Preferences.avatarMode);
                // Invalidate asynchronous imported assets before replacing any visual.
                foreach (var f in UnityEngine.Object.FindObjectsByType<ArenaFighter>(FindObjectsInactive.Include, FindObjectsSortMode.None))
                { Media.ReleaseAvatar(f); f.ApplyLook(f.Look); RestoreAvatar(f); }
                if (changedMode && Stations) Stations.Gallery.RefreshAvatars();
                appearancesDirty = false;
                StartCoroutine(ReleaseUnusedAvatars());
            }
            Stage.PlaceDuelFighters(Preferences.mirrorPanels); Stage.Refit();
            appliedMirror = Preferences.mirrorPanels;
            appearancesPending = false;
        }
        IEnumerator ReleaseUnusedAvatars()
        {
            yield return null; // Destroy old instances before releasing their model/texture assets.
            yield return Resources.UnloadUnusedAssets();
        }
        void Update()
        {
            if (appearancesPending) TryApplyAppearances(); // P4：事件驱动，取代每帧轮询
            if (AvatarModeStatus) AvatarModeStatus.text = AvatarModePending ? "等待本次攻击与结算演出结束后切换…" : ArenaAvatarMode.Chibi ? "圆润 Q 版已启用 · 原有角色配置已保留" : "标准角色已启用";
            if (saveAt > 0 && Time.unscaledTime >= saveAt) { saveAt = -1; if (!validationMode) Try(Preferences.Save); }
            if (!Stage.Flight.Active && !Stage.CameraDirected && !Hud.gameObject.activeSelf) Hud.gameObject.SetActive(true);
        }
        public void Try(Action action) { try { action(); } catch (Exception e) { Notify(e.Message); } } // IArenaShell
        public bool StopOffline() { if (offline == null) return false; StopCoroutine(offline); offline = null; return true; } // IArenaShell
        public void StartOffline(IEnumerator routine) { StopOffline(); offline = StartCoroutine(routine); } // IArenaShell
        public new T AddComponent<T>() where T : Component => gameObject.AddComponent<T>(); // IArenaShell
        public void MarkAppearancesDirty() { appearancesDirty = true; appearancesPending = true; } // IArenaShell
        void OnGUI()
        {
            if (Event.current.type == EventType.KeyDown && Event.current.keyCode == KeyCode.Escape)
            { KeyboardEscape(); Event.current.Use(); }
        }
        public void KeyboardEscape()
        {
            if (!UI || quit.QuitRequested || escapeFrame == Time.frameCount) return;
            escapeFrame = Time.frameCount; Escape();
        }
        /** Esc = 收起最后打开的那样东西（P3 统一回退链）。决策表自上而下命中即止：
         *  ① 瞬态演出（接驳/入场）→ 跳过（Esc 在这里是"跳过"不是"返回"）；② 确认框 → 取消（永远最上层）；
         *  ③ 面层争夺：抽屉与界面层按打开序比较，最后打开的先收；④ 界面层的子状态先退（玻璃观赛 → 解说席），
         *  再走层回退；⑤ 兜底 → HUD 菜单开关。
         *  ⚠️ 与旧口径仅两处行为差异（均为对齐本规则的修复）：
         *  A. 解说抽屉上叠设置对话框时，旧链先关被压住的抽屉、Esc"看起来没反应"，现在先回退对话框；
         *  B. 解说/答卷抽屉共存时按打开序收（旧链固定先解说）。 */
        public void Escape()
        {
            if (Stations.Moving) { Stations.Skip(); return; } // ①
            if (Stage.Lifts && Stage.Lifts.Active) { Stage.Lifts.Skip(); return; }
            if (UI.ConfirmationOpen) { UI.Back(); return; } // ②
            int modalAt = UI.Modal ? UI.ModalOpenedAt : -1; // ③
            int commentaryAt = Commentary.IsOpen ? Commentary.OpenedAt : -1;
            int readerAt = Reader.IsOpen ? Reader.OpenedAt : -1;
            if (commentaryAt >= 0 && commentaryAt >= modalAt && commentaryAt >= readerAt) { Commentary.Close(); return; }
            if (readerAt >= 0 && readerAt >= modalAt) { Reader.Close(); return; }
            if (UI.Modal) // ④
            {
                if (Stations.Current == ArenaOrbitalNetwork.Place.Commentary && Stations.GlassView) { Stations.SetCommentaryView(false); Stations.ShowPanel(); return; }
                UI.Back(); return;
            }
            Hud.ToggleMenu(); // ⑤
        }
        public void ShowLobby() { Duel.ShowLobby(); }
        void ShowReplays() { Duel.ShowHistory(); }

        // —— P2 拆分后的兼容入口：签名不变，既有调用点（含 20 个 Check harness）零改动 ——
        public void ShowHome() => ArenaHomeScreen.Show(this);
        public void ShowSettings(int tab) => ArenaSettingsScreens.Show(this, tab);
        public void ApplyModelPreset(ArenaFighter fighter, string id) => ArenaSettingsScreens.ApplyModelPreset(this, fighter, id);
        public void ShowModelPresets(ArenaFighter fighter) => ArenaSettingsScreens.ModelPresets(this, fighter);
        public void SetBackground(string path) => ArenaSettingsScreens.SetBackground(this, path);
        public void Demo() => ArenaOfflineDemo.Demo(this);
        public void OfflineExperience() => ArenaOfflineDemo.OfflineExperience(this);
    }
}
