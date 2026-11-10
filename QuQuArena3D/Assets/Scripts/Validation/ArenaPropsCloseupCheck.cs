using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // V28 道具近景 A/B 采集：同机位拍观测仪/巡检轨/控制台特写，供「塑料灰是否根治」的
    // 配对像素判读。跑两遍即可做单变量实验——当前代码（V28 建模道具）与旧图元道具
    // （ArenaLightShow 换回 git 旧版）机位完全一致，配对差只归因于道具工艺。
    // 机位从道具根节点的真实世界坐标推导（两版根节点同名同位），固定偏移逐像素对齐；
    // motion=0 冻结装饰动画，消除滑车/云台的相位噪声。boot=false：不拉后端。
    // V29 追加看台与奖杯：看台机位改用 Radial 参数直接给出（图元方块与 Blender 单元同名同位，
    // 配对差只归因于工艺）；奖杯走真实 Celebrate 接线后再拍特写。
    [ArenaHarness("--arena-props-closeup", false)]
    public static class ArenaPropsCloseupCheck
    {
        [Serializable] public class Result { public bool passed; public string error, gpu; }
        static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }

        public static IEnumerator Run(ArenaGame g, string output = null)
        {
            var args = Environment.GetCommandLineArgs();
            int at = Array.IndexOf(args, "--arena-qa-output");
            string dir = output ?? (at >= 0 ? args[at + 1] : Path.Combine(Application.temporaryCachePath, "props-closeup"));
            if (string.IsNullOrEmpty(dir)) dir = Path.Combine(Application.temporaryCachePath, "props-closeup");
            Directory.CreateDirectory(dir);
            var result = new Result { gpu = SystemInfo.graphicsDeviceName };
            var stack = new Stack<IEnumerator>();
            stack.Push(Check(g, dir, result));
            while (stack.Count > 0)
            {
                bool more; object next = null;
                try { more = stack.Peek().MoveNext(); if (more) next = stack.Peek().Current; }
                catch (Exception e) { result.error = e.ToString(); Debug.LogException(e); break; }
                if (!more) { (stack.Pop() as IDisposable)?.Dispose(); continue; }
                if (next is IEnumerator child) stack.Push(child); else yield return next;
            }
            while (stack.Count > 0) (stack.Pop() as IDisposable)?.Dispose();
            result.passed = string.IsNullOrEmpty(result.error);
            File.WriteAllText(Path.Combine(dir, "runtime.json"), JsonUtility.ToJson(result, true));
            if (!Application.isEditor) Application.Quit(result.passed ? 0 : 1);
        }

        // sample, when given, receives the raw frame so the caller can pair-difference two
        // shots taken from the same camera.
        static IEnumerator Photo(string dir, string name, List<Color32> sample = null)
        {
            // .5s, not .3s: batchmode's player loop runs at roughly 3 Hz, so .3 could
            // capture the frame *before* the camera moved (this cost one mis-framed shot).
            yield return new WaitForSecondsRealtime(.5f);
            yield return new WaitForEndOfFrame();
            var texture = ScreenCapture.CaptureScreenshotAsTexture();
            var pixels = texture.GetPixels32();
            if (sample != null) sample.AddRange(pixels);
            int lit = 0;
            for (int i = 0; i < pixels.Length; i += 97) if (pixels[i].r + pixels[i].g + pixels[i].b > 35) lit++;
            Require(lit > pixels.Length / 1300, "Black or empty rendered frame: " + name);
            File.WriteAllBytes(Path.Combine(dir, name + ".png"), texture.EncodeToPNG());
            UnityEngine.Object.Destroy(texture);
        }

        static IEnumerator Check(ArenaGame g, string dir, Result result)
        {
            yield return new WaitForSecondsRealtime(.5f);
            g.UI.CloseModal();
            g.Preferences.motion = 0;
            g.ApplyPreferences();
            yield return null;
            var restore = g.Stage.CaptureView();
            g.Stage.CameraDirected = true;
            g.UI.Root.gameObject.SetActive(false);
            try
            {
                foreach (var shot in new[]
                {
                    new { Root = "Optical survey instrument", File = "closeup-survey", Kind = 0 },
                    new { Root = "Optical survey instrument", File = "closeup-survey-top", Kind = 1 },
                    new { Root = "Supported corridor inspection rail", File = "closeup-rail-high", Kind = 2 },
                    new { Root = "Supported corridor inspection rail", File = "closeup-rail-top", Kind = 1 },
                    new { Root = "Match telemetry console", File = "closeup-console", Kind = 0 },
                    new { Root = "Match telemetry console", File = "closeup-console-top", Kind = 1 },
                })
                {
                    var root = FindDeep(g.Stage.LightShow.transform, shot.Root);
                    Require(root != null, "Missing prop root: " + shot.Root);
                    // 根节点世界坐标 + 固定偏移：两版逐像素同机位。Kind 0=台侧近景 1=垂直俯拍（无遮挡） 2=抬高斜视。
                    Vector3 p = root.position;
                    Vector3 outward = new Vector3(p.x, 0f, p.z).normalized;
                    if (outward.sqrMagnitude < .01f) outward = Vector3.forward;
                    Vector3 eye, target;
                    if (shot.Kind == 1) { eye = p + Vector3.up * 4.5f; target = p + Vector3.up * .3f; }
                    else if (shot.Kind == 2) { eye = p - outward * 3f + Vector3.up * 2.6f; target = p + Vector3.up * 1f; }
                    else { eye = p - outward * 2.2f + Vector3.up * 1.7f; target = p + Vector3.up * 1.15f; }
                    g.Stage.View.transform.position = eye;
                    g.Stage.View.transform.LookAt(target);
                    g.Stage.View.fieldOfView = 50;
                    yield return Photo(dir, shot.File);
                }
                // V29 看台近景：座位/梯级/发光带同机位对照。机位由 Radial 参数直接给出，
                // 图元方块与 Blender 单元共享同一套角度与半径，配对差只归因于看台工艺。
                // 前两机位与场馆验收的 audience-seating 同源（已证明能框住看台）；后两机位从场内与
                // 顶层后方看，避开 V23 玻璃顶棚的透明叠加。俯拍不做：会透过玻璃看到一片重影。
                Vector3 R(float angle, float radius) { float a = angle * Mathf.Deg2Rad; return new Vector3(Mathf.Sin(a), 0f, Mathf.Cos(a)) * radius; }
                // 看台批次不能是空网格：源 FBX 网格不可读时 CombineMeshes 会静默产出空批次，
                // 而只数 renderer 的场馆断言照样通过（V29 首跑真踩过）。顶点数在这里升为硬断言。
                foreach (var filter in g.Stage.Venue.GetComponentsInChildren<MeshFilter>())
                    if (filter.transform.parent == g.Stage.Venue.transform)
                        Require(filter.sharedMesh.vertexCount > 0,
                            "Empty seating batch " + filter.sharedMesh.name + " — unreadable source mesh?");
                foreach (var shot in new[]
                {
                    new { File = "seating-wide",   Eye = new Vector3(16f, 12f, -19f),    Target = new Vector3(0f, 1.5f, 3.8f) },
                    new { File = "seating-bank",   Eye = new Vector3(9.2f, 5.6f, -.3f),  Target = new Vector3(7.8f, 1.2f, 5f) },
                    new { File = "seating-mirror", Eye = new Vector3(-9.2f, 5.6f, -.3f), Target = new Vector3(-7.8f, 1.2f, 5f) },
                    new { File = "seating-out",    Eye = R(39f, 20f) + Vector3.up * 3.2f, Target = R(39f, 9f) + Vector3.up * .9f },
                    new { File = "seating-floor",  Eye = R(39f, 4.2f) + Vector3.up * 1.6f, Target = R(39f, 9.6f) + Vector3.up * 1f },
                    new { File = "seating-rows",   Eye = R(39f, 11f) + Vector3.up * 1.75f, Target = R(43f, 9.2f) + Vector3.up * .9f },
                })
                {
                    g.Stage.View.transform.position = shot.Eye;
                    g.Stage.View.transform.LookAt(shot.Target);
                    g.Stage.View.fieldOfView = 50;
                    yield return Photo(dir, shot.File);
                }
                // V29 奖杯舱：赛前奖杯停在外围飘浮平台上，夺冠后自己飘到获胜者身边。
                // 喂一手 mock 对局拿出选手，再走 Celebrate 的真实接线，确认 prefab 装配、
                // 舱位构图与「进 Celebrate、退 EndCombat」的挂点都通。
                ArenaSpectatorCapture.Feed(g, ArenaSpectatorCapture.Packet(), 6);
                yield return new WaitForSecondsRealtime(1f);
                Require(g.Stage.Fighters.Count > 0, "No fighter to award the trophy to");
                // 按引用取舱，不按名字：外层组件节点与舱体同名过，名字查找会抓到前者（在场景原点）。
                var bay = g.Stage.TrophyBay ? g.Stage.TrophyBay.Bay : null;
                Require(bay != null, "Trophy bay pod missing");
                var cup = FindDeep(g.Stage.transform, "Championship trophy");
                Require(cup != null, "Trophy root missing");
                // 默认机位：观众实际第一眼看到的构图。舱是否在画内、被大屏吃掉多少，只有这一张说了算。
                g.Stage.EndCombat();
                g.Stage.CameraDirected = false;
                g.Stage.ResetCamera();
                var withBay = new List<Color32>();
                yield return Photo(dir, "trophy-default", withBay);
                // 关舱对照：舱被大屏挡住时 isVisible 照样为 True（它只代表没被视锥剔除），
                // 而肉眼在星空里数像素也不可靠。同机位开/关 A/B 差分是唯一诚实的判据，
                // 于是直接升成断言：舱的屏幕框里必须有足够像素因它存在而改变。
                bay.gameObject.SetActive(false);
                var withoutBay = new List<Color32>();
                yield return Photo(dir, "trophy-default-nobay", withoutBay);
                bay.gameObject.SetActive(true);
                Vector3 bayScreen = g.Stage.View.WorldToScreenPoint(bay.position);
                // half should track the bay's own screen footprint (3.4 m at ~44 m is ~200 px
                // across, so 150 radius covers it with a little slack). A wider box just
                // dilutes the ratio with empty sky and hides a genuinely occluded bay.
                int cx = Mathf.RoundToInt(bayScreen.x), cy = Mathf.RoundToInt(bayScreen.y), half = 150, changed = 0, total = 0;
                for (int y = Mathf.Max(0, cy - half); y < Mathf.Min(Screen.height, cy + half); y++)
                    for (int x = Mathf.Max(0, cx - half); x < Mathf.Min(Screen.width, cx + half); x++)
                    {
                        int i = y * Screen.width + x;
                        if (i < 0 || i >= withBay.Count || i >= withoutBay.Count) continue;
                        var a = withBay[i]; var b = withoutBay[i];
                        total++;
                        if (Mathf.Max(Mathf.Abs(a.r - b.r), Mathf.Max(Mathf.Abs(a.g - b.g), Mathf.Abs(a.b - b.b))) > 24) changed++;
                    }
                Debug.Log("[ArenaPropsCloseupCheck] bay reveal=" + (total > 0 ? (changed / (float)total).ToString("P1") : "n/a")
                    + " of its screen box at " + bayScreen);
                Require(total > 0 && changed / (float)total > .15f,
                    "Trophy bay barely reads from the default camera (" + changed + "/" + total
                    + ") — is the galaxy display or the hall roof covering it?");
                g.Stage.CameraDirected = true;
                // 陈列态：贴到舱前，确认单元几何与材质映射（该机位只看舱本身，不判遮挡）。
                Vector3 look = bay.position + Vector3.up * .3f;
                g.Stage.View.transform.position = look + new Vector3(0f, 2.2f, -7.5f);
                g.Stage.View.transform.LookAt(look);
                g.Stage.View.fieldOfView = 50;
                yield return Photo(dir, "trophy-bay");
                // 飞行态：motion 必须开着才跑弧线（motion=0 直接就位，不动画）。
                g.Preferences.motion = 1;
                g.ApplyPreferences();
                g.Stage.Celebrate(g.Stage.Fighters[0]);
                yield return new WaitForSecondsRealtime(1.2f);
                g.Stage.View.transform.position = new Vector3(7f, 4f, 0f);
                g.Stage.View.transform.LookAt(cup.position);
                yield return Photo(dir, "trophy-flight");
                yield return new WaitForSecondsRealtime(2.2f);
                Vector3 c = cup.position;
                g.Stage.View.transform.position = c + Vector3.back * 4.2f + Vector3.up * 1.5f;
                g.Stage.View.transform.LookAt(c + Vector3.up * .3f);
                yield return Photo(dir, "trophy-award");
                g.Preferences.motion = 0;
                g.ApplyPreferences();
            }
            finally
            {
                g.Stage.EndCombat();
                g.UI.Root.gameObject.SetActive(true);
                g.Stage.CameraDirected = false;
                g.Stage.RestoreView(restore);
                g.Preferences.motion = 1;
                g.ApplyPreferences();
            }
        }

        static Transform FindDeep(Transform parent, string name)
        {
            if (parent.name == name) return parent;
            for (int i = 0; i < parent.childCount; i++)
            {
                var hit = FindDeep(parent.GetChild(i), name);
                if (hit != null) return hit;
            }
            return null;
        }
    }
}
