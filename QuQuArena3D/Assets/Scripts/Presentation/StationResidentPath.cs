using System;
using UnityEngine;

namespace QuQu
{
    [Serializable]
    public sealed class StationResidentWaypoint
    {
        public Transform Frame;
        public Vector3 Position;
        // The edge ending at this waypoint follows a station-centred circular walk.
        public float ArcRadius;
    }

    // Authored paths keep room/destination anchors on their own moving frames.
    public sealed class StationResidentPath : MonoBehaviour
    {
        public StationResidentWaypoint[] Points;
        CharacterController body;
        StationRotatingRing ground;
        Vector3 localPosition;
        Quaternion groundRotation;
        public StationRotatingRing GroundRing => ground;

        public void Initialize()
        {
            body=GetComponent<CharacterController>();body.minMoveDistance=0;
            transform.SetParent(null,true);
            RefreshGround();
        }

        public Vector3 Point(int index)
        {
            var p=Points[index];return p.Frame?p.Frame.TransformPoint(p.Position):p.Position;
        }

        public Quaternion Facing(float yaw)
        {
            var frame=Points[Points.Length-1].Frame;
            return (frame?frame.rotation:Quaternion.identity)*Quaternion.Euler(0,yaw,0);
        }

        public void Carry()
        {
            if(!body || !ground)return;
            Physics.SyncTransforms();var target=ground.transform.TransformPoint(localPosition);
            if(body.enabled)body.Move(target-transform.position);else transform.position=target;
            transform.rotation=ground.transform.rotation*Quaternion.Inverse(groundRotation)*transform.rotation;
            RefreshGround();
        }

        public void RefreshGround()
        {
            ground=null;float nearest=float.MaxValue;
            foreach(var hit in Physics.RaycastAll(transform.position+Vector3.up*.3f,Vector3.down,.7f,~0,QueryTriggerInteraction.Ignore))
                if(hit.collider!=body && hit.normal.y>.65f && hit.distance<nearest)
                {nearest=hit.distance;ground=hit.collider.GetComponentInParent<StationRotatingRing>();}
            if(!ground)return;
            localPosition=ground.transform.InverseTransformPoint(transform.position);groundRotation=ground.transform.rotation;
        }

        public float Radius(int target,bool outbound)=>Points[outbound?target:target+1].ArcRadius;

        public Vector3 Steering(int target,bool outbound)
        {
            var destination=Point(target);float radius=Radius(target,outbound);
            if(radius<=0)return destination;
            var p=transform.position;float from=Mathf.Atan2(p.z,p.x)*Mathf.Rad2Deg,to=Mathf.Atan2(destination.z,destination.x)*Mathf.Rad2Deg;
            float angle=(from+Mathf.Clamp(Mathf.DeltaAngle(from,to),-2,2))*Mathf.Deg2Rad;
            return new Vector3(Mathf.Cos(angle)*radius,destination.y,Mathf.Sin(angle)*radius);
        }

        public float Length(int edge)
        {
            var a=Point(edge-1);var b=Point(edge);float radius=Points[edge].ArcRadius;
            return radius>0?Mathf.Abs(Mathf.DeltaAngle(Angle(a),Angle(b)))*Mathf.Deg2Rad*radius:Vector3.Distance(a,b);
        }

        public float Fraction(int target,bool outbound,Vector3 position)
        {
            var a=Point(target+(outbound?-1:1));var b=Point(target);
            if(Radius(target,outbound)>0)
            {
                float angle=Mathf.DeltaAngle(Angle(a),Angle(b));
                return Mathf.Abs(angle)<.001f?1:Mathf.Clamp01(Mathf.DeltaAngle(Angle(a),Angle(position))/angle);
            }
            return Mathf.Clamp01(Vector3.Dot(position-a,b-a)/Mathf.Max((b-a).sqrMagnitude,.001f));
        }

        public Vector3 Position(int target,bool outbound,float fraction)
        {
            var a=Point(target+(outbound?-1:1));var b=Point(target);float radius=Radius(target,outbound);
            if(radius<=0)return Vector3.Lerp(a,b,fraction);
            float angle=Mathf.LerpAngle(Angle(a),Angle(b),fraction)*Mathf.Deg2Rad;
            return new Vector3(Mathf.Cos(angle)*radius,Mathf.Lerp(a.y,b.y,fraction),Mathf.Sin(angle)*radius);
        }

        // Preserve journey progress when a legacy route has different waypoint counts.
        public void MapJourney(float fraction,bool outbound,out int target,out float segmentFraction)
        {
            float length=0;for(int i=1;i<Points.Length;i++)length+=Length(i);
            float remaining=Mathf.Clamp01(fraction)*length;target=outbound?Points.Length-1:Points.Length-2;segmentFraction=outbound?1:0;
            for(int i=1;i<Points.Length;i++)
            {
                float segment=Length(i);
                if(remaining<=segment || i==Points.Length-1)
                {target=outbound?i:i-1;segmentFraction=outbound?remaining/Mathf.Max(segment,.001f):1-remaining/Mathf.Max(segment,.001f);return;}
                remaining-=segment;
            }
        }

        static float Angle(Vector3 p)=>Mathf.Atan2(p.z,p.x)*Mathf.Rad2Deg;
    }
}
