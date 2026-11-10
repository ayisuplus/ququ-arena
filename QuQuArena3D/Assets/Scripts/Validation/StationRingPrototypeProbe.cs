using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Runs across actual rendered frames at normal ring speed. Never advances the ring clock artificially.
    public sealed class StationRingPrototypeProbe : MonoBehaviour
    {
        [Serializable] public sealed class Check { public string name; public bool passed; public float error; }
        [Serializable] sealed class SavedPose { public int version; public StationRingLocation ringLocation; }
        [Serializable] public sealed class Report
        {
            public string stage, mode, scene, error;
            public bool passed;
            public int frames;
            public int targetFrameRate;
            public List<Check> checks = new List<Check>();
        }
        public string OutputDirectory;
        public string Stage = "walk";
        public int TargetFrameRate = 60;
        StationGrayboxWalker walker;
        Report report;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();var at=Array.IndexOf(args,"--station-ring-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1])) return;
            var probe=new GameObject("V015 ring probe").AddComponent<StationRingPrototypeProbe>();
            probe.OutputDirectory=args[at+1];var stage=Array.IndexOf(args,"--station-ring-probe-stage");
            if(stage>=0 && stage+1<args.Length) probe.Stage=args[stage+1];
            var fps=Array.IndexOf(args,"--station-ring-probe-fps");
            if(fps>=0 && fps+1<args.Length && int.TryParse(args[fps+1],out var cap) && cap>0)
                probe.TargetFrameRate=cap;
        }

        IEnumerator Start()
        {
            yield return null; yield return null;
            Directory.CreateDirectory(OutputDirectory);
            var oldCap=Application.targetFrameRate;var oldVsync=QualitySettings.vSyncCount;
            QualitySettings.vSyncCount=0;Application.targetFrameRate=TargetFrameRate;
            report=new Report {stage=Stage,scene=SceneManager.GetActiveScene().path,
                targetFrameRate=TargetFrameRate,
                mode=Application.isEditor?"Editor Play, real frame movement":"Standalone Player, real frame movement"};
            walker=FindFirstObjectByType<StationGrayboxWalker>();
            walker.enabled=false;
            var save=FindFirstObjectByType<StationWorldSave>();
            CheckResult("real world save initialized",save && save.enabled && save.FilePath!=null);
            if(Stage=="read-fixed")
            {
                CheckResult("v1 primary save restored",save.LastLoadSource=="primary");
                CheckResult("v1 stationary position restored",Vector3.Distance(walker.transform.position,
                    new Vector3(68,.08f,0))<.1f);
                yield return Stand("v1 stationary standing",2);
                CheckResult("v1 save remains writable",save.SaveNow() &&
                    JsonUtility.FromJson<SavedPose>(File.ReadAllText(save.FilePath)).version==1);
            }
            else if(Stage=="read")
            {
                CheckResult("primary save restored",save.LastLoadSource=="primary");
                var expected=JsonUtility.FromJson<StationRingLocation>(File.ReadAllText(Path.Combine(OutputDirectory,"expected-location.json")));
                CheckResult("ring-local pose resolves",StationRotatingRing.TryResolve(expected,out var restored,out var yaw));
                CheckResult("player restored into current ring phase",Vector3.Distance(walker.transform.position,restored)<.08f,Vector3.Distance(walker.transform.position,restored));
                CheckResult("view yaw restored",Quaternion.Angle(walker.transform.rotation,yaw)<.05f,Quaternion.Angle(walker.transform.rotation,yaw));
                yield return Stand("restored standing",2);
            }
            else if(Stage=="streets")
            {
                yield return Streets(save);
            }
            else
            {
                var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
                foreach(var phase in new[]{0f,47f,173f})
                {
                    foreach(var ring in rings) ring.transform.rotation=Quaternion.Euler(0,phase*(ring.DegreesPerSecond>0?1:-1),0);
                    Place(new Vector3(52,.08f,0));
                    yield return Stand("inner carry at "+phase,2);
                    yield return Walk("radial outward at "+phase,new Vector3(84,0,0));
                    yield return Stand("outer opposite carry at "+phase,2);
                    yield return Walk("diagonal inward at "+phase,new Vector3(52,0,12));
                    yield return Walk("return outward at "+phase,new Vector3(84,0,-12));
                    Place(new Vector3(68,.08f,0));
                    yield return Stand("stationary transfer at "+phase,2);
                    Place(new Vector3(64,.08f,0));
                    yield return Stand("stop on seam at "+phase,1);
                    yield return Walk("reverse from seam at "+phase,new Vector3(58,0,0));
                }
                Place(new Vector3(84,.08f,0));yield return Stand("before save",1);
                var expected=walker.GroundRing.Capture(walker.transform.position,walker.transform.rotation);
                File.WriteAllText(Path.Combine(OutputDirectory,"expected-location.json"),JsonUtility.ToJson(expected,true));
                CheckResult("ring-local save written",save.SaveNow() && File.ReadAllText(save.FilePath).Contains("\"version\": 2"));
                var saved=File.ReadAllText(save.FilePath);
                Place(new Vector3(72,.08f,0));yield return Stand("seam save exclusion",.2f);
                var fallbackWritten=save.SaveNow();
                var fallback=JsonUtility.FromJson<SavedPose>(File.ReadAllText(save.FilePath));
                CheckResult("seam falls back to prior safe location",fallbackWritten && fallback.version==2 &&
                    fallback.ringLocation!=null && fallback.ringLocation.ringId==expected.ringId &&
                    Vector3.Distance(fallback.ringLocation.localPosition,expected.localPosition)<.005f);
                // Preserve the exact pre-seam location for the separate reload test.
                File.WriteAllText(save.FilePath,saved);
            }
            save.enabled=false;
            report.passed=report.checks.TrueForAll(c=>c.passed);
            File.WriteAllText(Path.Combine(OutputDirectory,Stage+".json"),JsonUtility.ToJson(report,true));
            walker.enabled=true;
            Application.targetFrameRate=oldCap;QualitySettings.vSyncCount=oldVsync;
            if(!Application.isEditor) Application.Quit(report.passed?0:1);
        }

        void Place(Vector3 position)
        {
            var cc=walker.GetComponent<CharacterController>();cc.enabled=false;
            walker.transform.SetPositionAndRotation(position,Quaternion.Euler(0,90,0));cc.enabled=true;
            Physics.SyncTransforms();walker.ResetGroundReference();
        }

        IEnumerator Streets(StationWorldSave save)
        {
            var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            var inner=Array.Find(rings,r=>r.RingId=="prototype-inner");
            var outer=Array.Find(rings,r=>r.RingId=="prototype-outer");
            CheckResult("street candidate has sixteen physical building envelopes",
                Array.FindAll(FindObjectsByType<BoxCollider>(FindObjectsSortMode.None),
                    c=>c.name.Contains("building envelope")).Length==16);
            foreach(var phase in new[]{0f,47f,173f})
            {
                inner.transform.rotation=Quaternion.Euler(0,phase,0);
                outer.transform.rotation=Quaternion.Euler(0,-phase,0);
                Place(StreetPoint(inner,52,0)+Vector3.up*.08f);
                yield return Stand("street start "+phase,1);
                yield return WalkMoving("inner street exit "+phase,()=>StreetPoint(inner,61,0),false);
                yield return WalkMoving("inner seam to fixed band "+phase,()=>StreetPoint(inner,68,0),false);
                CheckResult("inner exit on stationary band "+phase,!walker.GroundRing);
                // Choose the closest of the four actual outer streets, then follow its moving mouth.
                float entry=25,best=360;
                for(int i=0;i<4;i++)
                {
                    float angle=25+i*90;
                    var gap=Vector3.Angle(walker.transform.position,StreetPoint(outer,68,angle));
                    if(gap<best){best=gap;entry=angle;}
                }
                CheckResult("street mouths are genuinely offset "+phase,best>10,best);
                yield return WalkMoving("fixed band arc outward "+phase,()=>StreetPoint(outer,68,entry),true);
                yield return Stand("fixed band pause "+phase,1);
                yield return WalkMoving("outer seam to edge sidewalk "+phase,()=>StreetPoint(outer,75,entry),false);
                yield return WalkMoving("outer moving street destination "+phase,()=>StreetPoint(outer,88,entry),false);
                CheckResult("destination belongs to outer rotating ring "+phase,walker.GroundRing==outer);
                yield return Stand("outer street carry "+phase,2);
                yield return WalkMoving("outer street return "+phase,()=>StreetPoint(outer,75,entry),false);
                yield return WalkMoving("outer seam return "+phase,()=>StreetPoint(outer,68,entry),false);
                yield return WalkMoving("fixed band arc home "+phase,()=>StreetPoint(inner,68,0),true);
                yield return WalkMoving("inner seam return "+phase,()=>StreetPoint(inner,61,0),false);
                yield return WalkMoving("inner street home "+phase,()=>StreetPoint(inner,52,0),false);
                CheckResult("return belongs to original inner ring "+phase,walker.GroundRing==inner);
            }
            var expected=walker.GroundRing.Capture(walker.transform.position,walker.transform.rotation);
            File.WriteAllText(Path.Combine(OutputDirectory,"expected-location.json"),JsonUtility.ToJson(expected,true));
            CheckResult("street destination ring-local save written",save.SaveNow() &&
                JsonUtility.FromJson<SavedPose>(File.ReadAllText(save.FilePath)).version==2);
        }

        static Vector3 StreetPoint(StationRotatingRing ring,float radius,float streetAngle)
            => ring.transform.TransformPoint(Quaternion.Euler(0,streetAngle,0)*Vector3.right*radius);

        IEnumerator WalkMoving(string name,Func<Vector3> destination,bool fixedArc)
        {
            float end=Time.time+30,minY=10,maxY=-10,maxRadiusError=0;
            bool clear=true,stationary=true;
            while(Time.time<end)
            {
                var position=walker.transform.position;
                var target=destination();var delta=target-position;delta.y=0;
                if(delta.magnitude<.1f) break;
                if(fixedArc)
                {
                    var from=Mathf.Atan2(position.z,position.x)*Mathf.Rad2Deg;
                    var to=Mathf.Atan2(target.z,target.x)*Mathf.Rad2Deg;
                    var angle=(from+Mathf.Clamp(Mathf.DeltaAngle(from,to),-4,4))*Mathf.Deg2Rad;
                    delta=new Vector3(Mathf.Cos(angle)*68,position.y,Mathf.Sin(angle)*68)-position;
                }
                walker.MoveOnGround(delta.normalized*Mathf.Min(6,delta.magnitude/Time.deltaTime),Time.deltaTime);
                position=walker.transform.position;report.frames++;
                minY=Mathf.Min(minY,position.y);maxY=Mathf.Max(maxY,position.y);
                foreach(var hit in Physics.OverlapCapsule(position+Vector3.up*.4f,position+Vector3.up*1.4f,.27f))
                    if(hit is BoxCollider && hit.name.Contains("building envelope")) clear=false;
                if(fixedArc)
                {
                    maxRadiusError=Mathf.Max(maxRadiusError,Mathf.Abs(new Vector2(position.x,position.z).magnitude-68));
                    stationary&=!walker.GroundRing;
                }
                yield return null;
            }
            var gap=destination()-walker.transform.position;gap.y=0;
            CheckResult(name+" reaches moving destination",gap.magnitude<.15f,gap.magnitude);
            CheckResult(name+" no drop or step",minY>-.15f && maxY<.2f,maxY-minY);
            CheckResult(name+" no wall penetration",clear);
            if(fixedArc) CheckResult(name+" stays on fixed band",stationary && maxRadiusError<.5f,maxRadiusError);
        }

        IEnumerator Stand(string name,float duration)
        {
            // Settle onto the support before taking the local-space baseline.
            for(int i=0;i<3;i++){walker.MoveOnGround(Vector3.zero,Time.deltaTime);yield return null;}
            var ring=walker.GroundRing;
            var position=ring?ring.transform.InverseTransformPoint(walker.transform.position):walker.transform.position;
            var rotation=ring?Quaternion.Inverse(ring.transform.rotation)*walker.transform.rotation:walker.transform.rotation;
            float end=Time.time+duration, error=0,yawError=0;
            while(Time.time<end)
            {
                walker.MoveOnGround(Vector3.zero,Time.deltaTime);report.frames++;
                var current=ring?ring.transform.InverseTransformPoint(walker.transform.position):walker.transform.position;
                error=Mathf.Max(error,Vector3.Distance(position,current));
                var yaw=ring?Quaternion.Inverse(ring.transform.rotation)*walker.transform.rotation:walker.transform.rotation;
                yawError=Mathf.Max(yawError,Quaternion.Angle(rotation,yaw));
                yield return null;
            }
            CheckResult(name+" position stable",error<.04f,error);
            CheckResult(name+" camera yaw stable",yawError<.08f,yawError);
        }

        IEnumerator Walk(string name,Vector3 target)
        {
            float end=Time.time+15,minY=10,maxY=-10;
            while(Time.time<end)
            {
                var delta=target-walker.transform.position;delta.y=0;
                if(delta.magnitude<.1f) break;
                walker.MoveOnGround(delta.normalized*Mathf.Min(6,delta.magnitude/Time.deltaTime),Time.deltaTime);
                report.frames++;minY=Mathf.Min(minY,walker.transform.position.y);maxY=Mathf.Max(maxY,walker.transform.position.y);
                yield return null;
            }
            var gap=target-walker.transform.position;gap.y=0;
            CheckResult(name+" reaches destination",gap.magnitude<.15f,gap.magnitude);
            CheckResult(name+" no drop or step",minY>-.15f && maxY<.2f,maxY-minY);
        }

        void CheckResult(string name,bool passed,float error=0)
        {
            report.checks.Add(new Check{name=name,passed=passed,error=error});
        }
    }
}
