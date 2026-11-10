using UnityEngine;

namespace QuQu
{
    // A doorway can close after a reload, so its threshold is not a safe spawn.
    public sealed class StationUnsafeSaveZone : MonoBehaviour
    {
        public Vector3 Size;

        public bool Contains(Vector3 worldPosition)
        {
            var local = transform.InverseTransformPoint(worldPosition);
            return Mathf.Abs(local.x) < Size.x * .5f &&
                Mathf.Abs(local.y) < Size.y * .5f &&
                Mathf.Abs(local.z) < Size.z * .5f;
        }
    }
}
