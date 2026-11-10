using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace QuQu
{
    // The local fixture exercises real HTTP, Pi and a child process, without personal settings or paid calls.
    [ArenaHarness("--arena-control-room-validation", false)]
    public static class ArenaControlRoomCheck
    {
        [Serializable] class Result { public bool passed, pi, llm, command, settings, createDelete, reconnect, disabled, fontStack; public string error; public int screenshots; }
        static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
        static IEnumerator Until(Func<bool> ready, float timeout = 35)
        {
            float deadline = Time.realtimeSinceStartup + timeout;
            while (!ready()) { Require(Time.realtimeSinceStartup < deadline, "UI/HTTP timed out"); yield return null; }
            yield return null;
        }
        static Button Button(Transform root, string caption) => root.GetComponentsInChildren<Button>().FirstOrDefault(b => b.gameObject.activeInHierarchy && b.GetComponentInChildren<TMP_Text>()?.text == caption);
        static void Click(Transform root, string caption)
        {
            var button = Button(root, caption); Require(button && button.interactable, "Unavailable button: " + caption); button.onClick.Invoke();
        }
        static IEnumerator Photo(string dir, string name, Result result)
        {
            yield return new WaitForSecondsRealtime(.3f); yield return new WaitForEndOfFrame();
            ArenaSpectatorCapture.Save(Path.Combine(dir, name + ".png")); result.screenshots++;
        }
        public static IEnumerator Run(ArenaGame g, string output = null)
        {
            var args = Environment.GetCommandLineArgs(); int at = Array.IndexOf(args, "--arena-qa-output");
            string dir = output ?? args[at + 1]; Directory.CreateDirectory(dir);
            var result = new Result(); var stack = new Stack<IEnumerator>(); stack.Push(Check(g, dir, result));
            while (stack.Count > 0)
            {
                bool more; object next = null;
                try { more = stack.Peek().MoveNext(); if (more) next = stack.Peek().Current; }
                catch (Exception e) { result.error = e.ToString(); Debug.LogException(e); break; }
                if (!more) { (stack.Pop() as IDisposable)?.Dispose(); continue; }
                if (next is IEnumerator child) stack.Push(child); else yield return next;
            }
            result.passed = string.IsNullOrEmpty(result.error);
            File.WriteAllText(Path.Combine(dir, "control-room.json"), JsonUtility.ToJson(result, true));
            if (!Application.isEditor) Application.Quit(result.passed ? 0 : 1);
        }
        static IEnumerator Check(ArenaGame g, string dir, Result r)
        {
            g.Connection.SetEndpoint("http://127.0.0.1:8197"); g.ShowHome();
            r.fontStack = g.UI.Font.name == "ObservatoryLatin" && g.UI.Font.atlasPopulationMode == AtlasPopulationMode.Static
                && g.UI.Font.fallbackFontAssetTable.Any(f => f.name == "ObservatoryCJK");
            Require(r.fontStack, "New packaged font stack not loaded");
            yield return Photo(dir, "home", r); g.UI.CloseModal();
            Require(g.Hud.gameObject.activeSelf && !g.Stage.Flight.Active, "Home did not restore HUD/camera");
            g.Commentary.Open(); Click(g.Commentary.transform, "Pi 解说  /  来源与配置 →");
            yield return Until(() => g.UI.Modal && Button(g.UI.Modal, "+ Pi 配置"));
            yield return Photo(dir, "sources", r);
            Click(g.UI.Modal.Find("Panel/Scroll view/Viewport/Content/Source pi"), "配置");
            var fields = g.UI.Modal.GetComponentsInChildren<TMP_InputField>();
            Require(fields.Length == 2, "Pi name/prompt fields missing");
            fields[0].text = "Pi · 战术解说"; fields[1].text = "依据公开评分，分析关键分歧。\n中文与 English 原样保留；代码 <tag> && value 不解析成富文本。";
            yield return Photo(dir, "pi-config", r); Click(g.UI.Modal, "保存并使用");
            yield return Until(() => g.UI.Modal && Button(g.UI.Modal, "+ Pi 配置"));
            CommentatorCatalog catalog = null;
            yield return g.Connection.Request<CommentatorCatalog>("/api/game/commentators", null, v => catalog = v);
            Require(catalog.profiles.Single(p => p.id == "pi").prompt.Contains("<tag>"), "Pi prompt did not persist");
            r.settings = true;
            Click(g.UI.Modal.Find("Panel/Scroll view/Viewport/Content/Source pi"), "使用");
            var entrants = ArenaGame.DemoIds.Take(2).ToArray();
            g.Connection.Launch(new Launch { arena = "tongjia-pinyin", models = entrants, draw = entrants, demo = true, limit = 1 });
            yield return Until(() => !string.IsNullOrEmpty(g.Connection.Competition) && g.Duel.Snapshot != null);
            g.Commentary.Open(); Click(g.Commentary.transform, "开启解说");
            yield return Until(() => g.Duel.Snapshot.commentary?.enabled == true);
            g.Commentary.GetComponentInChildren<TMP_InputField>().text = "当前公开信息有哪些？"; Click(g.Commentary.transform, "追问");
            yield return Until(() => g.Duel.Snapshot.commentary.entries?.Any(e => e.agentId == "pi" && e.status == "done" && e.text.Contains("本地接口验证")) == true);
            r.pi = true; yield return Photo(dir, "pi-commentary", r);
            Click(g.Commentary.transform, "Pi · 战术解说  /  来源与配置 →");
            yield return Until(() => g.UI.Modal && Button(g.UI.Modal, "+ Pi 配置"));
            Click(g.UI.Modal, "+ Pi 配置"); fields = g.UI.Modal.GetComponentsInChildren<TMP_InputField>();
            fields[0].text = "临时 Pi 配置验证"; fields[1].text = "模型选择往返不能丢失这段提示词。";
            Click(g.UI.Modal, "选择模型 →");
            var modelButton = g.UI.Modal.GetComponentsInChildren<Button>().Single(b => b.GetComponentInChildren<TMP_Text>().text.Contains(catalog.profiles.Single(p => p.id == "pi").modelId));
            modelButton.onClick.Invoke();
            Require(g.UI.Modal.GetComponentsInChildren<TMP_InputField>()[1].text.Contains("不能丢失"), "Model picker discarded draft prompt");
            Click(g.UI.Modal, "保存并使用");
            yield return Until(() => g.Duel.Snapshot.commentary.agentId.StartsWith("commentator:") && Button(g.UI.Modal, "+ Pi 配置"));
            string created = g.Duel.Snapshot.commentary.agentId;
            Click(g.UI.Modal.Find("Panel/Scroll view/Viewport/Content/Source " + created), "配置"); Click(g.UI.Modal, "删除配置");
            yield return Until(() => !g.Duel.Snapshot.commentary.enabled && Button(g.UI.Modal, "+ Pi 配置"));
            yield return g.Connection.Request<CommentatorCatalog>("/api/game/commentators", null, v => catalog = v);
            Require(!catalog.profiles.Any(p => p.id == created), "Profile deletion did not persist"); r.createDelete = true;
            Click(g.UI.Modal.Find("Panel/Scroll view/Viewport/Content/Source pi"), "使用");
            Click(g.Commentary.transform, "开启解说"); yield return Until(() => g.Duel.Snapshot.commentary.enabled);
            string competition = g.Connection.Competition;
            g.Connection.WatchCompetition(competition); yield return Until(() => g.Duel.Snapshot.commentary?.entries?.Any(e => e.status == "done") == true);
            r.reconnect = true;
            Click(g.Commentary.transform, "Pi · 战术解说  /  来源与配置 →");
            yield return Until(() => g.UI.Modal && Button(g.UI.Modal, "+ 本地 Agent"));
            var directRow = g.UI.Modal.GetComponentsInChildren<RectTransform>().First(t => t.name.StartsWith("Source llm:"));
            Click(directRow, "使用");
            yield return Until(() => g.Duel.Snapshot.commentary.agentId.StartsWith("llm:"));
            g.Commentary.GetComponentInChildren<TMP_InputField>().text = "直接 LLM 追问"; Click(g.Commentary.transform, "追问");
            yield return Until(() => g.Duel.Snapshot.commentary.entries.Any(e => e.agentId.StartsWith("llm:") && e.status == "done"));
            r.llm = true;
            Click(g.Commentary.transform, "本地验证模型 · Mixed 中文 / English  /  来源与配置 →");
            yield return Until(() => g.UI.Modal && Button(g.UI.Modal, "+ 本地 Agent"));
            yield return g.Connection.Request<CommentatorCatalog>("/api/game/commentators", null, v => catalog = v);
            var local = catalog.profiles.First(p => p.kind == "command");
            Click(g.UI.Modal.Find("Panel/Scroll view/Viewport/Content/Source " + local.id), "配置");
            yield return Photo(dir, "local-agent-config", r);
            Click(g.UI.Modal, "协议说明"); yield return Photo(dir, "agent-protocol", r); Click(g.UI.Modal, "← 返回配置");
            Click(g.UI.Modal, "保存并使用");
            yield return Until(() => g.Duel.Snapshot.commentary.agentId == local.id && Button(g.UI.Modal, "+ 本地 Agent"));
            g.UI.CloseModal(); g.Commentary.GetComponentInChildren<TMP_InputField>().text = "本地程序解说验证"; Click(g.Commentary.transform, "追问");
            yield return Until(() => g.Duel.Snapshot.commentary.entries.Any(e => e.agentId == local.id && e.status == "done"));
            r.command = true; Click(g.Commentary.transform, "关闭解说");
            yield return Until(() => !g.Duel.Snapshot.commentary.enabled); r.disabled = true; g.Commentary.Close();
            g.Connection.Disconnect(); g.UI.CloseModal();
            var packet = ArenaSpectatorCapture.Packet(); var ids = packet.snapshot.duels[0].players;
            g.Preferences.Avatar(ids[0],0).presetId = "chatgpt"; g.Preferences.Avatar(ids[1],1).presetId = "claude";
            ArenaSpectatorCapture.Feed(g, packet, 6); yield return new WaitForSecondsRealtime(2);
            yield return Photo(dir, "spectator", r);
            g.Reader.Open(); yield return Photo(dir, "reader", r); g.Reader.Close();
            g.ShowSettings(2); yield return Photo(dir, "appearance-settings", r); g.UI.CloseModal();
            foreach (float scale in new[] { .8f, 1.2f })
            {
                g.Preferences.uiScale = scale; g.ApplyPreferences(); g.Commentary.Open();
                yield return Photo(dir, "text-scale-" + scale.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture), r); g.Commentary.Close();
            }
            g.Preferences.uiScale = 1; g.ApplyPreferences();
        }
    }
}
