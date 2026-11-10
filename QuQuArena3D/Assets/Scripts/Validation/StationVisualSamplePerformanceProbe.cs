using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Profiling;
using UnityEngine.Rendering;

namespace QuQu
{
    // Runs only in an isolated v012 Player launched with an explicit output directory.
    public sealed class StationVisualSamplePerformanceProbe : MonoBehaviour
    {
        string output;
        int holdSeconds;
        JObject report;
        Camera mainView;
        int mainRenders, feedRenders;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-v012-performance-output");
            if (at < 0 || at + 1 >= args.Length || !Path.IsPathRooted(args[at + 1])) return;
            var secondsAt = Array.IndexOf(args, "--station-v012-performance-seconds");
            if (secondsAt < 0 || secondsAt + 1 >= args.Length ||
                !int.TryParse(args[secondsAt + 1], out var seconds) || seconds < 10 || seconds > 1800) return;
            var probe = new GameObject("v012 performance Player probe")
                .AddComponent<StationVisualSamplePerformanceProbe>();
            probe.output = args[at + 1];
            probe.holdSeconds = seconds;
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            Application.runInBackground = true;
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = -1;
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var broadcast = FindFirstObjectByType<StationLoungeBroadcast>();
            report = new JObject {
                ["scene"] = UnityEngine.SceneManagement.SceneManager.GetActiveScene().name,
                ["graphics"] = SystemInfo.graphicsDeviceName,
                ["graphicsApi"] = SystemInfo.graphicsDeviceType.ToString(),
                ["width"] = Screen.width, ["height"] = Screen.height,
                ["holdSecondsRequested"] = holdSeconds,
                ["quality"] = QualitySettings.names[QualitySettings.GetQualityLevel()],
                ["vSync"] = QualitySettings.vSyncCount,
                ["targetFrameRate"] = Application.targetFrameRate,
                ["windows"] = new JArray()
            };
            if (report["scene"].Value<string>() != "BlackHoleStationVisualSampleV012A1" ||
                !walker || !walker.View || !broadcast || !broadcast.Screen || walker.ThirdPersonMode)
            {
                report["error"] = "v012 visual scene, first-person view or lounge broadcast missing";
                Save();
                Application.Quit(1);
                yield break;
            }

            walker.enabled = false;
            mainView = walker.View;
            RenderPipelineManager.endCameraRendering += CountRender;
            walker.transform.position = new Vector3(205f, .06f, -205f);
            walker.View.transform.localPosition = new Vector3(0f, 1.63f, 0f);
            walker.Face(broadcast.Screen.bounds.center);
            report["eye"] = walker.View.transform.position.ToString("F3");
            report["screenDistance"] = Vector3.Distance(walker.View.transform.position,
                broadcast.Screen.bounds.center);

            broadcast.enabled = false;
            yield return new WaitForSecondsRealtime(2f);
            yield return Sample("broadcast-off", 10);
            broadcast.enabled = true;
            yield return new WaitForSecondsRealtime(2f);
            yield return Sample("broadcast-on", 10);
            for (int remaining = holdSeconds, minute = 1; remaining > 0; minute++)
            {
                var seconds = Mathf.Min(remaining, 60);
                yield return Sample("sustained-" + minute.ToString("D2"), seconds);
                remaining -= seconds;
            }
            report["complete"] = true;
            Save();
            Application.Quit(0);
        }

        IEnumerator Sample(string label, int seconds)
        {
            mainRenders = 0;
            feedRenders = 0;
            var frameMs = new List<double>();
            var gpuMs = new List<double>();
            var cpuMs = new List<double>();
            var invalidGpuTimings = 0;
            var timing = new FrameTiming[1];
            var start = Time.realtimeSinceStartupAsDouble;
            while (Time.realtimeSinceStartupAsDouble - start < seconds)
            {
                yield return null;
                frameMs.Add(Time.unscaledDeltaTime * 1000.0);
                FrameTimingManager.CaptureFrameTimings();
                if (FrameTimingManager.GetLatestTimings(1, timing) == 0) continue;
                if (timing[0].gpuFrameTime > 0 && timing[0].gpuFrameTime < 1000)
                    gpuMs.Add(timing[0].gpuFrameTime);
                else if (timing[0].gpuFrameTime >= 1000) invalidGpuTimings++;
                if (timing[0].cpuFrameTime > 0) cpuMs.Add(timing[0].cpuFrameTime);
            }
            ((JArray)report["windows"]).Add(new JObject {
                ["label"] = label, ["broadcastEnabled"] = FindFirstObjectByType<StationLoungeBroadcast>().enabled,
                ["seconds"] = Time.realtimeSinceStartupAsDouble - start,
                ["frames"] = frameMs.Count,
                ["mainCameraRenders"] = mainRenders,
                ["feedCameraRenders"] = feedRenders,
                ["invalidGpuTimings"] = invalidGpuTimings,
                ["frameMs"] = Stats(frameMs), ["gpuMs"] = Stats(gpuMs), ["cpuMs"] = Stats(cpuMs),
                ["unityAllocatedBytes"] = Profiler.GetTotalAllocatedMemoryLong(),
                ["unityReservedBytes"] = Profiler.GetTotalReservedMemoryLong(),
                ["managedBytes"] = GC.GetTotalMemory(false)
            });
            Save();
        }

        void CountRender(ScriptableRenderContext context, Camera camera)
        {
            if (camera == mainView) mainRenders++;
            else if (camera.name == "Lounge arena feed camera") feedRenders++;
        }

        void OnDestroy() => RenderPipelineManager.endCameraRendering -= CountRender;

        static JObject Stats(List<double> values)
        {
            if (values.Count == 0) return new JObject { ["count"] = 0 };
            values.Sort();
            double sum = 0;
            var slowerThan60Hz = 0;
            foreach (var value in values) sum += value;
            foreach (var value in values) if (value > 1000.0 / 60.0) slowerThan60Hz++;
            return new JObject {
                ["count"] = values.Count,
                ["slowerThan60Hz"] = slowerThan60Hz,
                ["mean"] = sum / values.Count,
                ["p50"] = values[(int)((values.Count - 1) * .50)],
                ["p95"] = values[(int)((values.Count - 1) * .95)],
                ["p99"] = values[(int)((values.Count - 1) * .99)],
                ["max"] = values[values.Count - 1]
            };
        }

        void Save() => File.WriteAllText(Path.Combine(output, "performance.json"), report.ToString());
    }
}
