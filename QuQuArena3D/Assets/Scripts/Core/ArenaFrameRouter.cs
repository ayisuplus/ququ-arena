namespace QuQu
{
    /** 协议帧 → 类型化事件的唯一翻译点（P1）。新增帧类型只改这里与 ArenaFrameTypes。 */
    public sealed class ArenaFrameRouter
    {
        readonly IMatchEventBus bus;

        public ArenaFrameRouter(IMatchEventBus bus) { this.bus = bus; }

        public void Dispatch(Frame f)
        {
            switch (f.type)
            {
                case ArenaFrameTypes.Start:
                    bus.Publish(new MatchStarted { Roster = f.roster, Replay = f.replay, Title = f.title, Total = f.total, Scoring = f.scoring });
                    break;
                case ArenaFrameTypes.Round:
                    bus.Publish(new RoundPresented { Prompt = f.prompt, Index = f.index, Total = f.total, TaskId = f.taskId, IsStage = false });
                    break;
                case ArenaFrameTypes.Stage:
                    bus.Publish(new RoundPresented { Prompt = f.prompt, TaskId = f.taskId, Title = f.title, IsStage = true });
                    break;
                case ArenaFrameTypes.Model:
                    bus.Publish(new AnswerReceived { Frame = f });
                    break;
                case ArenaFrameTypes.Withdrawal:
                    bus.Publish(new WithdrawalReceived { ModelId = f.withdrawal?.modelId, Message = f.withdrawal?.message });
                    break;
                case ArenaFrameTypes.Control:
                    bus.Publish(new ControlChanged { State = f.state });
                    break;
                case ArenaFrameTypes.Milestone:
                    bus.Publish(new MilestoneReached { Text = f.text });
                    break;
                case ArenaFrameTypes.Commentary:
                    if (f.entry?.status == "done") bus.Publish(new CommentaryDone { Text = f.entry.text });
                    break;
                case ArenaFrameTypes.Done:
                    bus.Publish(new MatchSettled { Frame = f });
                    break;
                case ArenaFrameTypes.Error:
                    bus.Publish(new MatchErrored { Frame = f });
                    break;
            }
        }
    }
}
