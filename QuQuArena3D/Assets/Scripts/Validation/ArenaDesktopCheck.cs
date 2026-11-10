using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace QuQu
{
    // Opt-in release acceptance. Uses isolated data and a localhost fixed-answer transport.
    [ArenaHarness("--arena-desktop-validation", true)]
    public static class ArenaDesktopCheck
    {
        static void Require(bool value,string message){if(!value)throw new Exception(message);}
        static Button Find(Transform root,string caption)=>root?root.GetComponentsInChildren<Button>().FirstOrDefault(b=>b.gameObject.activeInHierarchy&&b.GetComponentInChildren<TMP_Text>()?.text==caption):null;
        static void Click(Transform root,string caption){var b=Find(root,caption);Require(b&&b.interactable,"Missing button: "+caption);b.onClick.Invoke();}
        static void Contains(Transform root,string caption){var b=root.GetComponentsInChildren<Button>().FirstOrDefault(b=>b.gameObject.activeInHierarchy&&b.GetComponentInChildren<TMP_Text>()?.text.Contains(caption)==true);Require(b&&b.interactable,"Missing row: "+caption);b.onClick.Invoke();}
        static IEnumerator Until(Func<bool> ready,float seconds=45){float end=Time.realtimeSinceStartup+seconds;while(!ready()){Require(Time.realtimeSinceStartup<end,"Desktop acceptance timed out");yield return null;}yield return null;}
        static IEnumerator Photo(string directory,string name){yield return new WaitForSecondsRealtime(.3f);yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(directory,name+".png"));}
        static IEnumerator Measure(JObject result,string name,float seconds)
        {
            yield return new WaitForSecondsRealtime(1);
            var frames=new List<float>();float until=Time.realtimeSinceStartup+seconds;
            while(Time.realtimeSinceStartup<until){yield return null;frames.Add(Time.unscaledDeltaTime*1000);}
            frames.Sort();result[name]=new JObject{["frames"]=frames.Count,["fps"]=1000/frames.Average(),["p95ms"]=frames[(int)(frames.Count*.95f)]};
        }
        public static IEnumerator Run(IArenaTestShell shell)
        {
            var args=Environment.GetCommandLineArgs();string directory=args[Array.IndexOf(args,"--arena-qa-output")+1];Directory.CreateDirectory(directory);
            var result=new JObject{["width"]=Screen.width,["height"]=Screen.height};
            var stack=new Stack<IEnumerator>();stack.Push(Check(shell,directory,result,args.Contains("--arena-desktop-resume")));
            while(stack.Count>0)
            {
                bool more;object current=null;
                try{more=stack.Peek().MoveNext();if(more)current=stack.Peek().Current;}
                catch(Exception error){result["error"]=error.ToString();Debug.LogException(error);break;}
                if(!more){(stack.Pop()as IDisposable)?.Dispose();continue;}
                if(current is IEnumerator child)stack.Push(child);else yield return current;
            }
            result["passed"]=result["error"]==null;result["backendPid"]=shell.Desktop.ProcessId;
            File.WriteAllText(Path.Combine(directory,"desktop.json"),result.ToString());
            shell.UI.ClearGuard();
            Application.Quit(result["error"]==null?0:1);
        }
        static IEnumerator Check(IArenaTestShell shell,string dir,JObject result,bool resume)
        {
            yield return Until(()=>shell.Desktop.Ready,90);Require(shell.Desktop.Owned,"Player did not launch bundled backend");
            result["bundledBackend"]=true;
            if(resume)
            {
                Catalog catalog=null;yield return shell.Link.Request<Catalog>("/api/game/catalog",null,r=>catalog=r);
                var pending=catalog.competitions.First(c=>c.status=="waiting");
                shell.UI.CloseModal();shell.Link.Continue(pending.id);
                yield return Until(()=>shell.Duel.Snapshot?.status=="completed",65);result["resumed"]=true;
                yield return Photo(dir,"resumed-result");yield break;
            }
            yield return Measure(result,"homePerformance",3);yield return Photo(dir,"home");shell.UI.CloseModal();shell.Escape();Require(shell.Hud.MenuOpen,"Esc must open menu");
            yield return Photo(dir,"escape-menu");shell.Escape();Require(!shell.Hud.MenuOpen,"Esc must close menu");result["escapeMenu"]=true;
            string[] display={"验证模型 A · 中文 Code","验证模型 B · English"};string[] upstream={"fixture-win","fixture-lose"};
            for(int i=0;i<2;i++)
            {
                shell.Hub.Models();Click(shell.UI.Modal,"+ 自定义接口");var fields=shell.UI.Modal.GetComponentsInChildren<TMP_InputField>();
                fields[0].text=display[i];fields[1].text="http://127.0.0.1:8199/v1";fields[2].text=upstream[i];fields[3].text="local-fixture-key";
                Require(fields[3].contentType==TMP_InputField.ContentType.Password,"API key not masked");
                if(i==0){yield return Photo(dir,"model-edit");shell.Escape();Require(shell.UI.ConfirmationOpen,"Unsaved model guard missing");yield return Photo(dir,"unsaved-prompt");Click(shell.UI.Root,"取消");}
                Click(shell.UI.Modal,"保存");yield return Until(()=>Find(shell.UI.Modal,"+ 自定义接口"));
            }
            yield return Until(()=>Find(shell.UI.Modal,"编辑"));yield return Photo(dir,"model-list");
            JToken modelData=null;yield return shell.Link.Json("/api/models","GET",null,r=>modelData=r);
            var models=modelData["models"].Where(m=>(string)m["source"]=="custom").ToArray();Require(models.Length==2,"Native models did not persist");
            var ids=models.Select(m=>(string)m["id"]).ToArray();
            JToken probe=null;yield return shell.Link.Json("/api/model-settings/check","POST",new JObject{["id"]=ids[0]},r=>probe=r);Require((string)probe["state"]=="ready","API probe failed");result["models"]=true;
            shell.Hub.Banks();Click(shell.UI.Modal,"+ 新题库");var inputs=shell.UI.Modal.GetComponentsInChildren<TMP_InputField>();
            inputs[0].text="原生界面验证题库";inputs[1].text="中文 / English / 代码原样保存";
            string question="请只输出 1。\n代码：if (a < b && 中文) return 1;\n"+string.Join("\n",Enumerable.Range(1,30).Select(i=>"长题第 "+i+" 行：这是一段用于检查中文、分页与滚动阅读的原始文本。"));
            inputs[4].text=question;inputs[5].text="1";
            yield return Photo(dir,"question-editor");shell.Escape();Require(shell.UI.ConfirmationOpen,"Unsaved question guard missing");Click(shell.UI.Root,"取消");Click(shell.UI.Modal,"保存题库");
            yield return Until(()=>Find(shell.UI.Modal,"+ 新题库"));yield return Photo(dir,"question-list");
            JToken banks=null;yield return shell.Link.Json("/api/game/library/banks","GET",null,r=>banks=r);
            string bankId=(string)banks["items"].First(r=>(string)r["title"]=="原生界面验证题库")["id"];
            JToken document=null;yield return shell.Link.Json("/api/question-banks/"+bankId,"GET",null,r=>document=r);Require((string)document["tasks"][0]["input"]==question,"Question text changed");
            JToken pack=null;yield return shell.Link.Json("/api/game/library/banks/"+bankId+"/pack","GET",null,r=>pack=r);
            File.WriteAllText(Path.Combine(dir,"exported.ququ.json"),pack.ToString());
            JToken imported=null;yield return shell.Link.Json("/api/game/library/import","POST",pack,r=>imported=r);
            Require((string)imported["def"]["name"]!=bankId&&(string)imported["tasks"][0]["input"]==question,"Portable import/export changed content");result["questions"]=true;
            shell.Commentary.ShowSettings();yield return Until(()=>Find(shell.UI.Modal,"+ Pi 配置"));
            Click(shell.UI.Modal.Find("Panel/Scroll view/Viewport/Content/Source pi"),"配置");Contains(shell.UI.Modal,"选择模型");
            Contains(shell.UI.Modal,display[0]);var pi=shell.UI.Modal.GetComponentsInChildren<TMP_InputField>();pi[1].text="依据公开比赛信息，简洁中文解说。";Click(shell.UI.Modal,"保存并使用");
            yield return Until(()=>Find(shell.UI.Modal,"+ Pi 配置"));yield return Photo(dir,"commentary-sources");
            shell.ShowLobby();Click(shell.UI.Modal,"API / 自定义");
            yield return Until(()=>shell.UI.Modal.GetComponentsInChildren<Button>().Any(b=>b.GetComponentInChildren<TMP_Text>()?.text.Contains(display[0])==true)&&shell.UI.Modal.GetComponentsInChildren<Button>().Any(b=>b.GetComponentInChildren<TMP_Text>()?.text.Contains("[规则] 原生界面验证题库")==true));
            Contains(shell.UI.Modal,"[规则] 原生界面验证题库");Contains(shell.UI.Modal,display[0]);Contains(shell.UI.Modal,display[1]);
            shell.UI.Modal.GetComponentsInChildren<TMP_InputField>().Single().text="1";
            yield return Photo(dir,"lobby");Click(shell.UI.Modal,"抽签 / 检查配置 →");yield return Until(()=>Find(shell.UI.Modal,"锁定对阵并开赛"));
            yield return Photo(dir,"draw");Click(shell.UI.Modal,"锁定对阵并开赛");yield return Until(()=>shell.Duel.Snapshot?.status=="running");
            string competition=shell.Link.Competition;shell.Escape();Require(shell.Hud.MenuOpen&&shell.Duel.Snapshot.status=="running","Esc changed match state");shell.Escape();
            Click(shell.Hud.transform,"暂停");yield return Until(()=>shell.Duel.Snapshot?.pauseState=="paused");result["manualPause"]=true;yield return Photo(dir,"paused");Click(shell.Hud.transform,"继续");
            shell.Commentary.Open();Click(shell.Commentary.transform,"开启解说");
            yield return Until(()=>shell.Duel.Snapshot?.commentary?.entries?.Any(e=>e.status=="done")==true,60);result["pi"]=true;yield return Photo(dir,"pi-commentary");shell.Commentary.Close();
            yield return Until(()=>shell.Duel.Snapshot?.status=="completed",60);result["nativeMatch"]=true;
            yield return Until(()=>!shell.Duel.Presenting,30);yield return Photo(dir,"match-result");
            shell.Hub.History();yield return Until(()=>Find(shell.UI.Modal,"答卷"));yield return Photo(dir,"history");Click(shell.UI.Modal,"答卷");
            yield return Until(()=>shell.UI.Modal.GetComponentsInChildren<Button>().Any(b=>b.GetComponentInChildren<TMP_Text>()?.text.Contains("第 1 题")==true));Contains(shell.UI.Modal,"第 1 题");yield return Photo(dir,"answer-detail");
            Require(shell.UI.Modal.GetComponentsInChildren<TMP_Text>().Any(t=>t.text.Contains(question)),"History lost full question");result["history"]=true;
            shell.Hub.History();yield return Until(()=>Find(shell.UI.Modal,"回放"));Click(shell.UI.Modal,"回放");yield return Measure(result,"replayPerformance",6);yield return Photo(dir,"replay");
            // Legacy results are generated by the existing engine, then consumed through the native library.
            JToken battle=null;yield return shell.Link.Json("/api/game/battles","POST",new JObject{["arena"]=bankId,["models"]=new JArray(ids),["limit"]=1},r=>battle=r);
            Require(battle?["battle"]!=null,"Legacy report fixture failed");
            bool completed=false;float deadline=Time.realtimeSinceStartup+50;
            while(!completed&&Time.realtimeSinceStartup<deadline){yield return shell.Link.Json("/api/game/battles/"+(string)battle["battle"],"GET",null,r=>completed=r["frames"].Any(f=>(string)f["type"]=="done"));yield return new WaitForSecondsRealtime(.5f);}
            Require(completed,"Legacy engine did not finish");shell.Hub.History(true);yield return Until(()=>Find(shell.UI.Modal,"答卷"));yield return Photo(dir,"legacy-history");
            shell.Hub.Rankings();yield return Until(()=>Find(shell.UI.Modal,"生涯档案"));yield return Photo(dir,"rankings");Click(shell.UI.Modal,"生涯档案");yield return new WaitForSecondsRealtime(.5f);yield return Photo(dir,"career");result["rankings"]=true;
            shell.ShowSettings(3);yield return Photo(dir,"display-settings");shell.UI.CloseModal();
            // Leave one request in flight; the normal application exit path must save it as resumable.
            shell.Link.Launch(new Launch{arena=bankId,models=ids,draw=ids,limit=1});
            yield return Until(()=>shell.Link.Competition!=competition&&shell.Duel.Snapshot?.status=="running");
            result["pendingCompetition"]=shell.Link.Competition;result["exitWhileAnswering"]=true;
        }
    }
}
