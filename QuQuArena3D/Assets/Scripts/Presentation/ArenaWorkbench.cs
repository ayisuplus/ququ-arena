using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;

namespace QuQu
{
    public partial class ArenaDesktopHub
    {
        bool maximized=true;
        static readonly Color Mint=new Color(.64f,.91f,.81f);
        Action WorkBack => shell.Stations.Current==ArenaOrbitalNetwork.Place.Lab?(Action)shell.Stations.ShowPanel:shell.ShowHome;
        RectTransform WorkPage(string title,Action back)
        {
            if(shell.Stations.Current==ArenaOrbitalNetwork.Place.Lab)UI.ClearClosed();
            Page(title,back);
            var old=UI.Modal.Find("Panel"); if(old)UnityEngine.Object.Destroy(old.gameObject);
            var panel=UI.Box(UI.Modal,"Workbench",60,46,1480,808,new Color(.025f,.042f,.051f,.98f));
            UI.Eyebrow(panel,"KEPLER   /   RESEARCH WORKSPACE",26,16,1000);
            UI.Label(panel,title,26,44,1115,39,27);
            void Resize(){float scale=maximized?1:.78f;panel.localScale=Vector3.one*scale;panel.anchoredPosition=new Vector2((1600-1480*scale)/2,-(900-808*scale)/2);}
            UI.Button(panel,"缩放 / 最大化",1170,32,170,()=>{maximized=!maximized;Resize();});
            UI.Button(panel,"返回",1350,32,104,UI.Back);
            UI.Box(panel,"Rule",26,92,1428,1,new Color(.36f,.56f,.59f,.6f));Resize();
            return panel;
        }
        void Submit(string path,JObject body,Action<JToken> done,Action<string> failed=null)
        {
            var owner=UI.Modal;
            shell.Tasks.Submit(path,body,value=>{shell.Notify("任务已提交");if(owner && owner==UI.Modal)done(value);},error=>{shell.Notify(error);if(owner && owner==UI.Modal)failed?.Invoke(error);});
        }
        static string Pretty(JToken value)=>value?.ToString(Newtonsoft.Json.Formatting.Indented)??"暂无记录";
        class EditState { public string Baseline; public JObject Settings; }
        static EditState Editing(JObject value) { var state=value.Annotation<EditState>();if(state==null){state=new EditState{Baseline=value.ToString()};value.AddAnnotation(state);}return state; }
        TMP_InputField Field(Transform p,string label,JObject data,string key,float x,float y,float width=680,bool number=false)
        {
            UI.Label(p,label,x,y,width,27,17);
            var input=UI.Input(p,data[key]?.ToString()??"",x,y+31,width);
            input.onValueChanged.AddListener(v=>{
                if(number){if(double.TryParse(v,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out var n))data[key]=n;else data[key]=v;}
                else data[key]=v;
                data.Remove("requestId");
            }); return input;
        }
        TMP_InputField TextField(Transform p,string label,JObject data,string key,float x,float y,float w,float height,int limit=100000)
        {
            UI.Label(p,label,x,y,w,28,17);
            var input=UI.Multiline(p,S(data,key),x,y+34,w,height,"",limit);
            input.onValueChanged.AddListener(v=>{data[key]=v;data.Remove("requestId");});
            return input;
        }
        void SaveWorkspace(string name,JObject config,Action done=null)
        {
            var state=Editing(config);
            void Save(JToken current){var settings=(JObject)current.DeepClone();var copy=(JObject)config.DeepClone();copy.Remove("requestId");settings["workspaces"][name]=copy;
                Request("/api/workspace-settings",saved=>{state.Settings=(JObject)saved;state.Baseline=config.ToString();shell.Notify("工作台配置已保存");done?.Invoke();},"PUT",settings);}
            if(state.Settings!=null)Save(state.Settings);else Request("/api/workspace-settings",Save);
        }
        void RestoreWorkspace(string name,Action<JObject> draw,JObject defaults)
        {
            WorkPage("正在载入工作台",Workbench);
            Request("/api/workspace-settings",settings=>{var value=(JObject)(settings["workspaces"]?[name]?.DeepClone()??defaults);Editing(value).Settings=(JObject)settings;draw(value);},failed:_=>draw(defaults));
        }
        void Export(string name,string text)
        {
            var file=LocalFilePicker.Save("导出文件","All files\0*.*\0\0",name);if(file==null)return;
            try{File.WriteAllText(file,text,new System.Text.UTF8Encoding(false));shell.Notify("已导出 "+Path.GetFileName(file));}catch(Exception e){shell.Notify(e.Message);}
        }
        void Download(string path,string name)
        {
            var file=LocalFilePicker.Save("导出产物","All files\0*.*\0\0",name);if(file==null)return;
            shell.Run(shell.Link.Download(path,bytes=>{try{File.WriteAllBytes(file,bytes);shell.Notify("产物已导出");}catch(Exception e){shell.Notify(e.Message);}},shell.Notify));
        }
        // Recycle only the visible rows; archives can contain thousands of items.
        Action Table(Transform parent,JToken[] items,Func<JToken,string> title,Func<JToken,string> detail,Action<JToken> open,float x=26,float y=178,float w=1428,float h=540)
        {
            var content=UI.Scroll(parent,x,y,w,h);var scroll=content.GetComponentInParent<UnityEngine.UI.ScrollRect>();
            const float rowHeight=76;content.sizeDelta=new Vector2(w-10,Mathf.Max(h,items.Length*rowHeight));
            var rows=new List<RectTransform>();var names=new List<TMP_Text>();var descriptions=new List<TMP_Text>();
            int count=Mathf.Min(items.Length,Mathf.CeilToInt(h/rowHeight)+2),first=-1;
            for(int i=0;i<count;i++) {
                int poolIndex=i;var row=UI.Box(content,"Row",0,0,w-22,70,new Color(.053f,.075f,.087f,.98f));rows.Add(row);
                var name=UI.Label(row,"",14,6,w-240,29,20);name.textWrappingMode=TextWrappingModes.NoWrap;name.overflowMode=TextOverflowModes.Ellipsis;names.Add(name);
                var description=UI.Label(row,"",14,38,w-240,25,15);description.textWrappingMode=TextWrappingModes.NoWrap;description.overflowMode=TextOverflowModes.Ellipsis;descriptions.Add(description);
                UI.Button(row,"打开",w-214,15,173,()=>{int at=first+poolIndex;if(at>=0 && at<items.Length)open(items[at]);});
            }
            void Render(){int at=Mathf.Clamp(Mathf.FloorToInt(content.anchoredPosition.y/rowHeight),0,Mathf.Max(0,items.Length-count));if(at==first)return;first=at;for(int i=0;i<rows.Count;i++){rows[i].anchoredPosition=new Vector2(0,-(at+i)*rowHeight);names[i].text=title(items[at+i]);descriptions[i].text=detail(items[at+i]);}}
            scroll.onValueChanged.AddListener(_=>Render());Render();
            if(items.Length==0)UI.Label(content,"暂无匹配记录。",14,12,w-80,50,22);
            return ()=>{first=-1;Render();};
        }
        void Document(string title,string text,Action back,int offset=0,string query="",int matchIndex=-1)
        {
            text??="";const int pageSize=12000;
            var panel=WorkPage(title,back);var search=UI.Input(panel,query,26,110,825,"搜索原文");
            UI.Button(panel,"查找下一个",865,110,180,()=>{if(search.text.Length==0)return;int from=search.text==query?Math.Max(offset,matchIndex+search.text.Length):0;int at=text.IndexOf(search.text,Math.Min(text.Length,from),StringComparison.OrdinalIgnoreCase);if(at<0)at=text.IndexOf(search.text,StringComparison.OrdinalIgnoreCase);if(at>=0)Document(title,text,back,at/pageSize*pageSize,search.text,at);else shell.Notify("未找到匹配内容");});
            UI.Button(panel,"复制全文",1060,110,185,()=>{GUIUtility.systemCopyBuffer=text;shell.Notify("已复制全文");});
            UI.Button(panel,"导出",1260,110,193,()=>Export(title+".txt",text));
            offset=Mathf.Clamp(offset,0,Math.Max(0,text.Length-1));int length=Math.Min(pageSize,text.Length-offset);
            var reader=UI.Multiline(panel,text.Substring(offset,length),26,174,1428,550,"",pageSize+1);reader.readOnly=true;
            if(matchIndex>=offset && matchIndex<offset+length){reader.ActivateInputField();reader.selectionStringAnchorPosition=matchIndex-offset;reader.selectionStringFocusPosition=Math.Min(length,matchIndex-offset+query.Length);}
            UI.Label(panel,$"第 {offset/pageSize+1} / {Math.Max(1,(text.Length+pageSize-1)/pageSize)} 页 · 原文 {text.Length:N0} 字符",26,751,800,35,18);
            UI.Button(panel,"上一页",1060,746,185,()=>Document(title,text,back,Math.Max(0,offset-pageSize),search.text)).interactable=offset>0;
            UI.Button(panel,"下一页",1260,746,193,()=>Document(title,text,back,offset+pageSize,search.text)).interactable=offset+length<text.Length;
        }
        void Choose(string title,JToken[] rows,Func<JToken,string> name,Action<JToken> selected,Action back)
        {
            var panel=WorkPage(title,back);var search=UI.Input(panel,"",26,112,1428,"搜索");
            RectTransform host=null;
            void Render(string q){if(host)UnityEngine.Object.Destroy(host.gameObject);host=UI.Box(panel,"Results",0,0,1480,808);host.SetAsFirstSibling();Table(host,rows.Where(r=>name(r).IndexOf(q,StringComparison.OrdinalIgnoreCase)>=0).ToArray(),name,r=>S(r,"id"),selected);}
            search.onValueChanged.AddListener(Render);Render("");
        }
        void PickModels(JObject config,string field,bool multiple,Action back)
        {
            WorkPage("选择模型",back);
            Request("/api/models",data=>{
                var rows=data["models"].Where(r=>(bool?)r["hidden"]!=true).ToArray();
                void Show(){Choose("选择"+(multiple?"参赛模型 · 点击切换，Esc 返回":"模型"),rows,r=>
                    (multiple && config[field] is JArray a && a.Values<string>().Contains(S(r,"id"))?"✓ ":"")+S(r,"name")+"  /  "+S(r,"source"),r=>{
                        if(multiple){var list=(JArray)(config[field]??(config[field]=new JArray()));string id=S(r,"id");var old=list.FirstOrDefault(v=>(string)v==id);if(old!=null)old.Remove();else list.Add(id);config.Remove("requestId");Show();}
                        else{config[field]=S(r,"id");config.Remove("requestId");back();}
                    },back);}
                Show();
            });
        }
        public void Workbench()
        {
            var panel=WorkPage("实验站工作台",WorkBack);
            string[] titles={"工程实验","多阶段实验","扩展开发","批量评测","历史与分析","任务中心"};
            string[] info={"任务、验收条件、Agent、代码差异与产物","基准、配置、预算、逐次调用与对比","多文件编辑、Codex 辅助、检查与应用","多模型同题评测、阵容与队列","完整答卷、各赛道榜单、实验比较","运行中、待评分及需要处理的任务"};
            Action[] actions={Engineering,Harness,Authoring,Evaluations,Analysis,TaskCenter};
            for(int i=0;i<titles.Length;i++){int index=i;float x=26+(i%2)*727,y=126+(i/2)*184;UI.Box(panel,"Module",x,y,700,157,new Color(.055f,.078f,.089f));UI.Button(panel,titles[i]+" →",x+20,y+19,660,actions[index],i==0);UI.Label(panel,info[i],x+20,y+79,658,58,19);}
            UI.Label(panel,"切换面板不改变比赛或实验状态。运行结果由本机后台保存。",26,719,1400,40,20,Mint);
        }
        public void TaskCenter()
        {
            var panel=WorkPage("任务中心",Workbench);UI.Button(panel,"刷新",1240,110,214,TaskCenter);
            var search=UI.Input(panel,"",26,110,1192,"搜索任务名称、模块或状态");
            Request("/api/tasks",data=>{
                var items=data["items"].ToArray();RectTransform host=null;
                void Draw(string q){if(host)UnityEngine.Object.Destroy(host.gameObject);host=UI.Box(panel,"Tasks",0,0,1480,808);host.SetAsFirstSibling();
                    Table(host,items.Where(r=>(S(r,"title")+S(r,"kind")+S(r,"status")).IndexOf(q,StringComparison.OrdinalIgnoreCase)>=0).ToArray(),r=>S(r,"title"),r=>S(r,"kind")+" · "+Status(S(r,"status"))+" · "+S(r,"id"),r=>{
                        string id=S(r,"id");switch(S(r,"kind")){case "engineering":EngineeringRun(id,TaskCenter);break;case "harness":HarnessRun(id,TaskCenter);break;case "authoring":AuthorDraft(id,TaskCenter);break;case "evaluation":EvaluationRun(id,TaskCenter);break;case "competition":UI.CloseModal();shell.Link.WatchCompetition(id);break;default:Request("/api/submissions/"+Url(id),v=>Document("提交记录",Pretty(v),TaskCenter));break;}
                    });}
                search.onValueChanged.AddListener(Draw);Draw("");UI.Label(panel,"运行中 "+data["active"]+" 项 · 开关工作台不会停止任务",26,750,1400,34,18,Mint);
            });
        }
    }
}
