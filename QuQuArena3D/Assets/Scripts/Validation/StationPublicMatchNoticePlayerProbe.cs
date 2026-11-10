using System;
using System.Collections;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Verifies public notices against an isolated local competition in an independent Player.
    public sealed class StationPublicMatchNoticePlayerProbe : MonoBehaviour
    {
        string output;
        bool visualInput;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-public-notice-output");
            if (at < 0 || at + 1 >= args.Length ||
                !Path.IsPathRooted(args[at + 1])) return;
            var probe = new GameObject("Station public match notice Player probe")
                .AddComponent<StationPublicMatchNoticePlayerProbe>();
            probe.output = args[at + 1];
            probe.visualInput = Array.IndexOf(args, "--station-public-notice-visual-input") >= 0;
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var report = new JObject { ["scene"] = SceneManager.GetActiveScene().name };
            var match = FindFirstObjectByType<ArenaStationLiveMatch>();
            var notice = FindFirstObjectByType<StationPublicMatchNotice>();
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var hud = FindFirstObjectByType<StationMatchHUD>();
            var link = match ? match.GetComponent<ArenaConnection>() : null;
            try
            {
                if (SceneManager.GetActiveScene().name !=
                        "BlackHoleStationPublicMatchNoticeW4O" ||
                    !match || !notice || !walker || !hud || !link ||
                    notice.Match != match || notice.Walker != walker ||
                    !hud.IsCompact || notice.NoticeCount != 0 ||
                    !string.IsNullOrEmpty(match.CompetitionId))
                    throw new InvalidOperationException("W4O fresh notice scene incomplete");
                var body = walker.GetComponent<CharacterController>();
                body.enabled = false;
                walker.transform.position = new Vector3(-190, .06f, -186);
                body.enabled = true;
                if (!Physics.Raycast(walker.transform.position + Vector3.up,
                    Vector3.down, 2))
                    throw new InvalidOperationException("Remote greenhouse position unsupported");
                report["remotePosition"] = walker.transform.position.ToString();
                report["quietBeforeMatch"] = notice.NoticeCount == 0;
                if (visualInput && SystemInfo.graphicsDeviceType ==
                    UnityEngine.Rendering.GraphicsDeviceType.Null)
                    throw new InvalidOperationException("Visual input probe requires graphics");
                if (visualInput && Keyboard.current == null)
                    throw new InvalidOperationException("Visual input probe requires a keyboard");
                var models = new[] { "mock:xueba-o9", "mock:huatou-72b" };
                link.Launch(new Launch { arena = "tongjia-pinyin", models = models,
                    draw = models, limit = 2, demo = true,
                    requestId = Guid.NewGuid().ToString() });
            }
            catch (Exception error) { report["error"] = error.Message; }

            if (visualInput && report["error"] == null)
            {
                walker.Face(walker.transform.position + Vector3.back * 5);
                yield return new WaitForEndOfFrame();
                SaveWorldFrame(walker.View, Path.Combine(output, "remote-world.png"));
                var keyboard = Keyboard.current;
                var start = walker.transform.position;
                InputSystem.QueueStateEvent(keyboard, new KeyboardState(Key.W));
                yield return new WaitForSecondsRealtime(.6f);
                InputSystem.QueueStateEvent(keyboard, new KeyboardState());
                yield return null;
                var distance = Vector3.Distance(start, walker.transform.position);
                report["keyboardWalkMeters"] = distance;
                if (distance < .15f || distance > 5f)
                    report["error"] = "W input did not move the visitor through the controller";
            }

            var deadline = Time.realtimeSinceStartup + 180;
            if (report["error"] == null)
            {
                bool capturedNotice = false;
                while (match.Status != "冠军演出完成 · 双方已离场" &&
                    Time.realtimeSinceStartup < deadline && report["error"] == null)
                {
                    if (!string.IsNullOrEmpty(link.LastError))
                        report["error"] = link.LastError;
                    if (visualInput && !capturedNotice && notice.NoticeCount > 0)
                    {
                        yield return new WaitForEndOfFrame();
                        SaveWorldFrame(walker.View, Path.Combine(output, "live-world.png"));
                        capturedNotice = true;
                        report["noticeScreenshot"] = notice.LastText;
                        InputSystem.QueueStateEvent(Keyboard.current, new KeyboardState(Key.H));
                        yield return null;
                        InputSystem.QueueStateEvent(Keyboard.current, new KeyboardState());
                        yield return null;
                        report["hExpandedHud"] = !hud.IsCompact;
                        if (hud.IsCompact)
                            report["error"] = "H input did not expand the match HUD";
                        else
                        {
                            InputSystem.QueueStateEvent(Keyboard.current, new KeyboardState(Key.H));
                            yield return null;
                            InputSystem.QueueStateEvent(Keyboard.current, new KeyboardState());
                            yield return null;
                            report["hReturnedCompact"] = hud.IsCompact;
                            if (!hud.IsCompact)
                                report["error"] = "Second H input did not compact the match HUD";
                        }
                    }
                    yield return null;
                }
                if (report["error"] == null &&
                    (match.Status != "冠军演出完成 · 双方已离场" ||
                     notice.NoticeCount < 3 || notice.LastSequence <= 0 ||
                     string.IsNullOrEmpty(match.CompetitionId) ||
                     string.IsNullOrEmpty(match.WinningModel) ||
                     !notice.LastText.Contains(match.DisplayName(match.WinningModel)) ||
                     match.ResolvedRounds < 1 || match.ChampionshipAwards != 1 ||
                     !hud.IsCompact ||
                     (visualInput && !capturedNotice) ||
                     Vector3.Distance(walker.transform.position, Vector3.zero) < 150))
                    report["error"] = "Remote server events did not reach compact notice";
                if (report["error"] == null)
                {
                    report["competitionId"] = match.CompetitionId;
                    report["winner"] = match.WinningModel;
                    report["rounds"] = match.ResolvedRounds;
                    report["awards"] = match.ChampionshipAwards;
                    report["noticeCount"] = notice.NoticeCount;
                    report["lastSequence"] = notice.LastSequence;
                    report["lastText"] = notice.LastText;
                    var beforeReplay = notice.NoticeCount;
                    link.WatchCompetition(match.CompetitionId);
                    while (!match.Status.StartsWith("赛事已结算") &&
                        Time.realtimeSinceStartup < deadline &&
                        string.IsNullOrEmpty(link.LastError))
                        yield return null;
                    yield return new WaitForSecondsRealtime(.5f);
                    report["reconnectStatus"] = match.Status;
                    report["noReplayNotice"] = notice.NoticeCount == beforeReplay;
                    if (string.IsNullOrEmpty(match.Status) ||
                        !match.Status.StartsWith("赛事已结算") ||
                        notice.NoticeCount != beforeReplay ||
                        !string.IsNullOrEmpty(link.LastError))
                        report["error"] = "Reconnect replayed a public match notice";
                }
            }
            File.WriteAllText(Path.Combine(output, "live-notices.json"), report.ToString());
            Application.Quit(report["error"] == null ? 0 : 1);
        }

        static void SaveWorldFrame(Camera camera, string path)
        {
            var target = new RenderTexture(1280, 720, 24);
            var previousTarget = camera.targetTexture;
            var previousActive = RenderTexture.active;
            var frame = new Texture2D(1280, 720, TextureFormat.RGB24, false);
            try
            {
                camera.targetTexture = target;
                camera.Render();
                RenderTexture.active = target;
                frame.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
                frame.Apply();
                File.WriteAllBytes(path, frame.EncodeToPNG());
            }
            finally
            {
                camera.targetTexture = previousTarget;
                RenderTexture.active = previousActive;
                Destroy(frame);
                target.Release();
                Destroy(target);
            }
        }
    }
}
