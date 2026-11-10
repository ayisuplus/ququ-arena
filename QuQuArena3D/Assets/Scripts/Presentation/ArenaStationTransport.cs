using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace QuQu
{
    // The Blender hull and the cabin follow the same sampled, versioned route graph.
    public sealed class ArenaStationTransport : MonoBehaviour
    {
        [Serializable] public class Edge { public string a,b; public Vector3[] points; }
        [Serializable] public class Routes { public Edge[] edges; }
        public Routes Network { get; private set; }
        IStationContext ctx; // P3：站点上下文接口，不再持门面具体类型
        Transform capsule;
        Renderer[] capsuleRenderers;
        public ArenaSkyLift SkyLift { get; private set; }
        public bool CapsuleVisible=>capsuleRenderers.Any(r=>r.enabled) && CabinActive;
        bool upperRide;
        Image fade;
        Coroutine homeFade;
        public bool CabinActive => capsule && capsule.gameObject.activeSelf;
        public void Initialize(IStationContext owner,bool gray=false)
        {
            ctx=owner;Network=JsonUtility.FromJson<Routes>(Resources.Load<TextAsset>("Art/LiftV27/routes").text);
            Instantiate(Resources.Load<GameObject>("Art/LiftV27/Network"),transform,false);
            capsule=Instantiate(Resources.Load<GameObject>(gray?"Art/TransitV22/Capsule":"Art/ArchitectureV23/Capsule"),transform,false).transform;
            capsule.gameObject.SetActive(false);
            capsuleRenderers=capsule.GetComponentsInChildren<Renderer>(true);
            SkyLift=new GameObject("Guided commentary lift V27").AddComponent<ArenaSkyLift>();
            SkyLift.transform.SetParent(transform,false);SkyLift.Initialize();
            if(!gray)foreach(float side in new[]{-1f,1f})
            {
                var label=new GameObject("Central boarding sign").AddComponent<TextMeshPro>();label.transform.SetParent(transform,false);
                label.transform.localPosition=new Vector3(0,2.91f,8.15f+side*.075f);label.transform.localRotation=Quaternion.Euler(0,side<0?0:180,0);
                label.font=ctx.UI.Font;label.text="中央接驳 / CENTRAL TRANSIT";label.fontSize=1.15f;label.alignment=TextAlignmentOptions.Center;
                label.rectTransform.sizeDelta=new Vector2(2.55f,.24f);label.color=new Color(.74f,.88f,.88f);label.richText=false;
            }
            var cover=ctx.UI.Box(ctx.UI.Root,"Transport soft fade",0,0,1600,900,Color.clear);
            cover.anchorMin=Vector2.zero;cover.anchorMax=Vector2.one;cover.offsetMin=cover.offsetMax=Vector2.zero;
            fade=cover.GetComponent<Image>();fade.raycastTarget=false;
        }
        public static Vector3 Sample(Vector3[] p,float t)
        {
            float scaled=Mathf.Clamp01(t)*(p.Length-1);int i=Mathf.Min(Mathf.FloorToInt(scaled),p.Length-2);float u=scaled-i;
            Vector3 a=p[Mathf.Max(0,i-1)],b=p[i],c=p[i+1],d=p[Mathf.Min(p.Length-1,i+2)];
            return .5f*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u);
        }
        public Vector3[] Route(ArenaOrbitalNetwork.Place from,ArenaOrbitalNetwork.Place to)
        {
            string start=from==ArenaOrbitalNetwork.Place.Home?"arena":from.ToString().ToLowerInvariant(),end=to.ToString().ToLowerInvariant();
            var queue=new Queue<string>();var parent=new Dictionary<string,(string node,Edge edge)>();queue.Enqueue(start);parent[start]=(null,null);
            while(queue.Count>0 && !parent.ContainsKey(end))
            {
                string current=queue.Dequeue();
                foreach(var edge in Network.edges.Where(e=>e.a==current || e.b==current))
                {string next=edge.a==current?edge.b:edge.a;if(parent.ContainsKey(next))continue;parent[next]=(current,edge);queue.Enqueue(next);}
            }
            var legs=new List<Vector3[]>();string node=end;
            while(node!=start)
            {
                var previous=parent[node];var edge=previous.edge;
                var samples=Enumerable.Range(0,81).Select(i=>Sample(edge.points,i/80f)).ToArray();
                if(edge.b!=node)Array.Reverse(samples);legs.Insert(0,samples);node=previous.node;
            }
            return legs.SelectMany((points,index)=>index==0?points:points.Skip(1)).ToArray();
        }
        void Opacity(float alpha)
        {fade.transform.SetAsLastSibling();fade.color=new Color(.012f,.021f,.028f,alpha);}
        IEnumerator Fade(float from,float to,float duration)
        {for(float t=0;t<duration;t+=Time.unscaledDeltaTime){Opacity(Mathf.Lerp(from,to,t/duration));yield return null;}Opacity(to);}
        public void HomeCut()
        {if(homeFade!=null)StopCoroutine(homeFade);homeFade=StartCoroutine(Fade(1,0,.28f));}
        public void Cancel()
        {if(homeFade!=null){StopCoroutine(homeFade);homeFade=null;}capsule.gameObject.SetActive(false);SkyLift.ParkNearest();ResetLifts();Opacity(0);}
        void ResetLifts()
        {if(ctx.Stage.Lifts)ctx.Stage.Lifts.SetHeight(0,0);upperRide=false;}
        public IEnumerator Ride(ArenaOrbitalNetwork.Place from,ArenaOrbitalNetwork.Place to,Func<bool> skip,Action arrive)
        {
            if(homeFade!=null){StopCoroutine(homeFade);homeFade=null;}
            upperRide=from==ArenaOrbitalNetwork.Place.Commentary || to==ArenaOrbitalNetwork.Place.Commentary;
            bool still=ctx.Preferences.motion<=0;
            if(!skip())yield return Fade(0,1,.18f);
            if(upperRide)SkyLift.Dock(from==ArenaOrbitalNetwork.Place.Commentary);
            if(!still && !skip() && from!=to)
            {
                var route=Route(from,to);
                var first=route[Mathf.Min(8,route.Length-1)]-route[0];first.y=0;
                capsule.SetPositionAndRotation(route[0],Quaternion.LookRotation(first.sqrMagnitude>.01f?first:Vector3.forward));
                LiftPosition();
                capsule.gameObject.SetActive(true);PoseCamera();
                yield return Fade(1,0,.18f);
                if(upperRide)
                {
                    var vertical=Enumerable.Range(1,route.Length-1).Where(i=>Mathf.Abs(route[i].y-route[i-1].y)>.0001f && Mathf.Abs(route[i].z-ArenaSkyLift.ShaftZ)<.01f).ToArray();
                    int firstLift=vertical.First()-1,lastLift=vertical.Last();
                    var approach=route.Take(firstLift+1).ToArray();var exit=route.Skip(lastLift).ToArray();
                    float approachTime=ArenaTuning.TransportShortHop*Length(approach)/(Length(approach)+Length(exit));
                    yield return Move(approach,approachTime,skip);
                    if(!skip())yield return SkyLift.Gates(false);
                    if(!skip())yield return Move(route.Skip(firstLift).Take(lastLift-firstLift+1).ToArray(),2.85f,skip,true);
                    if(!skip())yield return SkyLift.Gates(true);
                    if(!skip())yield return Move(exit,ArenaTuning.TransportShortHop-approachTime,skip);
                }
                else yield return Move(route,ArenaTuning.TransportLongHop,skip);
                if(!skip())yield return Fade(0,1,.18f);
            }
            Opacity(1);capsule.gameObject.SetActive(false);
            if(upperRide)SkyLift.Dock(to==ArenaOrbitalNetwork.Place.Commentary);
            ResetLifts();arrive();
            yield return Fade(1,0,.18f);
        }
        static float Length(Vector3[] route)=>Enumerable.Range(1,route.Length-1).Sum(i=>Vector3.Distance(route[i-1],route[i]));
        IEnumerator Move(Vector3[] route,float duration,Func<bool> skip,bool vertical=false)
        {
            var lengths=new float[route.Length];
            for(int i=1;i<route.Length;i++)lengths[i]=lengths[i-1]+Vector3.Distance(route[i-1],route[i]);
            for(float t=0;t<1 && !skip();t+=Time.unscaledDeltaTime/duration)
            {
                float distance=Mathf.SmoothStep(0,1,t)*lengths[lengths.Length-1];int index=Array.BinarySearch(lengths,distance);if(index<0)index=~index;index=Mathf.Clamp(index,1,route.Length-1);
                capsule.position=Vector3.Lerp(route[index-1],route[index],Mathf.InverseLerp(lengths[index-1],lengths[index],distance));
                LiftPosition();
                var forward=vertical?Vector3.back:route[Mathf.Min(index+4,route.Length-1)]-route[Mathf.Max(0,index-3)];forward.y=0;
                if(forward.sqrMagnitude>.025f)capsule.rotation=Quaternion.Slerp(capsule.rotation,Quaternion.LookRotation(forward),Time.unscaledDeltaTime*ArenaTuning.TransportTurnSpeed);
                PoseCamera();yield return null;
            }
            if(!skip()){capsule.position=route[route.Length-1];LiftPosition();PoseCamera();}
        }
        void PoseCamera()
        {ctx.Stage.View.transform.SetPositionAndRotation(capsule.TransformPoint(new Vector3(0,.12f,-.22f)),capsule.rotation);ctx.Stage.View.fieldOfView=66;}
        void LiftPosition()
        {
            bool inShaft=upperRide && Mathf.Abs(capsule.position.x)<.01f && Mathf.Abs(capsule.position.z-ArenaSkyLift.ShaftZ)<1.48f;
            foreach(var renderer in capsuleRenderers)renderer.enabled=!upperRide;
            SkyLift.Riding=inShaft;
            if(inShaft)SkyLift.SetHeight(capsule.position.y-1.5f);
            if(ctx.Stage.Lifts && Mathf.Abs(capsule.position.x+ArenaEntranceLifts.HalfSpan)<.01f && Mathf.Abs(capsule.position.z)<.01f)
                ctx.Stage.Lifts.SetHeight(0,capsule.position.y-1.5f);
        }
    }
}
