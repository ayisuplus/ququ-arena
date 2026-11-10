using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace QuQu
{
    public class ArenaConnection : MonoBehaviour
    {
        public string BaseUrl = "http://127.0.0.1:8181";
        public string Battle { get; private set; }
        public string LastError { get; private set; }
        public Action<Frame> OnFrame;
        public Action<string> OnStatus;
        public Action<CompetitionPacket, bool> OnCompetition;
        public string Competition { get; private set; }
        Coroutine poll;
        long cursor;
        int epoch;
        public bool Launching { get; private set; }
        public bool SetEndpoint(string value)
        {
            if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) || uri.Scheme != "http" || !uri.IsLoopback || !string.IsNullOrEmpty(uri.UserInfo) || uri.AbsolutePath != "/")
            { OnStatus?.Invoke("请输入本机后端地址，例如 http://127.0.0.1:8181"); return false; }
            Disconnect(); BaseUrl = uri.GetLeftPart(UriPartial.Authority); return true;
        }
        public IEnumerator Request<T>(string path, object body, Action<T> done, Action<string> failed = null)
        {
            using (var req = new UnityWebRequest(BaseUrl + path, body == null ? "GET" : "POST"))
            {
                req.downloadHandler = new DownloadHandlerBuffer(); req.timeout = 20;
                if (body != null) { req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonUtility.ToJson(body))); req.SetRequestHeader("Content-Type", "application/json"); }
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    var error = "连接失败，请检查后端（" + req.responseCode + "）";
                    try { var r = JsonUtility.FromJson<Reply>(req.downloadHandler.text); if (!string.IsNullOrEmpty(r?.error)) error = r.error; } catch (Exception) { }
                    LastError = error; failed?.Invoke(error); yield break;
                }
                T value;
                try { value = JsonUtility.FromJson<T>(req.downloadHandler.text); }
                catch (Exception) { failed?.Invoke("后端返回了无法识别的数据"); yield break; }
                done(value);
            }
        }
        public void Launch(Launch options)
        {
            if (Launching) return;
            if (string.IsNullOrEmpty(options.requestId)) options.requestId = Guid.NewGuid().ToString();
            StartCoroutine(CreateCompetition(options));
        }
        IEnumerator CreateCompetition(Launch options)
        {
            Launching = true; int generation = epoch;
            yield return Request<Reply>("/api/game/competitions", options, r => { if (generation == epoch) WatchCompetition(r.id, true); }, e => OnStatus?.Invoke(e));
            Launching = false;
        }
        public void WatchCompetition(string id, bool fresh = false)
        {
            Disconnect(); Competition = id; cursor = 0; poll = StartCoroutine(PollCompetition(epoch, !fresh));
        }
        IEnumerator PollCompetition(int generation, bool reset)
        {
            while (generation == epoch && !string.IsNullOrEmpty(Competition))
            {
                bool ended = false;
                yield return Request<CompetitionPacket>("/api/game/competitions/" + Competition + "?after=" + cursor, null, p =>
                {
                    if (generation != epoch || p.id != Competition) return;
                    OnCompetition?.Invoke(p, reset); reset = false; cursor = p.seq; LastError = null;
                    ended = p.snapshot.status == "completed" || p.snapshot.status == "stopped" || p.snapshot.status == "waiting";
                }, e => { if (generation == epoch) { reset = true; OnStatus?.Invoke(e + "；重连后同步当前状态"); } });
                if (ended) { poll = null; yield break; }
                yield return new WaitForSecondsRealtime(.3f);
            }
        }
        public void Continue(string id, string duelId = null, string arena = null)
        {
            StartCoroutine(Request<Reply>("/api/game/competitions/" + id + "/continue", new ContinueCompetition { duelId = duelId, arena = arena }, _ => WatchCompetition(id), e => OnStatus?.Invoke(e)));
        }
        public void Replay(string file) { if (!Launching) StartCoroutine(Create("/api/game/replays", new ReplayRequest { file = file })); }
        IEnumerator Create(string route, object options)
        {
            Launching = true; var generation = epoch;
            yield return Request<Reply>(route, options, r => { if (generation == epoch) Watch(r.battle); }, e => OnStatus?.Invoke(e));
            Launching = false;
        }
        public void Watch(string battle)
        {
            Disconnect(); Battle = battle; cursor = 0; poll = StartCoroutine(Poll(epoch));
            OnStatus?.Invoke("已连接赛场 " + battle);
        }
        IEnumerator Poll(int generation)
        {
            while (generation == epoch && !string.IsNullOrEmpty(Battle))
            {
                bool ended = false;
                yield return Request<Frames>("/api/game/battles/" + Battle + "?after=" + cursor, null, packet =>
                {
                    if (generation != epoch || packet.battle != Battle) return;
                    foreach (var frame in packet.frames ?? Array.Empty<Frame>())
                    {
                        if (frame.seq <= cursor) continue;
                        OnFrame?.Invoke(frame);
                        if (frame.type == "done" || frame.type == "error") ended = true;
                    }
                    cursor = Math.Max(cursor, packet.seq); LastError = null;
                }, e => { if (generation == epoch) { ended = e.Contains("会话已过期"); OnStatus?.Invoke(e + (ended ? "" : "；正在重连同一场比赛")); } });
                if (ended) { poll = null; yield break; }
                yield return new WaitForSecondsRealtime(0.35f);
            }
        }
        public void Control(string action)
        {
            if (!string.IsNullOrEmpty(Competition)) { StartCoroutine(Request<Reply>("/api/game/competitions/" + Competition + "/control", new ControlRequest { action = action }, _ => { }, e => OnStatus?.Invoke(e))); return; }
            if (!string.IsNullOrEmpty(Battle)) StartCoroutine(Request<Reply>("/api/battles/" + Battle + "/control", new ControlRequest { action = action }, _ => { }, e => OnStatus?.Invoke(e)));
        }
        public void Disconnect() { epoch++; if (poll != null) StopCoroutine(poll); poll = null; Battle = null; Competition = null; }
        void OnDestroy() { Disconnect(); }
    }
}
