using System.Text;
using UnityEngine;

namespace QuQu
{
    // Reads public competition records at the west gallery; settlement remains server owned.
    public sealed class StationResearchDesk : StationReadingPanel
    {
        public ArenaStationLiveMatch Match;
        public event System.Action Opened;

        public string PlaceLabel = "西侧科研庭院";
        Vector2 scroll;
        GUIStyle reportStyle;

        protected override bool CanRead => Match;
        protected override void OnOpened() { scroll = Vector2.zero; Opened?.Invoke(); }

        public string Report()
        {
            var text = new StringBuilder(PlaceLabel + " · 公开赛题档案\n\n赛事：");
            text.Append(Match ? Match.Status : "未连接");
            var round = Match ? Match.CurrentRound : null;
            if (round == null) return text.Append("\n\n当前没有可查阅的赛题。").ToString();
            text.Append("\n第 ").Append(round.index).Append(" 题\n\n");
            text.Append(round.question?.task?.input ?? "赛题尚未同步");
            if (!round.settled)
                return text.Append("\n\n答卷与评分等待服务端结算。").ToString();
            foreach (var answer in round.records ?? System.Array.Empty<CompetitionAnswer>())
            {
                text.Append("\n\n").Append(Match.DisplayName(answer.model)).Append(" · ")
                    .Append(answer.score.ToString("0.##")).Append(" 分\n")
                    .Append(string.IsNullOrWhiteSpace(answer.answer) ?
                        (answer.error ?? "无公开答卷") : answer.answer);
            }
            return text.ToString();
        }

        void OnGUI()
        {
            if (!ShowPanel) return;
            var previousMatrix = GUI.matrix;
            var scale = Mathf.Max(1, Screen.height / 900f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            var canvasWidth = Screen.width / scale;
            var canvasHeight = Screen.height / scale;
            if (!IsOpen)
            {
                GUI.Box(new Rect(canvasWidth * .5f - 170, canvasHeight - 230, 340, 36),
                    "E 查阅" + PlaceLabel + "档案");
                GUI.matrix = previousMatrix;
                return;
            }
            if (reportStyle == null)
                reportStyle = new GUIStyle(GUI.skin.label) {
                    fontSize = 18, wordWrap = true, richText = false,
                    normal = { textColor = Color.white }
                };
            var width = Mathf.Min(900, canvasWidth - 32);
            var height = Mathf.Min(650, canvasHeight - 80);
            var rect = new Rect((canvasWidth - width) * .5f,
                (canvasHeight - height) * .5f, width, height);
            var previousColor = GUI.color;
            GUI.color = new Color(.02f, .035f, .055f, .96f);
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = previousColor;
            GUI.Box(rect, GUIContent.none);
            GUILayout.BeginArea(new Rect(rect.x + 18, rect.y + 18,
                rect.width - 36, rect.height - 36));
            scroll = GUILayout.BeginScrollView(scroll);
            GUILayout.Label(Report(), reportStyle);
            GUILayout.EndScrollView();
            GUILayout.Label("E 或 Esc 返回漫游", reportStyle);
            GUILayout.EndArea();
            GUI.matrix = previousMatrix;
        }
    }
}
