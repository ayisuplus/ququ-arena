using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Explicit QA mode: synthetic frames, fresh preferences, no model API calls or profile writes.
    public static class ArenaPerformanceCheck
    {
        [Serializable] public class StrikeResult { public string id, state; public int impacts; public bool blocked, returnedHome; public float contactDistance, seconds; }
        [Serializable] public class Result
        {
            public bool passed, musicLooped, customMusicRestored, quietMode, cancellation;
            public string error, music, graphics;
            public int mappedStates, protocolCases, capturedFrames;
            public float musicSeconds;
            public List<StrikeResult> strikes = new List<StrikeResult>();
        }
        public static IEnumerator Run(ArenaGame game)
        {
            var args = Environment.GetCommandLineArgs(); int at = Array.IndexOf(args,"--arena-qa-output");
            string dir = at >= 0 && at + 1 < args.Length ? Path.GetFullPath(args[at+1]) : Path.GetFullPath("../docs/validation/performance-v03/editor-v2");
            Directory.CreateDirectory(dir); Directory.CreateDirectory(Path.Combine(dir,"frames"));
            var result = new Result { graphics = SystemInfo.graphicsDeviceName };
            var steps = Check(game,dir,result);
            while (true)
            {
                bool more; object next;
                try { more = steps.MoveNext(); next = more ? steps.Current : null; }
                catch (Exception e) { result.error = e.ToString(); Debug.LogException(e); break; }
                if (!more) { result.passed = true; break; }
                yield return next;
            }
            (steps as IDisposable)?.Dispose();
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(result,true));
            if (!Application.isEditor) Application.Quit(result.passed ? 0 : 1);
        }
        static IEnumerator Check(ArenaGame game,string dir,Result result)
        {
            yield return new WaitForSecondsRealtime(1);
            game.Connection.Disconnect(); game.UI.CloseModal();
            Screen.SetResolution(1280,720,FullScreenMode.Windowed);
            game.UI.Root.gameObject.SetActive(false);
            var music = game.Media.Music;
            result.music = music.clip.name; result.musicSeconds = music.clip.length;
            Require(result.music == "MoonlitCafe" && result.musicSeconds > 90 && music.isPlaying,"Selected long soundtrack missing");
            music.time = music.clip.length - .2f;
            yield return new WaitForSecondsRealtime(.5f);
            result.musicLooped = music.isPlaying && music.time < 2; Require(result.musicLooped,"Music did not loop");
            foreach (var preset in ArenaModelPresets.All)
            {
                var other = preset.Id == "claude" ? ArenaModelPresets.All[0] : ArenaModelPresets.All[1];
                var roster = new[] { new ModelInfo { id="performance/"+preset.Id,name=preset.Name },new ModelInfo { id="target/"+other.Id,name=other.Name } };
                game.Accept(new Frame { type="start",roster=roster,total=100,title="动作验证 · 模拟事件" });
                game.UI.Root.gameObject.SetActive(false);
                foreach (var field in new[] { "yaw", "pitch", "distance" })
                    typeof(ArenaStage).GetField(field,System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).SetValue(game.Stage,field=="yaw"?135f:field=="pitch"?12f:9.5f);
                game.Stage.View.fieldOfView=55;
                yield return new WaitForSecondsRealtime(.3f);
                var fighter=game.Stage.Fighters[0]; var target=game.Stage.Fighters[1];
                var animator=fighter.BodyRoot.GetComponentInChildren<Animator>();
                var profile=fighter.BodyRoot.GetComponentInChildren<ArenaCombatMotion>();
                Require(profile && profile.attacks.Length==3,"Missing role motion profile");
                foreach (var state in new[]{"Advance","Retreat","AttackA","AttackB","AttackC","Evade"})
                {
                    Require(animator.HasState(0,Animator.StringToHash(state)),"Missing state "+state); result.mappedStates++;
                }
                for(int variant=0;variant<3;variant++)
                {
                    var row=new StrikeResult{id=preset.Id,state="Attack"+(char)('A'+variant)}; result.strikes.Add(row);
                    float start=Time.time, captureAt=Time.unscaledTime;
                    fighter.Strike(target,variant==2?0:.9f,1,(point,tint,blocked)=>
                    {
                        row.impacts++; row.blocked=blocked;
                        var delta=point-target.transform.position; delta.y=0; row.contactDistance=delta.magnitude;
                        ScreenCapture.CaptureScreenshot(Path.Combine(dir,preset.Id+"-"+row.state+".png"));
                    });
                    while ((fighter.Busy || target.Busy) && Time.time-start<14)
                    {
                        if (variant==0 && Time.unscaledTime>=captureAt)
                        {
                            captureAt=Time.unscaledTime+1f/12;
                            yield return new WaitForEndOfFrame();
                            var shot=ScreenCapture.CaptureScreenshotAsTexture();
                            File.WriteAllBytes(Path.Combine(dir,"frames",result.capturedFrames++.ToString("D5")+".jpg"),shot.EncodeToJPG(82));
                            UnityEngine.Object.Destroy(shot);
                        }
                        else yield return null;
                    }
                    row.seconds=Time.time-start; row.returnedHome=Vector3.Distance(fighter.transform.position,fighter.Home)<.02f;
                    Require(row.impacts==1,"Expected exactly one contact: "+preset.Id+"/"+row.state);
                    Require(row.contactDistance<.95f,"Attack misses defender: "+preset.Id+"/"+row.state+" gap="+row.contactDistance);
                    Require(row.blocked==(variant==2) && row.returnedHome && !fighter.Busy,"Attack did not recover");
                    yield return new WaitForSecondsRealtime(.2f);
                }
            }
            // Event boundaries at both two and eight participants; pending/errors/duplicates must not add attacks.
            foreach(int count in new[]{2,8})
            {
                var roster=Enumerable.Range(0,count).Select(i=>new ModelInfo{id="protocol/"+ArenaModelPresets.All[i%6].Id+"/"+i,name="QA "+i}).ToArray();
                game.Accept(new Frame{type="start",roster=roster,total=100});
                var fighter=game.Stage.Fighters[0]; var target=game.Stage.Fighters[1];
                var small=new AvatarPreference{modelId=roster[0].id,presetId="chatgpt",color="#B5A5F5",scale=.65f};
                var large=new AvatarPreference{modelId=roster[1].id,presetId="claude",color="#EEA36C",scale=1.45f};
                fighter.ApplyLook(small); target.ApplyLook(large);
                int impacts=0; Action<bool> onImpact=_=>impacts++; game.Stage.OnImpact+=onImpact;
                game.Accept(new Frame{type="model",modelId=roster[0].id,taskId="Q1",seq=1,status="generating"});
                game.Accept(new Frame{type="model",modelId=roster[0].id,taskId="Q1",seq=2,status="judging"});
                game.Accept(new Frame{type="model",modelId=roster[0].id,taskId="Q1",seq=3,status="error",error="fixture"});
                yield return new WaitForSecondsRealtime(.3f); Require(impacts==0&&!fighter.Busy,"Unscored frame attacked");
                var done=new Frame{type="model",modelId=roster[0].id,taskId="Q1",seq=4,status="done",hasScore=true,score=.9f};
                game.Accept(done); game.Accept(done);
                float began=Time.time; yield return null;
                while((fighter.Busy||target.Busy) && Time.time-began<18) yield return null;
                yield return new WaitForSecondsRealtime(.3f);
                Require(impacts==1&&!fighter.Busy&&Vector3.Distance(fighter.transform.position,fighter.Home)<.02f,"Scale/protocol regression");
                result.protocolCases++; game.Stage.OnImpact-=onImpact;
            }
            var first=game.Stage.Fighters[0]; var second=game.Stage.Fighters[1];
            game.Stage.Motion=0; yield return null; game.Stage.Fight(first,1); yield return null;
            result.quietMode=!first.Busy; Require(result.quietMode,"Motion off starts combat");
            game.Stage.Motion=1; yield return null;
            first.Strike(second,1,1,null); yield return new WaitForSecondsRealtime(.1f);
            game.Stage.Motion=0; yield return new WaitForSecondsRealtime(.3f);
            result.cancellation=!first.Busy&&Vector3.Distance(first.Home,first.transform.position)<.02f;
            Require(result.cancellation,"Motion off leaves an attack stranded");
            // Existing file import and returning to the new default must remain usable.
            string wav=Path.Combine(dir,"custom-fixture.wav");
            using(var writer=new BinaryWriter(File.Create(wav)))
            {
                int n=22050; writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF")); writer.Write(36+n*2); writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt "));
                writer.Write(16); writer.Write((short)1); writer.Write((short)1); writer.Write(22050); writer.Write(44100); writer.Write((short)2); writer.Write((short)16);
                writer.Write(System.Text.Encoding.ASCII.GetBytes("data")); writer.Write(n*2);
                for(int i=0;i<n;i++)writer.Write((short)(Math.Sin(i*2*Math.PI*220/22050)*1000));
            }
            string message=null; game.Media.LoadMusic(wav,s=>message=s);
            for(float t=0;t<5&&message==null;t+=Time.deltaTime)yield return null;
            Require(message=="音乐已载入","Custom music import failed");
            game.Media.LoadMusic("",null); result.customMusicRestored=music.clip.name=="MoonlitCafe"&&music.isPlaying;
            Require(result.customMusicRestored,"Default music restore failed");
        }
        static void Require(bool condition,string message){if(!condition)throw new Exception(message);}
    }
}
