using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace QuQu
{
    // Uses isolated fixtures and the actual rendering/settlement path; never calls a model.
    [ArenaHarness("--arena-slap-validation", false)]
    public static class ArenaSlapCheck
    {
        static void Require(bool ok,string message){if(!ok)throw new Exception(message);}
        public static IEnumerator Run(ArenaGame g,string directory)
        {
            Directory.CreateDirectory(directory);var report=new JObject();var stack=new Stack<IEnumerator>();stack.Push(Check(g,directory,report));
            while(stack.Count>0)
            {
                bool more;object item=null;
                try{more=stack.Peek().MoveNext();if(more)item=stack.Peek().Current;}catch(Exception e){report["error"]=e.ToString();Debug.LogException(e);break;}
                if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}if(item is IEnumerator child)stack.Push(child);else yield return item;
            }
            while(stack.Count>0)(stack.Pop() as IDisposable)?.Dispose();
            report["passed"]=report["error"]==null;File.WriteAllText(Path.Combine(directory,"slaps.json"),report.ToString());
            // 门禁通道产物（历史欠账：只写 slaps.json 时 ArenaPlayModeGate 等不到 runtime.json 必超时）。
            File.WriteAllText(Path.Combine(directory,"runtime.json"),new JObject{["passed"]=report["passed"]}.ToString());
            if(!Application.isEditor)Application.Quit(report["passed"].Value<bool>()?0:1);
        }
        static IEnumerator Check(ArenaGame g,string dir,JObject report)
        {
            yield return new WaitForSecondsRealtime(1);g.Connection.Disconnect();g.UI.CloseModal();g.Stations.ReturnToArena();g.Stations.Skip();
            while(g.Stations.Moving)yield return null;
            var camera=g.Stage.View;var cases=new JArray();report["cases"]=cases;
            foreach(bool chibi in new[]{false,true})foreach(var preset in ArenaModelPresets.All)
            {
                g.Preferences.avatarMode=chibi?"chibi":"standard";g.ApplyPreferences();while(g.AvatarModePending)yield return null;
                g.Preferences.Avatar("slap-a",0).presetId=preset.Id;g.Preferences.Avatar("slap-b",1).presetId="claude";
                g.Preferences.mirrorPanels=preset.Id=="glm";g.SetRoster(new[]{new ModelInfo{id="slap-a",name=preset.Name},new ModelInfo{id="slap-b",name="Claude"}});
                yield return null;var a=g.Stage.Fighters[0];var b=g.Stage.Fighters[1];var homes=new[]{a.Home,b.Home};
                g.Stage.CameraDirected=true;camera.transform.position=new Vector3(-.8f,chibi?2.1f:2.9f,-6.6f);camera.transform.LookAt(new Vector3(0,chibi?.85f:1.25f,0));camera.fieldOfView=36;
                var video=g.gameObject.AddComponent<ArenaVideoCapture>();g.StartCoroutine(video.Capture(Path.Combine(dir,(chibi?"chibi-":"standard-")+preset.Id)));
                var impactTimes=new List<float>();float maxError=0,maxTravel=0;int settled=0;
                var round=new CompetitionRound{attacks=new[]{new CompetitionAttack{attacker=a.State.Id,target=b.State.Id,damage=20},new CompetitionAttack{attacker=b.State.Id,target=a.State.Id,damage=20}}};
                var routine=g.Stage.PresentRound(round,()=>settled++,attack=>
                {
                    var attacker=attack.attacker==a.State.Id?a:b;var target=attacker==a?b:a;
                    maxError=Mathf.Max(maxError,Vector3.Distance(attacker.SlapPalm,target.SlapCheek));impactTimes.Add(Time.unscaledTime);
                    ArenaSpectatorCapture.Save(Path.Combine(dir,(chibi?"chibi-":"standard-")+preset.Id+"-hit"+impactTimes.Count+".png"));
                });
                var play=g.StartCoroutine(routine);float end=Time.unscaledTime+8;
                while(settled==0 && Time.unscaledTime<end)
                {
                    for(int i=0;i<2;i++)maxTravel=Mathf.Max(maxTravel,Vector3.Distance(g.Stage.Fighters[i].transform.position,homes[i]));
                    Require(g.Stage.Fighters.Count(f=>f.Slapping)<=1,"Simultaneous slaps");yield return null;
                }
                video.Recording=false;while(!video.Finished)yield return null;UnityEngine.Object.Destroy(video);
                var row=new JObject{["preset"]=preset.Id,["chibi"]=chibi,["contacts"]=impactTimes.Count,["settlements"]=settled,["handError"]=maxError,["rootTravel"]=maxTravel,["interval"]=impactTimes.Count==2?impactTimes[1]-impactTimes[0]:0};cases.Add(row);
                Require(settled==1 && impactTimes.Count==2 && impactTimes[1]-impactTimes[0]>1,"Sequential settlement failed");
                Require(maxError<.045f && maxTravel<.001f,"Missed cheek or walked during slap: "+row);Require(video.Error==null,"Video capture failed");
                while(g.Stage.Fighters.Any(f=>f.Busy))yield return null;
            }
            g.Preferences.avatarMode="standard";g.ApplyPreferences();while(g.AvatarModePending)yield return null;
            for(int style=0;style<3;style++)
            {
                g.Preferences.Avatar("slap-generic",0).presetId="";g.Preferences.Avatar("slap-generic",0).style=style;
                g.SetRoster(new[]{new ModelInfo{id="slap-generic",name="通用角色"},new ModelInfo{id="slap-b",name="Claude"}});yield return null;
                int genericHits=0;var generic=g.Stage.Fighters[0];var target=g.Stage.Fighters[1];
                yield return generic.SlapResolved(target,(p,c,b)=>{genericHits++;Require(Vector3.Distance(generic.SlapPalm,target.SlapCheek)<.045f,"Generic missed cheek");});Require(genericHits==1,"Generic slap missing");
            }
            var imported=g.Media.LoadAvatar(g.Stage.Fighters[0],"E:/projects/AI斗兽场/production/art/model-presets-v01/claude/mesh.glb",g.Notify);
            while(!imported.IsCompleted)yield return null;Require(imported.Result,"Imported appearance failed");yield return null;
            var custom=g.Stage.Fighters[0];int customHits=0;
            yield return custom.SlapResolved(g.Stage.Fighters[1],(p,c,b)=>{customHits++;Require(Vector3.Distance(custom.SlapPalm,g.Stage.Fighters[1].SlapCheek)<.045f,"Custom hand missed");});Require(customHits==1,"Custom slap missing");
            report["genericAndImported"]=true;
            g.Stage.CameraDirected=false;g.Stage.ResetCamera();g.Preferences.mirrorPanels=false;g.ApplyPreferences();
            int impacts=0,settlements=0;g.Stage.OnImpact=b=>{g.Media.Hit(b);impacts++;};
            var left=g.Stage.Fighters[0];var right=g.Stage.Fighters[1];
            var zero=new CompetitionRound{attacks=new[]{new CompetitionAttack{attacker=left.State.Id,target=right.State.Id,damage=0},new CompetitionAttack{attacker=right.State.Id,target=left.State.Id,damage=0}}};
            yield return g.Stage.PresentRound(zero,()=>settlements++);Require(impacts==0 && settlements==1 && !left.Slapping && !right.Slapping,"Both correct played a slap");
            var single=new CompetitionRound{attacks=new[]{new CompetitionAttack{attacker=left.State.Id,target=right.State.Id,damage=20}}};
            yield return g.Stage.PresentRound(single,()=>settlements++);Require(impacts==1 && settlements==2,"Single wrong answer");
            g.Stage.Motion=0;yield return g.Stage.PresentRound(single,()=>settlements++);Require(impacts==1 && settlements==3,"Static settlement");
            g.Stage.Motion=1;var cancellation=g.StartCoroutine(g.Stage.PresentRound(single,()=>settlements++));yield return new WaitForSecondsRealtime(.2f);g.Stage.EndCombat();yield return new WaitForSecondsRealtime(.4f);Require(impacts==1 && settlements==3 && !left.Slapping && !right.Slapping,"Cancelled round leaked a slap");
            var disabled=g.StartCoroutine(g.Stage.PresentRound(single,()=>settlements++));yield return new WaitForSecondsRealtime(.2f);g.Stage.Motion=0;yield return new WaitForSecondsRealtime(.3f);Require(impacts==1 && settlements==4,"Motion off mid-slap lost settlement");
            report["singleBothCorrectCancelStatic"]=true;g.Stage.Motion=1;
            report["rangedEffects"]=UnityEngine.Object.FindObjectsByType<ArenaDivineEffect>(FindObjectsSortMode.None).Length;Require((int)report["rangedEffects"]==0,"Ranged effect remains");
            // —— 掌击接触 VFX 近景像素验收（近景机位 + A/B 归因）——
            // 时间线根因（本块存在的原因）：接触回调跑在 WaitForEndOfFrame 续体里，粒子 Play() 又在
            // 回调之后——同步拍的接触帧（上面 -hitN）结构上必无粒子；粒子 .36~.55s 寿命、约 .1s 峰值。
            // batchmode 玩家循环仅 ~3Hz（首跑实证采样落在 0/.34/.68/1.04/1.36s，峰值瞬间无帧存在），
            // 故固定步长 captureDeltaTime=1/60：仿真按帧步进 .016s，渲染再慢峰值时间轴上也有帧。
            // 归因靠 A/B：同一出掌跑两遍（Vfx 开/关），姿势调色光照全同，帧差=纯粒子贡献。
            // 镜头 CameraDirected 近景直取双方面颊中点；亮点计数只在中心半窗内做，肢体位移不背锅。
            g.Preferences.Avatar("closeup-a",0).presetId="chatgpt";g.Preferences.Avatar("closeup-b",1).presetId="claude";
            g.SetRoster(new[]{new ModelInfo{id="closeup-a",name="ChatGPT"},new ModelInfo{id="closeup-b",name="Claude"}});yield return null;
            var cuA=g.Stage.Fighters[0];var cuB=g.Stage.Fighters[1];var mid=(cuA.SlapCheek+cuB.SlapCheek)*.5f;
            g.Stage.CameraDirected=true;camera.transform.position=mid+new Vector3(-.35f,.5f,-2.05f);camera.transform.LookAt(mid);camera.fieldOfView=34;
            Time.captureDeltaTime=1f/60f;
            var onBright=new List<int>();var offBright=new List<int>();
            foreach(bool vfxOn in new[]{true,false})
            {
                g.Stage.Vfx.Enabled=vfxOn;
                var samples=new JArray();bool burstDone=false;string prefix=vfxOn?"closeup-on-":"closeup-off-";
                yield return g.Stage.PresentRound(new CompetitionRound{attacks=new[]{new CompetitionAttack{attacker=cuA.State.Id,target=cuB.State.Id,damage=20}}},()=>{ },attack=>
                {
                    samples.Add(CaptureCloseup(Path.Combine(dir,prefix+"0.png"),0,cuB.SlapCheek));
                    g.StartCoroutine(CloseupBurst(dir,prefix,samples,cuB.SlapCheek,()=>burstDone=true));
                });
                float cuEnd=Time.realtimeSinceStartup+40;while(!burstDone&&Time.realtimeSinceStartup<cuEnd)yield return null;
                Require(burstDone && samples.Count==7,"Close-up burst incomplete ("+prefix+"): "+samples.Count);
                foreach(var s in samples)(vfxOn?onBright:offBright).Add((int)s["bright"]);
                report[vfxOn?"closeupVfxOn":"closeupVfxOff"]=new JObject{["samples"]=samples,["contactWindow"]=camera.transform.position.ToString()};
                while(g.Stage.Fighters.Any(f=>f.Busy))yield return null;
            }
            Time.captureDeltaTime=0;g.Stage.Vfx.Enabled=true;
            // 断言配对差不比峰值：两臂姿势/调色/高光全同，同帧差才是粒子贡献；序列各 max 是不同时间点，险过也不算数。
            var paired=0;for(int i=0;i<onBright.Count;i++)paired=Mathf.Max(paired,onBright[i]-offBright[i]);
            Require(paired>500,"Contact VFX adds no particles (paired bright delta "+paired+")");
            report["closeupVfxAttribution"]=new JObject{["pairedMaxDelta"]=paired,["on"]=new JArray(onBright),["off"]=new JArray(offBright)};
            g.Stage.CameraDirected=false;g.Stage.ResetCamera();
            var packet=ArenaSpectatorCapture.Packet();packet.id="slap-verified-sequence";packet.snapshot.id=packet.id;
            g.Duel.Receive(packet,false);g.Duel.Receive(packet,false);float deadline=Time.unscaledTime+65;int priorHits=g.Duel.AppliedHits;
            while(!g.Finished && Time.unscaledTime<deadline){Require(!g.Duel.Presenting || !g.Stage.Fighters.Any(f=>f.Celebrating),"Celebration before last slap");yield return null;}
            int rounds=packet.snapshot.duels[0].rounds.Length;Require(g.Finished && g.Duel.AppliedHits==priorHits+rounds,"Duplicate settlement or unfinished fixture");
            g.Duel.Receive(packet,true);yield return new WaitForSecondsRealtime(.3f);Require(g.Duel.AppliedHits==priorHits+rounds && !g.Stage.Fighters.Any(f=>f.Busy),"Reconnect replayed slaps");
            report["fixtureRounds"]=rounds;report["duplicateAndReconnect"]=true;
            report["gpu"]=SystemInfo.graphicsDeviceName;report["width"]=Screen.width;report["height"]=Screen.height;
        }
        // 接触后续按帧采样 6 帧（captureDeltaTime 固定步长下粒子年龄=帧序/60，.016~.1s 覆盖升到峰值）。
        // 采样门槛值只是「至少隔一帧」，真正节奏由渲染帧率决定——每帧必拍，不跳帧。
        static IEnumerator CloseupBurst(string dir,string prefix,JArray samples,Vector3 contact,System.Action done)
        {
            float start=Time.unscaledTime;int index=1;
            foreach(float at in new[]{.05f,.10f,.20f,.40f,.80f,1.60f})
            {
                while(Time.unscaledTime-start<at)yield return null;
                yield return new WaitForEndOfFrame();
                samples.Add(CaptureCloseup(Path.Combine(dir,prefix+index+".png"),Time.unscaledTime-start,contact));index++;
            }
            done();
        }
        static JObject CaptureCloseup(string path,float t,Vector3 contact)
        {
            var image=ScreenCapture.CaptureScreenshotAsTexture();var pixels=image.GetPixels32();
            int w=image.width,h=image.height,bright=0;
            for(int y=h/4;y<h*3/4;y+=2)for(int x=w/4;x<w*3/4;x+=2){var p=pixels[y*w+x];if((p.r+p.g+p.b)/3>200)bright++;}
            File.WriteAllBytes(path,image.EncodeToPNG());UnityEngine.Object.Destroy(image);
            return new JObject{["file"]=Path.GetFileName(path),["t"]=t,["bright"]=bright,["contact"]=contact.x.ToString("F2")+","+contact.y.ToString("F2")+","+contact.z.ToString("F2")};
        }
    }
}
