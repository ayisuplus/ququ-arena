using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;

namespace QuQu
{
    public partial class ArenaDesktopHub
    {
        public void Models(Action back = null,bool refresh=false)
        {
            back ??= Agents;
            var panel = Page("模型与 API",back);
            var search = UI.Input(panel,"",28,92,520,"搜索模型名称、提供方或 ID");
            UI.Button(panel,"+ 自定义接口",568,92,210,()=>EditModel(null,()=>Models(back)),true);
            UI.Button(panel,"OpenRouter 设置",792,92,218,()=>Router(()=>Models(back)));
            var list=UI.Scroll(panel,28,207,982,371);
            UI.Label(list,"正在读取模型目录…",0,0,950,40);
            Request("/api/models"+(refresh?"?refresh=1":""),data=>{
                var models=(JArray)data["models"];
                int source=0,availability=0,hidden=0,pageIndex=0,total=0;string[] sources={"全部来源","openrouter","custom","builtin"};
                var note=UI.Label(panel,"",28,586,960,28,15);
                void Render(string query)
                {
                    foreach(Transform child in list) UnityEngine.Object.Destroy(child.gameObject);
                    float y=0;
                    var filtered=models.Where(m=>(S(m,"name")+S(m,"id")+S(m,"source")+S(m,"manufacturer")+S(m,"channel")).IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0 && (source==0||S(m,"source")==sources[source]) && (availability==0||((bool?)m["ready"]==true)==(availability==1)) && (hidden==1 || ((bool?)m["hidden"]==true)==(hidden==2))).ToArray();total=filtered.Length;pageIndex=Math.Min(pageIndex,Math.Max(0,(total-1)/16));
                    foreach(var row in filtered.Skip(pageIndex*16).Take(16))
                    {
                        var model=row; string id=S(model,"id");
                        var title=UI.Label(list,S(model,"name")+((bool?)model["hidden"]==true?"  · 已隐藏":""),0,y,510,34,21);
                        title.textWrappingMode=TextWrappingModes.NoWrap; title.overflowMode=TextOverflowModes.Ellipsis;
                        var detail=UI.Label(list,id+"  /  "+((bool?)model["ready"]==true?"已配置":"待配置")+"  /  "+S(model["connection"],"state"),0,y+37,510,32,14);
                        detail.textWrappingMode=TextWrappingModes.NoWrap; detail.overflowMode=TextOverflowModes.Ellipsis;
                        if(S(model,"source")!="custom")UI.Button(list,(bool?)model["hidden"]==true?"恢复":"隐藏",527,y+12,112,()=>Request("/api/model-settings/catalog",_=>Models(back),"PUT",new JObject{["id"]=id,["hidden"]=(bool?)model["hidden"]!=true}));
                        UI.Button(list,"编辑",650,y+12,110,()=>EditModel((JObject)model.DeepClone(),()=>Models(back)));
                        var probe=UI.Button(list,"检测连接",772,y+12,180,()=>{});
                        probe.onClick.AddListener(()=>{probe.interactable=false; detail.text="正在检测…"; Request("/api/model-settings/check",r=>{detail.text=S(r,"error",S(r,"message","检测完成")); probe.interactable=true;},"POST",new JObject{["id"]=id},_=>probe.interactable=true);});
                        y+=86;
                    }
                    if(y==0)UI.Label(list,"没有匹配的模型，可添加自定义接口。",0,0,950,40);
                    list.sizeDelta=new Vector2(970,Mathf.Max(371,y));note.text=$"共 {total} 个 · 第 {pageIndex+1} 页 · "+S(data["catalog"],"error","密钥仅保存在本机后台");
                }
                var sourceButton=UI.Button(panel,sources[0],28,148,225,()=>{});sourceButton.onClick.AddListener(()=>{source=(source+1)%4;sourceButton.GetComponentInChildren<TMP_Text>().text=sources[source];pageIndex=0;Render(search.text);});
                var readyButton=UI.Button(panel,"全部连接状态",269,148,232,()=>{});readyButton.onClick.AddListener(()=>{availability=(availability+1)%3;readyButton.GetComponentInChildren<TMP_Text>().text=new[]{"全部连接状态","已配置 / 可用","待配置 / 不可用"}[availability];pageIndex=0;Render(search.text);});
                var hiddenButton=UI.Button(panel,"排除隐藏模型",517,148,232,()=>{});hiddenButton.onClick.AddListener(()=>{hidden=(hidden+1)%3;hiddenButton.GetComponentInChildren<TMP_Text>().text=new[]{"排除隐藏模型","包含隐藏模型","只看隐藏模型"}[hidden];pageIndex=0;Render(search.text);});
                UI.Button(panel,"刷新在线目录",765,148,245,()=>Models(back,true));
                UI.Button(panel,"上一页",600,619,194,()=>{pageIndex=Math.Max(0,pageIndex-1);Render(search.text);});UI.Button(panel,"下一页",810,619,200,()=>{if((pageIndex+1)*16<total)pageIndex++;Render(search.text);});
                search.onValueChanged.AddListener(q=>{pageIndex=0;Render(q);}); Render(search.text);
            });
            UI.Label(panel,"检测连接会发送一条简短测试请求。",28,628,550,28,15);
        }
        void EditModel(JObject model, Action back)
        {
            bool custom=model==null || S(model,"source")=="custom";
            var panel=Page(custom?"自定义 API 模型":"模型显示设置",back);
            UI.Label(panel,"显示名称",28,98,170,30); var name=UI.Input(panel,S(model,"name"),210,90,800);
            TMP_InputField endpoint=null,modelId=null,key=null; bool stream=(bool?)model?["stream"]??true, hidden=(bool?)model?["hidden"]??false;
            bool clearKey=false;
            if(custom)
            {
                UI.Label(panel,"接口地址",28,160,170,30); endpoint=UI.Input(panel,S(model,"baseUrl"),210,152,800,"https://提供方地址/v1"); endpoint.characterLimit=2000;
                UI.Label(panel,"模型 ID",28,222,170,30); modelId=UI.Input(panel,S(model,"modelId"),210,214,800,"提供方的模型 ID");
                UI.Label(panel,"API Key",28,284,170,30); key=UI.Input(panel,"",210,276,800,(bool?)model?["hasApiKey"]==true?"已保存；留空保持原密钥":"输入密钥（本机接口可留空）");
                key.contentType=TMP_InputField.ContentType.Password; key.characterLimit=8192;
                var toggle=UI.Button(panel,stream?"流式输出：开":"流式输出：关",210,342,370,()=>{});
                toggle.onClick.AddListener(()=>{stream=!stream;toggle.GetComponentInChildren<TMP_Text>().text=stream?"流式输出：开":"流式输出：关";});
                var clear=UI.Button(panel,"保留已有密钥",602,342,408,()=>{});
                clear.onClick.AddListener(()=>{clearKey=!clearKey;clear.GetComponentInChildren<TMP_Text>().text=clearKey?"保存时清除密钥":"保留已有密钥";});
                UI.Label(panel,"兼容 OpenAI Chat Completions 接口。\n保存后可从模型列表检测连接，再选择为选手、裁判或 Pi 解说模型。",210,420,800,85,19);
            }
            else
            {
                UI.Label(panel,S(model,"id"),28,167,980,55,19);
                var toggle=UI.Button(panel,hidden?"模型已隐藏":"模型可见",210,250,800,()=>{});
                toggle.onClick.AddListener(()=>{hidden=!hidden;toggle.GetComponentInChildren<TMP_Text>().text=hidden?"模型已隐藏":"模型可见";});
            }
            JObject Body()=>custom?new JObject{["name"]=name.text,["baseUrl"]=endpoint.text,["modelId"]=modelId.text,["apiKey"]=key.text,["stream"]=stream,["clearApiKey"]=clearKey}:new JObject{["id"]=S(model,"id"),["name"]=name.text,["hidden"]=hidden};
            string baseline=Body().ToString(); bool saving=false;
            void Save(Action done)
            {
                if(saving)return; saving=true;
                string route=custom?"/api/model-settings/custom"+(model==null?"":"/"+Url(S(model,"id"))):"/api/model-settings/catalog";
                Request(route,_=>{saving=false;baseline=Body().ToString();done();},custom&&model==null?"POST":"PUT",Body(),_=>saving=false);
            }
            Guard(()=>Body().ToString()!=baseline,Save);
            UI.Button(panel,"保存",28,592,290,()=>Save(back),true);
            UI.Button(panel,"返回",340,592,290,UI.Back);
            if(custom&&model!=null)UI.Button(panel,"删除模型",720,592,290,()=>UI.Confirm("删除这个模型？","已保存的比赛与答卷仍然保留。",()=>Request("/api/model-settings/custom/"+Url(S(model,"id")),_=>back(),"DELETE"),"删除"));
        }
        void Router(Action back)
        {
            var panel=Page("OpenRouter",back);
            UI.Label(panel,"API Key",28,112,180,35);
            var key=UI.Input(panel,"",210,105,800,"留空保留已有密钥");key.contentType=TMP_InputField.ContentType.Password; key.characterLimit=8192;
            UI.Label(panel,"保存后模型目录会显示可用模型；可逐个检测连接。",28,200,970,60,21);
            bool clear=false;var toggle=UI.Button(panel,"保留已有密钥",210,290,800,()=>{});
            toggle.onClick.AddListener(()=>{clear=!clear;toggle.GetComponentInChildren<TMP_Text>().text=clear?"保存时清除密钥":"保留已有密钥";});
            void Save(Action done)=>Request("/api/model-settings/openrouter",_=>done(),"PUT",new JObject{["apiKey"]=key.text,["clearApiKey"]=clear});
            Guard(()=>key.text.Length>0||clear,Save);
            UI.Button(panel,"保存",28,592,300,()=>Save(back),true);
            UI.Button(panel,"检测账户可用性",350,592,660,()=>Request("/api/model-settings/openrouter/check",r=>Document("OpenRouter 连接状态",Pretty(r),()=>Router(back)),"POST",new JObject()));
        }
    }
}
