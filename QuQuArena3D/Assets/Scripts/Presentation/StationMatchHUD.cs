using System;
using System.Linq;
using System.Text;
using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // Read-only competition display; the app remains responsible for watching a competition.
    public sealed class StationMatchHUD : MonoBehaviour
    {
        public Action<string> WatchRequested;
        public Action RefreshRequested;
        public Func<bool> AdditionalInputBlocked;
        public StationSpectatorCamera CameraModes;
        public bool InputFocused { get; private set; }
        public bool IsCompact => hidden;
        public bool LoadingCompetitions { get; private set; }
        public string CompetitionMessage { get; private set; } = "";
        public int CompetitionCount => competitions.Length;

        CompetitionSnapshot state;
        CompetitionDuel duel, pinnedDuel;
        CompetitionRound round, pinnedRound;
        string status, connection, leftName, rightName, watchedId, watchInput = "", pinnedKey;
        float leftHealth, rightHealth;
        bool watchOpen, drawerOpen, hidden;
        int drawerTab;
        Vector2 scroll;
        Vector2 competitionScroll;
        CompetitionSummary[] competitions = Array.Empty<CompetitionSummary>();
        Texture2D panelTexture, buttonTexture, hoverTexture;
        GUIStyle panel, title, body, small, button, field;

        public void Show(CompetitionSnapshot snapshot, CompetitionDuel currentDuel, CompetitionRound currentRound,
            string phase, string service, string left, string right, float leftHp, float rightHp, string id)
        {
            if (state?.id != snapshot?.id) { pinnedKey = null; pinnedRound = null; pinnedDuel = null; }
            state = snapshot;
            duel = currentDuel;
            round = currentRound;
            status = phase;
            connection = service;
            leftName = left;
            rightName = right;
            leftHealth = leftHp;
            rightHealth = rightHp;
            watchedId = id;
            if (!watchOpen) watchInput = id ?? "";
            if (pinnedKey == Key(currentDuel, currentRound)) { pinnedRound = currentRound; pinnedDuel = currentDuel; }
        }

        void Update()
        {
            if (!InputFocused && Keyboard.current?.hKey.wasPressedThisFrame == true)
                SetCompact(!hidden);
        }

        public void SetCompact(bool compact)
        {
            hidden = compact;
            if (!compact) return;
            watchOpen = false;
            drawerOpen = false;
            InputFocused = false;
        }

        public void OpenWatchPanel()
        {
            hidden = false;
            watchOpen = true;
            RefreshCompetitions();
        }

        public void RefreshCompetitions()
        {
            if (LoadingCompetitions) return;
            competitions = Array.Empty<CompetitionSummary>();
            competitionScroll = Vector2.zero;
            LoadingCompetitions = true;
            CompetitionMessage = "正在读取赛事…";
            if (RefreshRequested != null) RefreshRequested();
            else ShowCompetitions(null, "比赛服务尚未就绪，请稍后刷新");
        }

        public void ShowCompetitions(CompetitionSummary[] rows, string error = null)
        {
            LoadingCompetitions = false;
            competitions = rows ?? Array.Empty<CompetitionSummary>();
            CompetitionMessage = error ?? (competitions.Length == 0 ? "暂无赛事，请先在比赛大厅开赛，再刷新这里" : "选择一场赛事观看；已结束赛事显示结果");
        }

        public void SelectCompetition(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return;
            WatchRequested?.Invoke(id.Trim());
            watchOpen = false;
            InputFocused = false;
        }

        static string Key(CompetitionDuel match, CompetitionRound value) => match?.id + "/" + value?.id;

        public bool BlocksInput()
        {
            if (AdditionalInputBlocked?.Invoke() == true) return true;
            if (!enabled) return false;
            if (InputFocused) return true;
            var mouse = Mouse.current;
            if (mouse == null) return false;
            var point = mouse.position.ReadValue() * (900f / Screen.height);
            point.y = 900 - point.y;
            if (hidden) return new Rect(0, 0, 142, 52).Contains(point);
            float width = Screen.width * 900f / Screen.height;
            return new Rect(0, 0, 590, watchOpen ? 500 : 52).Contains(point)
                || new Rect(width - 488, 0, 488, drawerOpen ? 725 : 95).Contains(point)
                || new Rect(width / 2 - 300, 840, 600, 60).Contains(point);
        }
        static Texture2D Solid(Color color)
        {
            var texture = new Texture2D(1, 1);
            texture.SetPixel(0, 0, color);
            texture.Apply();
            return texture;
        }

        void Styles()
        {
            if (panel != null) return;
            panelTexture = Solid(new Color(.018f, .032f, .049f, .85f));
            buttonTexture = Solid(new Color(.045f, .075f, .105f, .94f));
            hoverTexture = Solid(new Color(.085f, .17f, .22f, 1));
            panel = new GUIStyle(GUI.skin.box);
            panel.normal.background = panelTexture;
            title = new GUIStyle(GUI.skin.label) { fontSize = 20, clipping = TextClipping.Clip };
            title.normal.textColor = Color.white;
            body = new GUIStyle(GUI.skin.label) { fontSize = 17, wordWrap = true, clipping = TextClipping.Clip };
            body.normal.textColor = new Color(.89f, .95f, 1);
            small = new GUIStyle(body) { fontSize = 14 };
            small.normal.textColor = new Color(.67f, .8f, .87f);
            button = new GUIStyle(GUI.skin.button) { fontSize = 16 };
            button.normal.background = buttonTexture;
            button.hover.background = hoverTexture;
            button.active.background = hoverTexture;
            button.normal.textColor = button.hover.textColor = button.active.textColor = Color.white;
            field = new GUIStyle(GUI.skin.textField) { fontSize = 17 };
        }

        void OnGUI()
        {
            Styles();
            var previousMatrix = GUI.matrix;
            float scale = Screen.height / 900f, width = Screen.width / scale;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            if (hidden)
            {
                if (GUI.Button(new Rect(16, 16, 126, 34), "赛事 · H", button))
                    SetCompact(false);
                GUI.matrix = previousMatrix;
                return;
            }

            if (GUI.Button(new Rect(16, 16, 126, 34), "观看赛事", button))
            {
                if (watchOpen) watchOpen = false;
                else OpenWatchPanel();
            }
            GUI.Label(new Rect(152, 21, 430, 28), string.IsNullOrEmpty(watchedId) ? "尚未选择赛事" : watchedId, small);
            GUI.Box(new Rect(width - 480, 16, 464, 72), "", panel);
            GUI.Label(new Rect(width - 464, 21, 432, 29), status ?? "等待赛事", title);
            GUI.Label(new Rect(width - 464, 53, 432, 24), connection ?? "未连接", small);

            var players = duel?.players;
            if (players?.Length == 2)
            {
                Fighter(16, 725, leftName, leftHealth, players[0], new Color(.35f, .95f, .79f));
                Fighter(width - 406, 725, rightName, rightHealth, players[1], new Color(1, .56f, .36f));
            }
            GUI.Box(new Rect(width / 2 - 270, 761, 540, 69), "", panel);
            GUI.Label(new Rect(width / 2 - 252, 766, 504, 26), round == null ? "等待赛题" : (round.overtime ? "加赛" : "第 " + round.index + " 题"), small);
            var question = round?.question?.task?.input ?? "等待开赛";
            GUI.Label(new Rect(width / 2 - 252, 790, 504, 30),
                question.Length > 25 ? question.Substring(0, 25) + "…" : question, body);

            float x = width / 2 - 294;
            if (GUI.Button(new Rect(x, 849, 92, 34), "答卷", button)) OpenDrawer(0);
            if (GUI.Button(new Rect(x + 98, 849, 92, 34), "赛程", button)) OpenDrawer(1);
            if (GUI.Button(new Rect(x + 196, 849, 92, 34), "解说", button)) OpenDrawer(2);
            if (GUI.Button(new Rect(x + 294, 849, 92, 34), "近景", button)) CameraModes?.ToggleCloseUp();
            if (GUI.Button(new Rect(x + 392, 849, 92, 34), "自由", button)) CameraModes?.ToggleFree();
            if (GUI.Button(new Rect(x + 490, 849, 92, 34), "返回", button)) CameraModes?.Return();
            if (watchOpen) WatchPanel();
            if (drawerOpen) Drawer(width);
            InputFocused = watchOpen && GUI.GetNameOfFocusedControl() == "StationWatchId";
            GUI.matrix = previousMatrix;
        }

        void Fighter(float x, float y, string name, float health, string id, Color tint)
        {
            GUI.Box(new Rect(x, y, 390, 104), "", panel);
            GUI.Label(new Rect(x + 14, y + 6, 260, 28), name, title);
            GUI.Label(new Rect(x + 294, y + 8, 84, 26), health < 0 ? "? HP" : health.ToString("0.#") + " HP", body);
            var previous = GUI.color;
            GUI.color = new Color(.16f, .23f, .28f); GUI.DrawTexture(new Rect(x + 14, y + 40, 362, 5), Texture2D.whiteTexture);
            GUI.color = tint; GUI.DrawTexture(new Rect(x + 14, y + 40, 362 * Mathf.Clamp01(health / ArenaTuning.MaxHealth), 5), Texture2D.whiteTexture);
            GUI.color = previous;
            var live = round?.live?.FirstOrDefault(a => a.modelId == id);
            var record = round?.records?.FirstOrDefault(a => a != null && a.model == id);
            GUI.Label(new Rect(x + 14, y + 53, 362, 44), live?.answer ?? record?.answer ?? "等待模型返回…", body);
        }

        void WatchPanel()
        {
            GUI.Box(new Rect(16, 56, 554, 434), "", panel);
            GUI.Label(new Rect(29, 63, 360, 25), "观看赛事", title);
            GUI.enabled = !LoadingCompetitions;
            if (GUI.Button(new Rect(459, 63, 96, 28), "刷新", button)) RefreshCompetitions();
            GUI.enabled = true;
            GUI.Label(new Rect(29, 98, 520, 42), CompetitionMessage, small);
            competitionScroll = GUI.BeginScrollView(new Rect(29, 145, 526, 250), competitionScroll,
                new Rect(0, 0, 506, Mathf.Max(250, competitions.Length * 62)));
            for (int i = 0; i < competitions.Length; i++)
            {
                var item = competitions[i];
                GUI.Label(new Rect(4, i * 62, 378, 26), item.title, body);
                var date = DateTime.TryParse(item.createdAt, out var created) ? " · " + created.ToLocalTime().ToString("MM-dd HH:mm") : "";
                GUI.Label(new Rect(4, i * 62 + 28, 378, 24), CompetitionStatus(item.status) + date, small);
                if (GUI.Button(new Rect(398, i * 62 + 10, 100, 32), item.status == "completed" || item.status == "stopped" ? "查看结果" : "观看", button)) SelectCompetition(item.id);
            }
            GUI.EndScrollView();
            GUI.Label(new Rect(29, 408, 520, 23), "也可以粘贴赛事编号", small);
            GUI.SetNextControlName("StationWatchId");
            watchInput = GUI.TextField(new Rect(29, 443, 414, 32), watchInput, 128, field);
            GUI.enabled = !string.IsNullOrWhiteSpace(watchInput);
            if (GUI.Button(new Rect(459, 443, 96, 32), "观看", button)) SelectCompetition(watchInput);
            GUI.enabled = true;
        }

        static string CompetitionStatus(string value) => value == "running" ? "进行中" :
            value == "paused" ? "已暂停" : value == "waiting" ? "等待继续" :
            value == "completed" ? "已结束" : value == "stopped" ? "已停止" : "等待开赛";

        void OpenDrawer(int tab)
        {
            if (drawerOpen && drawerTab == tab) { drawerOpen = false; return; }
            drawerOpen = true;
            drawerTab = tab;
            scroll = Vector2.zero;
            if (tab == 0) { pinnedRound = round; pinnedDuel = duel; pinnedKey = Key(duel, round); }
        }

        void Drawer(float width)
        {
            float x = width - 560;
            GUI.Box(new Rect(x, 98, 544, 620), "", panel);
            GUI.Label(new Rect(x + 18, 108, 400, 32), drawerTab == 0 ? "完整答卷" : drawerTab == 1 ? "赛事赛程" : "解说记录", title);
            if (GUI.Button(new Rect(x + 430, 108, 94, 30), "关闭", button)) { drawerOpen = false; return; }
            if (drawerTab == 0 && GUI.Button(new Rect(x + 18, 150, 126, 30), "切到当前题", button))
            { pinnedRound = round; pinnedDuel = duel; pinnedKey = Key(duel, round); scroll = Vector2.zero; }
            var content = DrawerText();
            float top = drawerTab == 0 ? 191 : 152;
            float height = body.CalcHeight(new GUIContent(content), 494) + 20;
            scroll = GUI.BeginScrollView(new Rect(x + 18, top, 508, 698 - top), scroll,
                new Rect(0, 0, 494, Mathf.Max(height, 698 - top)));
            GUI.Label(new Rect(0, 0, 494, height), content, body);
            GUI.EndScrollView();
        }

        string DrawerText()
        {
            var text = new StringBuilder();
            if (drawerTab == 1)
            {
                foreach (var item in state?.duels ?? Array.Empty<CompetitionDuel>())
                    text.Append("第 ").Append(item.stage).Append(" 阶段 · ").Append(item.id).Append("\n")
                        .Append(Name(item.players?.ElementAtOrDefault(0))).Append("  VS  ")
                        .Append(Name(item.players?.ElementAtOrDefault(1))).Append("\n")
                        .Append(item.status).Append(" · 胜者 ").Append(Name(item.winner)).Append("\n\n");
                return text.Length == 0 ? "尚无对局" : text.ToString();
            }
            if (drawerTab == 2)
            {
                foreach (var item in state?.commentary?.entries ?? Array.Empty<CommentaryItem>())
                    text.Append(item.status).Append(" · ").Append(item.text).Append("\n\n");
                return text.Length == 0 ? "尚无解说记录" : text.ToString();
            }
            var displayed = pinnedRound ?? round;
            text.Append(displayed?.question?.task?.input ?? "尚未开始答题");
            foreach (var id in (pinnedDuel ?? duel)?.players ?? Array.Empty<string>())
            {
                var live = displayed?.live?.FirstOrDefault(a => a.modelId == id);
                var record = displayed?.records?.FirstOrDefault(a => a != null && a.model == id);
                text.Append("\n\n—— ").Append(Name(id)).Append(" ——\n回答\n")
                    .Append(live?.answer ?? record?.answer ?? "等待作答…")
                    .Append("\n\n公开推理\n")
                    .Append(live?.reasoning ?? record?.reasoning ?? "未提供公开推理");
                if (!string.IsNullOrEmpty(live?.error ?? record?.error)) text.Append("\n异常：").Append(live?.error ?? record?.error);
                else if (record != null) text.Append("\n得分：").Append((record.score * 100).ToString("0.#")).Append('%');
            }
            return text.ToString();
        }

        string Name(string id) => state?.entrants?.FirstOrDefault(a => a.id == id)?.name ?? id ?? "待定";

        void OnDestroy()
        {
            if (panelTexture) Destroy(panelTexture);
            if (buttonTexture) Destroy(buttonTexture);
            if (hoverTexture) Destroy(hoverTexture);
        }
    }
}
