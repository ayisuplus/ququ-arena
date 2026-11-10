using System;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.Rendering;

namespace QuQu
{
    // A small presentation-only monitor. It never reads the incoming competition snapshot.
    public sealed class ArenaPixelBroadcast : MonoBehaviour
    {
        const int Width=240,Height=135;
        const int DrawX=12,DrawY=24,DrawWidth=216,DrawHeight=88;
        public int Revision { get; private set; }
        public uint PixelHash { get; private set; }
        public int ShownRound { get; private set; }
        public string ShownPhase { get; private set; } = "ready";
        public bool HasMatch { get; private set; }
        public float LeftHealth => health[0];
        public float RightHealth => health[1];
        public float LeftScore => scores[0];
        public float RightScore => scores[1];
        public bool LeftSlapping => slapping[0];
        public bool RightSlapping => slapping[1];
        public float AnimationClock { get; private set; }
        IStationContext ctx; // P3：站点上下文接口，不再持门面具体类型
        Texture2D texture;
        Material material;
        readonly Color32[] pixels=new Color32[Width*Height],background=new Color32[Width*Height];
        readonly Color32[] update=new Color32[DrawWidth*DrawHeight];
        readonly float[] health={-1,-1},scores={-1,-1},hitUntil={0,0};
        readonly bool[] slapping=new bool[2],celebrating=new bool[2];
        readonly string[] ids=new string[2];
        readonly Color[] colors=new Color[2];
        readonly TMP_Text[] labels=new TMP_Text[2];
        TMP_Text heading,footer;
        string duelId;
        float nextRefresh;
        bool previous;
        static readonly Color32 Dark=new Color32(12,23,28,255),Ink=new Color32(25,46,51,255),Silver=new Color32(137,172,175,255),Paper=new Color32(207,220,216,255);

