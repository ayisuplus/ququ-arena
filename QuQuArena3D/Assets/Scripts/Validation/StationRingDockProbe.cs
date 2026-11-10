using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Continuous return journey through the real fixed airlock, ramp and vessel.
    public sealed class StationRingDockProbe : MonoBehaviour
    {
        [Serializable] public sealed class Result
        {
            public string scene, segment;
            public float phase, seconds, distance;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> blockages=new List<string>();
        }
        public string OutputDirectory;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        StationDockAirlock airlock;
        StationDockedVesselHatch hatch;
        Result report;
        float started, x;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-dock-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var probe=new GameObject("V015 fixed dock route").AddComponent<StationRingDockProbe>();
            probe.OutputDirectory=args[at+1];int phase=Array.IndexOf(args,"--station-dock-probe-phase");
            if(phase>=0 && phase+1<args.Length)probe.Phase=float.Parse(args[phase+1],System.Globalization.CultureInfo.InvariantCulture);
        }

        IEnumerator Start()
        {
            yield return null;yield return null;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,phase=Phase};
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Real building candidate required");
            Directory.CreateDirectory(OutputDirectory);started=Time.time;
            int oldCap=Application.targetFrameRate,oldSync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();
            airlock=FindFirstObjectByType<StationDockAirlock>();hatch=FindFirstObjectByType<StationDockedVesselHatch>();
            walker.enabled=true;walker.MovementLocked=true;x=airlock.InnerDoor.position.x;
            var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            foreach(var ring in rings)ring.transform.rotation=Quaternion.Euler(0,ring.RingId=="v015-r2"?-Phase:Phase,0);
            var outer=rings.Single(r=>r.RingId=="v015-r3");var rotation=outer.transform.rotation;
            Check("fixed dock doors enabled",airlock.enabled && hatch.enabled);
            Check("fixed references",!airlock.GetComponentInParent<StationRotatingRing>() && !hatch.GetComponentInParent<StationRotatingRing>());
            body.enabled=false;walker.transform.position=new Vector3(0,.08f,250);body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();
            yield return Move("outer edge to fixed arrival",new Vector3(0,0,258));Check("standing on fixed arrival",!walker.GroundRing);
            yield return Move("arrival centerline",new Vector3(x,0,258));
            if(GameObject.Find("V015 fixed arrival courts"))
            {
                yield return Move("arrival covered forecourt",new Vector3(x,0,263));
                foreach(string key in new[]{"07 visitor","09 waiting"})
                {
                    var hall=GameObject.Find("V015 package - "+key).transform;
                    yield return Move(key+" linked forecourt",new Vector3(hall.position.x,0,263));
                    yield return Move(key+" front entrance",hall.TransformPoint(new Vector3(0,0,-11)));
                    yield return Move(key+" central hall",hall.TransformPoint(new Vector3(0,0,0)));
                    yield return Move(key+" rear entrance",hall.TransformPoint(new Vector3(0,0,15)));
                    yield return Move(key+" return through hall",hall.TransformPoint(new Vector3(0,0,-15)));
                    yield return Move(key+" return to canopy",new Vector3(hall.position.x,0,263));
                    yield return Move(key+" return to arrival",new Vector3(x,0,263));
                    Check(key+" route remains fixed",!walker.GroundRing);
                }
                yield return Move("covered forecourt return",new Vector3(x,0,258));
            }
            float inner=airlock.InnerDoor.position.z,outerZ=airlock.OuterDoor.position.z,ship=hatch.transform.position.z;
            yield return Move("arrival hall to inner airlock",new Vector3(x,0,inner-2));
            yield return Blocked("closed inner door",inner,1);
            Check("open inner",airlock.UseInner());
            yield return Move("inner occupied",new Vector3(x,0,inner));Check("inner anti pinch",!airlock.UseInner() && airlock.InnerOpen);
            yield return Move("chamber to outer door",new Vector3(x,0,outerZ-2));
            Check("outer interlock in reach",!airlock.UseOuter() && !airlock.OuterOpen && airlock.InnerOpen);
            yield return Move("return to close inner",new Vector3(x,0,inner+2));Check("close inner",airlock.UseInner());
            yield return Move("closed chamber to outer",new Vector3(x,0,outerZ-2));
            yield return Blocked("closed outer door",outerZ,1);Check("open outer",airlock.UseOuter());
            yield return Move("outer occupied",new Vector3(x,0,outerZ));Check("outer anti pinch",!airlock.UseOuter() && airlock.OuterOpen);
            yield return Move("dock side of outer",new Vector3(x,0,outerZ+2));Check("close outer",airlock.UseOuter());
            yield return Move("dock floor to ramp foot",new Vector3(x,0,ship-15));
            yield return Move("ascend berth ramp",new Vector3(x,0,ship-2));
            yield return Blocked("closed vessel hatch",ship,1);Check("open vessel",hatch.Use());
            yield return Move("vessel threshold occupied",new Vector3(x,0,ship));Check("vessel anti pinch",!hatch.Use() && hatch.IsOpen);
            yield return Move("vessel adapter",new Vector3(x,0,ship+2));Check("close vessel from inside",hatch.Use());
            yield return Move("cabin far end",new Vector3(x,0,ship+29));Check("on raised cabin floor",Mathf.Abs(walker.transform.position.y-2.3f)<.2f && !walker.GroundRing);
            yield return Move("return to vessel door",new Vector3(x,0,ship+2));
            yield return Blocked("closed vessel from inside",ship,-1);Check("open vessel for return",hatch.Use());
            yield return Move("back onto ramp",new Vector3(x,0,ship-2));Check("close vessel from outside",hatch.Use());
            yield return Move("descend berth ramp",new Vector3(x,0,ship-15));
            yield return Move("return to outer airlock",new Vector3(x,0,outerZ+2));Check("open outer for return",airlock.UseOuter());
            yield return Move("return inside chamber",new Vector3(x,0,outerZ-2));
            yield return Move("inner interlock approach",new Vector3(x,0,inner+2));
            Check("inner interlock in reach",!airlock.UseInner() && !airlock.InnerOpen && airlock.OuterOpen);
            yield return Move("return to close outer",new Vector3(x,0,outerZ-2));Check("close outer from chamber",airlock.UseOuter());
            yield return Move("return to inner",new Vector3(x,0,inner+2));Check("open inner for return",airlock.UseInner());
            yield return Move("exit chamber",new Vector3(x,0,inner-2));Check("close inner after return",airlock.UseInner());
            yield return Move("return through arrival hall",new Vector3(x,0,258));
            yield return Move("fixed return seam",new Vector3(0,0,258));
            yield return Move("return to rotating outer edge",new Vector3(0,0,250));Check("back on outer ring",walker.GroundRing==outer);
            var local=outer.transform.InverseTransformPoint(walker.transform.position);float end=Time.time+2,drift=0;
            while(Time.time<end){Step(walker.transform.position);var p=outer.transform.InverseTransformPoint(walker.transform.position);p.y=local.y;drift=Mathf.Max(drift,Vector3.Distance(p,local));yield return null;}
            Check("outer carry after dock return",drift<.05f && walker.GroundRing==outer,drift);
            Check("normal ring rotation",Quaternion.Angle(rotation,outer.transform.rotation)>.1f);
            Check("all dock doors closed",!airlock.InnerOpen && !airlock.OuterOpen && !hatch.IsOpen);
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("dock");
            walker.MovementLocked=false;Application.targetFrameRate=oldCap;QualitySettings.vSyncCount=oldSync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }

        void Step(Vector3 target)
        {var before=walker.transform.position;var d=target-before;d.y=0;walker.MoveOnGround(d.normalized*Mathf.Min(6,d.magnitude/Time.deltaTime),Time.deltaTime);report.distance+=Vector3.Distance(before,walker.transform.position);}
        IEnumerator Blocked(string label,float z,int direction)
        {
            float end=Time.time+.8f;while(Time.time<end){Step(new Vector3(x,0,z+direction*2));yield return null;}
            Check(label+" blocks physical crossing",(walker.transform.position.z-z)*direction<-.25f);Save("progress");
        }
        IEnumerator Move(string label,Vector3 target)
        {
            report.segment=label;float until=Time.time+35,lastProgress=Time.time,best=float.MaxValue;bool support=true,clear=true;
            while(Time.time<until)
            {
                var delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.1f)break;
                if(delta.magnitude<best-.1f){best=delta.magnitude;lastProgress=Time.time;}if(Time.time-lastProgress>4)break;
                Step(target);
                support&=Physics.RaycastAll(walker.transform.position+Vector3.up*.2f,Vector3.down,.6f,~0,QueryTriggerInteraction.Ignore)
                    .Any(h=>h.collider!=body && h.normal.y>.65f);
                foreach(var c in Physics.OverlapCapsule(walker.transform.position+Vector3.up*.55f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore))
                    if(c.GetComponentInParent<StationGrayboxWalker>()!=walker){clear=false;string entry=label+": "+c.name;if(!report.blockages.Contains(entry))report.blockages.Add(entry);}
                yield return null;
            }
            var gap=target-walker.transform.position;gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);Check(label+" supported",support);Check(label+" no penetration",clear);Save("progress");
            if(gap.magnitude>=.15f)throw new InvalidOperationException("Dock route blocked at "+label+"; see progress.json");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
