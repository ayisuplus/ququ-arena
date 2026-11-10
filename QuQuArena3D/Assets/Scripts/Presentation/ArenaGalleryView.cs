using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace QuQu
{
    public sealed class ArenaGalleryView : MonoBehaviour
    {
        public ArenaGalleryActor Selected { get; private set; }
        public float Distance { get; private set; }=5;
        public float Yaw { get; private set; }
        public float Pitch { get; private set; }=10;
        IStationContext ctx; // P3：站点上下文接口，不再持门面具体类型
        ArenaGallery gallery;
        TMP_Text caption,activity,instructions;
        RectTransform panel;
        bool arrived;
        float settle;
        Vector2 pressed;
        bool dragging;
        bool inputCheck;
        public void Initialize(IStationContext owner,ArenaGallery facility)
        {ctx=owner;gallery=facility;inputCheck=System.Array.IndexOf(System.Environment.GetCommandLineArgs(),"--arena-gallery-input-check")>=0;}
        public void Show(Transform overlay)
        {
            arrived=true;
            panel=ctx.UI.Box(overlay,"Gallery controls",26,105,280,690,new Color(.018f,.033f,.043f,.94f));
            panel.GetComponent<UnityEngine.UI.Image>().raycastTarget=true;
            ctx.UI.Eyebrow(panel,"KEPLER / MODEL GALLERY",20,22,250);
            caption=ctx.UI.Label(panel,"角色观测舱",20,64,240,45,27);
            activity=ctx.UI.Label(panel,"六位角色 · 自主漫游",20,116,240,70,17);
            for(int i=0;i<gallery.Actors.Count;i++)
            {
                var actor=gallery.Actors[i];ctx.UI.Button(panel,actor.Preset.Name,20,212+i*49,240,()=>Select(actor));
            }
            instructions=ctx.UI.Label(panel,"点击角色或名单，近距离欣赏。",20,524,240,75,17);
            ctx.UI.Button(panel,"返回全馆",20,604,240,Overview);
            ctx.UI.Button(panel,"返回赛场",20,650,240,()=>ctx.Stations.ReturnToArena());
            ctx.UI.SetBack(Back);
        }
        public void Select(ArenaGalleryActor actor)
        {
            if(!arrived || !gallery.Visible)return;
            if(Selected)Selected.Inspect(false);
            Selected=actor;actor.Inspect(true);Yaw=actor.transform.eulerAngles.y;Pitch=10;Distance=5;settle=0;
            // Pick a clear initial view when a resident is standing next to a terminal or window.
            var focus=actor.transform.position+Vector3.up*actor.Height*.55f;float originalYaw=Yaw,bestClearance=0;
            foreach(float offset in new[]{0,30f,-30,60,-60,90,-90,120,-120,150,-150,180})
            {
                float candidate=originalYaw+offset;var direction=Quaternion.Euler(-Pitch,candidate,0)*Vector3.forward;
                float clearance=Physics.SphereCast(focus,.22f,direction,out var hit,Distance,1<<28,QueryTriggerInteraction.Ignore)?hit.distance:Distance;
                if(clearance>bestClearance){bestClearance=clearance;Yaw=candidate;}
                if(clearance>=Distance)break;
            }
            actor.FaceObserver(Yaw);
            caption.text=actor.Preset.Name;activity.text=actor.Preset.Description;
            instructions.text="拖动：环绕与俯仰\n滚轮：缩放 · Esc：返回全馆";
        }
        public void Back(){if(Selected)Overview();else ctx.Stations.ReturnToArena();}
        public void Overview()
        {
            if(Selected)Selected.Inspect(false);Selected=null;settle=0;
            if(caption)caption.text="角色观测舱";if(activity)activity.text="六位角色 · 自主漫游";
            if(instructions)instructions.text="点击角色或名单，近距离欣赏。";
        }
        public void Leave(){Overview();arrived=false;dragging=false;}
        public void Orbit(float dx,float dy,float zoom)
        {Yaw+=dx;Pitch=Mathf.Clamp(Pitch+dy,-12,55);Distance=Mathf.Clamp(Distance-zoom,.9f,8);}
        void Update()
        {
            if(!Application.isFocused || !arrived || !gallery.Visible || ctx.Stations.Moving || ctx.UI.ConfirmationOpen)return;
            var mouse=Mouse.current;if(mouse==null)return;
            bool over=EventSystem.current && EventSystem.current.IsPointerOverGameObject();
            if(inputCheck && (mouse.scroll.ReadValue().y!=0 || mouse.leftButton.wasReleasedThisFrame))
                Debug.Log("Gallery input: wheel="+mouse.scroll.ReadValue().y+" mode="+InputSystem.settings.scrollDeltaBehavior+" overUI="+over+" selected="+(Selected?Selected.Preset.Id:"none")+" distance="+Distance);
            if(mouse.leftButton.wasPressedThisFrame && !over){pressed=mouse.position.ReadValue();dragging=true;}
            if(Selected && dragging && mouse.leftButton.isPressed)
            {var delta=mouse.delta.ReadValue();Orbit(delta.x*.3f,-delta.y*.22f,0);}
            if(Selected && !over)
            {
                // Current Input System normalizes one wheel notch to 1 instead of Windows' 120.
                float step=InputSystem.settings.scrollDeltaBehavior==InputSettings.ScrollDeltaBehavior.UniformAcrossAllPlatforms?.48f:.004f;
                Orbit(0,0,mouse.scroll.ReadValue().y*step);
            }
            if(mouse.leftButton.wasReleasedThisFrame)
            {
                if(dragging && !over && Vector2.Distance(pressed,mouse.position.ReadValue())<5)
                {
                    var ray=ctx.Stage.View.ScreenPointToRay(mouse.position.ReadValue());
                    foreach(var hit in Physics.RaycastAll(ray,100,~0,QueryTriggerInteraction.Collide).OrderBy(h=>h.distance))
                    {
                        var actor=hit.collider.GetComponent<ArenaGalleryActor>();if(actor){Select(actor);break;}
                        if(hit.collider.gameObject.layer==28)break;
                    }
                }
                dragging=false;
            }
        }
        void LateUpdate()
        {
            if(!arrived || !gallery.Visible || ctx.Stations.Moving)return;
            gallery.Overview(out var position,out var rotation,out var fov);
            if(Selected)
            {
                var body=Selected.transform.position+Vector3.up*Selected.Height*.55f;
                var focus=Vector3.Lerp(body,Selected.FaceFocus,Mathf.SmoothStep(0,1,Mathf.InverseLerp(4,1.7f,Distance)));
                var direction=Quaternion.Euler(-Pitch,Yaw,0)*Vector3.forward;
                position=focus+direction*Distance;
                if(Physics.SphereCast(focus,.22f,direction,out var hit,Distance,1<<28,QueryTriggerInteraction.Ignore))position=focus+direction*Mathf.Max(.45f,hit.distance-.08f);
                rotation=Quaternion.LookRotation(focus-position);fov=42;
            }
            // Preserve camera ownership within the facility; never change the arena's saved view.
            var camera=ctx.Stage.View;settle+=Time.unscaledDeltaTime;
            float blend=settle>.7f?1:1-Mathf.Exp(-Time.unscaledDeltaTime*10);
            camera.transform.SetPositionAndRotation(Vector3.Lerp(camera.transform.position,position,blend),Quaternion.Slerp(camera.transform.rotation,rotation,blend));
            camera.fieldOfView=Mathf.Lerp(camera.fieldOfView,fov,blend);
        }
    }
}
