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
    public sealed class StationRingSeatProbe : MonoBehaviour
    {
        [Serializable] public sealed class SeatResult
        {public string id,ring;public Vector3 approach;public float holdSeconds,bodyDrift,yawDrift,eyeError,facingError;}
        [Serializable] public sealed class Result
        {
            public string scene,segment;
            public float phase,seconds;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<SeatResult> seats=new List<SeatResult>();
        }
        public string OutputDirectory;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        Result report;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-seat-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var p=new GameObject("V015 life seat validation").AddComponent<StationRingSeatProbe>();p.OutputDirectory=args[at+1];
            at=Array.IndexOf(args,"--station-seat-probe-phase");if(at>=0 && at+1<args.Length)p.Phase=float.Parse(args[at+1],System.Globalization.CultureInfo.InvariantCulture);
        }
        IEnumerator Start()
        {
            yield return null;yield return null;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,phase=Phase};
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Buildings candidate required");
            Directory.CreateDirectory(OutputDirectory);float started=Time.time;int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();walker.MovementLocked=true;
            foreach(var r in FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None))r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-Phase:Phase,0);
            Physics.SyncTransforms();var seats=FindObjectsByType<StationGardenSeat>(FindObjectsSortMode.None).OrderBy(s=>s.StableId).ToArray();
            Check("148 original seats enabled",seats.Length==148 && seats.All(s=>s.enabled));Check("unique seat identities",seats.Select(s=>s.StableId).Distinct().Count()==148);
            var held=new HashSet<string>();int index=0;
            foreach(var seat in seats)
            {
                report.segment=seat.StableId;Physics.SyncTransforms();var ring=seat.GetComponentInParent<StationRotatingRing>();var frame=ring?ring.transform:null;
                string ringId=ring?ring.RingId:"fixed";
                bool approach=Approach(seat,out var start,out var end);Check(seat.StableId+" clear local walking approach",approach);
                if(!approach){Save("progress");continue;}
                var localStart=Local(frame,start);var localEnd=Local(frame,end);Place(World(frame,localStart));walker.ThirdPersonMode=index++%2==0;
                Check(seat.StableId+" remote sit rejected",!seat.Use());
                float until=Time.time+4;
                while(Time.time<until)
                {
                    var delta=World(frame,localEnd)-walker.transform.position;delta.y=0;if(delta.magnitude<.08f)break;
                    walker.MoveOnGround(delta.normalized*Mathf.Min(4,delta.magnitude/Time.deltaTime),Time.deltaTime);yield return null;
                }
                var gap=World(frame,localEnd)-walker.transform.position;gap.y=0;Check(seat.StableId+" walked to seat",gap.magnitude<.15f,gap.magnitude);
                yield return new WaitForEndOfFrame();
                var standing=Local(frame,walker.transform.position);var eye=walker.View.transform.localPosition;var rotation=walker.View.transform.localRotation;
                bool avatar=walker.VisibleAvatar && walker.VisibleAvatar.activeSelf;
                var blocked=walker.InputBlocked;walker.InputBlocked=()=>true;Check(seat.StableId+" blocked input rejected",!seat.Use());walker.InputBlocked=blocked;
                bool seated=seat.Use();Check(seat.StableId+" seated without moving body",seated && seat.IsSeated && !walker.enabled && body.enabled && Vector3.Distance(standing,Local(frame,walker.transform.position))<.01f);
                if(!seated){Save("progress");continue;}
                float hold=held.Add(ringId)?(ring?8:2):.2f,finish=Time.time+hold,drift=0,eyeError=0,facing=0,yawDrift=0;
                float heading=(frame?Quaternion.Inverse(frame.rotation)*walker.transform.rotation:walker.transform.rotation).eulerAngles.y;
                float angle=ring?ring.transform.eulerAngles.y:0;
                while(Time.time<finish)
                {
                    yield return new WaitForEndOfFrame();
                    drift=Mathf.Max(drift,Vector3.Distance(Local(frame,walker.transform.position),standing));
                    float yaw=(frame?Quaternion.Inverse(frame.rotation)*walker.transform.rotation:walker.transform.rotation).eulerAngles.y;
                    yawDrift=Mathf.Max(yawDrift,Mathf.Abs(Mathf.DeltaAngle(heading,yaw)));
                    eyeError=Mathf.Max(eyeError,Vector3.Distance(walker.View.transform.position,seat.transform.position+Vector3.up*1.25f));
                    facing=Mathf.Max(facing,1-Vector3.Dot(walker.View.transform.forward,seat.transform.forward));
                }
                Check(seat.StableId+" safe body follows ground",drift<.03f && yawDrift<.01f && walker.GroundRing==ring,drift);
                Check(seat.StableId+" view follows seat",eyeError<.01f && facing<.0001f,eyeError);
                Check(seat.StableId+" avatar hidden",!walker.VisibleAvatar || !walker.VisibleAvatar.activeSelf);
                if(ring && hold>1)Check(ringId+" normal rotation during long rest",Mathf.Abs(Mathf.DeltaAngle(angle,ring.transform.eulerAngles.y))>.05f);
                if(hold>1)Capture(ringId);
                if(index%37==0){seat.enabled=false;Check(seat.StableId+" disabled seat rejects use",!seat.Use());seat.enabled=true;}
                else Check(seat.StableId+" stand action",seat.Use());
                Check(seat.StableId+" standing state restored",!seat.IsSeated && walker.enabled && body.enabled && (!walker.VisibleAvatar || walker.VisibleAvatar.activeSelf==avatar));
                Check(seat.StableId+" standing view restored",Vector3.Distance(eye,walker.View.transform.localPosition)<.001f && Quaternion.Angle(rotation,walker.View.transform.localRotation)<.05f);
                walker.MoveOnGround(Vector3.zero,Time.deltaTime);Check(seat.StableId+" standing floor retained",walker.GroundRing==ring && Free(walker.transform.position));
                report.seats.Add(new SeatResult{id=seat.StableId,ring=ringId,approach=localEnd,holdSeconds=hold,bodyDrift=drift,yawDrift=yawDrift,eyeError=eyeError,facingError=facing});Save("progress");
            }
            yield return KeyboardCheck(seats);
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed) && report.seats.Count==148;Save("seats");
            walker.MovementLocked=false;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        IEnumerator KeyboardCheck(StationGardenSeat[] seats)
        {
            StationGardenSeat expected=null;Vector3 spot=default;
            foreach(var seat in seats)
            {
                foreach(var other in seats.Where(s=>s!=seat && Vector3.Distance(s.transform.position,seat.transform.position)<4.1f))
                {
                    var middle=(seat.transform.position+other.transform.position)*.5f+(seat.transform.position-other.transform.position).normalized*.08f;
                    foreach(float offset in new[]{0f,.5f,-.5f,1f,-1f})
                    {
                        if(!Floor(middle+Vector3.ProjectOnPlane(seat.transform.forward,Vector3.up).normalized*offset,middle.y,out var point) || !Free(point))continue;
                        var near=seats.Where(s=>Vector3.Distance(s.transform.position,point)<2.1f).OrderBy(s=>(s.transform.position-point).sqrMagnitude).ThenBy(s=>s.StableId,StringComparer.Ordinal).ToArray();
                        if(near.Length<2)continue;expected=near[0];spot=point;break;
                    }
                    if(expected)break;
                }
                if(expected)break;
            }
            Check("keyboard fixture overlaps at least two seat ranges",expected);
            if(!expected)yield break;Place(spot);var prior=Keyboard.current;var keyboard=InputSystem.AddDevice<Keyboard>();
            InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.E));yield return null;yield return new WaitForEndOfFrame();
            Check("E selects only the nearest seat",expected.IsSeated && seats.Count(s=>s.IsSeated)==1);
            InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;
            InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.E));yield return null;yield return new WaitForEndOfFrame();
            Check("second E stands without entering a neighbour",walker.enabled && seats.All(s=>!s.IsSeated));
            InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;InputSystem.RemoveDevice(keyboard);if(prior!=null)prior.MakeCurrent();
        }
        void Capture(string name)
        {
            var camera=walker.View;var previousTarget=camera.targetTexture;var previous=RenderTexture.active;
            var rt=new RenderTexture(1200,800,24);var image=new Texture2D(1200,800,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,1200,800),0,0);image.Apply();File.WriteAllBytes(Path.Combine(OutputDirectory,name+".png"),image.EncodeToPNG());}
            finally{camera.targetTexture=previousTarget;RenderTexture.active=previous;rt.Release();Destroy(rt);Destroy(image);}
        }
        bool Approach(StationGardenSeat seat,out Vector3 start,out Vector3 end)
        {
            start=end=default;var forward=Vector3.ProjectOnPlane(seat.transform.forward,Vector3.up).normalized;
            foreach(float radius in new[]{1.4f,1.7f})for(int i=0;i<24;i++)
            {
                var d=Quaternion.Euler(0,i*15,0)*forward;
                if(!Floor(seat.transform.position+d*radius,seat.transform.position.y,out var b) || !Floor(seat.transform.position+d*(radius+.8f),seat.transform.position.y,out var a))continue;
                if(Free(a) && Free(b)){start=a;end=b;return true;}
            }
            return false;
        }
        bool Floor(Vector3 at,float height,out Vector3 point)
        {
            point=default;var hits=Physics.RaycastAll(at+Vector3.up,Vector3.down,2,~0,QueryTriggerInteraction.Ignore).Where(h=>h.collider!=body && h.normal.y>.65f && Mathf.Abs(h.point.y-height)<.35f).OrderBy(h=>h.distance).ToArray();
            if(hits.Length==0)return false;point=hits[0].point+Vector3.up*.08f;return true;
        }
        bool Free(Vector3 p)=>Physics.OverlapCapsule(p+Vector3.up*(body.center.y-body.height*.5f+body.radius),p+Vector3.up*(body.center.y+body.height*.5f-body.radius),body.radius-.03f,~0,QueryTriggerInteraction.Ignore).All(c=>c.GetComponentInParent<StationGrayboxWalker>()==walker);
        static Vector3 Local(Transform frame,Vector3 p)=>frame?frame.InverseTransformPoint(p):p;
        static Vector3 World(Transform frame,Vector3 p)=>frame?frame.TransformPoint(p):p;
        void Place(Vector3 p){body.enabled=false;walker.transform.position=p;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
