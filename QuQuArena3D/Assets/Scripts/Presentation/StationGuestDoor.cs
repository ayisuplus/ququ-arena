using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    public sealed class StationGuestDoor : MonoBehaviour
    {
        public StationGrayboxWalker Walker;
        public Transform Panel;
        public string Room;
        public bool IsOpen { get; private set; }

        readonly Collider[] occupants = new Collider[16];
        Vector3 closed;

        void Awake() { closed = Panel.localPosition; }

        bool CanUse()
        {
            if (!Walker || !Walker.enabled || !Walker.View || Walker.InputBlocked?.Invoke() == true)
                return false;
            var delta = transform.position - Walker.transform.position;
            delta.y = 0;
            var looking = transform.position + Vector3.up * 1.4f - Walker.View.transform.position;
            return delta.sqrMagnitude < 3.24f && Mathf.Abs(Walker.transform.position.y - transform.position.y) < 1f &&
                Vector3.Dot(Walker.View.transform.forward, looking.normalized) > .65f;
        }

        bool Occupied()
        {
            int count = Physics.OverlapBoxNonAlloc(transform.TransformPoint(0, 1.3f, 0),
                new Vector3(.85f, 1.3f, .5f), occupants, transform.rotation, ~0, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < count; i++)
                if (occupants[i] is CharacterController) return true;
            return count == occupants.Length;
        }

        public bool Use()
        {
            if (!CanUse() || (IsOpen && Occupied())) return false;
            IsOpen = !IsOpen;
            return true;
        }

        void Update()
        {
            if (Keyboard.current?.fKey.wasPressedThisFrame == true) Use();
            if (!IsOpen && Panel.localPosition != closed && Occupied()) IsOpen = true;
            Panel.localPosition = Vector3.MoveTowards(Panel.localPosition,
                closed + (IsOpen ? Vector3.right * 1.85f : Vector3.zero), Time.deltaTime * 2.5f);
        }

        void OnGUI()
        {
            if (CanUse()) GUI.Box(new Rect(Screen.width * .5f - 160, Screen.height - 145, 320, 34),
                "F " + (IsOpen ? "关闭" : "开启") + Room + "舱门");
        }
    }
}
