using System;
using System.Linq;
using TMPro;
using UnityEngine;

namespace QuQu
{
    [Serializable] public class CommentatorProfile
    {
        public string id, name, kind = "pi", modelId = "", prompt = "", command = "", action;
        public string[] args = Array.Empty<string>();
    }
    [Serializable] public class CommentatorCatalog { public CommentatorProfile[] profiles; public string selected; }

    public class ArenaCommentarySettings
    {
        readonly System.Collections.Generic.Dictionary<CommentatorProfile,string> baselines = new System.Collections.Generic.Dictionary<CommentatorProfile,string>();
        readonly IStationContext ctx; // P3-D：只认周边组件切片（UI/Workbench/Link/Run），不认门面类型
        readonly Action<string, bool> select;
        CommentatorProfile[] profiles = Array.Empty<CommentatorProfile>();
        ModelInfo[] models = Array.Empty<ModelInfo>();
        int requestGeneration;
        public ArenaCommentarySettings(IStationContext owner, Action<string, bool> select) { ctx = owner; this.select = select; }
        public string Name(string id) => profiles.FirstOrDefault(p => p.id == id)?.name
            ?? (id != null && id.StartsWith("llm:") ? models.FirstOrDefault(m => m.id == id.Substring(4))?.name ?? id.Substring(4)
            : id == "pi" ? "Pi 解说" : id == "claude" ? "Claude" : id == "codex" ? "Codex" : id);
        public void RefreshNames(Action changed)
        {
            ctx.Run(ctx.Link.Request<CommentatorCatalog>("/api/game/commentators", null, c => { profiles = c.profiles ?? Array.Empty<CommentatorProfile>(); changed(); }));
            ctx.Run(ctx.Link.Request<ModelCatalog>("/api/models", null, c => { models = (c.models ?? Array.Empty<ModelInfo>()).Where(m => !m.id.StartsWith("agent:") && !m.hidden).ToArray(); changed(); }));
        }
        public void Open()
        {
            int generation = ++requestGeneration;
            var panel = ctx.UI.OpenModal("解说来源");
            var message = ctx.UI.Label(panel, "正在读取本机配置…", 28, 100, 980, 40);
            ctx.Run(ctx.Link.Request<CommentatorCatalog>("/api/game/commentators", null, result =>
            {
                if (!panel || generation != requestGeneration) return;
                profiles = result.profiles ?? Array.Empty<CommentatorProfile>();
                ctx.Run(ctx.Link.Request<ModelCatalog>("/api/models", null, catalog =>
                {
                    if (!panel || generation != requestGeneration) return;
                    models = (catalog.models ?? Array.Empty<ModelInfo>()).Where(m => m.source != "agent" && !m.id.StartsWith("agent:") && !m.hidden).ToArray();
                    List();
                }, error => { if (message) message.text = error; }));
            }, error => { if (message) message.text = error; }));
        }
        void List()
        {
            var ui = ctx.UI; var panel = ui.OpenModal("解说来源");
            ui.SetBack(ctx.Workbench.Agents);
            ui.Label(panel, "默认使用 Pi；也可以直接调用 LLM，或接入自己的 Agent。", 28, 91, 980, 32, 18);
            var list = ui.Scroll(panel, 28, 137, 982, 422); float y = 0;
            void Row(string id, string title, string subtitle, Action edit, bool ready = true)
            {
                var row = ui.Box(list, "Source " + id, 0, y, 958, 78, new Color(.052f, .07f, .083f));
                var heading = ui.Label(row, title, 18, 5, 620, 40, 21);
                heading.textWrappingMode = TextWrappingModes.NoWrap; heading.overflowMode = TextOverflowModes.Ellipsis;
                var detail = ui.Label(row, subtitle, 18, 45, 620, 26, 14, new Color(.61f,.72f,.78f));
                detail.textWrappingMode = TextWrappingModes.NoWrap; detail.overflowMode = TextOverflowModes.Ellipsis;
                if (edit != null) ui.Button(row, "配置", 668, 19, 120, edit);
                ui.Button(row, ready ? "使用" : "待配置", 802, 19, 138, () => { select(id, true); ui.CloseModal(); }, ready).interactable = ready;
                y += 90;
            }
            foreach (var p in profiles) Row(p.id, p.name, p.kind == "command" ? "本地 Agent  /  " + p.command
                : "PI AGENT  /  " + (string.IsNullOrEmpty(p.modelId) ? "点击配置，选择模型与解说提示词" : ModelName(p.modelId)), () => Edit(Clone(p)), p.kind == "command" || !string.IsNullOrEmpty(p.modelId));
            ui.Eyebrow(list, "DIRECT LLM   /   已配置的 API 模型", 8, y + 8, 930); y += 48;
            foreach (var m in models) Row("llm:" + m.id, m.name, m.ready ? "直接调用  /  " + m.id : m.message ?? "请先配置 API", null, m.ready);
            ui.Eyebrow(list, "LOCAL CLI   /   兼容现有登录", 8, y + 8, 930); y += 48;
            Row("codex", "Codex", "使用本机 Codex 登录", null); Row("claude", "Claude", "使用本机 Claude 登录", null);
            list.sizeDelta = new Vector2(972, y);
            ui.Button(panel, "+ Pi 配置", 28, 582, 220, () => Edit(new CommentatorProfile { name = "我的 Pi 解说" }), true);
            ui.Button(panel, "+ 本地 Agent", 262, 582, 220, () => Edit(new CommentatorProfile { name = "我的 Agent", kind = "command" }));
            ui.Button(panel, "API 模型设置", 552, 582, 240, () => ctx.Workbench.Models(Open));
            ui.Button(panel, "刷新列表", 806, 582, 204, Open);
            ui.Label(panel, "解说读取公开赛况与答卷，不参与评分。配置仅保存在本机。", 28, 635, 980, 25, 14);
        }
        string ModelName(string id) => models.FirstOrDefault(m => m.id == id)?.name ?? id;
        static CommentatorProfile Clone(CommentatorProfile p) => JsonUtility.FromJson<CommentatorProfile>(JsonUtility.ToJson(p));
        void PickModel(CommentatorProfile draft)
        {
            var ui = ctx.UI; var panel = ui.OpenModal("为 Pi 选择模型");
            ui.SetBack(()=>Edit(draft));
            var search = ui.Input(panel, "", 28, 91, 690, "搜索模型名称或 ID");
            ui.Button(panel, "API 模型设置", 744, 91, 266, () => ctx.Workbench.Models(()=>RefreshNames(()=>PickModel(draft))));
            var list = ui.Scroll(panel, 28, 150, 982, 422);
            void Render(string query)
            {
                foreach (Transform child in list) UnityEngine.Object.Destroy(child.gameObject);
                float y = 0;
                foreach (var m in models.Where(m => (m.name + m.id).IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0))
                {
                    var button = ui.Button(list, m.name + "  /  " + m.id + (m.ready ? "" : "  · 待配置"), 0, y, 958,
                        () => { draft.modelId = m.id; Edit(draft); }, draft.modelId == m.id);
                    button.interactable = m.ready; y += 50;
                }
                list.sizeDelta = new Vector2(972, Mathf.Max(422, y));
            }
            search.onValueChanged.AddListener(Render); Render("");
            ui.Button(panel, "← 返回配置", 28, 602, 220, () => Edit(draft));
        }
        void Edit(CommentatorProfile draft)
        {
            var ui = ctx.UI; bool local = draft.kind == "command";
            var panel = ui.OpenModal(local ? "本地 Agent" : "Pi 解说配置");
            ui.SetBack(List);
            if(!baselines.TryGetValue(draft,out var baseline)){baseline=JsonUtility.ToJson(draft);baselines[draft]=baseline;}
            ui.Eyebrow(panel, "DISPLAY NAME   /   显示名称", 28, 90, 960);
            var name = ui.Input(panel, draft.name, 28, 119, 982); name.characterLimit = 60;
            TMP_InputField command = null, args = null, prompt = null;
            if (local)
            {
                ui.Eyebrow(panel, "EXECUTABLE   /   可执行程序", 28, 176, 950);
                command = ui.Input(panel, draft.command, 28, 204, 808, "例如 C:\\Program Files\\nodejs\\node.exe");
                var commandField = command;
                ui.Button(panel, "浏览…", 850, 204, 160, () => {
                    var path = LocalFilePicker.Pick("选择 Agent 可执行程序", "Executable\0*.exe\0\0"); if (path != null) commandField.text = path;
                });
                ui.Label(panel, "启动参数 · 每行一个，不需要引号；脚本路径作为一个参数", 28, 257, 950, 26, 16);
                args = ui.Multiline(panel, string.Join("\n", draft.args ?? Array.Empty<string>()), 28, 290, 982, 86, "C:\\Agents\\commentator.mjs\n--style\nanalytical", 16384);
            }
            else
            {
                ui.Eyebrow(panel, "LANGUAGE MODEL   /   使用已有 API 配置", 28, 179, 960);
                ui.Button(panel, string.IsNullOrEmpty(draft.modelId) ? "选择模型 →" : ModelName(draft.modelId) + "  →", 28, 210, 982,
                    () => { Read(); PickModel(draft); });
            }
            float promptY = local ? 390 : 278;
            ui.Label(panel, "解说提示词", 28, promptY, 950, 28, 18);
            prompt = ui.Multiline(panel, draft.prompt, 28, promptY + 35, 982, local ? 105 : 218,
                "例如：语气冷静，重点分析代码与推理中的关键差异；回答控制在 150 字。", 12000);
            void Read()
            {
                draft.name = name.text; draft.prompt = prompt.text;
                if (local) { draft.command = command.text.Trim(); draft.args = args.text.Replace("\r", "").Split('\n').Where(a => a.Length > 0).ToArray(); }
            }
            var feedback = ui.Label(panel, local ? "每次点评启动一次程序，使用 JSON Lines 接收赛况并返回文本。" : "Pi 复用现有模型连接；基础规则始终保留公开信息和事实边界。", 28, 545, 982, 45, 15);
            bool saving = false;
            void Save(bool remove, Action done = null)
            {
                if (saving) return; Read(); draft.action = remove ? "delete" : null; saving = true; feedback.text = "正在保存…";
                void Persist() => ctx.Run(ctx.Link.Request<CommentatorCatalog>("/api/game/commentators", draft, result =>
                {
                    saving = false; profiles = result.profiles ?? Array.Empty<CommentatorProfile>();
                    select(remove ? "pi" : result.selected, !remove); if (panel) { if(done!=null)done();else List(); }
                }, error => { saving = false; if (feedback) feedback.text = error; }));
                var current = ctx.Duel?.Snapshot?.commentary;
                if (remove && current?.enabled == true && current.agentId == draft.id)
                    ctx.Link.Commentary(draft.id, false, Persist, error => { saving = false; if (feedback) feedback.text = error; });
                else Persist();
            }
            ui.Button(panel, "保存并使用", 28, 607, 220, () => Save(false), true);
            ui.SetGuard(next=>{Read();if(JsonUtility.ToJson(draft)==baseline)next();else ui.Confirm("还有未保存的配置","保存后返回，或放弃这次修改。",next,"放弃修改",saved=>Save(false,saved));});
            ui.Button(panel, "返回列表", 262, 607, 190, ui.Back);
            if (!string.IsNullOrEmpty(draft.id) && draft.id != "pi") ui.Button(panel, "删除配置", 720, 607, 136, () => Save(true));
            if (local) ui.Button(panel, "协议说明", 870, 607, 140, () => { Read(); Protocol(draft); });
        }
        void Protocol(CommentatorProfile draft)
        {
            var ui = ctx.UI; var panel = ui.OpenModal("本地 Agent 接入协议");
            ui.SetBack(()=>Edit(draft));
            var content = ui.Scroll(panel, 28, 100, 982, 475);
            ui.Label(content,
                "程序通过标准输入接收一行 JSON，随后输入关闭：\n" +
                "{\"version\":1,\"type\":\"request\",\"id\":\"请求ID\",\"prompt\":\"赛况与问题\",\"systemPrompt\":\"解说规则\"}\n\n" +
                "向标准输出写入 JSON Lines，原样携带请求 id：\n" +
                "{\"id\":\"请求ID\",\"type\":\"text\",\"text\":\"完整的当前回复\"}\n" +
                "{\"id\":\"请求ID\",\"type\":\"done\"}\n\n" +
                "流式 text 是累计文本；每条消息独占一行。错误使用 type:error 与 message。\n" +
                "日志写入标准错误。单次点评限时 120 秒；切换来源或关闭解说会终止调用。\n\n" +
                "Node / Python 脚本：可执行程序填写 node.exe / python.exe，脚本绝对路径放在启动参数第一行。",
                0, 0, 946, 620, 18);
            content.sizeDelta = new Vector2(972, 620);
            ui.Button(panel, "← 返回配置", 28, 607, 240, () => Edit(draft));
        }
    }
}
