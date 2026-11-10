using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    public class ArenaGame : MonoBehaviour
    {
        public ArenaStage Stage;
        public ArenaUI UI;
        public ArenaConnection Connection;
        public ArenaMedia Media;
        public ArenaPreferences Preferences;
        public string ReportPath;
        public string Selected;
        public bool ShowReasoning;
        public int PlannedQuestions, AcceptedFrames;
        public bool Finished;
        public ArenaSpectator Spectator;
        public ArenaDuelHUD Hud;
        public ArenaReadingDrawer Reader;
        public ArenaDuelController Duel;
        public bool IsSpectating => Spectator && Spectator.gameObject.activeSelf;
        int windowWidth, windowHeight;
        bool spectatorWasFullscreen;
        readonly HashSet<string> strikes = new HashSet<string>();
        float saveAt = -1;
        bool validationMode, quitRequested, readyToQuit;
        int avatarIndex;
        public static readonly string[] DemoIds = { "mock:xueba-o9", "mock:huatou-72b", "mock:jianglv-7b", "mock:laoshi-k2" };
        public static readonly string[] DemoNames = { "学霸-o9", "滑头-72b", "犟驴-7b", "老实-k2" };

        void OnEnable() { Application.wantsToQuit += PrepareQuit; }
        void OnDisable() { Application.wantsToQuit -= PrepareQuit; }
        bool PrepareQuit()
        {
            if(readyToQuit || !Screen.fullScreen)return true;
            if(!quitRequested){quitRequested=true;StartCoroutine(LeaveFullscreenAndQuit());}
            return false;
        }
        IEnumerator LeaveFullscreenAndQuit()
        {
            // Let Windows finish the display transition before Unity destroys its native window.
            Debug.Log("QuQu: restoring window before fullscreen exit");
            SetFullscreen(false);yield return new WaitForSecondsRealtime(.5f);
            readyToQuit=true;Application.Quit();
        }
        void Start()
        {
            var args = Environment.GetCommandLineArgs();
            validationMode = args.Contains("--arena-spectator-validation") || args.Contains("--arena-duel-validation") || args.Contains("--arena-divine-validation") || args.Contains("--arena-preset-validation") || args.Contains("--arena-art-validation") || args.Contains("--arena-visual-validation") || args.Contains("--arena-performance-validation");
#if UNITY_EDITOR
            validationMode |= UnityEditor.SessionState.GetBool("QuQu.VisualValidation", false);
#endif
            Preferences = validationMode ? new ArenaPreferences() : ArenaPreferences.Load();
            Stage = new GameObject("3D arena").AddComponent<ArenaStage>(); Stage.Create();
            Connection = gameObject.AddComponent<ArenaConnection>(); Connection.SetEndpoint(Preferences.endpoint);
            Media = gameObject.AddComponent<ArenaMedia>(); Media.Initialize();
            Stage.OnImpact = blocked => Media.Hit(blocked);
            UI = new GameObject("Arena HUD", typeof(RectTransform)).AddComponent<ArenaUI>(); UI.Create(this);
            Duel = gameObject.AddComponent<ArenaDuelController>(); Duel.Initialize(this);
            Hud = new GameObject("Spectator HUD", typeof(RectTransform)).AddComponent<ArenaDuelHUD>(); Hud.Create(this, UI.Root, false);
            Reader = new GameObject("Answer reader", typeof(RectTransform)).AddComponent<ArenaReadingDrawer>(); Reader.Create(this);
            UI.Left.gameObject.SetActive(false); UI.Right.gameObject.SetActive(false); UI.Rules.gameObject.SetActive(false); UI.Status.gameObject.SetActive(false);
            Spectator = new GameObject("Large screen HUD", typeof(RectTransform)).AddComponent<ArenaSpectator>(); Spectator.Create(this);
            Connection.OnFrame = Accept; Connection.OnStatus = Notify; UI.SelectFighter = SelectFighter;
            var preview = DemoIds.Take(2).Select((id, i) => new ModelInfo { id = id, name = DemoNames[i] }).ToArray();
            SetRoster(preview); ApplyPreferences(); Media.LoadMusic(Preferences.musicPath, null);
            if (!string.IsNullOrEmpty(Preferences.backgroundPath)) SetBackground(Preferences.backgroundPath);
            var endpoint = Array.IndexOf(args, "--arena-backend"); if (endpoint >= 0 && endpoint + 1 < args.Length) Connection.SetEndpoint(args[endpoint + 1]);
            if (args.Contains("--arena-spectator-validation")) StartCoroutine(ArenaSpectatorCheck.Run(this));
            else if (args.Contains("--arena-duel-validation")) StartCoroutine(ArenaDuelCheck.Run(this));
            else if (args.Contains("--arena-divine-validation")) StartCoroutine(ArenaDivineCheck.Run(this));
            else if (args.Contains("--arena-performance-validation")) StartCoroutine(ArenaPerformanceCheck.Run(this));
            else if (args.Contains("--arena-visual-validation")) StartCoroutine(ArenaVisualCheck.Run(this));
            else if (args.Contains("--arena-art-validation")) StartCoroutine(ArenaProductionCheck.Run(this));
            else if (args.Contains("--arena-preset-validation")) StartCoroutine(ArenaModelPresetCheck.Run(this));
            else if (args.Contains("--arena-smoke")) StartCoroutine(Smoke());
            else ShowHome();
        }
        public void SetRoster(ModelInfo[] roster)
        {
            foreach (var old in Stage.Fighters) Media.ReleaseAvatar(old,true);
            Stage.SetRoster(roster, Preferences); UI.SetRoster(Stage.Fighters); Selected = roster.FirstOrDefault()?.id;
            foreach (var f in Stage.Fighters) RestoreAvatar(f);
        }
        async void RestoreAvatar(ArenaFighter f)
        {
            if (!string.IsNullOrEmpty(f.Look.modelPath)) await Media.LoadAvatar(f, f.Look.modelPath, Notify);
            else if (!string.IsNullOrEmpty(f.Look.facePath)) Try(() => ArenaMedia.Face(f, f.Look.facePath));
            Stage.Refit();
        }
        public void Accept(Frame f)
        {
            AcceptedFrames++;
            switch (f.type)
            {
                case "start":
                    Finished = false; strikes.Clear(); ReportPath = null;
                    SetRoster(f.roster ?? Array.Empty<ModelInfo>());
                    PlannedQuestions = f.roster?.Length > 0 ? Mathf.CeilToInt((float)f.total / f.roster.Length) : 0;
                    UI.Round.text = (f.replay ? "REPLAY / " : "LIVE / ") + f.title;
                    UI.Rules.text = f.roster != null && f.roster.Any(m => m.id.StartsWith("mock:")) ? "离线模拟场 · 用于体验，不能作为真实模型评测" : f.scoring?.summary ?? "实时答题 · 真实评分";
                    Notify(f.replay ? "正在回放历史比赛" : "比赛开始"); break;
                case "round": UI.SetQuestion(f.prompt); UI.Round.text = "QUESTION " + (f.index + 1) + " / " + (PlannedQuestions > 0 ? PlannedQuestions : f.total) + " · " + f.taskId; break;
                case "stage": UI.SetQuestion(f.prompt); UI.Round.text = f.taskId + " · " + f.title; break;
                case "model":
                    var fighter = Stage.Fighters.FirstOrDefault(x => x.State.Id == f.modelId);
                    if (fighter == null || !fighter.State.Accept(f, PlannedQuestions)) break;
                    break;
                case "withdrawal":
                    var withdrawn = Stage.Fighters.FirstOrDefault(x => x.State.Id == f.withdrawal?.modelId);
                    if (withdrawn != null) { withdrawn.State.Status = "withdrawn"; withdrawn.State.Note = f.withdrawal.message; } break;
                case "control": Notify(f.state == "paused" ? "已暂停，等待继续" : f.state == "pausing" ? "本题结束后暂停" : f.state == "stopped" ? "已请求停止" : "比赛继续"); break;
                case "milestone": Notify(f.text); break;
                case "commentary": if (f.entry?.status == "done") Notify(f.entry.text); break;
                case "done":
                    Finished = true; ReportPath = f.reportFile; Stage.EndCombat();
                    Notify(f.settlement?.reason ?? (f.stopped ? "比赛已中止，不判胜者" : "比赛结束，请查看完整战报"));
                    if (f.settlement != null)
                    {
                        UI.Rules.text = "结算：" + f.settlement.outcome + " · " + (f.settlement.warnings?.FirstOrDefault() ?? "");
                        if (f.settlement.leaderIds?.Length > 0)
                        {
                            Selected = f.settlement.leaderIds[0];
                            var leaders = Stage.Fighters.Where(x => f.settlement.leaderIds.Contains(x.State.Id)).ToArray();
                            foreach (var leader in leaders) leader.Celebrating = true;
                            foreach (var other in Stage.Fighters.Except(leaders)) other.Defeated = true;
                            Media.Celebrate();
                            Notify((f.settlement.outcome == "tie" ? "并列第一：" : "本场胜者：") + string.Join("、", leaders.Select(x => x.State.Name)));
                            UI.Footer.text = f.settlement.reason;
                        }
                    }
                    break;
                case "error": Finished = true; Stage.EndCombat(); Notify(f.message ?? f.error); break;
            }
            RefreshUI();
        }
        void RefreshUI() { UI.Refresh(Stage.Fighters, Selected, ShowReasoning); }
        public void SelectFighter(string id) { Selected = id; RefreshUI(); if (Stage.Focused) FocusSelected(); }
        public void FocusSelected() { Stage.Focus(Stage.Fighters.FirstOrDefault(f => f.State.Id == Selected)); }
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
        public void Notify(string text) { if (UI) { UI.Status.text = text ?? ""; UI.Footer.text = text ?? ""; UI.ShowNotice(text ?? ""); if(Hud) Hud.ShowNotice(text ?? ""); } }
        public void ToggleReasoning() { ShowReasoning = !ShowReasoning; RefreshUI(); }
        public void OpenWeb(string path) { Application.OpenURL(Connection.BaseUrl + (path.StartsWith("/") ? path : "/results")); }
        public void ApplyPreferences()
        {
            Preferences.Validate(); Stage.SetOverviewPitch(Preferences.spectator.pitch); Stage.Motion = Preferences.motion; Media.Apply(Preferences); UI.Apply(Preferences); if(Reader) Reader.Resize(); saveAt = Time.unscaledTime + .5f;
            if (Stage.Fighters.Count == 2) for (int i=0;i<2;i++) Stage.Fighters[i].SetHome(new Vector3((i==0?-3.1f:3.1f)*(Preferences.mirrorPanels?-1:1),.09f,0));
        }
        void Update()
        {
            if (saveAt > 0 && Time.unscaledTime >= saveAt) { saveAt = -1; if (!validationMode) Try(Preferences.Save); }
            if (Keyboard.current?.f11Key.wasPressedThisFrame == true) SetFullscreen(!Screen.fullScreen);
            if (Keyboard.current?.f10Key.wasPressedThisFrame == true) ToggleSpectator();
            if (Keyboard.current?.escapeKey.wasPressedThisFrame == true && UI) { if (Reader.IsOpen) Reader.Close(); else if(Hud.MenuOpen) Hud.CloseMenu(); else if (UI.Modal) UI.CloseModal(); else if(Stage.Focused) Stage.RestoreOverview(); else if (IsSpectating) ToggleSpectator(); }
        }
        void Try(Action action) { try { action(); } catch (Exception e) { Notify(e.Message); } }
        public void Demo()
        {
            Finished = false; UI.CloseModal(); Notify("离线模拟场：使用内置模拟模型，不调用付费模型");
            Connection.Launch(new Launch { arena = "tongjia-pinyin", models = DemoIds.Take(2).ToArray(), limit = 10, demo = true });
        }
        public void ShowHome()
        {
            if (IsSpectating) ToggleSpectator();
            UI.CloseModal();
            var overlay = UI.Box(UI.transform, "Home", 0, 0, 1600, 900, Color.black); UI.Modal = overlay;
            overlay.anchorMin = Vector2.zero; overlay.anchorMax = Vector2.one; overlay.offsetMin = overlay.offsetMax = Vector2.zero;
            overlay.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            var art = UI.Box(overlay, "Arena illustration", 0, 0, 1600, 900).gameObject.AddComponent<UnityEngine.UI.RawImage>();
            art.texture = Resources.Load<Texture2D>("Art/ArenaKeyArt"); art.color = new Color(.73f,.79f,.82f); art.raycastTarget = false;
            var fit = art.gameObject.AddComponent<UnityEngine.UI.AspectRatioFitter>(); fit.aspectRatio = 16f / 9; fit.aspectMode = UnityEngine.UI.AspectRatioFitter.AspectMode.EnvelopeParent;
            var page = UI.Box(overlay, "Menu content", 0, 0, 1600, 900);
            page.anchorMin = page.anchorMax = new Vector2(.5f,.5f); page.anchoredPosition = new Vector2(-800,450);
            UI.Box(page, "Menu shade", 0, 0, 646, 900, new Color(.014f,.031f,.047f,.93f));
            UI.Box(page, "Jade rule", 70, 104, 52, 4, UI.Accent);
            UI.Label(page, "QUQU / THE THINKING ARENA", 70, 131, 490, 35, 20, UI.Accent);
            UI.Label(page, "电子蛐蛐", 64, 195, 540, 106, 76);
            UI.Label(page, "看大模型动脑。\n看小人动手。", 70, 316, 500, 102, 34);
            UI.Label(page, "把一道题变成一场较量。\n选择模型、定制选手，坐下来观战。", 70, 436, 500, 75, 21, new Color(.65f,.73f,.78f));
            UI.Button(page, "进入赛场   →", 70, 549, 450, ShowLobby, true);
            UI.Button(page, "离线模拟体验", 70, 608, 450, Demo);
            UI.Button(page, "形象 / 音乐 / 界面", 70, 667, 450, () => ShowSettings(0));
            UI.Button(page, "回到 3D 赛场", 70, 726, 216, UI.CloseModal);
            UI.Button(page, "退出游戏", 302, 726, 218, () => Application.Quit());
            var connection = UI.Label(page, "正在连接比赛后端…", 70, 805, 490, 35, 16, new Color(.65f,.73f,.78f));
            UI.Label(page, "真实比赛 · 自由定制 · 全程可观战", 738, 825, 810, 35, 22);
            StartCoroutine(Connection.Request<Catalog>("/api/game/catalog", null, catalog =>
            {
                if (!page) return;
                connection.text = "后端已连接  /  " + (catalog.arenas?.Length ?? 0) + " 个题库";
                var recent = catalog.competitions?.FirstOrDefault(c => c.status == "running" || c.status == "paused" || c.status == "waiting");
                if (recent != null) UI.Button(page, "观看 / 继续最近赛事 →", 1030, 754, 450, () => { UI.CloseModal(); Connection.WatchCompetition(recent.id); }, true);
            }, error => { if (page) connection.text = "后端未连接，请在进入赛场后检查地址。"; }));
        }
        public void ShowLobby() { Duel.ShowLobby(); }
        void ShowReplays() { Duel.ShowHistory(); }
        public void ShowSettings(int tab)
        {
            if (IsSpectating) ToggleSpectator();
            var panel = UI.OpenModal("你的斗兽场 / CUSTOMIZE");
            UI.Button(panel, "形象", 28, 82, 180, () => ShowSettings(0), tab == 0);
            UI.Button(panel, "声音", 224, 82, 180, () => ShowSettings(1), tab == 1);
            UI.Button(panel, "界面", 420, 82, 180, () => ShowSettings(2), tab == 2);
            UI.Button(panel, "预设文件夹 ↗", 710, 82, 300, () => { Directory.CreateDirectory(ArenaPreferences.Folder); Application.OpenURL(new Uri(ArenaPreferences.Folder).AbsoluteUri); });
            if (tab == 0) AvatarSettings(panel);
            if (tab == 1) AudioSettings(panel);
            if (tab == 2) InterfaceSettings(panel);
            UI.Label(panel, "设置自动保存在本机 · 按模型 ID 记住形象，重新开赛仍然有效", 28, 624, 982, 32, 15);
        }
        void AvatarSettings(RectTransform panel)
        {
            if (Stage.Fighters.Count == 0) return; avatarIndex %= Stage.Fighters.Count; var f = Stage.Fighters[avatarIndex];
            UI.Label(panel, "当前模型：" + f.State.Name, 28, 158, 736, 40, 24);
            UI.Button(panel, "下一位 →", 820, 150, 190, () => { avatarIndex++; ShowSettings(0); });
            UI.Label(panel, "基础造型", 28, 217, 200, 30, 18);
            string[] styles = { "玉甲拳手", "圆滚滚", "电子蛐蛐" };
            for (int i = 0; i < styles.Length; i++) { int style = i; UI.Button(panel, styles[i], 170 + i * 173, 209, 160, () => { f.Look.style = style; f.Look.modelPath = f.Look.presetId = ""; RebuildAvatar(f); ShowSettings(0); }, f.Look.style == i && string.IsNullOrEmpty(f.Look.presetId) && string.IsNullOrEmpty(f.Look.modelPath)); }
            UI.Label(panel, "队伍配色", 28, 284, 200, 30, 18);
            for (int i = 0; i < ArenaPreferences.Colors.Length; i++) { string color = ArenaPreferences.Colors[i]; var b = UI.Button(panel, "", 170 + i * 65, 274, 50, () => { f.Look.color = color; RebuildAvatar(f); }); ColorUtility.TryParseHtmlString(color, out var tint); b.GetComponent<UnityEngine.UI.Image>().color = tint; }
            UI.Slider(panel, "形象大小", f.Look.scale, .65f, 1.45f, 28, 345, 640, v => { f.Look.scale = v; f.BodyRoot.localScale = Vector3.one * v; ApplyPreferences(); });
            var preview = UI.Box(panel,"Live avatar preview",710,209,300,360).gameObject.AddComponent<UnityEngine.UI.RawImage>();
            preview.gameObject.AddComponent<ArenaAvatarPreview>().Initialize(f,Stage.View);
            UI.Label(panel,(ArenaModelPresets.Find(f.Look.presetId)?.Name ?? "形象预览") + " · 拖动旋转",710,579,300,30,16);
            UI.Button(panel, "导入 GLB 3D 模型", 28, 433, 300, async () =>
            {
                var path = LocalFilePicker.Pick("选择贴图内嵌的 GLB（64 MB 以内）", "GLB 3D model\0*.glb\0\0"); if (path == null) return;
                try { var local = ArenaPreferences.ImportFile(path, new[] { ".glb" }, 64 * 1024 * 1024); if (await Media.LoadAvatar(f, local, Notify)) { f.Look.modelPath = local; f.Look.presetId = ""; UI.SetRoster(Stage.Fighters); Stage.Refit(); ApplyPreferences(); } } catch (Exception e) { Notify(e.Message); }
            });
            UI.Button(panel, "导入 PNG / JPG 头像", 352, 433, 316, () =>
            {
                var path = LocalFilePicker.Pick("选择头像图片", "Image\0*.png;*.jpg;*.jpeg\0\0"); if (path == null) return;
                Try(() => { var local = ArenaPreferences.ImportFile(path, new[] { ".png", ".jpg", ".jpeg" }, 16 * 1024 * 1024); f.Look.facePath = local; f.Look.modelPath = f.Look.presetId = ""; RebuildAvatar(f); });
            });
            UI.Button(panel, "恢复基础造型", 28, 490, 300, () => { f.Look.modelPath = f.Look.facePath = f.Look.presetId = ""; RebuildAvatar(f); ShowSettings(0); });
            UI.Button(panel, "模型角色预设 · 6 款", 352, 490, 316, () => ShowModelPresets(f));
            UI.Label(panel, "GLB 保留模型和贴图，统一到赛场尺寸，使用整体冲刺与受击。\n内置拳手带骨骼动作。自定义外观不影响评分。", 28, 548, 640, 64, 17);
        }
        void RebuildAvatar(ArenaFighter f) { Media.ReleaseAvatar(f); f.ApplyLook(f.Look); RestoreAvatar(f); UI.SetRoster(Stage.Fighters); ApplyPreferences(); }
        public void ApplyModelPreset(ArenaFighter fighter, string id)
        {
            var preset = ArenaModelPresets.Find(id);
            if (preset == null || !preset.Prefab) { Notify("这个角色尚未安装"); return; }
            fighter.Look.presetId = id; fighter.Look.modelPath = fighter.Look.facePath = "";
            RebuildAvatar(fighter);
        }
        public void ShowModelPresets(ArenaFighter fighter)
        {
            var panel = UI.OpenModal("模型角色 / CHARACTER PRESETS");
            UI.Label(panel, "为 " + fighter.State.Name + " 选择形象 · 任意模型均可使用", 28, 82, 982, 44, 20);
            for (int i = 0; i < ArenaModelPresets.All.Length; i++)
            {
                var preset = ArenaModelPresets.All[i]; bool selected = fighter.Look.presetId == preset.Id;
                var card = UI.Box(panel, "Preset " + preset.Id, 28 + i % 3 * 334, 142 + i / 3 * 232, 316, 218, new Color(.075f,.095f,.135f));
                var portrait = UI.Box(card, "Reference portrait", 10, 11, 110, 196).gameObject.AddComponent<UnityEngine.UI.RawImage>();
                portrait.texture = preset.Portrait; portrait.raycastTarget = false;
                UI.Label(card, preset.Name, 132, 18, 174, 40, 23);
                UI.Label(card, preset.Description, 132, 64, 174, 68, 17);
                UI.Button(card, selected ? "已使用 ✓" : "使用此形象", 132, 160, 174, () => { ApplyModelPreset(fighter,preset.Id); ShowSettings(0); }, selected);
            }
            UI.Label(panel, "参考形象由你提供 · 已配待机、出拳、受击、格挡、胜利与落败动作", 28, 618, 780, 34, 16);
            UI.Button(panel, "← 返回", 844, 615, 166, () => ShowSettings(0));
        }
        void AudioSettings(RectTransform panel)
        {
            UI.Label(panel, "赛场配乐", 28, 166, 900, 40, 24);
            UI.Slider(panel, "音乐音量", Preferences.musicVolume, 0, 1, 28, 237, 455, v => { Preferences.musicVolume = v; ApplyPreferences(); });
            UI.Slider(panel, "交手音效", Preferences.soundVolume, 0, 1, 548, 237, 455, v => { Preferences.soundVolume = v; ApplyPreferences(); });
            UI.Button(panel, "导入 MP3 / OGG / WAV", 28, 347, 455, () =>
            {
                var path = LocalFilePicker.Pick("选择赛场音乐", "Music\0*.mp3;*.ogg;*.wav\0\0"); if (path == null) return;
                Try(() => { var local = ArenaPreferences.ImportFile(path, new[] { ".mp3", ".ogg", ".wav" }, 128 * 1024 * 1024); Media.LoadMusic(local, message => { Notify(message); if (message == "音乐已载入") { Preferences.musicPath = local; ApplyPreferences(); } }); });
            });
            UI.Button(panel, "使用内置《月下咖啡馆》", 548, 347, 455, () => { Preferences.musicPath = ""; Media.LoadMusic("", Notify); ApplyPreferences(); });
            UI.Label(panel, "音乐文件复制到本机自定义目录。可随时更换或将音量降为零。", 28, 432, 982, 72, 18);
        }
        void InterfaceSettings(RectTransform panel)
        {
            UI.Slider(panel, "界面字号", Preferences.uiScale, .8f, 1.2f, 28, 165, 455, v => { Preferences.uiScale = v; ApplyPreferences(); });
            UI.Slider(panel, "面板不透明度", Preferences.opacity, .5f, 1, 548, 165, 455, v => { Preferences.opacity = v; ApplyPreferences(); });
            UI.Slider(panel, "动作强度（0 为静态）", Preferences.motion, 0, 1, 28, 252, 455, v => { Preferences.motion = v; ApplyPreferences(); });
            UI.Button(panel, "左右交换面板", 548, 258, 455, () => { Preferences.mirrorPanels = !Preferences.mirrorPanels; ApplyPreferences(); });
            UI.Label(panel, "主题强调色", 28, 346, 200, 30, 18);
            for (int i = 0; i < ArenaPreferences.Colors.Length; i++) { string color = ArenaPreferences.Colors[i]; var b = UI.Button(panel, "", 230 + i * 65, 335, 50, () => { Preferences.accent = color; ApplyPreferences(); ShowSettings(2); }); ColorUtility.TryParseHtmlString(color, out var tint); b.GetComponent<UnityEngine.UI.Image>().color = tint; }
            UI.Button(panel, "导入界面背景", 28, 414, 300, () =>
            {
                var path = LocalFilePicker.Pick("选择界面背景图片", "Image\0*.png;*.jpg;*.jpeg\0\0"); if (path == null) return;
                Try(() => { var local = ArenaPreferences.ImportFile(path, new[] { ".png", ".jpg", ".jpeg" }, 16 * 1024 * 1024); SetBackground(local); Preferences.backgroundPath = local; ApplyPreferences(); });
            });
            UI.Slider(panel, "观战俯角", Preferences.spectator.pitch, 45, 55, 700, 415, 305, v => { Preferences.spectator.pitch=v; ApplyPreferences(); });
            UI.Button(panel, "清除界面背景", 352, 414, 300, () => { Preferences.backgroundPath = ""; UI.Background.color = Color.clear; ApplyPreferences(); });
            UI.Button(panel, "导入 JSON 预设", 28, 489, 300, () =>
            {
                var path = LocalFilePicker.Pick("导入自定义预设", "JSON preset\0*.json\0\0"); if (path == null) return;
                Try(() => ApplyPreset(ArenaPreferences.Import(path)));
            });
            UI.Button(panel, "导出当前预设", 352, 489, 300, () => Try(() => { Preferences.Save(); File.Copy(ArenaPreferences.FilePath, Path.Combine(ArenaPreferences.Folder, "preset-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".json")); Notify("预设已导出到自定义文件夹"); }));
            UI.Button(panel, "导入完整素材包", 28, 551, 300, () =>
            {
                var path = LocalFilePicker.Pick("导入形象、音乐和界面素材包", "QuQu bundle\0*.ququ\0\0"); if (path == null) return;
                Try(() => ApplyPreset(ArenaPresetArchive.Import(path, ArenaPreferences.Folder)));
            });
            UI.Button(panel, "导出预设 + 全部素材", 352, 551, 300, () => Try(() =>
            {
                Directory.CreateDirectory(ArenaPreferences.Folder);
                var path = Path.Combine(ArenaPreferences.Folder, "arena-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".ququ");
                ArenaPresetArchive.Export(Preferences, path); Notify("已导出完整素材包，可复制到另一台电脑使用");
            }));
        }
        void ApplyPreset(ArenaPreferences next)
        {
            next.endpoint = Preferences.endpoint; Preferences = next; ApplyPreferences();
            foreach (var f in Stage.Fighters) { f.Look = Preferences.Avatar(f.State.Id, Stage.Fighters.IndexOf(f)); RebuildAvatar(f); }
            Media.LoadMusic(Preferences.musicPath, Notify); SetBackground(Preferences.backgroundPath); ShowSettings(2);
        }
        void SetBackground(string path)
        {
            if (string.IsNullOrEmpty(path)) { UI.Background.color = Color.clear; return; }
            Try(() => { var texture = ArenaMedia.Texture(path); if (UI.Background.texture) Destroy(UI.Background.texture); UI.Background.texture = texture; UI.Background.color = new Color(1, 1, 1, .13f); });
        }
        IEnumerator Smoke()
        {
            yield return new WaitForSecondsRealtime(2); Demo();
            yield return new WaitForSecondsRealtime(5);
            var dir = Path.Combine(Application.persistentDataPath, "Validation"); Directory.CreateDirectory(dir);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir, "game-running.png"));
            float deadline = Time.realtimeSinceStartup + 90;
            while (!Finished && Time.realtimeSinceStartup < deadline) yield return new WaitForSecondsRealtime(.5f);
            File.WriteAllText(Path.Combine(dir, "runtime.json"), JsonUtility.ToJson(new RuntimeCheck { frames = AcceptedFrames, fighters = Stage.Fighters.Count, completed = Finished, report = ReportPath ?? "", graphics = SystemInfo.graphicsDeviceName }, true));
            ScreenCapture.CaptureScreenshot(Path.Combine(dir, "game-result.png"));
        }
        [Serializable] class RuntimeCheck { public int frames, fighters; public bool completed; public string report, graphics; }
    }
}
