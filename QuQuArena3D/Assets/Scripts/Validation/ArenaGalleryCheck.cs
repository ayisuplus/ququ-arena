using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.AI;

namespace QuQu
{
    // Opt-in Windows acceptance. Isolated backend data, saved event fixtures, no model calls.
    [ArenaHarness("--arena-gallery-validation", true)]
    public static class ArenaGalleryCheck
    {
        static void Require(bool ok,string message){if(!ok)throw new Exception(message);}
        static IEnumerator Until(Func<bool> done){float end=Time.unscaledTime+90;while(!done()){Require(Time.unscaledTime<end,"Presentation timed out");yield return null;}}
        static IEnumerator Photo(string dir,string name){yield return new WaitForSecondsRealtime(.4f);yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,name+".png"));}
        // 门禁通道产物（与 ArenaVisualCheck 同款 JsonUtility）：报告仍写 gallery.json，这里只补门禁认识的 runtime.json。
        [Serializable] class GateResult { public bool passed; }
        public static IEnumerator Run(IArenaTestShell shell)
        {
            // Automated playback must not consume mouse/keyboard activity in other applications.
            foreach(var device in UnityEngine.InputSystem.InputSystem.devices)
                UnityEngine.InputSystem.InputSystem.DisableDevice(device);
            var args=Environment.GetCommandLineArgs();string dir=args[Array.IndexOf(args,"--arena-qa-output")+1];Directory.CreateDirectory(dir);
            var report=new JObject{["source"]="Saved competition event fixture; no model calls",["gpu"]=SystemInfo.graphicsDeviceName};
            var errors=new List<string>();Application.LogCallback log=(message,trace,type)=>{if(type==LogType.Error || type==LogType.Exception || type==LogType.Assert)errors.Add(message);};
            Application.logMessageReceived+=log;
            var stack=new Stack<IEnumerator>();stack.Push(Check(shell,dir,report));
            while(stack.Count>0)
            {
                bool more;object current=null;
                try{more=stack.Peek().MoveNext();if(more)current=stack.Peek().Current;}
                catch(Exception error){report["error"]=error.ToString();Debug.LogException(error);break;}
                if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}
                if(current is IEnumerator child)stack.Push(child);else yield return current;
            }
            Application.logMessageReceived-=log;report["runtimeErrors"]=JArray.FromObject(errors);
            report["backendPid"]=shell.Desktop.ProcessId;report["passed"]=report["error"]==null && errors.Count==0;
            File.WriteAllText(Path.Combine(dir,"gallery.json"),report.ToString());
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(new GateResult{passed=report["passed"].Value<bool>()},true));
            shell.UI.ClearGuard();Application.Quit(report["passed"].Value<bool>()?0:1);
        }
        static CompetitionPacket Packet(string id)
        {var packet=ArenaSpectatorCapture.Packet();packet.id=id;return packet;}
        static JObject Residents(ArenaGallery gallery)=>new JObject(gallery.Actors.Select(a=>new JProperty(a.Preset.Id,new JObject{
            ["arrivals"]=a.Arrivals,["recoveries"]=a.Recoveries,["metres"]=a.DistanceTravelled,["height"]=a.Height,["selected"]=a.Selected,["walking"]=a.Walking,["restSeconds"]=a.RestRemaining})));
        static IEnumerator Performance(IArenaTestShell shell,string dir,string label,JArray results)
        {
            yield return new WaitForSecondsRealtime(1);
            var samples=new List<float>();float end=Time.unscaledTime+10;
            while(Time.unscaledTime<end){yield return null;samples.Add(Time.unscaledDeltaTime*1000);}samples.Sort();
            results.Add(new JObject{["view"]=label,["width"]=Screen.width,["height"]=Screen.height,["fps"]=1000/samples.Average(),["p95ms"]=samples[(int)(samples.Count*.95f)],["seconds"]=10});
        }
        static IEnumerator Check(IArenaTestShell shell,string dir,JObject report)
        {
            yield return Until(()=>shell.Desktop.Ready);yield return new WaitForSecondsRealtime(1);
            shell.Link.Disconnect();var gallery=shell.Stations.Gallery;
            Require(!gallery.Visible && !gallery.Interior.gameObject.activeSelf,"Gallery interior is active from home");
            yield return Photo(dir,"home-1920");shell.UI.CloseModal();shell.Stage.ResetCamera();
            var packet=Packet("gallery-match-check");ArenaSpectatorCapture.Feed(shell,packet,6);yield return Until(()=>shell.Duel.Idle);
            var before=shell.Stage.CaptureView();int hits=shell.Duel.AppliedHits;
            shell.Stations.Visit(ArenaOrbitalNetwork.Place.Gallery);yield return Until(()=>!shell.Stations.Moving);
            Require(gallery.Actors.Count==6 && gallery.Actors.Select(a=>a.Preset.Id).Distinct().Count()==6,"Six unique gallery residents required");
            Require(gallery.Actors.All(a=>a.Agent.isOnNavMesh && !a.GetComponent<ArenaFighter>()),"Exhibition avatar must navigate independently");
            shell.Duel.Receive(packet,false);yield return Until(()=>shell.Finished && shell.Duel.Idle);
            Require(shell.Duel.AppliedHits>hits && shell.Stage.Display.Winner==packet.snapshot.winner,"Competition failed to settle during gallery visit");
            Require(shell.Stations.Current==ArenaOrbitalNetwork.Place.Gallery,"Competition stole the gallery camera");
            report["matchContinuedAndSettled"]=true;
            yield return Photo(dir,"gallery-1920");
            foreach(var actor in gallery.Actors)
            {
                gallery.View.Select(actor);yield return new WaitForSecondsRealtime(1.1f);var stopped=actor.transform.position;float clock=actor.Clock;
                yield return new WaitForSecondsRealtime(.5f);Require(Vector3.Distance(stopped,actor.transform.position)<.03f,"Selected resident moved: "+actor.Preset.Id);
                Require(actor.Clock>clock,"Selected resident idle animation froze");
                yield return Photo(dir,"portrait-"+actor.Preset.Id);
                gallery.View.Orbit(0,0,4.1f);yield return Photo(dir,"face-"+actor.Preset.Id);
                Require(Vector3.Distance(shell.Stage.View.transform.position,actor.FaceFocus)>.6f,"Close-up camera is inside the head");
                gallery.View.Orbit(50,0,0);yield return Photo(dir,"face-side-"+actor.Preset.Id);
                gallery.View.Orbit(-50,0,-4.1f);
                for(int angle=0;angle<4;angle++)
                {
                    gallery.View.Orbit(90,angle==0?80:angle==1?-140:0,angle==2?8:angle==3?-20:0);yield return new WaitForSecondsRealtime(.18f);
                    Require(!Physics.CheckSphere(shell.Stage.View.transform.position,.12f,1<<28,QueryTriggerInteraction.Ignore),"Inspection camera entered gallery geometry");
                }
                shell.Escape();yield return null;Require(gallery.View.Selected==null && shell.Stations.Current==ArenaOrbitalNetwork.Place.Gallery,"Esc did not return to gallery overview");
            }
            report["sixPortraitsOrbitZoomEsc"]=true;
            shell.Preferences.motion=0;shell.ApplyPreferences();yield return new WaitForSecondsRealtime(.1f);
            var positions=gallery.Actors.Select(a=>a.transform.position).ToArray();var clocks=gallery.Actors.Select(a=>a.Clock).ToArray();
            yield return new WaitForSecondsRealtime(1);
            report["frozenResidents"]=new JArray(gallery.Actors.Select((a,i)=>new JObject{["id"]=a.Preset.Id,["distance"]=Vector3.Distance(a.transform.position,positions[i]),["clockDelta"]=a.Clock-clocks[i]}));
            Require(gallery.Actors.Select((a,i)=>Vector3.Distance(a.transform.position,positions[i])<.001f && a.Clock==clocks[i]).All(x=>x),"Reduced motion moved residents");
            yield return Photo(dir,"motion-off");shell.Preferences.motion=1;shell.ApplyPreferences();report["reducedMotion"]=true;
            for(int attempt=0;attempt<3;attempt++)
            {
                positions=gallery.Actors.Select(a=>a.transform.position).ToArray();clocks=gallery.Actors.Select(a=>a.Clock).ToArray();
                shell.Escape();yield return null;
                Require(shell.Stations.Current==ArenaOrbitalNetwork.Place.Arena && !gallery.Visible,"Esc did not leave facility");
                // v22 接驳运输变更后原断言过期（停留在 v20 的 Esc 瞬时回场时代）：Esc 现为 4~7s 载具行程
                // （TransportLongHop 4.35s / SkyLift 6.66s），行程终了才 RestoreView（ArenaOrbitalNetwork.Travel 完成回调落位）；
                // 行程中第二 Esc 走跳过路径（ArenaGame.Escape ① 瞬态演出→跳过），跳过同样是行程终了才落位。
                // 故等行程真正终了（Moving=false，涵盖自然终了与跳过提前终了两种结束方式）再验复位；
                // 复位精度 2cm/0.05° 不放松，也不调用 Skip() 绕过行程。
                yield return Until(()=>!shell.Stations.Moving);yield return null;
                Require(Vector3.Distance(shell.Stage.View.transform.position,before.position)<.02f && Quaternion.Angle(shell.Stage.View.transform.rotation,before.rotation)<.05f,"Arena camera not restored");
                yield return new WaitForSecondsRealtime(.5f);
                Require(gallery.Actors.Select((a,i)=>a.transform.position==positions[i] && a.Clock==clocks[i]).All(x=>x),"Hidden gallery kept simulating");
                shell.Stations.Visit(ArenaOrbitalNetwork.Place.Gallery);shell.Stations.Visit(ArenaOrbitalNetwork.Place.Gallery);yield return Until(()=>!shell.Stations.Moving);
                Require(gallery.Actors.Count==6 && gallery.Actors.Select((a,i)=>Vector3.Distance(a.transform.position,positions[i])<.1f).All(x=>x),"Reentry changed residents or their positions");
            }
            report["cameraRestoreSkipReentryFreeze"]=true;
            gallery.View.Overview();
            var video=shell.AddComponent<ArenaVideoCapture>();shell.Run(video.Capture(Path.Combine(dir,"roaming-video")));
            yield return new WaitForSecondsRealtime(12);gallery.View.Select(gallery.Actors[1]);yield return new WaitForSecondsRealtime(2);
            for(float t=0;t<5;t+=Time.unscaledDeltaTime){gallery.View.Orbit(Time.unscaledDeltaTime*24,0,0);yield return null;}
            video.Recording=false;yield return Until(()=>video.Finished);Require(video.Error==null,video.Error);gallery.View.Overview();
            float start=Time.realtimeSinceStartup,nextProgress=start;float minSeparation=float.MaxValue;int maxWalking=0;var checkpoints=new JArray();
            var arrivals=gallery.Actors.Select(a=>a.Arrivals).ToArray();var metres=gallery.Actors.Select(a=>a.DistanceTravelled).ToArray();
            while(Time.realtimeSinceStartup-start<600)
            {
                maxWalking=Math.Max(maxWalking,gallery.MovingCount);Require(maxWalking<=3,"More than three residents walking");
                for(int i=0;i<gallery.Actors.Count;i++)
                {
                    var actor=gallery.Actors[i];var local=gallery.transform.InverseTransformPoint(actor.transform.position);
                    Require(actor.Agent.isOnNavMesh && Mathf.Abs(local.x)<12 && Mathf.Abs(local.z)<8 && Mathf.Abs(local.y)<.2f,"Resident escaped navigation floor");
                    Require(!Physics.CheckCapsule(actor.transform.position+Vector3.up*.5f,actor.transform.position+Vector3.up*1.5f,.3f,1<<28,QueryTriggerInteraction.Ignore),"Resident intersected console or wall");
                    var bones=actor.GetComponentsInChildren<Transform>();float headY=bones.First(b=>b.name=="Head").position.y;
                    Require(bones.Where(b=>b.name=="LeftHand" || b.name=="RightHand").All(b=>b.position.y<headY),"Arm pose drifted above head: "+actor.Preset.Id);
                    for(int j=i+1;j<gallery.Actors.Count;j++)minSeparation=Mathf.Min(minSeparation,Vector3.Distance(actor.transform.position,gallery.Actors[j].transform.position));
                }
                if(Time.realtimeSinceStartup>=nextProgress)
                {
                    checkpoints.Add(new JObject{["elapsed"]=Time.realtimeSinceStartup-start,["residents"]=Residents(gallery)});
                    File.WriteAllText(Path.Combine(dir,"soak-progress.json"),new JObject{["elapsed"]=Time.realtimeSinceStartup-start,["maximumWalking"]=maxWalking,["minimumSeparation"]=minSeparation,["checkpoints"]=checkpoints}.ToString());nextProgress+=30;
                }
                yield return null;
            }
            Require(minSeparation>.95f,"Residents overlapped during roaming");
            Require(gallery.Actors.Select((a,i)=>a.Arrivals-arrivals[i]>=4 && a.DistanceTravelled-metres[i]>20).All(x=>x),"A resident failed to keep roaming");
            report["soak"]=new JObject{["seconds"]=Time.realtimeSinceStartup-start,["maximumWalking"]=maxWalking,["minimumSeparation"]=minSeparation,["residents"]=Residents(gallery)};
            yield return Photo(dir,"gallery-after-ten-minutes");
            var performance=new JArray();
            foreach(int width in new[]{1920,2560,3840})
            {
                Screen.SetResolution(width,width*9/16,FullScreenMode.FullScreenWindow);yield return new WaitForSecondsRealtime(1);
                // 工具现实：Screen.SetResolution 在编辑器里是 no-op，本循环是 player-build-only 检查。
                // 编辑器把实际渲染尺寸如实写入报告不断言；player 保留原硬断言。PNG 文件名保留惯例档名。
                if(Application.isEditor)report["renderSize-"+width]=Screen.width+"x"+Screen.height;else Require(Screen.width==width && Screen.height==width*9/16,"Unexpected render size");
                packet=Packet("gallery-performance-"+width);shell.Duel.Receive(packet,false);
                yield return Photo(dir,"gallery-"+width);yield return Performance(shell,dir,"gallery + saved duel playback",performance);
                gallery.View.Select(gallery.Actors[2]);gallery.View.Orbit(0,0,4.1f);yield return Photo(dir,"inspection-"+width);yield return Performance(shell,dir,"inspection",performance);
                gallery.View.Overview();shell.Stations.ReturnToArena();yield return Photo(dir,"arena-"+width);yield return Performance(shell,dir,"arena",performance);
                shell.ShowHome();yield return Photo(dir,"home-"+width);
                shell.Stations.Visit(ArenaOrbitalNetwork.Place.Gallery);shell.Stations.Skip();yield return Until(()=>!shell.Stations.Moving);
            }
            report["performance"]=performance;
            Require(gallery.GetComponentsInChildren<Renderer>(true).All(r=>r.sharedMaterials.All(m=>m && m.shader.isSupported)),"Unsupported gallery shader");
            report["materialsSupported"]=true;
            shell.Stations.ReturnToArena();shell.ShowHome();
        }
    }
}
