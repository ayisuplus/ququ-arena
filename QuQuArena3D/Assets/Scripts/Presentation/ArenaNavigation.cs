using System;
using System.Collections.Generic;
using UnityEngine;

namespace QuQu
{
    /** 导航路由（P1 导航收编）：把散在 header、首页宫格、Hub 分发、轨道站、热键五套跳转收口到一张路由表。
     *  调用方只认路由名，不再各持一份跳转闭包；路由动作在组合完成后统一绑定（ArenaRoutes.Bind）。 */
    public enum ArenaRoute
    {
        Home, Lobby, Bracket, Settings,
        Agents, Banks, History, Rankings, TaskCenter, Workbench, Models,
        Lab, Gallery, Commentary, Demo, Exit
    }

    /** P1 导航栈：界面层级与回退语义的唯一管理者，取代"单值回调 + Confirm 手工保存/恢复 previous"。
     *  · 层：基层（赛场）→ 界面层（OpenModal/OpenSurface 压入）→ 确认层（Confirm 压入，可嵌在任意层之上）。
     *  · 回退：Back = 守卫（UI.SetGuard）→ 层内回退动作（UI.SetBack）→ 关闭全部（CloseModal）。
     *  P3：兼容面孔 Modal/ModalClosed/BackAction/BeforeLeave 已退役，回调一律经
     *  UI.SetBack/SetGuard/SetClosed/ClearGuard/ClearClosed 落到本层；
     *  语义与旧实现逐条对齐（含 CloseModal 即使没有模态也会触发并清空回调的旧行为）。 */
    public sealed class ArenaNavigation
    {
        public sealed class Entry
        {
            public string Id;
            public Action Back;          // 层内回退动作（UI.SetBack）
            public Action<Action> Guard; // 离层守卫（UI.SetGuard）
            public Action Closed;        // 关闭回调（UI.SetClosed）
            public bool Confirm;         // 确认层标记（与 UI.ConfirmationOpen 的判定互补）
        }

        readonly List<Entry> stack = new List<Entry> { new Entry { Id = "arena" } };
        readonly Dictionary<ArenaRoute, Action> routes = new Dictionary<ArenaRoute, Action>();

        public Entry Top => stack[stack.Count - 1];
        public int Depth => stack.Count;
        public string Current => Top.Id;
        public bool ConfirmOpen => Top.Confirm;

        /** 压入一层（OpenModal/Confirm 调用）。返回新层，回调与回退动作写进这一层。 */
        public Entry Push(string id, bool confirm = false)
        {
            var entry = new Entry { Id = id, Confirm = confirm };
            stack.Add(entry);
            return entry;
        }

        /** 弹出当前层（确认框取消）：下层的回退与守卫原样保留——旧实现 cancel 里手工
         *  save/restore previous/previousGuard 的等价物，且天然支持嵌套。 */
        public void Pop()
        {
            if (stack.Count > 1) stack.RemoveAt(stack.Count - 1);
        }

        /** 关闭全部界面（兼容 CloseModal 语义）：自顶向下取第一个非空 Closed 触发
         *  （等价旧的"最后写入者获胜"），所有层回调/回退/守卫一并清空，栈回到基层。
         *  返回待触发的 closed，由调用方在销毁视觉之后调用（保持旧时序）。 */
        public Action Reset()
        {
            Action closed = null;
            for (int i = stack.Count - 1; i >= 0 && closed == null; i--) closed = stack[i].Closed;
            for (int i = 0; i < stack.Count; i++) { stack[i].Closed = null; stack[i].Back = null; stack[i].Guard = null; }
            if (stack.Count > 1) stack.RemoveRange(1, stack.Count - 1);
            return closed;
        }

        /** 路由绑定（组合完成后一次性调用，重复绑定以最后一次为准）。 */
        public void Bind(ArenaRoute route, Action action) => routes[route] = action;

        /** 路由跳转：未绑定的路由不动作（绑定发生在任何输入之前，正常流程不会命中）。 */
        public bool Go(ArenaRoute route)
        {
            if (!routes.TryGetValue(route, out var action) || action == null) return false;
            action();
            return true;
        }
    }

    /** 路由表装配（P1）：从门面契约一次性绑好全部路由。
     *  调用点在组合完成之后（ArenaGame.Start），此时 UI 与各子系统均已就位。 */
    public static class ArenaRoutes
    {
        public static void Bind(ArenaNavigation nav, IArenaShell shell)
        {
            nav.Bind(ArenaRoute.Home, shell.ShowHome);
            nav.Bind(ArenaRoute.Lobby, shell.ShowLobby);
            nav.Bind(ArenaRoute.Bracket, shell.ShowBracket);
            nav.Bind(ArenaRoute.Settings, () => shell.ShowSettings(0));
            nav.Bind(ArenaRoute.Agents, shell.Agents);
            nav.Bind(ArenaRoute.Banks, shell.Banks);
            nav.Bind(ArenaRoute.History, () => shell.History());
            nav.Bind(ArenaRoute.Rankings, shell.Hub.Rankings);
            nav.Bind(ArenaRoute.TaskCenter, () => shell.Hub.TaskCenter());
            nav.Bind(ArenaRoute.Workbench, () => shell.Hub.Workbench());
            nav.Bind(ArenaRoute.Models, () => shell.Models());
            nav.Bind(ArenaRoute.Lab, shell.Advanced);
            nav.Bind(ArenaRoute.Gallery, () => shell.Stations.Visit(ArenaOrbitalNetwork.Place.Gallery));
            nav.Bind(ArenaRoute.Commentary, () => shell.Stations.Visit(ArenaOrbitalNetwork.Place.Commentary));
            nav.Bind(ArenaRoute.Demo, shell.Demo);
            nav.Bind(ArenaRoute.Exit, Application.Quit);
        }
    }
}
