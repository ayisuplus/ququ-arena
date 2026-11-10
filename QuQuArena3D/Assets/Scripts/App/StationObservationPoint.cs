using UnityEngine;

namespace QuQu
{
    // The optical camera rides its building; its aim follows the arena reference frame.
    public sealed class StationObservationPoint : StationReadingPanel
    {
        public ArenaStationLiveMatch Match;
        public Camera ObservationCamera;
        public Transform ArenaFrame;
        bool previousWalkerCameraEnabled, previousObservationEnabled, previousCameraModesEnabled;
        Quaternion previousObservationRotation;
        StationSpectatorCamera cameraModes;
        protected override bool CanRead => ObservationCamera && Walker && Walker.View;

        protected override void OnOpened()
        {
            previousWalkerCameraEnabled = Walker.View.enabled;
            previousObservationEnabled = ObservationCamera.enabled;
            previousObservationRotation = ObservationCamera.transform.localRotation;
            cameraModes = Walker.View.GetComponent<StationSpectatorCamera>();
            if (cameraModes) { previousCameraModesEnabled = cameraModes.enabled; cameraModes.enabled = false; }
            Walker.View.enabled = false;
            ObservationCamera.enabled = true;
            Aim();
        }

        void LateUpdate() { if (IsOpen) Aim(); }

        void Aim()
        {
            var target = new Vector3(0, 8, 0);
            ObservationCamera.transform.LookAt(ArenaFrame ? ArenaFrame.TransformPoint(target) : target);
        }

        protected override void OnClosed()
        {
            if (ObservationCamera)
            {
                ObservationCamera.enabled = previousObservationEnabled;
                ObservationCamera.transform.localRotation = previousObservationRotation;
            }
            if (Walker && Walker.View) Walker.View.enabled = previousWalkerCameraEnabled;
            if (cameraModes) cameraModes.enabled = previousCameraModesEnabled;
        }

        void OnGUI()
        {
            if (!ShowPanel) return;
            var previousMatrix = GUI.matrix;
            var scale = Screen.height / 900f;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            var x = Screen.width / scale - 390;
            GUI.Box(new Rect(x, 300, 374, IsOpen ? 174 : 42),
                IsOpen ? "观景台 · 屋顶光学镜头\n\n内环：赛事核心\n中环：公共生活 · 外环：居住生态\n赛事：" +
                    (Match ? Match.Status : "未连接") + "\n\nE / Esc 退出观测"
                    : "E 查看观景台光学镜头",
                new GUIStyle(GUI.skin.box) { fontSize = 16, alignment = TextAnchor.UpperLeft,
                    wordWrap = true, padding = new RectOffset(12, 12, 8, 8) });
            GUI.matrix = previousMatrix;
        }
    }
}
