using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;

namespace QuQu
{
    public class ArenaDuelController : MonoBehaviour
    {
        public CompetitionSnapshot Snapshot { get; private set; }
        public CompetitionRound Round { get; private set; }
        public string Phase = "准备 · 等待开赛";
        public bool Replaying { get; private set; }
        public int PresentedRounds, AppliedHits;
        public bool Presenting { get; private set; }
        public string DuelId { get; private set; }
        ArenaGame game;
        Queue<CompetitionEvent> queue = new Queue<CompetitionEvent>();
        HashSet<string> resolved = new HashSet<string>();
        Coroutine player;
        long cursor;
        string competitionId;
        readonly HashSet<string> selected = new HashSet<string>();
        string arena = "tongjia-pinyin", judge = "";
        int limit = 10;
        public void Initialize(ArenaGame owner) { game = owner; game.Connection.OnCompetition = Receive; }
        public void Receive(CompetitionPacket packet, bool reset)
        {
            if (packet?.snapshot == null) return;
            if (competitionId != packet.id) { Clear(); competitionId = packet.id; Replaying = false; }
            Snapshot = packet.snapshot;
            if (reset)
            {
                Clear(); competitionId = packet.id; cursor = packet.seq;
                var d = Snapshot.duels.FirstOrDefault(x=>x.id==Snapshot.activeDuelId) ?? Snapshot.duels.LastOrDefault(x=>x.players?.Length==2 && x.rounds?.Length>0) ?? Snapshot.duels[0];
                LoadDuel(d); ApplyHealth(d.hp); SetRound(d.rounds?.LastOrDefault());
                Phase = Snapshot.status=="completed" ? "冠军 · "+Name(Snapshot.winner) : Snapshot.status=="waiting" ? "待续 · "+Snapshot.reason : Snapshot.status=="stopped" ? "赛事已停止" : "已同步当前状态";
                if(d.status=="completed") Celebrate(d.winner);
                game.Finished = Snapshot.status=="completed" || Snapshot.status=="stopped";
                return;
            }
            foreach(var e in packet.events ?? Array.Empty<CompetitionEvent>()) if(e.seq>cursor) { cursor=e.seq; queue.Enqueue(e); }
            if(player==null && queue.Count>0) player=StartCoroutine(Play());
            if(!Presenting && queue.Count==0)
            {
                var d=Snapshot.duels.FirstOrDefault(x=>x.id==DuelId); var r=d?.rounds?.LastOrDefault();
                if(r!=null && r.id==Round?.id && !r.settled) SetRound(r);
            }
        }
        void Clear()
        {
            if(player!=null) StopCoroutine(player); player=null; queue.Clear(); resolved.Clear(); cursor=0; Round=null; Presenting=false; game.Stage.EndCombat();
        }
        public string Name(string id) => Snapshot?.entrants?.FirstOrDefault(x=>x.id==id)?.name ?? id ?? "待定";
        void LoadDuel(CompetitionDuel d)
        {
            if(d?.players?.Length!=2) return;
            DuelId=d.id; game.SetRoster(d.players.Select(id=>new ModelInfo { id=id, name=Name(id) }).ToArray());
            game.Finished=false; Round=null; ApplyHealth(d.hp); game.Stage.ResetCamera();
            Phase="对局 "+d.id+" · "+Name(d.players[0])+" VS "+Name(d.players[1]);
        }
        void ApplyHealth(double[] hp)
        {
            if(hp==null || hp.Length!=2 || game.Stage.Fighters.Count!=2) return;
            for(int i=0;i<2;i++) game.Stage.Fighters[i].State.Health=(float)hp[i];
        }
        void SetRound(CompetitionRound r)
        {
            if(r==null) return; Round=r;
            game.UI.SetQuestion(r.question?.task?.input ?? "");
            foreach(var f in game.Stage.Fighters)
            {
                var live=r.live?.FirstOrDefault(a=>a.modelId==f.State.Id); var rec=r.records?.FirstOrDefault(a=>a!=null && a.model==f.State.Id);
                f.State.TaskId=r.question?.task?.id; f.State.Answer=live?.answer ?? rec?.answer ?? ""; f.State.Reasoning=live?.reasoning ?? rec?.reasoning ?? "";
                f.State.Status=live?.status ?? "waiting"; f.State.Note=live?.error ?? rec?.error ?? (rec!=null && string.IsNullOrEmpty(rec.error)?"得分 "+(rec.score*100).ToString("0.#")+"%":"");
            }
        }
        IEnumerator Play()
        {
            // Do not finish synchronously before StartCoroutine assigns its handle.
            yield return null;
            while(queue.Count>0)
            {
                var e=queue.Dequeue(); game.AcceptedFrames++;
                switch(e.type)
                {
                    case "competition-start": game.Finished=false; Phase="抽签锁定 · 赛事开始"; break;
                    case "duel-start": LoadDuel(e.duel); break;
                    case "round-start":
                        SetRound(e.round); ApplyHealth(e.round.before); Phase="作答 · 双方正在思考"; break;
                    case "model":
                        SetRound(e.round); Phase=e.round.phase=="judging"?"判分 · 等待双方有效评分":"作答 · 双方正在思考"; break;
                    case "round-resolved":
                        string key=e.competitionId+"/"+e.duelId+"/"+e.round.id;
                        if(!resolved.Add(key)) break;
                        SetRound(e.round); ApplyHealth(e.round.before); Phase="交锋 · 技能释放"; Presenting=true;
                        yield return game.Stage.PresentRound(e.round,()=>{ApplyHealth(e.round.after); AppliedHits++;});
                        Phase="本题结果 · "+string.Join("  /  ",e.round.attacks.Select(a=>Name(a.target)+" −"+a.damage.ToString("0.#")));
                        PresentedRounds++; Presenting=false;
                        yield return new WaitForSecondsRealtime(game.Stage.Motion>0?.5f:0); break;
                    case "duel-end": Celebrate(e.winner); Phase="本场胜者 · "+Name(e.winner); break;
                    case "pending": Phase=e.message ?? "平局 / 异常待续"; break;
                    case "control": Phase=e.message; break;
                    case "intermission":
                        if(Replaying) { yield return new WaitForSecondsRealtime(1); break; }
                        float deadline=Time.unscaledTime+5;
                        while(Time.unscaledTime<deadline && queue.Count==0)
                        {
                            if(Snapshot.status=="paused") { Phase="场间已暂停 · 继续后进入下一场"; deadline+=Time.unscaledDeltaTime; }
                            else Phase="场间休息 · "+Mathf.CeilToInt(deadline-Time.unscaledTime)+" 秒 · 可查看对阵或暂停";
                            yield return null;
                        }
                        break;
                    case "competition-end":
                        game.Finished=true;
                        Phase=string.IsNullOrEmpty(e.winner)?e.message:"赛事冠军 · "+Name(e.winner);
                        if(!string.IsNullOrEmpty(e.winner)) Celebrate(e.winner); break;
                }
                game.UI.Round.text=Phase;
            }
            player=null;
        }
        void Celebrate(string winner)
        {
            if(string.IsNullOrEmpty(winner)) return;
            foreach(var f in game.Stage.Fighters) { f.Celebrating=f.State.Id==winner; f.Defeated=!f.Celebrating; }
            game.Selected=winner; game.Media.Celebrate();
        }
        public void Replay(string id)
        {
            game.Connection.Disconnect();
            StartCoroutine(game.Connection.Request<CompetitionPacket>("/api/game/competitions/"+id,null,p=>
            {
                Clear(); competitionId=id; Snapshot=p.snapshot; Replaying=true; game.UI.CloseModal();
                foreach(var e in p.events ?? Array.Empty<CompetitionEvent>()) queue.Enqueue(e);
                player=StartCoroutine(Play());
            },game.Notify));
        }
        void ModalMode() { if(game.IsSpectating) game.ToggleSpectator(); }
        public void ShowBracket()
        {
            ModalMode(); var ui=game.UI; var panel=ui.OpenModal("对阵表 / BRACKET");
            if(Snapshot==null) { ui.Label(panel,"开始赛事后显示固定对阵树。",28,95,980,60); return; }
            ui.Label(panel,Snapshot.entrants.Length+" 人单败 · "+Snapshot.duels.Length+" 场 · "+Snapshot.status,28,81,950,35,19,ui.Accent);
            var body=ui.Scroll(panel,28,128,980,450); body.sizeDelta=new Vector2(970,Mathf.Max(450,Snapshot.duels.Length*92));
            for(int i=0;i<Snapshot.duels.Length;i++)
            {
                var d=Snapshot.duels[i]; string pair=d.players?.Length==2 ? Name(d.players[0])+"  VS  "+Name(d.players[1]) : string.Join(" / ",d.sources.Select(x=>x+" 胜者"));
                ui.Label(body,d.id+" · 第 "+(d.stage+1)+" 轮  "+pair+"\n"+Status(d),0,i*92,735,82,18);
                if(d.status=="waiting" && !Replaying) ui.Button(body,d.reason=="failure" || d.reason=="interrupted"?"重试 / 继续":"补题续赛",750,i*92+15,200,()=>ContinueDuel(d));
            }
            ui.Button(panel,"刷新对阵",28,603,200,ShowBracket);
            ui.Button(panel,"暂停",244,603,180,()=>game.Connection.Control("pause"));
            ui.Button(panel,"继续赛事",440,603,220,()=> { if(Snapshot.status=="waiting") game.Connection.Continue(Snapshot.id); else game.Connection.Control("resume"); ui.CloseModal(); });
            ui.Button(panel,"回放 / 待续记录",680,603,328,ShowHistory);
        }
        string Status(CompetitionDuel d) => d.status=="completed"?"胜者："+Name(d.winner):d.status=="blocked"?"等待上游胜者":d.status=="waiting"?(d.reason=="failure"?"异常待续 · 未扣血":d.reason=="interrupted"?"中断待续":"平局待续 · 需要新题"):d.status=="running"?"正在对战":"待开场";
        void ContinueDuel(CompetitionDuel d)
        {
            if(d.reason=="failure" || d.reason=="interrupted") { game.Connection.Continue(Snapshot.id,d.id); game.UI.CloseModal(); return; }
            var ui=game.UI;var p=ui.OpenModal("为 "+d.id+" 选择补充题库"); var content=ui.Scroll(p,28,95,980,530);
            StartCoroutine(game.Connection.Request<Catalog>("/api/game/catalog",null,c=>
            {
                if(!p) return; var banks=c.arenas.Where(a=>a.mode=="qa" && (!a.needsJudge || !string.IsNullOrEmpty(Snapshot.config.judge))).ToArray(); content.sizeDelta=new Vector2(970,Mathf.Max(530,banks.Length*50));
                for(int i=0;i<banks.Length;i++) { var bank=banks[i]; ui.Button(content,bank.title+" · "+bank.count+" 题",0,i*50,950,()=> { game.Connection.Continue(Snapshot.id,d.id,bank.id); ui.CloseModal(); }); }
            },game.Notify));
        }
        public void ShowHistory()
        {
            ModalMode(); var ui=game.UI; var p=ui.OpenModal("游戏赛事 / 存档、回放与待续");var content=ui.Scroll(p,28,94,982,480);
            ui.Button(p,"旧多模型历史战报 ↗",28,605,370,()=>game.OpenWeb("/results"));
            StartCoroutine(game.Connection.Request<Catalog>("/api/game/catalog",null,c=>
            {
                if(!p) return;var entries=c.competitions ?? Array.Empty<CompetitionSummary>(); content.sizeDelta=new Vector2(972,Mathf.Max(480,entries.Length*84));
                if(entries.Length==0) ui.Label(content,"还没有游戏赛事存档。",0,0,900,50);
                for(int i=0;i<entries.Length;i++) {var item=entries[i];ui.Label(content,item.title+" · "+item.status+"\n"+item.createdAt,0,i*84,575,72,17);ui.Button(content,"回放",610,i*84+10,145,()=>Replay(item.id));ui.Button(content,"观看 / 续赛",770,i*84+10,185,()=>{ui.CloseModal();game.Connection.WatchCompetition(item.id);});}
            },game.Notify));
        }
        public void ShowLobby()
        {
            ModalMode(); var ui=game.UI;var p=ui.OpenModal("1V1 赛事大厅 / MATCH SETUP");
            var endpoint=ui.Input(p,game.Connection.BaseUrl,28,80,540);
            ui.Button(p,"连接",580,80,100,()=>{if(game.Connection.SetEndpoint(endpoint.text)){game.Preferences.endpoint=game.Connection.BaseUrl;game.ApplyPreferences();ShowLobby();}});
            ui.Button(p,"配置模型 ↗",696,80,160,()=>game.OpenWeb("/")); ui.Button(p,"赛事存档",870,80,140,ShowHistory);
            ui.Label(p,"01  普通问答题库",28,136,455,32,20,ui.Accent);ui.Label(p,"02  选择 2 / 4 / 8 位选手",525,136,480,32,20,ui.Accent);
            var banks=ui.Scroll(p,28,176,455,279);var models=ui.Scroll(p,525,176,485,279);
            var info=ui.Label(p,"每场 100 HP · 失分 × 20 · 先展示抽签，再锁定开赛",28,468,982,47,17);
            ui.Label(p,"常规题数",28,528,120,32,17);var count=ui.Input(p,limit.ToString(),145,521,80);
            ui.Label(p,"裁判 ID（规则评分留空）",254,528,305,32,17);var judgeInput=ui.Input(p,judge,561,521,449);
            Catalog catalog=null;
            ui.Button(p,"抽签 / 检查配置 →",28,606,290,()=>
            {
                if(catalog==null || catalog.gameVersion<2) {info.text="后端需要更新到对决版本，请重新运行启动入口。";return;}
                if(!new[]{2,4,8}.Contains(selected.Count)||!int.TryParse(count.text,out limit)||limit<1||limit>100) {info.text="选手只能为 2、4、8 人；题数 1–100。";return;}
                var bank=catalog.arenas.FirstOrDefault(a=>a.id==arena);judge=judgeInput.text.Trim();
                if(bank==null || (bank.needsJudge && string.IsNullOrEmpty(judge))) {info.text="请选择题库；模型评分题库需要裁判 ID。";return;}
                var draw=selected.OrderBy(_=>Guid.NewGuid()).ToArray();
                Preview(new Launch {arena=arena,models=selected.ToArray(),draw=draw,limit=Math.Min(limit,bank.count),judge=judge,requestId=Guid.NewGuid().ToString()},bank,limit);
            },true);
            ui.Button(p,"离线 1V1 体验",338,606,250,game.Demo);ui.Button(p,"工程 / 多阶段工作台 ↗",610,606,400,()=>game.OpenWeb("/"));
            StartCoroutine(game.Connection.Request<Catalog>("/api/game/catalog",null,c=>
            {
                if(!p)return;catalog=c;var rows=(c.arenas??Array.Empty<ArenaInfo>()).Where(a=>a.mode=="qa").ToArray();banks.sizeDelta=new Vector2(445,Mathf.Max(279,rows.Length*48));
                for(int i=0;i<rows.Length;i++){var a=rows[i];ui.Button(banks,a.title+" · "+a.count+" 题",0,i*48,435,()=>{arena=a.id;info.text=a.title+" · "+(a.needsJudge?"模型评分":"规则评分")+" · 已选 "+selected.Count+" 位选手";});}
            },game.Notify));
            StartCoroutine(game.Connection.Request<ModelCatalog>("/api/models",null,c=>
            {
                if(!p)return;var rows=(c.models??Array.Empty<ModelInfo>()).Where(m=>m.ready&&!m.hidden&&!m.id.StartsWith("mock:")).ToArray();models.sizeDelta=new Vector2(475,Mathf.Max(279,rows.Length*48));
                if(rows.Length==0)ui.Label(models,"暂无可用模型，请先配置模型。",0,0,450,70);
                for(int i=0;i<rows.Length;i++){var m=rows[i];UnityEngine.UI.Button button=null;button=ui.Button(models,(selected.Contains(m.id)?"● ":"○ ")+m.name,0,i*48,465,()=>{if(!selected.Remove(m.id)&&selected.Count<8)selected.Add(m.id);button.GetComponentInChildren<TMP_Text>().text=(selected.Contains(m.id)?"● ":"○ ")+m.name;info.text="已选 "+selected.Count+" 位 · 题库 "+arena;});}
            },game.Notify));
        }
        public void Preview(Launch config,ArenaInfo bank,int requested)
        {
            var ui=game.UI;var p=ui.OpenModal("首轮抽签 / 开赛后锁定");
            ui.Label(p,(config.models.Length==2?"直接对决":config.models.Length+" 人淘汰赛，共 "+(config.models.Length-1)+" 场")+" · 每场 "+config.limit+" 题"+(requested>config.limit?"\n题库不足，已由 "+requested+" 题调整为 "+config.limit+" 题":"")+"\n加赛最多 3 题，无新题时等待补充。",28,88,982,105,20);
            for(int i=0;i<config.draw.Length/2;i++)ui.Label(p,"M"+(i+1)+"    "+config.draw[i*2]+"   VS   "+config.draw[i*2+1],28,215+i*70,982,60,21);
            ui.Button(p,"锁定对阵并开赛",28,602,475,()=>{ui.CloseModal();game.Connection.Launch(config);},true);
            ui.Button(p,"返回配置",524,602,486,ShowLobby);
        }
    }
}
