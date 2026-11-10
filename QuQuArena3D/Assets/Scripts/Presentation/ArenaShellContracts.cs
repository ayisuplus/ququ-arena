using System;
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace QuQu
{
    /** P5 asmdef 配套：含表现层具体类型（ArenaStage/ArenaUI/ArenaFighter/…）的契约接口，
     *  从 ArenaServices（QuQu.Core 纯契约）拆出，随表现层落位 QuQu.Presentation。
     *  拆分线：签名里出现表现具体类型的接口在这里；签名只用协议/基础类型的留 Core。
     *  消费方向恒合法：Validation→App→Presentation→Infrastructure→Core，
     *  ArenaGame（QuQu.App）实现这里全部接口，组合根注入。 */

    /** 赛台能力切片（P3）：由 ArenaGame 实现并委派给 ArenaStage —— 不改动在途的 ArenaStage.cs。
     *  入场升降的 Present 需要门面引用，故封装为 PresentEntrance()/HasEntrance，
     *  避免子系统为了一次演出而重新抱住 ArenaGame。 */
    public interface IMatchStage
    {
        List<ArenaFighter> Fighters { get; }
        float Motion { get; }
        bool FlightActive { get; }
        bool CameraDirected { get; }
        bool HasEntrance { get; }
        void EndCombat();
        void ResetCamera();
        void SetJudge(ModelInfo model);
        void CancelEntrance();
        IEnumerator PresentEntrance();
        IEnumerator PresentRound(CompetitionRound round, Action applied, Action<CompetitionAttack> contact = null);
        /** 胜者火花（单 VFX 总线在 ArenaStage，胜者判定在各演出链手里——只放这一件过去）。 */
        void CelebrateWinner(ArenaFighter fighter);
    }

    /** 桌面工作台入口 IWorkbenchLauncher 与界面命令集 IArenaCommands 是纯契约，留在 QuQu.Core（ArenaServices.cs）。 */

    /** 门面契约（P3-E）：UI/流程编排层（设置屏 4 子页、主菜单、退出流程、工作台、桌面中枢）
     *  本来就要跨系统编排，用"窄接口 × N"反而会把签名撑成八参数。这里改为依赖契约而非具体类型：
     *  · 现实收益：这些文件不再编译期依赖 MonoBehaviour 门面，可用 stub 单测；
     *  · P5 收益：契约与 UI 层可下沉到 Core/asmdef 下层，ArenaGame 留在最上层实现它（分层所必需）。
     *  ⚠️ 已知代价：本接口成员面宽，是"门面镜像"，不是能力切片。P5 分层完成后按调用点收敛拆分。 */
    public interface IArenaShell : INotifier, IArenaCommands, IStationContext, ICoroutineHost, IMatchControl, IRosterService, IMatchStage
    {
        new void ToggleSpectator(); // 两个父接口都声明了，组合后调用会二义（CS0121）
        new ArenaPreferences Preferences { get; set; } // 父接口只读；设置屏导入预设需要整体替换
        void Demo(); // 离线演示入口
        ArenaMedia Media { get; }
        ArenaDesktopHub Hub { get; }
        ArenaDesktopRuntime Desktop { get; }
        ArenaTaskCenter Tasks { get; }
        bool ValidationMode { get; }
        void SetFullscreen(bool value);
        /** 停止离线演示：内部判空，重复调用安全；返回是否真的停掉了一个在跑的演示。 */
        bool StopOffline();
        void StartOffline(IEnumerator routine);
        /** 需要在门面 GameObject 上挂组件（如录制器）时用这个，避免回传整个 MonoBehaviour。 */
        T AddComponent<T>() where T : Component;
        /** 形象状态提示行：设置屏写入、门面每帧刷新文案。 */
        TMP_Text AvatarModeStatus { get; set; }
        void MarkAppearancesDirty();
        /** 门面统一的"吞异常并提示"包装（导入素材等易失败操作）。 */
        void Try(Action action);
    }

    /** Check 层（集成验收 harness）契约（P5）：在 IArenaShell 之上补几个只有测试要用的入口
     *  —— 协议帧入口 Accept、Esc 出口、观战大屏实例、帧计数归零、模型预设兼容入口。
     *  Check 是集成测试，本来就要驱动整个应用；这里做的是把它对**具体门面类型**的依赖换成契约。 */
    public interface IArenaTestShell : IArenaShell
    {
        void Accept(Frame f);
        void Escape();
        ArenaSpectator Spectator { get; }
        new int AcceptedFrames { get; set; } // 父接口只读；Check 归零用例需要写
        void ApplyModelPreset(ArenaFighter fighter, string id);
        void ShowModelPresets(ArenaFighter fighter);
        bool AvatarModePending { get; }
    }

    /** 比赛表现面（P3-D）：演出者需要刷新界面、读取赛台选手、记计划题数与鸣金庆祝，
     *  但不需要认识 ArenaStage / ArenaMedia / strikes 内部实现。 */
    public interface IMatchSurface
    {
        ArenaUI UI { get; }
        int PlannedQuestions { get; set; }
        void ClearStrikes();
        void RefreshUI();
        void Celebrate();
    }

    /** 比赛演出上下文（P3-D）：ArenaMatchPresenter 唯一的依赖，由 ArenaGame 一并实现。
     *  组合继承已有切片，避免演出者为了一个方法重新抱住门面。 */
    public interface IMatchContext : IMatchControl, INotifier, IRosterService, IMatchStage, IMatchSurface { }

    /** 观战 HUD 上下文（P3-D）：既要点界面命令，又要读周边组件（Stage/Preferences/Reader/Commentary/Duel）。
     *  由两个既有切片组合而成，ArenaGame 一并实现。 */
    public interface IHudContext : IStationContext, IArenaCommands
    {
        /** 两个父接口都声明了 ToggleSpectator，组合后调用会二义（CS0121）；在子接口里重新声明以消歧。 */
        new void ToggleSpectator();
    }

    /** 轨道站上下文（P3）：展馆/实验站/裁判席需要的周边组件。由 ArenaGame 以现有公开字段实现，
     *  让 ArenaOrbitalNetwork 只认接口不认门面具体类型（更细的切片留待 P5）。
     *  P3-D 扩展：HUD/抽屉/升降入场也用它，故继承 INotifier（提示）+ ICoroutineHost（起协程），
     *  并暴露 ICompetitionLink（解说开关、追问、当前赛事 id）。 */
    public interface IStationContext : INotifier, ICoroutineHost
    {
        ArenaStage Stage { get; }
        ArenaUI UI { get; }
        ICompetitionLink Link { get; }
        ArenaDuelHUD Hud { get; }
        ArenaReadingDrawer Reader { get; }
        ArenaCommentaryDrawer Commentary { get; }
        ArenaDuelController Duel { get; }
        ArenaPreferences Preferences { get; }
        ArenaOrbitalNetwork Stations { get; }
        IJsonTransport Transport { get; }
        IWorkbenchLauncher Workbench { get; }
        bool IsSpectating { get; }
        void ToggleSpectator();
    }
}
