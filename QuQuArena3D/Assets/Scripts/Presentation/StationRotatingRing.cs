using System;
using UnityEngine;

namespace QuQu
{
    // Ring geometry and its contents share one reference frame; transfer decks do not.
    [DefaultExecutionOrder(-100)]
    public sealed class StationRotatingRing : MonoBehaviour
    {
        public string RingId;
        public float InnerRadius;
        public float OuterRadius;
        public float DegreesPerSecond;

        void Update()
        {
            transform.Rotate(Vector3.up, DegreesPerSecond * Time.deltaTime, Space.Self);
        }

        public bool IsAwayFromSeam(Vector3 worldPosition, float clearance = .8f)
        {
            var local = transform.InverseTransformPoint(worldPosition);
            var radius = new Vector2(local.x, local.z).magnitude;
            return radius > InnerRadius + clearance && radius < OuterRadius - clearance;
        }

        public StationRingLocation Capture(Vector3 position, Quaternion rotation)
        {
            return new StationRingLocation {
                ringId = RingId,
                localPosition = transform.InverseTransformPoint(position),
                localYaw = (Quaternion.Inverse(transform.rotation) * rotation).eulerAngles.y
            };
        }

        public static bool TryResolve(StationRingLocation location, out Vector3 position,
            out Quaternion rotation)
        {
            position = Vector3.zero;
            rotation = Quaternion.identity;
            if (location == null || string.IsNullOrWhiteSpace(location.ringId) ||
                !Finite(location.localPosition.x) || !Finite(location.localPosition.y) ||
                !Finite(location.localPosition.z) || !Finite(location.localYaw)) return false;
            StationRotatingRing match = null;
            foreach (var ring in FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None))
                if (ring.RingId == location.ringId)
                {
                    if (match) return false;
                    match = ring;
                }
            if (!match) return false;
            position = match.transform.TransformPoint(location.localPosition);
            rotation = match.transform.rotation * Quaternion.Euler(0, location.localYaw, 0);
            return match.IsAwayFromSeam(position);
        }

        static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }

    [Serializable]
    public sealed class StationRingLocation
    {
        public string ringId;
        public Vector3 localPosition;
        public float localYaw;
    }
}
