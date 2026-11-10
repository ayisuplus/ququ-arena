using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using Newtonsoft.Json.Linq;

namespace QuQu
{
    public class ArenaConnection : MonoBehaviour, IEndpointBinding, IJsonTransport, ICompetitionLink
    {
        public string BaseUrl { get; private set; } = "http://127.0.0.1:8181";
        public string Battle { get; private set; }
        public string LastError { get; private set; }
        public Action<Frame> OnFrame;
        public Action<string> OnStatus;
        public Action<CompetitionPacket, bool> OnCompetition { get; set; } // P3：接口要求属性；字段→自动属性，调用点不变
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
                req.downloadHandler = new DownloadHandlerBuffer(); req.timeout = path.StartsWith("/api/game/agents") || path == "/api/game/competitions" ? 65 : 20;
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
        public IEnumerator Json(string path, string method, JToken body, Action<JToken> done, Action<string> failed = null)
        {
            using (var req = new UnityWebRequest(BaseUrl + path, method))
            {
                req.downloadHandler = new DownloadHandlerBuffer(); req.timeout = path.Contains("/check") || path.Contains("/agents") ? 70 : 30;
                if (body != null) { req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString(Newtonsoft.Json.Formatting.None))); req.SetRequestHeader("Content-Type", "application/json"); }
                yield return req.SendWebRequest();
                JToken value = null; try { value = JToken.Parse(req.downloadHandler.text); } catch { }
                if (req.result != UnityWebRequest.Result.Success || value == null)
                { failed?.Invoke((string)value?["error"] ?? "连接失败（" + req.responseCode + "），请重试"); yield break; }
                done(value);
            }
        }
        public IEnumerator Download(string path, Action<byte[]> done, Action<string> failed)
        {
            using(var request=UnityWebRequest.Get(BaseUrl+path)) {
                request.timeout=60;yield return request.SendWebRequest();
                if(request.result==UnityWebRequest.Result.Success)done(request.downloadHandler.data);
                else failed("下载失败（"+request.responseCode+"）");
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
        /// <summary>唯一出口：completed / stopped。waiting 是可续赛状态，后端靠客户端轮询触发自动续赛。</summary>
        public static bool IsTerminalStatus(string status) => status == "completed" || status == "stopped";
        /// <summary>赛事轮询轮数（验证用：等待态下必须继续增长）</summary>
        public int PollRounds { get; private set; }
        IEnumerator PollCompetition(int generation, bool reset)
        {
            while (generation == epoch && !string.IsNullOrEmpty(Competition))
            {
                bool ended = false, terminal = false;
                PollRounds++;
                yield return Request<CompetitionPacket>("/api/game/competitions/" + Competition + "?after=" + cursor, null, p =>
                {
                    if (generation != epoch || p.id != Competition) return;
                    OnCompetition?.Invoke(p, reset); reset = false; cursor = p.seq; LastError = null;
                    terminal = IsTerminalStatus(p.snapshot.status);
                    // 解说开启时继续同步：收官点评在赛事结束之后才生成
                    ended = terminal && (p.snapshot.commentary == null || !p.snapshot.commentary.enabled);
                }, e => { if (generation == epoch) { reset = true; OnStatus?.Invoke(e + "；重连后同步当前状态"); } });
                if (ended) { poll = null; yield break; }
                yield return new WaitForSecondsRealtime(terminal ? 1f : .3f);
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
        public void Commentary(string agentId, bool enabled, Action done = null, Action<string> failed = null)
        {
            if (string.IsNullOrEmpty(Competition)) { const string message = "请先开赛或打开一场赛事"; OnStatus?.Invoke(message); failed?.Invoke(message); return; }
            string competition = Competition;
            StartCoroutine(Request<Reply>("/api/game/competitions/" + competition + "/commentary", new CommentaryRequest { agentId = agentId, enabled = enabled }, _ => { if (Competition == competition) EnsurePolling(); done?.Invoke(); }, e => { OnStatus?.Invoke(e); failed?.Invoke(e); }));
        }
        public void AskCommentator(string question)
        {
            if (string.IsNullOrEmpty(Competition)) return;
            StartCoroutine(Request<Reply>("/api/game/competitions/" + Competition + "/question", new QuestionRequest { question = question }, _ => EnsurePolling(), e => OnStatus?.Invoke(e)));
        }
        /** 赛事结束后同步会停；开启解说或追问后从当前游标续上，不重放已呈现的内容 */
        void EnsurePolling() { if (poll == null && !string.IsNullOrEmpty(Competition)) poll = StartCoroutine(PollCompetition(epoch, false)); }
        public void Disconnect() { epoch++; if (poll != null) StopCoroutine(poll); poll = null; Battle = null; Competition = null; }
        void OnDestroy() { Disconnect(); }
    }
}
