using System;
using System.Collections;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    /** 组合根（P2 自 ArenaGame.Start 移出）：解析命令行、构建对象图、装配事件流、分发验证入口。
     *  这是唯一允许知道全部具体类型的地方；其余子系统只依赖事件与窄接口。 */
    public static class ArenaBootstrap
    {
        /** P5：验证入口不再是一张手写表——各 harness 用 [ArenaHarness(flag, boot)] 自注册
         *  （见 ArenaHarness.cs），组合根只负责按命令行命中项查表并调用。新增 harness 不必改本文件。 */
        static string QaOutput(string[] args)
        {
            int at = Array.IndexOf(args, "--arena-qa-output");
            return at >= 0 && at + 1 < args.Length ? args[at + 1] : null;
        }

        public static void Initialize(ArenaGame game)
        {
            game.useGUILayout = false; // OnGUI only receives keyboard events; it does not draw a layout.
            var args = Environment.GetCommandLineArgs();
            bool orbitalGray = args.Contains("--arena-orbital-gray");
            bool desktopInteractive = args.Contains("--arena-desktop-interactive");
            game.validationMode = args.Contains("--arena-agent-validation") || args.Contains("--arena-hair-validation") || args.Contains("--arena-spectator-validation") || args.Contains("--arena-duel-validation") || args.Contains("--arena-divine-validation") || args.Contains("--arena-preset-validation") || args.Contains("--arena-art-validation") || args.Contains("--arena-visual-validation") || args.Contains("--arena-performance-validation") || args.Contains("--arena-plan-validation");
#if UNITY_EDITOR
            game.validationMode |= UnityEditor.SessionState.GetBool("QuQu.VisualValidation", false);
            orbitalGray |= UnityEditor.SessionState.GetBool("QuQu.OrbitalGray", false);
#endif
            game.validationMode |= ValidationFlagged(args, desktopInteractive);
            game.Preferences = game.validationMode ? new ArenaPreferences() : ArenaPreferences.Load();
            ArenaAvatarMode.Set(game.Preferences.avatarMode);
            Shader.SetGlobalFloat("_ArenaStarBrightness", game.Preferences.starBrightness);
            game.Stage = new GameObject("3D arena").AddComponent<ArenaStage>(); game.Stage.Create(orbitalGray);
            game.Connection = game.gameObject.AddComponent<ArenaConnection>(); game.Connection.SetEndpoint(game.Preferences.endpoint);
            game.Media = game.gameObject.AddComponent<ArenaMedia>(); game.Media.Initialize();
            game.Stage.OnImpact = blocked => game.Media.Hit(blocked);
            game.UI = new GameObject("Arena HUD", typeof(RectTransform)).AddComponent<ArenaUI>(); ColorUtility.TryParseHtmlString(game.Preferences.accent, out game.UI.Accent); game.UI.Create(game, game.Preferences);
            game.Duel = game.gameObject.AddComponent<ArenaDuelController>(); game.Duel.Initialize(game); game.Stage.Display.Bind(game.Duel);
            game.Hud = new GameObject("Spectator HUD", typeof(RectTransform)).AddComponent<ArenaDuelHUD>(); game.Hud.Create(game, game.UI.Root, false);
            game.Reader = new GameObject("Answer reader", typeof(RectTransform)).AddComponent<ArenaReadingDrawer>(); game.Reader.Create(game);
            game.Commentary = new GameObject("Commentary", typeof(RectTransform)).AddComponent<ArenaCommentaryDrawer>(); game.Commentary.Create(game);
            // P3：这两个子系统改为注入窄接口（UI 工具箱 / 端点绑定 / 导航回调；任务中心延迟取用 Stations）。
            game.Hub = new ArenaDesktopHub(game); game.Desktop = game.gameObject.AddComponent<ArenaDesktopRuntime>(); game.Desktop.Initialize(game.UI, game.Connection, game.ShowHome, game.OfflineExperience);
            game.Tasks = game.gameObject.AddComponent<ArenaTaskCenter>(); game.Tasks.Initialize(game.Connection, () => game.Stations, () => game.Desktop.Ready);
            game.Stations = new GameObject("Orbital facilities").AddComponent<ArenaOrbitalNetwork>(); game.Stations.Initialize(game, orbitalGray);
            game.Stage.CameraInputBlocked = () => game.UI.Modal || game.Hud.MenuOpen || game.Reader.IsOpen || game.Commentary.IsOpen || game.Stations.Moving || game.Stage.CameraDirected;
            game.UI.Left.gameObject.SetActive(false); game.UI.Right.gameObject.SetActive(false); game.UI.Rules.gameObject.SetActive(false); game.UI.Status.gameObject.SetActive(false);
            game.Spectator = new GameObject("Large screen HUD", typeof(RectTransform)).AddComponent<ArenaSpectator>(); game.Spectator.Create(game.UI.transform);

            // 事件流装配（P1）：协议帧 → 类型化事件 → 演出者。订阅者不依赖 ArenaGame 具体类型。
            game.MatchBus = new MatchEventBus();
            game.MatchRouter = new ArenaFrameRouter(game.MatchBus);
            new ArenaMatchPresenter(game, game.MatchBus);

            game.Connection.OnFrame = game.Accept; game.Connection.OnStatus = game.Notify; game.UI.SelectFighter = game.SelectFighter;
            var preview = ArenaOfflineDemo.DemoIds.Take(2).Select((id, i) => new ModelInfo { id = id, name = ArenaOfflineDemo.DemoNames[i] }).ToArray();
            game.SetRoster(preview); game.ApplyPreferences(); game.Media.LoadMusic(game.Preferences.musicPath, null);
            if (!string.IsNullOrEmpty(game.Preferences.backgroundPath)) game.SetBackground(game.Preferences.backgroundPath);
            var endpoint = Array.IndexOf(args, "--arena-backend"); if (endpoint >= 0 && endpoint + 1 < args.Length) game.Connection.SetEndpoint(args[endpoint + 1]);
            if (endpoint >= 0 || game.validationMode) game.Desktop.ConnectExternal();
            DispatchValidation(game, args, endpoint, desktopInteractive);
        }

        static bool ValidationFlagged(string[] args, bool desktopInteractive)
        {
            if (ArenaHarnesses.Find(args) != null) return true;
            return desktopInteractive;
        }

        static void DispatchValidation(ArenaGame game, string[] args, int backendIndex, bool desktopInteractive)
        {
            var harness = ArenaHarnesses.Find(args);
            if (harness != null)
            {
                if (harness.Boot) game.Desktop.Boot();
                game.StartCoroutine(ArenaHarnesses.Invoke(harness, game, QaOutput(args)));
                return;
            }
            if (desktopInteractive) { game.Desktop.Boot(); return; }
            if (Array.IndexOf(args, "--arena-smoke") >= 0) { game.StartCoroutine(ArenaOfflineDemo.Smoke(game)); return; }
            if (backendIndex >= 0 || game.validationMode) { game.Desktop.ConnectExternal(); game.ShowHome(); return; }
            game.Desktop.Boot();
        }
    }
}
