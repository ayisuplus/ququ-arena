using UnityEngine;

namespace QuQu
{
    // A room belongs to a station resident, independently of the current battle model ID.
    public sealed class StationRoomIdentity : MonoBehaviour
    {
        public string RoomId;
        public string ResidentId;
    }
}
