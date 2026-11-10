using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    public sealed class StationRingResidentProbe : MonoBehaviour
    {
        [Serializable] public sealed class Status
        { public string id,ground; public int visits,returns,target; public bool outbound; public Vector3 position; }
        [Serializable] public sealed class Result
        {
            public float phase,gameSeconds,realSeconds,timeScale;
            public bool passed;
            public Status[] residents;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> issues=new List<string>();
        }
        public string OutputDirectory;
        public float Phase;
        StationResidentRoutine[] residents;
        StationGrayboxWalker walker;
        Result report;
        readonly HashSet<string> states=new HashSet<string>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-ring-resident-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var p=new GameObject("V015 resident validation").AddComponent<StationRingResidentProbe>();p.OutputDirectory=args[at+1];
            at=Array.IndexOf(args,"--station-ring-resident-phase");p.Phase=at>=0?float.Parse(args[at+1],System.Globalization.CultureInfo.InvariantCulture):0;
        }
        IEnumerator Start()
        {
            Directory.CreateDirectory(OutputDirectory);report=new Result{phase=Phase,timeScale=3};
            foreach(var ring in FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None))ring.transform.rotation=Quaternion.Euler(0,ring.RingId=="v015-r2"?-Phase:Phase,0);
            yield return null;yield return null;yield return null;
            residents=FindObjectsByType<StationResidentRoutine>(FindObjectsSortMode.None).OrderBy(r=>r.ResidentId).ToArray();walker=FindFirstObjectByType<StationGrayboxWalker>();
            walker.MovementLocked=true;var playerBody=walker.GetComponent<CharacterController>();playerBody.enabled=false;walker.transform.position=new Vector3(0,.08f,270);playerBody.enabled=true;walker.ResetGroundReference();
            Check("six visible independent residents",residents.Length==6 && residents.All(r=>r.enabled && r.Visible && r.MovingPath && !r.transform.parent));
            Check("six original room identities enabled",FindObjectsByType<StationRoomIdentity>(FindObjectsSortMode.None).Count(r=>r.enabled)==6);
            var oldCap=Application.targetFrameRate;int oldSync=QualitySettings.vSyncCount;float oldScale=Time.timeScale;
            Application.targetFrameRate=120;QualitySettings.vSyncCount=0;Time.timeScale=3;
            Vector3 Local(StationResidentRoutine r)=>r.MovingPath.GroundRing?r.MovingPath.GroundRing.transform.InverseTransformPoint(r.transform.position):r.transform.position;
            float started=Time.time,real=Time.realtimeSinceStartup,next=0;var last=residents.ToDictionary(r=>r,r=>Local(r));var progress=residents.ToDictionary(r=>r,r=>Time.time);
            bool supported=true,clear=true;float separation=float.MaxValue;
            while(Time.time-started<2400 && residents.Any(r=>r.HomeReturns<1))
            {
                foreach(var r in residents)
                {
                    var p=r.transform.position;var saved=r.CaptureState();string phase=r.PresetId+"/"+(saved.outbound?"out":"back");
                    if(!r.Visible){AddIssue(r.PresetId+" unexpectedly hidden");continue;}
                    bool floor=Physics.RaycastAll(p+Vector3.up*.3f,Vector3.down,.8f,~0,QueryTriggerInteraction.Ignore).Any(h=>h.normal.y>.65f && !(h.collider is CharacterController));
                    if(!floor){supported=false;AddIssue(r.PresetId+" unsupported "+p);}
                    foreach(var c in Physics.OverlapCapsule(p+Vector3.up*.5f,p+Vector3.up*1.4f,.25f,~0,QueryTriggerInteraction.Ignore))
                        if(c.GetComponentInParent<StationResidentRoutine>()!=r && !(c is CharacterController))
                        {clear=false;AddIssue(r.PresetId+" overlaps "+c.name);}
                    foreach(var other in residents)if(other!=r)separation=Mathf.Min(separation,Vector3.Distance(p,other.transform.position));
                    if(saved.waitRemaining>0 || Vector3.Distance(Local(r),last[r])>.2f){last[r]=Local(r);progress[r]=Time.time;}
                    if(Time.time-progress[r]>180){AddIssue(r.PresetId+" stalled at "+saved.targetIndex);break;}
                    if(saved.waitRemaining==0 && saved.segmentFraction>.25f && saved.segmentFraction<.75f && states.Add(phase))
                    {
                        var json=JsonUtility.ToJson(saved);var roundtrip=JsonUtility.FromJson<StationResidentState>(json);var before=p;
                        Check(phase+" new state accepted",roundtrip.version==1 && r.CanRestore(roundtrip));r.RestoreState(roundtrip);
                        Check(phase+" progress restored",Vector3.Distance(before,r.transform.position)<.66f);
                        File.WriteAllText(Path.Combine(OutputDirectory,r.PresetId+"-"+(saved.outbound?"out":"back")+".json"),json);
                    }
                }
                if(Time.time>=next){next=Time.time+10;report.gameSeconds=Time.time-started;report.realSeconds=Time.realtimeSinceStartup-real;Save("progress");}
                if(report.issues.Any(s=>s.Contains("stalled")))break;
                yield return null;
            }
            Check("all six complete original daily purpose and return",residents.All(r=>r.LoungeVisits>=1 && r.HomeReturns>=1));
            Check("all samples have floor",supported);Check("no furniture penetration",clear);Check("resident separation",separation>.55f,separation);
            foreach(var r in residents)
            {
                Check(r.PresetId+" original room ownership",r.Room.RoomId=="room/"+r.ResidentId && r.Room.ResidentId==r.ResidentId);
                var initial=new StationResidentState{id=r.ResidentId,position=r.Route[0],targetIndex=1,outbound=true,waitRemaining=18,visits=2,returns=2};
                Check(r.PresetId+" legacy home state accepted",r.CanRestore(initial));r.RestoreState(initial);
                Check(r.PresetId+" legacy home moves to new room",Vector3.Distance(r.transform.position,r.MovingPath.Point(0))<.01f && r.LoungeVisits==2 && r.HomeReturns==2);
                var saved=r.CaptureState();r.RestoreState(saved);Check(r.PresetId+" normalized reload has no second migration",Vector3.Distance(r.transform.position,r.MovingPath.Point(0))<.01f);
                Check(r.PresetId+" remote dialogue rejected",!r.Talk());
            }
            Time.timeScale=1;
            var local=residents.ToDictionary(r=>r,r=>r.MovingPath.GroundRing.transform.InverseTransformPoint(r.transform.position));
            yield return new WaitForSeconds(5);
            foreach(var r in residents)Check(r.PresetId+" waiting follows normal-speed ring",Vector3.Distance(local[r],r.MovingPath.GroundRing.transform.InverseTransformPoint(r.transform.position))<.03f);
            report.gameSeconds=Time.time-started;report.realSeconds=Time.realtimeSinceStartup-real;report.passed=report.checks.All(c=>c.passed) && report.issues.Count==0;Save("residents");
            Time.timeScale=oldScale;Application.targetFrameRate=oldCap;QualitySettings.vSyncCount=oldSync;walker.MovementLocked=false;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void AddIssue(string s){if(!report.issues.Contains(s))report.issues.Add(s);}
        void Save(string name)
        {
            report.residents=residents.Select(r=>{var s=r.CaptureState();return new Status{id=r.PresetId,visits=r.LoungeVisits,returns=r.HomeReturns,target=s.targetIndex,outbound=s.outbound,position=r.transform.position,ground=r.MovingPath.GroundRing?r.MovingPath.GroundRing.RingId:"fixed"};}).ToArray();
            File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
        }
    }
}
