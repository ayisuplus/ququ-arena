using System.Collections.Generic;
using UnityEngine;

namespace QuQu
{
    // Runtime combat particles. Shuriken only, pooled, hard-capped by a particle budget.
    // The project had zero particle systems; every hit read as animation-only contact.
    public class ArenaCombatVFX : MonoBehaviour
    {
        public const int MaxLiveParticles = 420;   // PC budget; mobile profile should halve this.
        public bool Enabled = true;

        readonly List<ParticleSystem> impacts = new List<ParticleSystem>();
        readonly List<ParticleSystem> sparks = new List<ParticleSystem>();
        readonly List<ParticleSystem> dust = new List<ParticleSystem>();
        readonly List<Object> owned = new List<Object>();
        Texture2D disc, smoke;
        Material sparkMaterial, dustMaterial;
        int impactCursor, sparkCursor, dustCursor;

        public static ArenaCombatVFX Create(Transform parent)
        {
            var go = new GameObject("Combat particle stage");
            go.transform.SetParent(parent, false);
            var vfx = go.AddComponent<ArenaCombatVFX>();
            vfx.Build();
            return vfx;
        }

        void Build()
        {
            disc = SoftDisc(64, 2.2f); smoke = SoftDisc(64, 1.15f);
            owned.Add(disc); owned.Add(smoke);
            sparkMaterial = new Material(Shader.Find("QuQu/Arena Spark")) { name = "Combat spark" };
            sparkMaterial.SetTexture("_BaseMap", disc);
            sparkMaterial.SetFloat("_SoftFade", 1.1f);
            sparkMaterial.SetFloat("_Exposure", 1.35f);
            dustMaterial = new Material(Shader.Find("QuQu/Arena Spark")) { name = "Combat dust" };
            dustMaterial.SetTexture("_BaseMap", smoke);
            dustMaterial.SetFloat("_SoftFade", 1.6f);
            dustMaterial.SetFloat("_Exposure", .55f);
            owned.Add(sparkMaterial); owned.Add(dustMaterial);
            for (int i = 0; i < 3; i++)
            {
                impacts.Add(MakeSystem("Impact burst " + i, sparkMaterial, 48, .55f, 4.6f, .29f));
                sparks.Add(MakeSystem("Victory sparks " + i, sparkMaterial, 96, 1.5f, 3.1f, .10f));
                dust.Add(MakeSystem("Entrance dust " + i, dustMaterial, 32, .9f, 1.5f, .42f));
            }
        }

        ParticleSystem MakeSystem(string name, Material material, int maxParticles, float lifetime, float speed, float size)
        {
            var go = new GameObject(name); go.transform.SetParent(transform, false);
            var system = go.AddComponent<ParticleSystem>();
            var main = system.main;
            main.playOnAwake = false; main.loop = false;
            main.maxParticles = maxParticles;
            main.startLifetime = new ParticleSystem.MinMaxCurve(lifetime * .65f, lifetime);
            main.startSpeed = new ParticleSystem.MinMaxCurve(speed * .45f, speed);
            main.startSize = new ParticleSystem.MinMaxCurve(size * .5f, size);
            main.startColor = new ParticleSystem.MinMaxGradient(Color.white);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = .55f;
            main.scalingMode = ParticleSystemScalingMode.Local;

            var emission = system.emission;
            emission.rateOverTime = 0;
            emission.enabled = true;

            var shape = system.shape;
            shape.enabled = true;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = .09f;
            shape.randomDirectionAmount = .8f;

            var velocity = system.velocityOverLifetime;
            velocity.enabled = true;
            velocity.space = ParticleSystemSimulationSpace.World;
            velocity.y = new ParticleSystem.MinMaxCurve(.7f, 2.1f);

            var limit = system.limitVelocityOverLifetime;
            limit.enabled = true; limit.dampen = .22f; limit.limit = 7;

            var overLife = system.colorOverLifetime;
            overLife.enabled = true;
            overLife.color = Fade();

            var sizing = system.sizeOverLifetime;
            sizing.enabled = true;
            sizing.size = new ParticleSystem.MinMaxCurve(1, new AnimationCurve(
                new Keyframe(0, .35f), new Keyframe(.18f, 1f), new Keyframe(1, .05f)));

            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.sharedMaterial = material;
            renderer.renderMode = ParticleSystemRenderMode.Billboard;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return system;
        }

        static ParticleSystem.MinMaxGradient Fade()
        {
            var gradient = new Gradient();
            gradient.SetKeys(
                new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) },
                new[] { new GradientAlphaKey(1, 0), new GradientAlphaKey(.85f, .35f), new GradientAlphaKey(0, 1) });
            return new ParticleSystem.MinMaxGradient(gradient);
        }

        static Texture2D SoftDisc(int size, float power)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            texture.name = "Arena particle disc";
            texture.filterMode = FilterMode.Trilinear;
            texture.wrapMode = TextureWrapMode.Clamp;
            var pixels = new Color32[size * size];
            float center = (size - 1) * .5f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x - center) / center, dy = (y - center) / center;
                    float falloff = Mathf.Clamp01(1 - Mathf.Sqrt(dx * dx + dy * dy));
                    byte value = (byte)Mathf.RoundToInt(Mathf.Pow(falloff, power) * 255);
                    pixels[y * size + x] = new Color32(255, 255, 255, value);
                }
            texture.SetPixels32(pixels);
            texture.Apply(false, true);
            return texture;
        }

        int LiveParticles()
        {
            int total = 0;
            foreach (var system in impacts) total += system.particleCount;
            foreach (var system in sparks) total += system.particleCount;
            foreach (var system in dust) total += system.particleCount;
            return total;
        }

        void Fire(List<ParticleSystem> pool, ref int cursor, Vector3 point, Color tint, float scale, int count, bool primary)
        {
            if (!Enabled || LiveParticles() > MaxLiveParticles) return;
            var system = pool[cursor = (cursor + 1) % pool.Count];
            system.transform.position = point;
            system.transform.localScale = Vector3.one * Mathf.Max(.25f, scale);
            var emission = system.emission;
            emission.SetBursts(new[] { new ParticleSystem.Burst(0f, (short)Mathf.Max(1, count)) });
            var main = system.main;
            main.startColor = new ParticleSystem.MinMaxGradient(tint);
            system.time = 0;
            system.Play();
        }

        // Contact frame of a slap. ArenaStage.Impact is the single VFX bus for every attack.
        public void Impact(Vector3 point, Color tint, float scale, bool blocked)
        {
            // A blocked hit gets a restrained puff; a clean hit gets light and debris.
            Color color = Color.Lerp(tint, Color.white, blocked ? .35f : .6f);
            Fire(impacts, ref impactCursor, point, color, scale, blocked ? 12 : 34, true);
            if (!blocked) Fire(dust, ref dustCursor, point, new Color(.72f, .78f, .84f), scale * .9f, 10, true);
        }

        public void Victory(Vector3 point, Color tint)
            => Fire(sparks, ref sparkCursor, point + Vector3.up * .2f, Color.Lerp(tint, Color.white, .45f), 1f, 64, true);

        public void Entrance(Vector3 point, Color tint)
            => Fire(dust, ref dustCursor, point, new Color(.62f, .7f, .78f), 1f, 22, true);

        public void Stop()
        {
            foreach (var pool in new[] { impacts, sparks, dust })
                foreach (var system in pool) system.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
        }

        void OnDestroy()
        {
            foreach (var asset in owned) if (asset) Destroy(asset);
        }
    }
}
