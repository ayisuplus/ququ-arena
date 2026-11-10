using UnityEngine;

namespace QuQu
{
    // A public wayfinding stop on the port-to-core route; match state remains server owned.
    public sealed class StationArrivalGuide : StationReadingPanel
    {
        public ArenaStationLiveMatch Match;
        public bool ShowMatchDetail;
        public string GuideTitle;
        [TextArea] public string GuideDirections;

        public string Report() => !string.IsNullOrEmpty(GuideTitle) ?
            GuideDirections + "\n\n" +
            "赛事：" + (Match ? Match.Status : "未连接") + "\n" +
            "连接：" + (Match ? Match.ConnectionStatus : "未连接") :
            ShowMatchDetail ?
            "东轴 · 赛事观察点\n\n" +
            "赛事：" + (Match ? Match.Status : "未连接") + "\n" +
            "连接：" + (Match ? Match.ConnectionStatus : "未连接") + "\n" +
            "已结算回合：" + (Match ? Match.ResolvedRounds : 0) + "\n" +
            "获胜模型：" + (Match && !string.IsNullOrEmpty(Match.WinningModel) ?
                Match.DisplayName(Match.WinningModel) : "尚未产生") + "\n\n" +
            "赛事由现有后端结算，可返回核心观战" :
            "东北港区 · 访客导览\n\n" +
            "向南沿东轴：核心公共东门、模型住处与中央擂台\n" +
            "向北返回：港区、货运检修与停靠舱\n" +
            "继续向南：东南公共生活区与咖啡厅\n" +
            "外围环路可前往西北科研区与西南生态区\n\n" +
            "赛事：" + (Match ? Match.Status : "未连接") + "\n" +
            "连接：" + (Match ? Match.ConnectionStatus : "未连接");

        void OnGUI()
        {
            if (!ShowPanel) return;
            var old = GUI.matrix;
            var scale = Mathf.Max(1, Screen.height / 900f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            var width = Screen.width / scale;
            var height = Screen.height / scale;
            if (!IsOpen)
                GUI.Box(new Rect(width * .5f - 165, height - 230, 330, 36),
                    !string.IsNullOrEmpty(GuideTitle) ? "E 查看" + GuideTitle :
                    ShowMatchDetail ? "E 查看赛事状态" : "E 查看港区访客导览");
            else
            {
                var panel = new Rect((width - 700) * .5f, (height - 380) * .5f, 700, 380);
                var previousColor = GUI.color;
                GUI.color = new Color(.025f, .05f, .07f, .94f);
                GUI.DrawTexture(panel, Texture2D.whiteTexture);
                GUI.color = previousColor;
                GUI.Box(panel, !string.IsNullOrEmpty(GuideTitle) ? GuideTitle :
                    ShowMatchDetail ? "赛事观察点" : "访客导览");
                GUI.Label(new Rect(panel.x + 28, panel.y + 45, 644, 295), Report(),
                    new GUIStyle(GUI.skin.label) { fontSize = 20, wordWrap = true,
                        normal = { textColor = Color.white } });
                GUI.Label(new Rect(panel.x + 28, panel.y + 345, 644, 25),
                    "E 或 Esc 返回漫游");
            }
            GUI.matrix = old;
        }
    }
}
