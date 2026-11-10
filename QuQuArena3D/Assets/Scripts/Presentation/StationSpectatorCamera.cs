using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // Camera modes for the separate station scene; return to the exact walking or seated view.
    [RequireComponent(typeof(Camera))]
    public sealed class StationSpectatorCamera : MonoBehaviour
    {
        public System.Func<bool> InputBlocked;
        public StationGrayboxWalker Walker;
        public StationSpectatorSeat Seat;
        public Transform ArenaFrame;
        public bool CloseUp => mode == 1;
        public bool Flying => mode == 2;

        Camera view;
        ArenaFreeCamera flight;
        Vector3 savedPosition;
        Quaternion savedRotation;
        float savedFieldOfView, savedNearClip;
        Transform savedParent;
        bool walkerWasEnabled;
        int mode;
        bool Blocked => InputBlocked?.Invoke() == true || Walker.InputBlocked?.Invoke() == true;

        void Awake()
        {
            view = GetComponent<Camera>();
            flight = gameObject.AddComponent<ArenaFreeCamera>();
            flight.InputBlocked = () => Blocked;
            flight.SetActive(false);
        }

        void Update()
        {
            var keys = Keyboard.current;
            if (keys == null || Blocked) return;
            if (keys.f8Key.wasPressedThisFrame) ToggleFree();
            else if (keys.f9Key.wasPressedThisFrame) ToggleCloseUp();
            else if (keys.rKey.wasPressedThisFrame) Return();
        }

        void SaveView()
        {
            savedPosition = transform.localPosition;
            savedRotation = transform.localRotation;
            savedFieldOfView = view.fieldOfView;
            savedNearClip = view.nearClipPlane;
            savedParent = transform.parent;
            walkerWasEnabled = Walker.enabled;
            Walker.ResetGroundReference();
            Walker.enabled = false;
            transform.SetParent(null, true);
        }

        public void ToggleCloseUp()
        {
            if (!isActiveAndEnabled || Blocked) return;
            if (CloseUp) { Return(); return; }
            if (mode == 0) SaveView();
            flight.SetActive(false);
            UpdateCloseUp();
            view.fieldOfView = 42;
            mode = 1;
        }

        public void ToggleFree()
        {
            if (!isActiveAndEnabled || Blocked) return;
            if (Flying) { Return(); return; }
            if (mode == 0) SaveView();
            flight.SetActive(true);
            mode = 2;
        }

        void LateUpdate()
        {
            if (mode == 0) return;
            Walker.MoveOnGround(Vector3.zero, Time.deltaTime);
            if (CloseUp) UpdateCloseUp();
        }

        void UpdateCloseUp()
        {
            var position = new Vector3(0, 16.5f, 16);
            var target = new Vector3(0, 13.2f, 0);
            transform.position = ArenaFrame ? ArenaFrame.TransformPoint(position) : position;
            transform.LookAt(ArenaFrame ? ArenaFrame.TransformPoint(target) : target);
        }

        public void Return()
        {
            if (mode == 0) return;
            flight.SetActive(false);
            if (Walker.gameObject.activeInHierarchy && Walker.GetComponent<CharacterController>().enabled)
                Walker.MoveOnGround(Vector3.zero, 0);
            transform.SetParent(savedParent, false);
            transform.localPosition = savedPosition;
            transform.localRotation = savedRotation;
            view.fieldOfView = savedFieldOfView;
            view.nearClipPlane = savedNearClip;
            Walker.enabled = walkerWasEnabled;
            mode = 0;
            if (Seat && Seat.IsSeated) Seat.UpdateSeatedView();
        }

        void OnDisable() { if (mode != 0) Return(); }

        void OnGUI()
        {
            if (Blocked) return;
            var previousMatrix = GUI.matrix;
            float scale = Screen.height / 900f;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            var viewToggle = Walker && Walker.CanToggleView;
            GUI.Box(new Rect(16, Screen.height / scale - 50, viewToggle ? 470 : 405, 32),
                Flying ? "F8 返回原视角 · 右键转向 · WASD / Q E 移动" :
                viewToggle ? "V 切换视角 · F8 自由镜头 · F9 擂台近景 · R 返回" :
                "F8 自由镜头 · F9 擂台近景 · R 返回原视角",
                new GUIStyle(GUI.skin.box) { fontSize = 14 });
            GUI.matrix = previousMatrix;
        }
    }
}
