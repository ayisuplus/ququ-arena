using System;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace QuQu
{
    public partial class ArenaDesktopHub
    {
        static string Status(string value)=>value switch {"running"=>"进行中","pausing"=>"已请求暂停，等待检查点","paused"=>"已暂停","waiting"=>"待继续","completed"=>"已完成","finished"=>"已完成","stopped"=>"已终止","cancelled"=>"已中止","interrupted"=>"执行中断","pending_grading"=>"待补评","queued"=>"排队中","checking"=>"检查中","ready"=>"就绪","unconfirmed"=>"提交待核对","unreadable"=>"文件不可读","failed"=>"失败","error"=>"错误","preparing"=>"准备中","working"=>"执行中","verifying"=>"验收中","passed"=>"通过","model_error"=>"模型调用失败","environment_error"=>"环境不可用","timed_out"=>"已超时","grading"=>"评分中","judging"=>"评分中","generating"=>"作答中","retrying"=>"重试中","done"=>"完成","withdrawn"=>"已退赛",_=>value};
        public void History(bool legacy=false,int offset=0,string query="")
        {
            var panel=Page("历史与回放",shell.ShowHome);
            UI.Button(panel,"3D 赛事",28,92,190,()=>History(),!legacy);
            UI.Button(panel,"多模型战报",233,92,190,()=>History(true),legacy);
            var search=UI.Input(panel,query,445,92,390,"搜索名称 / 日期");
            UI.Button(panel,"搜索",850,92,160,()=>History(legacy,0,search.text));
            var list=UI.Scroll(panel,28,150,982,440);
            Action back=()=>History(legacy,offset,query);
            Request(legacy?"/api/shell/library/history?offset="+offset+"&search="+Url(query):"/api/shell/catalog",data=>{
                var all=(legacy?data["items"]:data["competitions"])??new JArray();
                var filtered=legacy?all.ToArray():all.Where(r=>(S(r,"title")+S(r,"createdAt")).IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0).ToArray();
                int total=legacy?(int)data["total"]:filtered.Length;var rows=legacy?filtered:filtered.Skip(offset).Take(30);float y=0;
                foreach(var item in rows)
                {
                    var row=item;string id=S(row,legacy?"file":"id");
                    var heading=UI.Label(list,S(row,"title"),0,y,547,34,21);heading.textWrappingMode=TMPro.TextWrappingModes.NoWrap;heading.overflowMode=TMPro.TextOverflowModes.Ellipsis;
                    UI.Label(list,Status(S(row,"status"))+"  ·  "+S(row,legacy?"startedAt":"createdAt"),0,y+40,547,29,15);
                    UI.Button(list,"答卷",555,y+12,120,()=>Report(id,legacy,back));
                    UI.Button(list,"回放",688,y+12,120,()=>{UI.CloseModal();if(legacy)shell.Link.Replay(id);else shell.Duel.Replay(id);});
                    if(!legacy)UI.Button(list,"观看 / 续赛",821,y+12,140,()=>{UI.CloseModal();shell.Link.WatchCompetition(id);});
                    y+=90;
                }
                if(total==0)UI.Label(list,"还没有匹配的比赛记录。",0,0,950,50,21);
                list.sizeDelta=new Vector2(970,Mathf.Max(440,y));
                UI.Label(panel,$"共 {total} 场  ·  第 {offset/30+1} 页",28,620,440,30,16);
                UI.Button(panel,"上一页",600,608,190,()=>History(legacy,Math.Max(0,offset-30),query)).interactable=offset>0;
                UI.Button(panel,"下一页",805,608,205,()=>History(legacy,offset+30,query)).interactable=offset+30<total;
            });
        }
        void Report(string id,bool legacy,Action back)
        {
            var panel=WorkPage("比赛答卷",back);
            Request(legacy?"/api/shell/library/report?file="+Url(id):"/api/shell/competitions/"+Url(id),data=>{
                var entries=new JArray();
                void Entry(string title,string detail,JToken record)=>entries.Add(new JObject{["title"]=title,["detail"]=detail,["record"]=record});
                UI.Button(panel,"导出完整 JSON",26,110,453,()=>Export(legacy?id:id+".json",Pretty(data)));
                if(legacy)
                {
                    UI.Button(panel,"导出 Markdown 战报",504,110,454,()=>Download("/results/"+Url(id.Replace("战绩-","战报-").Replace(".json",".md")),id.Replace(".json",".md")));
                    UI.Button(panel,"导出 HTML 战报",983,110,471,()=>Download("/results/"+Url(id.Replace("战绩-","战报-").Replace(".json",".html")),id.Replace(".json",".html")));
                    foreach(var record in data["records"]??new JArray())Entry(S(record,"taskId")+"  ·  "+S(record,"model"),"得分 "+Number(record["score"])+" · "+Status(S(record,"gradingStatus")),record);
                }
                else
                {
                    foreach(var duel in data["snapshot"]?["duels"]??new JArray())
                    foreach(var item in duel["rounds"]??new JArray())
                    {
                        foreach(var record in item["records"]??new JArray())if(record.Type!=JTokenType.Null)Entry(S(duel,"id")+" / 第 "+item["index"]+" 题 · "+S(record,"model"),S(item["question"]?["task"],"input"),record);
                    }
                }
                var search=UI.Input(panel,"",26,175,1428,"搜索题号、选手或原文");RectTransform host=null;
                void Draw(string query){if(host)UnityEngine.Object.Destroy(host.gameObject);host=UI.Box(panel,"Answers",0,0,1480,808);host.SetAsFirstSibling();Table(host,entries.Where(r=>r.ToString().IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0).ToArray(),r=>S(r,"title"),r=>S(r,"detail"),r=>Document("完整答卷",AnswerText(r["record"]),()=>Report(id,legacy,back)),26,242,1428,468);}
                search.onValueChanged.AddListener(Draw);Draw("");
            });
        }
        static string AnswerText(JToken record)
        {
            var text=new StringBuilder(S(record,"model")+"\n得分："+Number(record["score"])+"\n\n题目\n"+S(record,"prompt")+"\n\n答卷\n"+S(record,"answer")+"\n\n公开推理\n"+S(record,"reasoning")+"\n"+S(record,"error"));
            foreach(var round in record["rounds"]??new JArray())text.AppendLine("\n\n"+S(round,"roundId")+" · "+S(round,"title")+"\n要求\n"+S(round,"prompt")+"\n答卷\n"+S(round,"answer")+"\n公开推理\n"+S(round,"reasoning"));
            foreach(var grade in record["grade"]?["dimensions"]??new JArray()){text.AppendLine("\n评分维度 "+S(grade,"id")+" · "+grade["score"]+" / 10\n"+S(grade,"reason"));foreach(var evidence in grade["evidence"]??new JArray())text.AppendLine(S(evidence,"roundId")+" 原文证据："+S(evidence,"quote"));}
            return text.ToString();
        }
        public void Rankings()=>RankingsFor("qa");
        void RankingsFor(string mode)
        {
            var panel=WorkPage("排行榜与模型生涯",shell.ShowHome);
            string[] modes={"qa","open","multi_turn"},titles={"短题竞速","开放评审","多轮任务"};for(int m=0;m<3;m++){int index=m;UI.Button(panel,titles[m],26+m*484,112,460,()=>RankingsFor(modes[index]),mode==modes[m]);}
            Request("/api/shell/library/rankings?mode="+mode,data=>{
                Table(panel,(data["items"]??new JArray()).ToArray(),row=>S(row,"name")+" / "+S(row,"rank"),row=>$"评级 {(double?)row["rating"]:0}  ·  均分 {(double?)row["avgScore"]:P1}  ·  {row["battles"]} 场  ·  {row["titles"]} 冠",row=>Request("/api/shell/library/rankings?mode="+mode+"&id="+Url(S(row,"id")),profile=>{
                        var text=new StringBuilder(S(profile,"name")+"  /  "+S(profile,"rank")+"\n\n");
                        text.AppendLine("参赛 "+profile["battles"]+" 场  ·  夺冠 "+profile["titles"]+" 次\n\n分组表现");
                        foreach(var condition in profile["condRadar"]??new JArray())text.AppendLine(S(condition,"cond")+"  "+((double?)condition["avg"]??0).ToString("P1"));
                        text.AppendLine("\n最近比赛");foreach(var record in profile["history"]??new JArray())text.AppendLine(S(record,"at")+"  "+S(record,"arena")+"  第 "+record["place"]+" 名");
                        ReadText("模型生涯",text.ToString()+"\n\n完整统计\n"+Pretty(profile),()=>RankingsFor(mode));
                    }));
            });
        }
    }
}
