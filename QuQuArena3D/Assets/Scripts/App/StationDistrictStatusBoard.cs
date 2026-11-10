using UnityEngine;

namespace QuQu
{
    // Read-only district stop; the existing activity components own all progress.
    public sealed class StationDistrictStatusBoard : StationReadingPanel
    {
        public enum District { Port, Research, Garden, Civic }

        public string StableId;
        public string DisplayName;
        public District Source;
        public ArenaStationLiveMatch Match;
        public StationDockCargoService Cargo;
        public StationResearchDesk Research;
        public StationGreenhouseCare Greenhouse;
        public StationCafeMoment Cafe;

        Vector2 scroll;

        protected override void OnOpened() { scroll = Vector2.zero; }

        public string Report()
        {
            switch (Source)
            {
                case District.Port:
                    return "港区 · 货运观察湾\n\n左货台：" +
                        (Cargo ? Cargo.Completed ? "工单完成" : Cargo.Moving ?
                            "货箱正在移动" : Cargo.AtInspection ?
                            "等待近距离检查" : "等待启动" : "未连接") +
                        "\n返回港区可在货台旁操作。";
                case District.Research:
                    return "科研区 · 公开赛题观察湾\n\n" +
                        (Research ? Research.Report() : "档案未连接");
                case District.Garden:
                    return "生态区 · 温室观察湾\n\n已完成照料：" +
                        (Greenhouse ? Greenhouse.CareCount.ToString() : "未连接") +
                        " 次\n种植位阶段：" +
                        (Greenhouse ? Greenhouse.Stage.ToString() : "未连接") +
                        "\n前往温室入口，实际照料仍在种植位进行。";
                default:
                    return "生活区 · 公共赛事观察湾\n\n咖啡已供应：" +
                        (Cafe ? Cafe.ServedCount.ToString() : "未连接") +
                        " 杯\n已饮用：" +
                        (Cafe ? Cafe.DrunkCount.ToString() : "未连接") +
                        " 杯\n赛事：" + (Match ? Match.Status : "未连接") +
                        "\n连接：" + (Match ? Match.ConnectionStatus : "未连接");
            }
        }

        void OnGUI()
        {
            if (!ShowPanel) return;
            var oldMatrix = GUI.matrix;
            var scale = Mathf.Max(1, Screen.height / 900f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            var width = Screen.width / scale;
            var height = Screen.height / scale;
            if (!IsOpen)
                GUI.Box(new Rect(width * .5f - 170, height - 230, 340, 36),
                    "E 查看" + DisplayName);
            else
            {
                var rect = new Rect((width - 760) * .5f,
                    (height - 500) * .5f, 760, 500);
                var previousColor = GUI.color;
                GUI.color = new Color(.02f, .035f, .055f, .96f);
                GUI.DrawTexture(rect, Texture2D.whiteTexture);
                GUI.color = previousColor;
                GUI.Box(rect, GUIContent.none);
                GUILayout.BeginArea(new Rect(rect.x + 20, rect.y + 20,
                    rect.width - 40, rect.height - 40));
                scroll = GUILayout.BeginScrollView(scroll);
                GUILayout.Label(Report(), new GUIStyle(GUI.skin.label) {
                    fontSize = 20, wordWrap = true, richText = false,
                    normal = { textColor = Color.white }
                });
                GUILayout.EndScrollView();
                GUILayout.Label("E 或 Esc 返回漫游");
                GUILayout.EndArea();
            }
            GUI.matrix = oldMatrix;
        }
    }
}
