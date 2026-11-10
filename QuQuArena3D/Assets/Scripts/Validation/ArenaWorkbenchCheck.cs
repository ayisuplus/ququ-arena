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
    /** Opt-in tests use a separate data directory and an explicitly local model fixture. */
    [ArenaHarness("--arena-workbench-validation", true)]
    public static class ArenaWorkbenchCheck
    {
        static void Require(bool value,string message){if(!value)throw new Exception(message);}
        static Button Find(Transform root,string text)=>root?root.GetComponentsInChildren<Button>().FirstOrDefault(b=>b.gameObject.activeInHierarchy && b.GetComponentInChildren<TMP_Text>()?.text==text):null;
        static void Click(Transform root,string text){var b=Find(root,text);Require(b && b.interactable,"Missing button: "+text);b.onClick.Invoke();}
        static void Row(Transform root,string text){var label=root.GetComponentsInChildren<TMP_Text>().FirstOrDefault(t=>t.gameObject.activeInHierarchy && t.text.StartsWith(text,StringComparison.Ordinal));Require(label,"Missing row: "+text);var b=label.transform.parent.GetComponentsInChildren<Button>().FirstOrDefault();Require(b,"No row action: "+text);b.onClick.Invoke();}
        static IEnumerator Until(Func<bool> ready,float seconds=70){float end=Time.realtimeSinceStartup+seconds;while(!ready()){Require(Time.realtimeSinceStartup<end,"Workbench acceptance timed out");yield return null;}yield return null;}
        static IEnumerator Photo(string directory,string name){yield return new WaitForSecondsRealtime(.3f);yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(directory,name+".png"));}
        public static IEnumerator Run(ArenaGame g)
        {
            var args=Environment.GetCommandLineArgs();string dir=args[Array.IndexOf(args,"--arena-qa-output")+1];Directory.CreateDirectory(dir);
            var result=new JObject{["width"]=Screen.width,["height"]=Screen.height,["transport"]="localhost fixed-response fixture; not a cloud model"};
            var stack=new Stack<IEnumerator>();stack.Push(Check(g,dir,result));
            while(stack.Count>0){bool more;object current=null;try{more=stack.Peek().MoveNext();if(more)current=stack.Peek().Current;}catch(Exception e){result["error"]=e.ToString();Debug.LogException(e);break;}if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}if(current is IEnumerator child)stack.Push(child);else yield return current;}
            result["passed"]=result["error"]==null;File.WriteAllText(Path.Combine(dir,"workbench.json"),result.ToString());
            g.UI.ClearGuard();Application.Quit();
            yield return new WaitForSecondsRealtime(1);
            if(Find(g.UI.Modal,"保存并退出"))Click(g.UI.Modal,"保存并退出");
        }
        static IEnumerator Check(ArenaGame g,string dir,JObject result)
        {
            yield return Until(()=>g.Desktop.Ready,120);Require(g.Desktop.Owned,"No bundled backend");
            yield return Photo(dir,"home");g.Hub.Advanced();g.Stations.Skip();yield return Until(()=>!g.Stations.Moving);yield return Photo(dir,"lab");
            Click(g.UI.Modal,"打开原生工作台");yield return Photo(dir,"workbench");Require(g.Stations.Current==ArenaOrbitalNetwork.Place.Lab,"Workbench moved camera out of lab");
            Click(g.UI.Modal,"工程实验 →");yield return Until(()=>Find(g.UI.Modal,"启动工程实验"));yield return Photo(dir,"engineering");
            g.UI.ClearGuard();g.Hub.Harness();yield return Until(()=>Find(g.UI.Modal,"启动多阶段实验"));yield return Photo(dir,"harness");
            g.UI.ClearGuard();g.Hub.Authoring();yield return Until(()=>Find(g.UI.Modal,"新建草稿"));Click(g.UI.Modal,"新建草稿");yield return Until(()=>Find(g.UI.Modal,"保存草稿"));
            Click(g.UI.Modal,"index.ts");yield return null;
            var code=g.UI.Modal.GetComponentsInChildren<TMP_InputField>().First(f=>f.lineType==TMP_InputField.LineType.MultiLineNewline);
            code.text+="\n// 中文代码与缩进保留\n    const message = '科考站';\n";
            yield return Photo(dir,"source-editor");g.Escape();Require(g.UI.ConfirmationOpen,"Draft guard missing");yield return Photo(dir,"unsaved-draft");Click(g.UI.Root,"取消");Click(g.UI.Modal,"保存草稿");
            yield return Until(()=>Find(g.UI.Modal,"编辑源码与参数"));yield return Photo(dir,"draft-detail");result["draftEdit"]=true;
            g.UI.ClearGuard();g.Hub.Banks();Click(g.UI.Modal,"+ 新题库");yield return null;Row(g.UI.Modal,"多轮任务");yield return null;
            var fields=g.UI.Modal.GetComponentsInChildren<TMP_InputField>();fields[0].text="多轮中文验收";fields[1].text="原生题库与版本校验";
            Row(g.UI.Modal,"Q1");yield return null;fields=g.UI.Modal.GetComponentsInChildren<TMP_InputField>();fields.First(f=>f.lineType==TMP_InputField.LineType.MultiLineNewline).text="请根据给定资料写方案。\n代码：if (a < b && 中文) return 1;";
            Click(g.UI.Modal,"轮次材料与顺序");yield return null;yield return Photo(dir,"rounds");g.UI.Back();yield return null;Click(g.UI.Modal,"评分维度与权重");yield return null;yield return Photo(dir,"rubric");Click(g.UI.Modal,"应用评分标准");yield return null;Click(g.UI.Modal,"应用到题库草稿");yield return null;
            Click(g.UI.Modal,"保存题库");yield return Until(()=>Find(g.UI.Modal,"+ 新题库"));result["multiTurnEditor"]=true;
            // Configure a local transport through the native model editor.
            string modelId=null;g.Hub.Models();Click(g.UI.Modal,"+ 自定义接口");fields=g.UI.Modal.GetComponentsInChildren<TMP_InputField>();fields[0].text="本地固定响应 · 验证";fields[1].text="http://127.0.0.1:8199/v1";fields[2].text="fixture-win";fields[3].text="fixture-only";Click(g.UI.Modal,"保存");yield return Until(()=>Find(g.UI.Modal,"检测连接"));
            Click(g.UI.Modal,"检测连接");yield return new WaitForSecondsRealtime(2);yield return Photo(dir,"models");
            yield return g.Connection.Json("/api/models","GET",null,r=>modelId=(string)r["models"].First(m=>(string)m["source"]=="custom")["id"]);Require(modelId!=null,"Model not saved");
            // Build one deterministic QA bank for batch and Pi harness integration.
            string bank=null;yield return g.Connection.Json("/api/question-banks","POST",new JObject{["def"]=new JObject{["title"]="工作台固定响应题",["description"]="隔离数据",["mode"]="qa",["judge"]=new JObject{["kind"]="exact"}},["tasks"]=new JArray(new JObject{["id"]="Q1",["condition"]="test",["input"]="请只输出 1。",["target"]="1"})},r=>bank=(string)r["def"]["name"]);
            g.Hub.Evaluations();yield return Until(()=>Find(g.UI.Modal,"加入评测队列"));yield return Photo(dir,"evaluation-form");
            JToken settings=null;yield return g.Connection.Json("/api/workspace-settings","GET",null,r=>settings=r);
            settings["workspaces"]["evaluation"]=new JObject{["arena"]=bank,["models"]=new JArray(modelId),["limit"]=0,["freeOnly"]=false};
            yield return g.Connection.Json("/api/workspace-settings","PUT",settings,_=>{});
            g.UI.ClearGuard();g.Hub.Evaluations();yield return Until(()=>Find(g.UI.Modal,"加入评测队列"));Click(g.UI.Modal,"加入评测队列");yield return Until(()=>Find(g.UI.Modal,"请求暂停"));yield return Photo(dir,"evaluation-running");
            yield return new WaitForSecondsRealtime(5);yield return Photo(dir,"evaluation-result");g.Hub.TaskCenter();yield return Until(()=>Find(g.UI.Modal,"打开"));yield return Photo(dir,"task-center");
            JToken evaluations=null;yield return g.Connection.Json("/api/evaluations","GET",null,r=>evaluations=r);Require(evaluations["items"].Any(r=>(string)r["status"]=="completed"),"Batch did not complete");result["nativeBatch"]=true;
            string profile=null;yield return g.Connection.Json("/api/harness/catalog","GET",null,r=>profile=(string)r["profiles"].First(p=>((JArray)p["extensions"]).Count==1)["id"]);
            yield return g.Connection.Json("/api/workspace-settings","GET",null,r=>settings=r);
            settings["workspaces"]["harness"]=new JObject{["model"]=modelId,["benchmark"]=bank,["tasks"]=new JArray("Q1"),["profiles"]=new JArray(profile),["repeats"]=1,["split"]="development",["budget"]=new JObject{["timeMs"]=30000,["maxCalls"]=4,["maxOutputTokens"]=64}};
            yield return g.Connection.Json("/api/workspace-settings","PUT",settings,_=>{});
            g.UI.ClearGuard();g.Hub.Harness();yield return Until(()=>Find(g.UI.Modal,"启动多阶段实验"));Click(g.UI.Modal,"启动多阶段实验");yield return Until(()=>Find(g.UI.Modal,"结果与比较统计"));yield return Photo(dir,"harness-running");
            JToken harness=null;float deadline=Time.realtimeSinceStartup+60;do{yield return g.Connection.Json("/api/harness/runs","GET",null,r=>harness=r);if(harness.Any(r=>(string)r["status"]=="completed"))break;yield return new WaitForSecondsRealtime(1);}while(Time.realtimeSinceStartup<deadline);
            var finished=harness.FirstOrDefault(r=>(string)r["status"]=="completed");Require(finished!=null,"Pi fixture experiment did not complete");
            JToken full=null;yield return g.Connection.Json("/api/harness/runs/"+(string)finished["id"],"GET",null,r=>full=r);
            Require(full["trials"].Count()==2 && full["trials"].All(t=>(string)t["status"]=="completed" && (double?)t["score"]==1),"Pi trials failed or scored incorrectly: "+full["trials"]);
            Require(full["summary"].All(s=>(int)s["usage"]["knownCalls"]==(int)s["usage"]["calls"]),"Pi usage missing");
            File.WriteAllText(Path.Combine(dir,"harness-evidence.json"),full.ToString());result["piHarnessTransport"]=true;yield return Photo(dir,"harness-result");Click(g.UI.Modal,"结果与比较统计");yield return Photo(dir,"harness-statistics");
            yield return LargeReaders(g,dir,result);
            g.UI.ClearGuard();g.Hub.Analysis();yield return Photo(dir,"analysis");g.Hub.Rankings();yield return null;Click(g.UI.Modal,"多轮任务");yield return Photo(dir,"multi-turn-rankings");
            g.Hub.Workbench();Click(g.UI.Modal,"缩放 / 最大化");yield return Photo(dir,"workbench-compact");g.UI.Back();yield return null;Require(g.Stations.Current==ArenaOrbitalNetwork.Place.Lab,"Esc should first return to lab controls");g.UI.Back();Require(g.Stations.Current==ArenaOrbitalNetwork.Place.Arena,"Esc should restore arena camera");
            result["escFacilityNavigation"]=true;var frames=new List<float>();float until=Time.realtimeSinceStartup+6;while(Time.realtimeSinceStartup<until){yield return null;frames.Add(Time.unscaledDeltaTime*1000);}frames.Sort();result["performance"]=new JObject{["fps"]=1000/frames.Average(),["p95ms"]=frames[(int)(frames.Count*.95f)]};yield return Photo(dir,"arena");
            string opponent=null;yield return g.Connection.Json("/api/model-settings/custom","POST",new JObject{["name"]="本地固定响应 B",["baseUrl"]="http://127.0.0.1:8199/v1",["modelId"]="fixture-lose",["apiKey"]="fixture-only",["stream"]=true},_=>{});
            yield return g.Connection.Json("/api/models","GET",null,r=>opponent=(string)r["models"].First(m=>(string)m["modelId"]=="fixture-lose")["id"]);
            JToken concurrent=null;yield return g.Connection.Json("/api/harness/runs","POST",new JObject{["model"]=modelId,["benchmark"]=bank,["tasks"]=new JArray("Q1"),["profiles"]=new JArray(profile),["repeats"]=3,["split"]="development",["budget"]=new JObject{["timeMs"]=30000,["maxCalls"]=4,["maxOutputTokens"]=64}},r=>concurrent=r);
            Require(concurrent?["id"]!=null,"Concurrent experiment not created");g.Connection.Launch(new Launch{arena=bank,models=new[]{modelId,opponent},draw=new[]{modelId,opponent},limit=1});
            yield return Until(()=>g.Duel.Snapshot?.status=="running",40);frames.Clear();until=Time.realtimeSinceStartup+10;
            while(Time.realtimeSinceStartup<until){yield return null;frames.Add(Time.unscaledDeltaTime*1000);}frames.Sort();result["concurrentPerformance"]=new JObject{["fps"]=1000/frames.Average(),["p95ms"]=frames[(int)(frames.Count*.95f)],["seconds"]=10,["harness"]=concurrent["id"],["competition"]=g.Connection.Competition};yield return Photo(dir,"concurrent-arena");
            g.Hub.TaskCenter();yield return new WaitForSecondsRealtime(.3f);yield return Photo(dir,"concurrent-tasks");
            g.UI.CloseModal();Application.Quit();yield return Until(()=>Find(g.UI.Modal,"后台继续"));yield return Photo(dir,"exit-options");Click(g.UI.Modal,"取消");result["exitChoices"]=true;
        }
        static IEnumerator LargeReaders(ArenaGame g,string dir,JObject result)
        {
            const System.Reflection.BindingFlags flags=System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic;
            var rows=Enumerable.Range(0,10000).Select(i=>(JToken)new JObject{["id"]="entry-"+i.ToString("D5")}).ToArray();
            typeof(ArenaDesktopHub).GetMethod("Choose",flags).Invoke(g.Hub,new object[]{"一万条记录 · 固定测试数据",rows,(Func<JToken,string>)(r=>(string)r["id"]),(Action<JToken>)(_=>{}),(Action)g.Hub.Workbench});
            yield return null;
            Require(g.UI.Modal.GetComponentsInChildren<Button>().Length<20,"Long list created all row widgets");
            var scroll=g.UI.Modal.GetComponentInChildren<ScrollRect>();scroll.verticalNormalizedPosition=0;yield return null;
            Require(g.UI.Modal.GetComponentsInChildren<TMP_Text>().Any(t=>t.text=="entry-09999"),"Last virtual row missing");
            yield return Photo(dir,"large-list-bottom");
            g.UI.Modal.GetComponentInChildren<TMP_InputField>().text="entry-09999";yield return null;yield return null;
            Require(g.UI.Modal.GetComponentsInChildren<Button>().Count(b=>b.GetComponentInChildren<TMP_Text>()?.text=="打开")==1,"Long list filtering failed");
            string text=string.Concat(Enumerable.Repeat("代码与日志 0123456789\n",60000))+"最后一行证据";
            typeof(ArenaDesktopHub).GetMethod("Document",flags).Invoke(g.Hub,new object[]{"长日志 · 固定测试数据",text,(Action)g.Hub.Workbench,0,"",-1});
            yield return null;
            Require(g.UI.Modal.GetComponentsInChildren<TMP_InputField>().First(f=>f.readOnly).text.Length==12000,"Long log not paged");
            g.UI.Modal.GetComponentsInChildren<TMP_InputField>().First(f=>!f.readOnly).text="最后一行证据";Click(g.UI.Modal,"查找下一个");yield return null;
            Require(g.UI.Modal.GetComponentsInChildren<TMP_InputField>().First(f=>f.readOnly).text.Contains("最后一行证据"),"Cross-page log search failed");
            yield return Photo(dir,"large-log-search");result["largeReaders"]=new JObject{["rows"]=rows.Length,["characters"]=text.Length,["pageCharacters"]=12000};
        }
    }
}
