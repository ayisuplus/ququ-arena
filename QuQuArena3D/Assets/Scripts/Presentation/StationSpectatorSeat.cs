using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // One reachable seat in the station graybox. The player walks here before taking a view.
    public sealed class StationSpectatorSeat : MonoBehaviour
    {
        public System.Func<bool> InputBlocked;
        public StationGrayboxWalker Walker;
        public Camera View;
        public bool IsSeated { get; private set; }

        Vector3 standingEyePosition;
        Quaternion standingEyeRotation;
        float standingFieldOfView;
        bool avatarWasActive;
        StationSpectatorCamera cameraModes;
        Collider seatCollider;

        void Awake() { seatCollider = GetComponent<Collider>(); cameraModes = View.GetComponent<StationSpectatorCamera>(); }
        bool CameraAway => cameraModes && (cameraModes.CloseUp || cameraModes.Flying);
        bool Blocked => InputBlocked?.Invoke() == true || Walker.InputBlocked?.Invoke() == true;

        void LateUpdate()
        {
            if (!IsSeated || CameraAway) return;
            Walker.MoveOnGround(Vector3.zero, Time.deltaTime);
            UpdateSeatedView();
        }

        public void UpdateSeatedView()
        {
            if (!IsSeated) return;
            View.transform.position = new Vector3(transform.position.x, seatCollider.bounds.max.y + 1.23f, transform.position.z);
            var target = new Vector3(0, 12, 0);
            View.transform.LookAt(cameraModes && cameraModes.ArenaFrame ? cameraModes.ArenaFrame.TransformPoint(target) : target);
        }

        void Update()
        {
            if (Keyboard.current?.eKey.wasPressedThisFrame == true) Use();
        }

        public bool Use()
        {
            if (!isActiveAndEnabled || !Walker || !View || Blocked || CameraAway) return false;
            var player = Walker.transform;
            if (!IsSeated)
            {
                if (!Walker.enabled) return false;
                var gap = player.position - transform.position;
                gap.y = 0;
                if (gap.magnitude > 2.2f || Mathf.Abs(player.position.y - transform.position.y) > 2) return false;
                standingEyePosition = View.transform.localPosition;
                standingEyeRotation = View.transform.localRotation;
                standingFieldOfView = View.fieldOfView;
                avatarWasActive = Walker.VisibleAvatar && Walker.VisibleAvatar.activeSelf;
                Walker.ResetGroundReference();
                Walker.enabled = false;
                if (Walker.VisibleAvatar) Walker.VisibleAvatar.SetActive(false);
                View.fieldOfView = 40;
                IsSeated = true;
                UpdateSeatedView();
            }
            else Stand();
            return true;
        }

        void Stand()
        {
                if (CameraAway) cameraModes.Return();
                if (Walker.gameObject.activeInHierarchy && Walker.GetComponent<CharacterController>().enabled)
                {
                    Walker.MoveOnGround(Vector3.zero, 0);
                    Walker.ResetGroundReference();
                }
                View.transform.localPosition = standingEyePosition;
                View.transform.localRotation = standingEyeRotation;
                View.fieldOfView = standingFieldOfView;
                if (Walker.VisibleAvatar) Walker.VisibleAvatar.SetActive(avatarWasActive);
                Walker.enabled = true;
                IsSeated = false;
        }

        void OnDisable() { if (IsSeated) Stand(); }

        void OnGUI()
        {
            if (!Walker || Blocked || CameraAway || (!IsSeated && !Walker.enabled)) return;
            var gap = Walker.transform.position - transform.position;
            gap.y = 0;
            if (!IsSeated && (gap.magnitude > 2.2f || Mathf.Abs(Walker.transform.position.y - transform.position.y) > 2)) return;
            var previousMatrix = GUI.matrix;
            float scale = Screen.height / 900f;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            GUI.Box(new Rect(Screen.width / scale / 2f - 140, Screen.height / scale - 72, 280, 36),
                IsSeated ? "E 离开观战席" : "E 坐下观看擂台",
                new GUIStyle(GUI.skin.box) { fontSize = 16 });
            GUI.matrix = previousMatrix;
        }
    }
}
