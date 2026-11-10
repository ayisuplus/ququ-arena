using System;
using System.Collections;
using System.Linq;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.Rendering;

namespace QuQu
{
    // Scene navigation owns the camera only. Matches and experiments retain their own lifecycle.
    public class ArenaOrbitalNetwork : MonoBehaviour, ITaskSignalSink
    {
        public enum Place { Arena, Home, Lab, Referee, Commentary, Gallery }
        public Place Current { get; private set; }
        public bool Moving { get; private set; }
        public Transform Lab { get; private set; }
        public Transform RefereeStation { get; private set; }
        public Transform CommentaryStation { get; private set; }
        public ArenaPixelBroadcast PixelScreen { get; private set; }
        public ArenaRefereeBoard RefereeBoard { get; private set; }
        public bool GlassView { get; private set; }
        public ArenaGallery Gallery { get; private set; }
        public ArenaStationTransport Transport { get; private set; }
        public bool LabInteriorActive => labInterior.gameObject.activeSelf;
        public bool RefereeInteriorActive => refereeInterior.gameObject.activeSelf;
        public bool CommentaryInteriorActive => commentaryInterior.gameObject.activeSelf;
        public bool BroadcastInteriorActive => RefereeInteriorActive || CommentaryInteriorActive;
        public bool Speaking { get; private set; }
        IStationContext ctx; // P3：只认站点上下文接口，不认门面具体类型
        ArenaStage Stage => ctx.Stage;
        ArenaUI UI => ctx.UI;
        Transform labInterior,refereeInterior,commentaryInterior;
        ArenaStage.ViewState saved,homeSaved;
        RectTransform transit,markers,facilityPanel;
        readonly RectTransform[] markerButtons=new RectTransform[4];
        readonly Light[] labLights=new Light[2];
        Light broadcastLight;
        TMP_Text refereeName,onAir;
        readonly TMP_Text[] labStatus=new TMP_Text[2];
        ArenaFighter commentator;
        Material pulseMaterial;
        Coroutine journey,labRefresh;
        bool changing,skip;
        float pulse;

