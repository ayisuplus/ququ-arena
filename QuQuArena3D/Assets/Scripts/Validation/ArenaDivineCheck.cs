using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Opt-in rendering and protocol regression run; synthetic events never call a model.
    [ArenaHarness("--arena-divine-validation", false)]
    public static class ArenaDivineCheck
    {
        [Serializable] public class Result
        {
            public bool passed, stationary, quietMode, cancelled, protocol, music, preferences, shadows;
            public int casts, impacts, frames, width, height;
            public float maximumTravel;
            public string error, graphics;
        }
        public static IEnumerator Run(ArenaGame game)
        {
            var args=Environment.GetCommandLineArgs(); int a=Array.IndexOf(args,"--arena-qa-output");
            string dir=a>=0?Path.GetFullPath(args[a+1]):"E:/projects/AI斗兽场/docs/validation/divine-v04/editor";
            Directory.CreateDirectory(dir); Directory.CreateDirectory(Path.Combine(dir,"frames"));
            var result=new Result {graphics=SystemInfo.graphicsDeviceName};
            var steps=Check(game,dir,result);
            while(true)
            {
                bool more; object next;
                try {more=steps.MoveNext();next=more?steps.Current:null;}
                catch(Exception e) {result.error=e.ToString();Debug.LogException(e);break;}
                if(!more) {result.passed=true;break;} yield return next;
            }
            (steps as IDisposable)?.Dispose();
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(result,true));
            if(!Application.isEditor) Application.Quit(result.passed?0:1);
        }
        static IEnumerator Check(ArenaGame g,string dir,Result r)
        {
            yield return new WaitForSecondsRealtime(1);
            g.Connection.Disconnect(); g.UI.CloseModal();
            Screen.SetResolution(1600,900,FullScreenMode.Windowed);
            var roster=ArenaModelPresets.All.Select(p=>new ModelInfo{id="divine/"+p.Id,name=p.Name}).ToArray();
            g.Accept(new Frame {type="start",roster=roster,total=20,title="神殿演出验证 · 模拟事件"});
            var original=JsonUtility.ToJson(g.Preferences);
            g.UI.Root.gameObject.SetActive(false); g.Spectator.gameObject.SetActive(false); g.Stage.SetSpectating(true);
            foreach(var f in g.Stage.Fighters) f.ShowNameplate=false;
            yield return new WaitForSecondsRealtime(.6f);
            yield return new WaitForEndOfFrame(); Capture(Path.Combine(dir,"sanctum.png"));
            r.width=Screen.width;r.height=Screen.height;
            r.shadows=UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None).Any(l=>l.type==LightType.Directional&&l.shadows!=LightShadows.None);
            r.music=g.Media.Music.isPlaying&&g.Media.Music.clip.name=="MoonlitCafe";
            Require(r.shadows&&r.music,"Lighting or selected music missing");
            for(int i=0;i<g.Stage.Fighters.Count;i++)
            {
                var f=g.Stage.Fighters[i]; var target=g.Stage.Fighters[(i+3)%g.Stage.Fighters.Count];
                var pose=f.GetComponentInChildren<ArenaDivinePose>(); Require(pose&&pose.Ready,"No proportion-aware pose on "+f.State.Name);
                var hand=f.BodyRoot.GetComponentsInChildren<Transform>().First(t=>t.name=="RightHand");
                var rest=hand.localRotation; var restPosition=f.BodyRoot.InverseTransformPoint(hand.position);
                for(int variant=0;variant<3;variant++)
                {
                    int count=0; float began=Time.time; bool shot=false; float next=0;
                    f.Strike(target,variant==1?0:1,1,(p,c,b)=> {count++;r.impacts++;});
                    while(f.Busy && Time.time-began<5)
                    {
                        r.maximumTravel=Mathf.Max(r.maximumTravel,Vector3.Distance(f.transform.position,f.Home));
                        yield return new WaitForEndOfFrame();
                        float elapsed=Time.time-began;
                        if(variant==0 && elapsed>=next) { Capture(Path.Combine(dir,"frames",r.frames.ToString("D5")+".jpg"));r.frames++;next=elapsed+1f/12; }
                        if(!shot && elapsed>=.92f)
                        {
                            shot=true;
                            Require(Vector3.Distance(restPosition,f.BodyRoot.InverseTransformPoint(hand.position))>.15f,"Cast hand never leaves rest");
                            if(variant==0) Capture(Path.Combine(dir,ArenaModelPresets.All[i].Id+"-charge.png"));
                        }
                    }
                    Require(count==1&&!f.Busy,"Cast did not complete with exactly one impact"); r.casts++;
                    yield return new WaitForSecondsRealtime(.2f);
                }
            }
            r.stationary=r.maximumTravel<.01f; Require(r.stationary,"Fighters resumed chasing");
            var first=g.Stage.Fighters[0];var second=g.Stage.Fighters[1];
            int hits=0; g.Stage.OnImpact=b=>hits++;
            g.Accept(new Frame{type="model",modelId=roster[0].id,taskId="pending",seq=100,status="judging",hasScore=false});
            g.Accept(new Frame{type="model",modelId=roster[0].id,taskId="error",seq=101,status="error",hasScore=false});
            yield return new WaitForSecondsRealtime(.4f);Require(hits==0&&!first.Busy,"Unscored/error event cast a spell");
            var scored=new Frame{type="model",modelId=roster[0].id,taskId="valid",seq=102,status="done",hasScore=true,score=1};
            g.Accept(scored);g.Accept(scored);
            yield return new WaitForSecondsRealtime(4);r.protocol=hits==1;Require(r.protocol,"Duplicate score cast more than once");
            first.Motion=0;first.Strike(second,1,0,(p,c,b)=>hits++);yield return null;r.quietMode=!first.Busy;
            first.Motion=1;first.Strike(second,1,1,(p,c,b)=>hits++);yield return new WaitForSecondsRealtime(.3f);
            g.Stage.Motion=0;first.Motion=0;yield return new WaitForSecondsRealtime(.3f);
            r.cancelled=!first.Busy&&UnityEngine.Object.FindObjectsByType<ArenaDivineEffect>(FindObjectsSortMode.None).Length==0&&hits==1;
            Require(r.quietMode&&r.cancelled,"Motion-off did not cancel invocation");g.Stage.Motion=1;
            r.preferences=JsonUtility.ToJson(g.Preferences)==original;Require(r.preferences,"QA changed customization preferences");
            g.Stage.Focus(first);yield return new WaitForSecondsRealtime(.3f);yield return new WaitForEndOfFrame();Capture(Path.Combine(dir,"portrait.png"));
            g.Stage.ResetCamera();g.Spectator.gameObject.SetActive(true);
            g.Accept(new Frame{type="round",index=0,total=1,taskId="Q1",prompt="证明 √2 是无理数。"});
            g.Accept(new Frame{type="model",modelId=roster[0].id,taskId="Q1",seq=103,status="generating",answer="假设 √2 = p/q，且 p、q 互质。由 p² = 2q² 可得 p 为偶数；代回可得 q 也为偶数，与互质矛盾。"});
            yield return new WaitForSecondsRealtime(.3f);yield return new WaitForEndOfFrame();Capture(Path.Combine(dir,"spectator.png"));
        }
        static void Capture(string path)
        {
            var image=ScreenCapture.CaptureScreenshotAsTexture();
            var pixels=image.GetPixels32(); int lit=0;
            for(int i=0;i<pixels.Length;i+=97) if(pixels[i].r+pixels[i].g+pixels[i].b>30)lit++;
            if(lit<pixels.Length/970) {UnityEngine.Object.Destroy(image);throw new Exception("Black render capture: "+path);}
            File.WriteAllBytes(path,path.EndsWith(".jpg")?image.EncodeToJPG(88):image.EncodeToPNG());UnityEngine.Object.Destroy(image);
        }
        static void Require(bool ok,string message) {if(!ok)throw new Exception(message);}
    }
}
