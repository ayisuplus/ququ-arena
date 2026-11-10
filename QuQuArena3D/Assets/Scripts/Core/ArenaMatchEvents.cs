using System;
using System.Collections.Generic;

namespace QuQu
{
    /** 事件标记接口：所有比赛流事件实现它，保证总线类型安全（P1 解耦方案）。 */
    public interface IMatchEvent { }

    // ---- 比赛流事件：由 ArenaFrameRouter 从协议帧翻译而来，订阅方禁止再依赖 ArenaGame ----

    public struct MatchStarted : IMatchEvent { public ModelInfo[] Roster; public bool Replay; public string Title; public int Total; public Scoring Scoring; }
    public struct RoundPresented : IMatchEvent { public string Prompt; public int Index; public int Total; public string TaskId; public string Title; public bool IsStage; }
    public struct AnswerReceived : IMatchEvent { public Frame Frame; }
    public struct WithdrawalReceived : IMatchEvent { public string ModelId; public string Message; }
    public struct ControlChanged : IMatchEvent { public string State; }
    public struct MilestoneReached : IMatchEvent { public string Text; }
    public struct CommentaryDone : IMatchEvent { public string Text; }
    public struct MatchSettled : IMatchEvent { public Frame Frame; }
    public struct MatchErrored : IMatchEvent { public Frame Frame; }

    public interface IMatchEventBus
    {
        void Publish<T>(T evt) where T : struct, IMatchEvent;
        IDisposable Subscribe<T>(Action<T> handler) where T : struct, IMatchEvent;
    }

    /** 轻量类型化事件总线：Publish/Subscribe，订阅返回 IDisposable 以便统一退订。
     *  取代 SO 事件通道——本项目无场景资产与 Inspector 装配点，注入式 C# 总线达成同样的解耦目标。 */
    public sealed class MatchEventBus : IMatchEventBus
    {
        interface IChannel { }

        sealed class Channel<T> : IChannel where T : struct, IMatchEvent
        {
            public readonly List<Action<T>> Handlers = new List<Action<T>>();
        }

        readonly Dictionary<Type, IChannel> channels = new Dictionary<Type, IChannel>();

        Channel<T> ChannelOf<T>() where T : struct, IMatchEvent
        {
            if (channels.TryGetValue(typeof(T), out var found)) return (Channel<T>)found;
            var created = new Channel<T>(); channels[typeof(T)] = created; return created;
        }

        public void Publish<T>(T evt) where T : struct, IMatchEvent
        {
            if (!channels.TryGetValue(typeof(T), out var found)) return;
            var handlers = ((Channel<T>)found).Handlers;
            for (int i = handlers.Count - 1; i >= 0; i--) handlers[i](evt); // 倒序：处理器可安全退订
        }

        public IDisposable Subscribe<T>(Action<T> handler) where T : struct, IMatchEvent
        {
            var channel = ChannelOf<T>();
            channel.Handlers.Add(handler);
            return new Subscription<T>(channel, handler);
        }

        sealed class Subscription<T> : IDisposable where T : struct, IMatchEvent
        {
            readonly Channel<T> channel;
            readonly Action<T> handler;
            bool disposed;

            public Subscription(Channel<T> channel, Action<T> handler) { this.channel = channel; this.handler = handler; }

            public void Dispose()
            {
                if (disposed) return;
                disposed = true;
                channel.Handlers.Remove(handler);
            }
        }
    }

    /** 订阅收集器：销毁时一次性退订全部订阅，杜绝事件泄漏。 */
    public sealed class SubscriptionBag : IDisposable
    {
        readonly List<IDisposable> subscriptions = new List<IDisposable>();

        public IDisposable Track(IDisposable subscription) { subscriptions.Add(subscription); return subscription; }

        public void Dispose()
        {
            for (int i = subscriptions.Count - 1; i >= 0; i--) subscriptions[i].Dispose();
            subscriptions.Clear();
        }
    }
}
