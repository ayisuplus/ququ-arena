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
        public ArenaVenue Venue;
        public ArenaGalaxyDisplay Display;
        public ArenaEntranceLifts Lifts;
        public ArenaLightShow LightShow;
        public ArenaSingularity Singularity;
        public ArenaCombatVFX Vfx;
        public ArenaCombatGrade Grade;
        public ArenaFreeCamera Flight;
        public System.Func<bool> CameraInputBlocked;
        public bool CameraDirected;
        public readonly List<ArenaFighter> Fighters = new List<ArenaFighter>();
        public float Motion = 1;
        public bool Orbit;
        public bool Spectating { get; private set; }
        public ArenaFighter Focused { get; private set; }
        public System.Action<bool> OnImpact;
        readonly Queue<(ArenaFighter fighter, float score)> attacks = new Queue<(ArenaFighter, float)>();
        float nextAttack, cameraKick;
        // Queued attacks played out, no fighter animating, camera shake decayed.
        public bool Settled => attacks.Count == 0 && cameraKick <= 0 && !Fighters.Exists(f => f && f.Busy);
        float yaw, pitch = 30, distance = 14, overviewPitch = 30;
        float savedYaw, savedPitch, savedDistance, fitDistance = 14, lastAspect;
        int rosterSignature, combatRevision;
        bool combatCamera;
        bool placementDirty;
        Vector3 overviewCenter = new Vector3(0, 1.2f, 0);
        readonly List<Bounds> framingBounds = new List<Bounds>();
        public float CameraPitch => pitch;
        public Bounds[] FramingBounds => framingBounds.ToArray();
        Transform scenery;
        // Championship trophy: parked on a floating bay outside the venue, awarded by
        // ArenaTrophyBay. Parented to scenery and never to the venue: ArenaVenueCheck
        // counts the venue's own MeshFilters as its draw budget.
        public ArenaTrophyBay TrophyBay;
        // Back-compat entry keeps the historical one-size blend so existing callers are unchanged.
        public static Material Mat(Color color, float emission = 0) => Mat(color, .35f, .65f, emission);
        // Graded entry: metallic/smoothness pairs follow the material grading table
        // (silver .90/.35, ceramic .05/.55, graphite .20/.65, markings .10/.30) instead of one glossy value.
        public static Material Mat(Color color, float metal, float smooth, float emission = 0)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit")); m.color = color;
            m.SetFloat("_Smoothness", smooth); m.SetFloat("_Metallic", metal);
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
        public void Create(bool gray=false)
        {
            Application.targetFrameRate = 60;
            scenery = new GameObject("Arena architecture").transform; scenery.SetParent(transform);
            var teal = new Color(.25f, .95f, .77f); var orange = new Color(1, .55f, .22f);
            var bowl = Resources.Load<GameObject>(gray?"Art/ObservatoryArenaV13":"Art/ArchitectureV23/ArenaBase");
            if (bowl) Instantiate(bowl, scenery, false);
            else throw new System.InvalidOperationException("ObservatoryArenaV13 prefab is missing; run ArenaObservatoryBuild.Import");
            var architecture=Resources.Load<GameObject>("Art/ArchitectureV23/Arena"+(gray?"-gray":""));
            if(!architecture)throw new System.InvalidOperationException("V23 architecture is missing; run ArenaArchitectureBuildV23.ImportFinal");
            Instantiate(architecture,scenery,false);
            if(!gray){Lifts=new GameObject("Twin gallery entrance lifts").AddComponent<ArenaEntranceLifts>();Lifts.transform.SetParent(scenery,false);Lifts.Create(this);}
            var main = new GameObject("Arena camera"); main.transform.SetParent(transform); View = main.AddComponent<Camera>();
            Venue=new GameObject("Spectator galleries").AddComponent<ArenaVenue>();Venue.transform.SetParent(scenery,false);Venue.Create();
            Display=new GameObject("Galaxy live displays").AddComponent<ArenaGalaxyDisplay>();Display.transform.SetParent(scenery,false);Display.Create(this,scenery);
            LightShow=new GameObject("Research instruments and telemetry").AddComponent<ArenaLightShow>();LightShow.transform.SetParent(scenery,false);LightShow.Create(this,scenery);
            Singularity=new GameObject("Central black hole below observatory").AddComponent<ArenaSingularity>();Singularity.transform.SetParent(scenery,false);Singularity.Create(this);
            // After LightShow on purpose: LightShow normalises materials across the whole
            // scenery subtree by exact name, and the bay's Prop* placeholders must not be
            // swept into that pass.
            TrophyBay=new GameObject("Trophy bay station").AddComponent<ArenaTrophyBay>();TrophyBay.transform.SetParent(scenery,false);TrophyBay.Create(scenery);
            Flight=main.AddComponent<ArenaFreeCamera>();Flight.InputBlocked=()=>CameraInputBlocked?.Invoke()==true;
            main.tag = "MainCamera";
            View.clearFlags = CameraClearFlags.Skybox; RenderSettings.skybox = new Material(Shader.Find("QuQu/Celestial Sky")); View.backgroundColor = new Color(.025f, .037f, .063f); View.fieldOfView = 40; View.nearClipPlane = .1f;
            main.AddComponent<AudioListener>(); View.allowDynamicResolution=false; View.allowMSAA = true; View.GetUniversalAdditionalCameraData().antialiasing=AntialiasingMode.None; View.GetUniversalAdditionalCameraData().renderPostProcessing = true;
            var key = new GameObject("Key light"); key.transform.SetParent(scenery); key.transform.rotation = Quaternion.Euler(48, -38, 0);
            var light = key.AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 2.1f; light.shadows = LightShadows.Soft; light.color = new Color(.91f, .95f, 1);
            light.shadowStrength = .95f; light.shadowBias = .04f; light.shadowNormalBias = .2f;
            FillLight(new Vector3(0, 5, 4), new Color(.86f,.94f,1), 34);
            FillLight(new Vector3(-4, 4, -5), new Color(.92f,.96f,1), 24);
            FillLight(new Vector3(4, 4, -4), new Color(1,.96f,.89f), 20);
            // Linear 24/95: interiors (depth < 24) stay clear; fog only stacks aerial perspective on distant views.
            RenderSettings.fog=true; RenderSettings.fogMode=FogMode.Linear; RenderSettings.fogStartDistance=24; RenderSettings.fogEndDistance=95; RenderSettings.fogColor=new Color(.065f,.092f,.16f); RenderSettings.fogDensity=.025f;
            RenderSettings.ambientMode = AmbientMode.Trilight; RenderSettings.ambientSkyColor = new Color(.39f,.42f,.45f);
            RenderSettings.ambientEquatorColor = new Color(.20f,.23f,.26f); RenderSettings.ambientGroundColor = new Color(.075f,.085f,.095f);
            var v = new GameObject("Arena atmosphere").AddComponent<Volume>(); v.transform.SetParent(scenery); v.isGlobal = true; v.profile = ScriptableObject.CreateInstance<VolumeProfile>();
            // Threshold 1.05 lets emissive strips glow gently (.28) without blowing out the interior.
            var bloom = v.profile.Add<Bloom>(); bloom.intensity.Override(.28f); bloom.threshold.Override(1.05f);
            var tone = v.profile.Add<Tonemapping>(); tone.mode.Override(TonemappingMode.ACES);
            var vignette = v.profile.Add<Vignette>(); vignette.intensity.Override(.28f); vignette.smoothness.Override(.35f);
            var balance = v.profile.Add<WhiteBalance>(); balance.temperature.Override(-4f); balance.tint.Override(2f);
            v.profile.Add<DepthOfField>().mode.Override(DepthOfFieldMode.Off);
            v.profile.Add<MotionBlur>().intensity.Override(0);
            var grading = v.profile.Add<ColorAdjustments>(); grading.postExposure.Override(.1f); grading.contrast.Override(7);
            // Aniso is now per-texture (see ArenaArtBudget); Enable honours those per-asset levels
            // instead of forcing filtering on every sampled texture including UI.
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.Enable;
            Vfx=ArenaCombatVFX.Create(scenery); Grade=ArenaCombatGrade.Create(scenery);
            PositionCamera();
        }
        void FillLight(Vector3 pos, Color color, float intensity)
        { var g = new GameObject("Color fill"); g.transform.SetParent(scenery); g.transform.localPosition = pos; var l = g.AddComponent<Light>(); l.type = LightType.Point; l.color = color; l.intensity = intensity; l.range = 14; }
        public void SetRoster(ModelInfo[] roster, ArenaPreferences prefs)
        {
            Lifts?.Cancel();
            if(!Flight.Active && !CameraDirected)ResetCamera();else Focused=null;
            EndCombat(); nextAttack = 0;
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
            PlaceDuelFighters(prefs.mirrorPanels); Refit();
        }
        public void PlaceDuelFighters(bool mirror)
        {
            if(Fighters.Count!=2)return;
            float smaller=Mathf.Min(Fighters[0].Look.scale,Fighters[1].Look.scale),larger=Mathf.Max(Fighters[0].Look.scale,Fighters[1].Look.scale);
            float gap=(Fighters[0].Chibi?Mathf.Lerp(.10f,.20f,Mathf.InverseLerp(.5f,1,smaller/larger)):.50f)*smaller;
            float separation=(Fighters[0].FaceDepth+Fighters[1].FaceDepth)*.91f+gap;
            for(int i=0;i<2;i++)Fighters[i].SetHome(new Vector3((i==0?-1:1)*(mirror?-1:1)*separation*.5f,.09f,0),true);
            separation=Fighters[0].FitDuelStance(Fighters[1])+Fighters[1].FitDuelStance(Fighters[0])+gap;
            for(int i=0;i<2;i++)Fighters[i].SetHome(new Vector3((i==0?-1:1)*(mirror?-1:1)*separation*.5f,.09f,-Fighters[i].FaceSideOffset),true);
        }
        public void RefreshPlacementWhenIdle(){placementDirty=true;}
        public void Fight(ArenaFighter attacker, float score)
        {
            if (Fighters.Count < 2 || Motion <= 0) return;
            attacks.Enqueue((attacker, score));
        }
        public void EndCombat() { combatRevision++; attacks.Clear(); foreach(var f in Fighters)if(f)f.CancelSlap(); Grade?.SetCombat(false); TrophyBay?.Recall(Motion); SetCombatCamera(false); }
        public void SetCombatCamera(bool active)
        {
            if(combatCamera==active)return;
            combatCamera=active;
            if(!Focused && !Flight.Active && !CameraDirected)Refit();
        }
        public IEnumerator PresentRound(CompetitionRound round, System.Action hit, System.Action<CompetitionAttack> contact=null)
        {
            // 战斗态调色进场（方案 #7）：回合演出共用入口，duel 与 benchmark 两条链都从这里过；
            // 退场挂 EndCombat（结算/中止/清台唯一拆收点），科考态在那儿复位。
            Grade?.SetCombat(true);
            SetCombatCamera(true);
            int revision=combatRevision;
            if (Motion <= 0) { hit(); yield break; }
            foreach (var f in Fighters) { f.Celebrating = f.Defeated = false; f.Motion = Motion; }
            foreach (var attack in round.attacks)
            {
                if(revision!=combatRevision)yield break;
                if(Motion<=0)break;
                if (attack.damage <= 0) continue;
                var from = Fighters.Find(f => f.State.Id == attack.attacker);
                var to = Fighters.Find(f => f.State.Id == attack.target);
                if (from && to) yield return from.SlapResolved(to, (p, c, blocked) => { contact?.Invoke(attack); Impact(p, c, blocked); });
            }
            if(revision==combatRevision)hit(); // A completed round settles once, including motion disabled mid-slap.
        }
        // Single VFX bus: every contact in the arena lands here, so one place owns the
        // particle budget and the colour kick regardless of which system scored the hit.
        void Impact(Vector3 point, Color color, bool blocked)
        {
            OnImpact?.Invoke(blocked); cameraKick = (blocked ? .016f : .035f) * Motion;
            Vfx?.Impact(point, color, Motion, blocked);
            Grade?.Pulse(blocked ? .25f : .6f);
        }
        public void SetCombatGrade(bool combat) => Grade?.SetCombat(combat);
        public void Celebrate(ArenaFighter fighter)
        {
            if (!fighter) return;
            fighter.FaceAwardCamera();
            Vfx?.Victory(fighter.transform.position + Vector3.up * .05f, fighter.Tint);
            TrophyBay?.Present(fighter, Motion);
            if(!Flight.Active && !CameraDirected && !Focused)
            {
                Focus(fighter);
                yaw=0;pitch=18;distance=7.5f*fighter.Look.scale;
                PositionCamera();
            }
        }
        void Update()
        {
            if (Orbit && !Flight.Active && !CameraDirected) yaw += Time.deltaTime * 5 * Motion;
            var mouse = Mouse.current;
            if (!Flight.Active && !CameraDirected && CameraInputBlocked?.Invoke()!=true && mouse != null && !(EventSystem.current && EventSystem.current.IsPointerOverGameObject()))
            {
                if (mouse.rightButton.isPressed) { yaw += mouse.delta.ReadValue().x * .15f; pitch = Mathf.Clamp(pitch - mouse.delta.ReadValue().y * .1f, Focused ? -80 : 10, 89); }
                distance = Mathf.Clamp(distance - mouse.scroll.ReadValue().y * .007f, Focused ? .35f : fitDistance * .5f, Mathf.Max(30,fitDistance*2));
            }
            int signature = 17;
            foreach(var f in Fighters) if(f && f.BodyRoot) signature = unchecked(signature * 31 + f.BodyRoot.GetInstanceID() + Mathf.RoundToInt(f.Look.scale*1000));
            if(!CameraDirected && (signature != rosterSignature || Mathf.Abs(View.aspect-lastAspect)>.001f)) { rosterSignature=signature; Refit(); }
            PositionCamera();
            foreach (var f in Fighters) if (f) f.Motion = Motion;
            if(placementDirty && !Fighters.Exists(f=>f.Busy)){placementDirty=false;PlaceDuelFighters(Fighters.Count==2 && Fighters[0].Home.x>0);Refit();}
            cameraKick = Mathf.MoveTowards(cameraKick, 0, Time.deltaTime * .5f);
            TrophyBay?.Tick(Motion);
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
            if (!View || Flight.Active || CameraDirected) return;
            var center = Focused ? Focused.transform.position + Vector3.up * (1.1f * Focused.Look.scale) : overviewCenter;
            View.transform.position = center + Quaternion.Euler(pitch, yaw, 0) * new Vector3(Mathf.Sin(Time.time*65)*cameraKick, 0, -distance);
            View.transform.LookAt(center);
        }
        public void SetSpectating(bool value) { Spectating = value; }
        public void SetOverviewPitch(float value)
        {
            if(Mathf.Approximately(overviewPitch,value)) return;
            overviewPitch=value; if(!Focused) {pitch=value;Refit();}
        }
        public void Refit()
        {
            if(!View) return;
            lastAspect=View.aspect;framingBounds.Clear();
            foreach(var f in Fighters)
            {
                if(!f || !f.BodyRoot) continue;
                var renderers=f.BodyRoot.GetComponentsInChildren<Renderer>();
                bool found=false;var bounds=new Bounds();
                foreach(var r in renderers) if(r.enabled && !(r is ParticleSystemRenderer) && !(r is LineRenderer))
                {if(!found){bounds=r.bounds;found=true;}else bounds.Encapsulate(r.bounds);}
                if(found) {bounds.Expand(new Vector3(.7f,.45f,.7f));framingBounds.Add(bounds);}
            }
            if(framingBounds.Count==0 || Focused) return;
            var targets=new List<Bounds>(framingBounds) { new Bounds(new Vector3(0,1.825f,0),new Vector3(8.2f,3.55f,4.2f)) };
            if(!combatCamera)
            {
                if(Display) targets.Add(ArenaGalaxyDisplay.ScreenBounds);
                targets.Add(ArenaTrophyBay.FramingBounds);
            }
            var all=targets[0];foreach(var b in targets)all.Encapsulate(b);
            overviewCenter=all.center;
            float ratio=distance/fitDistance;float required=0;
            var inverse=Quaternion.Inverse(Quaternion.Euler(pitch,yaw,0));
            float vertical=Mathf.Tan((CameraDirected?40:View.fieldOfView)*.5f*Mathf.Deg2Rad), horizontal=vertical*View.aspect;
            foreach(var target in targets) for(int i=0;i<8;i++)
            {
                var corner=target.center+Vector3.Scale(target.extents,new Vector3((i&1)==0?-1:1,(i&2)==0?-1:1,(i&4)==0?-1:1));
                var p=inverse*(corner-overviewCenter);
                required=Mathf.Max(required,Mathf.Abs(p.x)/(horizontal*.84f)-p.z,Mathf.Abs(p.y)/(vertical*.76f)-p.z);
            }
            fitDistance=Mathf.Max(9,required);distance=fitDistance*Mathf.Clamp(ratio,.78f,2);
            PositionCamera();
        }
        public void Focus(ArenaFighter fighter)
        {
            if (!fighter) return;
            Flight.SetActive(false);
            if(!Focused){savedYaw=yaw;savedPitch=pitch;savedDistance=distance;}
            Focused = fighter; Orbit = false; yaw = fighter.transform.eulerAngles.y + 180;
            foreach (var f in Fighters) f.ShowNameplate = false;
            pitch = 50; distance = 6.2f * fighter.Look.scale; View.fieldOfView = 40; PositionCamera();
        }
        public void RestoreOverview()
        {
            if(Flight.Active){ResetCamera();return;}
            if(!Focused){ResetCamera();return;}
            Focused=null;yaw=savedYaw;pitch=savedPitch;distance=savedDistance;View.fieldOfView=40;PositionCamera();
        }
        public void ResetCamera()
        {
            if(Flight)Flight.SetActive(false);
            Focused=null;Orbit=false; foreach(var f in Fighters)if(f)f.ShowNameplate=Fighters.Count!=2;
            yaw=0;pitch=overviewPitch;distance=fitDistance;if(View)View.fieldOfView=40;Refit();PositionCamera();
        }
        public void ToggleFlight()
        {
            if(Flight.Active){ResetCamera();return;}
            Orbit=false;Focused=null;Flight.SetActive(true);
        }
        public class ViewState
        {
            internal float yaw,pitch,distance,fov;
            internal bool orbit,flying;
            internal ArenaFighter focused;
            public Vector3 position;
            public Quaternion rotation;
        }
        public ViewState CaptureView() => new ViewState {yaw=yaw,pitch=pitch,distance=distance,fov=View.fieldOfView,
            orbit=Orbit,flying=Flight.Active,focused=Focused,position=View.transform.position,rotation=View.transform.rotation};
        public void RestoreView(ViewState state)
        {
            CameraDirected=false;yaw=state.yaw;pitch=state.pitch;distance=state.distance;Orbit=state.orbit;Focused=state.focused;
            View.fieldOfView=state.fov;View.transform.SetPositionAndRotation(state.position,state.rotation);Flight.SetActive(state.flying);
        }
    }
}
