using System;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    /** 比赛流演出者（P1）：订阅总线事件并驱动 UI/舞台/媒体。
     *  原 ArenaGame.Accept 各分支逐行迁入，行为保持一致；后续新增比赛表现只改这里。 */
    public sealed class ArenaMatchPresenter
    {
        // P3-D：唯一依赖是 IMatchContext（= IMatchControl + INotifier + IRosterService + IMatchStage + IMatchSurface），
        // 演出者不再认识 ArenaGame 具体类型。
        readonly IMatchContext ctx;
        readonly SubscriptionBag subs = new SubscriptionBag();

        public ArenaMatchPresenter(IMatchContext ctx, IMatchEventBus bus)
        {
            this.ctx = ctx;
            subs.Track(bus.Subscribe<MatchStarted>(OnMatchStarted));
            subs.Track(bus.Subscribe<RoundPresented>(OnRoundPresented));
            subs.Track(bus.Subscribe<AnswerReceived>(OnAnswerReceived));
            subs.Track(bus.Subscribe<WithdrawalReceived>(OnWithdrawal));
            subs.Track(bus.Subscribe<ControlChanged>(OnControl));
            subs.Track(bus.Subscribe<MilestoneReached>(OnMilestone));
            subs.Track(bus.Subscribe<CommentaryDone>(OnCommentary));
            subs.Track(bus.Subscribe<MatchSettled>(OnSettled));
            subs.Track(bus.Subscribe<MatchErrored>(OnErrored));
        }

        void OnMatchStarted(MatchStarted e)
        {
            ctx.SetFinished(false); ctx.ClearStrikes(); ctx.ReportPath = null;
            ctx.SetRoster(e.Roster ?? Array.Empty<ModelInfo>());
            ctx.PlannedQuestions = e.Roster?.Length > 0 ? Mathf.CeilToInt((float)e.Total / e.Roster.Length) : 0;
            ctx.UI.Round.text = (e.Replay ? "REPLAY / " : "LIVE / ") + e.Title;
            ctx.UI.Rules.text = e.Roster != null && e.Roster.Any(m => m.id.StartsWith(ArenaModelIds.MockPrefix)) ? "离线模拟场 · 用于体验，不能作为真实模型评测" : e.Scoring?.summary ?? "实时答题 · 真实评分";
            ctx.Notify(e.Replay ? "正在回放历史比赛" : "比赛开始");
            ctx.RefreshUI();
        }

        void OnRoundPresented(RoundPresented e)
        {
            ctx.UI.SetQuestion(e.Prompt);
            ctx.UI.Round.text = e.IsStage
                ? e.TaskId + " · " + e.Title
                : "QUESTION " + (e.Index + 1) + " / " + (ctx.PlannedQuestions > 0 ? ctx.PlannedQuestions : e.Total) + " · " + e.TaskId;
            ctx.RefreshUI();
        }

        void OnAnswerReceived(AnswerReceived e)
        {
            var f = e.Frame;
            var fighter = ctx.Fighters.FirstOrDefault(x => x.State.Id == f.modelId);
            if (fighter != null) fighter.State.Accept(f, ctx.PlannedQuestions);
            ctx.RefreshUI();
        }

        void OnWithdrawal(WithdrawalReceived e)
        {
            var withdrawn = ctx.Fighters.FirstOrDefault(x => x.State.Id == e.ModelId);
            if (withdrawn != null) { withdrawn.State.Status = "withdrawn"; withdrawn.State.Note = e.Message; }
            ctx.RefreshUI();
        }

        void OnControl(ControlChanged e)
        {
            ctx.Notify(e.State == "paused" ? "已暂停，等待继续" : e.State == "pausing" ? "本题结束后暂停" : e.State == "stopped" ? "已请求停止" : "比赛继续");
            ctx.RefreshUI();
        }

        void OnMilestone(MilestoneReached e)
        {
            ctx.Notify(e.Text);
            ctx.RefreshUI();
        }

        void OnCommentary(CommentaryDone e)
        {
            ctx.Notify(e.Text);
            ctx.RefreshUI();
        }

        void OnSettled(MatchSettled e)
        {
            var f = e.Frame;
            ctx.SetFinished(true); ctx.ReportPath = f.reportFile; ctx.EndCombat();
            ctx.Notify(f.settlement?.reason ?? (f.stopped ? "比赛已中止，不判胜者" : "比赛结束，请查看完整战报"));
            if (f.settlement != null)
            {
                ctx.UI.Rules.text = "结算：" + f.settlement.outcome + " · " + (f.settlement.warnings?.FirstOrDefault() ?? "");
                if (f.settlement.leaderIds?.Length > 0)
                {
                    ctx.Selected = f.settlement.leaderIds[0];
                    var leaders = ctx.Fighters.Where(x => f.settlement.leaderIds.Contains(x.State.Id)).ToArray();
                    // 差距在统计误差内（inconclusive）只提示暂列第一，不演颁奖与败北
                    bool decided = f.settlement.outcome != "inconclusive";
                    if (decided)
                    {
                        foreach (var leader in leaders) { leader.Celebrating = true; ctx.CelebrateWinner(leader); }
                        foreach (var other in ctx.Fighters.Except(leaders)) other.Defeated = true;
                        ctx.Celebrate();
                    }
                    ctx.Notify((f.settlement.outcome == "tie" ? "并列第一：" : decided ? "本场胜者：" : "暂列第一（差距在统计误差内）：") + string.Join("、", leaders.Select(x => x.State.Name)));
                    ctx.UI.Footer.text = f.settlement.reason;
                }
            }
            ctx.RefreshUI();
        }

        void OnErrored(MatchErrored e)
        {
            ctx.SetFinished(true); ctx.EndCombat();
            ctx.Notify(e.Frame.message ?? e.Frame.error);
            ctx.RefreshUI();
        }
    }
}
