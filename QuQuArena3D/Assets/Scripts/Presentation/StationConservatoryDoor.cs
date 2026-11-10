using UnityEngine;

namespace QuQu
{
    // The conservatory entrance opens for both the player and resident controllers.
    public sealed class StationConservatoryDoor : MonoBehaviour
    {
        public Transform LeftPanel;
        public Transform RightPanel;
        public bool IsOpen => travel >= 2.19f;

        Collider[] occupants = new Collider[32];
        Vector3 leftClosed, rightClosed;
        float travel, holdUntil;

        void Awake()
        {
            leftClosed = LeftPanel.localPosition;
            rightClosed = RightPanel.localPosition;
        }

        bool Occupied()
        {
            int count = Physics.OverlapBoxNonAlloc(transform.TransformPoint(0, 1.4f, 0),
                new Vector3(2.7f, 1.5f, 4f), occupants, transform.rotation,
                ~0, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < count; i++)
                if (occupants[i] is CharacterController) return true;
            if (count == occupants.Length)
            {
                System.Array.Resize(ref occupants, occupants.Length * 2);
                return Occupied();
            }
            return false;
        }

        void Update()
        {
            if (Occupied()) holdUntil = Time.time + 1.8f;
            travel = Mathf.MoveTowards(travel, Time.time < holdUntil ? 2.2f : 0,
                Time.deltaTime * 3f);
            LeftPanel.localPosition = leftClosed + Vector3.left * travel;
            RightPanel.localPosition = rightClosed + Vector3.right * travel;
        }
    }
}
