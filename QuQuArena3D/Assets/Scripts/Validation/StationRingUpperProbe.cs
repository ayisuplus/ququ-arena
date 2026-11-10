using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Exercise the existing upper routes with the real walker and normal ring motion.
    public sealed class StationRingUpperProbe : MonoBehaviour
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
        StationCoreEastGate gate;
        Result report;
        float started;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-upper-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var probe=new GameObject("V015 upper route validation").AddComponent<StationRingUpperProbe>();
            probe.OutputDirectory=args[at+1];int phase=Array.IndexOf(args,"--station-upper-probe-phase");
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
            ring=rings.Single(r=>r.RingId=="v015-r1");
            gate=FindFirstObjectByType<StationCoreEastGate>();
            Check("core gate enabled and owned by inner ring",gate && gate.enabled && gate.Door.GetComponentInParent<StationRotatingRing>()==ring);
            Place(ring.transform.TransformPoint(81,0,0));
            yield return GatePass("core entrance",73);
            var spectatorPath=GameObject.Find("V015 circular spectator stands")?CircularSpectatorPath():new[]{new Vector3(73,0,0),new Vector3(73,0,22),new Vector3(70,0,22),new Vector3(39,0,22),
                new Vector3(39,17.175f,-53),new Vector3(42,17.175f,-53),new Vector3(43,17.175f,-49),
                new Vector3(43,17.175f,59),new Vector3(42,17.175f,60),new Vector3(6.5f,17.175f,60)};
            yield return Route("spectator",ring.transform,spectatorPath,false);
            yield return GatePass("core exit",81);
            ring=rings.Single(r=>r.RingId=="v015-r3");
            var frame=GameObject.Find("V015 package - r3-upper-observation").transform;
            var path=new List<Vector3>{new Vector3(-31,0,0),new Vector3(-15,0,0),new Vector3(-12,0,-6),new Vector3(-2,0,-8.5f)};
            for(int i=0;i<=45;i++)
            {
                float angle=(-90+i*7)*Mathf.Deg2Rad;
                path.Add(new Vector3(8.5f*Mathf.Cos(angle),Mathf.Lerp(.06f,7.4f,i/45f),8.5f*Mathf.Sin(angle)));
            }
            path.Add(new Vector3(-6,7.4f,-7));
            yield return Route("observatory",frame,path.ToArray());
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("upper");
            walker.MovementLocked=false;Application.targetFrameRate=oldCap;QualitySettings.vSyncCount=oldSync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        static Vector3[] CircularSpectatorPath()
        {
            Vector3 P(float r,float a,float y)=>Quaternion.Euler(0,a,0)*new Vector3(r,y,0);
            var path=new List<Vector3>{new Vector3(73,0,0),P(74,4,0),P(74,7,0)};
            for(int i=1;i<=38;i++)path.Add(P(74,7+i*2,17.175f*i/38));
            path.Add(P(74,85,17.175f)); path.Add(P(65,85,17.175f));
            for(int a=87;a<=269;a+=2)path.Add(P(65,a,17.175f));
            path.Add(P(65,270,17.175f));
            path.Add(new Vector3(6.5f,17.175f,64));
            path.Add(new Vector3(6.5f,17.175f,60));
            return path.ToArray();
        }
        void Place(Vector3 point)
        {body.enabled=false;walker.transform.position=point+Vector3.up*.08f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        IEnumerator GatePass(string label,float destination)
        {
            Check(label+" starts closed",!gate.IsOpen && gate.Door.activeSelf);
            float end=Time.time+1;
            while(Time.time<end){Step(ring.transform.TransformPoint(destination,0,0));yield return null;}
            var local=ring.transform.InverseTransformPoint(walker.transform.position);
            Check(label+" closed door blocks",destination<77?local.x>77.3f:local.x<76.7f,Mathf.Abs(local.x-77));
            Check(label+" Use opens",gate.Use() && gate.IsOpen && !gate.Door.activeSelf);
            yield return Move(label+" threshold",ring.transform,new Vector3(77,0,0));
            Check(label+" occupied threshold rejects close",!gate.Use() && gate.IsOpen);
            yield return Move(label+" clear doorway",ring.transform,new Vector3(destination,0,0));
            Check(label+" Use closes",gate.Use() && !gate.IsOpen && gate.Door.activeSelf);
        }
        IEnumerator Route(string label,Transform frame,Vector3[] path,bool place=true)
        {
            var rotation=ring.transform.rotation;
            if(place)Place(frame.TransformPoint(path[0]));
            for(int i=1;i<path.Length;i++)yield return Move(label+" up "+i,frame,path[i]);
            yield return Hold(label+" top");
            if(label=="spectator")Check("distant core gate cannot be toggled",!gate.Use() && !gate.IsOpen);
            for(int i=path.Length-2;i>=0;i--)yield return Move(label+" down "+i,frame,path[i]);
            yield return Hold(label+" back on deck");
            Check(label+" normal rotation",Quaternion.Angle(rotation,ring.transform.rotation)>.05f);
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
            if(gap.magnitude>=.15f || height>=.35f)throw new InvalidOperationException("Upper route blocked at "+label+"; see progress.json");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
