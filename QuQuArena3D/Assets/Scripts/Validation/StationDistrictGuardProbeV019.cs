using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Explicitly launched edge-pressure checks; never added during normal game startup.
    public sealed class StationDistrictGuardProbeV019 : MonoBehaviour
    {
        [Serializable] public sealed class Edge { public string name; public float x,y,z,dx,dz; }
        [Serializable] public sealed class Manifest { public string root; public List<Edge> edges; }
        [Serializable] sealed class Report
        {
            public string scene,segment; public float phase,seconds; public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> obstructions=new List<string>();
        }
        public string OutputDirectory,ManifestPath;
        public float Phase;
        readonly Report report=new Report();
        StationGrayboxWalker walker; CharacterController body; Transform frame; StationRotatingRing ring;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-district-guards-output");
            if(at<0)return;
            int route=Array.IndexOf(args,"--station-district-guards-manifest"),phase=Array.IndexOf(args,"--station-district-guards-phase");
            if(at+1>=args.Length||route<0||route+1>=args.Length)throw new ArgumentException("Output and manifest paths required");
            var p=new GameObject("V019 district guard validation").AddComponent<StationDistrictGuardProbeV019>();
            p.OutputDirectory=args[at+1];p.ManifestPath=args[route+1];p.Phase=phase<0?0:float.Parse(args[phase+1],System.Globalization.CultureInfo.InvariantCulture);
        }
        IEnumerator Start()
        {
            yield return null;yield return null;
            if(!Path.IsPathRooted(OutputDirectory)||!Path.IsPathRooted(ManifestPath))throw new ArgumentException("Absolute paths required");
            report.scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path;report.phase=Phase;
            if(!report.scene.EndsWith("BlackHoleStationDistrictsV019.unity"))throw new InvalidOperationException("V019 candidate required");
            Directory.CreateDirectory(OutputDirectory);float started=Time.time;
            var manifest=JsonUtility.FromJson<Manifest>(File.ReadAllText(ManifestPath));frame=GameObject.Find(manifest.root).transform;ring=frame.GetComponentInParent<StationRotatingRing>();
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();bool locked=walker.MovementLocked;walker.MovementLocked=true;
            int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            ring.transform.rotation=Quaternion.Euler(0,Phase,0);Check("Ring enabled at normal time",ring.enabled&&Mathf.Approximately(Time.timeScale,1));
            foreach(var edge in manifest.edges)yield return Press(edge);
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("guards");
            walker.MovementLocked=locked;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        IEnumerator Press(Edge spec)
        {
            report.segment=spec.name;var edge=new Vector3(spec.x,spec.y,spec.z);var outward=new Vector3(spec.dx,0,spec.dz).normalized;
            body.enabled=false;walker.transform.position=frame.TransformPoint(edge-outward*.9f)+Vector3.up*.09f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();
            float until=Time.time+.4f;while(Time.time<until){walker.MoveOnGround(Vector3.zero,Time.deltaTime);yield return null;}
            var start=frame.InverseTransformPoint(walker.transform.position);
            var blockers=Physics.OverlapCapsule(walker.transform.position+Vector3.up*.49f,walker.transform.position+Vector3.up*1.5f,.28f,~0,QueryTriggerInteraction.Ignore).Where(c=>c.GetComponentInParent<StationGrayboxWalker>()!=walker).ToArray();
            Check(spec.name+" start clear",blockers.Length==0);
            foreach(var blocker in blockers)report.obstructions.Add(spec.name+": "+blocker.name);
            Check(spec.name+" starts on intended upper floor",Mathf.Abs(start.y-edge.y)<.20f);
            float minY=start.y,maxY=start.y;bool support=true,reference=true;
            until=Time.time+1.1f;
            while(Time.time<until)
            {
                var d=frame.TransformPoint(edge+outward*2)-walker.transform.position;d.y=0;
                walker.MoveOnGround(d.normalized*6,Time.deltaTime);
                var local=frame.InverseTransformPoint(walker.transform.position);minY=Mathf.Min(minY,local.y);maxY=Mathf.Max(maxY,local.y);
                support&=Physics.RaycastAll(walker.transform.position+Vector3.up*.25f,Vector3.down,.55f,~0,QueryTriggerInteraction.Ignore).Any(h=>h.collider!=body&&h.normal.y>.65f&&h.collider.GetComponentInParent<StationRotatingRing>()==ring);
                reference&=walker.GroundRing==ring;yield return null;
            }
            var final=frame.InverseTransformPoint(walker.transform.position);var gap=final-(edge+outward*2);gap.y=0;
            Check(spec.name+" outside target blocked",gap.magnitude>.6f,gap.magnitude);
            Check(spec.name+" remains at upper height",minY>edge.y-.20f&&maxY<edge.y+.35f,maxY-minY);
            Check(spec.name+" continuous upper support",support);
            Check(spec.name+" ground follows moving ring",reference);Save("progress");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
