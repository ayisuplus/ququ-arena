using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;

namespace QuQu
{
    /** HUD 界面（P3 面孔收编后）：控件工具箱 + 界面层入口。
     *  · 导航语义（层级、回退、守卫、关闭回调、路由）归 ArenaNavigation，本类提供意图化 API
     *  （OpenModal / OpenSurface / SetBack / SetGuard / SetClosed / ClearGuard / ClearClosed）；
     *  · 布局构建归 ArenaHeaderBar / ArenaRosterPanel / ArenaAnswerDesk / ArenaControlsBar，
     *  尺寸与配色出处见 ArenaLayout（数值与历史像素一致）。
     *  旧兼容面孔 Modal/ModalClosed/BackAction/BeforeLeave 已退役：Modal 只读，回调一律走 Set 系与 Clear 系 API。 */
    public class ArenaUI : MonoBehaviour
    {
        public TMP_FontAsset Font;
        public Color Accent = ArenaLayout.AccentDefault;
        public RectTransform Root, Left, Right;
        public TMP_Text Status, Question, Answer, Reasoning, Round, Rules, Footer;
        public UnityEngine.UI.RawImage Background;
        public UnityEngine.UI.CanvasScaler Scaler;
        public Action<string> SelectFighter;
        /** UI 点击音钩子（组合根装配到音效轨）；Button 与自绘按钮统一走 Click() 收口。 */
        public Action ClickSound;
        public void Click() => ClickSound?.Invoke();
        readonly ArenaNavigation nav = new ArenaNavigation();
        readonly ArenaRosterPanel rosterPanel = new ArenaRosterPanel();
        readonly ArenaAnswerDesk answerDesk = new ArenaAnswerDesk();
        /** P1：导航栈（层级/回退/守卫/路由的唯一管理者）。 */
        public ArenaNavigation Nav => nav;
        /** P3：Modal 只读——写入只能走 OpenModal（对话框）或 OpenSurface（自绘界面层）。 */
        public RectTransform Modal => modal;
        /** P3：界面视觉的打开序号，Esc 按「最后打开的先收」与抽屉比较（见 ArenaGame.Escape）。 */
        public int ModalOpenedAt => modalOpenedAt;
        /** P3：统一序号源（界面层与两个抽屉共用同一个打开先后序列）。 */
        public int NextSurfaceSeq() => ++surfaceSeq;
        /** P3：意图化回调 API，落到当前导航层（兼容面孔 ModalClosed/BackAction/BeforeLeave 已退役）。 */
        public void SetBack(Action action) { nav.Top.Back = action; }
        public void SetGuard(Action<Action> guard) { nav.Top.Guard = guard; }
        public void SetClosed(Action closed) { nav.Top.Closed = closed; }
        public void ClearGuard() { nav.Top.Guard = null; }
        public void ClearClosed() { nav.Top.Closed = null; }
        RectTransform modal, confirmation;
        int modalOpenedAt = -1, surfaceSeq;
        IArenaCommands owner; // P3：只持命令集，不持门面具体类型
        public bool ConfirmationOpen => confirmation;
        readonly Dictionary<TMP_Text, float> baseSizes = new Dictionary<TMP_Text, float>();
        float uiScale = 1;
        static readonly Color TextColor = ArenaLayout.Text;
        static readonly Color Muted = ArenaLayout.Muted;
        static readonly Color PanelColor = ArenaLayout.Panel;
        static readonly Color FieldColor = ArenaLayout.Field;

