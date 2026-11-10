using UnityEngine;

namespace QuQu
{
    // One skinned renderer at every distance; all meshes share one rig and atlas.
    public sealed class ArenaChibiDetail : MonoBehaviour
    {
        public SkinnedMeshRenderer Skin;
        public Mesh[] Meshes;
        public int Level { get; private set; }
        float nextCheck;
        void LateUpdate()
        {
            if(!Skin || Meshes==null || Meshes.Length!=3 || Time.unscaledTime<nextCheck)return;
            nextCheck=Time.unscaledTime+.2f;
            var camera=Camera.main;if(!camera)return;
            float distance=Vector3.Distance(camera.transform.position,transform.position)/Mathf.Max(.1f,transform.lossyScale.x);
            int next=distance>32?2:distance>16?1:0;
            if(next==Level && Skin.sharedMesh==Meshes[next])return;
            Level=next;Skin.sharedMesh=Meshes[next];
        }
    }
}
