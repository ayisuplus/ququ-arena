using UnityEngine;

namespace QuQu
{
    // Briefly surfaces existing server events while the spectator HUD is compact.
    public sealed class StationPublicMatchNotice : MonoBehaviour
    {
        public ArenaStationLiveMatch Match;
        public StationGrayboxWalker Walker;
        public int NoticeCount { get; private set; }
        public long LastSequence { get; private set; }
        public string LastText { get; private set; }

        float visibleUntil;
        StationMatchHUD hud;
        GUIStyle style;

        void OnEnable()
        {
            if (Match) Match.PresentedEvent += OnPresented;
        }

        void OnDisable()
        {
            if (Match) Match.PresentedEvent -= OnPresented;
        }

        void OnPresented(CompetitionEvent item)
        {
            string message;
            switch (item.type)
            {
                case "duel-start":
                    message = "新对局开始";
                    break;
                case "round-resolved" when item.round?.settled == true:
                    message = "第 " + item.round.index + " 题已结算";
                    break;
                case "competition-end":
                    message = string.IsNullOrEmpty(item.winner) ? "赛事已终止" :
                        "赛事已结束 · 冠军 " + Match.DisplayName(item.winner);
                    break;
                default:
                    return;
            }
            LastText = message + " · H 查看赛事";
            LastSequence = item.seq;
            NoticeCount++;
            visibleUntil = Time.unscaledTime + 6f;
        }

        void OnGUI()
        {
            if (!Walker || !Match || Time.unscaledTime >= visibleUntil) return;
            if (!hud) hud = FindFirstObjectByType<StationMatchHUD>();
            if (!hud || !hud.enabled || !hud.IsCompact) return;
            if (style == null)
            {
                style = new GUIStyle(GUI.skin.box) {
                    fontSize = 18, alignment = TextAnchor.MiddleCenter,
                    clipping = TextClipping.Clip
                };
                style.normal.textColor = Color.white;
            }
            var oldMatrix = GUI.matrix;
            var scale = Mathf.Max(1f, Screen.height / 900f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            var width = Screen.width / scale;
            var oldBackground = GUI.backgroundColor;
            GUI.backgroundColor = new Color(.035f, .075f, .11f, .95f);
            GUI.Box(new Rect((width - 560) * .5f, 16, 560, 46), LastText, style);
            GUI.backgroundColor = oldBackground;
            GUI.matrix = oldMatrix;
        }
    }
}
