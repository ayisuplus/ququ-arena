using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // A traversable berth hatch; the public airlock still controls entry to the dock.
    public sealed class StationDockedVesselHatch : MonoBehaviour
    {
        public StationGrayboxWalker Walker;
        public GameObject Door;

        public bool IsOpen { get; private set; }

        void Update()
        {
            if (Keyboard.current?.eKey.wasPressedThisFrame == true) Use();
        }

        public bool Use()
        {
            if (!Walker || !Door || Walker.InputBlocked?.Invoke() == true) return false;
            var delta = Walker.transform.position - transform.position;
            if (Mathf.Abs(delta.x) > 4.5f || Mathf.Abs(delta.y) > 2.5f ||
                Mathf.Abs(delta.z) > 4.5f || (IsOpen && Mathf.Abs(delta.z) < .8f)) return false;
            IsOpen = !IsOpen;
            Door.SetActive(!IsOpen);
            return true;
        }

        void OnGUI()
        {
            if (!Walker || Walker.InputBlocked?.Invoke() == true) return;
            var delta = Walker.transform.position - transform.position;
            if (Mathf.Abs(delta.x) > 4.5f || Mathf.Abs(delta.y) > 2.5f ||
                Mathf.Abs(delta.z) > 4.5f) return;
            GUI.Box(new Rect(Screen.width * .5f - 160, Screen.height - 145, 320, 34),
                "E " + (IsOpen ? "关闭" : "开启") + "停靠舱门");
        }
    }
}