        public void Initialize(IStationContext owner,Transform surfaceParent,Vector3 localPosition,Vector2 size,Quaternion localRotation)
        {
            ctx=owner;name="Commentary pixel broadcast";transform.SetParent(surfaceParent,false);
            transform.localPosition=localPosition;transform.localRotation=localRotation;
            texture=new Texture2D(Width,Height,TextureFormat.RGBA32,false){name="Pixel broadcast framebuffer 240x135",filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp};
            material=new Material(Shader.Find("Universal Render Pipeline/Unlit")){name="Pixel broadcast unlit"};
            material.SetTexture("_BaseMap",texture);material.SetColor("_BaseColor",new Color(.82f,.82f,.82f,1));
            var surface=GameObject.CreatePrimitive(PrimitiveType.Quad);surface.name="Pixel broadcast screen";
            surface.transform.SetParent(transform,false);surface.transform.localScale=new Vector3(size.x,size.y,1);Destroy(surface.GetComponent<Collider>());
            var renderer=surface.GetComponent<Renderer>();renderer.sharedMaterial=material;renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
            heading=Label("Pixel broadcast phase",new Vector2(0,size.y*.405f),new Vector2(size.x*.92f,size.y*.13f),size.y*.75f);
            footer=Label("Pixel broadcast score",new Vector2(0,-size.y*.405f),new Vector2(size.x*.92f,size.y*.13f),size.y*.75f);
            for(int i=0;i<2;i++)labels[i]=Label("Pixel contestant "+i,new Vector2((i==0?-.25f:.25f)*size.x,size.y*.30f),new Vector2(size.x*.45f,size.y*.11f),size.y*.675f);
            Rect(0,0,Width,Height,Dark);Rect(2,2,Width-4,Height-4,Ink);Rect(4,4,Width-8,Height-8,Dark);
            Rect(8,116,224,1,Silver);Rect(8,22,224,1,Ink);Rect(20,26,200,2,Silver);
            for(int x=22;x<220;x+=12)Rect(x,24,6,1,Ink);
            Array.Copy(pixels,background,pixels.Length);
            texture.SetPixels32(background);texture.Apply(false,false);
            if(isActiveAndEnabled)Refresh();
        }
        TMP_Text Label(string title,Vector2 position,Vector2 size,float fontSize)
        {
            var go=new GameObject(title);go.transform.SetParent(transform,false);go.transform.localPosition=new Vector3(position.x,position.y,-.008f);
            var text=go.AddComponent<TextMeshPro>();text.font=ctx.UI.Font;text.fontSize=fontSize;text.color=Paper;text.alignment=TextAlignmentOptions.Center;
            text.rectTransform.sizeDelta=size;text.richText=false;text.enableAutoSizing=false;text.textWrappingMode=TextWrappingModes.NoWrap;text.overflowMode=TextOverflowModes.Ellipsis;
            text.renderer.shadowCastingMode=ShadowCastingMode.Off;text.renderer.receiveShadows=false;return text;
        }
        void OnEnable(){previous=false;nextRefresh=0;hitUntil[0]=hitUntil[1]=0;}
        void LateUpdate()
        {
            if(ctx==null || !texture)return;
            if(ctx.Stage.Motion>0)AnimationClock+=Time.unscaledDeltaTime*Mathf.Clamp01(ctx.Stage.Motion);
            if(Time.unscaledTime<nextRefresh)return;nextRefresh=Time.unscaledTime+.125f;Refresh();
        }
        void Refresh()
        {
            var duel=ctx.Duel;var round=duel?duel.Round:null;var fighters=ctx.Stage.Fighters;
            HasMatch=duel && round!=null && !string.IsNullOrEmpty(duel.DuelId) && fighters.Count==2;
            ShownRound=HasMatch?round.index:0;ShownPhase=HasMatch?duel.PresentedPhase:"ready";
            bool result=HasMatch && round.settled && !duel.Presenting && (ShownPhase=="result" || ShownPhase=="completed" || ShownPhase=="intermission" || ShownPhase=="waiting");
            for(int i=0;i<2;i++)
            {
                int slot=ctx.Preferences.mirrorPanels?1-i:i;var fighter=HasMatch?fighters[slot]:null;float hp=fighter?Mathf.Clamp(fighter.State.Health,0,100):-1;
                if(!previous || !fighter || ids[i]!=fighter.State.Id || duelId!=duel.DuelId || ShownPhase!="clash")hitUntil[i]=0;
                if(previous && fighter && ids[i]==fighter.State.Id && duelId==duel.DuelId && hp<health[i]-.001f && ShownPhase=="clash" && ctx.Stage.Motion>0)hitUntil[i]=AnimationClock+.5f;
                health[i]=hp;ids[i]=fighter?fighter.State.Id:null;colors[i]=fighter?Color.Lerp(fighter.Tint,Color.white,.12f):new Color(.30f,.39f,.41f);
                slapping[i]=fighter && fighter.Slapping;celebrating[i]=fighter && fighter.Celebrating;
                var record=result?round.records?.FirstOrDefault(r=>r!=null && r.model==ids[i]):null;
                scores[i]=record!=null && string.IsNullOrEmpty(record.error)?(float)record.score*100:-1;
                labels[i].text=fighter?fighter.State.Name+"  "+hp.ToString("0.#")+" HP":"等待选手";labels[i].color=colors[i];
            }
            duelId=HasMatch?duel.DuelId:null;previous=HasMatch;
            heading.text=HasMatch?(round.overtime?"加赛 ":"第 ")+ShownRound+" 题  ·  "+Phase(ShownPhase):"像素转播 · 等待比赛";
            footer.text=result?"本题评分  "+Score(scores[0])+"  :  "+Score(scores[1]):HasMatch?"生命值  "+health[0].ToString("0.#")+"  :  "+health[1].ToString("0.#"):"赛场开始后同步呈现";
            Draw();
        }
        static string Score(float value)=>value<0?"—":value.ToString("0.#")+"%";
        static string Phase(string value)=>value switch {"solving"=>"正在作答","judging"=>"等待判分","clash"=>"掌击交锋","result"=>"本题结果","completed"=>"已结算","waiting"=>"等待继续","intermission"=>"场间休息",_=>"准备"};
        void Draw()
        {
            for(int row=0;row<DrawHeight;row++)Array.Copy(background,(DrawY+row)*Width+DrawX,pixels,(DrawY+row)*Width+DrawX,DrawWidth);
            for(int i=0;i<2;i++)
            {
                int x=i==0?14:136;Rect(x,99,90,6,Ink);if(HasMatch)Rect(x,100,Mathf.RoundToInt(Mathf.Clamp01(health[i]/100)*88),4,colors[i]);
                Actor(i,i==0?94:146,i==0?1:-1);
            }
            if(HasMatch && (ShownPhase=="solving" || ShownPhase=="judging"))
            {
                int tick=(int)(AnimationClock*3)%3;
                for(int i=0;i<3;i++)Rect(113+i*6,88,3,3,ShownPhase=="judging" || i==tick?Silver:Ink);
                if(ShownPhase=="judging"){Rect(117,78,7,2,Silver);Rect(120,76,2,6,Silver);}
            }
            for(int row=0;row<DrawHeight;row++)Array.Copy(pixels,(DrawY+row)*Width+DrawX,update,row*DrawWidth,DrawWidth);
            uint hash=2166136261;
            unchecked{foreach(var p in update){hash=(hash^p.r)*16777619;hash=(hash^p.g)*16777619;hash=(hash^p.b)*16777619;}}
            if(Revision>0 && hash==PixelHash)return;
            texture.SetPixels32(DrawX,DrawY,DrawWidth,DrawHeight,update);texture.Apply(false,false);PixelHash=hash;Revision++;
        }
        void Actor(int index,int x,int direction)
        {
            bool hit=AnimationClock<hitUntil[index];
            int bob=HasMatch && (ShownPhase=="solving" || celebrating[index])?((int)(AnimationClock*2)%2):0;
            int y=28+bob;Color32 suit=colors[index],trim=Color.Lerp(colors[index],Color.black,.42f),skin=new Color32(190,201,190,255);
            if(hit)x-=direction*2;
            Rect(x-11,26,22,2,Ink);Rect(x-8,y,6,10,trim);Rect(x+2,y,6,10,trim);
            Rect(x-10,y,8,3,Silver);Rect(x+2,y,8,3,Silver);Rect(x-9,y+10,18,24,suit);Rect(x-2,y+13,4,18,Paper);
            Rect(x-11,y+33,22,21,trim);Rect(x-8,y+34,16,16,skin);Rect(x-9,y+47,18,6,trim);
            Rect(x-4+direction*2,y+41,2,2,Dark);Rect(x+3+direction*2,y+41,2,2,Dark);Rect(x+direction*3,y+36,3,1,Dark);
            if(slapping[index])
            {
                Line(x+direction*8,y+26,x+direction*22,y+31,suit,4);
                Line(x+direction*22,y+31,x+direction*39,y+42,skin,3);Rect(x+direction*39-3,y+40,6,6,skin);
                Line(x-direction*9,y+27,x-direction*13,y+16,suit,4);
            }
            else if(celebrating[index])
            {
                Line(x-9,y+28,x-16,y+43,suit,4);Line(x+9,y+28,x+16,y+43,suit,4);
                Rect(x-18,y+42,5,5,skin);Rect(x+14,y+42,5,5,skin);
            }
            else
            {
                Rect(x-13,y+15,4,16,suit);Rect(x+9,y+15,4,16,suit);Rect(x-13,y+12,4,5,skin);Rect(x+9,y+12,4,5,skin);
            }
            if(hit)
            {
                int cheek=x-direction*12;Line(cheek-5,y+48,cheek+5,y+38,Paper,2);Line(cheek-5,y+38,cheek+5,y+48,Paper,2);
                Rect(cheek-1,y+36,2,14,Paper);
            }
            if(celebrating[index]){Rect(x-8,y+58,16,3,Silver);Rect(x-8,y+59,3,5,Silver);Rect(x-1,y+59,3,7,Silver);Rect(x+5,y+59,3,5,Silver);}
        }
        void Rect(int x,int y,int width,int height,Color32 color)
        {
            for(int row=Mathf.Max(0,y);row<Mathf.Min(Height,y+height);row++)
                for(int column=Mathf.Max(0,x);column<Mathf.Min(Width,x+width);column++)pixels[row*Width+column]=color;
        }
        void Line(int x,int y,int toX,int toY,Color32 color,int thickness)
        {
            int steps=Mathf.Max(Mathf.Abs(toX-x),Mathf.Abs(toY-y));
            for(int i=0;i<=steps;i++){float t=steps==0?0:(float)i/steps;Rect(Mathf.RoundToInt(Mathf.Lerp(x,toX,t))-thickness/2,Mathf.RoundToInt(Mathf.Lerp(y,toY,t))-thickness/2,thickness,thickness,color);}
        }
        void OnDestroy(){if(texture)Destroy(texture);if(material)Destroy(material);}
    }
}
