using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // A garden pause changes the view while keeping the visitor's safe standing position.
    public sealed class StationGardenSeat : MonoBehaviour
    {
        public StationGrayboxWalker Walker;
        public string StableId;
        public string Place = "生态花园";
        public bool IsSeated { get; private set; }

        StationSpectatorCamera cameraModes;
        bool cameraModesWasEnabled, avatarWasActive;
        Vector3 standingViewPosition;
        Quaternion standingViewRotation;
        GUIStyle promptStyle;
        static readonly System.Collections.Generic.List<StationGardenSeat> seats = new System.Collections.Generic.List<StationGardenSeat>();
        static int inputFrame = -1;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetInput() { inputFrame = -1; }

        void OnEnable() { if (!seats.Contains(this)) seats.Add(this); }

        void Update()
        {
            if (Keyboard.current?.eKey.wasPressedThisFrame == true && inputFrame != Time.frameCount &&
                (IsSeated || IsNearest()) && Use()) inputFrame = Time.frameCount;
        }

        bool IsNearest()
        {
            if (!Walker || !Walker.enabled) return false;
            float distance = (Walker.transform.position - transform.position).sqrMagnitude;
            if (distance > 2.1f * 2.1f) return false;
            foreach (var other in seats)
            {
                if (!other || other == this || other.Walker != Walker) continue;
                float candidate = (Walker.transform.position - other.transform.position).sqrMagnitude;
                if (candidate < distance || (candidate == distance &&
                    string.CompareOrdinal(other.StableId, StableId) < 0)) return false;
            }
            return true;
        }

        void LateUpdate()
        {
            if (!IsSeated || !Walker || !Walker.View) return;
            Walker.MoveOnGround(Vector3.zero, Time.deltaTime);
            UpdateSeatedView();
        }

        void UpdateSeatedView()
        {
            Walker.View.transform.position = transform.position + Vector3.up * 1.25f;
            Walker.View.transform.rotation = Quaternion.LookRotation(transform.forward, Vector3.up);
        }

        public bool Use()
        {
            if (!isActiveAndEnabled || !Walker || !Walker.View || Walker.InputBlocked?.Invoke() == true) return false;
            if (IsSeated) return Stand();
            if (!Walker.enabled || Vector3.Distance(Walker.transform.position, transform.position) > 2.1f) return false;
            cameraModes = Walker.View.GetComponent<StationSpectatorCamera>();
            if (cameraModes && (cameraModes.CloseUp || cameraModes.Flying)) return false;
            cameraModesWasEnabled = cameraModes && cameraModes.enabled;
            avatarWasActive = Walker.VisibleAvatar && Walker.VisibleAvatar.activeSelf;
            standingViewPosition = Walker.View.transform.localPosition;
            standingViewRotation = Walker.View.transform.localRotation;
            if (cameraModes) cameraModes.enabled = false;
            if (Walker.VisibleAvatar) Walker.VisibleAvatar.SetActive(false);
            Walker.ResetGroundReference();
            Walker.enabled = false;
            UpdateSeatedView();
            IsSeated = true;
            return true;
        }

        public bool Stand()
        {
            if (!IsSeated || !Walker) return false;
            if (Walker.gameObject.activeInHierarchy && Walker.GetComponent<CharacterController>().enabled)
            {
                Walker.MoveOnGround(Vector3.zero, 0);
                Walker.ResetGroundReference();
            }
            IsSeated = false;
            Walker.enabled = true;
            if (cameraModes) cameraModes.enabled = cameraModesWasEnabled;
            if (Walker.VisibleAvatar) Walker.VisibleAvatar.SetActive(avatarWasActive);
            if (Walker.View)
            {
                Walker.View.transform.localPosition = standingViewPosition;
                Walker.View.transform.localRotation = standingViewRotation;
            }
            return true;
        }

        void OnDisable() { if (IsSeated) Stand(); seats.Remove(this); }

        void OnGUI()
        {
            if (!Walker || Walker.InputBlocked?.Invoke() == true ||
                (!IsSeated && !IsNearest())) return;
            if (promptStyle == null) promptStyle = new GUIStyle(GUI.skin.box) {
                fontSize = 16, alignment = TextAnchor.MiddleCenter };
            GUI.Box(new Rect(Screen.width * .5f - 160, Screen.height - 180, 320, 36),
                Place + (IsSeated ? " · E 离座" : " · E 坐下休息"), promptStyle);
        }
    }
}
