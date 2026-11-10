using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Source-coordinate waypoints are evaluated through each actual moving room transform.
    public sealed class StationRingHomeProbe : MonoBehaviour
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
        StationRotatingRing ring;
        Result report;
        float started;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-home-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var probe=new GameObject("V015 six resident home routes").AddComponent<StationRingHomeProbe>();
            probe.OutputDirectory=args[at+1];int phase=Array.IndexOf(args,"--station-home-probe-phase");
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
            ring=rings.Single(r=>r.RingId=="v015-r3");var rotation=ring.transform.rotation;
            var rooms=FindObjectsByType<StationRoomIdentity>(FindObjectsSortMode.None).OrderBy(r=>r.RoomId).ToArray();
            Check("six unique resident identities",rooms.Length==6 && rooms.Select(r=>r.RoomId).Distinct().Count()==6);
            var residents=FindObjectsByType<StationResidentRoutine>(FindObjectsSortMode.None);
            Check("six resident colliders remain enabled",residents.Length==6 && residents.All(r=>r.GetComponent<CharacterController>().enabled));
            foreach(var room in rooms)
            {
                Check(room.RoomId+" owned by outer ring",room.GetComponentInParent<StationRotatingRing>()==ring);
                Vector3[] path;
                switch(room.RoomId)
                {
                    case "room/resident/deepseek":path=Pod(35);break;
                    case "room/resident/chatgpt":path=Pod(62);break;
                    case "room/resident/claude":path=Pod(89);break;
                    case "room/resident/gemini":path=Shared(-90.5f,66,1);break;
                    case "room/resident/glm":path=Shared(-73.5f,58,-1);break;
                    case "room/resident/kimi":path=Shared(-73.5f,66,1);break;
                    default:throw new InvalidOperationException("Unmapped resident room "+room.RoomId);
                }
                Place(room.transform.TransformPoint(path[0]));
                for(int i=1;i<path.Length;i++)yield return Move(room.RoomId+" enter "+i,room.transform,path[i]);
                yield return Hold(room.RoomId+" inside");
                for(int i=path.Length-2;i>=0;i--)yield return Move(room.RoomId+" return "+i,room.transform,path[i]);
                yield return Hold(room.RoomId+" back on public walk");
            }
            Check("outer ring normal rotation",Quaternion.Angle(rotation,ring.transform.rotation)>.1f);
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("homes");
            walker.MovementLocked=false;Application.targetFrameRate=oldCap;QualitySettings.vSyncCount=oldSync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        static Vector3 P(float x,float z)=>new Vector3(x,0,z);
        // Door centers are measured from the original paired partitions, not identity-root positions.
        static Vector3[] Pod(float z)=>new[]{P(76.925f,z),P(94,z),P(98,z),P(110,z),P(114,z),P(114.5f,z+.8f)};
        static Vector3[] Shared(float x,float front,int inward)=>new[]{P(-51,62),P(-66,62),P(-70,62),P(x,62),P(x,front),P(x,front+inward*2)};
        void Place(Vector3 point)
        {body.enabled=false;walker.transform.position=point+Vector3.up*.08f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        void Step(Vector3 target)
        {var before=walker.transform.position;var d=target-before;d.y=0;walker.MoveOnGround(d.normalized*Mathf.Min(6,d.magnitude/Time.deltaTime),Time.deltaTime);report.distance+=Vector3.Distance(before,walker.transform.position);}
        IEnumerator Hold(string label)
        {
            var local=ring.transform.InverseTransformPoint(walker.transform.position);float end=Time.time+2,drift=0;bool carried=true;
            while(Time.time<end){Step(walker.transform.position);var p=ring.transform.InverseTransformPoint(walker.transform.position);p.y=local.y;drift=Mathf.Max(drift,Vector3.Distance(p,local));carried&=walker.GroundRing==ring;yield return null;}
            Check(label+" holds moving ground",carried && drift<.05f,drift);
        }
        IEnumerator Move(string label,Transform frame,Vector3 local)
        {
            report.segment=label;float until=Time.time+25,lastProgress=Time.time,best=float.MaxValue;bool support=true,clear=true;float minY=10,maxY=-10;
            while(Time.time<until)
            {
                var target=frame.TransformPoint(local);var delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.1f)break;
                if(delta.magnitude<best-.1f){best=delta.magnitude;lastProgress=Time.time;}if(Time.time-lastProgress>4)break;
                Step(target);support&=walker.GroundRing==ring;float y=ring.transform.InverseTransformPoint(walker.transform.position).y;
                minY=Mathf.Min(minY,y);maxY=Mathf.Max(maxY,y);
                foreach(var c in Physics.OverlapCapsule(walker.transform.position+Vector3.up*.4f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore))
                    if(c.GetComponentInParent<StationGrayboxWalker>()!=walker){clear=false;string entry=label+": "+c.name;if(!report.blockages.Contains(entry))report.blockages.Add(entry);}
                yield return null;
            }
            var gap=frame.TransformPoint(local)-walker.transform.position;gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);Check(label+" supported",support && minY>-.2f && maxY<.25f,maxY-minY);Check(label+" no penetration",clear);Save("progress");
            if(gap.magnitude>=.15f)throw new InvalidOperationException("Home route blocked at "+label+"; see progress.json");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