        public void Initialize(IStationContext owner,bool gray)
        {
            ctx=owner;
            string suffix=gray?"-gray":"";
            Transform Spawn(string name,Vector3 position,float yaw)
            {
                var prefab=Resources.Load<GameObject>("Art/"+(name=="Lab"?"ArchitectureV23/":"BoothsV26/")+name+suffix);
                if(!prefab)throw new InvalidOperationException("Orbital facility prefab missing: "+name);
                var root=Instantiate(prefab,transform,false).transform;root.localPosition=position;root.localRotation=Quaternion.Euler(0,yaw,0);return root;
            }
            Lab=Spawn("Lab",new Vector3(-38,0,11.3f),0);
            RefereeStation=Spawn("Referee",new Vector3(31,0,10.2f),0);
            CommentaryStation=Spawn("Commentary",new Vector3(0,14,0),0);
            Gallery=new GameObject("Model gallery facility").AddComponent<ArenaGallery>();Gallery.transform.SetParent(transform,false);Gallery.Initialize(ctx,gray);
            Transport=new GameObject("Station transport V22").AddComponent<ArenaStationTransport>();Transport.transform.SetParent(transform,false);Transport.Initialize(ctx,gray);
            labInterior=Lab.Find("Interior");refereeInterior=RefereeStation.Find("Interior");commentaryInterior=CommentaryStation.Find("Interior");
            // 室内金属反射映舱内自身而不是星空：进舱首帧渲一次盒式反射探针后冻结（解说/裁判舱）
            ArenaInteriorProbe.Attach(refereeInterior,new Vector3(0,2.5f,0),new Vector3(14,5,10));
            ArenaInteriorProbe.Attach(commentaryInterior,new Vector3(0,2.5f,0),new Vector3(15,5,10));
            Sign(Lab,"KEPLER / RESEARCH STATION",new Vector3(0,5.08f,-5.79f),new Vector2(14,.38f),1.2f);
            Sign(RefereeStation,"01 / REFEREE",new Vector3(0,4.4f,-4.56f),new Vector2(6,.4f),1.2f);
            Sign(CommentaryStation,"02 / SKY COMMENTARY",new Vector3(0,4.4f,-5.56f),new Vector2(8,.4f),1.2f);
            var judgeSeat=new GameObject("Judge position").transform;judgeSeat.SetParent(RefereeStation,false);judgeSeat.localPosition=new Vector3(-1.65f,.04f,.8f);
            Stage.Venue.PlaceJudge(judgeSeat);
            refereeName=Sign(refereeInterior,"裁判观察舱",new Vector3(-1.65f,1.2f,-.85f),new Vector2(3.5f,.3f),1);
            onAir=Sign(commentaryInterior,"解说待机",new Vector3(-3.55f,4.11f,4.95f),new Vector2(3.5f,.4f),1.2f);
            onAir.color=new Color(.045f,.13f,.15f);
            commentator=new GameObject("Commentator avatar").AddComponent<ArenaFighter>();commentator.transform.SetParent(CommentaryStation,false);
            commentator.Create(new ModelInfo{id="station:commentator",name="解说"},new AvatarPreference{style=2,color="#D5DEE0",scale=.8f},CommentaryStation.TransformPoint(new Vector3(5.7f,.04f,4.05f)));
            commentator.ShowNameplate=false;commentator.Motion=0;
            PixelScreen=new GameObject("Pixel broadcast monitor").AddComponent<ArenaPixelBroadcast>();
            PixelScreen.Initialize(ctx,commentaryInterior,new Vector3(-3.55f,2.83f,4.975f),new Vector2(3.5f,2),Quaternion.identity);
            RefereeBoard=new GameObject("Official referee announcements").AddComponent<ArenaRefereeBoard>();RefereeBoard.transform.SetParent(transform,false);
            RefereeBoard.Initialize(ctx,refereeInterior,new Vector3(-1.75f,2.66f,3.865f),new Vector2(5.4f,3),Quaternion.identity);
            for(int i=0;i<2;i++)
            {
                float x=i==0?-5.8f:5.8f;
                labStatus[i]=Sign(labInterior,i==0?"工程实验 / 等待连接":"多阶段实验 / 等待连接",new Vector3(x,2.8f,2.25f),new Vector2(5,.65f),.85f);
                labStatus[i].transform.localRotation=Quaternion.Euler(0,180,0);
                labLights[i]=Fill(labInterior,new Vector3(x,3.6f,-1),new Color(.65f,1,.87f),5);
            }
            Fill(labInterior,new Vector3(0,4,1),new Color(.87f,.96f,1),11);
            Fill(refereeInterior,new Vector3(-1.65f,3.8f,-1.6f),new Color(.78f,.94f,1),9,true);
            Fill(commentaryInterior,new Vector3(-3,3.8f,2),new Color(.87f,.96f,1),8,true);
            broadcastLight=Fill(commentaryInterior,new Vector3(4.5f,3.8f,2.2f),new Color(1,.85f,.65f),9);
            pulseMaterial=ArenaStage.Mat(new Color(.7f,.91f,.78f),.35f);
            var signal=ArenaStage.Shape(CommentaryStation,"Live commentary light",PrimitiveType.Cube,new Vector3(0,4.05f,-5.56f),new Vector3(6,.055f,.045f),pulseMaterial);
            signal.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
            // Navigation lights are local to the facilities; no line crosses the black hole.
            foreach(var facility in new[]{Lab,RefereeStation,CommentaryStation})
                for(int i=-1;i<=1;i+=2)ArenaStage.Shape(facility,"Docking beacon",PrimitiveType.Sphere,new Vector3(i*(facility==Lab?13.4f:facility==RefereeStation?5.7f:7.7f),-.2f,-3),Vector3.one*.16f,pulseMaterial);
            markers=UI.Box(UI.Root,"Orbital destinations",0,0,1600,900);
            string[] names={"实验站 →","裁判舱 →","解说舱 →","模型展馆 →"};Place[] places={Place.Lab,Place.Referee,Place.Commentary,Place.Gallery};
            for(int i=0;i<places.Length;i++){var destination=places[i];markerButtons[i]=(RectTransform)UI.Button(markers,names[i],0,0,132,()=>Visit(destination)).transform;}
            SetNear(Place.Arena);
        }
        TMP_Text Sign(Transform parent,string text,Vector3 position,Vector2 size,float fontSize)
        {
            var go=new GameObject(text);go.transform.SetParent(parent,false);go.transform.localPosition=position;
            var label=go.AddComponent<TextMeshPro>();label.font=UI.Font;label.text=text;label.fontSize=fontSize;
            label.color=new Color(.76f,.91f,.91f);label.alignment=TextAlignmentOptions.Center;label.rectTransform.sizeDelta=size;
            label.richText=false;label.textWrappingMode=TextWrappingModes.Normal;return label;
        }
        Light Fill(Transform parent,Vector3 position,Color color,float intensity,bool shadow=false)
        {
            var light=new GameObject("Interior fill").AddComponent<Light>();light.transform.SetParent(parent,false);light.transform.localPosition=position;
            light.type=LightType.Point;light.color=color;light.intensity=intensity;light.range=9;
            // 舱内主补光开软阴影做空间深度（每舱最多 2 盏阴影点光，cube shadowmap 有成本）
            light.shadows=shadow?LightShadows.Soft:LightShadows.None;if(shadow)light.shadowStrength=.8f;return light;
        }
        void SetNear(Place place)
        {
            labInterior.gameObject.SetActive(place==Place.Lab);
            var labProxy=Lab.Find("DistantInterior");if(labProxy)labProxy.gameObject.SetActive(place!=Place.Lab);
            Gallery.SetVisible(place==Place.Gallery);
            refereeInterior.gameObject.SetActive(place==Place.Referee);
            commentaryInterior.gameObject.SetActive(place==Place.Commentary);commentator.gameObject.SetActive(place==Place.Commentary);
            RefereeStation.Find("DistantInterior").gameObject.SetActive(place!=Place.Referee);
            CommentaryStation.Find("DistantInterior").gameObject.SetActive(place!=Place.Commentary);
            if(Stage.Venue.Referee)Stage.Venue.Referee.gameObject.SetActive(place==Place.Referee);
        }
        public void HomeView()
        {
            Stage.Lifts?.Cancel();
            if(Current!=Place.Home)homeSaved=Moving || Current!=Place.Arena?saved:Stage.CaptureView();
            if(journey!=null)StopCoroutine(journey);if(labRefresh!=null)StopCoroutine(labRefresh);journey=labRefresh=null;
            Moving=false;Transport.Cancel();if(transit)Destroy(transit.gameObject);
            Current=Place.Home;Stage.CameraDirected=true;Stage.Flight.SetActive(false);
            Stage.View.fieldOfView=42;Stage.View.transform.position=new Vector3(-14,12,-65);
            Stage.View.transform.LookAt(new Vector3(0,3,0));SetNear(Place.Home);
            Transport.HomeCut();
        }
        public void LeaveHome()
        { if(Current!=Place.Home)return;Current=Place.Arena;Stage.RestoreView(homeSaved);SetNear(Place.Arena); }
        public void Visit(Place destination)
        {
            if(Moving){Skip();return;}
            UI.Leave(()=>Begin(destination));
        }
        void Begin(Place destination)
        {
            Stage.Lifts?.Cancel();
            if(ctx.IsSpectating)ctx.ToggleSpectator();
            var departure=Stage.CaptureView();
            var origin=Current;
            // Home's close callback restores the match camera before we take its snapshot.
            if(Current==Place.Home)UI.CloseModal();
            changing=true;UI.CloseModal();changing=false;
            ctx.Hud.CloseMenu();ctx.Reader.Close();ctx.Commentary.Close();ctx.Hud.gameObject.SetActive(false);
            if(Current==Place.Arena)saved=Stage.CaptureView();
            if(labRefresh!=null){StopCoroutine(labRefresh);labRefresh=null;}
            Current=destination;GlassView=false;Stage.CameraDirected=true;Stage.Flight.SetActive(false);SetNear(Place.Arena);
            Stage.View.transform.SetPositionAndRotation(departure.position,departure.rotation);Stage.View.fieldOfView=departure.fov;
            transit=UI.Box(UI.Root,"Facility travel",470,788,660,72,new Color(.025f,.05f,.055f,.94f));
            UI.Button(transit,"自动通行 · 前往"+Name(destination)+" · 点击或 Esc 跳过",12,16,636,Skip);
            skip=false;Moving=true;journey=StartCoroutine(Travel(origin));
        }
        static string Name(Place p)=>p==Place.Arena?"赛场":p==Place.Lab?"实验站":p==Place.Referee?"裁判观察舱":p==Place.Gallery?"模型展馆":"解说转播舱";
        void Destination(out Vector3 position,out Quaternion rotation,out float fov)
        {
            if(Current==Place.Arena){position=saved.position;rotation=saved.rotation;fov=saved.fov;}
            else if(Current==Place.Gallery){Gallery.Overview(out position,out rotation,out fov);}
            else if(Current==Place.Lab){position=Lab.TransformPoint(new Vector3(-4.5f,3.5f,3.5f));rotation=Quaternion.LookRotation(Lab.TransformPoint(new Vector3(6,1.8f,-3))-position);fov=72;}
            else if(Current==Place.Referee){position=RefereeStation.TransformPoint(new Vector3(-1.25f,2.6f,-3.75f));rotation=Quaternion.LookRotation(RefereeStation.TransformPoint(new Vector3(-1.2f,1.9f,2.1f))-position);fov=63;}
            else{position=CommentaryStation.TransformPoint(GlassView?new Vector3(0,2.6f,-3.2f):new Vector3(0,2.75f,-3.8f));rotation=Quaternion.LookRotation(CommentaryStation.TransformPoint(GlassView?new Vector3(0,-14,0):new Vector3(.6f,1.85f,4.1f))-position);fov=GlassView?60:58;}
        }
        public void SetCommentaryView(bool glass)
        {
            if(Current!=Place.Commentary || Moving)return;
            GlassView=glass;Destination(out var position,out var rotation,out var fov);
            Stage.View.transform.SetPositionAndRotation(position,rotation);Stage.View.fieldOfView=fov;
        }
        IEnumerator Travel(Place origin)
        {
            Destination(out var to,out var facing,out var lens);
            yield return Transport.Ride(origin,Current,()=>skip,()=>
            {
                SetNear(Current);
                if(Current==Place.Arena)Stage.RestoreView(saved);
                else{Stage.View.transform.SetPositionAndRotation(to,facing);Stage.View.fieldOfView=lens;}
            });
            Moving=false;journey=null;if(transit)Destroy(transit.gameObject);
            if(Current==Place.Arena)ctx.Hud.gameObject.SetActive(true);else ShowPanel();
        }
        public void Skip(){skip=true;}
        public void ReturnToArena()
        {
            if(Current==Place.Home){UI.CloseModal();return;}
            if(Moving){Skip();return;}
            if(Current==Place.Arena)return;
            Begin(Place.Arena);
        }
        public void ShowPanel()
        {
            changing=true;UI.CloseModal();changing=false;
            var overlay=UI.Box(UI.Root,"Facility controls",0,0,1600,900);
            if(Current==Place.Gallery){UI.OpenSurface("facility",overlay,null,()=>{if(!changing)ReturnToArena();});Gallery.View.Show(overlay);return;}
            if(Current==Place.Commentary)
            {
                facilityPanel=UI.Box(overlay,"Commentary controls",260,780,1080,96,new Color(.016f,.032f,.039f,.94f));
                UI.Label(facilityPanel,"空中解说舱 · 像素屏同步赛况 · 透明地板下方为真实赛场",18,8,1044,28,18);
                UI.OpenSurface("facility",overlay,ReturnToArena,()=>{if(!changing)ReturnToArena();});
                UI.Button(facilityPanel,"打开解说面板",18,43,245,()=>ctx.Commentary.Open(),true);
                UI.Button(facilityPanel,GlassView?"返回解说席":"透过玻璃观赛",282,43,245,()=>{SetCommentaryView(!GlassView);ShowPanel();});
                UI.Button(facilityPanel,"前往裁判舱",546,43,245,()=>Visit(Place.Referee));
                UI.Button(facilityPanel,"返回赛场 · Esc",810,43,252,ReturnToArena);return;
            }
            var panel=UI.Box(overlay,"Facility panel",26,110,380,670,new Color(.016f,.032f,.039f,.94f));panel.GetComponent<UnityEngine.UI.Image>().raycastTarget=true;
            facilityPanel=panel;
            UI.Eyebrow(panel,Current==Place.Lab?"KEPLER / RESEARCH":"KEPLER / OBSERVATION",22,22,340);
            UI.Label(panel,Name(Current),22,58,336,55,29);
            UI.OpenSurface("facility",overlay,ReturnToArena,()=>{if(!changing)ReturnToArena();});
            UI.Button(panel,"返回赛场 · Esc",22,605,336,ReturnToArena);
            if(Current==Place.Lab)
            {
                UI.Label(panel,"中央观察台\n两侧实验舱用于观察不同配置。",22,130,336,86,20);
                var status=UI.Label(panel,"正在读取实验记录…",22,230,336,138,17);
                UI.Button(panel,"打开原生工作台",22,386,336,ctx.Workbench.Workbench,true);
                UI.Button(panel,"任务中心",22,440,336,ctx.Workbench.TaskCenter);
                UI.Label(panel,"工程、多阶段与扩展开发\n在此操作；切换界面不影响执行。",22,509,336,70,17);
                labRefresh=StartCoroutine(RefreshLab(status));
            }
            else
            {
                UI.Label(panel,"独立裁判席\n开赛与赛后简短裁定，其余时间安静观察。",22,132,336,120,20);
                UI.Button(panel,"前往解说舱 →",22,300,336,()=>Visit(Place.Commentary),true);
                UI.Label(panel,"当前比赛继续运行。\n返回时恢复离开前的镜头。",22,478,336,86,17);
            }
        }
        IEnumerator RefreshLab(TMP_Text status)
        {
            while(Current==Place.Lab && status)
            {
                string[] summaries={"工程实验：未连接","多阶段实验：未连接"};
                for(int i=0;i<2;i++)
                {
                    int index=i;string title=i==0?"工程实验":"多阶段实验";
                    yield return ctx.Transport.Json(i==0?"/api/engineering/runs":"/api/harness/runs","GET",null,result=>{
                        var rows=result as JArray;int count=rows?.Count??0;
                        int active=rows?.Count(r=>new[]{"running","queued","preparing","working","verifying"}.Contains((string)r["status"]))??0;
                        summaries[index]=title+"："+count+" 条记录"+(active>0?" · "+active+" 项运行中":" · 当前空闲");
                        labStatus[index].text=title+" / "+(active>0?"运行中":"待机");labLights[index].intensity=active>0?7:3;
                    },_=>{labStatus[index].text=title+" / 未连接";});
                    if(Current!=Place.Lab || !status)yield break;
                }
                status.text=string.Join("\n\n",summaries);yield return new WaitForSecondsRealtime(6);
            }
        }
        public void UpdateTaskSignals(JArray tasks)
        {
            for(int i=0;i<2;i++) {
                string kind=i==0?"engineering":"harness",name=i==0?"工程实验":"多阶段实验";
                bool active=tasks.Any(t=>(string)t["kind"]==kind && new[]{"running","preparing","grading","queued"}.Contains((string)t["status"]));
                labStatus[i].text=name+" / "+(active?"运行中":"待机");labLights[i].intensity=active?7:3;
            }
        }
        void LateUpdate()
        {
            if(ctx==null)return;
            PlaceBoothAvatar(Stage.Venue.Referee,RefereeStation,new Vector3(-1.65f,.04f,.8f));
            PlaceBoothAvatar(commentator,CommentaryStation,new Vector3(5.7f,.04f,4.05f));
            if(facilityPanel)facilityPanel.gameObject.SetActive(!ctx.Commentary.IsOpen);
            var state=ctx.Duel.Snapshot?.commentary;var entries=state?.entries;var last=entries!=null && entries.Length>0?entries[entries.Length-1]:null;
            Speaking=state?.enabled==true && last?.status=="working" && !string.IsNullOrEmpty(last.text);
            pulse=Stage.Motion>0?Mathf.MoveTowards(pulse,Speaking?1:0,Time.unscaledDeltaTime*ArenaTuning.PulseSpeed):(Speaking?1:0);
            pulseMaterial.SetColor("_EmissionColor",new Color(.7f,.91f,.78f)*(.25f+pulse*(.6f+.4f*Mathf.Sin(Stage.LightShow.Clock*5))));
            if(refereeInterior.gameObject.activeSelf)refereeName.text=Stage.Venue.Referee?Stage.Venue.Referee.State.Name:"规则裁判";
            if(commentaryInterior.gameObject.activeSelf)
            {
                onAir.text=Speaking?"解说中 / ON AIR":state?.enabled==true?"解说已连接":"解说待机";
                broadcastLight.intensity=9+pulse;
            }
            // A new round can recreate the referee while a remote room is open.
            if(Stage.Venue.Referee && Stage.Venue.Referee.gameObject.activeSelf!=RefereeInteriorActive)Stage.Venue.Referee.gameObject.SetActive(RefereeInteriorActive);
            bool show=!Moving && (Current==Place.Home || (Current==Place.Arena && !UI.Modal && !ctx.Hud.MenuOpen && !ctx.Reader.IsOpen && !ctx.Commentary.IsOpen));
            markers.gameObject.SetActive(show);if(!show)return;markers.SetAsLastSibling();
            Vector3[] positions={Lab.TransformPoint(new Vector3(0,6.8f,0)),RefereeStation.TransformPoint(new Vector3(0,6,0)),CommentaryStation.TransformPoint(new Vector3(0,6,0)),Gallery.transform.TransformPoint(new Vector3(0,7,0))};
            for(int i=0;i<positions.Length;i++)
            {
                var p=Stage.View.WorldToViewportPoint(positions[i]);
                bool visible=p.z>0 && (Current!=Place.Home || (p.x>.43f && p.x<.95f && p.y>.15f && p.y<.86f));
                markerButtons[i].gameObject.SetActive(visible);
                float x=Mathf.Clamp(p.x,.065f,.935f),y=Mathf.Clamp(p.y,.25f,.79f);
                // The overhead booth can project onto the question screen; keep its entry in the outer HUD margin.
                if(Current==Place.Arena && i==2){x=.935f;y=.85f;}
                markerButtons[i].anchoredPosition=new Vector2(x*1600-66,-(1-y)*900-25-i%2*42);
            }
        }
        void PlaceBoothAvatar(ArenaFighter actor,Transform facility,Vector3 position)
        {
            if(!actor)return;
            position.y+=actor.Chibi?.7f:0;var home=facility.TransformPoint(position);
            if((actor.Home-home).sqrMagnitude>.0001f)actor.SetHome(home);
        }
        void OnDestroy(){if(pulseMaterial)Destroy(pulseMaterial);}
    }
}
