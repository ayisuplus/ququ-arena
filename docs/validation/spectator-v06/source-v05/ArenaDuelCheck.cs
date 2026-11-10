using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
namespace QuQu
{
    public static class ArenaDuelCheck
    {
        [Serializable] public class Result { public bool passed, simultaneous, duplicates, finalAfterHit, quietMode, reconnect, customAvatars, network; public int rounds, hits, frames, width, height; public string error, graphics; }
        public static IEnumerator Run(ArenaGame g)
        {
            var args=Environment.GetCommandLineArgs(); int index=Array.IndexOf(args,"--arena-qa-output");
            string dir=index<0?"E:/projects/AI斗兽场/docs/validation/duel-v05/editor":Path.GetFullPath(args[index+1]);
            Directory.CreateDirectory(dir); Directory.CreateDirectory(Path.Combine(dir,"frames"));
            var result=new Result {graphics=SystemInfo.graphicsDeviceName};var steps=Check(g,dir,result);
            while(true) {bool more;object next;try{more=steps.MoveNext();next=more?steps.Current:null;}catch(Exception e){result.error=e.ToString();Debug.LogException(e);break;}if(!more){result.passed=true;break;}yield return next;}
            (steps as IDisposable)?.Dispose();File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(result,true));
            if(!Application.isEditor)Application.Quit(result.passed?0:1);
        }
        static IEnumerator Check(ArenaGame g,string dir,Result result)
        {
            yield return new WaitForSecondsRealtime(1);g.Connection.Disconnect();g.UI.CloseModal();Screen.SetResolution(1600,900,FullScreenMode.Windowed);
            yield return new WaitForSecondsRealtime(.8f);
            var packet=JsonUtility.FromJson<CompetitionPacket>(File.ReadAllText("E:/projects/AI斗兽场/docs/validation/duel-v05/fixture.json"));
            var ids=packet.snapshot.duels[0].players;
            g.Preferences.Avatar(ids[0],0).presetId="chatgpt";g.Preferences.Avatar(ids[1],1).presetId="claude";
            var impacts=new List<int>();g.Stage.OnImpact=b=>{g.Media.Hit(b);if(g.Duel.Round?.index==3)impacts.Add(Time.frameCount);};
            g.Duel.Receive(packet,false);g.Duel.Receive(packet,false);
            float deadline=Time.unscaledTime+55, next=0;bool shot=false,both=false,last=false;
            while(!g.Finished && Time.unscaledTime<deadline)
            {
                if(g.Duel.Presenting) Require(!g.Stage.Fighters.Any(f=>f.Celebrating),"Winner announced during last attack");
                Require(g.Stage.Fighters.Count==2,"More than two fighters in arena");
                yield return new WaitForEndOfFrame();
                if(Time.unscaledTime>=next){Capture(Path.Combine(dir,"frames",result.frames.ToString("D5")+".jpg"));result.frames++;next=Time.unscaledTime+1f/12;}
                if(!shot && g.Duel.Presenting && UnityEngine.Object.FindObjectsByType<ArenaDivineEffect>(FindObjectsSortMode.None).Length>0) {shot=true;Capture(Path.Combine(dir,"duel.png"));}
                if(!both && g.Duel.Round?.index==3 && g.Duel.Presenting) {both=true;Capture(Path.Combine(dir,"simultaneous.png"));}
                if(!last && g.Duel.Round?.index==packet.snapshot.duels[0].rounds.Length && g.Duel.Presenting) {last=true;Capture(Path.Combine(dir,"last-cast.png"));}
            }
            Require(g.Finished,"Presentation timed out");
            result.rounds=g.Duel.PresentedRounds;result.hits=g.Duel.AppliedHits;result.duplicates=result.hits==packet.snapshot.duels[0].rounds.Length;
            result.simultaneous=impacts.Count==2 && impacts[0]==impacts[1];
            result.finalAfterHit=g.Stage.Fighters.Single(f=>f.State.Id==packet.snapshot.winner).Celebrating && !g.Duel.Presenting;
            result.customAvatars=g.Stage.Fighters.All(f=>f.GetComponentInChildren<ArenaDivinePose>()?.Ready==true);
            Require(result.duplicates&&result.simultaneous&&result.finalAfterHit&&result.customAvatars,"Settlement / simultaneous impact / avatar assertion failed");
            yield return new WaitForEndOfFrame();Capture(Path.Combine(dir,"winner.png"));
            g.ToggleSpectator();
            yield return new WaitForSecondsRealtime(1);yield return new WaitForEndOfFrame();Capture(Path.Combine(dir,"large-screen.png"));
            result.width=Screen.width;result.height=Screen.height;
            int hits=g.Duel.AppliedHits;g.Duel.Receive(packet,true);yield return new WaitForSecondsRealtime(.4f);
            result.reconnect=g.Duel.AppliedHits==hits && !g.Stage.Fighters.Any(f=>f.Busy);Require(result.reconnect,"Reconnect replayed old attacks");
            g.ToggleSpectator();yield return new WaitForSecondsRealtime(.8f);g.Stage.Motion=0;g.Preferences.motion=0;
            packet.id+="-quiet";packet.snapshot.id=packet.id;g.Duel.Receive(packet,false);
            yield return new WaitForSecondsRealtime(.8f);
            result.quietMode=g.Finished && !g.Stage.Fighters.Any(f=>f.Busy) && g.Duel.AppliedHits==hits+packet.snapshot.duels[0].rounds.Length;
            Require(result.quietMode,"Motion off changed settlement or stalled playback");
            g.Duel.ShowBracket();yield return new WaitForEndOfFrame();Capture(Path.Combine(dir,"bracket.png"));g.UI.CloseModal();
            // Real HTTP path and built-in mock contestants; never invokes a paid model.
            g.Connection.Launch(new Launch{arena="tongjia-pinyin",models=ids,draw=ids,limit=1,demo=true});
            deadline=Time.unscaledTime+40;
            while(Time.unscaledTime<deadline) {yield return new WaitForSecondsRealtime(.2f);if(g.Duel.Snapshot?.id==g.Connection.Competition && new[]{"waiting","completed"}.Contains(g.Duel.Snapshot.status))break;}
            result.network=g.Duel.Snapshot?.id==g.Connection.Competition && g.Duel.Snapshot?.duels?.Length==1;
            Require(result.network,"Mock HTTP competition failed: "+g.Connection.LastError);
        }
        static void Capture(string path)
        {
            var image=ScreenCapture.CaptureScreenshotAsTexture();var pixels=image.GetPixels32();int lit=0;
            for(int i=0;i<pixels.Length;i+=97)if(pixels[i].r+pixels[i].g+pixels[i].b>30)lit++;
            Require(lit>pixels.Length/970,"Black rendered frame");File.WriteAllBytes(path,path.EndsWith(".jpg")?image.EncodeToJPG(87):image.EncodeToPNG());UnityEngine.Object.Destroy(image);
        }
        static void Require(bool value,string message){if(!value)throw new Exception(message);}
    }
}
