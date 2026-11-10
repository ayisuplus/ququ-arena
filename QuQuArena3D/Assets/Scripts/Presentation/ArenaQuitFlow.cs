using System;
using System.Collections;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    /** 退出流程（P2 自 ArenaGame 逐行移出：PrepareQuit/ChooseExit/LeaveFullscreenAndQuit）。 */
    public sealed class ArenaQuitFlow
    {
        readonly IArenaShell shell;
        bool quitRequested, readyToQuit;

        public ArenaQuitFlow(IArenaShell shell) { this.shell = shell; }

        /** 原 ArenaGame.KeyboardEscape 守卫的等价出口：退出确认挂起期间禁止 Esc 再开菜单。
         *  P5 asmdef：ArenaGame（QuQu.App）跨程序集读取，internal 不可见 → public（仍只读）。 */
        public bool QuitRequested => quitRequested;

        public bool PrepareQuit()
        {
            if (readyToQuit || !shell.UI) return true;
            if (!quitRequested) shell.UI.Leave(() => { quitRequested = true; shell.Run(ChooseExit()); });
            return false;
        }

        IEnumerator ChooseExit()
        {
            if (shell.Tasks && shell.Desktop.Ready) yield return shell.Tasks.Refresh();
            quitRequested = false;
            if (!shell.Tasks || (shell.Tasks.Active == 0 && shell.Tasks.Error == null)) { quitRequested = true; yield return LeaveFullscreenAndQuit(false); yield break; }
            var panel = shell.UI.OpenModal("退出游戏"); shell.UI.SetBack(shell.ShowHome);
            shell.UI.Label(panel, shell.Tasks.Error == null ? $"还有 {shell.Tasks.Active} 项任务运行中。\n后台继续会继续调用模型；全部结束或等待人工处理后自动退出。\n保存并退出会保留赛事进度，中止实验与扩展开发并保存已有结果。" : "暂时无法确认后台任务状态。可返回游戏，或请求后台保存退出。", 28, 110, 970, 135, 22);
            var affected = shell.UI.Multiline(panel, string.Join("\n", shell.Tasks.Items.Where(r => ArenaTaskStatus.InFlight.Contains((string)r["status"])).Select(r => r["title"] + "  ·  " + r["id"])), 28, 265, 970, 135, "任务状态暂不可用", 100000); affected.readOnly = true;
            shell.UI.Button(panel, "后台继续", 28, 440, 305, () => { quitRequested = true; shell.Run(LeaveFullscreenAndQuit(true)); }, true).interactable = shell.Tasks.Error == null;
            shell.UI.Button(panel, "保存并退出", 352, 440, 310, () => { quitRequested = true; shell.Run(LeaveFullscreenAndQuit(false)); });
            shell.UI.Button(panel, "取消", 685, 440, 325, shell.ShowHome);
        }

        IEnumerator LeaveFullscreenAndQuit(bool background)
        {
            if (!shell.ValidationMode) shell.Preferences.Save();
            shell.UI.CloseModal(); var panel = shell.UI.OpenModal("正在保存并退出");
            shell.UI.Label(panel, background ? "正在将已提交任务交给后台继续…" : "正在保留赛事进度并等待后台保存与清理…", 28, 120, 960, 100, 24);
            bool saved = true;
            if (shell.Desktop) { if (background) yield return shell.Desktop.Detach(ok => saved = ok); else yield return shell.Desktop.Shutdown(ok => saved = ok); }
            if (!saved)
            {
                quitRequested = false; shell.UI.Label(panel, "后台未确认关闭，请重试。", 28, 265, 970, 60, 22);
                shell.UI.Button(panel, "重试保存退出", 28, 400, 460, () => Application.Quit(), true);
                shell.UI.Button(panel, "返回游戏", 520, 400, 490, shell.ShowHome); yield break;
            }
            if (Screen.fullScreen) { shell.SetFullscreen(false); yield return new WaitForSecondsRealtime(.5f); }
            readyToQuit = true;
#if UNITY_STANDALONE_WIN && !UNITY_EDITOR
            // Some Windows shell/graphics integrations can stall native Player teardown after saving.
            // The helper only watches this player; all backend ownership decisions have completed above.
            try {
                string helper = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(Application.dataPath), "NativeDialogs", "QuQuFileDialog.exe");
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(helper, "exit-guard " + System.Diagnostics.Process.GetCurrentProcess().Id)
                { UseShellExecute = false, CreateNoWindow = true, WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden })?.Dispose();
            } catch (Exception error) { Debug.LogWarning("退出保障未能启动：" + error.Message); }
#endif
            Application.Quit();
        }
    }
}
