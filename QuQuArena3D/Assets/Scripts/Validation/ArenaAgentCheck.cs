using System;
using System.Collections;
using System.IO;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
namespace QuQu
{
    // Opt-in player acceptance against the isolated fixture server, never the user's account.
    [ArenaHarness("--arena-agent-validation", false)]
    public static class ArenaAgentCheck
    {
        [Serializable] class Result { public bool passed,lobby,help,api,preview,identity,settlement,reader; public int hits; public string error; }
        public static IEnumerator Run(ArenaGame g)
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--arena-qa-output");
            string dir=at>=0?args[at+1]:Path.Combine(Application.temporaryCachePath,"native-agents-v07");Directory.CreateDirectory(dir);
            var r=new Result();var steps=Check(g,dir,r);
            while(true){bool more;object next;try{more=steps.MoveNext();next=more?steps.Current:null;}catch(Exception e){r.error=e.ToString();break;}if(!more)break;yield return next;}
            r.passed=string.IsNullOrEmpty(r.error)&&r.lobby&&r.help&&r.api&&r.preview&&r.identity&&r.settlement&&r.reader;
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(r,true));if(!Application.isEditor)Application.Quit(r.passed?0:1);
        }
        static Button Button(ArenaGame g,string text)=>g.UI.Modal.GetComponentsInChildren<Button>().FirstOrDefault(b=>b.GetComponentInChildren<TMP_Text>()?.text.Contains(text)==true);
        static void Click(ArenaGame g,string text){var b=Button(g,text);if(!b)throw new Exception("Missing button: "+text);b.onClick.Invoke();}
        static string Text(ArenaGame g)=>string.Join("\n",g.UI.Modal.GetComponentsInChildren<TMP_Text>().Select(t=>t.text));
        static IEnumerator Ready(ArenaGame g,string text){float end=Time.realtimeSinceStartup+15;while(!Text(g).Contains(text)){if(Time.realtimeSinceStartup>end)throw new Exception("UI timeout: "+text);yield return null;}}
        static IEnumerator Check(ArenaGame g,string dir,Result r)
        {
            if(g.Connection.BaseUrl!="http://127.0.0.1:8194")throw new Exception("This check requires the isolated fixture server on 8194");
            Screen.SetResolution(1920,1080,FullScreenMode.Windowed);g.ShowLobby();yield return Ready(g,"claude-fixture");
            r.lobby=Text(g).Contains("订阅额度");yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"lobby.png"));
            Click(g,"连接帮助");yield return null;r.help=Text(g).Contains("游戏不自动改用付费 API");Click(g,"返回大厅");yield return Ready(g,"claude-fixture");
            Click(g,"API / 自定义");yield return Ready(g,"自定义接口（界面模拟）");r.api=Text(g).Contains("API 计费");Click(g,"本机 Agent");yield return Ready(g,"claude-fixture");
            Click(g,"Codex · gpt-fixture");Click(g,"Claude Code · claude-fixture");Click(g,"模拟验收题库");
            var count=g.UI.Modal.GetComponentsInChildren<TMP_InputField>().First(f=>!f.text.StartsWith("http"));count.text="2";
            Click(g,"抽签 / 检查配置");yield return null;r.preview=Text(g).Contains("[订阅]")&&Text(g).Contains("无裁判调用");
            yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"draw.png"));Click(g,"锁定对阵并开赛");
            float end=Time.realtimeSinceStartup+40;bool saved=false;
            while(!g.Finished){if(Time.realtimeSinceStartup>end)throw new Exception("Match timeout: "+g.Connection.LastError);if(!saved&&g.Duel.PresentedPhase=="clash"){saved=true;yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"clash.png"));}yield return null;}
            var s=g.Duel.Snapshot;r.identity=s.config.native.Length==2&&s.config.native.All(m=>m.billing=="subscription"&&m.version=="fixture-no-model-calls");
            r.hits=g.Duel.AppliedHits;r.settlement=r.hits==2&&s.winner=="agent:codex/gpt-fixture"&&s.duels[0].hp.Min()==60;
            g.Reader.Open();g.Reader.Current();yield return null;r.reader=g.Reader.FullText.Contains("正确")&&g.Reader.FullText.Contains("错误");
            yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"result-reader.png"));g.Reader.Close();
            g.Duel.ShowBracket();Click(g,"模型 / 费用");yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"execution.png"));
        }
    }
}
