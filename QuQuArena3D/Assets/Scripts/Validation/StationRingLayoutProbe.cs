using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // P2 route contract through the measured envelope candidate. It does not claim building interaction coverage.
    public sealed class StationRingLayoutProbe : MonoBehaviour
    {
        [Serializable] public sealed class Result
        {
            public string scene, scope = "Three daily forecourt routes through planning envelopes; no migrated interactions";
            public float initialPhase, seconds, distance;
            public int frames;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks = new List<StationRingPrototypeProbe.Check>();
        }
        public string OutputDirectory;
        public float Phase;
        StationGrayboxWalker walker;
        StationRotatingRing r1, r2, r3;
        Result report;
        static readonly float[] R2Alleys = {70, 200, 310}, R3Alleys = {0, 120, 180, 300};

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args = Environment.GetCommandLineArgs();var at = Array.IndexOf(args,"--station-layout-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1])) return;
            var probe=new GameObject("V015 three ring daily routes").AddComponent<StationRingLayoutProbe>();
            probe.OutputDirectory=args[at+1];var phase=Array.IndexOf(args,"--station-layout-probe-phase");
            if(phase>=0 && phase+1<args.Length) probe.Phase=float.Parse(args[phase+1],System.Globalization.CultureInfo.InvariantCulture);
        }

        IEnumerator Start()
        {
            yield return null;yield return null;
            var oldCap=Application.targetFrameRate;var oldSync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,initialPhase=Phase};
            if(report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))
                report.scope="Three daily forecourt routes with actual source buildings and colliders; building interiors and interactions remain separate";
            Directory.CreateDirectory(OutputDirectory);
            walker=FindFirstObjectByType<StationGrayboxWalker>();walker.enabled=false;
            var save=FindFirstObjectByType<StationWorldSave>();save.enabled=false;
            var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            r1=Array.Find(rings,r=>r.RingId=="v015-r1");r2=Array.Find(rings,r=>r.RingId=="v015-r2");r3=Array.Find(rings,r=>r.RingId=="v015-r3");
            r1.transform.rotation=Quaternion.Euler(0,Phase,0);r2.transform.rotation=Quaternion.Euler(0,-Phase,0);
            r3.transform.rotation=Quaternion.Euler(0,Phase*.5f,0);
            var rotations=new[]{r1.transform.rotation,r2.transform.rotation,r3.transform.rotation};
            var start=Time.time;

            // Arrival -> public cafe forecourt -> event core entrance.
            Place(new Vector3(0,0,258));
            yield return Move("arrival curved seam",()=>new Vector3(0,0,250));
            float a=Closest(r3,R3Alleys);yield return Arc("outer edge to rotating street",r3,250,a);
            yield return Move("outer street to inner edge",()=>Point(r3,188,a));
            yield return Move("outer to fixed B",()=>Point(r3,180,a));
            float b=Closest(r2,R2Alleys);yield return Arc("fixed B to middle street",r2,180,b,true);
            yield return Move("middle outer seam",()=>Point(r2,172,b));
            yield return Move("middle radial street",()=>Point(r2,96,b));
            yield return Arc("cafe forecourt",r2,96,0);
            yield return Pause("cafe on middle ring",r2);
            yield return Arc("middle edge to event street",r2,96,70);
            yield return Move("middle to fixed A",()=>Point(r2,88,70));
            yield return Arc("fixed A to arena entrance",r1,88,0,true);
            yield return Move("event entrance seam",()=>Point(r1,81,0));
            yield return Pause("event entrance on inner ring",r1);
            Snapshot("arrival-cafe-arena");

            // Original home forecourt -> research -> the same moving home.
            Place(Point(r3,204,50));yield return Move("home to outer inner edge",()=>Point(r3,188,50));
            a=Closest(r3,R3Alleys);yield return Arc("home edge to transfer street",r3,188,a);
            yield return Move("home to fixed B",()=>Point(r3,180,a));
            b=Closest(r2,R2Alleys);yield return Arc("fixed B to research street",r2,180,b,true);
            yield return Move("research outer seam",()=>Point(r2,172,b));
            yield return Move("research radial street",()=>Point(r2,96,b));
            yield return Arc("research forecourt",r2,96,120);
            yield return Pause("research on middle ring",r2);
            yield return Arc("research return street",r2,96,70);
            yield return Move("research return radial street",()=>Point(r2,172,70));
            yield return Move("research return to fixed B",()=>Point(r2,180,70));
            a=Closest(r3,R3Alleys);yield return Arc("fixed B to home ring",r3,180,a,true);
            yield return Move("home ring seam",()=>Point(r3,188,a));
            yield return Arc("return to original home street",r3,188,50);
            yield return Move("return to original home forecourt",()=>Point(r3,204,50));
            yield return Pause("original home on outer ring",r3);
            Snapshot("home-research-home");

            // Home -> enclosed garden forecourt -> outer observation walk -> home, all on R3.
            yield return Move("home to garden walk",()=>Point(r3,188,50));
            yield return Arc("garden forecourt",r3,188,240);
            yield return Pause("garden on outer ring",r3);
            yield return Arc("garden to observation street",r3,188,180);
            yield return Move("observation radial street",()=>Point(r3,250,180));
            yield return Arc("outer observation walk",r3,250,200);
            yield return Pause("observation on outer ring",r3);
            yield return Arc("observation return street",r3,250,120);
            yield return Move("outer home return street",()=>Point(r3,188,120));
            yield return Arc("garden trip home return",r3,188,50);
            yield return Move("garden trip original home forecourt",()=>Point(r3,204,50));
            yield return Pause("garden trip returns to same home",r3);
            for(int i=0;i<3;i++) Check("ring "+i+" rotated at normal speed",Quaternion.Angle(rotations[i],new[]{r1,r2,r3}[i].transform.rotation)>.5f);
            report.seconds=Time.time-start;report.passed=report.checks.TrueForAll(c=>c.passed);
            Snapshot("daily");
            walker.enabled=true;Application.targetFrameRate=oldCap;QualitySettings.vSyncCount=oldSync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }

        static Vector3 Point(StationRotatingRing ring,float radius,float angle)
            =>ring.transform.TransformPoint(Quaternion.Euler(0,angle,0)*Vector3.right*radius);
        float Closest(StationRotatingRing ring,float[] angles)
        {
            float best=360,result=angles[0];
            foreach(float angle in angles){var gap=Vector3.Angle(walker.transform.position,Point(ring,1,angle));if(gap<best){best=gap;result=angle;}}
            return result;
        }
        void Place(Vector3 p)
        {
            var cc=walker.GetComponent<CharacterController>();cc.enabled=false;walker.transform.position=p+Vector3.up*.08f;
            cc.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();
        }
        IEnumerator Arc(string name,StationRotatingRing ring,float radius,float angle,bool fixedBand=false)
            =>Move(name,()=>Point(ring,radius,angle),radius,fixedBand);
        IEnumerator Move(string name,Func<Vector3> destination,float arcRadius=0,bool fixedBand=false)
        {
            float end=Time.time+180,minY=10,maxY=-10,radiusError=0;bool clear=true,stationary=true;
            float movedAt=Time.time,bestDistance=Vector3.Distance(walker.transform.position,destination());
            while(Time.time<end)
            {
                var p=walker.transform.position;var target=destination();var delta=target-p;delta.y=0;
                if(delta.magnitude<.1f)break;
                if(arcRadius>0)
                {
                    float from=Mathf.Atan2(p.z,p.x)*Mathf.Rad2Deg,to=Mathf.Atan2(target.z,target.x)*Mathf.Rad2Deg;
                    float angle=(from+Mathf.Clamp(Mathf.DeltaAngle(from,to),-2,2))*Mathf.Deg2Rad;
                    delta=new Vector3(Mathf.Cos(angle)*arcRadius,p.y,Mathf.Sin(angle)*arcRadius)-p;
                }
                walker.MoveOnGround(delta.normalized*Mathf.Min(6,delta.magnitude/Time.deltaTime),Time.deltaTime);
                var current=walker.transform.position;report.frames++;report.distance+=Vector3.Distance(p,current);
                float remaining=Vector3.Distance(current,destination());
                if(remaining<bestDistance-.15f){bestDistance=remaining;movedAt=Time.time;}
                if(Time.time-movedAt>5)break;
                minY=Mathf.Min(minY,current.y);maxY=Mathf.Max(maxY,current.y);
                foreach(var collider in Physics.OverlapCapsule(current+Vector3.up*.4f,current+Vector3.up*1.4f,.27f))
                    if(!collider.isTrigger && collider.GetComponentInParent<StationGrayboxWalker>()!=walker)clear=false;
                if(arcRadius>0)radiusError=Mathf.Max(radiusError,Mathf.Abs(new Vector2(current.x,current.z).magnitude-arcRadius));
                if(fixedBand)stationary&=!walker.GroundRing;
                yield return null;
            }
            var gap=destination()-walker.transform.position;gap.y=0;
            Check(name+" reached",gap.magnitude<.15f,gap.magnitude);
            Check(name+" supported",minY>-.15f&&maxY<.2f,maxY-minY);
            Check(name+" no building penetration",clear);
            if(arcRadius>0)Check(name+" stays on arc",radiusError<.5f&&stationary,radiusError);
            Snapshot("progress");
        }
        IEnumerator Pause(string name,StationRotatingRing ring)
        {
            var local=ring.transform.InverseTransformPoint(walker.transform.position);float end=Time.time+1,max=0;
            while(Time.time<end){walker.MoveOnGround(Vector3.zero,Time.deltaTime);max=Mathf.Max(max,Vector3.Distance(local,ring.transform.InverseTransformPoint(walker.transform.position)));report.frames++;yield return null;}
            Check(name,walker.GroundRing==ring&&max<.04f,max);
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Snapshot(string stage)=>File.WriteAllText(Path.Combine(OutputDirectory,stage+".json"),JsonUtility.ToJson(report,true));
    }
}
