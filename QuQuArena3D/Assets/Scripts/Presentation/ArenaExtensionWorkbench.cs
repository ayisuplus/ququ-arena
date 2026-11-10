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
        public void Authoring()
        {
            var panel=WorkPage("Pi 扩展开发",Workbench);
            UI.Button(panel,"新建草稿",26,112,341,()=>Submit("/api/harness/authoring/drafts",new JObject{["name"]="我的扩展"},r=>DraftEditor((JObject)r,Authoring)),true);
            UI.Button(panel,"从模板创建",386,112,341,()=>Request("/api/harness/catalog",catalog=>Choose("扩展模板",catalog["nativeTemplates"].ToArray(),r=>S(r,"title"),r=>CreateDraft(S(r,"title"),(JObject)r["package"]),Authoring)));
            UI.Button(panel,"导入源码目录",747,112,341,()=>{var source=ImportSource();if(source!=null)CreateDraft("导入的扩展",source);});
            UI.Button(panel,"检测 Codex 与环境",1107,112,347,()=>Request("/api/harness/authoring/status",r=>Document("扩展开发环境",Pretty(r),Authoring)));
            Request("/api/harness/authoring/drafts",drafts=>Table(panel,drafts.ToArray(),r=>S(r,"name"),r=>Status(S(r,"status"))+" · 修订 "+r["revision"]+" · "+S(r,"updatedAt"),r=>AuthorDraft(S(r,"id"),Authoring)));
            UI.Label(panel,"现有 Codex 辅助开发流程 · 草稿保存后可检查并应用到实验配置",26,750,1428,34,18,Mint);
        }
        void CreateDraft(string name,JObject source)=>Submit("/api/harness/authoring/drafts",new JObject{["name"]=name,["source"]=new JObject{["files"]=source["files"]?.DeepClone(),["flags"]=source["flags"]?.DeepClone()??new JObject()}},r=>DraftEditor((JObject)r,Authoring));
        JObject ImportSource()
        {
            string manifest=LocalFilePicker.Pick("选择源码目录中的 package.json","Package manifest\0package.json\0\0");if(manifest==null)return null;
            try{
                string directory=Path.GetDirectoryName(manifest);var files=new JObject();long size=0;
                void Visit(string dir){foreach(var file in Directory.GetFiles(dir)){var info=new FileInfo(file);if((info.Attributes&FileAttributes.ReparsePoint)!=0)continue;string ext=Path.GetExtension(file).ToLowerInvariant();if(!new[]{".ts",".js",".mjs",".cjs",".json",".md"}.Contains(ext))continue;if(info.Length>128000)throw new Exception("单文件最多 128KB："+info.Name);size+=info.Length;if(size>256000 || files.Count>=32)throw new Exception("源码最多 32 个文件、总计 256KB");string relative=file.Substring(directory.Length+1).Replace('\\','/');files[relative]=File.ReadAllText(file);}
                    foreach(var child in Directory.GetDirectories(dir)){var info=new DirectoryInfo(child);if((info.Attributes&FileAttributes.ReparsePoint)!=0 || info.Name.StartsWith(".") || info.Name=="node_modules")continue;Visit(child);}}
                Visit(directory);return new JObject{["files"]=files,["flags"]=new JObject()};
            }catch(Exception e){shell.Notify(e.Message);return null;}
        }
        void AuthorDraft(string id,Action back)
        {
            var panel=WorkPage("扩展草稿",back);var owner=UI.Modal;JObject current=null;
            var status=UI.Label(panel,"正在读取…",26,112,1428,67,22,Mint);
            UI.Button(panel,"编辑源码与参数",26,199,697,()=>{if(current!=null)DraftEditor((JObject)current.DeepClone(),()=>AuthorDraft(id,back));},true);
            UI.Button(panel,"功能检查",747,199,708,()=>{if(current!=null)Submit("/api/harness/authoring/drafts/"+id+"/check",new JObject{["revision"]=current["revision"]},_=>AuthorDraft(id,back));});
            var instruction=UI.Multiline(panel,"",26,302,1428,177,"给 Codex 的开发需求或修复说明",100000);
            UI.Label(panel,"Codex 辅助开发 · 使用现有登录",26,261,1428,30,19);
            var send=UI.Button(panel,"发送开发 / 修复需求",26,502,697,()=>{});
            send.onClick.AddListener(()=>{if(current==null)return;send.interactable=false;Submit("/api/harness/authoring/drafts/"+id+"/message",new JObject{["revision"]=current["revision"],["prompt"]=instruction.text},_=>AuthorDraft(id,back),_=>send.interactable=true);});
            UI.Button(panel,"中止当前开发",747,502,708,()=>UI.Confirm("中止开发？","保留草稿、已写入文件和输出。",()=>Request("/api/harness/authoring/drafts/"+id+"/cancel",_=>AuthorDraft(id,back),"POST",new JObject()),"中止"));
            UI.Button(panel,"开发输出与日志",26,569,697,()=>Document("Codex 开发记录",Pretty(current?["turns"]),()=>AuthorDraft(id,back)));
            UI.Button(panel,"检查结果",747,569,708,()=>Document("功能检查",Pretty(current?["checks"]),()=>AuthorDraft(id,back)));
            UI.Button(panel,"导出已检查扩展",26,637,697,()=>Request("/api/harness/authoring/drafts/"+id+"/export",r=>Export(S(current,"name")+".json",Pretty(r))));
            UI.Button(panel,"应用到实验配置",747,637,708,()=>Request("/api/harness/authoring/drafts/"+id+"/export",r=>ProfileEditor(new JObject{["name"]=r["name"],["extensions"]=new JArray(),["prompts"]=new JObject(),["nativeExtensions"]=new JArray(r["source"])},()=>AuthorDraft(id,back))),true);
            UI.Button(panel,"导出草稿备份",26,738,1428,()=>{if(current!=null)Export(id+"-draft.json",Pretty(current));});
            shell.Run(PollWorkbench("/api/harness/authoring/drafts/"+id,owner,r=>{current=(JObject)r;status.text=S(r,"name")+" · 修订 "+r["revision"]+" · "+Status(S(r,"status"))+"\n"+S(r,"error");}));
            UI.SetGuard(next=>{if(instruction.text.Length==0)next();else UI.Confirm("开发需求尚未发送","返回会丢弃尚未发送的文字；可取消返回并继续编辑。",next,"放弃输入");});
        }
        void DraftEditor(JObject draft,Action back)
        {
            var source=(JObject)draft["source"];string baseline=draft.ToString();bool saving=false;
            Action draw=null;string selected=((JObject)source["files"]).Properties().FirstOrDefault()?.Name;
            draw=()=>{
                var panel=WorkPage("编辑扩展 · 修订 "+draft["revision"],back);
                Field(panel,"名称",draft,"name",26,107,360);
                var files=(JObject)source["files"];
                var list=UI.Scroll(panel,26,208,360,410);
                int index=0;foreach(var property in files.Properties()){string file=property.Name;UI.Button(list,file,0,index++*50,338,()=>{selected=file;draw();},file==selected);}list.sizeDelta=new Vector2(350,Mathf.Max(410,index*50));
                var newFile=UI.Input(panel,"",26,646,232,"相对路径.ts");
                UI.Button(panel,"添加",269,646,117,()=>{string name=newFile.text.Trim().Replace('\\','/');if(name.Length==0||name.Contains("..")||name.StartsWith("/")||files[name]!=null){shell.Notify("请输入新的包内文件路径");return;}files[name]="";selected=name;draw();});
                var search=UI.Input(panel,"",418,111,780,"搜索当前文件");TMP_InputField editor=null;
                UI.Button(panel,"查找",1217,111,237,()=>{if(!editor)return;int at=editor.text.IndexOf(search.text,Math.Min(editor.text.Length,editor.caretPosition+1),StringComparison.OrdinalIgnoreCase);if(at<0)at=editor.text.IndexOf(search.text,StringComparison.OrdinalIgnoreCase);if(at>=0){editor.ActivateInputField();editor.caretPosition=at;editor.selectionAnchorPosition=at;editor.selectionFocusPosition=at+search.text.Length;}});
                UI.Label(panel,selected??"请选择文件",418,175,1036,30,18,Mint);
                if(selected!=null && files[selected]!=null){editor=UI.Multiline(panel,(string)files[selected],418,215,1036,410,"源码",128000);string file=selected;editor.onValueChanged.AddListener(v=>files[file]=v);}
                UI.Button(panel,"编辑参数 flags",418,646,331,()=>EditJson("扩展参数",source["flags"]??new JObject(),v=>{source["flags"]=v;draw();},draw));
                UI.Button(panel,"删除当前文件",770,646,331,()=>UI.Confirm("删除文件？","保存草稿后生效。",()=>{files.Remove(selected);selected=files.Properties().FirstOrDefault()?.Name;draw();},"删除"));
                UI.Button(panel,"导出源码备份",1122,646,332,()=>Export(S(draft,"name")+"-source.json",Pretty(source)));
                void Save(Action done){if(saving)return;saving=true;Request("/api/harness/authoring/drafts/"+S(draft,"id")+"/edit",r=>{saving=false;baseline=draft.ToString();done();},"POST",new JObject{["revision"]=draft["revision"],["name"]=draft["name"],["source"]=source},_=>saving=false);}
                UI.Button(panel,"保存草稿",26,737,1428,()=>Save(()=>AuthorDraft(S(draft,"id"),back)),true);
                Guard(()=>draft.ToString()!=baseline,Save);
            };draw();
        }
        void EditJson(string title,JToken value,Action<JToken> save,Action back)
        {
            var panel=WorkPage(title,back);string baseline=Pretty(value);
            UI.Label(panel,"保留未编辑字段；保存时校验 JSON，后端继续校验内容与版本。",26,110,1428,40,19);
            var editor=UI.Multiline(panel,baseline,26,171,1428,525,"JSON",500000);
            void Save(Action done){try{var parsed=JToken.Parse(editor.text);save(parsed);done?.Invoke();}catch(Exception e){shell.Notify(e.Message);}}
            UI.Button(panel,"应用修改",26,737,1428,()=>Save(null),true);
            Guard(()=>editor.text!=baseline,done=>Save(null));
        }
        void ProfileEditor(JObject config,Action back)
        {
            config??=new JObject{["name"]="新实验配置",["extensions"]=new JArray("plan"),["prompts"]=new JObject(),["nativeExtensions"]=new JArray()};
            var panel=WorkPage("实验扩展配置",back);var edit=Editing(config);
            Field(panel,"配置名称",config,"name",26,109,1428);
            var selected=(JArray)config["extensions"];var prompts=(JObject)config["prompts"];
            int i=0;foreach(var key in new[]{"plan","review"}){string stage=key;float x=26+i++*726;
                var button=UI.Button(panel,(selected.Values<string>().Contains(stage)?"✓ ":"")+(stage=="plan"?"规划阶段":"复查阶段"),x,207,700,()=>{});
                button.onClick.AddListener(()=>{var old=selected.FirstOrDefault(v=>(string)v==stage);if(old!=null)old.Remove();else selected.Add(stage);config.Remove("requestId");button.GetComponentInChildren<TMP_Text>().text=(selected.Values<string>().Contains(stage)?"✓ ":"")+stage;});
                TextField(panel,"提示词 · 留空使用后台默认",prompts,stage,x,271,700,171,16000).onValueChanged.AddListener(_=>config.Remove("requestId"));
            }
            UI.Button(panel,"复制已有配置",26,522,450,()=>Request("/api/harness/catalog",r=>Choose("复制配置",r["profiles"].Where(v=>S(v,"id")!="baseline").ToArray(),v=>S(v,"name"),v=>{
                var copy=new JObject{["name"]=S(v,"name")+" 副本",["extensions"]=new JArray(v["extensions"].Select(e=>S(e,"id"))),["prompts"]=new JObject(v["extensions"].Select(e=>new JProperty(S(e,"id"),S(e,"prompt")))),["nativeExtensions"]=v["nativeExtensions"]?.DeepClone()??new JArray()};ProfileEditor(copy,back);},()=>ProfileEditor(config,back))));
            UI.Button(panel,"导入原生扩展目录",501,522,451,()=>{var source=ImportSource();if(source!=null){((JArray)config["nativeExtensions"]).Add(source);config.Remove("requestId");ProfileEditor(config,back);}});
            UI.Button(panel,"管理原生扩展 · "+config["nativeExtensions"].Count(),978,522,476,()=>EditJson("原生扩展源码与参数",config["nativeExtensions"],value=>{if(!(value is JArray))throw new Exception("需要扩展数组");config["nativeExtensions"]=value;config.Remove("requestId");ProfileEditor(config,back);},()=>ProfileEditor(config,back)));
            UI.Button(panel,"检测扩展注册的工具与事件",26,594,1428,()=>Request("/api/harness/profiles/inspect",r=>Document("扩展能力检查",Pretty(r),()=>ProfileEditor(config,back)),"POST",new JObject{["nativeExtensions"]=config["nativeExtensions"]}));
            void Save(Action done){foreach(var prop in prompts.Properties().Where(p=>string.IsNullOrWhiteSpace((string)p.Value)).ToArray())prop.Remove();Submit("/api/harness/profiles",config,_=>{edit.Baseline=config.ToString();done();});}
            UI.Button(panel,"保存为新配置",26,737,1428,()=>Save(back),true);
            Guard(()=>config.ToString()!=edit.Baseline,Save);
        }
    }
}
