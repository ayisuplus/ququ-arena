using System;
using System.Collections;
using System.Linq;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;

namespace QuQu
{
    public partial class ArenaDesktopHub
    {
        public void Engineering()=>RestoreWorkspace("engineering",EngineeringForm,new JObject{["task"]="",["agents"]=new JArray("codex"),["repeats"]=1,["budgetMinutes"]=5});
        void EngineeringForm(JObject config)
        {
            var panel=WorkPage("工程实验 · 配置",Workbench);var edit=Editing(config);
            var taskText=UI.Label(panel,"正在读取任务与环境…",26,111,1400,63,21,Mint);
            UI.Button(panel,"选择任务",26,194,325,()=>Request("/api/engineering/catalog",catalog=>Choose("工程任务",catalog["tasks"].ToArray(),r=>S(r,"title"),r=>{config["task"]=r["id"];config.Remove("requestId");EngineeringForm(config);},()=>EngineeringForm(config))));
            UI.Button(panel,"任务与验收条件",371,194,326,()=>Request("/api/engineering/catalog",catalog=>{var task=catalog["tasks"].FirstOrDefault(r=>S(r,"id")==S(config,"task"));Document("需求与冻结验收",Pretty(task),()=>EngineeringForm(config));}));
            UI.Label(panel,"参赛 Agent",26,269,670,28,19);
            var agents=(JArray)config["agents"];
            foreach(var pair in new[]{new{Id="codex",X=26},new{Id="claude",X=371}}) {
                var button=UI.Button(panel,(agents.Values<string>().Contains(pair.Id)?"✓ ":"")+pair.Id,pair.X,306,326,()=>{});
                button.onClick.AddListener(()=>{var old=agents.FirstOrDefault(a=>(string)a==pair.Id);if(old!=null)old.Remove();else agents.Add(pair.Id);config.Remove("requestId");button.GetComponentInChildren<TMP_Text>().text=(agents.Values<string>().Contains(pair.Id)?"✓ ":"")+pair.Id;});
            }
            Field(panel,"重复次数（1–5）",config,"repeats",26,384,670,true);
            Field(panel,"每次预算 / 分钟",config,"budgetMinutes",26,490,670,true);
            UI.Button(panel,"重新检测环境与 Agent",744,194,710,()=>Request("/api/engineering/catalog?refresh=1",r=>Document("环境与 Agent",Pretty(r["environment"])+"\n\n"+Pretty(r["agents"]),()=>EngineeringForm(config))));
            UI.Label(panel,"代码实验运行在现有 Docker 隔离环境。\n验收由冻结测试执行；结果包括差异、测试与日志。\n启动后可以离开本页，在任务中心继续查看。",744,275,710,178,23);
            UI.Button(panel,"实验记录 / 比较",744,482,710,()=>RunList("engineering",Engineering));
            UI.Button(panel,"保存当前配置",744,546,710,()=>SaveWorkspace("engineering",config));
            var start=UI.Button(panel,"启动工程实验",26,724,1428,()=>{},true);
            start.onClick.AddListener(()=>{start.interactable=false;Submit("/api/engineering/runs",config,r=>EngineeringRun(S(r,"id"),Engineering),_=>start.interactable=true);});
            Request("/api/engineering/catalog",catalog=>{var task=catalog["tasks"].FirstOrDefault(r=>S(r,"id")==S(config,"task"));taskText.text=(task==null?"请选择一个任务":S(task,"title"))+"  ·  "+S(catalog["environment"],"message");});
            Guard(()=>config.ToString()!=edit.Baseline,done=>SaveWorkspace("engineering",config,done));
        }
        public void Harness()=>RestoreWorkspace("harness",HarnessForm,new JObject{["benchmark"]="engineering",["tasks"]=new JArray(),["profiles"]=new JArray(),["model"]="",["judge"]="",["split"]="development",["repeats"]=1,["budget"]=new JObject{["timeMs"]=300000,["maxCalls"]=12,["maxOutputTokens"]=2048}});
        void HarnessForm(JObject config)
        {
            var panel=WorkPage("多阶段实验 · 配置",Workbench);var edit=Editing(config);
            UI.Button(panel,"基准："+S(config,"benchmark"),26,112,697,()=>Request("/api/harness/catalog",catalog=>Choose("选择基准",catalog["benchmarks"].ToArray(),r=>S(r,"title"),r=>{config["benchmark"]=r["id"];config["tasks"]=new JArray();config.Remove("requestId");HarnessForm(config);},()=>HarnessForm(config))));
            UI.Button(panel,"选择任务 · "+(config["tasks"] as JArray)?.Count,746,112,708,()=>HarnessSelection(config,"tasks"));
            UI.Button(panel,"参赛模型："+S(config,"model"),26,178,697,()=>PickModels(config,"model",false,()=>HarnessForm(config)));
            UI.Button(panel,"裁判模型："+S(config,"judge"),746,178,708,()=>PickModels(config,"judge",false,()=>HarnessForm(config)));
            UI.Button(panel,"扩展配置 · "+(config["profiles"] as JArray)?.Count,26,244,697,()=>HarnessSelection(config,"profiles"));
            UI.Button(panel,"新建 / 导入扩展配置",746,244,708,()=>ProfileEditor(null,()=>HarnessForm(config)));
            var split=UI.Button(panel,S(config,"split")=="holdout"?"留出集":"开发集",26,314,697,()=>{});
            split.onClick.AddListener(()=>{config["split"]=S(config,"split")=="holdout"?"development":"holdout";config.Remove("requestId");split.GetComponentInChildren<TMP_Text>().text=S(config,"split")=="holdout"?"留出集":"开发集";});
            Field(panel,"重复次数（1–5）",config,"repeats",746,307,708,true);
            var budget=(JObject)config["budget"];
            Field(panel,"每次时间预算 / 毫秒",budget,"timeMs",26,412,451,true).onValueChanged.AddListener(_=>config.Remove("requestId"));
            Field(panel,"最多调用次数（1–40）",budget,"maxCalls",502,412,451,true).onValueChanged.AddListener(_=>config.Remove("requestId"));
            Field(panel,"单次输出 Token 上限",budget,"maxOutputTokens",978,412,476,true).onValueChanged.AddListener(_=>config.Remove("requestId"));
            UI.Label(panel,"基础 Pi 配置自动加入比较。单次最多 120 个试验。\n已用于开发的任务不能再标为留出集；比较资格和统计由后台判断。",26,519,1428,84,21);
            UI.Button(panel,"实验记录 / 结果对比",26,619,697,()=>RunList("harness",Harness));
            UI.Button(panel,"保存当前配置",746,619,708,()=>SaveWorkspace("harness",config));
            var start=UI.Button(panel,"启动多阶段实验",26,724,1428,()=>{},true);
            start.onClick.AddListener(()=>{start.interactable=false;Submit("/api/harness/runs",config,r=>HarnessRun(S(r,"id"),Harness),_=>start.interactable=true);});
            Guard(()=>config.ToString()!=edit.Baseline,done=>SaveWorkspace("harness",config,done));
        }
        void HarnessSelection(JObject config,string field)
        {
            WorkPage("选择实验内容",()=>HarnessForm(config));
            Request("/api/harness/catalog",catalog=>{
                var rows=(field=="tasks"?catalog["benchmarks"].FirstOrDefault(r=>S(r,"id")==S(config,"benchmark"))?["tasks"]:catalog["profiles"])?.Where(r=>S(r,"id")!="baseline").ToArray()??Array.Empty<JToken>();
                var list=(JArray)config[field];
                void Draw()=>Choose(field=="tasks"?"选择任务 · Esc 返回":"选择配置 · 基础 Pi 自动加入",rows,r=>(list.Values<string>().Contains(S(r,"id"))?"✓ ":"")+S(r,field=="tasks"?"title":"name"),r=>{var old=list.FirstOrDefault(v=>(string)v==S(r,"id"));if(old!=null)old.Remove();else list.Add(S(r,"id"));config.Remove("requestId");Draw();},()=>HarnessForm(config));
                Draw();
            });
        }
        void RunList(string kind,Action back)
        {
            var panel=WorkPage(kind=="engineering"?"工程实验记录":"多阶段实验记录",back);
            UI.Button(panel,"刷新",1240,112,214,()=>RunList(kind,back));
            UI.Button(panel,"选择两项比较",26,112,1192,()=>CompareRuns(kind,()=>RunList(kind,back)));
            Request("/api/"+kind+"/runs",data=>Table(panel,data.ToArray(),r=>S(r,"title"),r=>Status(S(r,"status"))+" · "+S(r,"createdAt")+" · "+S(r,"id"),r=>ExperimentRun(kind,S(r,"id"),()=>RunList(kind,back))));
        }
        void EngineeringRun(string id,Action back)=>ExperimentRun("engineering",id,back);
        void HarnessRun(string id,Action back)=>ExperimentRun("harness",id,back);
        void ExperimentRun(string kind,string id,Action back)
        {
            var panel=WorkPage((kind=="engineering"?"工程实验":"多阶段实验")+" · "+id,back);var owner=UI.Modal;JToken current=null;
            var status=UI.Label(panel,"正在读取…",26,112,1428,48,21,Mint);
            UI.Button(panel,"结果与比较统计",26,177,341,()=>Request("/api/"+kind+"/runs/"+id,latest=>ExperimentSummary(kind,latest,()=>ExperimentRun(kind,id,back))));
            UI.Button(panel,"冻结协议",386,177,341,()=>Document("实验协议",Pretty(current?["protocol"]),()=>ExperimentRun(kind,id,back)));
            UI.Button(panel,"导出完整记录",747,177,341,()=>{if(kind=="harness")Download("/api/harness/runs/"+id+"/export",id+".json");else Export(id+".json",Pretty(current));});
            UI.Button(panel,"中止实验",1107,177,347,()=>UI.Confirm("中止实验？","已产生的结果与产物将保留。",()=>Request("/api/"+kind+"/runs/"+id+"/cancel",_=>{},"POST",new JObject()),"中止"));
            UI.Button(panel,"刷新记录",26,737,697,()=>ExperimentRun(kind,id,back));
            UI.Button(panel,kind=="harness"?"重试失败评分":"执行日志",746,737,708,()=>{
                if(kind=="harness")Submit("/api/harness/runs/"+id+"/retry-grading",new JObject(),_=>ExperimentRun(kind,id,back));
                else Document("执行日志",Pretty(current?["events"]),()=>ExperimentRun(kind,id,back));
            });
            bool drawn=false;JToken[] trialRows=null;Action refreshRows=null;
            shell.Run(PollWorkbench("/api/"+kind+"/runs/"+id,owner,data=>{
                current=data;status.text=Status(S(data,"status"))+"  ·  "+data["trials"].Count()+" 次试验 · "+S(data,"createdAt");
                if(drawn){foreach(var row in trialRows){var fresh=data["trials"].FirstOrDefault(r=>S(r,"id")==S(row,"id"));if(fresh!=null)((JObject)row).Merge(fresh,new JsonMergeSettings{MergeArrayHandling=MergeArrayHandling.Replace});}refreshRows?.Invoke();return;}drawn=true;
                trialRows=data["trials"].ToArray();refreshRows=Table(panel,trialRows,r=>S(r,"id")+" · "+S(r,"agent",S(r,"taskId"))+" · "+S(r,"profileId"),r=>Status(S(r,"status"))+" · "+S(r,"error"),r=>Trial(kind,id,S(r,"id"),()=>ExperimentRun(kind,id,back)),26,239,1428,474);
            }));
        }
        IEnumerator PollWorkbench(string path,RectTransform owner,Action<JToken> render)
        {
            while(owner && owner==UI.Modal){yield return shell.Link.Json(path,"GET",null,r=>{if(owner && owner==UI.Modal)render(r);},e=>{if(owner && owner==UI.Modal)shell.Notify(e);});yield return new WaitForSecondsRealtime(2);}
        }
        void Trial(string kind,string id,string trialId,Action back)
        {
            var panel=WorkPage("试验 "+trialId,back);
            Request("/api/"+kind+"/runs/"+id+(kind=="harness"?"/trials/"+trialId:""),value=>{
                var trial=kind=="harness"?value:value["trials"].First(r=>S(r,"id")==trialId);
                UI.Label(panel,Status(S(trial,"status"))+"  "+S(trial,"error"),26,111,1428,69,21,Mint);
                string[] keys={"patch","checks","changes",kind=="harness"?"calls":"text",kind=="harness"?"rounds":"reasoning","events", "grade"};
                string[] labels={"代码差异","验收测试","提交文件","逐次调用 / 输出","轮次证据 / 推理","执行日志","评分证据"};
                for(int i=0;i<keys.Length;i++){int at=i;UI.Button(panel,labels[i],26+(i%2)*728,204+(i/2)*69,700,()=>TrialEvidence(kind,keys[at],trial,value,()=>Trial(kind,id,trialId,back)));}
                if(kind=="engineering")UI.Button(panel,"导出产物",26,506,1428,()=>Choose("选择产物",trial["artifacts"]?.ToArray()??Array.Empty<JToken>(),r=>S(r,"name"),r=>Download("/api/engineering/runs/"+id+"/artifacts/"+trialId+"/"+S(r,"name"),S(r,"name")),()=>Trial(kind,id,trialId,back)));
                UI.Button(panel,"查看 / 导出完整试验",26,584,1428,()=>Document("试验原始记录",Pretty(trial),()=>Trial(kind,id,trialId,back)));
                UI.Button(panel,"刷新",26,720,1428,()=>Trial(kind,id,trialId,back));
            });
        }
        void CompareRuns(string kind,Action back)
        {
            WorkPage("选择比较记录",back);
            Request("/api/"+kind+"/runs",runs=>Choose("选择左侧实验",runs.ToArray(),r=>S(r,"title")+" · "+S(r,"createdAt"),left=>Choose("选择右侧实验",runs.Where(r=>S(r,"id")!=S(left,"id")).ToArray(),r=>S(r,"title")+" · "+S(r,"createdAt"),right=>Request("/api/"+kind+"/compare?a="+Url(S(left,"id"))+"&b="+Url(S(right,"id")),result=>ExperimentComparison(kind,result,()=>CompareRuns(kind,back))),()=>CompareRuns(kind,back)),back));
        }
    }
}
