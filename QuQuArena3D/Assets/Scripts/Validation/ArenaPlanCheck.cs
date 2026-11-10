using System;
using System.Collections;
using System.IO;
using System.Linq;
using TMPro;
using UnityEngine;
namespace QuQu
{
    /// <summary>
    /// 施工计划第五阶段验收（--arena-plan-validation）：种子抽签预览、对决结束的"分出高下"提示、解说席抽屉。
    /// 只用验证后端与内置模拟选手；解说条目在本地注入，不调用 Codex / Claude。
    /// </summary>
    [ArenaHarness("--arena-plan-validation", false)]
    public static class ArenaPlanCheck
    {
        [Serializable] public class Result { public bool passed, draw, decided, commentary, network; public string drawText, decidedText, commentaryText, error; public int width, height; }
        public static IEnumerator Run(ArenaGame g)
        {
            var args = Environment.GetCommandLineArgs(); int index = Array.IndexOf(args, "--arena-qa-output");
            string dir = index < 0 ? Path.Combine(Application.persistentDataPath, "PlanValidation") : Path.GetFullPath(args[index + 1]);
            Directory.CreateDirectory(dir);
            var result = new Result(); var steps = Check(g, dir, result);
            while (true) { bool more; object next; try { more = steps.MoveNext(); next = more ? steps.Current : null; } catch (Exception e) { result.error = e.ToString(); Debug.LogException(e); break; } if (!more) { result.passed = true; break; } yield return next; }
            (steps as IDisposable)?.Dispose(); File.WriteAllText(Path.Combine(dir, "runtime.json"), JsonUtility.ToJson(result, true));
            if (!Application.isEditor) Application.Quit(result.passed ? 0 : 1);
        }
        static IEnumerator Check(ArenaGame g, string dir, Result result)
        {
            yield return new WaitForSecondsRealtime(1); g.UI.CloseModal(); Screen.SetResolution(1600, 900, FullScreenMode.Windowed);
            yield return new WaitForSecondsRealtime(.8f);
            result.width = Screen.width; result.height = Screen.height;

            // 1. 抽签：走真实 HTTP 接口，后端按评分排种子并给出首轮预期胜率
            var models = new[] { "mock:xueba-o9", "mock:huatou-72b", "mock:jianglv-7b", "mock:laoshi-k2" };
            DrawPreview draw = null; string failure = null;
            yield return g.Connection.Request<DrawPreview>("/api/game/draw", new DrawRequest { models = models, mode = "seeded" }, d => draw = d, e => failure = e);
            Require(draw != null, "抽签接口失败：" + failure);
            Require(draw.draw.Length == 4 && draw.draw.OrderBy(x => x).SequenceEqual(models.OrderBy(x => x)) && draw.pairs.Length == 2 && draw.pairs.All(p => p.players.Length == 2 && p.probability > 0 && p.probability < 1), "抽签结果不完整");
            var bank = new ArenaInfo { id = "tongjia-pinyin", title = "拼音还原", count = 85, mode = "qa" };
            g.Duel.Preview(new Launch { arena = bank.id, models = models, draw = draw.draw, limit = 5, requestId = Guid.NewGuid().ToString() }, bank, 5, draw);
            yield return Photo(dir, "draw-preview");
            result.drawText = string.Join(" | ", g.UI.Modal.GetComponentsInChildren<TMP_Text>().Select(t => t.text).Where(t => t.Contains("预期") || t.Contains("种子")));
            result.draw = result.drawText.Contains("预期") && result.drawText.Contains("种子");
            Require(result.draw, "抽签预览缺少预期胜率或种子说明");
            g.UI.CloseModal();

            // 2. 对决结束提示：只陈述几题真正分出高下，不把一场胜负说成谁更强
            var packet = ArenaSpectatorCapture.Packet();
            result.decidedText = ArenaDuelController.Decided(packet.snapshot.duels[0]);
            result.decided = result.decidedText.Contains("题中") && result.decidedText.Contains("分出高下");
            Require(result.decided, "缺少分出高下提示：" + result.decidedText);

            // 3. 解说席：先用真实 HTTP 跑一场模拟体验赛拿到赛事，再注入解说条目验证抽屉渲染
            g.Connection.Launch(new Launch { arena = "tongjia-pinyin", models = models.Take(2).ToArray(), draw = models.Take(2).ToArray(), limit = 1, demo = true });
            float deadline = Time.unscaledTime + 40;
            while (Time.unscaledTime < deadline) { yield return new WaitForSecondsRealtime(.2f); if (g.Duel.Snapshot?.id == g.Connection.Competition && new[] { "waiting", "completed" }.Contains(g.Duel.Snapshot.status)) break; }
            result.network = g.Duel.Snapshot?.id == g.Connection.Competition && g.Duel.Snapshot?.status == "completed";
            Require(result.network, "模拟体验赛未完成：" + g.Connection.LastError);
            yield return new WaitForSecondsRealtime(1.5f);
            g.Duel.Snapshot.commentary = new CommentaryState
            {
                enabled = true, agentId = "claude",
                entries = new[]
                {
                    new CommentaryItem { id = "a", agentId = "claude", status = "done", mode = "auto", text = "第 1 题两位选手都给出了完整句子，差别在于“绩”与“迹”的通假判断：学霸-o9 按上下文选对，滑头-72B 被常见写法带偏。" },
                    new CommentaryItem { id = "b", agentId = "claude", status = "done", mode = "question", question = "为什么滑头-72B 输了？", text = "它在唯一分出高下的那题上选了字面更常见的写法；其余题两人得分相同。一场胜负只说明这几题的表现，不代表整体能力。" },
                    new CommentaryItem { id = "c", agentId = "claude", status = "working", mode = "auto", text = "收官分析：" },
                },
            };
            g.Commentary.Open();
            yield return Photo(dir, "commentary");
            result.commentaryText = string.Join(" | ", g.Commentary.GetComponentsInChildren<TMP_Text>().Select(t => t.text));
            result.commentary = g.Commentary.IsOpen && result.commentaryText.Contains("关闭解说") && result.commentaryText.Contains("追问：为什么滑头-72B 输了？") && result.commentaryText.Contains("解说中");
            Require(result.commentary, "解说席抽屉渲染不完整");
            g.Commentary.Close();
            yield return Photo(dir, "after-close");
        }
        static IEnumerator Photo(string dir, string name) { yield return new WaitForSecondsRealtime(.5f); yield return new WaitForEndOfFrame(); ArenaSpectatorCapture.Save(Path.Combine(dir, name + ".png")); }
        static void Require(bool value, string message) { if (!value) throw new Exception(message); }
    }
}
