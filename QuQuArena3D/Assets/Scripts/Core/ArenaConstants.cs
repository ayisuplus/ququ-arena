namespace QuQu
{
    /** 协议帧类型常量 —— 全库唯一出处（P0 解耦方案：消灭魔法字符串，新增帧类型只改这里与 FrameRouter）。 */
    public static class ArenaFrameTypes
    {
        public const string Start = "start", Round = "round", Stage = "stage", Model = "model",
            Withdrawal = "withdrawal", Control = "control", Milestone = "milestone",
            Commentary = "commentary", Done = "done", Error = "error";
    }

    /** 后台任务状态常量（退出确认对话框判定"仍有任务运行"使用）。 */
    public static class ArenaTaskStatus
    {
        public const string Running = "running", Queued = "queued", Preparing = "preparing", Working = "working",
            Grading = "grading", Checking = "checking", Pausing = "pausing", PauseRequested = "pause_requested",
            Unconfirmed = "unconfirmed";

        /** 仍在运行、阻止静默退出的状态集合。 */
        public static readonly string[] InFlight =
            { Running, Queued, Preparing, Working, Grading, Checking, Pausing, PauseRequested, Unconfirmed };
    }

    /** 角色形态档位（ArenaAvatarMode 的存储值）。 */
    public static class ArenaAvatarModes
    {
        public const string Chibi = "chibi", Standard = "standard";
    }

    /** 开赛档位（Launch.tier 的取值）。 */
    public static class ArenaTiers
    {
        public const string Free = "free", Official = "official";
    }

    /** 模型 ID 约定。 */
    public static class ArenaModelIds
    {
        public const string MockPrefix = "mock:";
    }
}
