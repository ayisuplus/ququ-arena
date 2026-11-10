using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace QuQu
{
    public sealed class StationRingReflectionProbe : MonoBehaviour
    {
        public string OutputDirectory;
        readonly JArray checks = new JArray();
        readonly List<float> frames = new List<float>();
        StationLandscapeReflections reflections;
        StationRotatingRing[] rings;
        Camera camera;
        RenderTexture viewTarget;
        GameObject marker, sphere;
        Material markerMaterial, mirrorMaterial;
        bool originalRealtime;
        float started;
        Color capturedColor;
        int renderedFrames;

        void LateUpdate()
        {
            if (camera && camera.targetTexture) { camera.Render(); renderedFrames++; }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args = Environment.GetCommandLineArgs();
            int at = Array.IndexOf(args, "--station-reflection-probe-output");
            if (at < 0 || at + 1 >= args.Length || !Path.IsPathRooted(args[at + 1])) return;
            new GameObject("V015 reflection validation").AddComponent<StationRingReflectionProbe>().OutputDirectory = args[at + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(OutputDirectory);
            started = Time.realtimeSinceStartup;
            reflections = FindFirstObjectByType<StationLandscapeReflections>();
            rings = FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            Check("26 authored reflection volumes", reflections.Probes.Length == 26);
            var player = FindFirstObjectByType<StationGrayboxWalker>();
            player.MovementLocked = true;
            foreach (var ring in rings) { ring.enabled = false; ring.transform.rotation = Quaternion.identity; }
            camera = new GameObject("Reflection validation camera").AddComponent<Camera>();
            camera.CopyFrom(player.View); camera.enabled = false; camera.fieldOfView = 65; camera.farClipPlane = 1800;
            var from = player.View.GetComponent<UniversalAdditionalCameraData>();
            var to = camera.gameObject.AddComponent<UniversalAdditionalCameraData>();
            to.SetRenderer(1); to.antialiasing = from.antialiasing; to.antialiasingQuality = from.antialiasingQuality;
            to.renderPostProcessing = from.renderPostProcessing; to.volumeLayerMask = from.volumeLayerMask;
            to.volumeTrigger = from.volumeTrigger; to.stopNaN = from.stopNaN; to.dithering = from.dithering;
            to.requiresColorOption = from.requiresColorOption; to.requiresDepthOption = from.requiresDepthOption;
            // Batchmode needs a continuously rendered target for time-sliced captures.
            viewTarget = new RenderTexture(1200, 800, 24);
            camera.targetTexture = viewTarget;
            camera.transform.SetPositionAndRotation(player.View.transform.position, player.View.transform.rotation);
            camera.enabled = true;
            reflections.enabled = false;
            originalRealtime = QualitySettings.realtimeReflectionProbes;
            foreach (var p in reflections.Probes) p.enabled = false;
            for (int frame = 0; frame < 6; frame++) yield return new WaitForEndOfFrame();
            yield return CaptureViews("before");
            if (checks.Any(c => !(bool)c["passed"])) { Save("complete"); if (!Application.isEditor) Application.Quit(1); yield break; }
            foreach (var p in reflections.Probes) p.enabled = true;
            reflections.enabled = true;
            ApplyCaptureDiagnosticMode();
            yield return new WaitForEndOfFrame();
            bool initialized = reflections.RuntimeProbes.All(p => p && p.texture && p.customBakedTexture is RenderTexture);
            Check("startup native targets available before first capture", initialized && reflections.CompletedCaptures == 0,
                string.Join(";", reflections.RuntimeProbes.Select(p => p ? p.name + ":" + p.enabled + ":" + (p.texture ? p.texture.name : "null") : "missing")));
            if (!initialized) { Save("complete"); if (!Application.isEditor) Application.Quit(1); yield break; }
            var ids = reflections.RuntimeProbes.Select(p => p.texture.GetInstanceID()).ToArray();
            Check("all startup cubemaps initialized", reflections.RuntimeProbes.All(p => ReadFace((RenderTexture)p.customBakedTexture).maxColorComponent > .0001f));
            int until = reflections.CompletedCaptures + 52;
            float nextReport = 0;
            while (reflections.CompletedCaptures < until && Time.realtimeSinceStartup - started < 120)
            {
                yield return null; frames.Add(Time.unscaledDeltaTime * 1000);
                if (Time.realtimeSinceStartup >= nextReport) { Save("progress"); nextReport = Time.realtimeSinceStartup + 2; }
            }
            Check("two complete refresh cycles", reflections.CompletedCaptures >= until);
            if (reflections.CompletedCaptures < until) { Save("complete"); if (!Application.isEditor) Application.Quit(1); yield break; }
            Check("one stable texture per probe", reflections.RuntimeProbes.Select(p => p.texture.GetInstanceID()).SequenceEqual(ids));
            yield return CaptureViews("final");
            var positions = reflections.RuntimeProbes.Select(p => p.transform.position).ToArray();
            var updates = reflections.RuntimeProbes.Select(p => p.texture.updateCount).ToArray();
            foreach (var ring in rings) { ring.transform.rotation = Quaternion.Euler(0, ring.RingId == "v015-r2" ? -97 : 97, 0); ring.enabled = true; }
            until = reflections.CompletedCaptures + 27;
            while (reflections.CompletedCaptures < until && Time.realtimeSinceStartup - started < 150) yield return null;
            Check("all textures refreshed after rotation", reflections.RuntimeProbes.Select((p, i) => p.texture.updateCount > updates[i]).All(v => v));
            Check("moving groups change probe positions", reflections.RuntimeProbes.Count(p => p.GetComponentInParent<StationRotatingRing>()) == 21 && reflections.RuntimeProbes.Select((p, i) => !p.GetComponentInParent<StationRotatingRing>() || Vector3.Distance(p.transform.position, positions[i]) > 1).All(v => v));
            Check("rotation rendering enabled", GraphicsSettings.GetRenderPipelineSettings<URPReflectionProbeSettings>().UseReflectionProbeRotation && SupportedRenderingFeatures.active.reflectionProbeModes == SupportedRenderingFeatures.ReflectionProbeModes.Rotation);
            foreach (var ring in rings) ring.enabled = false;

            var probe = reflections.RuntimeProbes[4];
            marker = GameObject.CreatePrimitive(PrimitiveType.Cube); Destroy(marker.GetComponent<Collider>());
            marker.name = "Temporary reflection color enclosure";
            marker.transform.position = probe.transform.position; marker.transform.localScale = Vector3.one * 12;
            markerMaterial = new Material(Shader.Find("Universal Render Pipeline/Unlit")); markerMaterial.SetFloat("_Cull", 0);
            marker.GetComponent<Renderer>().sharedMaterial = markerMaterial;
            sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere); Destroy(sphere.GetComponent<Collider>());
            sphere.name = "Temporary reflection validation mirror";
            sphere.transform.position = probe.transform.position + Vector3.forward;
            sphere.transform.localScale = Vector3.one * 2;
            mirrorMaterial = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            mirrorMaterial.SetFloat("_Metallic", 1); mirrorMaterial.SetFloat("_Smoothness", 1);
            sphere.GetComponent<Renderer>().sharedMaterial = mirrorMaterial;
            foreach (bool red in new[] { true, false })
            {
                sphere.SetActive(false);
                markerMaterial.SetColor("_BaseColor", red ? Color.red : Color.blue); marker.SetActive(true);
                until = reflections.CompletedCaptures + 27;
                while (reflections.CompletedCaptures < until && Time.realtimeSinceStartup - started < 200) yield return null;
                var sample = ReadFace((RenderTexture)probe.customBakedTexture);
                Check((red ? "red" : "blue") + " geometry captured in cubemap", red ? sample.r > .5f && sample.b < .2f : sample.b > .5f && sample.r < .2f, sample.ToString());
                marker.SetActive(false);
                sphere.SetActive(true);
                camera.transform.position = probe.transform.position + new Vector3(4, 0, 5);
                camera.transform.LookAt(sphere.transform.position);
                yield return new WaitForEndOfFrame();
                yield return Capture(red ? "mirror-red" : "mirror-blue");
                var reflected = capturedColor;
                Check((red ? "red" : "blue") + " update visible on mirror", red ? reflected.r > reflected.b + .15f : reflected.b > reflected.r + .15f, reflected.ToString());
            }
            Destroy(marker); Destroy(sphere); Destroy(markerMaterial); Destroy(mirrorMaterial);
            Check("texture identity preserved through color updates", reflections.RuntimeProbes.Select(p => p.texture.GetInstanceID()).SequenceEqual(ids));
            while (!reflections.CapturePending && Time.realtimeSinceStartup - started < 205) yield return null;
            Check("disable exercised during pending capture", reflections.CapturePending);
            var oldTextures = reflections.RuntimeProbes.Select(p => p.customBakedTexture).ToArray();
            var oldProbes = reflections.RuntimeProbes.ToArray();
            reflections.enabled = false;
            for (int frame = 0; frame < 4; frame++) yield return new WaitForEndOfFrame();
            Check("runtime objects and textures released", oldTextures.All(t => !t) && oldProbes.All(p => !p));
            Check("baked fallback restored", reflections.Probes.All(p => p.enabled && p.mode == ReflectionProbeMode.Custom && p.texture == p.customBakedTexture));
            Check("quality setting restored", QualitySettings.realtimeReflectionProbes == originalRealtime);
            reflections.enabled = true;
            ApplyCaptureDiagnosticMode();
            until = reflections.CompletedCaptures + 27;
            while (reflections.CompletedCaptures < until && Time.realtimeSinceStartup - started < 240) yield return null;
            Check("re-enable refreshes all probes", reflections.CompletedCaptures >= until && reflections.RuntimeProbes.Length == 26);
            var live = FindObjectsByType<ReflectionProbe>(FindObjectsSortMode.None).Where(p => p.enabled).ToArray();
            Check("no duplicate live display probes", live.Count(p => p.size.sqrMagnitude > 0) == 26);
            Check("one capture probe without visible influence", live.Count(p => p.size == Vector3.zero && p.intensity == 0 && p.mode == ReflectionProbeMode.Realtime) == 1);
            foreach (var ring in rings) ring.enabled = true;
            camera.enabled = false; camera.targetTexture = null;
            viewTarget.Release(); Destroy(viewTarget);
            Destroy(camera.gameObject); player.MovementLocked = false;
            Save("complete");
            if (!Application.isEditor) Application.Quit(checks.All(c => (bool)c["passed"]) ? 0 : 1);
        }

        void ApplyCaptureDiagnosticMode()
        {
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "--station-reflection-no-timeslicing") < 0) return;
            reflections.GetComponentsInChildren<ReflectionProbe>().Single(p => p.mode == ReflectionProbeMode.Realtime)
                .timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
        }

        static Color ReadFace(RenderTexture cube)
        {
            var previous = RenderTexture.active;
            Graphics.SetRenderTarget(cube, 0, CubemapFace.PositiveZ);
            var image = new Texture2D(1, 1, TextureFormat.RGBAHalf, false, true);
            image.ReadPixels(new Rect(cube.width / 2, cube.height / 2, 1, 1), 0, 0); image.Apply();
            var color = image.GetPixel(0, 0); Destroy(image); RenderTexture.active = previous;
            return color;
        }

        IEnumerator Capture(string name)
        {
            var previous = RenderTexture.active;
            var image = new Texture2D(1200, 800, TextureFormat.RGB24, false);
            try
            {
                for (int frame = 0; frame < 3; frame++) yield return new WaitForEndOfFrame();
                RenderTexture.active = viewTarget; image.ReadPixels(new Rect(0, 0, 1200, 800), 0, 0); image.Apply();
                File.WriteAllBytes(Path.Combine(OutputDirectory, name + ".png"), image.EncodeToPNG());
                capturedColor = image.GetPixel(600, 400);
                bool visible = false;
                for (int y = 40; y < 800 && !visible; y += 80)
                    for (int x = 40; x < 1200; x += 80)
                        if (image.GetPixel(x, y).maxColorComponent > .02f) { visible = true; break; }
                Check(name + " contains rendered pixels", visible);
            }
            finally { RenderTexture.active = previous; Destroy(image); }
        }

        IEnumerator CaptureViews(string prefix)
        {
            foreach (var view in new[] {
                ("cafe and observation gallery", "cafe", new Vector3(20,1.7f,12), new Vector3(10,2,2)),
                ("r3-upper-observation", "observation", new Vector3(3,9.1f,-7), new Vector3(-7,8.2f,-5)),
                ("glass ecology garden", "garden", new Vector3(18,1.7f,-17), new Vector3(0,2.5f,0)),
                ("fp-dock-and-cargo", "dock", new Vector3(-6.8f,1.7f,102), new Vector3(-7,8,127)) })
            {
                var frame = GameObject.Find("V015 package - " + view.Item1).transform;
                camera.transform.position = frame.TransformPoint(view.Item3); camera.transform.LookAt(frame.TransformPoint(view.Item4));
                yield return Capture(prefix + "-" + view.Item2);
            }
        }

        void Check(string name, bool passed, string detail = "")
        {
            checks.Add(new JObject { ["name"] = name, ["passed"] = passed, ["detail"] = detail }); Save("progress");
        }
        void Save(string state)
        {
            var ordered = frames.OrderBy(v => v).ToArray();
            File.WriteAllText(Path.Combine(OutputDirectory, "reflections.json"), new JObject {
                ["state"] = state, ["passed"] = state == "complete" && checks.All(c => (bool)c["passed"]),
                ["seconds"] = Time.realtimeSinceStartup - started, ["checks"] = checks,
                ["completedCaptures"] = reflections ? reflections.CompletedCaptures : 0,
                ["renderedFrames"] = renderedFrames,
                ["nativeRendering"] = new JObject {
                    ["frameCount"] = Time.frameCount, ["renderedFrameCount"] = Time.renderedFrameCount,
                    ["batchMode"] = Application.isBatchMode, ["focused"] = Application.isFocused,
                    ["runInBackground"] = Application.runInBackground,
                    ["cameras"] = Camera.allCamerasCount,
                    ["quality"] = QualitySettings.names[QualitySettings.GetQualityLevel()],
                    ["realtimeReflections"] = QualitySettings.realtimeReflectionProbes,
                    ["pipeline"] = GraphicsSettings.currentRenderPipeline.name,
                    ["renderInterval"] = OnDemandRendering.renderFrameInterval,
                    ["capturePending"] = reflections && reflections.CapturePending
                },
                ["captureMode"] = reflections ? reflections.GetComponentsInChildren<ReflectionProbe>()
                    .FirstOrDefault(p => p.mode == ReflectionProbeMode.Realtime)?.timeSlicingMode.ToString() : null,
                ["frameSamples"] = ordered.Length, ["medianMs"] = ordered.Length == 0 ? 0 : ordered[ordered.Length/2],
                ["p95Ms"] = ordered.Length == 0 ? 0 : ordered[(int)((ordered.Length-1)*.95f)]
            }.ToString());
        }
    }
}
