using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace QuQu
{
    /** Owns only the bundled backend it starts. An explicit external endpoint is never terminated. */
    public class ArenaDesktopRuntime : MonoBehaviour
    {
        public bool Ready { get; private set; }
        public bool Starting { get; private set; }
        public bool Owned => process != null;
        public string Error { get; private set; }
        public string LogPath { get; private set; }
        public string DataDirectory { get; private set; }
        public int ProcessId => process != null && !process.HasExited ? process.Id : 0;
        // P3：只依赖 UI 工具箱（不是门面）、后端端点绑定与两个导航回调。
        ArenaUI ui;
        IEndpointBinding endpoint;
        Action showHome, offlineExperience;
        Process process;
        string token;
        readonly ConcurrentQueue<string> output = new ConcurrentQueue<string>();
        public static string Argument(string value)
        {
            var result = new System.Text.StringBuilder("\""); int slashes = 0;
            foreach (char c in value) { if (c == '\\') { slashes++; continue; } result.Append('\\', c == '"' ? slashes * 2 + 1 : slashes); result.Append(c); slashes = 0; }
            return result.Append('\\', slashes * 2).Append('"').ToString();
        }

        public void Initialize(ArenaUI ui, IEndpointBinding endpoint, Action showHome, Action offlineExperience)
        {
            this.ui = ui; this.endpoint = endpoint; this.showHome = showHome; this.offlineExperience = offlineExperience;
        }
        public void ConnectExternal() { Ready = true; }
        public void Boot() { if (!Starting) StartCoroutine(StartBackend()); }
        IEnumerator StartBackend()
        {
            Starting = true; Ready = false; Error = null;
            var panel = ui.OpenModal("正在准备比赛服务");
            ui.Label(panel, "正在检查本机数据并启动后台…\n首次升级会复制并校验已有题库和赛事。", 28, 112, 970, 110, 22);
            var launchArgs = Environment.GetCommandLineArgs();
            DataDirectory = ReadArgument(launchArgs, "--arena-data-dir") ?? Path.Combine(Application.persistentDataPath, "BackendData");
            JObject discovery = null;
            try {
                string file = Path.Combine(DataDirectory,".runtime.json");
                if(File.Exists(file)) discovery=JObject.Parse(File.ReadAllText(file));
            } catch(Exception error) { Error="后台连接记录无法读取："+error.Message; }
            Process previous=null;
            if(discovery!=null) {
                try { previous=Process.GetProcessById((int)discovery["pid"]); if(previous.HasExited)previous=null; } catch { previous=null; }
                if(previous!=null) {
                    string endpoint=(string)discovery["url"];
                    if(!Uri.TryCreate(endpoint,UriKind.Absolute,out var uri) || uri.Scheme!="http" || uri.Host!="127.0.0.1") Error="已有后台地址无效";
                    else {
                        using(var request=new UnityWebRequest(endpoint+"/api/game/runtime/adopt","POST")) {
                            request.downloadHandler=new DownloadHandlerBuffer();
                            request.uploadHandler=new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(new JObject{["parentPid"]=Process.GetCurrentProcess().Id}.ToString()));
                            request.SetRequestHeader("Content-Type","application/json");request.SetRequestHeader("X-Arena-Desktop-Token",(string)discovery["token"]);request.timeout=12;
                            yield return request.SendWebRequest();
                            if(request.result==UnityWebRequest.Result.Success && this.endpoint.SetEndpoint(endpoint)) {
                                process=previous;token=(string)discovery["token"];LogPath=Path.Combine(DataDirectory,"desktop.log");
                                Ready=true;Starting=false;showHome();yield break;
                            }
                            Error="已有后台暂不能接管，可能仍被另一个游戏使用。请稍后重试。";
                        }
                    }
                    previous.Dispose();Starting=false;ShowFailure();yield break;
                }
            }
            bool started = false;
            try
            {
                if (process != null && !process.HasExited) throw new InvalidOperationException("此前启动的后台仍在运行，请稍候重试");
                process?.Dispose(); process = null;
                string root = Path.Combine(Path.GetDirectoryName(Application.dataPath), "Backend");
                var args = Environment.GetCommandLineArgs();
                DataDirectory = ReadArgument(args, "--arena-data-dir") ?? Path.Combine(Application.persistentDataPath, "BackendData");
                Directory.CreateDirectory(DataDirectory); LogPath = Path.Combine(DataDirectory, "desktop.log");
                string node = Path.Combine(root, "node.exe");
                if (!File.Exists(node)) throw new FileNotFoundException("游戏的 Backend/node.exe 缺失，请恢复完整游戏目录");
                string legacy = ReadArgument(args, "--arena-legacy-dir");
                if (legacy == null && !args.Contains("--arena-no-migrate"))
                {
                    var candidate = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", "arena"));
                    if (Directory.Exists(Path.Combine(candidate, "arenas"))) legacy = candidate;
                }
                token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
                var info = new ProcessStartInfo(node, Argument(Path.Combine(root, "scripts", "serve-desktop.ts")) + " --data-dir " + Argument(DataDirectory) + " --parent-pid " + Process.GetCurrentProcess().Id + (args.Contains("--arena-maintenance-web")?" --maintenance-web":"") + (legacy == null ? "" : " --legacy-dir " + Argument(legacy)))
                { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = root, RedirectStandardOutput = true, RedirectStandardError = true };
                info.EnvironmentVariables["QUQU_DESKTOP_TOKEN"] = token;
                process = new Process { StartInfo = info };
                process.OutputDataReceived += (_, e) => { if (e.Data != null) output.Enqueue(e.Data); };
                process.ErrorDataReceived += (_, e) => { if (e.Data != null) output.Enqueue(e.Data); };
                process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine(); started = true;
            }
            catch (Exception error) { Error = error.Message; }
            float deadline = Time.realtimeSinceStartup + 90;
            while (started && Time.realtimeSinceStartup < deadline)
            {
                while (output.TryDequeue(out var line))
                {
                    File.AppendAllText(LogPath, line + Environment.NewLine);
                    if (!line.StartsWith("{")) continue;
                    JObject message = null; try { message = JObject.Parse(line); } catch { }
                    if ((int?)message?["desktopReady"] == 1 && endpoint.SetEndpoint((string)message["url"])) { Ready = true; break; }
                }
                if (Ready || process.HasExited) break;
                yield return null;
            }
            Starting = false;
            if (Ready) { showHome(); yield break; }
            if (process != null && !process.HasExited) process.Kill();
            Error ??= "比赛后台未能启动。日志保存在本机数据目录，已有数据不会被清空。";
            ShowFailure();
        }
        void ShowFailure()
        {
            var panel = ui.OpenModal("比赛服务暂不可用");
            ui.Label(panel, Error, 28, 112, 970, 170, 22);
            ui.Button(panel, "重试", 28, 330, 230, Boot, true);
            ui.Button(panel, "查看日志", 275, 330, 230, () => { if (File.Exists(LogPath)) Application.OpenURL(new Uri(LogPath).AbsoluteUri); });
            ui.Button(panel, "离线场景体验", 520, 330, 230, offlineExperience);
            ui.Button(panel, "退出游戏", 765, 330, 245, () => Application.Quit());
        }
        public IEnumerator Shutdown(Action<bool> complete)
        {
            if (process == null || process.HasExited) { process?.Dispose();process=null;Ready=false;complete(true); yield break; }
            if (!Ready) { process.Kill(); complete(true); yield break; }
            using (var request = UnityWebRequest.PostWwwForm(endpoint.BaseUrl + "/api/game/runtime/shutdown", ""))
            {
                request.SetRequestHeader("X-Arena-Desktop-Token", token); request.timeout = 15;
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success && !process.HasExited) { complete(false); yield break; }
            }
            float deadline = Time.realtimeSinceStartup + 90;
            while (!process.HasExited && Time.realtimeSinceStartup < deadline) yield return null;
            bool exited=process.HasExited;if(exited){process.Dispose();process=null;Ready=false;}complete(exited);
        }
        public IEnumerator Detach(Action<bool> complete)
        {
            if(!Owned){complete(true);yield break;}
            using(var request=UnityWebRequest.PostWwwForm(endpoint.BaseUrl+"/api/game/runtime/detach","")) {
                request.SetRequestHeader("X-Arena-Desktop-Token",token);request.timeout=15;
                yield return request.SendWebRequest();
                bool ok=request.result==UnityWebRequest.Result.Success;
                if(ok){process.Dispose();process=null;Ready=false;}
                complete(ok);
            }
        }
        static string ReadArgument(string[] args, string name) { var at = Array.IndexOf(args, name); return at >= 0 && at + 1 < args.Length ? args[at + 1] : null; }
    }
}
