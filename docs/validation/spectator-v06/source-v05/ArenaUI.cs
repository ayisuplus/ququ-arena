using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;

namespace QuQu
{
    public class ArenaUI : MonoBehaviour
    {
        public TMP_FontAsset Font;
        public Color Accent = new Color(.38f, .94f, .77f);
        public RectTransform Root, Left, Right, Modal;
        public TMP_Text Status, Question, Answer, Reasoning, Round, Rules, Footer;
        public UnityEngine.UI.RawImage Background;
        public UnityEngine.UI.CanvasScaler Scaler;
        public Action<string> SelectFighter;
        readonly Dictionary<string, TMP_Text> names = new Dictionary<string, TMP_Text>();
        readonly Dictionary<TMP_Text, float> baseSizes = new Dictionary<TMP_Text, float>();
        readonly Dictionary<string, UnityEngine.UI.Image> health = new Dictionary<string, UnityEngine.UI.Image>();
        RectTransform roster, answerContent;
        float uiScale = 1;
        static readonly Color TextColor = new Color(.91f, .95f, .99f);
        static readonly Color Muted = new Color(.57f, .66f, .74f);
        static readonly Color PanelColor = new Color(.036f, .057f, .085f, .94f);
        static readonly Color FieldColor = new Color(.075f, .11f, .15f, 1);

