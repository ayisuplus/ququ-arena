using UnityEngine;

namespace QuQu
{
    /** 设计令牌（P2 UI 构建收口）：HUD 布局尺寸与配色的唯一出处。
     *  数值与历史像素完全一致（1600×900 设计分辨率），只做命名归档、不做调整；
     *  后续任何视觉迭代改这里，不再翻四个构建器找魔数。 */
    public static class ArenaLayout
    {
        // —— 画布 ——
        public const float CanvasW = 1600, CanvasH = 900;
        public const float HeaderH = 100;

        // —— 三大区（参赛席 / 答题台 / 控制条）——
        public const float RosterX = 30, RosterY = 124, RosterW = 285, RosterH = 608;
        public const float DeskX = 1160, DeskY = 124, DeskW = 410, DeskH = 608;
        public const float ControlsX = 30, ControlsY = 758, ControlsW = 1540, ControlsH = 68;
        public const float StatusY = 676, FooterY = 844;

        // —— 参赛席行 ——
        public const float RosterRowH = 89, RosterRowStep = 100, RosterHealthW = 210;
        public const float RosterScrollH = 466;

        // —— 答题台内栏 ——
        public const float DeskInnerW = 347, DeskScrollW = 360;
        public const float QuestionMinH = 122, AnswerMinH = 290;

        // —— 配色 ——
        public static readonly Color Text = new Color(.91f, .95f, .99f);
        public static readonly Color Muted = new Color(.62f, .71f, .77f);
        public static readonly Color Panel = new Color(.027f, .041f, .053f, .96f);
        public static readonly Color Field = new Color(.065f, .088f, .105f, .97f);
        public static readonly Color AccentDefault = new Color(.70f, .88f, .93f);
    }
}
