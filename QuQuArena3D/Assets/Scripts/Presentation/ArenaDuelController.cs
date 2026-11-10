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
        public string PresentedPhase { get; private set; } = "ready";
        public event Action<CompetitionRound> RoundHit;
        public event Action<CompetitionRound> RoundUpdated;
        public event Action PresentationReset;
        public event Action<ArenaDuelResult> ResultPresented;
        public event Action<CompetitionEvent> PresentedEvent;
        public string DuelId { get; private set; }
        // P3：只依赖能力切片，不再经门面穿层（装配仍由组合根注入 IArenaShell，字段全部窄接口）。
        IMatchStage stage; ICompetitionLink link; ArenaUI UI; ArenaMedia media; IWorkbenchLauncher workbench; IRosterService roster;
        IMatchControl match; INotifier notifier;
        Func<bool> isSpectating; Action toggleSpectator, showHome, demo;
        Queue<CompetitionEvent> queue = new Queue<CompetitionEvent>();
        HashSet<string> resolved = new HashSet<string>();
        Coroutine player;
        /** 收到的事件已全部演完 */
        public bool Idle => player == null && queue.Count == 0;
        long cursor;
        string competitionId;
        readonly HashSet<string> selected = new HashSet<string>();
        string arena = "tongjia-pinyin", judge = "";
        // 开赛档位：默认免费演示档（不破坏零门槛演示入口）；正式档（BYOK）由用户在本厅显式切换。
        string tier = "free";
        int limit = 10;
        bool randomDraw;
        bool apiModels;
        readonly Dictionary<string,ModelInfo> lobbyModels = new Dictionary<string,ModelInfo>();
        AgentCatalog agentCatalog;
        public void Initialize(IArenaShell owner)
        {
            stage = owner; roster = owner; match = owner; notifier = owner; // 门面自身即这些能力的实现
            link = owner.Link; UI = owner.UI; media = owner.Media; workbench = owner.Hub;
            isSpectating = () => owner.IsSpectating; toggleSpectator = owner.ToggleSpectator; showHome = owner.ShowHome; demo = owner.Demo;
            link.OnCompetition = Receive;
        }
        public void Receive(CompetitionPacket packet, bool reset)
        {
            if (packet?.snapshot == null) return;
            if (competitionId != packet.id) { Clear(); competitionId = packet.id; Replaying = false; }
            Snapshot = packet.snapshot;
            UpdateReferee();
            if (reset)
            {
                Clear(); competitionId = packet.id; cursor = packet.seq;
                var d = Snapshot.duels.FirstOrDefault(x=>x.id==Snapshot.activeDuelId) ?? Snapshot.duels.LastOrDefault(x=>x.players?.Length==2 && x.rounds?.Length>0) ?? Snapshot.duels[0];
                LoadDuel(d); ApplyHealth(d.hp); SetRound(d.rounds?.LastOrDefault());
                Phase = Snapshot.status=="completed" ? "冠军 · "+Name(Snapshot.winner)+(Snapshot.duels.Length==1?Decided(Snapshot.duels[0]):"") : Snapshot.status=="waiting" ? "待续 · "+Snapshot.reason : Snapshot.status=="stopped" ? "赛事已停止" : "已同步当前状态";
                PresentedPhase=Snapshot.status=="completed"?"completed": "waiting";
                if(d.status=="completed" && Snapshot.status!="stopped") Celebrate(d.winner, Snapshot.status=="completed", true);
                media.Crowd(Snapshot.status=="running" || Snapshot.status=="paused");
                match.SetFinished(Snapshot.status=="completed" || Snapshot.status=="stopped");
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
            stage.CancelEntrance();
            media.Crowd(false);
            if(player!=null) StopCoroutine(player); player=null; queue.Clear(); resolved.Clear(); cursor=0; Round=null; Presenting=false; PresentedPhase="ready"; stage.EndCombat(); PresentationReset?.Invoke();
        }
        public string Name(string id) => Snapshot?.entrants?.FirstOrDefault(x=>x.id==id)?.name ?? id ?? "待定";
        void UpdateReferee()
        {
            string id=Snapshot?.config?.judge;
            stage.SetJudge(string.IsNullOrEmpty(id)?null:Snapshot.config.native?.FirstOrDefault(m=>m.id==id) ?? new ModelInfo{id=id,name=id});
        }
        void LoadDuel(CompetitionDuel d)
        {
            if(d?.players?.Length!=2) return;
            DuelId=d.id; PresentationReset?.Invoke(); roster.SetRoster(d.players.Select(id=>new ModelInfo { id=id, name=Name(id) }).ToArray());
            match.SetFinished(false); Round=null; PresentedPhase="ready"; ApplyHealth(d.hp); if(!stage.FlightActive && !stage.CameraDirected) stage.ResetCamera();
            Phase="对局 "+d.id+" · "+Name(d.players[0])+" VS "+Name(d.players[1]);
        }
        void ApplyHealth(double[] hp)
        {
            if(hp==null || hp.Length!=2 || stage.Fighters.Count!=2) return;
            for(int i=0;i<2;i++) stage.Fighters[i].State.Health=(float)hp[i];
        }
        void SetRound(CompetitionRound r)
        {
            if(r==null) return; Round=r;
            UI.SetQuestion(r.question?.task?.input ?? "");
            foreach(var f in stage.Fighters)
            {
                var live=r.live?.FirstOrDefault(a=>a.modelId==f.State.Id); var rec=r.records?.FirstOrDefault(a=>a!=null && a.model==f.State.Id);
                f.State.TaskId=r.question?.task?.id; f.State.Answer=live?.answer ?? rec?.answer ?? ""; f.State.Reasoning=live?.reasoning ?? rec?.reasoning ?? "";
                f.State.Status=live?.status ?? "waiting"; f.State.Note=live?.error ?? rec?.error ?? (rec!=null && string.IsNullOrEmpty(rec.error)?"得分 "+(rec.score*100).ToString("0.#")+"%":"");
            }
            RoundUpdated?.Invoke(r);
        }
        IEnumerator Play()
        {
            // Do not finish synchronously before StartCoroutine assigns its handle.
            yield return null;
            while(queue.Count>0)
            {
                var e=queue.Dequeue(); match.CountAcceptedFrame();
                switch(e.type)
                {
                    case "competition-start": match.SetFinished(false); Phase="抽签锁定 · 赛事开始"; media.Crowd(true); break;
                    case "duel-start":
                        media.Crowd(true); LoadDuel(e.duel);
                        if(stage.HasEntrance){Presenting=true;Phase="选手入场 · 双平台升降";yield return stage.PresentEntrance();Presenting=false;}
                        break;
                    case "round-start":
                        PresentedPhase="solving"; SetRound(e.round); ApplyHealth(e.round.before); Phase="作答 · 双方正在思考"; break;
                    case "model":
                        PresentedPhase=e.round.phase=="judging"?"judging":"solving"; SetRound(e.round); Phase=e.round.phase=="judging"?"判分 · 等待双方有效评分":"作答 · 双方正在思考"; break;
                    case "round-resolved":
                        string key=e.competitionId+"/"+e.duelId+"/"+e.round.id;
                        if(!resolved.Add(key)) continue;
                        PresentedPhase="clash"; SetRound(e.round); ApplyHealth(e.round.before); Phase=e.round.attacks.Any(a=>a.damage>0)?"交锋 · 原地掌击":"双方答对"; Presenting=true;
                        // 答题对/错提示音：逐条宣读判定（得分过半＝对；裁判弃权/未评分的答卷不出声），再进交锋。
                        if(e.round.records!=null) foreach(var rec in e.round.records)
                            if(rec!=null && string.IsNullOrEmpty(rec.error)) { media.Answer(rec.score>=.5); if(stage.Motion>0) yield return new WaitForSecondsRealtime(.22f); }
                        yield return stage.PresentRound(e.round,()=>{ApplyHealth(e.round.after); AppliedHits++; RoundHit?.Invoke(e.round);},a=>
                        {
                            int target=stage.Fighters.FindIndex(f=>f.State.Id==a.target);
                            if(target>=0 && e.round.after?.Length==2)stage.Fighters[target].State.Health=(float)e.round.after[target];
                        });
                        PresentedPhase="result"; Phase="本题结果 · "+string.Join("  /  ",e.round.attacks.Select(a=>Name(a.target)+" −"+a.damage.ToString("0.#")));
                        PresentedRounds++; Presenting=false;
                        yield return new WaitForSecondsRealtime(stage.Motion>0?.5f:0); break;
                    case "duel-end": PresentedPhase="completed"; Celebrate(e.winner); Phase="本场胜者 · "+Name(e.winner)+Decided(e.duel); break;
                    case "pending": PresentedPhase="waiting"; Phase=e.message ?? "平局 / 异常待续"; break;
                    case "control": PresentedPhase="waiting"; Phase=e.message; break;
                    case "intermission":
                        PresentedPhase="intermission";
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
                        PresentedPhase="completed"; match.SetFinished(true); media.Crowd(false);
                        Phase=string.IsNullOrEmpty(e.winner)?e.message:"赛事冠军 · "+Name(e.winner)+(Snapshot.duels.Length==1?Decided(Snapshot.duels[0]):"");
                        if(!string.IsNullOrEmpty(e.winner)) Celebrate(e.winner, true); break;
                }
                UI.Round.text=Phase;
                PresentedEvent?.Invoke(e);
            }
            player=null;
        }
        /** 两人得分不同的题才真正区分了强弱；只告诉观众"几题分出高下"，不把一场胜负说成谁更强 */
        public static string Decided(CompetitionDuel d)
        {
            var settled=d?.rounds?.Where(r=>r.settled && r.records!=null && r.records.Length==2).ToArray();
            if(settled==null || settled.Length==0) return "";
            int differ=settled.Count(r=>Math.Abs(r.records[0].score-r.records[1].score)>1e-9);
            return " · "+settled.Length+" 题中 "+differ+" 题分出高下";
        }
        void Celebrate(string winner, bool championship = false, bool restored = false)
        {
            if(string.IsNullOrEmpty(winner)) return;
            foreach(var f in stage.Fighters) { f.Celebrating=f.State.Id==winner; f.Defeated=!f.Celebrating; if(f.Celebrating && !restored)stage.CelebrateWinner(f); }
            match.Selected=winner; if(!restored) media.Celebrate();
            ResultPresented?.Invoke(new ArenaDuelResult(competitionId, DuelId, winner, championship, restored));
        }
        public void Replay(string id)
        {
            link.Disconnect();
            StartCoroutine(link.Request<CompetitionPacket>("/api/game/competitions/"+id,null,p=>
            {
                Clear(); competitionId=id; Snapshot=p.snapshot; Replaying=true; UI.CloseModal();
                UpdateReferee();
                foreach(var e in p.events ?? Array.Empty<CompetitionEvent>()) queue.Enqueue(e);
                player=StartCoroutine(Play());
            },notifier.Notify));
        }
        void ModalMode() { if(isSpectating()) toggleSpectator(); }
        public void ShowBracket()
        {
            ModalMode(); var ui=UI; var panel=ui.OpenModal("对阵表 / BRACKET");
            if(Snapshot==null) { ui.Label(panel,"开始赛事后显示固定对阵树。",28,95,980,60); return; }
            ui.Label(panel,Snapshot.entrants.Length+" 人单败 · "+Snapshot.duels.Length+" 场 · "+Snapshot.status,28,81,950,35,19,ui.Accent);
            var body=ui.Scroll(panel,28,128,980,450); body.sizeDelta=new Vector2(970,Mathf.Max(450,Snapshot.duels.Length*92));
            for(int i=0;i<Snapshot.duels.Length;i++)
            {
                var d=Snapshot.duels[i]; string pair=d.players?.Length==2 ? Name(d.players[0])+"  VS  "+Name(d.players[1]) : string.Join(" / ",d.sources.Select(x=>x+" 胜者"));
                ui.Label(body,d.id+" · 第 "+(d.stage+1)+" 轮  "+pair+"\n"+Status(d),0,i*92,735,82,18);
                if(d.status=="waiting" && !Replaying) ui.Button(body,d.reason=="failure" || d.reason=="interrupted"?"重试 / 继续":"补题续赛",750,i*92+15,200,()=>ContinueDuel(d));
            }
            ui.Button(panel,"模型 / 费用",28,603,200,ShowRunConfig);
            ui.Button(panel,"暂停",244,603,180,()=>link.Control("pause"));
            ui.Button(panel,"继续赛事",440,603,220,()=> { if(Snapshot.status=="waiting") link.Continue(Snapshot.id); else link.Control("resume"); ui.CloseModal(); });
            ui.Button(panel,"回放 / 待续记录",680,603,328,ShowHistory);
        }
        string Status(CompetitionDuel d) => d.status=="completed"?"胜者："+Name(d.winner):d.status=="blocked"?"等待上游胜者":d.status=="waiting"?(d.reason=="failure"?"异常待续 · 未扣血":d.reason=="interrupted"?"中断待续":"平局待续 · 需要新题"):d.status=="running"?"正在对战":"待开场";
        void ShowRunConfig()
        {
            var ui=UI;var p=ui.OpenModal("本场运行配置 / 随存档保存");var body=ui.Scroll(p,28,92,980,478);float y=0;
            ui.Label(body,Snapshot.config.tier=="official"?"档位：正式档（BYOK）· 允许已选付费模型":"档位：免费演示档 · 仅走免费渠道",0,y,950,46,19);y+=56;
            foreach(var id in Snapshot.config.models.Concat(string.IsNullOrEmpty(Snapshot.config.judge)?Array.Empty<string>():new[]{Snapshot.config.judge}))
            {
                var m=Snapshot.config.native?.FirstOrDefault(x=>x.id==id);
                string detail=m==null?"API / 模拟通道 · "+id:m.name+"\n"+m.billingLabel+" · 无工具答题\n"+m.version+" · 推理强度 "+(m.effort??"官方默认");
                ui.Label(body,detail,0,y,950,m==null?62:106,18);y+=m==null?70:116;
            }
            body.sizeDelta=new Vector2(970,Mathf.Max(478,y));ui.Button(p,"返回对阵",28,605,982,ShowBracket);
        }
        void ContinueDuel(CompetitionDuel d)
        {
            if(d.reason=="failure" || d.reason=="interrupted") { link.Continue(Snapshot.id,d.id); UI.CloseModal(); return; }
            var ui=UI;var p=ui.OpenModal("为 "+d.id+" 选择补充题库"); var content=ui.Scroll(p,28,95,980,530);
            StartCoroutine(link.Request<Catalog>("/api/game/catalog",null,c=>
            {
                if(!p) return; var banks=c.arenas.Where(a=>a.mode=="qa" && (!a.needsJudge || !string.IsNullOrEmpty(Snapshot.config.judge))).ToArray(); content.sizeDelta=new Vector2(970,Mathf.Max(530,banks.Length*50));
                for(int i=0;i<banks.Length;i++) { var bank=banks[i]; ui.Button(content,bank.title+" · "+bank.count+" 题",0,i*50,950,()=> { link.Continue(Snapshot.id,d.id,bank.id); ui.CloseModal(); }); }
            },notifier.Notify));
        }
        public void ShowHistory()
        {
            ModalMode(); var ui=UI; var p=ui.OpenModal("游戏赛事 / 存档、回放与待续");var content=ui.Scroll(p,28,94,982,480);
            ui.Button(p,"全部历史与战报",28,605,370,()=>workbench.History());
            StartCoroutine(link.Request<Catalog>("/api/game/catalog",null,c=>
            {
                if(!p) return;var entries=c.competitions ?? Array.Empty<CompetitionSummary>(); content.sizeDelta=new Vector2(972,Mathf.Max(480,entries.Length*84));
                if(entries.Length==0) ui.Label(content,"还没有游戏赛事存档。",0,0,900,50);
                for(int i=0;i<entries.Length;i++) {var item=entries[i];ui.Label(content,item.title+" · "+item.status+"\n"+item.createdAt,0,i*84,575,72,17);ui.Button(content,"回放",610,i*84+10,145,()=>Replay(item.id));ui.Button(content,"观看 / 续赛",770,i*84+10,185,()=>{ui.CloseModal();link.WatchCompetition(item.id);});}
            },notifier.Notify));
        }
        public void ShowLobby()
        {
            ModalMode(); var ui=UI;var p=ui.OpenModal("1V1 赛事大厅");
            ui.SetBack(showHome);
            ui.Label(p,"选择题库与选手，创建一场真实比赛。",28,82,640,38,20);
            ui.Button(p,"模型与 Agent",696,80,160,workbench.Agents); ui.Button(p,"赛事存档",870,80,140,()=>workbench.History());
            ui.Label(p,"01  题库 · 推荐规则评分",28,136,455,32,20,ui.Accent);
            ui.Button(p,"本机 Agent",525,132,155,()=>{apiModels=false;ShowLobby();},!apiModels);
            ui.Button(p,"API / 自定义",690,132,165,()=>{apiModels=true;ShowLobby();},apiModels);
            ui.Button(p,"重新检测",865,132,145,()=>{agentCatalog=null;ShowLobby();});
            var banks=ui.Scroll(p,28,184,455,271);var models=ui.Scroll(p,525,184,485,271);
            var info=ui.Label(p,"每场 100 HP · 失分 × 20 · 先展示抽签，再锁定开赛",28,468,982,47,17);
            ui.Label(p,"常规题数",28,528,120,32,17);var count=ui.Input(p,limit.ToString(),145,521,80);
            count.onEndEdit.AddListener(v=>{if(int.TryParse(v,out var n))limit=n;});
            ui.Label(p,"评分",254,528,75,32,17);
            ui.Button(p,JudgeName(),337,521,400,ShowJudges);
            // 档位：免费演示档 / 正式档（BYOK）。显式选择 → 随开赛请求传到后端（Launch.tier）。
            var tierButton=ui.Button(p,TierName(),747,521,263,()=>{});
            tierButton.onClick.AddListener(()=>{tier=tier=="official"?"free":"official";tierButton.GetComponentInChildren<TMP_Text>().text=TierName();});
            Catalog catalog=null;
            ui.Button(p,"抽签 / 检查配置 →",28,606,290,()=>
            {
                if(catalog==null || catalog.gameVersion<2) {info.text="后端需要更新到对决版本，请重新运行启动入口。";return;}
                if(!new[]{2,4,8}.Contains(selected.Count)||!int.TryParse(count.text,out limit)||limit<1||limit>100) {info.text="选手只能为 2、4、8 人；题数 1–100。";return;}
                var bank=catalog.arenas.FirstOrDefault(a=>a.id==arena);
                if(bank==null || (bank.needsJudge && string.IsNullOrEmpty(judge))) {info.text="请选择题库；开放题需要选择裁判。";return;}
                if(selected.Any(id=>!lobbyModels.ContainsKey(id)||!lobbyModels[id].ready)) {info.text="所选选手尚未就绪，请重新检测或更换。";return;}
                RequestDraw(new Launch {arena=arena,models=selected.ToArray(),limit=Math.Min(limit,bank.count),judge=bank.needsJudge?judge:"",requestId=Guid.NewGuid().ToString(),tier=tier},bank,limit);
            },true);
            ui.Button(p,"离线 1V1 体验",338,606,250,demo);ui.Button(p,"管理题库",610,606,190,workbench.Banks);ui.Button(p,"高级工作台 ↗",814,606,196,workbench.Advanced);
            StartCoroutine(link.Request<Catalog>("/api/game/catalog",null,c=>
            {
                if(!p)return;catalog=c;var rows=(c.arenas??Array.Empty<ArenaInfo>()).Where(a=>a.mode=="qa").OrderBy(a=>a.needsJudge).ToArray();banks.sizeDelta=new Vector2(445,Mathf.Max(271,rows.Length*48));
                for(int i=0;i<rows.Length;i++){var a=rows[i];ui.Button(banks,(a.needsJudge?"[模型] ":"[规则] ")+a.title+" · "+a.count+" 题",0,i*48,435,()=>{arena=a.id;info.text=a.title+" · "+(a.needsJudge?"需要裁判调用":"程序评分，无裁判调用")+" · 已选 "+selected.Count+" 位选手";});}
            },notifier.Notify));
            void DrawModels(ModelInfo[] rows,AgentStatus[] agents=null)
            {
                if(!p)return;
                foreach(Transform child in models)Destroy(child.gameObject);
                float y=0;
                foreach(var a in agents??Array.Empty<AgentStatus>())
                {
                    string status=a.status=="ready"?"已连接":a.status=="missing"?"未安装":a.status=="login-required"?"未登录":a.status=="limited"?"额度已用尽":"检测失败";
                    ui.Label(models,a.name+" · "+status+(a.resetsAt>0?" · 剩余 "+a.remaining.ToString("0")+"%":"")+"\n"+(a.status=="ready"?a.billingLabel:a.message),0,y,460,62,16);y+=68;
                }
                foreach(var m in rows)
                {
                    lobbyModels[m.id]=m;UnityEngine.UI.Button b=null;
                    string caption=(selected.Contains(m.id)?"● ":"○ ")+m.name;
                    b=ui.Button(models,caption,0,y,465,()=>{if(!m.ready){info.text=m.message;return;}if(!selected.Remove(m.id)&&selected.Count<8)selected.Add(m.id);b.GetComponentInChildren<TMP_Text>().text=(selected.Contains(m.id)?"● ":"○ ")+m.name;info.text="已选 "+selected.Count+" 位 · "+m.billingLabel;});
                    ui.Label(models,m.ready?m.billingLabel:m.message,8,y+43,450,29,15);y+=78;
                }
                if(rows.Length==0){ui.Label(models,"暂无可用选手，请查看连接帮助或配置 API。",0,y,455,65,18);y+=70;}
                models.sizeDelta=new Vector2(475,Mathf.Max(271,y));
            }
            if(!apiModels)
            {
                ui.Label(models,"正在检测本机 Agent…\n只读取状态与模型列表，不提交答题。",0,0,450,75,18);
                StartCoroutine(link.Request<AgentCatalog>("/api/game/agents"+(agentCatalog==null?"?refresh=1":""),null,c=>{agentCatalog=c;DrawModels(c.models??Array.Empty<ModelInfo>(),c.agents);},e=>{if(p)info.text=e;}));
            }
            StartCoroutine(link.Request<ModelCatalog>("/api/models",null,c=>
            {
                if(!p)return;var rows=(c.models??Array.Empty<ModelInfo>()).Where(m=>m.ready&&!m.hidden&&!m.id.StartsWith("mock:")).ToArray();
                foreach(var m in rows){m.billingLabel=m.free?"免费 API · 受渠道限额约束":"API 计费 · 按接口账户设置";lobbyModels[m.id]=m;}
                if(apiModels)DrawModels(rows);
            },notifier.Notify));
        }
        string JudgeName()=>string.IsNullOrEmpty(judge)?"规则评分 · 不调用裁判（点击选择）":(lobbyModels.TryGetValue(judge,out var m)?m.name:judge);
        string TierName()=>tier=="official"?"档位：正式档（BYOK）":"档位：免费演示档";
        void ShowJudges()
        {
            var ui=UI;var p=ui.OpenModal("选择裁判 / 每份答卷独立评阅");var body=ui.Scroll(p,28,92,980,486);
            ui.Button(body,"规则评分 · 有标准答案的题库推荐使用",0,0,950,()=>{judge="";ShowLobby();});
            var rows=lobbyModels.Values.Where(m=>m.ready).OrderBy(m=>string.IsNullOrEmpty(m.agent)).ToArray();
            for(int i=0;i<rows.Length;i++){var m=rows[i];ui.Button(body,m.name+" · "+m.billingLabel,0,58+i*52,950,()=>{judge=m.id;ShowLobby();});}
            body.sizeDelta=new Vector2(970,Mathf.Max(486,58+rows.Length*52));
            ui.Button(p,"返回大厅",28,605,980,ShowLobby);
        }
        void ShowAgentHelp()
        {
            var ui=UI;var p=ui.OpenModal("连接本机 Agent");
            ui.Label(p,"1. 安装官方 Codex 或 Claude Code。\n2. 在官方程序中登录自己的账户，再回到大厅重新检测。\n3. 选择具体模型；每场使用独立答题会话，关闭工具。\n\n订阅并非无限额度，额外用量按官方账户设置。\n限额或失败会保留答卷、进入待续；游戏不自动改用付费 API。\n游戏不接收账号密码、订阅令牌或代充。",28,98,974,330,22);
            ui.Button(p,"Codex 官方安装 / 登录 ↗",28,463,475,()=>Application.OpenURL("https://developers.openai.com/codex/cli"));
            ui.Button(p,"Claude Code 官方安装 / 登录 ↗",524,463,486,()=>Application.OpenURL("https://code.claude.com/docs/en/quickstart"));
            ui.Button(p,"配置 API / 自定义接口",28,530,982,()=>workbench.Models(ShowAgentHelp));
            ui.Button(p,"返回大厅",28,605,982,ShowLobby);
        }
        void RequestDraw(Launch config,ArenaInfo bank,int requested)
        {
            StartCoroutine(link.Request<DrawPreview>("/api/game/draw",new DrawRequest{models=config.models,mode=randomDraw?"random":"seeded"},d=>{config.draw=d.draw;Preview(config,bank,requested,d);},notifier.Notify));
        }
        public void Preview(Launch config,ArenaInfo bank,int requested,DrawPreview draw)
        {
            var ui=UI;var p=ui.OpenModal("首轮抽签 / 开赛后锁定");
            ui.Label(p,(config.models.Length==2?"直接对决":config.models.Length+" 人淘汰赛，共 "+(config.models.Length-1)+" 场")+" · 每场 "+config.limit+" 题"+(requested>config.limit?"\n题库不足，已由 "+requested+" 题调整为 "+config.limit+" 题":"")+"\n加赛最多 10 题，优先区分度高的题；同一轮各场用同一套题。\n"+(draw.mode=="random"?"随机抽签。":"按短题竞速评分排种子，1、2 号种子只可能在决赛相遇；预期胜率仅供参考，胜负由本场答题决定。"),28,88,982,105,18);
            string Description(string id)=>lobbyModels.TryGetValue(id,out var m)?m.name+" ["+(string.IsNullOrEmpty(m.agent)?"API":m.billing=="subscription"?"订阅":"API 计费")+"]":id;
            for(int i=0;i<config.draw.Length/2;i++)
            {
                var pair=draw.pairs!=null && i<draw.pairs.Length?draw.pairs[i]:null;
                string odds=pair==null?"":"    预期 "+(pair.probability*100).ToString("0")+"% : "+((1-pair.probability)*100).ToString("0")+"%";
                ui.Label(p,"M"+(i+1)+"    "+Description(config.draw[i*2])+"   VS   "+Description(config.draw[i*2+1])+odds,28,204+i*72,982,68,19);
            }
            ui.Label(p,string.IsNullOrEmpty(config.judge)?"规则评分 · 无裁判调用":"裁判："+Description(config.judge),28,504,982,42,18,ui.Accent);
            ui.Label(p,"本机 Agent 使用独立无工具会话；限额后待续，不自动切换付费通道。",28,548,982,40,17);
            ui.Button(p,"锁定对阵并开赛",28,602,475,()=>{ui.CloseModal();link.Launch(config);},true);
            ui.Button(p,"返回配置",524,602,230,ShowLobby);
            ui.Button(p,randomDraw?"改为种子排位":"改为随机抽签",770,602,240,()=>{randomDraw=!randomDraw;RequestDraw(config,bank,requested);});
        }
    }
}
