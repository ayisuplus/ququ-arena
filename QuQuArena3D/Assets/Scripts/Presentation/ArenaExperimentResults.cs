using System;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;

namespace QuQu
{
    public partial class ArenaDesktopHub
    {
        static string Number(JToken value,string format="0.###")=>value==null || value.Type==JTokenType.Null?"—":value.Type==JTokenType.Float || value.Type==JTokenType.Integer?((double)value).ToString(format):value.ToString();
        static string SummaryText(string kind,JToken row)
        {
            if(row==null)return "暂无统计；请等待后台产生结果。";
            if(kind=="engineering")return S(row,"agent")+"\n\n计划试验："+row["planned"]+"\n已启动："+row["started"]+"\n环境有效："+row["environmentValid"]+"\n验收通过："+row["passed"]+"\n平均耗时："+Number(row["meanMs"])+" ms\n\n各状态\n"+string.Join("\n",((JObject)row["failures"]).Properties().Select(p=>Status(p.Name)+"："+p.Value))+"\n\n"+S(row,"note");
            return S(row,"name")+"\n\n计划 / 成功 / 失败 / 待评分："+row["planned"]+" / "+row["completed"]+" / "+row["failures"]+" / "+row["pending"]+
                "\n平均得分："+Number(row["score"])+"\n相对基础 Pi 的配对差值："+Number(row["delta"])+
                "\n差值区间："+(row["interval"] is JArray interval?string.Join(" ～ ",interval.Select(v=>Number(v))):"样本不足或不可比较")+
                "\n独立任务数："+row["independentTasks"]+"\n平均耗时："+Number(row["elapsedMs"])+" ms"+
                "\n模型调用："+row["usage"]?["calls"]+" 次；有用量记录："+row["usage"]?["knownCalls"]+" 次"+
                "\n已知输入 / 输出 Token："+row["usage"]?["input"]+" / "+row["usage"]?["output"]+
                "\n用量完整："+((bool?)row["usage"]?["complete"]==true?"是":"否；不将缺失用量视为零")+
                "\n\n逐题比较\n"+string.Join("\n",(row["tasks"]??new JArray()).Select(t=>S(t,"id")+"   得分 "+Number(t["score"])+"   基础 Pi "+Number(t["baseline"])+"   差值 "+Number(t["delta"])))+
                "\n\n"+S(row,"note");
        }
        void ExperimentSummary(string kind,JToken run,Action back)
        {
            var panel=WorkPage("结果与比较统计",back);
            UI.Label(panel,"后台计算的统计 · 试验结束不代表每次执行成功。点击配置查看用量、差值和比较限制。",26,112,1428,52,21,Mint);
            var rows=run?["summary"]?.ToArray()??Array.Empty<JToken>();
            Table(panel,rows,r=>S(r,kind=="harness"?"name":"agent")+"    "+(kind=="harness"?"平均得分 "+Number(r["score"]):"验收通过 "+r["passed"]+" / "+r["planned"]),
                r=>kind=="harness"?"成功 "+r["completed"]+" / "+r["planned"]+"   失败 "+r["failures"]+"   待评分 "+r["pending"]+"   配对差值 "+Number(r["delta"]):"环境有效 "+r["environmentValid"]+"   平均耗时 "+Number(r["meanMs"])+" ms",
                r=>Document("统计详情",SummaryText(kind,r),()=>ExperimentSummary(kind,run,back)));
            UI.Button(panel,"导出统计 JSON",26,737,1428,()=>Export("experiment-summary.json",Pretty(run?["summary"])));
        }
        void ExperimentComparison(string kind,JToken result,Action back)
        {
            var text=new StringBuilder();foreach(string key in new[]{"a","b"}) {
                var run=result[key];text.AppendLine(key=="a"?"左侧实验":"右侧实验").AppendLine(S(run,"id"));
                foreach(var row in run?["summary"]??new JArray())text.AppendLine(SummaryText(kind,row)).AppendLine();
            }
            text.AppendLine(S(result,"note"));Document("同条件实验比较",text.ToString(),back);
        }
        void TrialEvidence(string kind,string key,JToken trial,JToken run,Action back)
        {
            if(key=="calls") {Choose("逐次模型调用",trial[key]?.ToArray()??Array.Empty<JToken>(),r=>"调用 "+r["number"]+" / "+S(r,"round")+" / "+S(r,"phase")+" / "+Status(S(r,"status")),r=>Document("调用 "+r["number"],"开始："+S(r,"startedAt")+"\n耗时："+Number(r["elapsedMs"])+" ms\n状态："+Status(S(r,"status"))+"\n"+S(r,"error")+"\n\n输出\n"+S(r,"text")+"\n\n公开推理\n"+S(r,"reasoning")+"\n\n用量\n"+Pretty(r["usage"]),()=>TrialEvidence(kind,key,trial,run,back)),back);return;}
            if(key=="rounds") {Choose("轮次证据",trial[key]?.ToArray()??Array.Empty<JToken>(),r=>S(r,"roundId")+" · "+S(r,"title"),r=>Document("轮次 "+S(r,"roundId"),"题目\n"+S(r,"prompt")+"\n\n答卷\n"+S(r,"answer")+"\n\n公开推理\n"+S(r,"reasoning")+"\n\n"+S(r,"error"),()=>TrialEvidence(kind,key,trial,run,back)),back);return;}
            if(key=="changes" && trial[key] is JObject files){Choose("修改后的文件",files.Properties().Select(p=>(JToken)new JObject{["name"]=p.Name,["text"]=p.Value}).ToArray(),r=>S(r,"name"),r=>Document(S(r,"name"),S(r,"text"),()=>TrialEvidence(kind,key,trial,run,back)),back);return;}
            string text;
            if(key=="checks")text=string.Join("\n",(trial[key]??new JArray()).Select(r=>((bool?)r["passed"]==true?"通过":"未通过")+"   "+S(r,"id")+"   "+S(r,"title")));
            else if(key=="events")text=string.Join("\n",(kind=="engineering"?run["events"].Where(r=>S(r,"trial")==S(trial,"id")):trial["events"]??new JArray()).Select(r=>S(r,"at")+" ["+S(r,"kind")+"] "+S(r,"text")))+(trial["logs"] is JObject logs?"\n\n"+string.Join("\n\n",logs.Properties().Select(p=>p.Name+"\n"+p.Value)):"");
            else text=trial[key]?.Type==JTokenType.String?(string)trial[key]:Pretty(trial[key]);
            Document(key=="patch"?"代码差异":key=="checks"?"验收结果":key=="events"?"执行日志":"试验证据",string.IsNullOrEmpty(text)?"尚无此项证据。":text,back);
        }
        void EvaluationSummary(JToken done,Action back)
        {
            var panel=WorkPage("成绩与结算",back);
            UI.Label(panel,done==null?"评测尚未结束，请返回查看执行状态。":S(done["settlement"],"reason","本场成绩")+"  ·  待评分 "+Number(done["pendingGrades"]),26,112,1428,55,21,Mint);
            Table(panel,done?["board"]?.ToArray()??Array.Empty<JToken>(),r=>S(r,"name")+"    平均得分 "+Number(r["avg"]),r=>"生涯评级 "+Number(r["elo"])+"    本场变动 "+Number(r["delta"]),r=>Document(S(r,"name"),"平均得分："+Number(r["avg"])+"\n评级："+Number(r["elo"])+"\n变动："+Number(r["delta"])+"\n\n"+S(done?["settlement"],"reason"),()=>EvaluationSummary(done,back)));
            UI.Button(panel,"导出结算记录",26,737,1428,()=>Export("evaluation-result.json",Pretty(done)));
        }
    }
}
