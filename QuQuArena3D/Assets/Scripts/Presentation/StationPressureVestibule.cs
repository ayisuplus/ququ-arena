using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    public sealed class StationPressureVestibule : MonoBehaviour
    {
        public string StableId;
        public string DisplayName;
        public StationGrayboxWalker Walker;
        public Transform RoomDoor;
        public Transform StreetDoor;

        public bool RoomOpen => roomOpen;
        public bool StreetOpen => streetOpen;

        bool roomOpen, streetOpen;

        void Update()
        {
            if (Keyboard.current?.eKey.wasPressedThisFrame != true ||
                Walker?.InputBlocked?.Invoke() == true) return;
            if (SelectedDoor() == RoomDoor) UseRoom();
            else if (SelectedDoor() == StreetDoor) UseStreet();
        }

        public bool UseRoom() => Use(RoomDoor, ref roomOpen, streetOpen);
        public bool UseStreet() => Use(StreetDoor, ref streetOpen, roomOpen);

        bool Use(Transform door, ref bool open, bool otherOpen)
        {
            if (!InReach(door) || Walker.InputBlocked?.Invoke() == true ||
                (!open && otherOpen) || (open && InDoorway(door))) return false;
            open = !open;
            door.gameObject.SetActive(!open);
            return true;
        }

        Transform SelectedDoor()
        {
            var room = InReach(RoomDoor);
            var street = InReach(StreetDoor);
            if (room && roomOpen) return RoomDoor;
            if (street && streetOpen) return StreetDoor;
            if (room && (!street ||
                Mathf.Abs(DoorDelta(RoomDoor).z) < Mathf.Abs(DoorDelta(StreetDoor).z)))
                return RoomDoor;
            return street ? StreetDoor : null;
        }

        bool InReach(Transform door)
        {
            if (!isActiveAndEnabled || !Walker || !Walker.enabled || !door) return false;
            var delta = DoorDelta(door);
            return Mathf.Abs(delta.x) < 2.8f && Mathf.Abs(delta.z) < 2.8f &&
                Mathf.Abs(delta.y) < 3;
        }

        Vector3 DoorDelta(Transform door) => Quaternion.Inverse(door.rotation) *
            (Walker.transform.position - door.position);

        bool InDoorway(Transform door)
        {
            var delta = DoorDelta(door);
            return Mathf.Abs(delta.x) < 2.2f && Mathf.Abs(delta.z) < .8f && Mathf.Abs(delta.y) < 3;
        }

        void OnGUI()
        {
            if (Walker?.InputBlocked?.Invoke() == true) return;
            var door = SelectedDoor();
            if (!door) return;
            var room = door == RoomDoor;
            var open = room ? roomOpen : streetOpen;
            var blocked = !open && (room ? streetOpen : roomOpen);
            var label = blocked ? "先关闭另一道舱门" :
                "E " + (open ? "关闭" : "开启") + DisplayName +
                (room ? "内门" : "外门");
            GUI.Box(new Rect(Screen.width * .5f - 160, Screen.height - 145,
                320, 34), label);
        }
    }
}
