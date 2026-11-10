using System.Collections;
using UnityEngine;

namespace QuQu
{
    // The only moving floor in the commentary shaft. Heights are deck surfaces, in world metres.
    public sealed class ArenaSkyLift : MonoBehaviour
    {
        public const float ShaftZ=21,Top=14;
        public float Height=>platform.position.y;
        public float GateOpening { get; private set; }
        public bool Riding { get; set; }
        public bool LandingOpen(bool upper)=>GateOpening>.99f && Mathf.Abs(Height-(upper?Top:0))<.01f;
        Transform platform;
        readonly Transform[] gates=new Transform[6];
        public void Initialize()
        {
            platform=Instantiate(Resources.Load<GameObject>("Art/LiftV27/Platform"),transform,false).transform;
            var leaf=Resources.Load<GameObject>("Art/LiftV27/Gate");
            for(int pair=0;pair<3;pair++)for(int side=0;side<2;side++)
            {
                var pivot=new GameObject((pair==0?"Platform":pair==1?"Lower landing":"Upper landing")+" safety gate "+side).transform;
                pivot.SetParent(pair==0?platform:transform,false);
                pivot.localPosition=new Vector3(side==0?-1.4f:1.4f,pair==2?Top:0,pair==0?-1.32f:ShaftZ-1.78f);
                Instantiate(leaf,pivot,false);gates[pair*2+side]=pivot;
            }
            Dock(false);
        }
        public void SetHeight(float height){platform.position=new Vector3(0,Mathf.Clamp(height,0,Top),ShaftZ);SetGates(GateOpening);}
        void SetGates(float amount)
        {
            GateOpening=amount;
            for(int pair=0;pair<3;pair++)for(int side=0;side<2;side++)
            {
                bool atFloor=pair==0 || Mathf.Abs(Height-(pair==2?Top:0))<.01f;
                float angle=side==0?0:180,open=pair==0?(side==0?-90:270):90;
                gates[pair*2+side].localRotation=Quaternion.Euler(0,Mathf.LerpAngle(angle,open,atFloor?amount:0),0);
            }
        }
        public IEnumerator Gates(bool open)
        {
            float start=GateOpening,end=open?1:0;
            for(float t=0;t<1;t+=Time.unscaledDeltaTime/.3f){SetGates(Mathf.Lerp(start,end,Mathf.SmoothStep(0,1,t)));yield return null;}
            SetGates(end);
        }
        public void Dock(bool upper){Riding=false;SetHeight(upper?Top:0);SetGates(1);}
        public void ParkNearest()=>Dock(Height>Top/2);
    }
}
