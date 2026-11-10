using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using Unity.Profiling;

namespace QuQu
{
    [ArenaHarness("--arena-booth-validation", true)]
    public static class ArenaBoothCheck
    {
        static void Require(bool ok,string why){if(!ok)throw new Exception(why);}
        static IEnumerator Until(Func<bool> done){float end=Time.unscaledTime+90;while(!done()){Require(Time.unscaledTime<end,"Timed out");yield return null;}}
        static IEnumerator Photo(string dir,string name){yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,name+".png"));}
        // 门禁通道产物（与 ArenaVisualCheck 同款 JsonUtility）：报告仍写 booths.json，这里只补门禁认识的 runtime.json。
        [Serializable] class GateResult { public bool passed; }
        static IEnumerator Visit(ArenaGame g,ArenaOrbitalNetwork.Place place,bool skip=true)
        {g.Stations.Visit(place);if(skip)g.Stations.Skip();yield return Until(()=>!g.Stations.Moving);yield return new WaitForSecondsRealtime(.3f);}
        public static IEnumerator Run(ArenaGame g)
        {
            foreach(var device in UnityEngine.InputSystem.InputSystem.devices)UnityEngine.InputSystem.InputSystem.DisableDevice(device);
            var args=Environment.GetCommandLineArgs();string dir=args[Array.IndexOf(args,"--arena-qa-output")+1];Directory.CreateDirectory(dir);
            var report=new JObject{["evidence"]="Actual Windows framebuffer; saved mock duel replay and isolated backend; no paid model calls",["gpu"]=SystemInfo.graphicsDeviceName};
            var errors=new List<string>();Application.LogCallback log=(m,t,k)=>{if(k==LogType.Error || k==LogType.Exception)errors.Add(m);};Application.logMessageReceived+=log;
            var stack=new Stack<IEnumerator>();stack.Push(Check(g,dir,report));
            while(stack.Count>0)
            {
                bool more;object item=null;
                try{more=stack.Peek().MoveNext();if(more)item=stack.Peek().Current;}catch(Exception e){report["error"]=e.ToString();break;}
                if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}if(item is IEnumerator child)stack.Push(child);else yield return item;
            }
            while(stack.Count>0)(stack.Pop() as IDisposable)?.Dispose();
            foreach(var video in g.GetComponents<ArenaVideoCapture>())video.Recording=false;
            Application.logMessageReceived-=log;report["runtimeErrors"]=JArray.FromObject(errors);report["backendPid"]=g.Desktop.ProcessId;
            report["passed"]=report["error"]==null && errors.Count==0;File.WriteAllText(Path.Combine(dir,"booths.json"),report.ToString());
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(new GateResult{passed=report["passed"].Value<bool>()},true));
            g.UI.ClearGuard();g.ShowHome();Application.Quit((bool)report["passed"]?0:1);
        }
        static IEnumerator Check(ArenaGame g,string dir,JObject report)
        {
            yield return Until(()=>g.Desktop.Ready && !g.Desktop.Starting);g.Connection.Disconnect();g.UI.CloseModal();g.Stage.ResetCamera();
            var departure=g.Stage.CaptureView();var trips=new JArray();
            var ride=g.gameObject.AddComponent<ArenaVideoCapture>();g.StartCoroutine(ride.Capture(Path.Combine(dir,"transport-video")));
            foreach(var place in new[]{ArenaOrbitalNetwork.Place.Commentary,ArenaOrbitalNetwork.Place.Referee,ArenaOrbitalNetwork.Place.Commentary,ArenaOrbitalNetwork.Place.Arena})
            {
                var from=g.Stations.Current;float start=Time.unscaledTime;yield return Visit(g,place,false);
                float duration=Time.unscaledTime-start;
                // v27 SkyLift 行程顶破旧上界（4~7 是 v26 的 5.4s 行程口径）：v27 upperRide≈6.66s+0.3s 尾拍，
                // 实测 219 帧@30fps≈7.3s；docs/validation/lift-v27/lift-01/lift.json trips 四程 6.65s×4（movingFrames 154）
                // 与 ArenaLiftCheck 绿证同源。上限 7→8 对齐实测，下限 4 不动。
                Require(duration>4 && duration<8,"Transport duration");
                Require(!g.Stations.Transport.CabinActive,"Cabin remained active");trips.Add(new JObject{["from"]=from.ToString(),["to"]=place.ToString(),["seconds"]=duration});
            }
            ride.Recording=false;yield return Until(()=>ride.Finished);Require(ride.Error==null,ride.Error);
            Require(Vector3.Distance(departure.position,g.Stage.View.transform.position)<.03f && Quaternion.Angle(departure.rotation,g.Stage.View.transform.rotation)<.1f,"Arena view not restored");
            g.Stations.Visit(ArenaOrbitalNetwork.Place.Commentary);g.Escape();yield return Until(()=>!g.Stations.Moving);
            g.Stations.SetCommentaryView(true);g.Escape();Require(!g.Stations.GlassView && g.Stations.Current==ArenaOrbitalNetwork.Place.Commentary,"Glass Esc did not return to booth");
            g.Preferences.motion=0;g.ApplyPreferences();float cut=Time.unscaledTime;yield return Visit(g,ArenaOrbitalNetwork.Place.Referee,false);
            Require(Time.unscaledTime-cut<1.2f,"Static transfer animated");g.Preferences.motion=1;g.ApplyPreferences();
            yield return Visit(g,ArenaOrbitalNetwork.Place.Commentary);report["travel"]=trips;report["skipStaticEscAndRestore"]=true;
            var packet=ArenaSpectatorCapture.Packet();packet.id="v26-booth-fixture";packet.snapshot.id=packet.id;
            foreach(var e in packet.events)e.competitionId=packet.id;
            var ids=packet.snapshot.duels[0].players;g.Preferences.Avatar(ids[0],0).presetId="chatgpt";g.Preferences.Avatar(ids[1],1).presetId="claude";
            var pixels=g.Stations.PixelScreen;var referee=g.Stations.RefereeBoard;float fov=g.Stage.View.fieldOfView;
            var video=g.gameObject.AddComponent<ArenaVideoCapture>();g.StartCoroutine(video.Capture(Path.Combine(dir,"pixel-and-glass-video")));
            ArenaSpectatorCapture.Feed(g,packet,6);yield return Until(()=>g.Duel.Idle);yield return new WaitForSecondsRealtime(.3f);
            Require(pixels.ShownPhase=="solving" && pixels.LeftScore<0 && pixels.RightScore<0,"Incoming snapshot leaked score");
            Require(g.Stage.View.fieldOfView==fov,"Duel changed booth FOV");Require(referee.AnnouncementCount==1,"Start announcement missing or duplicated");
            yield return Photo(dir,"pixel-solving");ArenaSpectatorCapture.Feed(g,packet,9);yield return Until(()=>g.Duel.Idle);yield return new WaitForSecondsRealtime(.3f);
            Require(pixels.ShownPhase=="judging" && pixels.LeftScore<0,"Judging prematurely displayed final score");yield return Photo(dir,"pixel-judging");
            ArenaSpectatorCapture.Feed(g,packet,26);bool left=false,right=false;float deadline=Time.unscaledTime+40;
            while(!g.Duel.Idle && Time.unscaledTime<deadline)
            {
                left|=pixels.LeftSlapping;right|=pixels.RightSlapping;
                if(g.Duel.Presenting)Require(referee.AnnouncementCount==1,"Verdict appeared during attack");
                yield return null;
            }
            Require(g.Duel.Idle && left && right,"Pixel screen missed one side's real attack");yield return new WaitForSecondsRealtime(.3f);
            Require(Mathf.Abs(pixels.LeftHealth-g.Stage.Fighters[0].State.Health)<.01f && Mathf.Abs(pixels.RightHealth-g.Stage.Fighters[1].State.Health)<.01f,"Pixel HP disagrees with arena");
            yield return Photo(dir,"pixel-round-result");g.Stations.SetCommentaryView(true);g.Stations.ShowPanel();ArenaSpectatorCapture.Feed(g,packet,packet.seq);
            yield return new WaitForSecondsRealtime(1);yield return Photo(dir,"glass-live-duel");yield return Until(()=>g.Duel.Idle && g.Finished);
            Require(referee.AnnouncementCount==2 && !g.Duel.Presenting,"Single match duplicated verdict");
            int hits=g.Duel.AppliedHits,announcements=referee.AnnouncementCount;
            g.Duel.Receive(packet,false);yield return new WaitForSecondsRealtime(.3f);Require(hits==g.Duel.AppliedHits && announcements==referee.AnnouncementCount,"Duplicate replayed");
            g.Duel.Receive(packet,true);yield return new WaitForSecondsRealtime(.3f);Require(hits==g.Duel.AppliedHits && announcements==referee.AnnouncementCount,"Reconnect announced again");
            g.Stations.SetCommentaryView(false);g.Stations.ShowPanel();yield return Photo(dir,"pixel-final");
            g.Preferences.motion=0;g.ApplyPreferences();yield return null;float clock=pixels.AnimationClock;yield return new WaitForSecondsRealtime(.4f);Require(pixels.AnimationClock==clock,"Pixel animation did not freeze");
            g.Preferences.motion=1;g.ApplyPreferences();video.Recording=false;yield return Until(()=>video.Finished);Require(video.Error==null,video.Error);
            yield return Visit(g,ArenaOrbitalNetwork.Place.Referee);int revision=pixels.Revision;yield return new WaitForSecondsRealtime(.4f);Require(!pixels.isActiveAndEnabled && pixels.Revision==revision,"Inactive booth kept updating");
            report["pixel"]=new JObject{["bothAttacks"]=left&&right,["hits"]=hits,["announcements"]=announcements,["duplicatesAndReconnect"]=true,["motionOff"]=true,["inactiveFrozen"]=true};
            var performance=new JArray();
            foreach(int width in new[]{1920,2560,3840})
            {
                Screen.SetResolution(width,width*9/16,FullScreenMode.FullScreenWindow);yield return new WaitForSecondsRealtime(1);
                // 工具现实：Screen.SetResolution 在编辑器里是 no-op，本循环是 player-build-only 检查。
                // 编辑器把实际渲染尺寸如实写入报告不断言；player 保留原硬断言。PNG 文件名保留惯例档名。
                if(Application.isEditor)report["renderSize-"+width]=Screen.width+"x"+Screen.height;else Require(Screen.width==width && Screen.height==width*9/16,"Resolution mismatch");
                g.ShowHome();yield return new WaitForSecondsRealtime(.4f);yield return Photo(dir,"home-"+width);yield return Performance("home-"+width,performance);
                g.UI.CloseModal();g.Stage.ResetCamera();yield return Photo(dir,"arena-"+width);yield return Performance("arena-"+width,performance);
                yield return Visit(g,ArenaOrbitalNetwork.Place.Commentary);yield return Photo(dir,"commentary-"+width);yield return Performance("commentary-"+width,performance);
                Require(g.Stations.CommentaryInteriorActive && !g.Stations.RefereeInteriorActive,"Referee effects stayed on");
                g.Stations.SetCommentaryView(true);g.Stations.ShowPanel();yield return Photo(dir,"glass-"+width);yield return Performance("glass-"+width,performance);
                yield return Visit(g,ArenaOrbitalNetwork.Place.Referee);yield return Photo(dir,"referee-"+width);yield return Performance("referee-"+width,performance);
                Require(!g.Stations.CommentaryInteriorActive && g.Stations.RefereeInteriorActive,"Commentary effects stayed on");
            }
            report["performance"]=performance;report["threeResolutions"]=true;
        }
        static IEnumerator Performance(string view,JArray output)
        {
            // Screenshot PNG encoding is synchronous; exclude its diagnostic stall from normal frame timing.
            yield return new WaitForSecondsRealtime(.3f);
            using(var calls=ProfilerRecorder.StartNew(ProfilerCategory.Render,"Draw Calls Count"))
            using(var tris=ProfilerRecorder.StartNew(ProfilerCategory.Render,"Triangles Count"))
            {
                var ms=new List<float>();var cpu=new List<double>();var gpu=new List<double>();var frame=new FrameTiming[1];long draw=0,triangles=0;float end=Time.unscaledTime+3;
                while(Time.unscaledTime<end)
                {
                    FrameTimingManager.CaptureFrameTimings();yield return null;ms.Add(Time.unscaledDeltaTime*1000);draw=Math.Max(draw,calls.LastValue);triangles=Math.Max(triangles,tris.LastValue);
                    if(FrameTimingManager.GetLatestTimings(1,frame)>0){if(frame[0].cpuFrameTime>0)cpu.Add(frame[0].cpuFrameTime);if(frame[0].gpuFrameTime>0)gpu.Add(frame[0].gpuFrameTime);}
                }
                ms.Sort();output.Add(new JObject{["view"]=view,["fps"]=1000/ms.Average(),["p95ms"]=ms[(int)(ms.Count*.95f)],["cpuMs"]=cpu.Count>0?cpu.Average():JValue.CreateNull(),["gpuMs"]=gpu.Count>0?gpu.Average():JValue.CreateNull(),["drawCallsMax"]=draw,["trianglesMax"]=triangles});
            }
        }
    }
}
