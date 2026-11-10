using System.Linq;
using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
namespace QuQu
{
    /// <summary>
    /// 解说席抽屉：选择 Pi、LLM 或本地 Agent，查看点评、追问。
    /// 解说由后端独立会话生成，只读公开答卷与赛况，不影响答题、评分和胜负。
    /// </summary>
    public class ArenaCommentaryDrawer : MonoBehaviour
    {
        IStationContext ctx; // P3-D：解说席只认周边组件切片，不认门面类型
        RectTransform panel, content;
        TMP_Text status, body, toggleLabel, sourceLabel;
        TMP_InputField question;
        ScrollRect scroll;
        string agent = "pi", rendered, error;
        bool changing;
        ArenaCommentarySettings settings;
        public bool IsOpen => panel.gameObject.activeSelf;
        /** P3：打开序号（与界面层、阅读抽屉同一序列），Esc 按「最后打开的先收」裁决。 */
        public int OpenedAt { get; private set; }
        public void Create(IStationContext owner)
        {
            ctx = owner; transform.SetParent(owner.UI.Root, false); var root = (RectTransform)transform; root.anchorMin = root.anchorMax = new Vector2(0, 1); root.pivot = new Vector2(0, 1); root.sizeDelta = new Vector2(1600, 900);
            settings = new ArenaCommentarySettings(owner, Choose);
            var ui = ctx.UI; panel = ui.Box(root, "Commentary drawer", 24, 98, 584, 732, new Color(.024f, .038f, .05f, .97f)); panel.GetComponent<Image>().raycastTarget = true;
            ui.Eyebrow(panel, "LIVE COMMENTARY   /   解说席", 24, 17, 440);
            ui.Label(panel, "场边观察", 24, 44, 350, 42, 28);
            ui.Button(panel, "关闭", 468, 31, 92, Close);
            sourceLabel = ui.Button(panel, "Pi 解说  /  来源与配置 →", 24, 101, 356, settings.Open).GetComponentInChildren<TMP_Text>();
            toggleLabel = ui.Button(panel, "开启解说", 392, 101, 168, Toggle, true).GetComponentInChildren<TMP_Text>();
            status = ui.Label(panel, "", 24, 157, 536, 48, 15, new Color(.67f,.79f,.84f));
            ui.Box(panel, "Divider", 24, 213, 536, 1, new Color(.4f,.53f,.59f,.35f));
            content = ui.Scroll(panel, 24, 232, 536, 384); scroll = content.GetComponentInParent<ScrollRect>();
            body = ui.Label(content, "", 0, 0, 516, 384, 19);
            ui.Eyebrow(panel, "ASK THE COMMENTATOR", 24, 640, 536);
            question = ui.Input(panel, "", 24, 674, 424, "这次交锋的关键在哪里？");
            ui.Button(panel, "追问", 460, 674, 100, Ask);
            panel.gameObject.SetActive(false);
        }
        public void Open() { OpenedAt = ctx.UI.NextSurfaceSeq(); if (State?.enabled == true && !changing) agent = State.agentId; panel.gameObject.SetActive(true); transform.SetAsLastSibling(); rendered = null; settings.RefreshNames(() => rendered = null); }
        public void Close() { panel.gameObject.SetActive(false); }
        public void ShowSettings() { Close(); settings.Open(); }
        CommentaryState State => ctx.Duel?.Snapshot?.commentary;
        void Choose(string id, bool switchEnabled)
        {
            if (changing) { ctx.Notify("正在切换，请稍候"); return; }
            agent = id; error = null;
            if (switchEnabled && State != null && State.enabled) Configure(true);
            rendered = null;
        }
        void Toggle() { if (!changing) Configure(!(State?.enabled ?? false)); }
        void Configure(bool enabled)
        {
            changing = true; error = null; rendered = null;
            ctx.Link.Commentary(agent, enabled, () => { changing = false; rendered = null; }, message => { changing = false; error = message; rendered = null; });
        }
        void Ask()
        {
            var text = question.text.Trim();
            if (text.Length == 0) return;
            if (!(State?.enabled ?? false)) { ctx.Notify("请先开启解说席"); return; }
            ctx.Link.AskCommentator(text); question.text = "";
        }
        void LateUpdate()
        {
            if (!IsOpen) return;
            var image = panel.GetComponent<Image>(); var c = image.color; c.a = ctx.Preferences.opacity; image.color = c;
            var state = State;
            var entries = state?.entries ?? System.Array.Empty<CommentaryItem>();
            // 文本变化时才重排版：流式解说每次轮询都会带来新字符
            var signature = (state?.enabled ?? false) + "|" + agent + "|" + state?.error + "|" + error + "|" + changing + "|" + string.Join(",", entries.Select(e => e.id + e.status + e.text));
            if (signature == rendered) return;
            rendered = signature;
            bool enabled = state?.enabled ?? false;
            toggleLabel.text = changing ? "正在连接…" : enabled ? "关闭解说" : "开启解说";
            sourceLabel.text = settings.Name(agent) + "  /  来源与配置 →";
            status.text = string.IsNullOrEmpty(ctx.Link.Competition) ? "开赛或打开一场赛事后可开启解说"
                : !string.IsNullOrEmpty(error ?? state?.error) ? "解说暂停：" + (error ?? state.error)
                : enabled ? "正在观察赛况 · " + settings.Name(state.agentId) : "选择来源并开启解说 · 默认使用 Pi";
            var text = new StringBuilder();
            foreach (var e in entries)
            {
                if (text.Length > 0) text.Append("\n\n");
                text.Append(settings.Name(e.agentId)).Append(e.status == "working" ? "  ·  正在生成\n" : "\n");
                if (!string.IsNullOrEmpty(e.question)) text.Append("追问：").Append(e.question).Append('\n');
                text.Append(string.IsNullOrEmpty(e.text) ? "思考中…" : e.text);
                if (e.status == "working" && !string.IsNullOrEmpty(e.text)) text.Append(" …");
                else if (e.status == "error") text.Append("（中断）");
            }
            bool atBottom = scroll.verticalNormalizedPosition < .03f || string.IsNullOrEmpty(body.text);
            body.text = text.Length > 0 ? text.ToString() : enabled ? "等待本轮新进展…" : "让解说陪你看比赛。\n\n点评思路分歧、关键失误与真实赛果；也可以随时追问。\n\n点击上方「来源与配置」，为 Pi 选择模型，或添加自己的 Agent。";
            float h = Mathf.Max(384, body.GetPreferredValues(body.text, 516, 0).y + 24);
            body.rectTransform.sizeDelta = new Vector2(516, h); content.sizeDelta = new Vector2(526, h);
            if (atBottom) scroll.verticalNormalizedPosition = 0;
        }
    }
}
