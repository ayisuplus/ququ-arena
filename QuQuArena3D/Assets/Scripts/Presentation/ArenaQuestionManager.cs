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
        public void Banks()
        {
            var panel=WorkPage("题库",shell.ShowHome);
            var search=UI.Input(panel,"",26,112,850,"搜索题库名称、标识与赛道");
            UI.Button(panel,"+ 新题库",901,112,262,CreateBank,true);
            UI.Button(panel,"导入题库",1188,112,266,()=>{
                var file=LocalFilePicker.Pick("导入题库","QuQu question bank\0*.ququ.json\0\0"); if(file==null)return;
                try { if(new FileInfo(file).Length>4*1024*1024)throw new Exception("题库最多 4 MB"); Request("/api/shell/library/import",r=>EditBank((JObject)r),"POST",JToken.Parse(File.ReadAllText(file))); }
                catch(Exception e){shell.Notify(e.Message);}
            });
            Request("/api/shell/library/banks",data=>{
                RectTransform host=null;
                void Render(string query)
                {
                    if(host)UnityEngine.Object.Destroy(host.gameObject);host=UI.Box(panel,"Banks",0,0,1480,808);host.SetAsFirstSibling();
                    Table(host,data["items"].Where(m=>(S(m,"title")+S(m,"id")+S(m,"mode")).IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0).ToArray(),r=>S(r,"title"),r=>r["count"]+" 道题 · "+(S(r,"mode")=="qa"?"普通问答":S(r,"mode")=="open"?"开放评审":"多轮任务"),bank=>Request("/api/question-banks/"+Url(S(bank,"id")),r=>EditBank((JObject)r)));
                }
                search.onValueChanged.AddListener(Render);Render("");
            });
        }
        static JObject NewQuestion(int number)=>new JObject{["id"]="Q"+number,["condition"]="default",["input"]="",["target"]=""};
        void EditBank(JObject document,string savedBaseline=null)
        {
            if(S(document["def"],"mode","qa")!="qa"){TaskBank(document,savedBaseline);return;}
            var panel=Page("编辑题库",Banks);var def=(JObject)document["def"];var tasks=(JArray)document["tasks"];
            string baseline=savedBaseline??document.ToString();string id=S(def,"name");int selected=0;bool saving=false;
            UI.Label(panel,"名称",28,96,68,30);var title=UI.Input(panel,S(def,"title"),99,88,910);title.onValueChanged.AddListener(v=>def["title"]=v);
            UI.Label(panel,"说明",28,150,68,30);var description=UI.Input(panel,S(def,"description"),99,142,570);description.onValueChanged.AddListener(v=>def["description"]=v);
            UI.Button(panel,"高级规则 / 审查 / 元数据",685,142,324,()=>EditJson("题库完整格式",document,v=>EditBank((JObject)v,baseline),()=>EditBank(document,baseline)));
            var list=UI.Scroll(panel,28,202,280,347);var detail=UI.Scroll(panel,333,202,678,373);
            void DrawDetail()
            {
                foreach(Transform child in detail)UnityEngine.Object.Destroy(child.gameObject);
                if(tasks.Count==0){UI.Label(detail,"添加一道题开始编辑。",0,0,640,40);return;}
                selected=Mathf.Clamp(selected,0,tasks.Count-1);var task=(JObject)tasks[selected];
                UI.Label(detail,"题号",0,0,250,27,16);UI.Label(detail,"分组",320,0,310,27,16);
                var taskId=UI.Input(detail,S(task,"id"),0,31,295);taskId.onValueChanged.AddListener(v=>task["id"]=v);
                var condition=UI.Input(detail,S(task,"condition"),320,31,320);condition.onValueChanged.AddListener(v=>task["condition"]=v);
                UI.Label(detail,"题目 · 中英文及代码原样保存",0,90,640,30,18);
                var input=UI.Multiline(detail,S(task,"input"),0,128,640,170,"输入完整题目",100000);input.onValueChanged.AddListener(v=>task["input"]=v);
                UI.Label(detail,"参考答案（可选）",0,318,640,30,18);
                var target=UI.Multiline(detail,S(task,"target"),0,352,640,80,"精确匹配题请填写参考答案",100000);target.onValueChanged.AddListener(v=>{if(v.Length==0)task.Remove("target");else task["target"]=v;});
                UI.Label(detail,"评分方式",0,450,250,30,18);
                var rule=(JObject)(task["judge"]??def["judge"]);string kind=S(rule,"kind");
                string Caption(string k)=>k=="exact"?"精确匹配":k=="contains"?"包含关键词":k=="regex"?"正则匹配":k=="llm"?"模型裁判":"组合 / 高级规则";
                UI.Button(detail,Caption(kind)+"  · 切换",270,445,370,()=>{
                    string[] kinds={"exact","contains","regex","llm"};int next=(Array.IndexOf(kinds,kind)+1)%kinds.Length;
                    task["judge"]=kinds[next]=="contains"?new JObject{["kind"]="contains",["keywords"]=new JArray("关键词")}:kinds[next]=="regex"?new JObject{["kind"]="regex",["pattern"]="."}:kinds[next]=="llm"?new JObject{["kind"]="llm",["rubric"]="根据准确性与完整性评分。",["scale"]=1}:new JObject{["kind"]="exact"};DrawDetail();
                });
                if(kind=="contains"||kind=="regex"||kind=="llm")
                {
                    string field=kind=="contains"?"keywords":kind=="regex"?"pattern":"rubric";
                    string value=kind=="contains"?string.Join("\n",rule[field]?.Values<string>()??Array.Empty<string>()):S(rule,field);
                    UI.Label(detail,kind=="contains"?"关键词 · 每行一个":kind=="regex"?"正则表达式":"给模型裁判的评分标准",0,504,640,30,16);
                    var options=UI.Multiline(detail,value,0,540,640,135,"评分规则",100000);
                    options.onValueChanged.AddListener(v=>{if(task["judge"]==null)task["judge"]=rule.DeepClone();task["judge"][field]=kind=="contains"?(JToken)new JArray(v.Split('\n').Select(s=>s.Trim()).Where(s=>s.Length>0)):new JValue(v);});
                }
                else if(kind!="exact")UI.Label(detail,"原有复杂评分规则会完整保留。切换方式后才会替换。",0,504,640,75,18);
                if(kind=="llm")
                {
                    UI.Label(detail,"裁判满分",0,704,180,30,16);
                    var scale=UI.Input(detail,rule["scale"]?.ToString()??"1",200,696,440);
                    scale.onValueChanged.AddListener(v=>{if(double.TryParse(v,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out var n)){if(task["judge"]==null)task["judge"]=rule.DeepClone();task["judge"]["scale"]=n;}});
                }
                detail.sizeDelta=new Vector2(666,kind=="llm"?760:kind=="exact"?515:700);
            }
            var pooled=Enumerable.Range(0,10).Select(_=>UI.Button(list,"",0,0,261,()=>{})).ToArray();
            void DrawList()
            {
                list.sizeDelta=new Vector2(268,Mathf.Max(347,tasks.Count*49));
                int first=Mathf.Clamp(Mathf.FloorToInt(list.anchoredPosition.y/49),0,Mathf.Max(0,tasks.Count-pooled.Length));
                for(int i=0;i<pooled.Length;i++){int index=first+i;var button=pooled[i];button.gameObject.SetActive(index<tasks.Count);if(index>=tasks.Count)continue;((RectTransform)button.transform).anchoredPosition=new Vector2(0,-index*49);button.GetComponentInChildren<TMP_Text>().text=(index==selected?"› ":"")+(index+1)+"  "+S(tasks[index],"id");button.onClick.RemoveAllListeners();button.onClick.AddListener(()=>{selected=index;DrawList();DrawDetail();});}
            }
            list.GetComponentInParent<UnityEngine.UI.ScrollRect>().onValueChanged.AddListener(_=>DrawList());
            void Save(Action done)
            {
                if(saving)return;saving=true;
                Request("/api/question-banks"+(id.Length==0?"":"/"+Url(id)),r=>{saving=false;document=(JObject)r;baseline=document.ToString();done();},id.Length==0?"POST":"PUT",document,_=>saving=false);
            }
            Guard(()=>document.ToString()!=baseline,Save);
            UI.Button(panel,"+ 添加",28,560,127,()=>{int next=tasks.Count+1;while(tasks.Any(t=>S(t,"id")=="Q"+next))next++;tasks.Add(NewQuestion(next));selected=tasks.Count-1;DrawList();DrawDetail();});
            UI.Button(panel,"删除题目",171,560,137,()=>UI.Confirm("删除这道题？","保存题库后生效，历史答卷不会改变。",()=>{if(tasks.Count>0)tasks.RemoveAt(selected);selected=Mathf.Clamp(selected,0,Math.Max(0,tasks.Count-1));DrawList();DrawDetail();},"删除"));
            UI.Button(panel,"保存题库",28,620,280,()=>Save(Banks),true);
            UI.Button(panel,"导出已保存题库",333,620,330,()=>{
                if(id.Length==0 || document.ToString()!=baseline){shell.Notify("请先保存题库，再从列表重新打开导出。");return;}
                Request("/api/shell/library/banks/"+Url(id)+"/pack",pack=>{
                    var file=LocalFilePicker.Save("导出题库","QuQu question bank\0*.ququ.json\0\0",id+".ququ.json");if(file==null)return;
                    try{File.WriteAllText(file,pack.ToString());shell.Notify("题库已导出");}catch(Exception e){shell.Notify(e.Message);}
                });
            });
            UI.Button(panel,"返回题库",688,620,320,UI.Back);DrawList();DrawDetail();
        }
    }
}
