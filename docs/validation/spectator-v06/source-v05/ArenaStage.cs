using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace QuQu
{
    public class ArenaStage : MonoBehaviour
    {
        public Camera View;
        public readonly List<ArenaFighter> Fighters = new List<ArenaFighter>();
        public float Motion = 1;
        public bool Orbit;
        public bool Spectating { get; private set; }
        public ArenaFighter Focused { get; private set; }
        public System.Action<bool> OnImpact;
        readonly Queue<(ArenaFighter fighter, float score)> attacks = new Queue<(ArenaFighter, float)>();
        float nextAttack, cameraKick;
        float yaw = 0, pitch = 31, distance = 17;
        Transform scenery;
        public static Material Mat(Color color, float emission = 0)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit")); m.color = color;
            m.SetFloat("_Smoothness", .65f); m.SetFloat("_Metallic", .35f);
            if (emission > 0) { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", color * emission); }
            return m;
        }
        public static GameObject Shape(Transform parent, string name, PrimitiveType type, Vector3 position, Vector3 scale, Material material)
        {
            var g = GameObject.CreatePrimitive(type); g.name = name; g.transform.SetParent(parent, false);
            g.transform.localPosition = position; g.transform.localScale = scale;
            g.GetComponent<Renderer>().sharedMaterial = material;
            Destroy(g.GetComponent<Collider>()); return g;
        }
        public static LineRenderer Ring(Transform parent, string name, float radius, float y, Color color, float width = .035f, int points = 96)
        {
            var go = new GameObject(name); go.transform.SetParent(parent, false);
            var line = go.AddComponent<LineRenderer>(); line.useWorldSpace = false; line.loop = true; line.positionCount = points;
            line.sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Unlit")); line.sharedMaterial.color = color * 1.5f;
            line.startWidth = line.endWidth = width;
            for (int i = 0; i < points; i++) { float a = i * Mathf.PI * 2 / points; line.SetPosition(i, new Vector3(Mathf.Sin(a) * radius, y, Mathf.Cos(a) * radius)); }
            return line;
        }
        public void Create()
        {
            Application.targetFrameRate = 60;
            scenery = new GameObject("Arena architecture").transform; scenery.SetParent(transform);
            var teal = new Color(.25f, .95f, .77f); var orange = new Color(1, .55f, .22f);
            var bowl = Resources.Load<GameObject>("Art/ArenaBowl");
            if (bowl) Instantiate(bowl, scenery, false).transform.localRotation = Quaternion.Euler(0,180,0);
            else Shape(scenery, "Preview floor", PrimitiveType.Cylinder, new Vector3(0, -.2f, 0), new Vector3(14, .2f, 14), Mat(new Color(.055f, .073f, .105f)));
            var main = new GameObject("Arena camera"); main.transform.SetParent(transform); View = main.AddComponent<Camera>();
            main.tag = "MainCamera";
            View.clearFlags = CameraClearFlags.Skybox; RenderSettings.skybox = new Material(Shader.Find("QuQu/Celestial Sky")); View.backgroundColor = new Color(.025f, .037f, .063f); View.fieldOfView = 44; View.nearClipPlane = .1f;
            main.AddComponent<AudioListener>(); View.allowMSAA = true; View.GetUniversalAdditionalCameraData().renderPostProcessing = true;
            var key = new GameObject("Key light"); key.transform.SetParent(scenery); key.transform.rotation = Quaternion.Euler(27, -38, 0);
            var light = key.AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 2.8f; light.shadows = LightShadows.Soft; light.color = new Color(1, .82f, .62f);
            light.shadowStrength = .95f; light.shadowBias = .04f; light.shadowNormalBias = .2f;
            FillLight(new Vector3(0, 5, 5), new Color(.5f,.65f,1), 30);
            FillLight(new Vector3(-4, 4, -5), new Color(.65f,.75f,1), 16);
            RenderSettings.fog=true; RenderSettings.fogMode=FogMode.ExponentialSquared; RenderSettings.fogColor=new Color(.065f,.092f,.16f); RenderSettings.fogDensity=.025f;
            RenderSettings.ambientMode = AmbientMode.Trilight; RenderSettings.ambientSkyColor = new Color(.19f,.25f,.38f);
            RenderSettings.ambientEquatorColor = new Color(.10f,.13f,.21f); RenderSettings.ambientGroundColor = new Color(.045f,.05f,.07f);
            var v = new GameObject("Arena atmosphere").AddComponent<Volume>(); v.transform.SetParent(scenery); v.isGlobal = true; v.profile = ScriptableObject.CreateInstance<VolumeProfile>();
            var bloom = v.profile.Add<Bloom>(); bloom.intensity.Override(.35f); bloom.threshold.Override(1.3f);
            var tone = v.profile.Add<Tonemapping>(); tone.mode.Override(TonemappingMode.ACES);
            PositionCamera();
        }
        void FillLight(Vector3 pos, Color color, float intensity)
        { var g = new GameObject("Color fill"); g.transform.SetParent(scenery); g.transform.localPosition = pos; var l = g.AddComponent<Light>(); l.type = LightType.Point; l.color = color; l.intensity = intensity; l.range = 14; }
        public void SetRoster(ModelInfo[] roster, ArenaPreferences prefs)
        {
            ResetCamera();
            attacks.Clear(); nextAttack = 0;
            foreach (var f in Fighters) if (f) Destroy(f.gameObject); Fighters.Clear();
            for (int i = 0; i < roster.Length; i++)
            {
                float a = (i * 360f / roster.Length + 45) * Mathf.Deg2Rad;
                var g = new GameObject(roster[i].name); g.transform.SetParent(transform);
                var f = g.AddComponent<ArenaFighter>(); Fighters.Add(f);
                var home = roster.Length == 2 ? new Vector3((i == 0 ? -3.1f : 3.1f) * (prefs.mirrorPanels ? -1 : 1), .09f, 0) : new Vector3(Mathf.Sin(a) * 3.65f, .09f, Mathf.Cos(a) * 3.65f);
                f.Create(roster[i], prefs.Avatar(roster[i].id, i, roster[i].name), home);
                f.ShowNameplate = roster.Length != 2;
            }
        }
        public void Fight(ArenaFighter attacker, float score)
        {
            if (Fighters.Count < 2 || Motion <= 0) return;
            attacks.Enqueue((attacker, score));
        }
        public void EndCombat() { attacks.Clear(); }
        public IEnumerator PresentRound(CompetitionRound round, System.Action hit)
        {
            bool applied = false;
            System.Action apply = () => { if (!applied) { applied = true; hit(); } };
            if (Motion <= 0) { apply(); yield break; }
            foreach (var f in Fighters) { f.Celebrating = f.Defeated = false; f.Motion = Motion; }
            bool clash = System.Array.TrueForAll(round.attacks, a => a.damage == 0);
            foreach (var attack in round.attacks)
            {
                if (attack.damage <= 0 && !clash) continue;
                var from = Fighters.Find(f => f.State.Id == attack.attacker);
                var to = Fighters.Find(f => f.State.Id == attack.target);
                if (from && to) from.CastResolved(to, (float)attack.damage, (p, c, blocked) => { apply(); Impact(p, c, blocked); });
            }
            float until = Time.unscaledTime + 2.5f;
            while (Time.unscaledTime < until && Motion > 0) yield return null;
            apply(); // Turning animations off never loses an authoritative settlement.
        }
        void Impact(Vector3 point, Color color, bool blocked)
        {
            OnImpact?.Invoke(blocked); cameraKick = (blocked ? .016f : .035f) * Motion;
            StartCoroutine(ImpactFlash(point, blocked ? new Color(.65f,.85f,1) : color));
        }
        IEnumerator ImpactFlash(Vector3 point, Color color)
        {
            var root = new GameObject("Hit spark"); root.transform.position = point;
            var mat = Mat(Color.Lerp(color, Color.white, .6f), 3);
            var sparks = new Transform[8];
            for (int i = 0; i < sparks.Length; i++) sparks[i] = Shape(root.transform,"Spark",PrimitiveType.Sphere,Vector3.zero,Vector3.one*.08f,mat).transform;
            for (float t = 0; t < 1; t += Time.deltaTime/.28f)
            {
                for (int i = 0; i < sparks.Length; i++)
                {
                    float a = i * Mathf.PI * 2 / sparks.Length;
                    sparks[i].localPosition = new Vector3(Mathf.Cos(a),Mathf.Sin(a),Mathf.Sin(a*3)*.3f) * t * .8f * Motion;
                    sparks[i].localScale = Vector3.one * .09f * (1-t);
                }
                yield return null;
            }
            Destroy(root); Destroy(mat);
        }
        void Update()
        {
            if (Orbit) yaw += Time.deltaTime * 5 * Motion;
            var mouse = Mouse.current;
            if (mouse != null && !(EventSystem.current && EventSystem.current.IsPointerOverGameObject()))
            {
                if (mouse.rightButton.isPressed) { yaw += mouse.delta.ReadValue().x * .15f; pitch = Mathf.Clamp(pitch - mouse.delta.ReadValue().y * .1f, 5, 65); }
                distance = Mathf.Clamp(distance - mouse.scroll.ReadValue().y * .007f, Focused ? 3 : 7, 24);
            }
            PositionCamera();
            foreach (var f in Fighters) if (f) f.Motion = Motion;
            cameraKick = Mathf.MoveTowards(cameraKick, 0, Time.deltaTime * .5f);
            if (attacks.Count > 0 && Time.time >= nextAttack && !Fighters.Exists(f => f && f.Busy))
            {
                var attack = attacks.Dequeue();
                if (attack.fighter && Motion > 0 && !attack.fighter.Celebrating && !attack.fighter.Defeated)
                {
                    if (Fighters.Count == 2) { var target = Fighters.Find(f => f != attack.fighter); attack.fighter.Strike(target, attack.score, Motion, Impact); }
                    nextAttack = Time.time + 1.45f;
                }
            }
        }
        void PositionCamera()
        {
            if (!View) return;
            var center = Focused ? Focused.transform.position + Vector3.up * (1.1f * Focused.Look.scale) : new Vector3(0, .9f, 0);
            View.transform.position = center + Quaternion.Euler(pitch, yaw, 0) * new Vector3(Mathf.Sin(Time.time*65)*cameraKick, 0, -distance);
            View.transform.LookAt(center);
        }
        public void SetSpectating(bool value) { Spectating = value; ResetCamera(); }
        public void Focus(ArenaFighter fighter)
        {
            if (!fighter) return;
            Focused = fighter; Orbit = false; yaw = fighter.transform.eulerAngles.y + 180;
            foreach (var f in Fighters) f.ShowNameplate = false;
            pitch = 8; distance = 5.2f * fighter.Look.scale; View.fieldOfView = 55; PositionCamera();
        }
        public void ResetCamera() { Focused = null; foreach (var f in Fighters) if (f) f.ShowNameplate = Fighters.Count != 2; yaw = 0; pitch = 12; distance = 12.5f; if (View) View.fieldOfView = 44; }
    }
}
