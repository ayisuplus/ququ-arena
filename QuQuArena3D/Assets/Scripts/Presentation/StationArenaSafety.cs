using System;
using UnityEngine;

namespace QuQu
{
    // Gates open only while real supporting surfaces cover both sides of the opening.
    public sealed class StationArenaSafety : MonoBehaviour
    {
        [Serializable] public sealed class Gate
        {
            public Transform Anchor;
            public GameObject Panel;
            public float HalfWidth = 1.23f;
            public Collider[] Supports;
        }
        public StationGrayboxWalker Walker;
        public ArenaDuelPlatforms Rig;
        public Gate[] Gates = Array.Empty<Gate>();
        public Collider[] MovingSurfaces = Array.Empty<Collider>();
        public bool MotionBlocked { get; private set; }

        void LateUpdate() => Refresh();
        public void Refresh()
        {
            Physics.SyncTransforms();
            MotionBlocked=false;
            foreach(var gate in Gates)
            {
                bool supported=true;
                for(int x=-1;x<=1;x+=2)for(int z=-1;z<=1;z+=2)
                {
                    var point=gate.Anchor.TransformPoint(x*.4f,0,z*gate.HalfWidth);bool found=false;
                    foreach(var floor in gate.Supports)
                        if(floor && floor.enabled && floor.gameObject.activeInHierarchy &&
                            floor.Raycast(new Ray(point+Vector3.up*.2f,Vector3.down),out var hit,.4f) &&
                            hit.normal.y>.65f && Mathf.Abs(hit.point.y-point.y)<.04f){found=true;break;}
                    supported&=found;
                }
                var local=Walker?gate.Anchor.InverseTransformPoint(Walker.transform.position):Vector3.one*100;
                bool occupied=Mathf.Abs(local.x)<.85f && Mathf.Abs(local.z)<gate.HalfWidth+.35f && local.y>-.2f && local.y<1.8f;
                MotionBlocked|=supported && occupied;
                if(gate.Panel.activeSelf==supported)gate.Panel.SetActive(!supported);
            }
            if(Walker)foreach(var floor in MovingSurfaces)
                if(floor && floor.enabled && floor.gameObject.activeInHierarchy &&
                    floor.Raycast(new Ray(Walker.transform.position+Vector3.up*.2f,Vector3.down),out var hit,.5f) && hit.normal.y>.65f)
                    MotionBlocked=true;
        }
        void OnDisable(){foreach(var gate in Gates)if(gate.Panel)gate.Panel.SetActive(true);}
        void OnGUI()
        {
            if(MotionBlocked && Rig && Rig.Phase!="docked" && Rig.Phase!="exited")
                GUI.Box(new Rect(Screen.width*.5f-240,Screen.height-190,480,34),"请离开升降台或赛事通道，机构将在通道清空后继续。");
        }
    }
}
