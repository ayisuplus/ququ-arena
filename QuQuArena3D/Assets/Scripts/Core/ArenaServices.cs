using System;
using System.Collections;
using Newtonsoft.Json.Linq;

namespace QuQu
{
    /** P3 窄接口（解耦方案 Phase 3）：子系统只依赖这里的能力切片，不再依赖 ArenaGame 具体类型。
     *  组合根（ArenaBootstrap）负责把 ArenaGame 以接口身份注入各子系统。
     *  P5 asmdef：本文件为 QuQu.Core 纯契约（签名仅协议/基础类型）；含表现具体类型的契约在
     *  QuQu.Presentation 的 ArenaShellContracts.cs。 */

    /** 通知服务：用户可见消息的唯一出口（替代经由 ArenaGame.Notify 的穿层）。 */
    public interface INotifier
    {
        void Notify(string message);
    }

    /** 比赛状态所有权：Finished 等比赛级状态对外只读，写方必须经显式变更方法（替代对门面状态的直写）。
     *  写方：ArenaDuelController / ArenaMatchPresenter；读方（Check、观战轮询）暂经 ArenaGame 门面，P5 统一收口。 */
    public interface IMatchControl
    {
        bool Finished { get; }

        /** Finished 变更事件（幂等赋值不触发）。读方现阶段仍轮询 Finished，此事件为后续订阅者预备。 */
        event Action<bool> FinishedChanged;

        void SetFinished(bool finished);

        int AcceptedFrames { get; }
        void CountAcceptedFrame();

        string Selected { get; set; }
        string ReportPath { get; set; }
    }

    /** 后端端点绑定：地址切换与基址读取（替代经由 ArenaConnection.SetEndpoint/BaseUrl 的穿层）。 */
    public interface IEndpointBinding
    {
        string BaseUrl { get; }
        bool SetEndpoint(string url);
    }

    /** 后端 JSON 请求：任务中心、工作台等只需要"发个请求拿 JSON"，不认识 ArenaGame。 */
    public interface IJsonTransport
    {
        IEnumerator Json(string route, string method, JToken body, Action<JToken> done, Action<string> failed = null);
    }

    /** 任务信号广播：轨道站红点/计数（延迟取用，组合根建站前后都不为空）。 */
    public interface ITaskSignalSink
    {
        void UpdateTaskSignals(JArray tasks);
    }

    /** 赛事后端链路（P3）：开赛、暂停/继续、续赛、回放与目录查询。签名与 ArenaConnection 一致（含可选参数）。
     *  P3-D 追加：解说席需要的当前赛事 id 与解说开关/追问。 */
    public interface ICompetitionLink : IJsonTransport, IEndpointBinding
    {
        string Competition { get; }
        IEnumerator Download(string path, Action<byte[]> done, Action<string> failed);
        void Replay(string file);
        Action<CompetitionPacket, bool> OnCompetition { set; }
        void Disconnect();
        IEnumerator Request<T>(string path, object body, Action<T> done, Action<string> failed = null);
        void Launch(Launch options);
        void WatchCompetition(string id, bool fresh = false);
        void Continue(string id, string duelId = null, string arena = null);
        void Control(string action);
        void Commentary(string agentId, bool enabled, Action done = null, Action<string> failed = null);
        void AskCommentator(string question);
    }

    /** 协程宿主（P3-D）：需要发起后端协程的纯 C# 子系统（解说配置屏）不再抱住 MonoBehaviour 门面，
     *  只请求"帮我跑一段协程"。 */
    public interface ICoroutineHost
    {
        void Run(IEnumerator routine);
    }

    /** 赛台能力切片 IMatchStage、轨道站上下文 IStationContext、门面契约 IArenaShell/IArenaTestShell/
     *  IMatchSurface/IMatchContext/IHudContext 含表现层具体类型，已拆至 QuQu.Presentation（ArenaShellContracts.cs）。
     *  本文件只留纯契约（签名仅用协议/基础类型），落位 QuQu.Core。 */

    /** 花名册装载（P3）：选手上下场与形象重建。 */
    public interface IRosterService
    {
        void SetRoster(ModelInfo[] roster);
    }

    /** 桌面工作台入口（P3）：赛事大厅只用它开几个页面（实现跨 ArenaDesktopHub 各分部）。签名纯基础类型 → 留 Core。 */
    public interface IWorkbenchLauncher
    {
        void History(bool legacy = false, int offset = 0, string query = "");
        void Agents();
        void Banks();
        void Advanced();
        void Workbench();
        void TaskCenter();
        void Models(Action back = null, bool refresh = false);
    }

    /** 界面命令集（P3）：工具条/抽屉要触发的动作。ArenaGame 以一行转发实现，UI 不再认识门面类型。 */
    public interface IArenaCommands : IWorkbenchLauncher
    {
        void ShowHome();
        void ShowLobby();
        void ShowSettings(int tab);
        void ToggleReasoning();
        void ToggleSpectator();
        void FocusSelected();
        void ShowBracket();
        void Control(string action);
        void ResetCamera();
        void ApplyPreferences();
        void RequestEscape(); // 输入框取消等场景请求一次 Esc 处理
        bool CameraOrbit { get; set; }
        // P3-D：观战 HUD 需要的三个门面转发（选中选手、自由镜头、HUD 显隐）
        void SelectFighter(string id);
        void ToggleFreeCamera();
        void ToggleCameraHud();
    }
}
