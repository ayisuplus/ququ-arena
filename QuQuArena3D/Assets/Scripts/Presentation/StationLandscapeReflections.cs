using UnityEngine;
using UnityEngine.Rendering;

namespace QuQu
{
    // One time-sliced capture at a time; authored probes remain the editor/disabled fallback.
    public sealed class StationLandscapeReflections : MonoBehaviour
    {
        public ReflectionProbe[] Probes;
        public int CompletedCaptures { get; private set; }
        public int CompletedCycles { get; private set; }
        public bool CapturePending => pending >= 0;
        public ReflectionProbe[] RuntimeProbes { get; private set; }
        RenderTexture[] textures;
        ReflectionProbe capture;
        bool[] sourceEnabled;
        int next, pending = -1;
        float nextTime;
        bool previousRealtime;
        SupportedRenderingFeatures.ReflectionProbeModes previousModes;

        void OnEnable()
        {
            previousRealtime = QualitySettings.realtimeReflectionProbes;
            QualitySettings.realtimeReflectionProbes = true;
            previousModes = SupportedRenderingFeatures.active.reflectionProbeModes;
            SupportedRenderingFeatures.active.reflectionProbeModes = SupportedRenderingFeatures.ReflectionProbeModes.Rotation;
            RuntimeProbes = new ReflectionProbe[Probes.Length];
            textures = new RenderTexture[Probes.Length];
            sourceEnabled = new bool[Probes.Length];
            for (int i = 0; i < Probes.Length; i++)
            {
                var source = Probes[i];
                sourceEnabled[i] = source.enabled;
                var texture = new RenderTexture(source.resolution, source.resolution, 16, RenderTextureFormat.ARGBHalf)
                {
                    name = source.name + " runtime cubemap", dimension = TextureDimension.Cube,
                    useMipMap = true, autoGenerateMips = false
                };
                textures[i] = texture;
                texture.Create();
                if (!ReflectionProbe.BlendCubemap(source.customBakedTexture, source.customBakedTexture, 0, texture))
                {
                    Debug.LogError("Landscape reflection fallback could not initialize", source);
                    enabled = false;
                    return;
                }
                // URP 17.3 caches texture identity per probe. A fresh runtime probe owns one
                // stable texture, so switching baked/realtime sources cannot leave a stale atlas.
                source.enabled = false;
                var probe = Instantiate(source, source.transform.parent);
                RuntimeProbes[i] = probe;
                probe.name = source.name + " runtime";
                probe.mode = ReflectionProbeMode.Custom;
                probe.customBakedTexture = texture;
                probe.enabled = sourceEnabled[i];
            }
            capture = new GameObject("V015 reflection capture").AddComponent<ReflectionProbe>();
            capture.transform.SetParent(transform, false);
            capture.mode = ReflectionProbeMode.Realtime;
            capture.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
            capture.timeSlicingMode = ReflectionProbeTimeSlicingMode.IndividualFaces;
            capture.size = Vector3.zero;
            capture.intensity = 0;
            next = 0;
            pending = -1;
            CompletedCaptures = CompletedCycles = 0;
            nextTime = Time.unscaledTime + .5f;
        }

        void LateUpdate()
        {
            if (pending >= 0)
            {
                if (!capture.IsFinishedRendering(pending)) return;
                textures[next].IncrementUpdateCount();
                pending = -1;
                CompletedCaptures++;
                next++;
                if (next == Probes.Length) { next = 0; CompletedCycles++; }
                nextTime = Time.unscaledTime + .5f;
            }
            if (Time.unscaledTime < nextTime) return;
            var probe = RuntimeProbes[next];
            capture.transform.SetPositionAndRotation(probe.transform.position, probe.transform.rotation);
            capture.resolution = probe.resolution;
            capture.hdr = probe.hdr;
            capture.nearClipPlane = probe.nearClipPlane;
            capture.farClipPlane = probe.farClipPlane;
            capture.shadowDistance = probe.shadowDistance;
            capture.cullingMask = probe.cullingMask;
            capture.clearFlags = probe.clearFlags;
            capture.backgroundColor = probe.backgroundColor;
            pending = capture.RenderProbe(textures[next]);
            if (pending < 0)
            {
                Debug.LogError("Landscape reflection capture could not start", probe);
                enabled = false;
            }
        }

        void OnDisable()
        {
            if (capture) { capture.enabled = false; Destroy(capture.gameObject); }
            if (RuntimeProbes != null)
                for (int i = 0; i < RuntimeProbes.Length; i++)
                {
                    if (RuntimeProbes[i])
                    {
                        RuntimeProbes[i].enabled = false;
                        Destroy(RuntimeProbes[i].gameObject);
                        if (Probes[i]) Probes[i].enabled = sourceEnabled[i];
                    }
                    if (textures[i]) Destroy(textures[i]);
                }
            RuntimeProbes = null;
            QualitySettings.realtimeReflectionProbes = previousRealtime;
            SupportedRenderingFeatures.active.reflectionProbeModes = previousModes;
            pending = -1;
        }
    }
}