        public RectTransform Box(Transform parent, string name, float x, float y, float w, float h, Color? color = null)
        {
            var g = new GameObject(name, typeof(RectTransform)); g.transform.SetParent(parent, false);
            var r = (RectTransform)g.transform; r.anchorMin = r.anchorMax = new Vector2(0, 1); r.pivot = new Vector2(0, 1); r.anchoredPosition = new Vector2(x, -y); r.sizeDelta = new Vector2(w, h);
            if (color.HasValue)
            {
                bool framed = w >= 60 && h >= 36 && h < 850 && name != "Viewport" && name != "Dialog";
                var image = framed ? g.AddComponent<ArenaPanel>() : g.AddComponent<UnityEngine.UI.Image>();
                image.color = color.Value; image.raycastTarget = false;
            }
            return r;
        }
        public TMP_Text Label(Transform parent, string text, float x, float y, float w, float h, int size = 18, Color? color = null)
        {
            var r = Box(parent, "Text", x, y, w, h); var t = r.gameObject.AddComponent<TextMeshProUGUI>(); t.font = Font; t.fontSize = size * uiScale;
            t.color = color ?? TextColor; t.text = text; t.richText = false; t.raycastTarget = false; t.textWrappingMode = TextWrappingModes.Normal; t.overflowMode = TextOverflowModes.Overflow;
            t.enableAutoSizing = false; t.extraPadding = true; t.lineSpacing = 5;
            if (size >= 23) t.fontStyle = FontStyles.Bold;
            baseSizes[t] = size; return t;
        }
        public TMP_Text Eyebrow(Transform parent, string text, float x, float y, float w)
        {
            var label = Label(parent, text, x, y, w, 24, 12, Muted);
            label.characterSpacing = 3; label.textWrappingMode = TextWrappingModes.NoWrap; return label;
        }
        public UnityEngine.UI.Button Button(Transform parent, string text, float x, float y, float w, Action click, bool primary = false)
        {
            var r = Box(parent, text, x, y, w, 40, primary ? Color.Lerp(new Color(.76f,.84f,.88f), Accent, .15f) : FieldColor);
            var image = r.GetComponent<UnityEngine.UI.Image>(); image.raycastTarget = true;
            var b = r.gameObject.AddComponent<UnityEngine.UI.Button>(); b.targetGraphic = image;
            var colors = b.colors; colors.highlightedColor = new Color(1.28f, 1.28f, 1.28f); colors.pressedColor = new Color(.72f, .82f, .9f); colors.fadeDuration = .12f; b.colors = colors;
            var label = Label(r, text, 10, 0, w - 20, 40, 17, primary ? new Color(.02f, .09f, .09f) : TextColor); label.alignment = TextAlignmentOptions.Midline;
            label.textWrappingMode = TextWrappingModes.NoWrap; label.overflowMode = TextOverflowModes.Ellipsis;
            b.onClick.AddListener(() => { Click(); click(); }); return b;
        }
        public TMP_InputField Input(Transform parent, string value, float x, float y, float w, string placeholder = "")
        {
            var r = Box(parent, "Input", x, y, w, 40, FieldColor); r.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            // TMP creates its caret and selection mesh in OnEnable, after these references exist.
            r.gameObject.SetActive(false);
            var field = r.gameObject.AddComponent<TMP_InputField>();
            var viewport=Box(r,"Text viewport",12,4,w-24,32);viewport.gameObject.AddComponent<UnityEngine.UI.RectMask2D>();
            var t = Label(viewport, "", 0, 0, w - 24, 32, 16);
            t.alignment = TextAlignmentOptions.MidlineLeft; t.textWrappingMode = TextWrappingModes.NoWrap;
            field.textViewport = viewport; field.textComponent = (TextMeshProUGUI)t; field.text = value ?? "";
            field.fontAsset = Font; field.pointSize = 16 * uiScale; field.caretColor = Accent; field.selectionColor = new Color(.3f, .6f, .75f, .45f);
            field.lineType = TMP_InputField.LineType.SingleLine; field.characterLimit = 1024;
            field.restoreOriginalTextOnEscape=false;
            field.onEndEdit.AddListener(_=>{if(field.wasCanceled && owner!=null)owner.RequestEscape();});
            var hint = Label(viewport, placeholder, 0, 0, w - 24, 32, 16, Muted); field.placeholder = hint;
            r.gameObject.SetActive(true); return field;
        }
        public TMP_InputField Multiline(Transform parent, string value, float x, float y, float w, float h, string placeholder, int limit)
        {
            var input = Input(parent, value, x, y, w, placeholder);
            ((RectTransform)input.transform).sizeDelta = new Vector2(w, h);
            input.lineType = TMP_InputField.LineType.MultiLineNewline; input.characterLimit = limit;
            input.textViewport.anchoredPosition=new Vector2(12,-10);input.textViewport.sizeDelta=new Vector2(w-24,h-20);
            foreach (var label in input.GetComponentsInChildren<TMP_Text>())
            {
                label.rectTransform.anchoredPosition = Vector2.zero;
                label.rectTransform.sizeDelta = new Vector2(w - 24, h - 20);
                label.alignment = TextAlignmentOptions.TopLeft; label.textWrappingMode = TextWrappingModes.Normal;
                label.overflowMode = TextOverflowModes.Masking;
            }
            return input;
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
        public void Create(IArenaCommands commands, ArenaPreferences preferences)
        {
            owner=commands;
            Font = Resources.Load<TMP_FontAsset>("UI/ObservatoryLatin") ?? Resources.Load<TMP_FontAsset>("ArenaFont");
            if (!Font)
            {
                var font = UnityEngine.Font.CreateDynamicFontFromOSFont(new[] { "Microsoft YaHei", "SimHei", "Arial" }, 40);
                Font = TMP_FontAsset.CreateFontAsset(font); Font.atlasPopulationMode = AtlasPopulationMode.Dynamic;
            }
            var canvas = gameObject.AddComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            Scaler = gameObject.AddComponent<UnityEngine.UI.CanvasScaler>(); Scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            Scaler.referenceResolution = new Vector2(ArenaLayout.CanvasW, ArenaLayout.CanvasH); Scaler.matchWidthOrHeight = .5f;
            Scaler.screenMatchMode = UnityEngine.UI.CanvasScaler.ScreenMatchMode.Expand;
            gameObject.AddComponent<UnityEngine.UI.GraphicRaycaster>();
            Root = Box(transform, "Design root", 0, 0, ArenaLayout.CanvasW, ArenaLayout.CanvasH); Root.anchorMin = Root.anchorMax = new Vector2(.5f, .5f); Root.anchoredPosition = new Vector2(-800, 450);
            var events = new GameObject("UI events"); events.transform.SetParent(transform); events.AddComponent<EventSystem>(); events.AddComponent<InputSystemUIInputModule>();
            var backdrop = Box(Root, "Custom backdrop", 0, 0, ArenaLayout.CanvasW, ArenaLayout.CanvasH); Background = backdrop.gameObject.AddComponent<UnityEngine.UI.RawImage>(); Background.raycastTarget = false; Background.color = Color.clear;
            ArenaHeaderBar.Build(this);   // 兄弟顺序：backdrop → header → …（绘制层级与旧版一致）
            rosterPanel.Build(this);
            answerDesk.Build(this, commands);
            Rules = Label(Root, "3D 动作呈现比赛进度 · 评分由原比赛引擎决定", 365, 126, 730, 50, 17, Muted); Rules.alignment = TextAlignmentOptions.Center;
            Status = Label(Root, "待开赛 · 形象预览", 375, ArenaLayout.StatusY, 720, 50, 22, Accent); Status.alignment = TextAlignmentOptions.Center;
            ArenaControlsBar.Build(this, commands, preferences);
            Footer = Label(Root, "右键旋转 · 滚轮缩放 · F10 大屏观战 · F11 全屏 · Esc 返回", 32, ArenaLayout.FooterY, 1536, 34, 16, Muted); Footer.gameObject.SetActive(false);
        }
        public void SetRoster(List<ArenaFighter> fighters) => rosterPanel.SetRoster(this, fighters);
        public void Refresh(List<ArenaFighter> fighters, string selected, bool reasoning)
        {
            rosterPanel.Refresh(fighters);
            answerDesk.Render(this, fighters, selected, reasoning);
        }
        public static string StateName(string state)
        {
            switch (state) { case "generating": return "正在思考"; case "judging": return "提交 / 待判"; case "done": return "作答完成"; case "error": return "调用失败"; case "withdrawn": return "已退赛"; case "retrying": return "重试中"; case "stopped": return "已停止"; default: return "准备就绪"; }
        }
        public void SetQuestion(string text) => answerDesk.SetQuestion(this, text);
        public RectTransform OpenModal(string title)
        {
            CloseModal();
            modal = Box(Root, "Dialog", 0, 0, ArenaLayout.CanvasW, ArenaLayout.CanvasH, new Color(0, .015f, .028f, .82f)); modal.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            modalOpenedAt = NextSurfaceSeq();
            var panel = Box(modal, "Panel", 280, 112, 1040, 676, PanelColor);
            nav.Push(title);
            Eyebrow(panel, "QUQU   /   OBSERVATORY CONTROL", 28, 12, 800);
            Label(panel, title, 28, 34, 870, 36, 25);
            Box(panel, "Header rule", 28, 73, 982, 1, new Color(.35f,.47f,.53f,.45f));
            Button(panel, "返回", 930, 23, 83, Back); return panel;
        }
        /** P3：自绘界面层入口（首页/设施面板）：视觉压栈登记、回调落本层，取代旧「Modal=overlay 不压栈」。 */
        public void OpenSurface(string id, RectTransform visual, Action back = null, Action closed = null)
        {
            modal = visual;
            var layer = nav.Push(id);
            layer.Back = back; layer.Closed = closed;
            modalOpenedAt = NextSurfaceSeq();
        }
        public void Leave(Action next) { var guard = nav.Top.Guard; if (guard != null) guard(next); else next(); }
        public void Back() { var next = nav.Top.Back ?? CloseModal; Leave(next); }
        /** 兼容 CloseModal 语义：销毁视觉之后触发并清空回调（时序与旧实现一致）。 */
        public void CloseModal()
        {
            var closed = Nav.Reset();
            if (confirmation) { Destroy(confirmation.gameObject); confirmation = null; }
            if (modal) { modal.gameObject.SetActive(false); Destroy(modal.gameObject); }
            modal = null; modalOpenedAt = -1;
            closed?.Invoke();
        }
        /** 确认框（P1）：压入确认层承载回退与守卫，取代旧实现手工保存/恢复 previous/previousGuard。
         *  取消 = 只弹确认层（下层回退与守卫原样保留）；确认 = 弹层后清下层守卫再执行（与旧口径逐条对齐）。 */
        public void Confirm(string title, string message, Action confirmed, string accept = "确认", Action<Action> save = null)
        {
            if(confirmation)return;
            var overlay = Box(Root, "Confirmation", 0, 0, ArenaLayout.CanvasW, ArenaLayout.CanvasH, new Color(0,.01f,.02f,.88f));
            confirmation=overlay;
            overlay.SetAsLastSibling(); overlay.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            var panel = Box(overlay,"Confirmation panel",360,270,880,330,PanelColor);
            Label(panel,title,28,26,820,40,26); Label(panel,message,28,90,820,96,20);
            var frame = Nav.Push("confirm", true);
            Action cancel = () => { if(overlay) Destroy(overlay.gameObject); confirmation=null; Nav.Pop(); };
            frame.Back = cancel;
            Button(panel,"取消",28,235,220,cancel);
            Button(panel,accept,save == null ? 620 : 325,235,230,()=>{cancel(); Nav.Top.Guard = null; confirmed();},save == null);
            if(save != null) Button(panel,"保存并返回",620,235,230,()=>save(()=>{cancel(); Nav.Top.Guard = null; confirmed();}),true);
        }
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
            answerDesk.Fit(this);
        }
    }
}
