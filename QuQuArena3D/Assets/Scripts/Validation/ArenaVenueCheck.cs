using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.UI;
using TMPro;

namespace QuQu
{
    // Local saved mock events only. Never starts a backend or reads personal preferences.
    [ArenaHarness("--arena-venue-validation", false)]
    public static class ArenaVenueCheck
    {
        [Serializable] class Result
        {
            public bool passed, isolatedReferee, judgePreset, flight, closeInspection, inputGuard, focusRestore, fullscreen, rosterContinuity, settlement, quietMode, hiddenHud, keyboardFlight;
            public int seats, architectureDraws, hits, width, height, performanceFrames;
            public float fps, frameP95;
            public string error, gpu;
        }
        static void Require(bool value,string message){if(!value)throw new Exception(message);}
        public static IEnumerator Run(ArenaGame g)
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--arena-qa-output");
            string dir=at>=0?args[at+1]:Path.Combine(Application.temporaryCachePath,"venue-v08");Directory.CreateDirectory(dir);
            var r=new Result {gpu=SystemInfo.graphicsDeviceName};var stack=new Stack<IEnumerator>();stack.Push(Check(g,dir,r));
            while(stack.Count>0)
            {
                object next=null;bool more;
                try{more=stack.Peek().MoveNext();if(more)next=stack.Peek().Current;}
                catch(Exception e){r.error=e.ToString();Debug.LogException(e);break;}
                if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}
                if(next is IEnumerator child){stack.Push(child);continue;}yield return next;
            }
            r.passed=string.IsNullOrEmpty(r.error);File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(r,true));
            if(!Application.isEditor)Application.Quit(r.passed?0:1);
        }
        static IEnumerator Key(ArenaGame g,params UnityEngine.InputSystem.Key[] keys)
        {
            var k=Keyboard.current;bool enabled=k.enabled;InputSystem.EnableDevice(k);
            InputSystem.QueueStateEvent(k,new KeyboardState(keys));InputSystem.Update();g.SendMessage("Update");
            InputSystem.QueueStateEvent(k,new KeyboardState());InputSystem.Update();if(!enabled)InputSystem.DisableDevice(k);yield return null;
        }
        static void At(ArenaStage stage,Vector3 position,Vector3 target)
        {stage.View.transform.position=position;stage.View.transform.LookAt(target);stage.Flight.SetActive(true);}
        static IEnumerator Photo(string dir,string name){yield return new WaitForSecondsRealtime(.3f);yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,name+".png"));}
        static IEnumerator Check(ArenaGame g,string dir,Result r)
        {
            g.Connection.Disconnect();g.UI.CloseModal();Screen.SetResolution(3840,2160,FullScreenMode.FullScreenWindow);yield return new WaitForSecondsRealtime(1);
            var p=ArenaSpectatorCapture.Packet();var ids=p.snapshot.duels[0].players;
            g.Preferences.Avatar(ids[0],0).presetId="chatgpt";g.Preferences.Avatar(ids[1],1).presetId="claude";
            ArenaSpectatorCapture.Feed(g,p,6);yield return new WaitForSecondsRealtime(1);
            var stage=g.Stage;var camera=stage.View;var venue=stage.Venue;
            r.seats=venue.SeatCount;r.architectureDraws=venue.GetComponentsInChildren<MeshFilter>().Count(f=>f.transform.parent==venue.transform && !f.GetComponent<TextMeshPro>());
            Require(r.seats==104 && r.architectureDraws==5,"Missing or unbatched galleries");
            r.isolatedReferee=stage.Fighters.Count==2 && !stage.Fighters.Contains(venue.Referee) && venue.Referee.State.Name=="规则裁判";Require(r.isolatedReferee,"Referee entered the combat roster");
            yield return Photo(dir,"default-view");
            yield return Key(g,UnityEngine.InputSystem.Key.F8);Require(stage.Flight.Active,"F8 did not enter flight");
            Require(Application.isFocused,"Focus the QA game window to validate live camera input");
            var k=Keyboard.current;bool wasEnabled=k.enabled;InputSystem.EnableDevice(k);var inputStart=camera.transform.position;
            InputSystem.QueueStateEvent(k,new KeyboardState(UnityEngine.InputSystem.Key.W,UnityEngine.InputSystem.Key.E));InputSystem.Update();stage.Flight.SendMessage("Update");
            InputSystem.QueueStateEvent(k,new KeyboardState());InputSystem.Update();if(!wasEnabled)InputSystem.DisableDevice(k);
            r.keyboardFlight=Vector3.Distance(inputStart,camera.transform.position)>.0001f;Require(r.keyboardFlight,"W / E did not move free camera through input handler");
            var start=camera.transform.position;stage.Flight.Move(Vector3.forward,new Vector2(240,80),.5f);
            var moved=camera.transform.position;yield return null;
            r.flight=Vector3.Distance(start,moved)>1 && Vector3.Distance(moved,camera.transform.position)<.01f;Require(r.flight,"Stage overwrote free camera pose");
            float up=camera.transform.position.y;stage.Flight.Move(Vector3.up,Vector2.zero,.5f);Require(camera.transform.position.y>up+1,"Vertical movement failed");
            start=camera.transform.position;stage.Flight.Move(Vector3.right,Vector2.zero,1,.15f);float slow=Vector3.Distance(start,camera.transform.position);
            start=camera.transform.position;stage.Flight.Move(Vector3.right,Vector2.zero,1,4);Require(Vector3.Distance(start,camera.transform.position)>slow*20,"Speed modifiers failed");
            At(stage,new Vector3(16,12,-19),new Vector3(0,1.5f,3.8f));yield return Photo(dir,"venue-wide");
            yield return Key(g,UnityEngine.InputSystem.Key.H);Require(!g.Hud.gameObject.activeSelf,"H did not hide HUD");yield return Photo(dir,"venue-clean");yield return Key(g,UnityEngine.InputSystem.Key.H);
            r.hiddenHud=g.Hud.gameObject.activeSelf;Require(r.hiddenHud,"H did not restore HUD");
            At(stage,new Vector3(9.2f,5.6f,-.3f),new Vector3(7.8f,1.2f,5));yield return Photo(dir,"audience-seating");
            g.Reader.Open();start=camera.transform.position;yield return Key(g,UnityEngine.InputSystem.Key.F8,UnityEngine.InputSystem.Key.R);
            r.inputGuard=stage.Flight.Active && stage.CameraInputBlocked() && Vector3.Distance(start,camera.transform.position)<.01f;Require(r.inputGuard,"Reader did not guard camera keys");
            yield return Key(g,UnityEngine.InputSystem.Key.Escape);Require(!g.Reader.IsOpen && stage.Flight.Active,"Esc did not close reader before flight");
            g.ShowSettings(2);yield return null;Require(stage.CameraInputBlocked(),"Settings do not block camera");g.UI.CloseModal();
            p.snapshot.config.judge="agent:claude/claude-fixture";g.Duel.Receive(new CompetitionPacket{id=p.id,seq=6,snapshot=p.snapshot,events=Array.Empty<CompetitionEvent>()},false);yield return null;
            r.judgePreset=venue.Referee.Look.presetId=="claude" && stage.Fighters.Count==2;Require(r.judgePreset,"Configured judge appearance not used");
            At(stage,new Vector3(10.7f,3.5f,-1.2f),new Vector3(7,1.9f,2.72f));yield return Photo(dir,"referee-claude");
            p.snapshot.config.judge="";g.Duel.Receive(new CompetitionPacket{id=p.id,seq=6,snapshot=p.snapshot,events=Array.Empty<CompetitionEvent>()},false);yield return Photo(dir,"referee-neutral");
            var f=stage.Fighters[1];var head=f.BodyRoot.GetComponentsInChildren<Transform>().First(t=>t.name=="Head");
            At(stage,head.position+f.transform.forward*.9f+f.transform.right*.28f,head.position+Vector3.down*.12f);
            r.closeInspection=camera.nearClipPlane==.025f && Vector3.Distance(camera.transform.position,head.position)<1.1f;Require(r.closeInspection,"Close inspection restricted");
            At(stage,head.position+f.transform.forward*1.5f+f.transform.right*.38f+Vector3.up*.1f,head.position+Vector3.down*.08f);
            yield return Key(g,UnityEngine.InputSystem.Key.H);yield return Photo(dir,"claude-closeup");yield return Key(g,UnityEngine.InputSystem.Key.H);
            start=camera.transform.position;var rotation=camera.transform.rotation;
            yield return Key(g,UnityEngine.InputSystem.Key.F10);yield return new WaitForSecondsRealtime(.3f);yield return Key(g,UnityEngine.InputSystem.Key.F10);yield return new WaitForSecondsRealtime(.3f);
            r.fullscreen=stage.Flight.Active && Vector3.Distance(start,camera.transform.position)<.01f && Quaternion.Angle(rotation,camera.transform.rotation)<.01f;Require(r.fullscreen,"F10 hijacked camera");
            g.SetRoster(ids.Select(id=>new ModelInfo{id=id,name=id}).ToArray());yield return null;
            r.rosterContinuity=stage.Flight.Active && Vector3.Distance(start,camera.transform.position)<.01f;Require(r.rosterContinuity,"New duel hijacked flight");
            yield return Key(g,UnityEngine.InputSystem.Key.R);Require(!stage.Flight.Active && Mathf.Approximately(stage.CameraPitch,30),"R failed to restore default view");
            start=camera.transform.position;rotation=camera.transform.rotation;stage.Focus(venue.Referee);yield return null;stage.RestoreOverview();yield return null;
            r.focusRestore=Vector3.Distance(start,camera.transform.position)<.01f && Quaternion.Angle(rotation,camera.transform.rotation)<.01f;Require(r.focusRestore,"Referee focus lost overview");
            yield return Key(g,UnityEngine.InputSystem.Key.F8);yield return Key(g,UnityEngine.InputSystem.Key.Escape);Require(!stage.Flight.Active,"Esc failed to exit flight");
            // Actual toolbar and menu callbacks are wired, not only hotkeys.
            var buttons=g.Hud.GetComponentsInChildren<Button>(true);
            buttons.First(b=>b.name=="菜单").onClick.Invoke();yield return Photo(dir,"camera-controls");
            buttons.First(b=>b.name=="裁判特写").onClick.Invoke();Require(stage.Focused==venue.Referee && !g.Hud.MenuOpen,"Referee menu callback failed");stage.RestoreOverview();
            buttons.First(b=>b.name=="自由镜头").onClick.Invoke();Require(stage.Flight.Active,"Flight button failed");
            ArenaSpectatorCapture.Feed(g,p,p.seq);float deadline=Time.realtimeSinceStartup+45;
            while(!g.Finished){Require(Time.realtimeSinceStartup<deadline,"Mock duel timeout");yield return null;}
            r.hits=g.Duel.AppliedHits;r.settlement=r.hits==8 && stage.Fighters.Count==2 && !venue.Referee.Celebrating && !venue.Referee.Defeated && venue.Referee.State.Health==100;Require(r.settlement,"Decorations changed settlement");
            var quiet=ArenaSpectatorCapture.Packet();quiet.id+="-venue-quiet";quiet.snapshot.id=quiet.id;g.Preferences.motion=0;g.ApplyPreferences();g.Duel.Receive(quiet,false);yield return new WaitForSecondsRealtime(.5f);
            r.quietMode=g.Finished && g.Duel.AppliedHits==r.hits+8 && stage.Flight.Active;Require(r.quietMode,"Animations off changed flight or score");
            At(stage,new Vector3(16,12,-19),new Vector3(0,1.5f,3.8f));
            var times=new List<float>();double previous=Time.realtimeSinceStartupAsDouble;float until=Time.realtimeSinceStartup+12;
            while(Time.realtimeSinceStartup<until){yield return null;double now=Time.realtimeSinceStartupAsDouble;times.Add((float)((now-previous)*1000));previous=now;}
            r.width=Screen.width;r.height=Screen.height;r.performanceFrames=times.Count;r.fps=1000/times.Average();times.Sort();r.frameP95=times[(int)(times.Count*.95f)];
        }
    }
}
