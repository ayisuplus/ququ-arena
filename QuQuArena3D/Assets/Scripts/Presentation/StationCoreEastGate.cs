using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // Public core doorway; the surrounding district pressure shell is separate work.
    public sealed class StationCoreEastGate : MonoBehaviour
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
            if (!Walker || !Door || Walker.InputBlocked?.Invoke() == true)
                return false;
            var delta = Quaternion.Inverse(Door.transform.rotation) *
                (Walker.transform.position - Door.transform.position);
            if (Mathf.Abs(delta.x) > 4.5f || Mathf.Abs(delta.z) > 5f ||
                Mathf.Abs(delta.y) > 3f || (IsOpen && Mathf.Abs(delta.x) < .8f))
                return false;
            IsOpen = !IsOpen;
            Door.SetActive(!IsOpen);
            return true;
        }

        void OnGUI()
        {
            if (!Walker || !Door || Walker.InputBlocked?.Invoke() == true) return;
            var delta = Quaternion.Inverse(Door.transform.rotation) *
                (Walker.transform.position - Door.transform.position);
            if (Mathf.Abs(delta.x) > 4.5f || Mathf.Abs(delta.z) > 5f ||
                Mathf.Abs(delta.y) > 3f) return;
            GUI.Box(new Rect(Screen.width * .5f - 160, Screen.height - 145, 320, 34),
                "E " + (IsOpen ? "关闭" : "开启") + "公共舱门");
        }
    }
}
