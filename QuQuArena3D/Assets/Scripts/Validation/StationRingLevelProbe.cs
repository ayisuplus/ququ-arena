using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Verify rebased observation bays and seat approaches with real collisions and normal R2 motion.
    public sealed class StationRingLevelProbe : MonoBehaviour
    {
        [Serializable] public sealed class Result
        {
            public string scene, segment;
            public float phase, seconds, distance;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> blockages=new List<string>();
            public List<string> supportGaps=new List<string>();
        }
        public string OutputDirectory;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        StationRotatingRing ring;
        Result report;
        float started;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-level-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var probe=new GameObject("V015 observation level route validation").AddComponent<StationRingLevelProbe>();
            probe.OutputDirectory=args[at+1];int phase=Array.IndexOf(args,"--station-level-probe-phase");
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
            walker.enabled=true;walker.MovementLocked=true;
            var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            foreach(var r in rings)r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-Phase:Phase,0);
            ring=rings.Single(r=>r.RingId=="v015-r2");
            var research=GameObject.Find("V015 package - research lower observation bay").transform;
            yield return Route("research observation",research,new[]{new Vector3(38,0,0),new Vector3(20,0,0),new Vector3(10,0,0),
                new Vector3(1,0,0),new Vector3(-2,0,0),new Vector3(-5.55f,0,0),new Vector3(-8.55f,0,2.2f),
                new Vector3(-5.55f,0,0),new Vector3(-2.55f,0,2.2f)});
            var cafe=GameObject.Find("V015 package - r2-cafe-lower-lookout").transform;
            yield return Route("cafe observation",cafe,new[]{new Vector3(38,0,12),new Vector3(5,0,12),new Vector3(0,0,12),
                new Vector3(0,0,4),new Vector3(0,0,-8),new Vector3(0,0,-12),new Vector3(0,0,-16),new Vector3(-4.5f,0,-12)});
            var gallery=GameObject.Find("V015 package - cafe and observation gallery").transform;
            yield return Route("cafe covered gallery",gallery,new[]{new Vector3(0,0,0),new Vector3(0,0,-12),
                new Vector3(-4,0,-12),new Vector3(-4,0,-36),new Vector3(-20,0,-36),new Vector3(-20,0,-39),new Vector3(-20,0,-33)});
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("level");
            walker.MovementLocked=false;Application.targetFrameRate=oldCap;QualitySettings.vSyncCount=oldSync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        void Place(Vector3 point)
        {body.enabled=false;walker.transform.position=point+Vector3.up*.08f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        IEnumerator Route(string label,Transform frame,Vector3[] path,bool place=true)
        {
            float rotation=ring.transform.eulerAngles.y;
            if(place)Place(frame.TransformPoint(path[0]));
            for(int i=1;i<path.Length;i++)yield return Move(label+" up "+i,frame,path[i]);
            yield return Hold(label+" observation point");
            if(label=="research observation")
            {
                var seats=frame.GetComponentsInChildren<StationGardenSeat>();
                Check("both research seat markers follow their observation bay",seats.Length==2);
                foreach(var seat in seats)
                {
                    var local=frame.InverseTransformPoint(seat.transform.position);
                    Check(seat.StableId+" above local floor",Mathf.Abs(local.y-.02f)<.01f);
                    var approach=new Vector3(local.x,0,2.2f);
                    yield return Move(seat.StableId+" reachable approach",frame,approach);
                    Check(seat.StableId+" within use distance",Vector3.Distance(walker.transform.position,seat.transform.position)<2.1f);
                }
                yield return Move("research return to route",frame,path[path.Length-1]);
            }
            for(int i=path.Length-2;i>=0;i--)yield return Move(label+" down "+i,frame,path[i]);
            yield return Hold(label+" back on deck");
            Check(label+" normal rotation",Mathf.Abs(Mathf.DeltaAngle(rotation,ring.transform.eulerAngles.y))>.05f);
        }
        void Step(Vector3 target)
        {var before=walker.transform.position;var d=target-before;d.y=0;walker.MoveOnGround(d.normalized*Mathf.Min(6,d.magnitude/Time.deltaTime),Time.deltaTime);report.distance+=Vector3.Distance(before,walker.transform.position);}
        IEnumerator Hold(string label)
        {
            var local=ring.transform.InverseTransformPoint(walker.transform.position);float end=Time.time+2,drift=0;bool carried=true;
            while(Time.time<end){Step(walker.transform.position);drift=Mathf.Max(drift,Vector3.Distance(ring.transform.InverseTransformPoint(walker.transform.position),local));carried&=walker.GroundRing==ring;yield return null;}
            Check(label+" holds moving ground",carried && drift<.05f,drift);
        }
        IEnumerator Move(string label,Transform frame,Vector3 local)
        {
            report.segment=label;float until=Time.time+35,lastProgress=Time.time,best=float.MaxValue;bool support=true,clear=true;int gaps=0;
            while(Time.time<until)
            {
                var target=frame.TransformPoint(local);var delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.1f)break;
                if(delta.magnitude<best-.1f){best=delta.magnitude;lastProgress=Time.time;}if(Time.time-lastProgress>4)break;
                Step(target);support&=walker.GroundRing==ring;
                if(walker.GroundRing!=ring && gaps++<6)
                {
                    var hits=Physics.RaycastAll(walker.transform.position+Vector3.up*.25f,Vector3.down,5,~0,QueryTriggerInteraction.Ignore)
                        .Where(h=>h.collider!=body).OrderBy(h=>h.distance);
                    report.supportGaps.Add(label+" local="+frame.InverseTransformPoint(walker.transform.position).ToString("F4")+
                        " ground="+string.Join(";",hits.Select(h=>h.collider.name+" distance="+h.distance.ToString("F4")+" normalY="+h.normal.y.ToString("F4"))));
                }
                foreach(var c in Physics.OverlapCapsule(walker.transform.position+Vector3.up*.65f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore))
                    if(c.GetComponentInParent<StationGrayboxWalker>()!=walker){clear=false;string entry=label+": "+c.name;if(!report.blockages.Contains(entry))report.blockages.Add(entry);}
                yield return null;
            }
            var gap=frame.TransformPoint(local)-walker.transform.position;float height=Mathf.Abs(gap.y);gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);Check(label+" correct elevation",height<.35f,height);
            Check(label+" supported",support);Check(label+" no penetration",clear);Save("progress");
            if(gap.magnitude>=.15f || height>=.35f)throw new InvalidOperationException("Observation route blocked at "+label+"; see progress.json");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
