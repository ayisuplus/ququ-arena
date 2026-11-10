using System;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace QuQu
{
    /** Task ownership outlives every workbench page. Closing UI never cancels work. */
    public class ArenaTaskCenter : MonoBehaviour
    {
        // P3：只吃三个能力切片——后端 JSON 请求、任务信号广播（延迟取用，组合根建站前不为空）、后端就绪查询。
        IJsonTransport transport;
        Func<ITaskSignalSink> signals;
        Func<bool> backendReady;
        public JArray Items { get; private set; } = new JArray();
        public int Active { get; private set; }
        public string Error { get; private set; }
        readonly HashSet<string> pending = new HashSet<string>();
        public void Initialize(IJsonTransport transport, Func<ITaskSignalSink> signals, Func<bool> backendReady)
        {
            this.transport = transport; this.signals = signals; this.backendReady = backendReady;
            StartCoroutine(Poll());
        }
        IEnumerator Poll() {
            while(true) {
                if(backendReady()) yield return Refresh();
                yield return new WaitForSecondsRealtime(3);
            }
        }
        public IEnumerator Refresh() {
            yield return transport.Json("/api/tasks","GET",null,data=>{
                Items=(JArray)data["items"];Active=(int)data["active"];Error=null;
                var sink=signals();
                // 保留原语义：轨道站是 UnityEngine.Object，销毁后不许再广播（C# 引用非空但 Unity 视为空）。
                if(sink!=null && (sink is UnityEngine.Object u ? (bool)u : true)) sink.UpdateTaskSignals(Items);
            },e=>Error=e);
        }
        public void Submit(string route,JObject body,Action<JToken> done,Action<string> failed) {
            string id=(string)body["requestId"]??Guid.NewGuid().ToString("N");body["requestId"]=id;
            if(!pending.Add(id))return;
            StartCoroutine(Send(route,(JObject)body.DeepClone(),id,done,failed));
        }
        IEnumerator Send(string route,JObject body,string id,Action<JToken> done,Action<string> failed) {
            bool ok=false;string error=null;
            yield return transport.Json(route,"POST",body,value=>{ok=true;done(value);},e=>error=e);
            if(!ok) {
                // Query the durable receipt; never blindly repeat a costly POST.
                for(int i=0;i<30;i++) {
                    bool waiting=false,missing=false;
                    yield return transport.Json("/api/submissions/"+Uri.EscapeDataString(id),"GET",null,receipt=>{
                        string state=(string)receipt["status"];
                        if(state=="completed"){ok=true;done(receipt["value"]);}
                        else if(state=="pending")waiting=true;
                        else error=(string)receipt["error"]??error;
                    },_=>missing=true);
                    if(ok || !waiting || missing)break;
                    yield return new WaitForSecondsRealtime(2);
                }
                if(!ok)failed(error+"\n提交号："+id+"。未自动重发，请在任务中心核对。");
            }
            pending.Remove(id);yield return Refresh();
        }
    }
}