        public RectTransform Box(Transform parent, string name, float x, float y, float w, float h, Color? color = null)
        {
            var g = new GameObject(name, typeof(RectTransform)); g.transform.SetParent(parent, false);
            var r = (RectTransform)g.transform; r.anchorMin = r.anchorMax = new Vector2(0, 1); r.pivot = new Vector2(0, 1); r.anchoredPosition = new Vector2(x, -y); r.sizeDelta = new Vector2(w, h);
            if (color.HasValue) { var image = g.AddComponent<UnityEngine.UI.Image>(); image.color = color.Value; image.raycastTarget = false; } return r;
        }
        public TMP_Text Label(Transform parent, string text, float x, float y, float w, float h, int size = 18, Color? color = null)
        {
            var r = Box(parent, "Text", x, y, w, h); var t = r.gameObject.AddComponent<TextMeshProUGUI>(); t.font = Font; t.fontSize = size * uiScale;
            t.color = color ?? TextColor; t.text = text; t.richText = false; t.raycastTarget = false; t.textWrappingMode = TextWrappingModes.Normal; t.overflowMode = TextOverflowModes.Overflow; baseSizes[t] = size; return t;
        }
        public UnityEngine.UI.Button Button(Transform parent, string text, float x, float y, float w, Action click, bool primary = false)
        {
            var r = Box(parent, text, x, y, w, 40, primary ? Accent : FieldColor);
            var image = r.GetComponent<UnityEngine.UI.Image>(); image.raycastTarget = true;
            var b = r.gameObject.AddComponent<UnityEngine.UI.Button>(); b.targetGraphic = image;
            var colors = b.colors; colors.highlightedColor = new Color(.8f, .92f, 1); colors.pressedColor = new Color(.6f, .7f, .8f); b.colors = colors;
            var label = Label(r, text, 10, 0, w - 20, 40, 17, primary ? new Color(.02f, .09f, .09f) : TextColor); label.alignment = TextAlignmentOptions.Midline;
            b.onClick.AddListener(() => click()); return b;
        }
        public TMP_InputField Input(Transform parent, string value, float x, float y, float w, string placeholder = "")
        {
            var r = Box(parent, "Input", x, y, w, 40, FieldColor); r.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            var field = r.gameObject.AddComponent<TMP_InputField>(); var t = Label(r, "", 12, 4, w - 24, 32, 16);
            t.alignment = TextAlignmentOptions.MidlineLeft; t.textWrappingMode = TextWrappingModes.NoWrap;
            field.textViewport = t.rectTransform; field.textComponent = (TextMeshProUGUI)t; field.text = value ?? "";
            field.fontAsset = Font; field.pointSize = 16; field.caretColor = Accent; field.selectionColor = new Color(.2f, .6f, .5f, .45f);
            field.lineType = TMP_InputField.LineType.SingleLine; field.characterLimit = 1024;
            var hint = Label(r, placeholder, 12, 4, w - 24, 32, 16, Muted); field.placeholder = hint; return field;
        }
        public UnityEngine.UI.Slider Slider(Transform parent, string title, float value, float min, float max, float x, float y, float w, Action<float> changed)
        {
            var label = Label(parent, title + "  " + value.ToString("0.00"), x, y, w, 24, 16, Muted);
            var r = Box(parent, title, x, y + 32, w, 18, FieldColor); var s = r.gameObject.AddComponent<UnityEngine.UI.Slider>();
            var fill = Box(r, "Fill", 0, 0, w, 18, Accent); fill.anchorMin = Vector2.zero; fill.anchorMax = Vector2.one; fill.offsetMin = fill.offsetMax = Vector2.zero;
            s.fillRect = fill; s.minValue = min; s.maxValue = max; s.value = value;
            r.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            s.onValueChanged.AddListener(v => { label.text = title + "  " + v.ToString("0.00"); changed(v); }); return s;
        }
        public RectTransform Scroll(Transform parent, float x, float y, float w, float h)
        {
            var root = Box(parent, "Scroll view", x, y, w, h); var scroll = root.gameObject.AddComponent<UnityEngine.UI.ScrollRect>();
            var viewport = Box(root, "Viewport", 0, 0, w, h, Color.white); viewport.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            viewport.gameObject.AddComponent<UnityEngine.UI.Mask>().showMaskGraphic = false;
            var content = Box(viewport, "Content", 0, 0, w - 10, h);
            scroll.viewport = viewport; scroll.content = content; scroll.horizontal = false; scroll.movementType = UnityEngine.UI.ScrollRect.MovementType.Clamped;
            scroll.scrollSensitivity = 30; return content;
        }
        public void Create(ArenaGame game)
        {
            Font = Resources.Load<TMP_FontAsset>("ArenaFont");
            if (!Font)
            {
                var font = UnityEngine.Font.CreateDynamicFontFromOSFont(new[] { "Microsoft YaHei", "SimHei", "Arial" }, 40);
                Font = TMP_FontAsset.CreateFontAsset(font); Font.atlasPopulationMode = AtlasPopulationMode.Dynamic;
            }
            var canvas = gameObject.AddComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            Scaler = gameObject.AddComponent<UnityEngine.UI.CanvasScaler>(); Scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            Scaler.referenceResolution = new Vector2(1600, 900); Scaler.matchWidthOrHeight = .5f;
            Scaler.screenMatchMode = UnityEngine.UI.CanvasScaler.ScreenMatchMode.Expand;
            gameObject.AddComponent<UnityEngine.UI.GraphicRaycaster>();
            Root = Box(transform, "Design root", 0, 0, 1600, 900); Root.anchorMin = Root.anchorMax = new Vector2(.5f, .5f); Root.anchoredPosition = new Vector2(-800, 450);
            var events = new GameObject("UI events"); events.transform.SetParent(transform); events.AddComponent<EventSystem>(); events.AddComponent<InputSystemUIInputModule>();
            var backdrop = Box(Root, "Custom backdrop", 0, 0, 1600, 900); Background = backdrop.gameObject.AddComponent<UnityEngine.UI.RawImage>(); Background.raycastTarget = false; Background.color = Color.clear;
            var header = Box(Root, "Header", 0, 0, 1600, 100, PanelColor);
            Label(header, "QUQU / ARENA", 30, 20, 310, 25, 18, Accent);
            Label(header, "AI 斗兽场 · 3D", 30, 49, 350, 34, 27);
            Label(header, "看它们思考。看它们交手。", 420, 31, 530, 42, 29);
            Button(header, "首页", 980, 30, 75, game.ShowHome);
            Button(header, "开赛 / 回放", 1070, 30, 155, game.ShowLobby, true);
            Button(header, "自定义", 1240, 30, 130, () => game.ShowSettings(0));
            Button(header, "工程实验室 ↗", 1385, 30, 185, () => game.OpenWeb("/experiments"));
            Left = Box(Root, "Contestants", 30, 124, 285, 608, PanelColor);
            Label(Left, "CONTENDERS / 参赛席", 20, 20, 245, 27, 17, Accent);
            roster = Scroll(Left, 15, 65, 255, 466);
            Label(Left, "耐久按已判失分展示\n等待与调用失败不扣分", 20, 547, 245, 48, 14, Muted);
            Right = Box(Root, "Answer desk", 1160, 124, 410, 608, PanelColor);
            Round = Label(Right, "LIVE / 等待开赛", 20, 18, 370, 30, 17, Accent);
            var questionContent = Scroll(Right, 20, 58, 370, 122);
            Question = Label(questionContent, "选择题库和模型，开始一场真实比赛。", 0, 0, 347, 122, 20);
            Question.overflowMode = TextOverflowModes.Overflow;
            Label(Right, "当前选手的回答", 20, 196, 370, 26, 15, Muted);
            answerContent = Scroll(Right, 20, 232, 370, 292);
            Answer = Label(answerContent, "点击左侧选手，查看它的作答。", 0, 0, 347, 290, 18);
            Answer.overflowMode = TextOverflowModes.Overflow;
            Button(Right, "回答 / 公开推理", 20, 546, 176, game.ToggleReasoning);
            Button(Right, "完整答卷 ↗", 210, 546, 178, () => game.OpenWeb(string.IsNullOrEmpty(game.Connection.Battle) ? "/results" : "/battle?session=" + game.Connection.Battle));
            Rules = Label(Root, "3D 动作呈现比赛进度 · 评分由原比赛引擎决定", 365, 126, 730, 50, 17, Muted); Rules.alignment = TextAlignmentOptions.Center;
            Status = Label(Root, "待开赛 · 形象预览", 375, 676, 720, 50, 22, Accent); Status.alignment = TextAlignmentOptions.Center;
            var controls = Box(Root, "Match controls", 30, 758, 1540, 68, PanelColor);
            Button(controls, "暂停", 15, 14, 100, () => game.Connection.Control("pause"));
            Button(controls, "继续", 125, 14, 100, () => game.Connection.Control("resume"));
            Button(controls, "结束本场", 235, 14, 125, () => game.Connection.Control("stop"));
            Button(controls, "镜头环绕", 455, 14, 130, () => game.Stage.Orbit = !game.Stage.Orbit);
            Button(controls, "复位镜头", 595, 14, 130, game.Stage.ResetCamera);
            Button(controls, "答题面板", 735, 14, 130, () => { game.Preferences.answersVisible = !game.Preferences.answersVisible; game.ApplyPreferences(); });
            Button(controls, "大屏观战 F10", 880, 14, 175, game.ToggleSpectator, true);
            Button(controls, "选手特写", 1068, 14, 140, game.FocusSelected);
            Button(controls, "对阵 / 续赛", 1380, 14, 145, () => game.Duel.ShowBracket());
            Button(controls, "答卷 / 推理", 1220, 14, 145, game.ToggleReasoning);
            Footer = Label(Root, "右键旋转 · 滚轮缩放 · F10 大屏观战 · F11 全屏 · Esc 返回", 32, 844, 1536, 34, 16, Muted);
        }
        public void SetRoster(List<ArenaFighter> fighters)
        {
            foreach (Transform child in roster) Destroy(child.gameObject); names.Clear(); health.Clear();
            for (int i = 0; i < fighters.Count; i++)
            {
                var f = fighters[i]; var id = f.State.Id; var r = Box(roster, "Fighter " + id, 0, i * 100, 243, 89, FieldColor);
                var b = r.gameObject.AddComponent<UnityEngine.UI.Button>(); r.GetComponent<UnityEngine.UI.Image>().raycastTarget = true; b.targetGraphic = r.GetComponent<UnityEngine.UI.Image>(); b.onClick.AddListener(() => SelectFighter?.Invoke(id));
                Box(r, "Team color", 0, 0, 4, 89, f.Tint);
                var portrait = ArenaModelPresets.Find(f.Look.presetId)?.Portrait;
                if (portrait) { var image = Box(r,"Character portrait",12,5,35,62).gameObject.AddComponent<UnityEngine.UI.RawImage>(); image.texture = portrait; image.raycastTarget = false; }
                names[id] = Label(r, f.State.Name, portrait ? 56 : 14, 9, portrait ? 178 : 220, 57, 17);
                var track = Box(r, "Health track", 14, 70, 210, 5, PanelColor);
                health[id] = Box(track, "Health fill", 0, 0, 210, 5, f.Tint).GetComponent<UnityEngine.UI.Image>();
            }
            roster.sizeDelta = new Vector2(roster.sizeDelta.x, Mathf.Max(466, fighters.Count * 100));
        }
        public void Refresh(List<ArenaFighter> fighters, string selected, bool reasoning)
        {
            foreach (var f in fighters)
            {
                if (names.TryGetValue(f.State.Id, out var t)) t.text = f.State.Name + "\n" + StateName(f.State.Status) + "  ·  " + Mathf.RoundToInt(f.State.Health) + "%";
                if (health.TryGetValue(f.State.Id, out var h)) h.rectTransform.sizeDelta = new Vector2(210 * f.State.Health / 100, 5);
                if (f.State.Id != selected) continue;
                var value = reasoning ? f.State.Reasoning : f.State.Answer;
                if (string.IsNullOrEmpty(value)) value = reasoning ? "接口尚未提供公开推理内容。" : "等待回答…";
                value = f.State.Name + " · " + f.State.TaskId + "\n\n" + value + (string.IsNullOrEmpty(f.State.Note) ? "" : "\n\n" + f.State.Note);
                if (value.Length > 24000) value = value.Substring(0, 24000) + "\n\n（内容较长，请点完整答卷查看。）";
                if (Answer.text != value) { Answer.text = value; FitAnswer(); }
            }
        }
        public static string StateName(string state)
        {
            switch (state) { case "generating": return "正在思考"; case "judging": return "提交 / 待判"; case "done": return "作答完成"; case "error": return "调用失败"; case "withdrawn": return "已退赛"; case "retrying": return "重试中"; case "stopped": return "已停止"; default: return "准备就绪"; }
        }
        void FitAnswer()
        {
            float height = Mathf.Max(290, Answer.GetPreferredValues(Answer.text, 347, 0).y + 30);
            Answer.rectTransform.sizeDelta = new Vector2(347,height); answerContent.sizeDelta = new Vector2(360,height);
        }
        public void SetQuestion(string text)
        {
            Question.text = text ?? "";
            float height = Mathf.Max(122, Question.GetPreferredValues(Question.text, 347, 0).y + 12);
            Question.rectTransform.sizeDelta = new Vector2(347, height);
            ((RectTransform)Question.transform.parent).sizeDelta = new Vector2(360, height);
        }
        public RectTransform OpenModal(string title)
        {
            CloseModal(); Modal = Box(Root, "Dialog", 0, 0, 1600, 900, new Color(0, .015f, .028f, .82f)); Modal.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            var panel = Box(Modal, "Panel", 280, 112, 1040, 676, PanelColor); Label(panel, title, 28, 22, 870, 44, 27, Accent);
            Button(panel, "关闭", 930, 23, 83, CloseModal); return panel;
        }
        public void CloseModal() { if (Modal) Destroy(Modal.gameObject); Modal = null; }
        public void ShowNotice(string message)
        {
            if (!Modal) return;
            var previous = transform.Find("Notice"); if (previous) Destroy(previous.gameObject);
            var box = Box(transform, "Notice", 0, 0, 1040, 55, new Color(.025f,.065f,.078f,.98f));
            box.anchorMin = box.anchorMax = new Vector2(.5f, 0); box.anchoredPosition = new Vector2(-520, 76);
            Label(box, message, 20, 10, 1000, 38, 18, Accent); Destroy(box.gameObject, 6);
        }
        public void Apply(ArenaPreferences prefs)
        {
            uiScale = prefs.uiScale;
            ColorUtility.TryParseHtmlString(prefs.accent, out Accent);
            var stale = new List<TMP_Text>();
            foreach (var entry in baseSizes) { if (entry.Key) entry.Key.fontSize = entry.Value * prefs.uiScale; else stale.Add(entry.Key); }
            foreach (var key in stale) baseSizes.Remove(key);
            Right.gameObject.SetActive(false); Left.gameObject.SetActive(false);
            Left.anchoredPosition = new Vector2(prefs.mirrorPanels ? 1285 : 30, -124);
            Right.anchoredPosition = new Vector2(prefs.mirrorPanels ? 30 : 1160, -124);
            foreach (var r in new[] { Left, Right }) { var image = r.GetComponent<UnityEngine.UI.Image>(); var c = image.color; c.a = prefs.opacity; image.color = c; }
            Status.color = Accent; Round.color = Accent;
            SetQuestion(Question.text);
            FitAnswer();
        }
    }
}
