using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.Rendering;

namespace QuQu
{
    // The official desk follows presented events, never predicts the backend's queued result.
    public sealed class ArenaRefereeBoard : MonoBehaviour
    {
        public string LastAnnouncement { get; private set; }
        public int AnnouncementCount { get; private set; }
        IStationContext ctx; // P3：站点上下文接口，不再持门面具体类型
        Transform board;
        Material material;
        TMP_Text status,contestants,toastText;
        RectTransform toast;
        float hideAt,nextRefresh;
        readonly HashSet<string> announced=new HashSet<string>();
        public void Initialize(IStationContext owner,Transform surfaceParent,Vector3 localPosition,Vector2 size,Quaternion localRotation)
        {
            ctx=owner;
            board=new GameObject("Official status screen").transform;board.SetParent(surfaceParent,false);
            board.localPosition=localPosition;board.localRotation=localRotation;
            material=new Material(Shader.Find("Universal Render Pipeline/Unlit")){name="Referee status screen"};
            material.SetColor("_BaseColor",new Color(.012f,.032f,.038f));
            var surface=GameObject.CreatePrimitive(PrimitiveType.Quad);surface.transform.SetParent(board,false);
            surface.transform.localScale=new Vector3(size.x,size.y,1);Destroy(surface.GetComponent<Collider>());
            var renderer=surface.GetComponent<Renderer>();renderer.sharedMaterial=material;renderer.shadowCastingMode=ShadowCastingMode.Off;
            Label("OFFICIAL / 裁判观察席",size.y*.35f,size.x*.9f,.45f,3.1f);
            status=Label("等待比赛",.15f,size.x*.9f,1,3.3f);
            contestants=Label("",-size.y*.30f,size.x*.9f,.7f,2.4f);
            toast=ctx.UI.Box(ctx.UI.Root,"Official announcement",470,92,660,64,new Color(.025f,.05f,.055f,.95f));
            toastText=ctx.UI.Label(toast,"",16,8,628,48,22);toastText.alignment=TextAlignmentOptions.Center;
            toast.gameObject.SetActive(false);
            ctx.Duel.PresentedEvent+=Presented;ctx.Duel.PresentationReset+=Reset;
        }
        TMP_Text Label(string value,float y,float width,float height,float size)
        {
            var label=new GameObject("Referee screen label").AddComponent<TextMeshPro>();label.transform.SetParent(board,false);
            label.transform.localPosition=new Vector3(0,y,-.01f);label.font=ctx.UI.Font;label.text=value;label.fontSize=size;
            label.color=new Color(.76f,.91f,.87f);label.alignment=TextAlignmentOptions.Center;label.richText=false;
            label.rectTransform.sizeDelta=new Vector2(width,height);label.textWrappingMode=TextWrappingModes.Normal;
            label.renderer.shadowCastingMode=ShadowCastingMode.Off;return label;
        }
        void Presented(CompetitionEvent e)
        {
            string key=null,text=null;
            if(e.type=="duel-start") {key=e.competitionId+"/start/"+e.duelId;text="裁判：比赛开始";}
            else if(e.type=="duel-end" && !string.IsNullOrEmpty(e.winner))
            {key=e.competitionId+"/finish/"+e.duelId;text="裁定："+ctx.Duel.Name(e.winner)+" 获胜";}
            else if(e.type=="competition-end" && !string.IsNullOrEmpty(e.winner))
            {
                key=e.competitionId+(ctx.Duel.Snapshot.duels.Length==1?"/finish/"+ctx.Duel.DuelId:"/champion");
                text="赛后裁定：冠军 "+ctx.Duel.Name(e.winner);
            }
            // Operational errors and pending scores are not rule violations.
            if(key==null || !announced.Add(key))return;
            LastAnnouncement=text;AnnouncementCount++;toastText.text=text;hideAt=Time.unscaledTime+3;
            toast.gameObject.SetActive(true);toast.SetAsLastSibling();
        }
        void Reset(){if(toast)toast.gameObject.SetActive(false);nextRefresh=0;}
        void LateUpdate()
        {
            if(ctx==null)return;
            if(toast.gameObject.activeSelf && Time.unscaledTime>=hideAt)toast.gameObject.SetActive(false);
            if(!board.gameObject.activeInHierarchy || Time.unscaledTime<nextRefresh)return;nextRefresh=Time.unscaledTime+.2f;
            status.text=ctx.Duel.Phase;
            contestants.text=string.Join("     /     ",ctx.Stage.Fighters.Select(f=>f.State.Name+"  "+f.State.Health.ToString("0.#")+" HP"));
        }
        void OnDestroy()
        {
            if(ctx!=null && ctx.Duel){ctx.Duel.PresentedEvent-=Presented;ctx.Duel.PresentationReset-=Reset;}
            if(board)Destroy(board.gameObject);if(toast)Destroy(toast.gameObject);if(material)Destroy(material);
        }
    }
}
