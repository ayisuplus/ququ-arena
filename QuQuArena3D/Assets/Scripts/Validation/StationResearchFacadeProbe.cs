using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Opt-in route through the research pavilion's finished doorway, using normal collision and ring motion.
    public sealed class StationResearchFacadeProbe : MonoBehaviour
    {
        [Serializable] sealed class Report
        {
            public string scene, segment;
            public float phase, distance, seconds, holdYaw, expectedHoldYaw;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks = new List<StationRingPrototypeProbe.Check>();
            public List<string> obstructions = new List<string>();
        }
        readonly Report report = new Report();
        string output;
        StationGrayboxWalker walker;
        StationRotatingRing ring;
        Transform frame;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();
            string Arg(string key){int i=Array.IndexOf(args,key);return i>=0&&i+1<args.Length?args[i+1]:null;}
            string path=Arg("--station-research-facade-output");
            if(string.IsNullOrEmpty(path)||!Path.IsPathRooted(path))return;
            var probe=new GameObject("Research facade route validation").AddComponent<StationResearchFacadeProbe>();
            probe.output=path;
            probe.report.phase=float.Parse(Arg("--station-research-facade-phase")??"0",System.Globalization.CultureInfo.InvariantCulture);
        }

        IEnumerator Start()
        {
            yield return null;yield return null;
            report.scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path;
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Buildings candidate required");
            Directory.CreateDirectory(output);float started=Time.time;
            int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();bool locked=walker.MovementLocked;
            walker.MovementLocked=true;
            frame=GameObject.Find("V015 package - research main and entry canopy").transform;
            ring=frame.GetComponentInParent<StationRotatingRing>();
            ring.transform.rotation=Quaternion.Euler(0,-report.phase,0);
            Check("R2 remains enabled and rotating",ring.enabled && walker.enabled);
            Check("Core gameplay remains disabled",!FindFirstObjectByType<ArenaStationLiveMatch>().enabled);
            var body=walker.GetComponent<CharacterController>();body.enabled=false;
            walker.transform.position=frame.TransformPoint(new Vector3(10,.08f,15));body.enabled=true;
            Physics.SyncTransforms();walker.ResetGroundReference();
            for(int i=0;i<3;i++){walker.MoveOnGround(Vector3.zero,Time.deltaTime);yield return null;}
            // Two side aisles pass either side of the existing central instrument plinth.
            foreach(float z in new[]{13.5f,16.5f})
            {
                yield return Move("Porch lane "+z,10,z);
                yield return Move("Door inward "+z,-7,z);
                yield return Move("Interior aisle "+z,-22,z);
                yield return Move("Return to door "+z,-7,z);
                yield return Move("Door outward "+z,10,z);
            }
            yield return Move("Porch centre",10,15);
            yield return Move("Centre doorway inward",-12,15);
            var local=frame.InverseTransformPoint(walker.transform.position);float yaw=ring.transform.eulerAngles.y;
            float holdStart=Time.time,until=Time.time+4,maxDrift=0;
            while(Time.time<until)
            {
                walker.MoveOnGround(Vector3.zero,Time.deltaTime);
                maxDrift=Mathf.Max(maxDrift,Vector3.Distance(local,frame.InverseTransformPoint(walker.transform.position)));
                yield return null;
            }
            Check("Standing follows research floor",walker.GroundRing==ring && maxDrift<.04f,maxDrift);
            // Quaternion.Angle rounds this very small rotation to zero; the ring rotates about Y only.
            report.holdYaw=Mathf.DeltaAngle(yaw,ring.transform.eulerAngles.y);
            report.expectedHoldYaw=ring.DegreesPerSecond*(Time.time-holdStart);
            Check("Ring moves at normal speed during hold",Mathf.Abs(report.holdYaw)>.001f && Mathf.Abs(report.holdYaw-report.expectedHoldYaw)<.005f,report.holdYaw-report.expectedHoldYaw);
            yield return Move("Centre doorway outward",10,15);
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("research");
            walker.MovementLocked=locked;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }

        IEnumerator Move(string label,float x,float z)
        {
            report.segment=label;float until=Time.time+20,minY=10,maxY=-10;bool supported=true,clear=true;
            var target=new Vector3(x,.035f,z);
            while(Time.time<until)
            {
                var before=walker.transform.position;var delta=frame.TransformPoint(target)-before;delta.y=0;
                if(delta.magnitude<.1f)break;
                walker.MoveOnGround(delta.normalized*Mathf.Min(3,delta.magnitude/Time.deltaTime),Time.deltaTime);
                var p=walker.transform.position;report.distance+=Vector3.Distance(p,before);
                float y=frame.InverseTransformPoint(p).y;minY=Mathf.Min(minY,y);maxY=Mathf.Max(maxY,y);
                supported&=walker.GroundRing==ring;
                foreach(var c in Physics.OverlapCapsule(p+Vector3.up*.4f,p+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore))
                    if(c.GetComponentInParent<StationGrayboxWalker>()!=walker)
                    {clear=false;if(!report.obstructions.Contains(c.name))report.obstructions.Add(c.name);}
                yield return null;
            }
            var gap=frame.TransformPoint(target)-walker.transform.position;gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);
            Check(label+" clear",clear);
            Check(label+" supported by R2",supported && minY>-.2f && maxY<.25f,maxY-minY);
            Save("progress");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(output,name+".json"),JsonUtility.ToJson(report,true));
    }
}
