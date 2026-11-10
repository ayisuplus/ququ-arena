using UnityEngine;

namespace QuQu
{
    [ExecuteAlways, RequireComponent(typeof(ReflectionProbe)), DisallowMultipleComponent]
    public sealed class StationReflectionVolume : MonoBehaviour
    {
        public Vector3 LocalCenter;
        public Vector3 LocalSize;
        ReflectionProbe probe;

        void OnEnable()
        {
            probe = GetComponent<ReflectionProbe>();
            LateUpdate();
        }

        void LateUpdate()
        {
            // Unity stores this offset in world axes, including on rotated probes.
            probe.center = transform.TransformVector(LocalCenter);
            if (LocalSize.sqrMagnitude <= 0) return;
            // Probe bounds also use world axes. Enclose the rotated local box.
            var x = transform.TransformVector(Vector3.right * LocalSize.x);
            var y = transform.TransformVector(Vector3.up * LocalSize.y);
            var z = transform.TransformVector(Vector3.forward * LocalSize.z);
            probe.size = new Vector3(
                Mathf.Abs(x.x) + Mathf.Abs(y.x) + Mathf.Abs(z.x),
                Mathf.Abs(x.y) + Mathf.Abs(y.y) + Mathf.Abs(z.y),
                Mathf.Abs(x.z) + Mathf.Abs(y.z) + Mathf.Abs(z.z));
        }
    }
}
