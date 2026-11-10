using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace QuQu
{
    public sealed class StationRingSpectatorProbe : MonoBehaviour
    {
        [Serializable] public sealed class Result
        {
            public string scene,stage;
            public float phase,seconds;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
        }
        public string OutputDirectory;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        StationSpectatorSeat seat;
        StationSpectatorCamera modes;
        StationObservationPoint observation;
        Transform frame;
        Result report;
        Keyboard keyboard,priorKeyboard;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();
            string Arg(string name){int at=Array.IndexOf(args,name);return at>=0 && at+1<args.Length?args[at+1]:null;}
            var output=Arg("--station-spectator-output");if(string.IsNullOrEmpty(output) || !Path.IsPathRooted(output))return;
            var probe=new GameObject("V015 spectator validation").AddComponent<StationRingSpectatorProbe>();
            probe.OutputDirectory=output;probe.Phase=float.Parse(Arg("--station-spectator-phase")??"0",System.Globalization.CultureInfo.InvariantCulture);
        }
        IEnumerator Start()
        {
            yield return null;yield return null;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,phase=Phase};
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Buildings candidate required");
            Directory.CreateDirectory(OutputDirectory);float started=Time.time;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();
            seat=FindFirstObjectByType<StationSpectatorSeat>();modes=walker.View.GetComponent<StationSpectatorCamera>();
            observation=FindFirstObjectByType<StationObservationPoint>();
            foreach(var r in FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None))r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-Phase:Phase,0);
            frame=modes.ArenaFrame;Physics.SyncTransforms();walker.MovementLocked=true;
            priorKeyboard=Keyboard.current;keyboard=InputSystem.AddDevice<Keyboard>();
            Check("original components enabled and references retained",seat.enabled && modes.enabled && observation.enabled && observation.Walker==walker && observation.ArenaFrame==frame && observation.Match);
            report.stage="spectator seat";Place(frame.TransformPoint(8,17.255f,60));
            Check("distant seat rejected",!seat.Use());
            yield return Walk(frame,new Vector3(6.5f,17.255f,60));yield return new WaitForEndOfFrame();
            Check("original landing has floor and no body overlap",walker.GroundRing && walker.GroundRing.transform==frame && Free(walker.transform.position));
            var rig=FindFirstObjectByType<ArenaDuelPlatforms>();var fighters=new ArenaFighter[2];
            for(int i=0;i<2;i++)
            {
                fighters[i]=new GameObject("Spectator fixture contestant "+i).AddComponent<ArenaFighter>();
                fighters[i].Create(new ModelInfo{id="spectator:"+i,name="观赛验证选手"+i},new AvatarPreference{style=0,color=i==0?"#70CFED":"#EFAB77",scale=1},rig.WorldPosition(new Vector3(i==0?-42:42,-11.91f,0)));
            }
            rig.Bind(fighters[0],fighters[1]);yield return rig.Enter();
            Check("original entrance raises fixture match",rig.Phase=="combat" && Mathf.Abs(frame.InverseTransformPoint(rig.Ring.position).y-12)<.01f);
            for(int variant=0;variant<2;variant++)
            {
                walker.ThirdPersonMode=variant==1;yield return new WaitForEndOfFrame();
                var eye=walker.View.transform.localPosition;var rotation=walker.View.transform.localRotation;float fov=walker.View.fieldOfView,near=walker.View.nearClipPlane;
                var standing=frame.InverseTransformPoint(walker.transform.position);
                walker.InputBlocked=()=>true;Check("blocked sit rejected "+variant,!seat.Use());modes.ToggleFree();Check("blocked flight rejected "+variant,!modes.Flying);walker.InputBlocked=null;
                yield return Press(Key.E);Check("E sits without disabling body "+variant,seat.IsSeated && !walker.enabled && body.enabled);
                yield return Hold("seated "+variant,frame,standing,3,()=>Vector3.Distance(walker.View.transform.position,new Vector3(seat.transform.position.x,seat.GetComponent<Collider>().bounds.max.y+1.23f,seat.transform.position.z))<.01f);
                Capture("seat-"+variant,walker.View);
                Check("seated contestants within view "+variant,InView(walker.View,fighters));
                Check("seated sightline clears railing "+variant,fighters.All(f=>ClearView(walker.View,f)));
                yield return Press(Key.F9);Check("F9 close view from seat "+variant,modes.CloseUp && seat.IsSeated && !walker.View.transform.parent);
                yield return Hold("close view "+variant,frame,standing,3,()=>Vector3.Distance(walker.View.transform.position,frame.TransformPoint(0,16.5f,16))<.01f && Vector3.Dot(walker.View.transform.forward,(frame.TransformPoint(0,13.2f,0)-walker.View.transform.position).normalized)>.9999f);
                Capture("close-"+variant,walker.View);
                Check("close contestants within view "+variant,InView(walker.View,fighters));
                yield return Press(Key.F8);Check("F8 switches from close to free "+variant,modes.Flying && seat.IsSeated);
                var flight=walker.View.GetComponent<ArenaFreeCamera>();var origin=walker.View.transform.position;
                flight.Move(Vector3.right,new Vector2(15,4),1);Check("free camera moves independently "+variant,Vector3.Distance(origin,walker.View.transform.position)>2.9f);
                var fixedEye=walker.View.transform.position;
                yield return Hold("free view "+variant,frame,standing,3,()=>Vector3.Distance(fixedEye,walker.View.transform.position)<.01f);
                Check("seat cannot consume flight E "+variant,!seat.Use() && seat.IsSeated);
                yield return Press(Key.R);Check("R returns to seated ownership "+variant,seat.IsSeated && !walker.enabled && !modes.Flying && !modes.CloseUp && walker.View.transform.parent==walker.transform);
                yield return Press(Key.E);Check("E stands in current ring position "+variant,!seat.IsSeated && walker.enabled && body.enabled && Vector3.Distance(standing,frame.InverseTransformPoint(walker.transform.position))<.04f);
                Check("standing optics restored "+variant,Mathf.Abs(walker.View.fieldOfView-fov)<.001f && Mathf.Abs(walker.View.nearClipPlane-near)<.001f);
                modes.ToggleFree();yield return Hold("standing free "+variant,frame,standing,2,()=>modes.Flying);
                modes.Return();Check("walking view restored immediately "+variant,walker.enabled && Vector3.Distance(eye,walker.View.transform.localPosition)<.01f && Quaternion.Angle(rotation,walker.View.transform.localRotation)<.1f);
            }
            Check("sit for disable cleanup",seat.Use());modes.ToggleFree();seat.enabled=false;
            Check("disabling seated owner unwinds flight",!seat.IsSeated && !modes.Flying && walker.enabled && body.enabled && walker.View.transform.parent==walker.transform && !seat.Use());seat.enabled=true;
            Check("sit for camera cleanup",seat.Use());modes.ToggleCloseUp();modes.enabled=false;
            Check("disabling camera returns to seat",seat.IsSeated && !walker.enabled && !modes.CloseUp);modes.ToggleFree();Check("disabled camera rejects action",!modes.Flying);modes.enabled=true;seat.Use();
            report.stage="observation console";
            var outer=observation.GetComponentInParent<StationRotatingRing>().transform;
            bool approach=Approach(observation.transform.position,out var a,out var b);Check("observation local approach exists",approach);
            if(approach)
            {
                var end=outer.InverseTransformPoint(b);Place(a);Check("distant observation rejected",!observation.Use());yield return Walk(outer,end);
                walker.MovementLocked=false;walker.ThirdPersonMode=true;yield return new WaitForEndOfFrame();
                var before=outer.InverseTransformPoint(walker.transform.position);bool oldView=walker.View.enabled;var optical=observation.ObservationCamera;bool oldOptical=optical.enabled;var opticalRotation=optical.transform.localRotation;
                walker.InputBlocked=()=>true;Check("blocked observation rejected",!observation.Use());walker.InputBlocked=null;
                yield return Press(Key.E);Check("E observation takes exclusive input",observation.IsOpen && walker.InputBlocked?.Invoke()==true && !modes.enabled && !walker.View.enabled && optical.enabled);
                yield return Hold("observation",outer,before,5,()=>Vector3.Dot(optical.transform.forward,(frame.TransformPoint(0,8,0)-optical.transform.position).normalized)>.9999f);
                Capture("observation",optical);yield return Press(Key.W,Key.V,Key.F8,Key.F9);
                Check("observation blocks movement and camera modes",walker.ThirdPersonMode && !modes.Flying && !modes.CloseUp && Vector3.Distance(before,outer.InverseTransformPoint(walker.transform.position))<.04f);
                yield return Press(Key.Escape);Check("Esc restores view and input",!observation.IsOpen && walker.InputBlocked==null && !walker.MovementLocked && modes.enabled && walker.View.enabled==oldView && optical.enabled==oldOptical && Quaternion.Angle(optical.transform.localRotation,opticalRotation)<.01f);
                Check("reopen observation",observation.Use());observation.enabled=false;yield return new WaitForEndOfFrame();yield return null;
                Check("disabled observation unwinds ownership",!observation.IsOpen && walker.InputBlocked==null && modes.enabled && walker.View.enabled==oldView && !observation.Use());observation.enabled=true;
                Check("open observation for E close",observation.Use());yield return Press(Key.E);Check("E closes observation",!observation.IsOpen && walker.InputBlocked==null);
                walker.MovementLocked=true;yield return Walk(outer,outer.InverseTransformPoint(a));Check("walked away after observation",Free(walker.transform.position));
            }
            yield return rig.ReturnBoth();rig.ResetAfterExit();foreach(var fighter in fighters)Destroy(fighter.gameObject);
            Check("fixture match returns to dock",rig.Phase=="docked");
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);report.stage="complete";Save("spectator");
            InputSystem.RemoveDevice(keyboard);if(priorKeyboard!=null)priorKeyboard.MakeCurrent();walker.MovementLocked=false;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        IEnumerator Hold(string label,Transform ground,Vector3 start,float seconds,Func<bool> viewCheck)
        {
            float finish=Time.time+seconds,drift=0;bool view=true,free=true;
            while(Time.time<finish){yield return new WaitForEndOfFrame();drift=Mathf.Max(drift,Vector3.Distance(start,ground.InverseTransformPoint(walker.transform.position)));view&=viewCheck();free&=Free(walker.transform.position);}
            Check(label+" body follows floor",drift<.04f && walker.GroundRing && walker.GroundRing.transform==ground && body.enabled,drift);
            Check(label+" view stable",view);Check(label+" no body penetration",free);Save("progress");
        }
        IEnumerator Walk(Transform ground,Vector3 target)
        {
            float until=Time.time+6;
            while(Time.time<until){var d=ground.TransformPoint(target)-walker.transform.position;d.y=0;if(d.magnitude<.08f)break;walker.MoveOnGround(d.normalized*Mathf.Min(3,d.magnitude/Time.deltaTime),Time.deltaTime);yield return null;}
            var gap=ground.TransformPoint(target)-walker.transform.position;gap.y=0;Check("walk approach "+report.stage,gap.magnitude<.15f,gap.magnitude);
        }
        IEnumerator Press(params Key[] keys)
        {
            // Queue after Update, not a render callback that can receive an Editor-only input update.
            yield return null;
            InputSystem.QueueStateEvent(keyboard,new KeyboardState(keys));yield return null;yield return new WaitForEndOfFrame();
            InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;yield return new WaitForEndOfFrame();
        }
        bool Approach(Vector3 center,out Vector3 start,out Vector3 end)
        {
            start=end=default;
            for(int i=0;i<24;i++)
            {
                var direction=Quaternion.Euler(0,i*15,0)*Vector3.right;
                if(!Floor(center+direction*3.9f,out var a) || !Floor(center+direction*2,out var b) || !Free(a) || !Free(b))continue;
                start=a;end=b;return true;
            }
            return false;
        }
        bool Floor(Vector3 at,out Vector3 point)
        {
            point=default;var hits=Physics.RaycastAll(at+Vector3.up,Vector3.down,3,~0,QueryTriggerInteraction.Ignore).Where(h=>h.collider!=body && h.normal.y>.65f).OrderBy(h=>h.distance).ToArray();
            if(hits.Length==0)return false;point=hits[0].point+Vector3.up*.08f;return true;
        }
        bool Free(Vector3 p)=>Physics.OverlapCapsule(p+Vector3.up*(body.center.y-body.height*.5f+body.radius),p+Vector3.up*(body.center.y+body.height*.5f-body.radius),body.radius-.03f,~0,QueryTriggerInteraction.Ignore).All(c=>c.GetComponentInParent<StationGrayboxWalker>()==walker);
        bool InView(Camera camera,ArenaFighter[] fighters)=>fighters.All(f=>{var p=camera.WorldToViewportPoint(f.transform.position+Vector3.up);return p.z>0 && p.x>.05f && p.x<.95f && p.y>.05f && p.y<.95f;});
        bool ClearView(Camera camera,ArenaFighter fighter)
        {
            var ray=fighter.transform.position+Vector3.up*.1f-camera.transform.position;
            return Physics.RaycastAll(camera.transform.position,ray.normalized,ray.magnitude,~0,QueryTriggerInteraction.Ignore).All(h=>h.collider.GetComponentInParent<ArenaFighter>() || h.collider.GetComponentInParent<StationGrayboxWalker>());
        }
        void Place(Vector3 p){body.enabled=false;walker.transform.position=p;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
        void Capture(string name,Camera camera)
        {
            var target=camera.targetTexture;var active=RenderTexture.active;var rt=new RenderTexture(1200,800,24);var image=new Texture2D(1200,800,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,1200,800),0,0);image.Apply();File.WriteAllBytes(Path.Combine(OutputDirectory,name+".png"),image.EncodeToPNG());}
            finally{camera.targetTexture=target;RenderTexture.active=active;rt.Release();Destroy(rt);Destroy(image);}
        }
    }
}
