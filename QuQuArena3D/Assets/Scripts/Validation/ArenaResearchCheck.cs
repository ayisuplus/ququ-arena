using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace QuQu
{
    // Opt-in rendered review; saved competition packets, isolated backend, no model calls.
    [ArenaHarness("--arena-research-validation", true)]
    public static class ArenaResearchCheck
    {
        static void Require(bool ok,string message){if(!ok)throw new Exception(message);}
        static IEnumerator Until(Func<bool> done){float end=Time.unscaledTime+60;while(!done()){Require(Time.unscaledTime<end,"Presentation timed out");yield return null;}}
        static IEnumerator Photo(string dir,string name){yield return new WaitForSecondsRealtime(.35f);yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,name+".png"));}
        // 门禁通道产物（与 ArenaVisualCheck 同款 JsonUtility）：报告仍写 research.json，这里只补门禁认识的 runtime.json。
        [Serializable] class GateResult { public bool passed; }
        public static IEnumerator Run(IArenaTestShell shell)
        {
            var args=Environment.GetCommandLineArgs();string dir=args[Array.IndexOf(args,"--arena-qa-output")+1];Directory.CreateDirectory(dir);
            var report=new JObject{["source"]="Saved competition event fixture; no model calls",["gpu"]=SystemInfo.graphicsDeviceName};
            var stack=new Stack<IEnumerator>();stack.Push(Check(shell,dir,report));
            while(stack.Count>0)
            {
                bool more;object current=null;
                try{more=stack.Peek().MoveNext();if(more)current=stack.Peek().Current;}
                catch(Exception error){report["error"]=error.ToString();Debug.LogException(error);break;}
                if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}
                if(current is IEnumerator child)stack.Push(child);else yield return current;
            }
            report["passed"]=report["error"]==null;File.WriteAllText(Path.Combine(dir,"research.json"),report.ToString());
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(new GateResult{passed=report["passed"].Value<bool>()},true));
            shell.UI.ClearGuard();Application.Quit(report["passed"].Value<bool>()?0:1);
        }
        static IEnumerator Check(IArenaTestShell shell,string dir,JObject report)
        {
            yield return Until(()=>shell.Desktop.Ready);yield return Photo(dir,"home");shell.UI.CloseModal();shell.Link.Disconnect();
            var packet=ArenaSpectatorCapture.Packet();ArenaSpectatorCapture.Feed(shell,packet,6);yield return Until(()=>shell.Duel.Idle);
            var instruments=shell.Stage.LightShow;
            Require(instruments.BeamCount==0 && instruments.GetComponentsInChildren<Light>().Length==0,"Moving stage lights remain");
            Require(instruments.HologramCount==2,"Missing observation displays");
            var renderers=instruments.GetComponentsInChildren<Renderer>();
            Require(renderers.All(r=>r.sharedMaterial && r.sharedMaterial.shader.isSupported),"Missing or unsupported instrument shader");
            Require(!shell.Stage.GetComponentsInChildren<Renderer>().Any(r=>r.sharedMaterial && (r.sharedMaterial.shader.name=="QuQu/Spectrum Trim" || r.sharedMaterial.shader.name=="QuQu/Show Beam")),"Rainbow lighting material remains active");
            float clock=instruments.Clock;yield return new WaitForSecondsRealtime(.5f);Require(instruments.Clock>clock,"Data animation stopped");
            shell.Preferences.motion=0;shell.ApplyPreferences();clock=instruments.Clock;yield return new WaitForSecondsRealtime(.3f);Require(clock==instruments.Clock,"Motion preference ignored");
            shell.Preferences.motion=1;shell.ApplyPreferences();report["noMovingLights"]=true;report["motionPreference"]=true;
            var resolutions=new JArray();
            foreach(int width in new[]{1920,2560,3840})
            {
                Screen.SetResolution(width,width*9/16,FullScreenMode.FullScreenWindow);yield return new WaitForSecondsRealtime(1);
                // 工具现实：Screen.SetResolution 在编辑器里是 no-op，本循环是 player-build-only 检查。
                // 编辑器把实际渲染尺寸如实写入报告不断言；player 保留原硬断言。PNG 文件名保留惯例档名。
                if(Application.isEditor)report["renderSize-"+width]=Screen.width+"x"+Screen.height;else Require(Screen.width==width && Screen.height==width*9/16,"Wrong render resolution");
                shell.Stage.ResetCamera();yield return Photo(dir,"arena-"+width);
                shell.UI.Root.gameObject.SetActive(false);yield return Photo(dir,"arena-clean-"+width);shell.UI.Root.gameObject.SetActive(true);
                yield return new WaitForSecondsRealtime(1); // Keep screenshot encoding outside the frame sample.
                var times=new List<float>();float until=Time.unscaledTime+10;
                while(Time.unscaledTime<until){yield return null;times.Add(Time.unscaledDeltaTime*1000);}times.Sort();
                resolutions.Add(new JObject{["width"]=width,["height"]=Screen.height,["fps"]=1000/times.Average(),["p95ms"]=times[(int)(times.Count*.95f)],["seconds"]=10});
            }
            report["performance"]=resolutions;
            Screen.SetResolution(1920,1080,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.7f);
            shell.UI.Root.gameObject.SetActive(false);shell.Stage.CameraDirected=true;
            var camera=shell.Stage.View.transform;camera.position=new Vector3(-10.5f,4.6f,-5.6f);camera.LookAt(new Vector3(-8.3f,3,1.3f));
            yield return Photo(dir,"telemetry-detail");
            var video=shell.AddComponent<ArenaVideoCapture>();shell.Run(video.Capture(Path.Combine(dir,"data-motion")));
            yield return new WaitForSecondsRealtime(5);
            camera.position=new Vector3(10.5f,4.6f,-5.6f);camera.LookAt(new Vector3(8.3f,3,1.3f));yield return Photo(dir,"orbital-detail");yield return new WaitForSecondsRealtime(5);
            video.Recording=false;yield return Until(()=>video.Finished);Require(video.Error==null,video.Error);
            shell.Stage.CameraDirected=false;shell.Stage.ResetCamera();shell.UI.Root.gameObject.SetActive(true);
            shell.Duel.Receive(packet,false);yield return Until(()=>shell.Finished && shell.Duel.Idle);yield return new WaitForSecondsRealtime(.3f);
            Require(shell.Stage.Display.Winner==packet.snapshot.winner,"Winner floor feedback was lost");
            var material=renderers.First(r=>r.sharedMaterial.shader.name=="QuQu/Research Display" && r.sharedMaterial.GetFloat("_Mode")==0).sharedMaterial;
            var levels=material.GetVector("_Levels");Require(Mathf.Abs(levels.x-shell.Stage.Fighters[0].State.Health/100)<.001f && Mathf.Abs(levels.y-shell.Stage.Fighters[1].State.Health/100)<.001f,"Readout does not match real displayed health");
            report["healthReadout"]=true;report["winnerFeedback"]=true;yield return Photo(dir,"victory");
            shell.Stations.Visit(ArenaOrbitalNetwork.Place.Lab);shell.Stations.Skip();yield return Until(()=>!shell.Stations.Moving);yield return Photo(dir,"laboratory");
            shell.Stations.ReturnToArena();shell.ShowHome();yield return Photo(dir,"home-final");
        }
    }
}
