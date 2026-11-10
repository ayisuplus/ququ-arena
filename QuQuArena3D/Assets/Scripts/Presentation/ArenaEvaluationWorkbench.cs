using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;

namespace QuQu
{
    public partial class ArenaDesktopHub
    {
        public void Evaluations()=>RestoreWorkspace("evaluation",EvaluationForm,new JObject{["arena"]="",["models"]=new JArray(),["limit"]=0,["judge"]="",["freeOnly"]=true});
        void EvaluationForm(JObject config)
        {
            var panel=WorkPage("批量评测 · 多模型同题作答",Workbench);var edit=Editing(config);
            UI.Button(panel,"题库："+S(config,"arena"),26,114,1428,()=>Request("/api/game/library/banks",data=>Choose("选择题库",data["items"].ToArray(),r=>S(r,"title")+" / "+S(r,"mode")+" / "+r["count"]+" 题",r=>{config["arena"]=r["id"];config.Remove("requestId");EvaluationForm(config);},()=>EvaluationForm(config))));
            UI.Button(panel,"选择参赛模型 · "+config["models"].Count()+" 个",26,185,697,()=>PickModels(config,"models",true,()=>EvaluationForm(config)));
            UI.Button(panel,"阵容预设",747,185,708,()=>Lineups(config,()=>EvaluationForm(config)));
            var roster=UI.Multiline(panel,string.Join("\n",config["models"].Values<string>()),26,252,697,130,"尚未选择选手",100000);roster.readOnly=true;
            Field(panel,"题量 · 0 表示全部",config,"limit",747,251,708,true);
            var free=UI.Button(panel,(bool?)config["freeOnly"]==true?"OpenRouter：仅免费模型":"OpenRouter：允许已选付费模型",747,357,708,()=>{});
            free.onClick.AddListener(()=>{config["freeOnly"]=(bool?)config["freeOnly"]!=true;config.Remove("requestId");free.GetComponentInChildren<TMP_Text>().text=(bool?)config["freeOnly"]==true?"OpenRouter：仅免费模型":"OpenRouter：允许已选付费模型";});
            UI.Button(panel,"API 裁判："+S(config,"judge"),26,417,697,()=>{config.Remove("judgeAgent");PickModels(config,"judge",false,()=>EvaluationForm(config));});
            UI.Button(panel,"Agent 裁判："+S(config,"judgeAgent","未选择"),747,417,708,()=>{string old=S(config,"judgeAgent");config["judgeAgent"]=old=="codex"?"claude":old=="claude"?"":"codex";config["judge"]="";config.Remove("requestId");EvaluationForm(config);});
            UI.Label(panel,"普通问答使用原评分规则；开放题与多轮任务可使用 Codex、Claude 或 API 裁判。\n模型数与题量沿用批量评测规则，超过并发数量的调用由后台排队。",26,488,1428,85,21);
            UI.Button(panel,"查看队列与记录",26,612,697,EvaluationList);
            UI.Button(panel,"保存配置",747,612,708,()=>SaveWorkspace("evaluation",config));
            var start=UI.Button(panel,"加入评测队列",26,737,1428,()=>{},true);
            start.onClick.AddListener(()=>{start.interactable=false;Submit("/api/evaluations",config,r=>EvaluationRun(S(r,"id"),EvaluationList),_=>start.interactable=true);});
            Guard(()=>config.ToString()!=edit.Baseline,done=>SaveWorkspace("evaluation",config,done));
        }
        void EvaluationList()
        {
            var panel=WorkPage("批量评测队列与记录",Evaluations);
            UI.Button(panel,"刷新",26,112,697,EvaluationList);UI.Button(panel,"已归档战报 / 回放",747,112,708,()=>History(true));
            Request("/api/evaluations",data=>{
                var rows=(JArray)(data["items"]??new JArray());
                if(data["running"] is JObject running && !rows.Any(r=>S(r,"id")==S(running,"id")))rows.Insert(0,new JObject{["id"]=running["id"],["title"]=running["arena"],["status"]="running"});
                foreach(var queued in data["queue"]??new JArray())if(!rows.Any(r=>S(r,"id")==S(queued,"id")))rows.Add(new JObject{["id"]=queued["id"],["title"]=queued["arena"],["status"]="queued"});
                Table(panel,rows.ToArray(),r=>S(r,"title"),r=>Status(S(r,"status"))+" · "+S(r,"createdAt")+" · "+S(r,"id"),r=>EvaluationRun(S(r,"id"),EvaluationList));
            });
        }
        void EvaluationRun(string id,Action back)
        {
            var panel=WorkPage("批量评测 · "+id,back);var owner=UI.Modal;JToken current=null;
            var status=UI.Label(panel,"连接中…",26,110,1428,66,21,Mint);
            UI.Button(panel,"请求暂停",26,194,267,()=>Request("/api/battles/"+id+"/control",_=>shell.Notify("已请求暂停；后台到安全检查点后生效。"),"POST",new JObject{["action"]="pause"}));
            UI.Button(panel,"继续",316,194,267,()=>{
                if(new[]{"waiting","interrupted"}.Contains(S(current,"status")))Submit("/api/evaluations/"+id+"/resume",new JObject(),_=>EvaluationRun(id,back));
                else Request("/api/battles/"+id+"/control",_=>{},"POST",new JObject{["action"]="resume"});
            });
            UI.Button(panel,"终止评测",606,194,267,()=>UI.Confirm("终止这场评测？","保留已完成答卷。终止不会记作完整比赛结算。",()=>Request("/api/battles/"+id+"/control",_=>{},"POST",new JObject{["action"]="stop"}),"终止"));
            UI.Button(panel,"成绩与结算",896,194,268,()=>EvaluationSummary(current?["frames"]?.LastOrDefault(f=>S(f,"type")=="done"),()=>EvaluationRun(id,back)));
            UI.Button(panel,"完整答卷",1188,194,266,()=>EvaluationAnswers(id,current,()=>EvaluationRun(id,back)));
            var progress=UI.Multiline(panel,"",26,262,1428,340,"等待题目与执行状态",50000);progress.readOnly=true;
            UI.Button(panel,"重试失败评分",26,630,697,()=>{var done=current?["frames"]?.LastOrDefault(f=>S(f,"type")=="done");string file=S(done,"resultFile");if(file.Length==0){shell.Notify("请等答卷归档后重试评分。");return;}Submit("/api/battles/"+id+"/retry-grading",new JObject{["file"]=file},_=>{});});
            UI.Button(panel,"导出现场记录",747,630,708,()=>Export(id+"-snapshot.json",Pretty(current)));
            UI.Button(panel,"编辑题库 / 补题后新建评测",26,732,697,Banks);
            UI.Button(panel,"查看历史战报与回放",747,732,708,()=>History(true));
            shell.Run(PollWorkbench("/api/evaluations/"+id,owner,data=>{
                current=data;var frames=data["frames"];var start=frames.LastOrDefault(f=>S(f,"type")=="start");var control=frames.LastOrDefault(f=>S(f,"type")=="control");
                string state=S(data,"status");if(state=="running")state=S(control,"state","running");status.text=S(start,"title")+"  ·  "+Status(state)+"\n"+S(frames.LastOrDefault(f=>S(f,"type")=="error"),"message");
                // Only replace when content changes, preserving the reader's selection and scroll.
                var rounds=frames.Where(f=>S(f,"type")=="round"||S(f,"type")=="stage").TakeLast(2);
                string text=string.Join("\n\n",rounds.Select(r=>S(r,"taskId")+"\n"+S(r,"prompt")))+"\n\n"+string.Join("\n",frames.Where(f=>S(f,"type")=="model").TakeLast(16).Select(r=>S(r,"modelId")+"  ·  "+S(r,"taskId")+"  ·  "+Status(S(r,"status"))));
                if(progress.text!=text && !progress.isFocused)progress.SetTextWithoutNotify(text);
            }));
        }
        void EvaluationAnswers(string id,JToken current,Action back)
        {
            var done=current?["frames"]?.LastOrDefault(f=>S(f,"type")=="done");string file=S(done,"resultFile");
            if(file.Length>0){Report(file,true,back);return;}
            var rows=current?["frames"]?.Where(r=>S(r,"type")=="model").ToArray()??Array.Empty<JToken>();
            Choose("现场答卷",rows,r=>S(r,"taskId")+" / "+S(r,"modelId")+" / "+S(r,"roundId"),r=>Document("作答与公开推理",S(r,"answer")+"\n\n公开推理\n"+S(r,"reasoning")+"\n\n"+S(r,"error"),()=>EvaluationAnswers(id,current,back)),back);
        }
        void Lineups(JObject config,Action back)
        {
            var panel=WorkPage("阵容预设",back);
            Request("/api/workspace-settings",settings=>{
                var rows=(JArray)settings["lineups"];var name=UI.Input(panel,"",26,112,680,"当前阵容名称");
                UI.Button(panel,"保存当前阵容",728,112,338,()=>{rows.Add(new JObject{["id"]=Guid.NewGuid().ToString("N"),["name"]=name.text,["models"]=config["models"].DeepClone()});Request("/api/workspace-settings",_=>Lineups(config,back),"PUT",settings);});
                UI.Button(panel,"导入网页阵容",1087,112,367,()=>{
                    var file=LocalFilePicker.Pick("导入阵容","JSON\0*.json\0\0");if(file==null)return;
                    try{var imported=JToken.Parse(File.ReadAllText(file));foreach(var row in imported["groups"]??imported["lineups"]??new JArray()){
                        string id=S(row,"id");if(rows.Any(r=>S(r,"id")==id))continue;
                        rows.Add(new JObject{["id"]=id,["name"]=row["name"],["models"]=row["modelIds"]??row["models"]});}
                        Request("/api/workspace-settings",_=>Lineups(config,back),"PUT",settings);
                    }catch(Exception e){shell.Notify(e.Message);}
                });
                Table(panel,rows.ToArray(),r=>S(r,"name"),r=>r["models"].Count()+" 个模型 · "+string.Join(", ",r["models"].Values<string>()),r=>{
                    var edit=WorkPage("阵容 · "+S(r,"name"),()=>Lineups(config,back));var title=UI.Input(edit,S(r,"name"),26,115,1428);
                    var models=UI.Multiline(edit,string.Join("\n",r["models"].Values<string>()),26,193,1428,235,"",100000);models.readOnly=true;
                    UI.Button(edit,"使用此阵容",26,500,450,()=>{config["models"]=r["models"].DeepClone();config.Remove("requestId");back();},true);
                    UI.Button(edit,"更新为当前选择",502,500,450,()=>{r["name"]=title.text;r["models"]=config["models"].DeepClone();Request("/api/workspace-settings",_=>Lineups(config,back),"PUT",settings);});
                    UI.Button(edit,"重命名",978,500,476,()=>{r["name"]=title.text;Request("/api/workspace-settings",_=>Lineups(config,back),"PUT",settings);});
                    UI.Button(edit,"删除预设",26,579,1428,()=>UI.Confirm("删除阵容预设？","比赛记录不受影响。",()=>{r.Remove();Request("/api/workspace-settings",_=>Lineups(config,back),"PUT",settings);},"删除"));
                    Guard(()=>title.text!=S(r,"name"),done=>{r["name"]=title.text;Request("/api/workspace-settings",_=>done(),"PUT",settings);});
                });
                UI.Button(panel,"导出全部阵容",26,737,1428,()=>Export("ququ-lineups.json",new JObject{["lineups"]=rows.DeepClone()}.ToString()));
            });
        }
        public void Analysis()
        {
            var panel=WorkPage("历史与分析",Workbench);
            Action TextRecords(Action<JToken> loaded){return ()=>Request("/api/engineering/text-records",loaded);}
            UI.Button(panel,"赛事与批量评测档案",26,119,697,()=>History());
            UI.Button(panel,"各赛道排行榜与生涯",747,119,708,Rankings);
            UI.Button(panel,"工程实验记录与比较",26,197,697,()=>RunList("engineering",Analysis));
            UI.Button(panel,"多阶段实验记录与比较",747,197,708,()=>RunList("harness",Analysis));
            UI.Button(panel,"文本实验比较",26,277,1428,TextRecords(rows=>Choose("选择左侧战绩",rows.ToArray(),r=>S(r,"title")+" / "+S(r,"at"),left=>Choose("选择右侧战绩",rows.Where(r=>S(r,"file")!=S(left,"file")).ToArray(),r=>S(r,"title")+" / "+S(r,"at"),right=>Request("/api/engineering/text-compare?a="+Url(S(left,"file"))+"&b="+Url(S(right,"file")),r=>Document("文本实验比较",Pretty(r),Analysis)),Analysis),Analysis)));
            UI.Button(panel,"题目诊断",26,357,1428,TextRecords(rows=>Choose("选择诊断协议",rows.ToArray(),r=>S(r,"title")+" / "+S(r,"at"),record=>Request("/api/engineering/text-diagnosis?arena="+Url(S(record,"arena"))+"&protocol="+Url(S(record,"protocolKey")),r=>Document("题目诊断",Pretty(r),Analysis)),Analysis)));
            UI.Label(panel,"保留原有统计口径与比较资格。完整答卷、轮次证据、协议和报告均可在游戏内读取与导出。",26,466,1428,123,23,Mint);
        }
    }
}
