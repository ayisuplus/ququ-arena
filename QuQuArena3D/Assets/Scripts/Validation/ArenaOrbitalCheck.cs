using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace QuQu
{
    // Opt-in, isolated-data acceptance for camera ownership and real match continuity.
    [ArenaHarness("--arena-orbital-validation", true)]
    public static class ArenaOrbitalCheck
    {
        static void Require(bool condition,string message){if(!condition)throw new Exception(message);}
        static IEnumerator Until(Func<bool> condition,float seconds=45)
        {float deadline=Time.realtimeSinceStartup+seconds;while(!condition()){Require(Time.realtimeSinceStartup<deadline,"Orbital check timed out");yield return null;}}
        static IEnumerator Photo(string dir,string name)
        {yield return new WaitForSecondsRealtime(.3f);yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,name+".png"));}
        static IEnumerator Measure(JObject report,string key,float seconds)
        {
            yield return new WaitForSecondsRealtime(2);
            var frames=new List<float>();float end=Time.realtimeSinceStartup+seconds;
            while(Time.realtimeSinceStartup<end){yield return null;frames.Add(Time.unscaledDeltaTime*1000);}
            frames.Sort();report[key]=new JObject{["seconds"]=seconds,["frames"]=frames.Count,["fps"]=1000/frames.Average(),["p95ms"]=frames[(int)(frames.Count*.95f)],["maxMs"]=frames.Last()};
        }
        public static IEnumerator Run(IArenaTestShell shell)
        {
            var args=Environment.GetCommandLineArgs();string dir=args[Array.IndexOf(args,"--arena-qa-output")+1];Directory.CreateDirectory(dir);
            var report=new JObject{["width"]=Screen.width,["height"]=Screen.height};
            var stack=new Stack<IEnumerator>();stack.Push(Check(shell,dir,report));
            while(stack.Count>0)
            {
                bool more;object current=null;
                try{more=stack.Peek().MoveNext();if(more)current=stack.Peek().Current;}
                catch(Exception error){report["error"]=error.ToString();Debug.LogException(error);break;}
                if(!more){(stack.Pop()as IDisposable)?.Dispose();continue;}
                if(current is IEnumerator child)stack.Push(child);else yield return current;
            }
            report["passed"]=report["error"]==null;report["backendPid"]=shell.Desktop.ProcessId;
            File.WriteAllText(Path.Combine(dir,"orbital.json"),report.ToString());shell.UI.ClearGuard();Application.Quit(report["passed"].Value<bool>()?0:1);
        }
        static IEnumerator Check(IArenaTestShell shell,string dir,JObject r)
        {
            yield return Until(()=>shell.Desktop.Ready,90);yield return Photo(dir,"home");
            Require(!shell.Hud.gameObject.activeSelf,"Combat HUD leaked into home");
            var marker=(RectTransform)shell.UI.Root.Find("Orbital destinations").GetChild(0);
            var pointer=new UnityEngine.EventSystems.PointerEventData(UnityEngine.EventSystems.EventSystem.current){position=RectTransformUtility.WorldToScreenPoint(null,marker.TransformPoint(marker.rect.center))};
            var hits=new List<UnityEngine.EventSystems.RaycastResult>();UnityEngine.EventSystems.EventSystem.current.RaycastAll(pointer,hits);
            Require(hits.Count>0 && hits[0].gameObject==marker.gameObject,"Home overlay blocked facility marker clicks");r["homeMarkerClickable"]=true;
            yield return Measure(r,"homePerformance",10);
            shell.UI.CloseModal();yield return null;
            var original=shell.Stage.CaptureView();int bounds=shell.Stage.FramingBounds.Length;
            yield return Photo(dir,"arena");
            float start=Time.realtimeSinceStartup;shell.Stations.Visit(ArenaOrbitalNetwork.Place.Lab);
            yield return new WaitForSecondsRealtime(.65f);yield return Photo(dir,"flight");
            yield return Until(()=>!shell.Stations.Moving);
            r["flightSeconds"]=Time.realtimeSinceStartup-start;
            Require(shell.Stations.Current==ArenaOrbitalNetwork.Place.Lab && shell.Stations.LabInteriorActive && !shell.Stations.BroadcastInteriorActive,"Wrong room detail activation");
            Require(!shell.Hud.gameObject.activeSelf,"Combat HUD leaked into facility");
            yield return Photo(dir,"laboratory");yield return Measure(r,"laboratoryPerformance",10);
            var arenaInWindow=shell.Stage.View.WorldToViewportPoint(new Vector3(0,3,0));r["arenaThroughWindow"]=new JArray(arenaInWindow.x,arenaInWindow.y,arenaInWindow.z);
            Require(arenaInWindow.z>0 && arenaInWindow.x>.2f && arenaInWindow.x<.95f && arenaInWindow.y>.1f && arenaInWindow.y<.95f,"Arena is not visible through lab window");
            shell.Escape();yield return null;
            Require(shell.Stations.Current==ArenaOrbitalNetwork.Place.Arena,"Esc did not return to arena");
            Require(Vector3.Distance(shell.Stage.View.transform.position,original.position)<.02f && Quaternion.Angle(shell.Stage.View.transform.rotation,original.rotation)<.1f,"Orbit view was not restored");
            Require(shell.Stage.FramingBounds.Length==bounds,"Decorations changed combat framing");r["orbitRestore"]=true;
            shell.Stage.Focus(shell.Stage.Fighters[0]);var focused=shell.Stage.CaptureView();
            shell.Stations.Visit(ArenaOrbitalNetwork.Place.Referee);yield return new WaitForSecondsRealtime(.25f);shell.Stations.Visit(ArenaOrbitalNetwork.Place.Referee);
            yield return Until(()=>!shell.Stations.Moving,1);r["repeatClickSkips"]=true;
            Require(Vector3.Distance(shell.Stage.Venue.Referee.transform.position,Vector3.zero)>20,"Judge remained on arena");
            yield return Photo(dir,"referee");
            shell.Stations.ReturnToArena();yield return null;
            Require(shell.Stage.Focused==shell.Stage.Fighters[0] && Vector3.Distance(shell.Stage.View.transform.position,focused.position)<.02f,"Focus was not restored");r["focusRestore"]=true;
            shell.Stage.ToggleFlight();shell.Stage.View.transform.position+=new Vector3(1,2,-3);var flying=shell.Stage.CaptureView();
            shell.Stations.Visit(ArenaOrbitalNetwork.Place.Commentary);shell.Stations.Skip();yield return Until(()=>!shell.Stations.Moving);
            yield return Photo(dir,"commentary");yield return Measure(r,"broadcastPerformance",10);
            shell.Commentary.Open();yield return Photo(dir,"commentary-drawer");
            Require(!shell.UI.Modal.Find("Facility panel").gameObject.activeSelf,"Facility controls show through commentary drawer");
            shell.Escape();yield return new WaitForEndOfFrame();
            Require(!shell.Commentary.IsOpen && shell.Stations.Current==ArenaOrbitalNetwork.Place.Commentary && shell.UI.Modal.Find("Facility panel").gameObject.activeSelf,"Esc failed to restore facility controls");r["commentaryDrawerNavigation"]=true;
            shell.Stations.ReturnToArena();yield return null;
            Require(shell.Stage.Flight.Active && Vector3.Distance(shell.Stage.View.transform.position,flying.position)<.02f,"Free flight was not restored");r["freeFlightRestore"]=true;
            shell.Stage.ResetCamera();
            shell.Link.Launch(new Launch{arena="tongjia-pinyin",models=ArenaGame.DemoIds.Take(2).ToArray(),draw=ArenaGame.DemoIds.Take(2).ToArray(),limit=1,demo=true});
            yield return Until(()=>shell.Duel.Snapshot?.status=="running");string id=shell.Link.Competition;long seq=shell.Duel.Snapshot.seq;
            shell.Stations.Visit(ArenaOrbitalNetwork.Place.Lab);yield return Until(()=>!shell.Stations.Moving);yield return new WaitForSecondsRealtime(2);
            Require(shell.Link.Competition==id && shell.Duel.Snapshot.seq>=seq && shell.Duel.Snapshot.status!="paused","Travel modified match state");r["matchContinues"]=true;
            shell.Stations.ReturnToArena();yield return Until(()=>shell.Duel.Snapshot?.status=="completed",90);yield return Until(()=>!shell.Duel.Presenting,30);
            yield return Photo(dir,"real-demo-result");yield return Measure(r,"arenaPerformance",10);
            shell.Link.Disconnect();var previous=shell.Duel.Snapshot.commentary;
            shell.Duel.Snapshot.commentary=new CommentaryState{enabled=true,entries=new[]{new CommentaryItem{status="working",text="独立的展示信号验收"}}};
            shell.Stations.Visit(ArenaOrbitalNetwork.Place.Commentary);shell.Stations.Skip();yield return Until(()=>!shell.Stations.Moving);yield return new WaitForSecondsRealtime(.4f);
            Require(shell.Stations.Speaking,"Commentary light did not follow text generation");yield return Photo(dir,"on-air-fixture");
            shell.Duel.Snapshot.commentary=previous;r["commentaryPresentationFixture"]=true;
            shell.Stations.ReturnToArena();Require(!shell.Stations.LabInteriorActive && !shell.Stations.BroadcastInteriorActive,"Remote detail remained active");r["detailCulling"]=true;
            shell.ShowHome();yield return Photo(dir,"home-final");
        }
    }
}
