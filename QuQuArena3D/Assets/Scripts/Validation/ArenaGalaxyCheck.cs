using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Isolated saved-event verification, with real rendered frames and no paid model calls.
    [ArenaHarness("--arena-galaxy-validation", false)]
    public static class ArenaGalaxyCheck
    {
        [Serializable] public class Result
        {
            public bool passed, pagination, updateKeepsPage, nextQuestionResets, migration, winnerAfterHit, duplicateSafe, reconnectStatic, noFalseWinner, mirroredOrigin, customIdentity, quietMode, rightWinner, telemetryMotion, telemetryQuiet;
            public int pages, hits, celebrations, cases, width, height, performanceFrames;
            public string[] resolutions;
            public float fps, frameP95;
            public string error, gpu;
        }
        static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
        public static IEnumerator Run(ArenaGame g, string output = null)
        {
            var args = Environment.GetCommandLineArgs(); int at = Array.IndexOf(args,"--arena-qa-output");
            string dir = output ?? (at >= 0 ? args[at+1] : Path.Combine(Application.temporaryCachePath,"galaxy-v10"));
            Directory.CreateDirectory(dir);
            var result = new Result { gpu = SystemInfo.graphicsDeviceName };
            var stack = new Stack<IEnumerator>(); stack.Push(Check(g, dir, result));
            while (stack.Count > 0)
            {
                bool more; object next = null;
                try { more = stack.Peek().MoveNext(); if (more) next = stack.Peek().Current; }
                catch (Exception e) { result.error = e.ToString(); Debug.LogException(e); break; }
                if (!more) { (stack.Pop() as IDisposable)?.Dispose(); continue; }
                if (next is IEnumerator child) stack.Push(child); else yield return next;
            }
            result.passed = string.IsNullOrEmpty(result.error);
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(result,true));
            if (!Application.isEditor) Application.Quit(result.passed ? 0 : 1);
        }
        static IEnumerator Photo(string dir, string name)
        {
            yield return new WaitForSecondsRealtime(.3f); yield return new WaitForEndOfFrame();
            var texture = ScreenCapture.CaptureScreenshotAsTexture(); var pixels = texture.GetPixels32();
            int lit = 0; for (int i = 0; i < pixels.Length; i += 97) if (pixels[i].r+pixels[i].g+pixels[i].b > 35) lit++;
            Require(lit > pixels.Length/1300,"Black or empty rendered frame: "+name);
            File.WriteAllBytes(Path.Combine(dir,name+".png"),texture.EncodeToPNG()); UnityEngine.Object.Destroy(texture);
        }
        static CompetitionPacket Packet(string suffix)
        {
            var p = ArenaSpectatorCapture.Packet(); p.id += suffix; p.snapshot.id = p.id;
            foreach(var e in p.events) e.competitionId = p.id;
            return p;
        }
        static IEnumerator Until(Func<bool> done, float seconds = 45)
        {
            float deadline = Time.unscaledTime+seconds;
            while (!done()) { Require(Time.unscaledTime<deadline,"Presentation timeout"); yield return null; }
        }
        static IEnumerator VictoryClip(ArenaGame g, string dir, bool right)
        {
            var packet=Packet(right?"-video-duel":"-video-champion");
            string expected=packet.snapshot.winner;
            if(right)
            {
                var entrants=packet.snapshot.entrants;var ids=packet.snapshot.duels[0].players;
                string json=JsonUtility.ToJson(packet).Replace(ids[0],"__swap_model__").Replace(ids[1],ids[0]).Replace("__swap_model__",ids[1]);
                packet=JsonUtility.FromJson<CompetitionPacket>(json);packet.snapshot.entrants=entrants;
                expected=ids[1];packet.events=packet.events.Where(e=>e.type!="competition-end" && e.type!="intermission").ToArray();
                packet.snapshot.status="running";packet.snapshot.winner=null;
            }
            g.Preferences.mirrorPanels=right;g.Preferences.motion=0;g.ApplyPreferences();
            long last=packet.events.Last(e=>e.type=="round-resolved").seq;
            ArenaSpectatorCapture.Feed(g,packet,last-1);yield return Until(()=>g.Duel.Idle);
            Require(g.Stage.Display.Winner==null,"Next match retained the preceding winner");
            g.Preferences.motion=1;g.ApplyPreferences();
            yield return new WaitForSecondsRealtime(.4f);
            var video=g.gameObject.AddComponent<ArenaVideoCapture>();g.StartCoroutine(video.Capture(dir));
            yield return new WaitForSecondsRealtime(.4f);g.Duel.Receive(packet,false);
            yield return Until(()=>g.Duel.Idle && g.Stage.Display.Winner==expected);
            Require(g.Stage.Display.Championship==!right,"Incorrect victory scope");
            var winner=g.Stage.Fighters.Single(f=>f.State.Id==expected);
            Require(winner.State.Health>0 && (right?winner.Home.x>0:winner.Home.x<0),"Winner identity or physical side mismatch");
            yield return new WaitForSecondsRealtime(right?3.5f:6.5f);
            Require(!g.Stage.Display.Animating,"Victory animation exceeded its duration");
            video.Recording=false;yield return Until(()=>video.Finished);Require(string.IsNullOrEmpty(video.Error),video.Error);
        }
        static IEnumerator Check(ArenaGame g, string dir, Result r)
        {
            g.Connection.Disconnect(); g.UI.CloseModal();
            var display = g.Stage.Display;
            var old = JsonUtility.FromJson<ArenaPreferences>("{\"version\":1,\"musicVolume\":0.4,\"spectator\":{\"pitch\":50}}"); old.Validate();
            var custom = JsonUtility.FromJson<ArenaPreferences>("{\"version\":1,\"spectator\":{\"pitch\":47}}"); custom.Validate();
            bool migrated=old.spectator.pitch==30; old.spectator.pitch=50; old.Validate();
            r.migration=migrated && old.spectator.pitch==50 && old.musicVolume==.4f && custom.spectator.pitch==47 && new ArenaPreferences().spectator.pitch==30;
            Require(r.migration,"Camera preference migration lost a customized setting");
            var p=Packet("-galaxy-pages"); var ids=p.snapshot.duels[0].players;
            g.Preferences.Avatar(ids[0],0).presetId="chatgpt"; g.Preferences.Avatar(ids[1],1).presetId="claude";
            ArenaSpectatorCapture.Feed(g,p,6); yield return Until(()=>g.Duel.Idle);
            var show=g.Stage.LightShow;
            float clock=show.Clock;
            yield return new WaitForSecondsRealtime(2);
            Require(g.Stage.Singularity.Clock>clock+1,"Black hole plasma clock did not advance");
            r.telemetryMotion=show.BeamCount==0 && show.HologramCount==2 && show.Clock>clock+1 && show.GetComponentsInChildren<Light>().Length==0;
            Require(r.telemetryMotion,"Research instruments did not replace the stage lighting");
            g.Preferences.motion=0;g.ApplyPreferences();clock=show.Clock;
            yield return new WaitForSecondsRealtime(.3f);
            Require(g.Stage.Singularity.Clock==clock,"Motion-off did not freeze the black hole plasma");
            r.telemetryQuiet=show.Clock==clock;
            Require(r.telemetryQuiet,"Motion-off did not freeze the data displays");g.Preferences.motion=1;g.ApplyPreferences();
            var showVideo=g.gameObject.AddComponent<ArenaVideoCapture>();g.StartCoroutine(showVideo.Capture(Path.Combine(dir,"research-video")));
            yield return Photo(dir,"research-01");yield return new WaitForSecondsRealtime(5.5f);
            yield return Photo(dir,"research-02");yield return new WaitForSecondsRealtime(5.5f);
            showVideo.Recording=false;yield return Until(()=>showVideo.Finished);Require(string.IsNullOrEmpty(showVideo.Error),showVideo.Error);
            yield return ArenaSingularityCapture.Run(g,Path.Combine(dir,"singularity"));
            var round=g.Duel.Round;
            string original=string.Concat(Enumerable.Repeat("请检查下面的程序，并解释边界条件：\nif (a < b && count > 0) { return \"<color=red>原文</color>\"; }\n",18));
            round.question.task.input=original; display.ShowRound(round); yield return null;
            r.pages=display.PageCount; Require(r.pages>1 && display.Question.text==original && !display.Question.richText,"Long original question was truncated or parsed as markup");
            yield return Photo(dir,"question-page-1");
            yield return new WaitForSecondsRealtime(8.2f); r.pagination=display.Page==2; Require(r.pagination,"Question did not advance after eight seconds");
            display.ShowRound(round); r.updateKeepsPage=display.Page==2; Require(r.updateKeepsPage,"A streamed update reset the page timer");
            yield return Photo(dir,"question-page-2");
            var next=JsonUtility.FromJson<CompetitionRound>(JsonUtility.ToJson(round)); next.id+="-next"; next.question.task.input="下一题：银河竞技场如何验证一个可靠的结论？\n请列出证据、反例与验证步骤。";
            display.ShowRound(next); r.nextQuestionResets=display.Page==1; Require(r.nextQuestionResets,"New question retained the previous page");
            var resolutions=new List<string>();
            foreach(int width in new[]{1920,2560,3840})
            {
                if(!Application.isEditor)Screen.SetResolution(width,width*9/16,FullScreenMode.FullScreenWindow);
                yield return new WaitForSecondsRealtime(.7f);
                Require(Application.isEditor || (Screen.width==width && Screen.height==width*9/16),"Requested render resolution was not applied");
                resolutions.Add(Screen.width+"x"+Screen.height);
                foreach(float scale in new[]{.65f,1,1.45f})
                {
                    foreach(var f in g.Stage.Fighters){f.Look.scale=scale;f.ApplyLook(f.Look);}
                    yield return null;g.Stage.ResetCamera();yield return null;
                    foreach(var bounds in g.Stage.FramingBounds.Concat(new[]{ArenaGalaxyDisplay.ScreenBounds}))
                    for(int i=0;i<8;i++)
                    {
                        var corner=bounds.center+Vector3.Scale(bounds.extents,new Vector3((i&1)==0?-1:1,(i&2)==0?-1:1,(i&4)==0?-1:1));
                        var v=g.Stage.View.WorldToViewportPoint(corner);
                        Require(v.z>0 && v.x>.025f && v.x<.975f && v.y>.1f && v.y<.91f,"Clipped fighter or question screen: "+v);
                    }
                    r.cases++;
                }
                yield return Photo(dir,"overview-"+width);
            }
            r.resolutions=resolutions.ToArray();
            foreach(var f in g.Stage.Fighters){f.Look.scale=1;f.ApplyLook(f.Look);}g.Stage.ResetCamera();
            foreach(var preset in ArenaModelPresets.All)
            {
                g.ApplyModelPreset(g.Stage.Fighters[0],preset.Id);yield return new WaitForSecondsRealtime(.2f);
                display.ResetDisplay(); display.ShowResult(new ArenaDuelResult("identity",preset.Id,ids[0],false,true));
                Require(display.Winner==ids[0] && !display.Animating,"Preset identity failed: "+preset.Id);
                yield return Photo(dir,"model-"+preset.Id);
            }
            display.ResetDisplay();g.Preferences.mirrorPanels=true;g.ApplyPreferences();yield return null;
            display.ShowResult(new ArenaDuelResult("mirror","mirror",ids[0],false,true));yield return null;
            // 银河地板面随建筑模型导入，新场馆有多个地板网格——产品侧 ArenaGalaxyDisplay 对全部面
            // 广播同一属性块，断言也应对全部面成立（旧 Single 唯一性假设是建筑升级前的残留）。
            var surfaces=g.Stage.GetComponentsInChildren<Renderer>().Where(x=>x.sharedMaterial && x.sharedMaterial.shader.name=="QuQu/Galaxy Floor").ToArray();
            Require(surfaces.Length>0,"Galaxy floor surface was not imported");
            var block=new MaterialPropertyBlock();
            r.mirroredOrigin=g.Stage.Fighters[0].Home.x>0 && surfaces.All(s=>{s.GetPropertyBlock(block);return Mathf.Abs(block.GetVector("_Origin").x-g.Stage.Fighters[0].Home.x)<.01f;});
            Require(r.mirroredOrigin,"Winner color originated from the wrong mirrored side");
            g.Preferences.mirrorPanels=false;g.ApplyPreferences();
            yield return null;
            Require(surfaces.All(s=>{s.GetPropertyBlock(block);return Mathf.Abs(block.GetVector("_Origin").x-g.Stage.Fighters[0].transform.position.x)<.01f;}),"Moving a winner left stale floor lighting");
            var customFighter=g.Stage.Fighters[0];string knownId=customFighter.State.Id,knownName=customFighter.State.Name,knownColor=customFighter.Look.color,knownPreset=customFighter.Look.presetId;
            customFighter.State.Id="custom-model";customFighter.State.Name="自定义选手";customFighter.Look.presetId="";customFighter.Look.color="#55CCAA";customFighter.ApplyLook(customFighter.Look);
            display.ResetDisplay();display.ShowResult(new ArenaDuelResult("custom","custom",customFighter.State.Id,false,true));yield return null;
            r.customIdentity=display.Winner==customFighter.State.Id && surfaces.All(s=>{s.GetPropertyBlock(block);return block.GetFloat("_Emblem")==0 && block.GetColor("_WinnerColor")==customFighter.Tint;});
            Require(r.customIdentity,"Unknown model did not use its own name and color");
            yield return Photo(dir,"custom-model");customFighter.State.Id=knownId;customFighter.State.Name=knownName;customFighter.Look.color=knownColor;customFighter.Look.presetId=knownPreset;
            g.Preferences.Avatar(ids[0],0).presetId="chatgpt";g.Preferences.Avatar(ids[1],1).presetId="claude";
            g.Preferences.Avatar(ids[0],0).color=ArenaModelPresets.Find("chatgpt").Color;
            p=Packet("-galaxy-live");int beforeHits=g.Duel.AppliedHits, beforeCelebrations=display.CelebrationCount;
            bool premature=false;
            Action<CompetitionRound> hit=roundHit=>{if(display.Winner!=null)premature=true;};g.Duel.RoundHit+=hit;
            g.Duel.Receive(p,false);g.Duel.Receive(p,false);
            yield return Until(()=>g.Finished && g.Duel.Idle);
            g.Duel.RoundHit-=hit;
            r.hits=g.Duel.AppliedHits-beforeHits;r.celebrations=display.CelebrationCount-beforeCelebrations;
            r.winnerAfterHit=!premature && r.hits==8 && display.Winner==p.snapshot.winner && display.Championship;
            Require(r.winnerAfterHit && r.celebrations==1,"Final celebration did not follow exactly one authoritative duel result");
            yield return Photo(dir,"champion");
            g.Duel.Receive(p,false);yield return null;
            r.duplicateSafe=display.CelebrationCount-beforeCelebrations==1;Require(r.duplicateSafe,"Duplicate packet replayed celebration");
            g.Duel.Receive(p,true);yield return null;
            r.reconnectStatic=!display.Animating && display.Winner==p.snapshot.winner && display.CelebrationCount-beforeCelebrations==1;
            var clocks=new float[surfaces.Length];for(int i=0;i<surfaces.Length;i++){surfaces[i].GetPropertyBlock(block);clocks[i]=block.GetFloat("_Clock");}yield return new WaitForSecondsRealtime(.2f);
            bool clockStable=true;for(int i=0;i<surfaces.Length;i++){surfaces[i].GetPropertyBlock(block);if(!Mathf.Approximately(clocks[i],block.GetFloat("_Clock")))clockStable=false;}
            r.reconnectStatic &= clockStable;
            Require(r.reconnectStatic,"Reconnect replayed the old celebration");
            foreach(string reason in new[]{"tie","failure","interrupted","stopped"})
            {
                string status=reason=="stopped"?"stopped":"waiting";
                var pending=Packet("-"+reason);pending.snapshot.status=status;pending.snapshot.reason=reason;pending.snapshot.winner=null;pending.snapshot.duels[0].status=status;pending.snapshot.duels[0].winner=null;
                g.Duel.Receive(pending,true);yield return null;Require(display.Winner==null,"Unsettled or stopped match declared a winner");
            }
            r.noFalseWinner=true;
            g.Preferences.motion=0;g.ApplyPreferences();p=Packet("-galaxy-quiet");g.Duel.Receive(p,false);yield return Until(()=>g.Finished && g.Duel.Idle);
            r.quietMode=!display.Animating && display.Winner==p.snapshot.winner;Require(r.quietMode,"Motion-off settlement failed");
            g.Preferences.motion=1;g.ApplyPreferences();
            // Capture both victory scopes independently of performance measurement.
            if(!Application.isEditor)Screen.SetResolution(1920,1080,FullScreenMode.Windowed);
            yield return new WaitForSecondsRealtime(.7f);
            yield return VictoryClip(g,Path.Combine(dir,"celebration-video","duel"),true);r.rightWinner=true;
            yield return VictoryClip(g,Path.Combine(dir,"celebration-video","champion"),false);
            if(!Application.isEditor)Screen.SetResolution(3840,2160,FullScreenMode.FullScreenWindow);
            yield return new WaitForSecondsRealtime(2);
            p=Packet("-galaxy-performance");g.Duel.Receive(p,false);yield return new WaitForSecondsRealtime(3);
            var times=new List<float>();double previous=Time.realtimeSinceStartupAsDouble;float until=Time.unscaledTime+28;
            while(Time.unscaledTime<until){yield return null;double now=Time.realtimeSinceStartupAsDouble;times.Add((float)((now-previous)*1000));previous=now;}
            r.width=Screen.width;r.height=Screen.height;r.performanceFrames=times.Count;r.fps=1000/times.Average();times.Sort();r.frameP95=times[(int)(times.Count*.95f)];
        }
    }
}
