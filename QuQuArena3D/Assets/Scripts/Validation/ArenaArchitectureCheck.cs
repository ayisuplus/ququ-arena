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
    // Actual player renders and timing samples; isolated data and saved match fixtures only.
    [ArenaHarness("--arena-architecture-validation", true)]
    public static class ArenaArchitectureCheck
    {
        static void Require(bool ok,string message){if(!ok)throw new Exception(message);}
        // 门禁通道产物（与 ArenaVisualCheck 同款 JsonUtility）：报告仍写 architecture.json，这里只补门禁认识的 runtime.json。
        [Serializable] class GateResult { public bool passed; }
        static IEnumerator Until(Func<bool> done){float end=Time.unscaledTime+90;while(!done()){Require(Time.unscaledTime<end,"Timed out");yield return null;}}
        static IEnumerator Photo(string directory,string name)
        {yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(directory,name+".png"));yield return new WaitForSecondsRealtime(.6f);}
        public static IEnumerator Run(IArenaTestShell shell)
        {
            foreach(var device in UnityEngine.InputSystem.InputSystem.devices)UnityEngine.InputSystem.InputSystem.DisableDevice(device);
            var args=Environment.GetCommandLineArgs();string directory=args[Array.IndexOf(args,"--arena-qa-output")+1];Directory.CreateDirectory(directory);
            var report=new JObject{["evidence"]="Windows player, isolated backend, saved fixtures; no paid model calls",["gpu"]=SystemInfo.graphicsDeviceName};
            var errors=new List<string>();Application.LogCallback log=(m,t,k)=>{if(k==LogType.Error || k==LogType.Exception || k==LogType.Assert)errors.Add(m);};Application.logMessageReceived+=log;
            var stack=new Stack<IEnumerator>();stack.Push(Check(shell,directory,report));
            while(stack.Count>0)
            {
                bool more;object item=null;
                try{more=stack.Peek().MoveNext();if(more)item=stack.Peek().Current;}catch(Exception e){report["error"]=e.ToString();Debug.LogException(e);break;}
                if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}if(item is IEnumerator child)stack.Push(child);else yield return item;
            }
            while(stack.Count>0)(stack.Pop() as IDisposable)?.Dispose();
            Application.logMessageReceived-=log;report["runtimeErrors"]=JArray.FromObject(errors);report["backendPid"]=shell.Desktop.ProcessId;report["passed"]=report["error"]==null && errors.Count==0;
            File.WriteAllText(Path.Combine(directory,"architecture.json"),report.ToString());
            File.WriteAllText(Path.Combine(directory,"runtime.json"),JsonUtility.ToJson(new GateResult{passed=report["passed"].Value<bool>()},true));
            shell.UI.ClearGuard();shell.ShowHome();Application.Quit(report["passed"].Value<bool>()?0:1);
        }
        static IEnumerator Check(IArenaTestShell shell,string directory,JObject report)
        {
            yield return Until(()=>shell.Desktop.Ready && !shell.Desktop.Starting);shell.Link.Disconnect();
            shell.UI.CloseModal();shell.Stage.ResetCamera();
            yield return Entrance(shell,directory,report);
            yield return Activity(shell,directory,report);
            yield return null; // Let new avatar bounds and roster tracking settle before taking the departure snapshot.
            var lifts=shell.Stage.Lifts;
            Require(lifts.Platforms.Select((p,i)=>Vector3.Distance(p.position,ArenaEntranceLifts.Landing(i,0))<.001f).All(x=>x),"Lateral lift alignment");
            var layoutView=shell.Stage.CaptureView();shell.Stage.CameraDirected=true;shell.UI.Root.gameObject.SetActive(false);
            try
            {
                shell.Stage.View.transform.position=new Vector3(0,21,-.01f);shell.Stage.View.transform.LookAt(Vector3.zero);shell.Stage.View.fieldOfView=47;
                yield return Photo(directory,"layout-top");
                shell.Stage.View.transform.position=new Vector3(-.6f,3.3f,-6.5f);shell.Stage.View.transform.LookAt(new Vector3(0,1.2f,0));shell.Stage.View.fieldOfView=42;
                yield return Photo(directory,"layout-stance");
            }
            finally{shell.UI.Root.gameObject.SetActive(true);shell.Stage.CameraDirected=false;shell.Stage.RestoreView(layoutView);}
            report["lateralLifts"]=true;
            // Entrance changes avatar proportions and camera framing; compare with the actual departure view.
            var original=shell.Stage.CaptureView();
            var transit=shell.AddComponent<ArenaVideoCapture>();shell.Run(transit.Capture(Path.Combine(directory,"transport-video")));
            var trips=new JArray();
            foreach(var destination in new[]{ArenaOrbitalNetwork.Place.Lab,ArenaOrbitalNetwork.Place.Referee,ArenaOrbitalNetwork.Place.Commentary,ArenaOrbitalNetwork.Place.Gallery,ArenaOrbitalNetwork.Place.Arena})
            {
                var origin=shell.Stations.Current;float start=Time.unscaledTime;
                if(destination==ArenaOrbitalNetwork.Place.Arena)shell.Stations.ReturnToArena();else shell.Stations.Visit(destination);
                yield return Until(()=>!shell.Stations.Moving);
                Require(!shell.Stations.Transport.CabinActive && shell.Stations.Current==destination,"Transport arrival mismatch");
                float duration=Time.unscaledTime-start;
                // 同族边界随 v27 SkyLift 过期（与 ArenaBoothCheck 同因）：涉 Commentary 的行程走竖井
                // （ArenaStationTransport upperRide 判据 = from/to 涉 Commentary），lift-v27 lift.json 实测
                // 6.65s×4 程（movingFrames 154）+门拍壁钟≈7.3s，顶破 6.5 旧上界；旧实测 2.03~5.08s
                // （layout-v24/facilities-05、structure-v25/facilities-01 travel 数组，当时全绿）说明
                // 1.7~6.5 是捷径时代口径。上限 6.5→8 对齐实测（与 BoothCheck 的 4~8 同族同界），
                // 下限 1.7 不动：瞬移/跳过守卫的原意保留。
                Require(duration>1.7f && duration<8,"Transport duration out of range");
                trips.Add(new JObject{["from"]=origin.ToString(),["to"]=destination.ToString(),["seconds"]=duration});
                yield return new WaitForSecondsRealtime(.3f);
            }
            transit.Recording=false;yield return Until(()=>transit.Finished);Require(transit.Error==null,transit.Error);
            float positionError=Vector3.Distance(original.position,shell.Stage.View.transform.position),rotationError=Quaternion.Angle(original.rotation,shell.Stage.View.transform.rotation);
            report["cameraRestore"]=new JObject{["positionError"]=positionError,["rotationError"]=rotationError,["before"]=original.position.ToString("F5"),["after"]=shell.Stage.View.transform.position.ToString("F5")};
            Require(positionError<.03f && rotationError<.1f,"Transport camera restore: "+report["cameraRestore"]);
            shell.Stations.Visit(ArenaOrbitalNetwork.Place.Lab);shell.Escape();yield return Until(()=>!shell.Stations.Moving);
            Require(shell.Stations.Current==ArenaOrbitalNetwork.Place.Lab,"Transport Esc skip");shell.Stations.ReturnToArena();shell.Stations.Skip();yield return Until(()=>!shell.Stations.Moving);
            shell.Preferences.motion=0;shell.ApplyPreferences();float cut=Time.unscaledTime;shell.Stations.Visit(ArenaOrbitalNetwork.Place.Lab);yield return Until(()=>!shell.Stations.Moving);
            Require(Time.unscaledTime-cut<1 && !shell.Stations.Transport.CabinActive,"Transport static fade");shell.Stations.ReturnToArena();yield return Until(()=>!shell.Stations.Moving);shell.Preferences.motion=1;shell.ApplyPreferences();
            report["travel"]=trips;report["travelSkipAndStatic"]=true;
            var samples=new JArray();var places=new[]{ArenaOrbitalNetwork.Place.Lab,ArenaOrbitalNetwork.Place.Referee,ArenaOrbitalNetwork.Place.Commentary,ArenaOrbitalNetwork.Place.Gallery};
            var packet=ArenaSpectatorCapture.Packet();packet.id="v23-architecture-layout";var ids=packet.snapshot.duels[0].players;
            shell.Preferences.Avatar(ids[0],0).presetId="chatgpt";shell.Preferences.Avatar(ids[1],1).presetId="claude";shell.Duel.Receive(packet,true);
            // Editor Game View cannot change resolution; capture its real size once.
            foreach(int width in Application.isEditor?new[]{Screen.width}:new[]{1920,2560,3840})
            {
                if(!Application.isEditor)Screen.SetResolution(width,width*9/16,width==3840?FullScreenMode.ExclusiveFullScreen:FullScreenMode.Windowed);
                yield return new WaitForSecondsRealtime(1);
                report["renderSize-"+width]=Screen.width+"x"+Screen.height;
                if(!Application.isEditor)Require(Screen.width==width && Screen.height==width*9/16,"Resolution mismatch");
                string shotSize=Application.isEditor?"editor-"+Screen.width+"x"+Screen.height:width.ToString();
                shell.ShowHome();yield return new WaitForSecondsRealtime(.4f);yield return Photo(directory,"home-"+shotSize);yield return Performance(shotSize+"-home",samples);
                shell.UI.CloseModal();shell.Stage.ResetCamera();yield return Photo(directory,"arena-"+shotSize);yield return Performance(shotSize+"-arena",samples);
                foreach(var place in places)
                {
                    shell.Stations.Visit(place);shell.Stations.Skip();yield return Until(()=>!shell.Stations.Moving);yield return new WaitForSecondsRealtime(.4f);
                    Require(shell.Stations.LabInteriorActive==(place==ArenaOrbitalNetwork.Place.Lab),"Lab effects active outside room");
                    Require(shell.Stations.BroadcastInteriorActive==(place==ArenaOrbitalNetwork.Place.Referee || place==ArenaOrbitalNetwork.Place.Commentary),"Booth effects active outside room");
                    Require(shell.Stations.Gallery.Visible==(place==ArenaOrbitalNetwork.Place.Gallery),"Gallery effects active outside room");
                    foreach(var display in UnityEngine.Object.FindObjectsByType<ArenaInstrumentDisplay>(FindObjectsSortMode.None))Require(display.GetComponent<Renderer>().sharedMaterial.shader.isSupported,"Unsupported instrument shader");
                    yield return Photo(directory,place+"-"+shotSize);yield return Performance(shotSize+"-"+place,samples);
                }
                var actor=shell.Stations.Gallery.Actors[0];shell.Stations.Gallery.View.Select(actor);yield return new WaitForSecondsRealtime(1);
                yield return Photo(directory,"portrait-"+shotSize);shell.Stations.Gallery.View.Overview();
            }
            var gallery=shell.Stations.Gallery;
            Require(gallery.Actors.All(a=>a.Agent.isOnNavMesh),"Resident not on v23 navigation");
            shell.Preferences.motion=0;shell.ApplyPreferences();yield return null;
            var clock=shell.Stage.LightShow.Clock;var positions=gallery.Actors.Select(a=>a.transform.position).ToArray();
            yield return new WaitForSecondsRealtime(.5f);Require(clock==shell.Stage.LightShow.Clock && gallery.Actors.Select((a,i)=>a.transform.position==positions[i]).All(x=>x),"Decorative motion-off regressed");
            shell.Preferences.motion=1;shell.Preferences.blackHoleEnabled=false;shell.ApplyPreferences();yield return new WaitForSecondsRealtime(.5f);
            Require(!shell.Stage.Singularity.gameObject.activeInHierarchy,"Black hole off");yield return Photo(directory,"gallery-4k-no-blackhole");
            shell.ShowHome();yield return new WaitForSecondsRealtime(.4f);yield return Photo(directory,"home-4k-no-blackhole");
            shell.Preferences.blackHoleEnabled=true;shell.ApplyPreferences();shell.UI.CloseModal();shell.Stations.Visit(ArenaOrbitalNetwork.Place.Lab);shell.Stations.Skip();yield return Until(()=>!shell.Stations.Moving);
            var video=shell.AddComponent<ArenaVideoCapture>();shell.Run(video.Capture(Path.Combine(directory,"flagship-video")));yield return new WaitForSecondsRealtime(3);
            shell.Stations.Visit(ArenaOrbitalNetwork.Place.Commentary);yield return Until(()=>!shell.Stations.Moving);yield return new WaitForSecondsRealtime(3);
            shell.Stations.Visit(ArenaOrbitalNetwork.Place.Gallery);yield return Until(()=>!shell.Stations.Moving);yield return new WaitForSecondsRealtime(5);video.Recording=false;yield return Until(()=>video.Finished);Require(video.Error==null,video.Error);
            shell.Stations.ReturnToArena();shell.Stations.Skip();yield return Until(()=>!shell.Stations.Moving);
            Require(!shell.Stations.Gallery.Interior.gameObject.activeSelf && shell.Stations.Gallery.Interior.parent.Find("DistantInterior").gameObject.activeSelf,"Distant gallery representation not restored");
            report["performance"]=samples;report["inactiveInteriors"]=true;report["motionOff"]=true;report["blackHoleToggle"]=true;report["threeResolutions"]=true;
        }
        static IEnumerator Activity(IArenaTestShell shell,string directory,JObject report)
        {
            var stage=shell.Stage;var instruments=stage.LightShow;var view=stage.CaptureView();
            bool directed=stage.CameraDirected,uiVisible=shell.UI.Root.gameObject.activeSelf;float motion=shell.Preferences.motion;
            ArenaVideoCapture video=null;
            void Pose(Vector3 position,Vector3 target,float fov)
            {stage.View.transform.position=position;stage.View.transform.LookAt(target);stage.View.fieldOfView=fov;}
            try
            {
                shell.Preferences.motion=1;shell.ApplyPreferences();stage.CameraDirected=true;stage.Flight.SetActive(false);shell.UI.Root.gameObject.SetActive(false);
                Require(instruments.SurveyMounts.Count==4 && instruments.SurveyHeads.Count==4,"Expected four independently mounted survey instruments");
                Require(instruments.InspectionCarriage && instruments.InspectionProbe,"Corridor inspection hardware missing");
                Pose(new Vector3(10,8,18),new Vector3(0,1,7),65);yield return Photo(directory,"activity-overview");
                Pose(new Vector3(8.2f,5.1f,18.5f),new Vector3(.4f,1.1f,10.3f),57);
                yield return new WaitForEndOfFrame();
                var initialYaw=instruments.SurveyMounts.Select(t=>t.localRotation).ToArray();
                var initialPitch=instruments.SurveyHeads.Select(t=>t.localRotation).ToArray();var yawChange=new float[4];var pitchChange=new float[4];
                float minZ=float.PositiveInfinity,maxZ=float.NegativeInfinity,minProbe=float.PositiveInfinity,maxProbe=float.NegativeInfinity;
                bool docked=false,moving=false;float start=Time.unscaledTime,clockStart=instruments.Clock;
                video=shell.AddComponent<ArenaVideoCapture>();shell.Run(video.Capture(Path.Combine(directory,"activity-video")));
                while(Time.unscaledTime-start<25.5f)
                {
                    float z=instruments.InspectionCarriage.position.z,probe=instruments.InspectionProbe.localPosition.x;
                    minZ=Mathf.Min(minZ,z);maxZ=Mathf.Max(maxZ,z);minProbe=Mathf.Min(minProbe,probe);maxProbe=Mathf.Max(maxProbe,probe);
                    docked|=instruments.InspectionDocked;moving|=!instruments.InspectionDocked;
                    for(int i=0;i<4;i++)
                    {
                        yawChange[i]=Mathf.Max(yawChange[i],Quaternion.Angle(initialYaw[i],instruments.SurveyMounts[i].localRotation));
                        pitchChange[i]=Mathf.Max(pitchChange[i],Quaternion.Angle(initialPitch[i],instruments.SurveyHeads[i].localRotation));
                    }
                    yield return null;
                }
                float clockSpan=instruments.Clock-clockStart;video.Recording=false;yield return Until(()=>video.Finished);Require(video.Error==null,video.Error);
                var activity=new JObject{["seconds"]=video.timing.duration,["frames"]=video.timing.frames,["clockSeconds"]=clockSpan,["carriageWorldMinZ"]=minZ,["carriageWorldMaxZ"]=maxZ,
                    ["carriageTravel"]=maxZ-minZ,["probeStroke"]=maxProbe-minProbe,["dockedObserved"]=docked,["movingObserved"]=moving,["surveyYawChangeDegrees"]=JArray.FromObject(yawChange),["surveyPitchChangeDegrees"]=JArray.FromObject(pitchChange)};
                report["mechanicalActivity"]=activity;
                Require(video.timing.duration>=25 && video.timing.frames>0 && clockSpan>=25,"Activity recording did not cover a complete inspection cycle");
                Require(maxZ-minZ>=5.8f && docked && moving && maxProbe-minProbe>.15f,"Inspection travel, docking or probe cycle incomplete");
                Require(yawChange.All(a=>a>15) && pitchChange.All(a=>a>3),"Survey instruments did not independently pan and tilt");
                var mechanisms=instruments.SurveyMounts.Concat(instruments.SurveyHeads).Concat(new[]{instruments.InspectionCarriage,instruments.InspectionProbe}).ToArray();
                shell.Preferences.motion=0;shell.ApplyPreferences();yield return null;
                float frozenClock=instruments.Clock;var frozenPositions=mechanisms.Select(t=>t.localPosition).ToArray();var frozenRotations=mechanisms.Select(t=>t.localRotation).ToArray();
                yield return new WaitForSecondsRealtime(.8f);
                float positionDrift=mechanisms.Select((t,i)=>Vector3.Distance(t.localPosition,frozenPositions[i])).Max();
                float rotationDrift=mechanisms.Select((t,i)=>Quaternion.Angle(t.localRotation,frozenRotations[i])).Max();
                activity["staticPositionDrift"]=positionDrift;activity["staticRotationDrift"]=rotationDrift;activity["staticClockDrift"]=instruments.Clock-frozenClock;
                Require(instruments.Clock==frozenClock && positionDrift<.00001f && rotationDrift<.001f,"Mechanical motion-off did not freeze the clock and transforms");
                shell.Preferences.motion=1;shell.ApplyPreferences();yield return null;
                float advance=instruments.Clock-frozenClock;
                float carriageStep=Vector3.Distance(instruments.InspectionCarriage.localPosition,frozenPositions[8]);
                float probeStep=Vector3.Distance(instruments.InspectionProbe.localPosition,frozenPositions[9]);
                float yawStep=Enumerable.Range(0,4).Max(i=>Quaternion.Angle(instruments.SurveyMounts[i].localRotation,frozenRotations[i]));
                float pitchStep=Enumerable.Range(0,4).Max(i=>Quaternion.Angle(instruments.SurveyHeads[i].localRotation,frozenRotations[i+4]));
                activity["resume"]=new JObject{["clockStep"]=advance,["frameSeconds"]=Time.unscaledDeltaTime,["carriageStep"]=carriageStep,["probeStep"]=probeStep,["yawStepDegrees"]=yawStep,["pitchStepDegrees"]=pitchStep};
                Require(advance>0 && advance<=Time.unscaledDeltaTime*1.5f+.005f,"Presentation clock jumped after resuming");
                Require(carriageStep<=advance*1.01f+.002f && probeStep<=advance*.19f+.002f && yawStep<=advance*12.1f+.05f && pitchStep<=advance*3.3f+.05f,"Mechanical pose jumped after resuming");
                var shots=new[]{
                    new{name="entry-outside",position=new Vector3(3.9f,2.5f,12.1f),target=new Vector3(0,1.3f,7.3f),fov=56f},
                    new{name="entry-inside",position=new Vector3(-2.7f,2.5f,4.8f),target=new Vector3(0,1.3f,10),fov=60f},
                    new{name="lab-entry",position=new Vector3(-20.7f,2.35f,18.4f),target=new Vector3(-27.5f,1.5f,15.8f),fov=56f},
                    new{name="referee-entry",position=new Vector3(31.8f,2.35f,17.4f),target=new Vector3(30.9f,1.5f,11.6f),fov=58f},
                    new{name="commentary-entry",position=new Vector3(40,2.35f,17.4f),target=new Vector3(39.1f,1.5f,11.6f),fov=58f}};
                foreach(var shot in shots){Pose(shot.position,shot.target,shot.fov);yield return Photo(directory,shot.name);}
                activity["staticAndResume"]=true;activity["doorwayPhotos"]=JArray.FromObject(shots.Select(s=>s.name));
            }
            finally
            {
                if(video)video.Recording=false;
                shell.Preferences.motion=motion;shell.ApplyPreferences();shell.UI.Root.gameObject.SetActive(uiVisible);
                stage.RestoreView(view);stage.CameraDirected=directed;
            }
        }
        static IEnumerator Entrance(IArenaTestShell shell,string directory,JObject report)
        {
            var lifts=shell.Stage.Lifts;int before=lifts.EntranceCount;var rows=new JArray();
            var video=shell.AddComponent<ArenaVideoCapture>();shell.Run(video.Capture(Path.Combine(directory,"entrance-video")));
            foreach(string mode in new[]{"standard","chibi"})
            {
                shell.Preferences.avatarMode=mode;shell.ApplyPreferences();yield return Until(()=>!shell.AvatarModePending);
                shell.SetRoster(new[]{new ModelInfo{id="lift:chatgpt",name="ChatGPT"},new ModelInfo{id="lift:claude",name="Claude"}});
                shell.Preferences.Avatar("lift:chatgpt",0).presetId="chatgpt";shell.Preferences.Avatar("lift:claude",1).presetId="claude";shell.ApplyPreferences();yield return null;
                var camera=shell.Stage.CaptureView();var health=shell.Stage.Fighters.Select(f=>f.State.Health).ToArray();
                shell.Run(lifts.Present(shell));yield return new WaitForSecondsRealtime(1.4f);
                Require(lifts.Active && lifts.Platforms.All(p=>p.position.y<-.1f && p.position.y>-23),"Twin lift did not rise");
                Require(shell.Stage.Fighters.All(f=>f.Busy),"Avatar presentation guard missing");
                yield return Photo(directory,"entrance-"+mode);
                yield return Until(()=>!lifts.Active);
                Require(shell.Stage.Fighters.All(f=>Vector3.Distance(f.transform.position,f.Home)<.001f && !f.Busy),"Fighter failed to leave lift");
                Require(lifts.Platforms.All(p=>Mathf.Abs(p.position.y)<.001f),"Floor not flush after entry");
                Require(Vector3.Distance(camera.position,shell.Stage.View.transform.position)<.03f,"Entry camera restore");
                Require(shell.Stage.Fighters.Select((f,i)=>f.State.Health==health[i]).All(x=>x),"Entry changed competition health");
                rows.Add(mode);
            }
            video.Recording=false;yield return Until(()=>video.Finished);Require(video.Error==null,video.Error);
            shell.Run(lifts.Present(shell));yield return new WaitForSecondsRealtime(.5f);shell.Escape();yield return Until(()=>!lifts.Active);
            Require(lifts.Platforms.All(p=>p.position.y==0),"Esc left an open arena floor");
            shell.Run(lifts.Present(shell));yield return new WaitForSecondsRealtime(.4f);shell.ShowHome();yield return null;
            Require(!lifts.Active && shell.Stations.Current==ArenaOrbitalNetwork.Place.Home && !shell.Stage.Fighters.Any(f=>f.Busy),"Home interrupted entry incorrectly");
            shell.UI.CloseModal();shell.Preferences.motion=0;shell.ApplyPreferences();int still=lifts.EntranceCount;
            yield return lifts.Present(shell);Require(lifts.EntranceCount==still,"Static mode animated entrance");
            shell.Preferences.motion=1;shell.Preferences.avatarMode="standard";shell.ApplyPreferences();yield return Until(()=>!shell.AvatarModePending);
            report["entrance"]=new JObject{["modes"]=rows,["count"]=lifts.EntranceCount-before,["escape"]=true,["homeInterrupt"]=true,["staticMode"]=true,["floorFlush"]=true,["healthUnchanged"]=true};
        }
        static IEnumerator Performance(string key,JArray output)
        {
            using(var calls=ProfilerRecorder.StartNew(ProfilerCategory.Render,"Draw Calls Count"))
            using(var tris=ProfilerRecorder.StartNew(ProfilerCategory.Render,"Triangles Count"))
            {
                var frames=new List<float>();var cpu=new List<double>();var gpu=new List<double>();var timing=new FrameTiming[1];float end=Time.unscaledTime+6;long maxCalls=0,maxTris=0;
                while(Time.unscaledTime<end)
                {
                    FrameTimingManager.CaptureFrameTimings();yield return null;frames.Add(Time.unscaledDeltaTime*1000);maxCalls=Math.Max(maxCalls,calls.LastValue);maxTris=Math.Max(maxTris,tris.LastValue);
                    if(FrameTimingManager.GetLatestTimings(1,timing)>0){if(timing[0].cpuFrameTime>0)cpu.Add(timing[0].cpuFrameTime);if(timing[0].gpuFrameTime>0)gpu.Add(timing[0].gpuFrameTime);}
                }
                frames.Sort();output.Add(new JObject{["view"]=key,["fps"]=1000/frames.Average(),["p95ms"]=frames[(int)(frames.Count*.95f)],["cpuMs"]=cpu.Count>0?cpu.Average():JValue.CreateNull(),["gpuMs"]=gpu.Count>0?gpu.Average():JValue.CreateNull(),["drawCallsMax"]=maxCalls,["trianglesMax"]=maxTris});
            }
        }
    }
}
