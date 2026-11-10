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
    public sealed class StationRingReadingProbe : MonoBehaviour
    {
        [Serializable] public sealed class Point { public string name,ring; public bool found; public Vector3 start,end; }
        [Serializable] public sealed class Points { public Point[] points; }
        [Serializable] public sealed class Result
        {
            public string scene,point;
            public float phase,seconds,distance;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
        }
        public string OutputDirectory,Approaches;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        StationReadingPanel[] panels;
        StationMatchHUD hud;
        Keyboard keyboard,priorKeyboard;
        Result report;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();
            string Arg(string name){int at=Array.IndexOf(args,name);return at>=0 && at+1<args.Length?args[at+1]:null;}
            string output=Arg("--station-reading-probe-output");if(string.IsNullOrEmpty(output) || !Path.IsPathRooted(output))return;
            var p=new GameObject("V015 reading validation").AddComponent<StationRingReadingProbe>();
            p.OutputDirectory=output;p.Approaches=Arg("--station-reading-probe-approaches");
            p.Phase=float.Parse(Arg("--station-reading-probe-phase")??"0",System.Globalization.CultureInfo.InvariantCulture);
        }
        IEnumerator Start()
        {
            yield return null;yield return null;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,phase=Phase};
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Buildings candidate required");
            Directory.CreateDirectory(OutputDirectory);float started=Time.time;int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();
            panels=FindObjectsByType<StationReadingPanel>(FindObjectsSortMode.None).Where(p=>!(p is StationObservationPoint)).ToArray();
            Check("thirteen original reading panels enabled",panels.Length==13 && panels.All(p=>p.enabled));
            Check("live backend remains disabled",!FindFirstObjectByType<ArenaStationLiveMatch>().enabled);
            var archives=FindObjectsByType<StationResearchArchive>(FindObjectsSortMode.None);
            Check("two original archive walls enabled",archives.Length==2 && archives.All(a=>a.enabled));
            ValidateReports(archives);
            foreach(var r in FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None))r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-Phase:Phase,0);
            priorKeyboard=Keyboard.current;keyboard=InputSystem.AddDevice<Keyboard>();
            hud=new GameObject("Reading probe HUD fixture").AddComponent<StationMatchHUD>();hud.SetCompact(true);
            var points=JsonUtility.FromJson<Points>(File.ReadAllText(Approaches)).points;
            Check("thirteen audited approaches",points.Length==13 && points.All(p=>p.found));
            bool first=true;var heldRings=new HashSet<string>();
            foreach(var point in points)
            {
                report.point=point.name;var panel=panels.Single(p=>p.name==point.name);var ring=panel.GetComponentInParent<StationRotatingRing>();
                Transform frame=ring?ring.transform:null;
                Vector3 World(Vector3 p)=>frame?frame.TransformPoint(p):p;
                Place(World(point.start));walker.MovementLocked=true;
                Check(point.name+" remote read rejected",!panel.Use());
                yield return Move(frame,point.end);
                Check(point.name+" expected ground frame",walker.GroundRing==ring);
                Func<bool> allowed=()=>false;walker.InputBlocked=()=>true;Check(point.name+" preexisting input block respected",!panel.Use());walker.InputBlocked=allowed;
                walker.MovementLocked=false;walker.ThirdPersonMode=false;
                bool previousHud=!first;hud.enabled=previousHud;
                yield return Press(Key.E);
                Check(point.name+" E opens exactly one panel",panel.IsOpen && panels.Count(p=>p.IsOpen)==1);
                Check(point.name+" modal lock and HUD",walker.MovementLocked && walker.InputBlocked() && !hud.enabled && Cursor.visible && Cursor.lockState==CursorLockMode.None);
                var local=frame?frame.InverseTransformPoint(walker.transform.position):walker.transform.position;
                var localRotation=frame?Quaternion.Inverse(frame.rotation)*walker.transform.rotation:walker.transform.rotation;
                yield return Press(Key.V,Key.W);
                float hold=heldRings.Add(point.ring)?5:.2f,until=Time.time+hold,maxDrift=0,maxYaw=0;
                while(Time.time<until)
                {
                    maxDrift=Mathf.Max(maxDrift,Vector3.Distance(local,frame?frame.InverseTransformPoint(walker.transform.position):walker.transform.position));
                    maxYaw=Mathf.Max(maxYaw,Quaternion.Angle(localRotation,frame?Quaternion.Inverse(frame.rotation)*walker.transform.rotation:walker.transform.rotation));
                    yield return null;
                }
                Check(point.name+" stays on moving floor",panel.IsOpen && maxDrift<.04f && maxYaw<.1f,maxDrift);
                Check(point.name+" view toggle blocked",!walker.ThirdPersonMode);
                if(first || panel is StationResearchDesk || point.ring=="v015-r3")
                {walker.Face(panel.transform.position+Vector3.up);yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(OutputDirectory,point.name+".png"));yield return null;}
                yield return Press(Key.E);
                Check(point.name+" E closes and restores",!panel.IsOpen && !walker.MovementLocked && walker.InputBlocked==allowed && hud.enabled==previousHud);
                walker.MovementLocked=true;yield return Press(Key.E);yield return Press(Key.Escape);
                Check(point.name+" Escape preserves earlier movement lock",!panel.IsOpen && walker.MovementLocked && walker.InputBlocked==allowed);
                Check(point.name+" direct opening works",panel.Use());panel.enabled=false;
                yield return new WaitForEndOfFrame();yield return null;
                Check(point.name+" disable releases session",!panel.IsOpen && walker.InputBlocked==allowed && !panel.Use());panel.enabled=true;
                if(first){yield return Overlap(panel,allowed);first=false;}
                yield return Move(frame,point.start);Save("progress");
            }
            Destroy(hud.gameObject);InputSystem.RemoveDevice(keyboard);if(priorKeyboard!=null)priorKeyboard.MakeCurrent();
            walker.InputBlocked=null;walker.MovementLocked=false;
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("reading");
            Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        IEnumerator Overlap(StationReadingPanel panel,Func<bool> allowed)
        {
            var other=new GameObject("Reading overlap fixture").AddComponent<StationArrivalGuide>();other.Walker=walker;
            other.transform.position=walker.transform.position+(panel.transform.position-walker.transform.position).normalized*3;
            var seat=new GameObject("Reading seat overlap fixture").AddComponent<StationGardenSeat>();seat.Walker=walker;seat.StableId="reading-probe-seat";seat.transform.position=walker.transform.position;
            yield return Press(Key.E);
            Check("overlapping E selects nearer panel before seat",panel.IsOpen && !other.IsOpen && !seat.IsSeated);
            Check("other direct interactions blocked while reading",!other.Use() && !seat.Use());
            yield return Press(Key.E);
            Check("closing E cannot open another panel or seat",!panel.IsOpen && !other.IsOpen && !seat.IsSeated && walker.InputBlocked==allowed);
            Check("seat available after modal release",seat.Use() && seat.IsSeated);seat.Stand();
            Destroy(other.gameObject);Destroy(seat.gameObject);yield return null;
        }
        void ValidateReports(StationResearchArchive[] archives)
        {
            foreach(var guide in panels.OfType<StationArrivalGuide>())
                Check(guide.name+" ring destinations replace compass directions",guide.Report().Contains("R1") && guide.Report().Contains("R2") && guide.Report().Contains("R3") && !guide.Report().Contains("东翼") && !guide.Report().Contains("向南"));
            foreach(var board in panels.OfType<StationDistrictStatusBoard>())Check(board.name+" source report available",!string.IsNullOrWhiteSpace(board.Report()) && board.Cargo && board.Cafe && board.Research && board.Greenhouse);
            var match=FindFirstObjectByType<ArenaStationLiveMatch>();
            var property=typeof(ArenaStationLiveMatch).GetProperty("CurrentRound");var previous=match.CurrentRound;
            var round=new CompetitionRound{index=1,question=new CompetitionQuestion{task=new CompetitionTask{input="验证夹具：公开问题"}},records=new[]{new CompetitionAnswer{model="fixture",answer="验证夹具：结算后的答卷",score=7}}};
            try
            {
                foreach(bool settled in new[]{false,true})
                {
                    round.settled=settled;property.SetValue(match,round);
                    foreach(var desk in panels.OfType<StationResearchDesk>())Check(desk.name+" settlement gate "+settled,desk.Report().Contains("公开问题") && desk.Report().Contains("结算后的答卷")==settled);
                    foreach(var archive in archives)
                    {archive.Refresh();Check(archive.name+" wall settlement gate "+settled,archive.Question.text.Contains("公开问题") && archive.Answers[0].text.Contains("结算后的答卷")==settled);}
                }
            }
            finally{property.SetValue(match,previous);foreach(var archive in archives)archive.Refresh();}
            foreach(var desk in panels.OfType<StationResearchDesk>())Check(desk.name+" empty backend state restored",desk.Report().Contains("当前没有可查阅"));
        }
        IEnumerator Press(params Key[] keys){InputSystem.QueueStateEvent(keyboard,new KeyboardState(keys));yield return null;yield return new WaitForEndOfFrame();InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;}
        void Place(Vector3 p){body.enabled=false;walker.transform.position=p;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        IEnumerator Move(Transform frame,Vector3 target)
        {
            float until=Time.time+5;bool clear=true,supported=true;float gap=10;
            while(Time.time<until)
            {
                var world=frame?frame.TransformPoint(target):target;var delta=world-walker.transform.position;delta.y=0;gap=delta.magnitude;if(gap<.06f)break;
                var before=walker.transform.position;walker.MoveOnGround(delta.normalized*Mathf.Min(3,gap/Time.deltaTime),Time.deltaTime);report.distance+=Vector3.Distance(before,walker.transform.position);
                clear&=Physics.OverlapCapsule(walker.transform.position+Vector3.up*.55f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore).All(c=>c.GetComponentInParent<StationGrayboxWalker>()==walker);
                supported&=Mathf.Abs(walker.transform.position.y-world.y)<.3f;yield return null;
            }
            Check(report.point+" local approach reached",gap<.1f,gap);Check(report.point+" local approach clear and supported",clear && supported);
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
