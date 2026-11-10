using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;

namespace QuQu
{
    public partial class ArenaDesktopHub : IWorkbenchLauncher // P3：接口成员由其余分部（History/Models/Banks 等）提供
    {
        readonly IArenaShell shell;
        ArenaUI UI => shell.UI;
        public ArenaDesktopHub(IArenaShell owner) { shell = owner; }
        static string S(JToken value, string key, string fallback = "") => value is JObject ? (string)value[key] ?? fallback : fallback;
        static string Url(string value) => Uri.EscapeDataString(value ?? "");
        RectTransform Page(string title, Action back)
        {
            if (shell.IsSpectating) shell.ToggleSpectator();
            shell.Reader.Close(); shell.Commentary.Close(); shell.Hud.CloseMenu();
            if(shell.Stations.Current==ArenaOrbitalNetwork.Place.Lab)UI.ClearClosed();
            var panel = UI.OpenModal(title); UI.SetBack(back); return panel;
        }
        void Request(string path, Action<JToken> done, string method = "GET", JToken body = null, Action<string> failed = null)
        {
            var owner = UI.Modal;
            shell.Run(shell.Link.Json(path, method, body, value => { if (owner && owner == UI.Modal) done(value); }, error => { if(owner && owner == UI.Modal) { shell.Notify(error); failed?.Invoke(error); } }));
        }
        void Guard(Func<bool> dirty, Action<Action> save)
        {
            UI.SetGuard(next => { if (!dirty()) next(); else UI.Confirm("还有未保存的修改", "保存后返回，或放弃这次修改。", next, "放弃修改", save); });
        }
        void ReadText(string title, string text, Action back)
        {
            Document(title,text,back);
        }
        public void Agents()
        {
            var panel = Page("模型与 Agent",shell.ShowHome);
            UI.Button(panel,"API 模型",28,88,310,()=>Models(),true);
            UI.Button(panel,"Pi / 自定义解说",365,88,310,()=>{shell.Commentary.ShowSettings(); UI.SetBack(Agents);});
            UI.Button(panel,"重新检测 Agent",700,88,310,Agents);
            var content = UI.Scroll(panel,28,155,982,475);
            UI.Label(content,"正在读取本机 Agent 状态…",0,0,950,40);
            Request("/api/shell/agents?refresh=1",data=>{
                foreach(Transform child in content) UnityEngine.Object.Destroy(child.gameObject);
                float y=0;
                foreach(var row in data["agents"] ?? new JArray()) { UI.Label(content,S(row,"name")+"  /  "+S(row,"status")+"\n"+S(row,"message"),0,y,950,78,20); y+=90; }
                UI.Label(content,"解说默认使用 Pi，也可选择直接 LLM 或本地程序。\n本机参赛 Agent 沿用已安装程序及其登录状态。",0,y+15,950,95,18);
                content.sizeDelta = new Vector2(970,Mathf.Max(475,y+130));
            });
        }
        public void Advanced() { shell.Stations.Visit(ArenaOrbitalNetwork.Place.Lab); }
    }
}
