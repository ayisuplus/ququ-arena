using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace QuQu
{
    // Two-grade colour direction: neutral research-station look by default, warm combat
    // grade while a round is live. Implemented as a separate global Volume whose weight
    // starts at 0, so the existing look is untouched until combat starts.
    public class ArenaCombatGrade : MonoBehaviour
    {
        public bool Enabled = true;
        public float FadeSeconds = .45f;

        Volume volume;
        ColorAdjustments grading;
        Bloom bloom;
        Vignette vignette;
        ChromaticAberration chroma;
        float target, current, pulse;

        public static ArenaCombatGrade Create(Transform parent)
        {
            var go = new GameObject("Combat colour grade");
            go.transform.SetParent(parent, false);
            return go.AddComponent<ArenaCombatGrade>();
        }

        void Awake()
        {
            volume = gameObject.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.weight = 0;
            volume.priority = 1;
            volume.profile = ScriptableObject.CreateInstance<VolumeProfile>();
            grading = volume.profile.Add<ColorAdjustments>();
            bloom = volume.profile.Add<Bloom>();
            vignette = volume.profile.Add<Vignette>();
            chroma = volume.profile.Add<ChromaticAberration>();
            Apply(0, 0);
        }

        public void SetCombat(bool combat) => target = combat ? 1 : 0;

        // One-frame kick on contact: brief bloom and vignette lift, decaying on its own.
        public void Pulse(float strength) => pulse = Mathf.Clamp01(Mathf.Max(pulse, strength));

        void Update()
        {
            if (!volume) return;
            current = Mathf.MoveTowards(current, target, Time.unscaledDeltaTime / Mathf.Max(.01f, FadeSeconds));
            pulse = Mathf.MoveTowards(pulse, 0, Time.unscaledDeltaTime * 2.6f);
            float weight = Enabled ? Mathf.Clamp01(current + pulse * .45f) : 0;
            volume.weight = weight;
            Apply(current, pulse);
        }

        void Apply(float blend, float kick)
        {
            if (grading)
            {
                // Warm tension grade: amber highlights, slightly lifted saturation.
                grading.colorFilter.Override(new Color(1.06f, .92f, .80f, 1));
                grading.postExposure.Override(.02f * blend);
                grading.contrast.Override(6 * blend);
                grading.saturation.Override(14 * blend);
            }
            if (bloom)
            {
                bloom.threshold.Override(Mathf.Lerp(1.65f, 1.05f, blend));
                bloom.intensity.Override(Mathf.Lerp(.14f, .34f, blend) + kick * .22f);
                bloom.scatter.Override(Mathf.Lerp(.6f, .72f, blend));
            }
            if (vignette)
            {
                vignette.intensity.Override(Mathf.Lerp(.06f, .30f, blend) + kick * .16f);
                vignette.smoothness.Override(.52f);
                vignette.color.Override(new Color(.05f, .02f, .06f, 1));
            }
            if (chroma) chroma.intensity.Override(.08f * kick);
        }

        void OnDestroy()
        {
            if (volume && volume.profile) Destroy(volume.profile);
        }
    }
}
