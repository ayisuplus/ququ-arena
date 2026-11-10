using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    /// <summary>
    /// 等待态必须继续轮询（--station-waiting-poll-output）。
    /// 开一场会因加赛缺题而停在 waiting 的真实赛事，断言三件事：
    /// IsTerminalStatus("waiting") == false、等待期间 PollRounds 至少增长 2、后端 read() 因此被持续调用。
    /// 全部走本机 fixture 后端与内置模拟选手，不调用任何付费模型。
    /// </summary>
    public sealed class StationWaitingPollProbeV019 : MonoBehaviour
    {
        [Serializable]
        public sealed class Result
        {
            public string scene, competitionId, status, reason, error;
            public bool passed, waitingIsNonTerminal, waitingKeepsPolling;
            public int pollRoundsAtWaiting, pollRoundsAfterWait, waitedSeconds;
            public string graphics;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args = Environment.GetCommandLineArgs();
            int at = Array.IndexOf(args, "--station-waiting-poll-output");
            if (at < 0 || at + 1 >= args.Length || !Path.IsPathRooted(args[at + 1])) return;
            new GameObject("V019 waiting poll validation").AddComponent<StationWaitingPollProbeV019>();
        }

        IEnumerator Start()
        {
            yield return null;
            yield return null;
            var args = Environment.GetCommandLineArgs();
            int at = Array.IndexOf(args, "--station-waiting-poll-output");
            string dir = Path.GetFullPath(args[at + 1]);
            Directory.CreateDirectory(dir);
            var report = new Result
            {
                scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,
                graphics = SystemInfo.graphicsDeviceName
            };
            var steps = Check(report, dir);
            while (true)
            {
                bool more; object next;
                try { more = steps.MoveNext(); next = more ? steps.Current : null; }
                catch (Exception error) { report.error = error.ToString(); Debug.LogException(error); break; }
                if (!more) { report.passed = true; break; }
                yield return next;
            }
            (steps as IDisposable)?.Dispose();
            File.WriteAllText(Path.Combine(dir, "runtime.json"), JsonUtility.ToJson(report, true));
            if (!Application.isEditor) Application.Quit(report.passed ? 0 : 1);
        }

        IEnumerator Check(Result report, string dir)
        {
            report.waitingIsNonTerminal = !ArenaConnection.IsTerminalStatus("waiting");
            Require(report.waitingIsNonTerminal, "waiting 被当成终态：后端自动续赛入口关闭");

            var endpoint = Environment.GetCommandLineArgs();
            int at = Array.IndexOf(endpoint, "--arena-backend");
            var host = new GameObject("V019 waiting poll link").AddComponent<ArenaConnection>();
            Require(at >= 0 && at + 1 < endpoint.Length, "缺少 --arena-backend");
            Require(host.SetEndpoint(endpoint[at + 1]), "后端地址无效：" + endpoint[at + 1]);

            CompetitionSnapshot snapshot = null;
            host.OnCompetition = (packet, _) => snapshot = packet.snapshot;
            var models = new[] { "mock:xueba-o9", "mock:laoshi-k2" };
            // excel-survivor 题库用尽后进入加赛缺题，赛事停在 waiting —— 这正是自动续赛要接管的现场
            host.Launch(new Launch { arena = "excel-survivor", models = models, draw = models, limit = 99, demo = true });

            float deadline = Time.unscaledTime + 120f;
            while (snapshot?.status != "waiting" && Time.unscaledTime < deadline)
                yield return new WaitForSecondsRealtime(0.2f);
            Require(snapshot?.status == "waiting", "未构造出 waiting 赛事：" + host.LastError);

            report.competitionId = host.Competition;
            report.status = snapshot.status;
            report.reason = snapshot.reason;
            report.pollRoundsAtWaiting = host.PollRounds;
            float from = Time.unscaledTime;
            yield return new WaitForSecondsRealtime(3f);
            report.waitedSeconds = Mathf.RoundToInt(Time.unscaledTime - from);
            report.pollRoundsAfterWait = host.PollRounds;
            report.waitingKeepsPolling = report.pollRoundsAfterWait - report.pollRoundsAtWaiting >= 2;
            Require(report.waitingKeepsPolling, "等待期间停止轮询：" + report.pollRoundsAtWaiting + " -> " + report.pollRoundsAfterWait);
        }

        static void Require(bool value, string message) { if (!value) throw new Exception(message); }
    }
}