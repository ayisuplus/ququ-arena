using System;
using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;

namespace QuQu
{
    public sealed class ArenaGallery : MonoBehaviour
    {
        public readonly List<ArenaGalleryActor> Actors=new List<ArenaGalleryActor>();
        public ArenaGalleryView View { get; private set; }
        public bool Visible { get; private set; }
        public Transform Interior { get; private set; }
        public int MovingCount=>Actors.Count(a=>a.Walking);
        public float ActiveSeconds { get; private set; }
        public static readonly Vector3 Position=new Vector3(0,-23,4.2f);
        readonly Vector3[] points={new Vector3(-9,0,6.6f),new Vector3(-3,0,6.6f),new Vector3(3,0,6.6f),new Vector3(9,0,6.6f),
            new Vector3(-8.8f,0,-4.25f),new Vector3(8.8f,0,-4.25f),new Vector3(-8.8f,0,2.1f),new Vector3(8.8f,0,2.1f),
            new Vector3(-6.3f,0,.5f),new Vector3(0,0,2),new Vector3(6.3f,0,.5f),new Vector3(0,0,-4)};
        IStationContext ctx; // P3：站点上下文接口，不再持门面具体类型
        System.Random random;
        public void Initialize(IStationContext owner,bool gray)
        {
            ctx=owner;random=new System.Random();
            var prefab=Resources.Load<GameObject>("Art/ArchitectureV23/Gallery"+(gray?"-gray":""));
            transform.position=Position;
            var station=Instantiate(prefab,transform,false);station.name="Gallery station";
            Interior=station.transform.Find("Interior");
            var lights=new GameObject("Soft gallery lighting").transform;lights.SetParent(Interior,false);
            for(int x=-1;x<=1;x++)for(int z=-1;z<=1;z+=2)
            {
                var light=new GameObject("White ceiling fill").AddComponent<Light>();light.transform.SetParent(lights,false);
                light.transform.localPosition=new Vector3(x*7,4.5f,z*4);light.type=LightType.Point;
                light.color=new Color(.93f,.97f,1);light.range=13;light.intensity=13;
                // 混合光照：点光开软阴影（暗部空间深度不再全靠 _GalleryFill 假补光；实拍对照后再调 fill 强度）
                light.shadows=LightShadows.Soft;light.shadowStrength=.85f;
            }
            // 室内金属反射映展馆自身而不是星空：首次进馆渲一次盒式反射探针后冻结
            ArenaInteriorProbe.Attach(Interior,new Vector3(0,3,0),new Vector3(26,6,18));
            var label=new GameObject("Gallery identity").AddComponent<TextMeshPro>();label.transform.SetParent(Interior,false);
            label.transform.localPosition=new Vector3(0,4.92f,9.05f);
            label.font=ctx.UI.Font;label.text="MODEL GALLERY  /  角色观测舱";label.fontSize=4.1f;label.color=new Color(.74f,.86f,.85f);label.textWrappingMode=TextWrappingModes.NoWrap;
            label.alignment=TextAlignmentOptions.Center;label.rectTransform.sizeDelta=new Vector2(7.6f,.6f);label.richText=false;
            View=gameObject.AddComponent<ArenaGalleryView>();View.Initialize(ctx,this);
            SetVisible(false);
        }
        void Spawn()
        {
            for(int i=0;i<ArenaModelPresets.All.Length;i++)
            {
                var actor=new GameObject(ArenaModelPresets.All[i].Id+" gallery resident").AddComponent<ArenaGalleryActor>();
                actor.transform.SetParent(Interior,false);actor.transform.localPosition=new Vector3((i%3-1)*4.5f,.02f,(i/3)*5.1f-1.1f);
                actor.transform.localRotation=Quaternion.Euler(0,180+(i-2)*13,0);actor.Initialize(ArenaModelPresets.All[i],i);Actors.Add(actor);
            }
        }
        public void SetVisible(bool visible)
        {
            Visible=visible;Interior.gameObject.SetActive(visible);
            var proxy=Interior.parent.Find("DistantInterior");if(proxy)proxy.gameObject.SetActive(!visible);
            if(visible && Actors.Count==0)Spawn();
            if(!visible)View?.Leave();
        }
        public void RefreshAvatars() { foreach(var actor in Actors)actor.RefreshAvatar(); }
        public void Overview(out Vector3 position,out Quaternion rotation,out float fov)
        {
            position=transform.TransformPoint(new Vector3(0,5.65f,-8.7f));
            rotation=Quaternion.LookRotation(transform.TransformPoint(new Vector3(0,.6f,0))-position);fov=78;
        }
        void Update()
        {
            if(!Visible || ctx.Stations.Moving)return;
            float motion=ctx.Stage.Motion,dt=Time.deltaTime;
            if(motion>0)ActiveSeconds+=dt;
            foreach(var actor in Actors)actor.Tick(motion,dt);
            if(motion<=0)return;
            foreach(var actor in Actors)
            {
                if(MovingCount>=3)break;
                if(actor.Selected || actor.Walking || actor.RestRemaining>0)continue;
                var candidates=Enumerable.Range(0,points.Length).OrderBy(_=>random.Next());
                foreach(int index in candidates)
                {
                    if(index==actor.Destination || Actors.Any(a=>a!=actor && a.Destination==index))continue;
                    Vector3 position=transform.TransformPoint(points[index]);
                    if(Actors.Any(a=>a!=actor && Vector3.Distance(a.transform.position,position)<1.8f))continue;
                    if(Vector3.Distance(actor.transform.position,position)<2)continue;
                    var facing=transform.rotation*Quaternion.Euler(0,index<8?0:random.Next(360),0);
                    if(actor.Go(position,facing)){actor.Destination=index;break;}
                }
            }
        }
    }
}
