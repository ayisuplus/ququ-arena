using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    /** 离线模拟与冒烟验收（P2 自 ArenaGame 逐行移出：Demo/OfflineExperience/OfflineLoop/Smoke）。
     *  DemoIds/DemoNames 常量迁至此处；ArenaGame 上保留同名静态别名供既有 Check 调用点使用。 */
    public static class ArenaOfflineDemo
    {
        public static readonly string[] DemoIds = { "mock:xueba-o9", "mock:huatou-72b", "mock:jianglv-7b", "mock:laoshi-k2" };
        public static readonly string[] DemoNames = { "学霸-o9", "滑头-72b", "犟驴-7b", "老实-k2" };

        public static void OfflineExperience(IArenaShell shell)
        {
            shell.UI.CloseModal(); shell.Link.Disconnect(); shell.StopOffline();
            shell.SetRoster(DemoIds.Take(2).Select((id, i) => new ModelInfo { id = id, name = DemoNames[i] }).ToArray());
            shell.StartOffline(OfflineLoop(shell));
        }

        static IEnumerator OfflineLoop(IArenaShell shell)
        {
            int index = 0;
            while (true) { shell.Notify("离线场景体验 · 动作演示，不调用模型、不记录战绩 · Esc 打开菜单"); shell.Stage.Fight(shell.Stage.Fighters[index++ % 2], .7f); yield return new WaitForSecondsRealtime(4); }
        }

        public static void Demo(IArenaShell shell)
        {
            shell.StopOffline();
            if (shell.Desktop && !shell.Desktop.Ready) { OfflineExperience(shell); return; }
            shell.SetFinished(false); shell.UI.CloseModal(); shell.Notify("离线模拟场：使用内置模拟模型，不调用付费模型");
            shell.Link.Launch(new Launch { arena = "tongjia-pinyin", models = DemoIds.Take(2).ToArray(), draw = DemoIds.Take(2).ToArray(), limit = 10, demo = true });
        }

        public static IEnumerator Smoke(IArenaShell shell)
        {
            yield return new WaitForSecondsRealtime(2); Demo(shell);
            yield return new WaitForSecondsRealtime(5);
            var dir = Path.Combine(Application.persistentDataPath, "Validation"); Directory.CreateDirectory(dir);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir, "shell-running.png"));
            float deadline = Time.realtimeSinceStartup + 90;
            while (!shell.Finished && Time.realtimeSinceStartup < deadline) yield return new WaitForSecondsRealtime(.5f);
            File.WriteAllText(Path.Combine(dir, "runtime.json"), JsonUtility.ToJson(new RuntimeCheck { frames = shell.AcceptedFrames, fighters = shell.Stage.Fighters.Count, completed = shell.Finished, report = shell.ReportPath ?? "", graphics = SystemInfo.graphicsDeviceName }, true));
            ScreenCapture.CaptureScreenshot(Path.Combine(dir, "shell-result.png"));
        }

        [Serializable] class RuntimeCheck { public int frames, fighters; public bool completed; public string report, graphics; }
    }
}
