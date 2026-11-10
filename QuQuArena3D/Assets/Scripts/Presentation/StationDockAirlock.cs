using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // Graybox public passage; atmosphere and spacecraft docking are later work.
    public sealed class StationDockAirlock : MonoBehaviour
    {
        public StationGrayboxWalker Walker;
        public Transform InnerDoor;
        public Transform OuterDoor;

        public bool InnerOpen => innerOpen;
        public bool OuterOpen => outerOpen;

        void Update()
        {
            if (Keyboard.current?.eKey.wasPressedThisFrame != true ||
                !Walker || Walker.InputBlocked?.Invoke() == true) return;
            if (InReach(InnerDoor)) UseInner();
            else if (InReach(OuterDoor)) UseOuter();
        }

        bool InReach(Transform door)
        {
            if (!Walker || !door) return false;
            var delta = Walker.transform.position - door.position;
            return Mathf.Abs(delta.x) < 4.5f && Mathf.Abs(delta.z) < 4.5f &&
                   Mathf.Abs(delta.y) < 3;
        }

        public bool UseInner() => Use(InnerDoor, ref innerOpen, OuterOpen);
        public bool UseOuter() => Use(OuterDoor, ref outerOpen, InnerOpen);

        bool innerOpen, outerOpen;

        bool Use(Transform door, ref bool open, bool otherOpen)
        {
            if (!InReach(door) || Walker.InputBlocked?.Invoke() == true ||
                (!open && otherOpen) || (open && Mathf.Abs(Walker.transform.position.z - door.position.z) < .8f))
                return false;
            open = !open;
            door.gameObject.SetActive(!open);
            return true;
        }

        void OnGUI()
        {
            if (!Walker || Walker.InputBlocked?.Invoke() == true) return;
            var inner = InReach(InnerDoor);
            var outer = !inner && InReach(OuterDoor);
            if (!inner && !outer) return;
            var open = inner ? InnerOpen : OuterOpen;
            var blocked = !open && (inner ? OuterOpen : InnerOpen);
            var label = blocked ? "先关闭另一道舱门" :
                "E " + (open ? "关闭" : "开启") + (inner ? "站内舱门" : "接驳舱门");
            GUI.Box(new Rect(Screen.width * .5f - 160, Screen.height - 145, 320, 34), label);
        }
    }
}
