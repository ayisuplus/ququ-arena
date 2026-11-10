using System.Collections;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Presentation only. Competition events wait in their existing ordered queue.
    public sealed class ArenaEntranceLifts : MonoBehaviour
    {
        public const float HalfSpan=4.5f;
        public static Vector3 Landing(int index,float y)=>new Vector3(index==0?-HalfSpan:HalfSpan,y,0);
        public bool Active { get; private set; }
        public int EntranceCount { get; private set; }
        public Transform[] Platforms { get; private set; }
        ArenaStage stage;
        IStationContext ctx; // P3-D：入场演出只认周边组件切片（Stations/UI），不认门面类型
        ArenaFighter[] actors;
        ArenaStage.ViewState saved;
        RectTransform skipButton;
        bool skip;
        public void Create(ArenaStage owner)
        {
            stage=owner;
            Instantiate(Resources.Load<GameObject>("Art/ArchitectureV23/LiftStructure"),transform,false);
            Platforms=new Transform[2];
            for(int i=0;i<2;i++)
            {
                Platforms[i]=Instantiate(Resources.Load<GameObject>("Art/ArchitectureV23/LiftPlatform"),transform,false).transform;
                Platforms[i].name="Entrance lift "+(i+1);SetHeight(i,0);
            }
        }
        public void SetHeight(int index,float y)
        {Platforms[index].localPosition=Landing(index,Mathf.Clamp(y,-23,0));}
        public void Skip(){skip=true;}
        public void Cancel()
        {
            if(!Active)return;
            Active=false;skip=true;
            foreach(var actor in actors)if(actor)actor.EndEntrance();
            SetHeight(0,0);SetHeight(1,0);
            if(skipButton)Destroy(skipButton.gameObject);
            ctx.Stations.Gallery.SetVisible(false);
            foreach(var resident in ctx.Stations.Gallery.Actors)resident.gameObject.SetActive(true);
            stage.RestoreView(saved);
        }
        bool Continue=>Active && !skip && stage.Motion>0 && ctx.Stations.Current==ArenaOrbitalNetwork.Place.Arena && !ctx.Stations.Moving;
        public IEnumerator Present(IStationContext owner)
        {
            if(stage.Motion<=0 || owner.Stations.Current!=ArenaOrbitalNetwork.Place.Arena || owner.Stations.Moving || owner.UI.Modal || stage.Flight.Active || stage.Fighters.Count!=2)yield break;
            ctx=owner;actors=stage.Fighters.ToArray();saved=stage.CaptureView();Active=true;skip=false;EntranceCount++;
            stage.CameraDirected=true;
            skipButton=ctx.UI.Box(ctx.UI.Root,"Twin lift entrance",535,797,530,64,new Color(.025f,.05f,.055f,.94f));
            ctx.UI.Button(skipButton,"选手升降入场 · 点击或 Esc 跳过",12,12,506,Skip);
            foreach(var actor in actors)actor.BeginEntrance();
            ctx.Stations.Gallery.SetVisible(true);
            foreach(var resident in ctx.Stations.Gallery.Actors)
                if(actors.Any(a=>ArenaModelPresets.Find(a.Look.presetId)==resident.Preset))resident.gameObject.SetActive(false);
            try
            {
                for(float t=0;t<1 && Continue;t+=Time.unscaledDeltaTime/3.7f)
                {
                    float y=Mathf.Lerp(-23,0,Mathf.SmoothStep(0,1,t));
                    for(int i=0;i<2;i++)
                    {
                        int pad=actors[i].Home.x<0?0:1;SetHeight(pad,y);
                        actors[i].EntrancePose(Platforms[pad].position+Vector3.up*actors[i].Home.y,Quaternion.Euler(0,180,0),0);
                    }
                    stage.View.transform.position=new Vector3(0,y+5,-16);
                    stage.View.transform.LookAt(new Vector3(0,y+1.25f,0));stage.View.fieldOfView=50;
                    // Interior effects are useful only while the camera is inside the gallery.
                    if(y>-14 && ctx.Stations.Gallery.Visible)ctx.Stations.Gallery.SetVisible(false);
                    yield return null;
                }
                SetHeight(0,0);SetHeight(1,0);
                // 入场尘（落点一）：升降平台冲顶刹停，扬尘。
                foreach(var actor in actors) if(actor) stage.Vfx?.Entrance(actor.transform.position, actor.Tint);
                var fromCamera=stage.View.transform.position;var rotation=stage.View.transform.rotation;
                float duration=actors.Max(a=>Vector3.Distance(Landing(a.Home.x<0?0:1,a.Home.y),a.Home)/a.EntranceSpeed);
                for(float t=0;t<1 && Continue;t+=Time.unscaledDeltaTime/duration)
                {
                    float u=t*t*t*(t*(t*6-15)+10);float rate=30*t*t*(1-t)*(1-t)/duration;
                    foreach(var actor in actors)
                    {
                        var start=Landing(actor.Home.x<0?0:1,actor.Home.y);var delta=actor.Home-start;
                        actor.EntrancePose(Vector3.Lerp(start,actor.Home,u),Quaternion.LookRotation(delta),delta.magnitude*rate);
                    }
                    float blend=Mathf.SmoothStep(0,1,Mathf.Clamp01(t*2));
                    stage.View.transform.SetPositionAndRotation(Vector3.Lerp(fromCamera,saved.position,blend),Quaternion.Slerp(rotation,saved.rotation,blend));
                    stage.View.fieldOfView=Mathf.Lerp(50,saved.fov,blend);yield return null;
                }
                // 入场尘（落点二）：登台站定，脚下扬尘。
                foreach(var actor in actors) if(actor) stage.Vfx?.Entrance(actor.Home, actor.Tint);
            }
            finally{Cancel();}
        }
    }
}
