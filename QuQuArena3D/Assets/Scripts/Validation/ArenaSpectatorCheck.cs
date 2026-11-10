using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
namespace QuQu
{
    [ArenaHarness("--arena-spectator-validation", false)]
    public static class ArenaSpectatorCheck
    {
        [Serializable] public class Result
        {
            public bool passed, keyboard, importedAvatar, allPresets, answerVisibility, opacity, readerScroll, duplicateSafe, sequential, finalAfterHit, drawerPinned, drawerCurrent, mirror, focusRestore, fullscreen, quietMode, reconnect, preferencesCompatible, native4K;
            public int hits, rounds, framingCases, width, height, msaa, performanceFrames;
            public string error, gpu, pipeline;public float renderScale, solveArea, clashArea, fps, frameP50, frameP95, frameP99;
            public List<string> framing=new List<string>();
        }
        static void Require(bool value,string why){if(!value)throw new Exception(why);}
        // Presentation advances per frame and fighters use scaled time, so a fixed real-time wait is not enough on
        // slow or background frames. Wait until ready; on timeout the following Require reports the failure.
        static IEnumerator Until(Func<bool> ready,float timeout=15){float end=Time.realtimeSinceStartup+timeout;while(!ready() && Time.realtimeSinceStartup<end)yield return null;}
        static bool Calm(ArenaGame g)=>g.Duel.Idle && g.Stage.Settled;
        public static IEnumerator Run(ArenaGame g)
        {
            var args=Environment.GetCommandLineArgs();int index=Array.IndexOf(args,"--arena-qa-output");
            string dir=index<0?"E:/projects/AI斗兽场/docs/validation/spectator-v06/v06":Path.GetFullPath(args[index+1]);Directory.CreateDirectory(dir);
            // The full-screen QA window takes the foreground, so stray scrolls or key presses at the desk would move the
            // camera mid-check. Ignore the real devices; KeyPress enables the keyboard only while injecting a key.
            foreach(InputDevice device in new InputDevice[]{Mouse.current,Keyboard.current})if(device!=null)InputSystem.DisableDevice(device);
            var r=new Result {gpu=SystemInfo.graphicsDeviceName};var steps=Check(g,dir,r,args.Contains("--arena-video"));
            // Flatten nested enumerators so assertions from every validation step reach the report.
            var stack=new Stack<IEnumerator>();stack.Push(steps);
            while(stack.Count>0)
            {
                object next=null;bool more;
                try {more=stack.Peek().MoveNext();if(more)next=stack.Peek().Current;}
                catch(Exception e){r.error=e.ToString();Debug.LogException(e);break;}
                if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}
                if(next is IEnumerator child){stack.Push(child);continue;}yield return next;
            }
            r.passed=string.IsNullOrEmpty(r.error);File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(r,true));
            if(!Application.isEditor)
            {
                if(!r.passed){Screen.SetResolution(1600,900,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.5f);}
                g.enabled=false; // Release the interactive quit guard before ending this completed QA run.
                Application.Quit(r.passed?0:1);
            }
        }
        static IEnumerator KeyPress(ArenaGame g,Key key)
        {
            // A standalone QA window may be unfocused. Give the action map one frame to bind
            // after enabling its keyboard, then inject the state without system-wide events.
            var keyboard=Keyboard.current ?? InputSystem.AddDevice<Keyboard>();bool enabled=keyboard.enabled;InputSystem.EnableDevice(keyboard);
            yield return null;
            InputSystem.QueueStateEvent(keyboard,new KeyboardState(key));InputSystem.Update();
            yield return null;
            InputSystem.QueueStateEvent(keyboard,new KeyboardState());InputSystem.Update();if(!enabled)InputSystem.DisableDevice(keyboard);
            yield return null;
        }
        static IEnumerator Check(ArenaGame g,string dir,Result r,bool video)
        {
            yield return new WaitForSecondsRealtime(1);g.Connection.Disconnect();g.UI.CloseModal();
            Screen.SetResolution(video?1920:3840,video?1080:2160,video?FullScreenMode.Windowed:FullScreenMode.FullScreenWindow);
            yield return new WaitForSecondsRealtime(1);
            if(video)
            {
                var p=ArenaSpectatorCapture.Packet();var ids=p.snapshot.duels[0].players;
                g.Preferences.Avatar(ids[0],0).presetId="chatgpt";g.Preferences.Avatar(ids[1],1).presetId="claude";
                ArenaSpectatorCapture.Feed(g,p,6);var capture=g.gameObject.AddComponent<ArenaVideoCapture>();g.StartCoroutine(capture.Capture(dir));File.WriteAllText(Path.Combine(dir,"video-ready.json"),"{\"width\":"+Screen.width+",\"height\":"+Screen.height+"}");
                yield return new WaitForSecondsRealtime(4);ArenaSpectatorCapture.Feed(g,p,9);yield return new WaitForSecondsRealtime(2);ArenaSpectatorCapture.Feed(g,p,p.seq);
                while(!g.Finished)yield return null;yield return new WaitForSecondsRealtime(4);capture.Recording=false;while(!capture.Finished)yield return null;Require(string.IsNullOrEmpty(capture.Error),capture.Error);yield break;
            }
            var old=JsonUtility.FromJson<ArenaPreferences>("{\"version\":1,\"musicVolume\":0.4,\"avatars\":[]}");old.Validate();
            r.preferencesCompatible=old.spectator!=null && Mathf.Abs(old.spectator.pitch-30)<.01f && Mathf.Abs(old.musicVolume-.4f)<.01f;Require(r.preferencesCompatible,"Old preferences lost defaults or music");
            var impacts=new List<int>();g.Stage.OnImpact=b=>{g.Media.Hit(b);if(g.Duel.Round?.index==3)impacts.Add(Time.frameCount);};
            yield return ArenaSpectatorCapture.Run(g,dir);
            r.hits=g.Duel.AppliedHits;r.rounds=g.Duel.PresentedRounds;r.sequential=impacts.Count==2 && impacts[1]>impacts[0];
            r.finalAfterHit=g.Finished && !g.Duel.Presenting && g.Stage.Fighters.Count(f=>f.Celebrating)==1;
            Require(r.sequential && r.finalAfterHit && r.hits==8,"Impact / final celebration mismatch");
            var p2=ArenaSpectatorCapture.Packet();g.Duel.Receive(p2,false);yield return null;r.duplicateSafe=g.Duel.AppliedHits==r.hits;Require(r.duplicateSafe,"Duplicate settlement");
            yield return new WaitForSecondsRealtime(.3f);r.clashArea=g.Hud.PanelArea;Require(r.clashArea<=.09f,"Combat HUD too large");
            g.Duel.Receive(p2,true);yield return new WaitForSecondsRealtime(.5f);yield return Until(()=>Calm(g));r.reconnect=g.Duel.AppliedHits==r.hits && !g.Stage.Fighters.Any(f=>f.Busy);Require(r.reconnect,"Reconnect attacked again");
            p2.id+="-reader";p2.snapshot.id=p2.id;ArenaSpectatorCapture.Feed(g,p2,6);yield return Until(()=>g.Duel.Round?.index==1 && !g.Duel.Presenting);
            r.solveArea=g.Hud.PanelArea;Require(r.solveArea<=.15f,"Reading HUD too large");
            g.Reader.Open();g.Reader.Current();string key=g.Reader.PinnedKey;string pinnedRound=g.Duel.Round.id;
            ArenaSpectatorCapture.Feed(g,p2,9);yield return new WaitForSecondsRealtime(.3f);string pinned=g.Reader.FullText;
            ArenaSpectatorCapture.Feed(g,p2,18);yield return Until(()=>g.Duel.Round!=null && g.Duel.Round.id!=pinnedRound);
            r.drawerPinned=g.Reader.PinnedKey==key && g.Reader.FullText==pinned;Require(r.drawerPinned,"Next question replaced pinned answer");
            g.Reader.Current();r.drawerCurrent=g.Reader.PinnedKey!=key;Require(r.drawerCurrent,"Current question button did not advance");
            yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"reader-4k.png"));g.Reader.Close();
            yield return new WaitForSecondsRealtime(3);yield return Until(()=>Calm(g));
            var camera=g.Stage.View;var before=camera.transform.position;var rotation=camera.transform.rotation;
            string wasFocused=g.Stage.Focused?g.Stage.Focused.name:"none";bool found=g.Stage.Fighters.Any(f=>f.State.Id==g.Selected);g.FocusSelected();yield return null;
            Require(g.Stage.CameraPitch>=45,"Focus is not oblique");g.Stage.RestoreOverview();yield return null;
            float moved=Vector3.Distance(before,camera.transform.position),turned=Quaternion.Angle(rotation,camera.transform.rotation);
            r.focusRestore=moved<.02f && turned<.02f;
            Require(r.focusRestore,"Focus lost overview: moved "+moved.ToString("0.###")+" m, turned "+turned.ToString("0.##")+" deg, focused before="+wasFocused+", selected found="+found+", calm="+Calm(g));
            before=camera.transform.position;yield return KeyPress(g,Key.F10);yield return new WaitForSecondsRealtime(.8f);Require(g.IsSpectating,"F10 key did not enter spectator mode");yield return KeyPress(g,Key.F10);yield return new WaitForSecondsRealtime(.8f);
            r.fullscreen=!g.IsSpectating && Vector3.Distance(before,camera.transform.position)<.02f;Require(r.fullscreen,"F10 changed composition");
            g.Reader.Open();yield return KeyPress(g,Key.Escape);r.keyboard=!g.Reader.IsOpen;Require(r.keyboard,"Esc did not close drawer");
            var first=g.Stage.Fighters[0];float x=first.Home.x;g.Preferences.mirrorPanels=true;g.ApplyPreferences();yield return null;
            r.mirror=Mathf.Approximately(first.Home.x,-x);Require(r.mirror,"Mirror failed");g.Preferences.mirrorPanels=false;g.ApplyPreferences();
            // A long original answer verifies two-line clipping and scrollable, complete text at maximum font size.
            p2=ArenaSpectatorCapture.Packet();p2.id+="-layout";p2.snapshot.id=p2.id;var e=p2.events.First(z=>z.seq==9);
            string longText=string.Concat(Enumerable.Repeat("这是保留原文的长答案。先核对条件，再检查例外，最后给出完整论证。",30));
            foreach(var live in e.round.live){live.answer=longText;live.reasoning=longText;}
            e.round.question.task.input=longText;ArenaSpectatorCapture.Feed(g,p2,9);yield return Until(()=>g.Duel.Round?.question?.task?.input==longText);
            g.Preferences.uiScale=1.2f;g.ApplyPreferences();g.Reader.Open();g.Reader.Current();Require(g.Reader.FullText.Contains(longText),"Reader truncated original text");
            var scroll=g.Reader.GetComponentInChildren<UnityEngine.UI.ScrollRect>();scroll.verticalNormalizedPosition=0;yield return null;
            r.readerScroll=scroll.content.anchoredPosition.y>100;Require(r.readerScroll,"Full answer cannot scroll to the bottom");
            yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"reader-long-bottom-4k.png"));g.Reader.Close();
            g.Preferences.answersVisible=false;g.Preferences.opacity=.5f;g.ApplyPreferences();yield return new WaitForEndOfFrame();
            r.answerVisibility=g.Hud.transform.Find("Question and excerpts/Answer excerpt 0").gameObject.activeSelf==false;
            r.opacity=Mathf.Abs(g.Hud.transform.Find("Health 0").GetComponent<UnityEngine.UI.Image>().color.a-.41f)<.001f;
            Require(r.answerVisibility && r.opacity,"Answer visibility / opacity preference ignored");
            g.Preferences.answersVisible=true;g.Preferences.opacity=.92f;g.ApplyPreferences();
            foreach(int w in Application.isEditor?new[]{Screen.width}:new[]{1920,2560,3840})foreach(float scale in new[]{.65f,1f,1.45f})
            {
                if(!Application.isEditor)Screen.SetResolution(w,w*9/16,w==3840?FullScreenMode.ExclusiveFullScreen:FullScreenMode.Windowed);
                yield return new WaitForSecondsRealtime(.7f);
                foreach(var f in g.Stage.Fighters){f.Look.scale=scale;f.ApplyLook(f.Look);}g.Stage.PlaceDuelFighters(g.Preferences.mirrorPanels);g.Stage.ResetCamera();yield return new WaitForSecondsRealtime(.4f);g.Stage.Refit();yield return null;
                foreach(var b in g.Stage.FramingBounds)for(int c=0;c<8;c++)
                {
                    var corner=b.center+Vector3.Scale(b.extents,new Vector3((c&1)==0?-1:1,(c&2)==0?-1:1,(c&4)==0?-1:1));var v=camera.WorldToViewportPoint(corner);
                    Require(v.z>0 && v.x>.02f && v.x<.98f && v.y>.12f && v.y<.87f,"Clipped character: "+w+" / "+scale+" / "+v);
                }
                foreach(var t in g.Hud.ExcerptLabels)
                {
                    t.ForceMeshUpdate();Require(t.isTextTruncated,"Long excerpt lacks ellipsis");
                    var visible=t.textInfo.characterInfo.Take(t.textInfo.characterCount).Where(ch=>ch.isVisible).ToArray();
                    Require(visible.Select(ch=>ch.lineNumber).Distinct().Count()<=2,"Excerpt exceeds two lines");
                    Require(visible.Any(ch=>ch.character=='…'),"Truncated text missing visible ellipsis");
                }
                r.framing.Add(Screen.width+"x"+Screen.height+" @ "+scale);r.framingCases++;
                yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"layout-"+Screen.width+"x"+Screen.height+"-"+scale.ToString("0.00",System.Globalization.CultureInfo.InvariantCulture)+".png"));
            }
            // Check all six installed presets plus the existing self-contained GLB import path.
            foreach(var preset in ArenaModelPresets.All)
            {
                g.ApplyModelPreset(g.Stage.Fighters[0],preset.Id);yield return new WaitForSecondsRealtime(.2f);
                Require(g.Stage.Fighters[0].BodyRoot.GetComponentsInChildren<Renderer>().Length>0,"Missing preset "+preset.Id);
            }
            r.allPresets=true;
            var imported=g.Media.LoadAvatar(g.Stage.Fighters[0],"E:/projects/AI斗兽场/production/art/model-presets-v01/claude/mesh.glb",g.Notify);
            while(!imported.IsCompleted)yield return null;Require(imported.Result,"Existing GLB import failed");g.Stage.Refit();yield return null;
            r.importedAvatar=g.Stage.FramingBounds.All(b=>{var v=camera.WorldToViewportPoint(b.center);return v.x>0 && v.x<1 && v.y>0 && v.y<1;});Require(r.importedAvatar,"Imported avatar was not fitted");
            yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"imported-avatar-4k.png"));
            g.Preferences.uiScale=1;g.Preferences.motion=0;g.ApplyPreferences();int hits=g.Duel.AppliedHits;ArenaSpectatorCapture.Feed(g,p2,p2.seq);
            yield return Until(()=>g.Finished && Calm(g) && g.Duel.AppliedHits==hits+8);
            r.quietMode=g.Finished && !g.Stage.Fighters.Any(f=>f.Busy) && g.Duel.AppliedHits==hits+8;Require(r.quietMode,"Motion off changed settlement");
            g.Preferences.motion=1;g.ApplyPreferences();foreach(var f in g.Stage.Fighters)f.Look.scale=1;
            g.Preferences.Avatar(ArenaGame.DemoIds[0],0).presetId="chatgpt";g.Preferences.Avatar(ArenaGame.DemoIds[1],1).presetId="claude";
            var perf=ArenaSpectatorCapture.Packet();perf.id+="-perf";perf.snapshot.id=perf.id;g.Duel.Receive(perf,false);
            yield return new WaitForSecondsRealtime(3);
            var rp=GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;r.pipeline=rp?.name;r.renderScale=rp?rp.renderScale:0;r.msaa=rp?rp.msaaSampleCount:0;
            r.width=Screen.width;r.height=Screen.height;r.native4K=r.width==3840 && r.height==2160 && r.renderScale==1 && r.msaa==4;
            Require(r.renderScale==1 && r.msaa==4 && (Application.isEditor || r.native4K),"Native 4K pipeline mismatch");
            var times=new List<float>();float end=Time.realtimeSinceStartup+18;double previous=Time.realtimeSinceStartupAsDouble;
            // No readback, screenshots, encoding, disk writes or logging during the measured interval.
            while(Time.realtimeSinceStartup<end){yield return null;double now=Time.realtimeSinceStartupAsDouble;times.Add((float)((now-previous)*1000));previous=now;}
            r.performanceFrames=times.Count;r.fps=1000/times.Average();times.Sort();r.frameP50=times[times.Count/2];r.frameP95=times[(int)(times.Count*.95f)];r.frameP99=times[(int)(times.Count*.99f)];
            while(!g.Finished)yield return null;yield return new WaitForSecondsRealtime(.5f);
        }
    }
}
