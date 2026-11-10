using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace QuQu
{
    public partial class ArenaDesktopHub
    {
        static JObject Rubric()=>new JObject{["kind"]="rubric",["dimensions"]=new JArray(
            new JObject{["id"]="correctness",["name"]="正确性",["weight"]=35,["criteria"]="关键事实、计算与结论正确；按错误影响扣分。"},
            new JObject{["id"]="evidence",["name"]="依据",["weight"]=25,["criteria"]="结论对应给定材料，区分事实、假设与未知。"},
            new JObject{["id"]="completeness",["name"]="完整性",["weight"]=25,["criteria"]="覆盖所有交付要求及边界条件。"},
            new JObject{["id"]="clarity",["name"]="表达",["weight"]=15,["criteria"]="结构清楚，判断与行动可定位。"})};
        void CreateBank()
        {
            Choose("选择题库赛道",new JToken[]{new JObject{["id"]="qa",["title"]="普通问答"},new JObject{["id"]="open",["title"]="开放评审"},new JObject{["id"]="multi_turn",["title"]="多轮任务"}},r=>S(r,"title"),r=>{
                string mode=S(r,"id");var task=NewQuestion(1);
                if(mode!="qa")task.Remove("target");
                if(mode=="multi_turn")task["rounds"]=new JArray(new JObject{["id"]="r1",["title"]="初稿",["input"]="请先给出初步方案。"},new JObject{["id"]="r2",["title"]="修订",["input"]="根据新增材料修订并交付最终结果。"});
                EditBank(new JObject{["def"]=new JObject{["title"]="我的题库",["description"]="",["mode"]=mode,["judge"]=mode=="qa"?new JObject{["kind"]="exact"}:Rubric()},["tasks"]=new JArray(task)});
            },Banks);
        }
        void TaskBank(JObject document,string savedBaseline=null)
        {
            var panel=WorkPage("题库 · "+S(document["def"],"mode"),Banks);var def=(JObject)document["def"];var tasks=(JArray)document["tasks"];string baseline=savedBaseline??document.ToString(),id=S(def,"name");
            Action redraw=()=>TaskBank(document,baseline);
            Field(panel,"题库名称",def,"title",26,107,697);Field(panel,"题库说明",def,"description",747,107,708);
            UI.Button(panel,"默认评分维度",26,212,453,()=>RubricEditor((JObject)def["judge"].DeepClone(),v=>{def["judge"]=v;redraw();},redraw));
            UI.Button(panel,"审查状态与完整格式",504,212,454,()=>EditJson("题库完整格式与审查",document,v=>TaskBank((JObject)v,baseline),redraw));
            UI.Button(panel,"+ 添加任务",983,212,472,()=>{int n=tasks.Count+1;while(tasks.Any(r=>S(r,"id")=="Q"+n))n++;var task=NewQuestion(n);task.Remove("target");if(S(def,"mode")=="multi_turn")task["rounds"]=new JArray(new JObject{["id"]="r1",["title"]="初稿",["input"]="初步回答"},new JObject{["id"]="r2",["title"]="最终稿",["input"]="修订并交付"});tasks.Add(task);redraw();});
            var search=UI.Input(panel,"",26,279,1428,"搜索任务题号与完整题面");RectTransform host=null;
            void Draw(string q){if(host)UnityEngine.Object.Destroy(host.gameObject);host=UI.Box(panel,"Question list",0,0,1480,808);host.SetAsFirstSibling();
                Table(host,tasks.Where(r=>(S(r,"id")+S(r,"input")).IndexOf(q,StringComparison.OrdinalIgnoreCase)>=0).ToArray(),r=>S(r,"id")+" · "+S(r,"input"),r=>S(r,"condition")+" · "+(r["rounds"]?.Count()??1)+" 轮",r=>TaskEditor((JObject)r.DeepClone(),def,v=>{r.Replace(v);redraw();},()=>{r.Remove();redraw();},redraw),26,342,1428,355);}
            search.onValueChanged.AddListener(Draw);Draw("");bool saving=false;
            void Save(Action done){if(saving)return;saving=true;Request("/api/question-banks"+(id.Length==0?"":"/"+Url(id)),r=>{saving=false;baseline=r.ToString();done();},id.Length==0?"POST":"PUT",document,_=>saving=false);}
            UI.Button(panel,"保存题库",26,737,696,()=>Save(Banks),true);
            UI.Button(panel,"导出已保存题库",747,737,708,()=>{if(id.Length==0||document.ToString()!=baseline){shell.Notify("请先保存，再打开题库导出。");return;}Request("/api/game/library/banks/"+Url(id)+"/pack",r=>Export(id+".ququ.json",Pretty(r)));});
            Guard(()=>document.ToString()!=baseline,Save);
        }
        void TaskEditor(JObject task,JObject def,Action<JObject> apply,Action remove,Action back)
        {
            string baseline=task.ToString();Action draw=null;
            draw=()=>{
                var panel=WorkPage("编辑任务",back);
                Field(panel,"题号",task,"id",26,110,697);Field(panel,"分组",task,"condition",747,110,708);
                TextField(panel,"共同题面与材料",task,"input",26,220,1428,228);
                UI.Button(panel,"评分维度与权重",26,531,453,()=>RubricEditor((JObject)(task["judge"]??def["judge"]).DeepClone(),v=>{task["judge"]=v;draw();},draw));
                UI.Button(panel,"轮次材料与顺序",504,531,454,()=>RoundsEditor(task,draw)).interactable=S(def,"mode")=="multi_turn";
                UI.Button(panel,"原格式 / 高级字段",983,531,472,()=>EditJson("任务完整字段",task,v=>{task=(JObject)v;draw();},draw));
                UI.Button(panel,"预览题面与上下文",26,599,696,()=>Document("任务上下文",S(task,"input")+"\n\n"+string.Join("\n\n",(task["rounds"]??new JArray()).Select(r=>S(r,"title")+"\n"+S(r,"input"))),draw));
                UI.Button(panel,"删除任务",747,599,708,()=>UI.Confirm("删除任务？","保存题库后生效，历史答卷仍保留。",remove,"删除"));
                UI.Button(panel,"应用到题库草稿",26,737,1428,()=>apply(task),true);
                Guard(()=>task.ToString()!=baseline,done=>{apply(task);done();});
            };draw();
        }
        void RoundsEditor(JObject task,Action back)
        {
            var rounds=(JArray)task["rounds"];var panel=WorkPage("任务轮次 · 2–5 轮",back);
            UI.Button(panel,"+ 新轮次",26,112,1428,()=>{int n=rounds.Count+1;while(rounds.Any(r=>S(r,"id")=="r"+n))n++;rounds.Add(new JObject{["id"]="r"+n,["title"]="新轮次",["input"]=""});RoundsEditor(task,back);}).interactable=rounds.Count<5;
            Table(panel,rounds.ToArray(),r=>S(r,"title"),r=>S(r,"id")+" · "+S(r,"input"),row=>{
                var draft=(JObject)row.DeepClone();var edit=WorkPage("轮次材料",()=>RoundsEditor(task,back));
                Field(edit,"轮次 ID",draft,"id",26,110,697);Field(edit,"标题",draft,"title",747,110,708);
                TextField(edit,"本轮新增材料与要求",draft,"input",26,220,1428,300);
                void Move(int delta){int index=rounds.IndexOf(row),at=index+delta;if(at<0||at>=rounds.Count)return;row.Remove();rounds.Insert(at,draft);RoundsEditor(task,back);}
                UI.Button(edit,"上移",26,599,330,()=>Move(-1));UI.Button(edit,"下移",390,599,330,()=>Move(1));
                UI.Button(edit,"删除",754,599,700,()=>{row.Remove();RoundsEditor(task,back);}).interactable=rounds.Count>2;
                UI.Button(edit,"应用轮次",26,737,1428,()=>{row.Replace(draft);RoundsEditor(task,back);},true);
                Guard(()=>draft.ToString()!=row.ToString(),done=>{row.Replace(draft);done();});
            });
        }
        void RubricEditor(JObject rubric,Action<JObject> apply,Action back)
        {
            var dimensions=(JArray)rubric["dimensions"];var panel=WorkPage("评分维度 · 合计 100%",back);var state=Editing(rubric);
            UI.Label(panel,"当前权重总和："+dimensions.Sum(d=>(double?)d["weight"]??0)+"%",26,112,1000,37,22,Mint);
            UI.Button(panel,"+ 维度",1114,110,340,()=>{int n=dimensions.Count+1;while(dimensions.Any(r=>S(r,"id")=="dimension"+n))n++;dimensions.Add(new JObject{["id"]="dimension"+n,["name"]="新维度",["weight"]=10,["criteria"]=""});RubricEditor(rubric,apply,back);}).interactable=dimensions.Count<12;
            Table(panel,dimensions.ToArray(),r=>S(r,"name")+" · "+r["weight"]+"%",r=>S(r,"criteria"),row=>{
                var draft=(JObject)row.DeepClone();var edit=WorkPage("编辑评分维度",()=>RubricEditor(rubric,apply,back));
                Field(edit,"维度 ID",draft,"id",26,110,450);Field(edit,"名称",draft,"name",502,110,450);Field(edit,"权重 %",draft,"weight",978,110,476,true);
                TextField(edit,"得分标准",draft,"criteria",26,226,1428,300);
                UI.Button(edit,"删除维度",26,599,1428,()=>{row.Remove();RubricEditor(rubric,apply,back);}).interactable=dimensions.Count>1;
                UI.Button(edit,"应用维度",26,737,1428,()=>{row.Replace(draft);RubricEditor(rubric,apply,back);},true);
                Guard(()=>draft.ToString()!=row.ToString(),done=>{row.Replace(draft);done();});
            });
            void Apply(){if(Math.Abs(dimensions.Sum(d=>(double?)d["weight"]??0)-100)>.00001){shell.Notify("权重合计须为 100%");return;}apply(rubric);}
            UI.Button(panel,"应用评分标准",26,737,1428,Apply,true);
            Guard(()=>rubric.ToString()!=state.Baseline,_=>Apply());
        }
    }
}
