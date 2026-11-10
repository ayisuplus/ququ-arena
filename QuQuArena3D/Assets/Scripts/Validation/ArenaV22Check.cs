using System;
using System.IO;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using Unity.Profiling;

namespace QuQu
{
    // Isolated acceptance: recorded competition fixtures, no model calls or user profile writes.
    [ArenaHarness("--arena-v22-validation", true)]
    public static class ArenaV22Check
    {
        static void Require(bool value,string message){if(!value)throw new Exception(message);}
        static IEnumerator Until(Func<bool> done){float end=Time.unscaledTime+90;while(!done()){Require(Time.unscaledTime<end,"Timed out");yield return null;}}
        static IEnumerator Photo(string dir,string name){yield return new WaitForSecondsRealtime(.4f);yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,name+".png"));}
        static CompetitionPacket Packet(string id){var p=ArenaSpectatorCapture.Packet();p.id=id;return p;}
        public static IEnumerator Run(ArenaGame g)
        {
            foreach(var device in UnityEngine.InputSystem.InputSystem.devices)UnityEngine.InputSystem.InputSystem.DisableDevice(device);
            var args=Environment.GetCommandLineArgs();string dir=args[Array.IndexOf(args,"--arena-qa-output")+1];Directory.CreateDirectory(dir);
            var report=new JObject{["evidence"]="Real Windows rendering; saved competition fixtures, no new model calls",["gpu"]=SystemInfo.graphicsDeviceName};var errors=new List<string>();
            Application.LogCallback log=(m,t,k)=>{if(k==LogType.Error || k==LogType.Exception || k==LogType.Assert)errors.Add(m);};Application.logMessageReceived+=log;
            bool booths=args.Contains("--arena-booth-check");report["scope"]=booths?"booth follow-up":"full v22";
            var stack=new Stack<IEnumerator>();stack.Push(booths?Booths(g,dir,report):Check(g,dir,report));
            while(stack.Count>0)
            {
                bool more;object item=null;
                try{more=stack.Peek().MoveNext();if(more)item=stack.Peek().Current;}catch(Exception error){report["error"]=error.ToString();Debug.LogException(error);break;}
                if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}if(item is IEnumerator child)stack.Push(child);else yield return item;
            }
            Application.logMessageReceived-=log;report["runtimeErrors"]=JArray.FromObject(errors);report["backendPid"]=g.Desktop.ProcessId;report["passed"]=report["error"]==null && errors.Count==0;
            File.WriteAllText(Path.Combine(dir,"v22.json"),report.ToString());g.UI.ClearGuard();g.ShowHome();Application.Quit(report["passed"].Value<bool>()?0:1);
        }
        static IEnumerator Check(ArenaGame g,string dir,JObject report)
        {
            yield return Until(()=>g.Desktop.Ready && !g.Desktop.Starting);yield return new WaitForSecondsRealtime(1);g.Connection.Disconnect();
            Require(g.Preferences.avatarMode=="standard" && g.Preferences.blackHoleEnabled && g.Preferences.starBrightness==2,"Display defaults");
            yield return Photo(dir,"home-default");g.UI.CloseModal();g.Stage.ResetCamera();yield return new WaitForSecondsRealtime(.2f);var arena=g.Stage.CaptureView();
            var video=g.gameObject.AddComponent<ArenaVideoCapture>();g.StartCoroutine(video.Capture(Path.Combine(dir,"transit-video")));
            var travel=new JArray();var destinations=new[]{ArenaOrbitalNetwork.Place.Lab,ArenaOrbitalNetwork.Place.Referee,ArenaOrbitalNetwork.Place.Commentary,ArenaOrbitalNetwork.Place.Gallery};
            foreach(var place in destinations)
            {
                var origin=g.Stations.Current;float time=Time.unscaledTime;g.Stations.Visit(place);yield return Until(()=>!g.Stations.Moving);
                float duration=Time.unscaledTime-time;
                // 同族边界随 v27 SkyLift 过期（与 ArenaBoothCheck/ArenaArchitectureCheck 同因）：
                // 涉 Commentary 的行程走竖井，lift-v27 实测 6.65s 移动+门拍壁钟≈7.3s，顶破 6.5 旧上界。
                // 上限 6.5→8 对齐实测，下限 1.7 不动（瞬移/跳过守卫原意保留）。
                Require(duration>1.7f && duration<8,"Travel duration out of range: "+duration);
                Require(g.Stations.Current==place && !g.Stations.Transport.CabinActive,"Cabin did not arrive");travel.Add(new JObject{["from"]=origin.ToString(),["to"]=place.ToString(),["seconds"]=duration});yield return Photo(dir,"arrival-"+place);
            }
            g.Stations.ReturnToArena();yield return Until(()=>!g.Stations.Moving);video.Recording=false;yield return Until(()=>video.Finished);Require(video.Error==null,video.Error);
            Require(Vector3.Distance(arena.position,g.Stage.View.transform.position)<.03f && Quaternion.Angle(arena.rotation,g.Stage.View.transform.rotation)<.1f,"Return camera changed");
            foreach(var place in destinations)
            {g.Stations.Visit(place);g.Escape();yield return Until(()=>!g.Stations.Moving);Require(g.Stations.Current==place,"Esc skip lost destination");g.Stations.ReturnToArena();g.Stations.Skip();yield return Until(()=>!g.Stations.Moving);}
            g.Preferences.motion=0;g.ApplyPreferences();float cut=Time.unscaledTime;g.Stations.Visit(ArenaOrbitalNetwork.Place.Lab);yield return Until(()=>!g.Stations.Moving);Require(Time.unscaledTime-cut<1 && !g.Stations.Transport.CabinActive,"Static mode should fade");
            g.Stations.ReturnToArena();yield return Until(()=>!g.Stations.Moving);g.Preferences.motion=1;g.ApplyPreferences();
            g.Stations.Visit(ArenaOrbitalNetwork.Place.Lab);yield return new WaitForSecondsRealtime(.5f);g.ShowHome();yield return new WaitForSecondsRealtime(.5f);
            Require(g.Stations.Current==ArenaOrbitalNetwork.Place.Home && !g.Stations.Moving && !g.Stations.Transport.CabinActive,"Home during transit left camera owner behind");g.UI.CloseModal();report["travel"]=travel;
            var packet=Packet("v22-switch-during-combat");var ids=packet.snapshot.duels[0].players;
            g.Preferences.Avatar(ids[0],0).presetId="chatgpt";g.Preferences.Avatar(ids[1],1).presetId="claude";g.Duel.Receive(packet,false);
            yield return Until(()=>g.Duel.Presenting);g.Preferences.avatarMode="chibi";g.ApplyPreferences();Require(g.AvatarModePending && g.Stage.Fighters.All(f=>!f.Chibi),"Switched before attack completed");
            g.Preferences.avatarMode="standard";g.ApplyPreferences();g.Preferences.avatarMode="chibi";g.ApplyPreferences();
            yield return Until(()=>g.Finished && g.Duel.Idle && !g.AvatarModePending);Require(g.Stage.Fighters.All(f=>f.Chibi),"Queued mode not applied");
            int hits=g.Duel.AppliedHits,rounds=g.Duel.PresentedRounds;g.Duel.Receive(packet,false);yield return new WaitForSecondsRealtime(.6f);
            Require(g.Duel.AppliedHits==hits && g.Duel.PresentedRounds==rounds,"Duplicate event repeated settlement");g.Duel.Receive(packet,true);yield return new WaitForSecondsRealtime(.3f);Require(g.Duel.AppliedHits==hits,"Reconnect replayed damage");
            report["combatModeSwitch"]=new JObject{["hits"]=hits,["rounds"]=rounds,["deferred"]=true,["duplicatesIgnored"]=true,["reconnect"]=true};
            yield return Photo(dir,"chibi-settlement");
            yield return Booths(g,dir,report);
            g.Preferences.avatarMode="chibi";g.ApplyPreferences();yield return Until(()=>!g.AvatarModePending);
            foreach(var preset in ArenaModelPresets.All)
            {
                string id="v22/"+preset.Id;g.Preferences.Avatar(id,0).presetId=preset.Id;g.Preferences.Avatar("v22/target",1).presetId="claude";
                g.SetRoster(new[]{new ModelInfo{id=id,name=preset.Name},new ModelInfo{id="v22/target",name="Target"}});
                for(int variant=0;variant<3;variant++)
                {int impacts=0;g.Stage.Fighters[0].CastResolved(g.Stage.Fighters[1],variant==2?0:15,(p,c,b)=>impacts++);yield return Until(()=>g.Stage.Fighters.All(f=>!f.Busy));Require(impacts==(variant==2?0:1),"Q slap impact count");}
                g.Stage.Fighters[0].Celebrating=true;g.Stage.Fighters[1].Defeated=true;yield return Photo(dir,"combat-"+preset.Id);
                foreach(float scale in new[]{.65f,1.45f}){g.Stage.Fighters[0].Look.scale=scale;g.Stage.Fighters[0].ApplyLook(g.Stage.Fighters[0].Look);yield return null;Require(g.Stage.Fighters[0].BodyRoot.localScale.x==scale,"Chibi scaling");}
            }
            g.Preferences.mirrorPanels=true;g.ApplyPreferences();Require(g.Stage.Fighters[0].Home.x>0,"Mirrored standing point");g.Preferences.mirrorPanels=false;g.ApplyPreferences();
            g.Stations.Visit(ArenaOrbitalNetwork.Place.Gallery);g.Stations.Skip();yield return Until(()=>!g.Stations.Moving);var gallery=g.Stations.Gallery;
            Require(gallery.Actors.Count==6,"Gallery roster");
            foreach(var actor in gallery.Actors)
            {
                gallery.View.Select(actor);yield return new WaitForSecondsRealtime(1.2f);var position=actor.transform.position;var target=actor.Destination;
                g.Preferences.avatarMode="standard";g.ApplyPreferences();g.Preferences.avatarMode="chibi";g.ApplyPreferences();yield return Until(()=>!g.AvatarModePending);
                Require(gallery.View.Selected==actor && Vector3.Distance(position,actor.transform.position)<.03f && actor.Destination==target,"Mode switch changed selected resident or destination");
                gallery.View.Orbit(0,0,2);yield return Photo(dir,"gallery-"+actor.Preset.Id);gallery.View.Orbit(0,0,2.1f);yield return Photo(dir,"face-"+actor.Preset.Id);
                gallery.View.Orbit(60,0,0);yield return Photo(dir,"profile-"+actor.Preset.Id);g.Escape();yield return null;Require(gallery.View.Selected==null,"Esc close-up");
            }
            g.Preferences.motion=0;g.ApplyPreferences();yield return new WaitForSecondsRealtime(.15f);var frozen=gallery.Actors.Select(a=>a.transform.position).ToArray();var clocks=gallery.Actors.Select(a=>a.Clock).ToArray();yield return new WaitForSecondsRealtime(.5f);
            Require(gallery.Actors.Select((a,i)=>a.Clock==clocks[i] && a.transform.position==frozen[i]).All(v=>v),"Motion off still animates");g.Preferences.motion=1;g.ApplyPreferences();
            g.Preferences.blackHoleEnabled=false;g.ApplyPreferences();float holeClock=g.Stage.Singularity.Clock;yield return new WaitForSecondsRealtime(.3f);
            Require(!g.Stage.Singularity.gameObject.activeInHierarchy && g.Stage.Singularity.Clock==holeClock && RenderSettings.skybox,"Black hole disabled path");g.Preferences.starBrightness=4;g.ApplyPreferences();Require(Shader.GetGlobalFloat("_ArenaStarBrightness")==4,"Shared star brightness");g.Preferences.starBrightness=2;g.Preferences.blackHoleEnabled=true;g.ApplyPreferences();
            report["gallerySwitchAndDisplay"]=true;
            var args=Environment.GetCommandLineArgs();int index=Array.IndexOf(args,"--arena-test-avatar");
            if(index>=0)
            {
                var f=g.Stage.Fighters[0];string path=args[index+1];f.Look.modelPath=path;var preserved=JsonUtility.ToJson(f.Look);
                g.Preferences.avatarMode="standard";g.ApplyPreferences();var late=g.Media.LoadAvatar(f,path,null);g.Preferences.avatarMode="chibi";g.ApplyPreferences();yield return Until(()=>late.IsCompleted);
                Require(f.Chibi && f.BodyRoot.GetComponentsInChildren<Transform>().All(t=>t.name!="Imported avatar") && JsonUtility.ToJson(f.Look)==preserved,"Late imported model overwrote chibi");
                g.Preferences.avatarMode="standard";g.ApplyPreferences();yield return Until(()=>f.BodyRoot.GetComponentsInChildren<Transform>().Any(t=>t.name=="Imported avatar"));
                Require(JsonUtility.ToJson(f.Look)==preserved,"Standard custom appearance not restored");f.Look.modelPath="";g.Preferences.avatarMode="chibi";g.ApplyPreferences();report["customAppearanceAndAsyncRace"]=true;
            }
            var roaming=g.gameObject.AddComponent<ArenaVideoCapture>();g.StartCoroutine(roaming.Capture(Path.Combine(dir,"roaming-video")));yield return new WaitForSecondsRealtime(16);roaming.Recording=false;yield return Until(()=>roaming.Finished);
            float start=Time.realtimeSinceStartup,next=start;int maxMoving=0;float minSeparation=float.MaxValue;var arrivals=gallery.Actors.Select(a=>a.Arrivals).ToArray();
            while(Time.realtimeSinceStartup-start<600)
            {
                maxMoving=Math.Max(maxMoving,gallery.MovingCount);Require(maxMoving<=3,"Too many walking");
                for(int i=0;i<gallery.Actors.Count;i++)
                {var actor=gallery.Actors[i];var local=gallery.transform.InverseTransformPoint(actor.transform.position);Require(actor.Agent.isOnNavMesh && Mathf.Abs(local.x)<12 && Mathf.Abs(local.z)<8,"Resident left floor");Require(!Physics.CheckCapsule(actor.transform.position+Vector3.up*.5f,actor.transform.position+Vector3.up*1.3f,.3f,1<<28,QueryTriggerInteraction.Ignore),"Wall or console intersection");for(int j=i+1;j<gallery.Actors.Count;j++)minSeparation=Mathf.Min(minSeparation,Vector3.Distance(actor.transform.position,gallery.Actors[j].transform.position));}
                if(Time.realtimeSinceStartup>=next)
                {File.WriteAllText(Path.Combine(dir,"soak-progress.json"),new JObject{["seconds"]=Time.realtimeSinceStartup-start,["maxMoving"]=maxMoving,["minSeparation"]=minSeparation,["arrivals"]=new JArray(gallery.Actors.Select(a=>a.Arrivals))}.ToString());g.Duel.Receive(Packet("v22-roaming-"+(int)(Time.realtimeSinceStartup-start)),false);next+=60;}
                yield return null;
            }
            Require(minSeparation>.95f && gallery.Actors.Select((a,i)=>a.Arrivals-arrivals[i]>=4).All(v=>v),"Roaming collision or stagnation");
            report["soak"]=new JObject{["seconds"]=Time.realtimeSinceStartup-start,["maxMoving"]=maxMoving,["minSeparation"]=minSeparation,["arrivals"]=new JArray(gallery.Actors.Select(a=>a.Arrivals))};
            var performance=new JArray();
            foreach(int width in new[]{1920,2560,3840})foreach(string mode in new[]{"standard","chibi"})foreach(bool hole in new[]{true,false})
            {
                Screen.SetResolution(width,width*9/16,FullScreenMode.FullScreenWindow);g.Preferences.avatarMode=mode;g.Preferences.blackHoleEnabled=hole;g.ApplyPreferences();yield return Until(()=>!g.AvatarModePending);yield return new WaitForSecondsRealtime(1);
                Require(Screen.width==width && Screen.height==width*9/16,"Render resolution mismatch");string key=width+"-"+mode+"-bh-"+hole;
                g.Duel.Receive(Packet("v22-performance-"+key),false);yield return Photo(dir,"gallery-"+key);yield return Performance(key,performance);
                g.Stations.ReturnToArena();g.Stations.Skip();yield return Until(()=>!g.Stations.Moving);yield return Photo(dir,"arena-"+key);g.ShowHome();yield return Photo(dir,"home-"+key);
                g.Stations.Visit(ArenaOrbitalNetwork.Place.Gallery);g.Stations.Skip();yield return Until(()=>!g.Stations.Moving);
            }
            report["performance"]=performance;Require(gallery.GetComponentsInChildren<Renderer>(true).All(r=>r.sharedMaterials.All(m=>m && m.shader.isSupported)),"Unsupported material");
        }
        static IEnumerator Booths(ArenaGame g,string dir,JObject report)
        {
            yield return Until(()=>g.Desktop.Ready && !g.Desktop.Starting);g.Connection.Disconnect();
            var samples=new JArray();
            foreach(string mode in new[]{"chibi","standard"})
            {
                g.Preferences.avatarMode=mode;g.ApplyPreferences();yield return Until(()=>!g.AvatarModePending);
                foreach(var place in new[]{ArenaOrbitalNetwork.Place.Referee,ArenaOrbitalNetwork.Place.Commentary})
                {
                    g.Stations.Visit(place);g.Stations.Skip();yield return Until(()=>!g.Stations.Moving);yield return new WaitForSecondsRealtime(.3f);
                    var facility=place==ArenaOrbitalNetwork.Place.Referee?g.Stations.RefereeStation:g.Stations.CommentaryStation;
                    var actor=place==ArenaOrbitalNetwork.Place.Referee?g.Stage.Venue.Referee:facility.GetComponentInChildren<ArenaFighter>();
                    float baseHeight=.04f;
                    Require(actor && actor.Chibi==(mode=="chibi"),"Booth mode mismatch");
                    Require(Mathf.Abs(facility.InverseTransformPoint(actor.Home).y-baseHeight-(actor.Chibi?.7f:0))<.01f,"Booth height not restored");
                    var vertices=new List<Vector3>();var mesh=new Mesh();
                    foreach(var skin in actor.BodyRoot.GetComponentsInChildren<SkinnedMeshRenderer>()){skin.BakeMesh(mesh);vertices.AddRange(mesh.vertices.Select(v=>skin.transform.TransformPoint(v)));}
                    UnityEngine.Object.Destroy(mesh);
                    if(actor.Chibi){float faceHeight=vertices.Max(v=>v.y)-facility.position.y-.38f*actor.BodyRoot.localScale.x;Require(faceHeight>1.9f,"Q face hidden by console");}
                    samples.Add(new JObject{["mode"]=mode,["place"]=place.ToString(),["homeY"]=facility.InverseTransformPoint(actor.Home).y});
                    yield return Photo(dir,"booth-"+place+"-"+mode);
                }
            }
            g.Stations.ReturnToArena();g.Stations.Skip();yield return Until(()=>!g.Stations.Moving);report["booths"]=samples;
        }
        static IEnumerator Performance(string key,JArray output)
        {
            using(var calls=ProfilerRecorder.StartNew(ProfilerCategory.Render,"Draw Calls Count"))
            using(var triangles=ProfilerRecorder.StartNew(ProfilerCategory.Render,"Triangles Count"))
            {
                var frames=new List<float>();var cpu=new List<double>();var gpu=new List<double>();var timings=new FrameTiming[1];float end=Time.unscaledTime+8;long maxCalls=0,maxTriangles=0;
                while(Time.unscaledTime<end)
                {FrameTimingManager.CaptureFrameTimings();yield return null;frames.Add(Time.unscaledDeltaTime*1000);maxCalls=Math.Max(maxCalls,calls.LastValue);maxTriangles=Math.Max(maxTriangles,triangles.LastValue);if(FrameTimingManager.GetLatestTimings(1,timings)>0){if(timings[0].cpuFrameTime>0)cpu.Add(timings[0].cpuFrameTime);if(timings[0].gpuFrameTime>0)gpu.Add(timings[0].gpuFrameTime);}}
                frames.Sort();output.Add(new JObject{["configuration"]=key,["fps"]=1000/frames.Average(),["p95ms"]=frames[(int)(frames.Count*.95f)],["cpuMs"]=cpu.Count>0?cpu.Average():JValue.CreateNull(),["gpuMs"]=gpu.Count>0?gpu.Average():JValue.CreateNull(),["drawCallsMax"]=maxCalls,["trianglesMax"]=maxTriangles,["graphicsDriverAllocatedBytes"]=UnityEngine.Profiling.Profiler.GetAllocatedMemoryForGraphicsDriver(),["managedAndNativeAllocatedBytes"]=UnityEngine.Profiling.Profiler.GetTotalAllocatedMemoryLong()});
            }
        }
    }
}
