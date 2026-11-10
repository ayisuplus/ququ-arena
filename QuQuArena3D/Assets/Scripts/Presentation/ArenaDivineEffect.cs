using System.Collections.Generic;
using UnityEngine;

namespace QuQu
{
    public sealed class ArenaDivineEffect : MonoBehaviour
    {
        Material ink, core;
        Transform seal, impact;
        Light radiance;
        LineRenderer beam, thread;
        readonly List<LineRenderer> sealLines=new List<LineRenderer>(), impactLines=new List<LineRenderer>();
        int family;
        public static ArenaDivineEffect Create(ArenaFighter owner,int variant)
        {
            var root=new GameObject("Divine invocation"); root.transform.SetParent(owner.BodyRoot,false);
            var fx=root.AddComponent<ArenaDivineEffect>();
            int family=System.Array.FindIndex(ArenaModelPresets.All,p=>p.Id==owner.Look.presetId);
            if(family<0) family=variant%6;
            fx.Initialize(owner.Tint,family); return fx;
        }
        void Initialize(Color color,int style)
        {
            family=style;
            Color.RGBToHSV(color,out float hue,out float saturation,out float value);
            var spellColor=Color.HSVToRGB(hue,Mathf.Max(.62f,saturation),1)*1.65f; spellColor.a=1;
            ink=new Material(Shader.Find("QuQu/Astral Light")); ink.SetColor("_BaseColor",spellColor);
            core=new Material(ink); core.SetColor("_BaseColor",Color.Lerp(color,Color.white,.8f)*1.8f);
            seal=new GameObject("Invocation seal").transform; seal.SetParent(transform,false);
            Circle(seal,1,.018f,96,sealLines); Circle(seal,.88f,.011f,96,sealLines);
            int corners=family==1?6:family==3?3:family==4?5:8;
            var polygon=new Vector3[corners];
            for(int i=0;i<corners;i++) { float a=i*Mathf.PI*2/corners; polygon[i]=new Vector3(Mathf.Cos(a),Mathf.Sin(a),0)*.73f; }
            sealLines.Add(Line(seal,polygon,.023f,true));
            for(int i=0;i<12;i++)
            {
                float a=i*Mathf.PI/6;
                var d=new Vector3(Mathf.Cos(a),Mathf.Sin(a),0);
                sealLines.Add(Line(seal,new[]{d*.92f,d*1.06f},.025f));
            }
            if(family==3 || family==5) Circle(seal,.46f,.018f,64,sealLines);
            impact=new GameObject("Aegis and shockwave").transform; impact.SetParent(transform,false);
            Circle(impact,1,.045f,96,impactLines); Circle(impact,.8f,.016f,64,impactLines);
            beam=Line(transform,new Vector3[41],.11f); thread=Line(transform,new Vector3[41],.025f); thread.sharedMaterial=core;
            radiance=new GameObject("Invocation light").AddComponent<Light>(); radiance.transform.SetParent(transform,false);
            radiance.type=LightType.Point; radiance.color=color; radiance.range=5;
            SetAlpha(sealLines,0); SetAlpha(impactLines,0); beam.enabled=thread.enabled=false;
        }
        LineRenderer Line(Transform parent,Vector3[] points,float width,bool loop=false)
        {
            var go=new GameObject("Astral stroke"); go.transform.SetParent(parent,false);
            var line=go.AddComponent<LineRenderer>(); line.useWorldSpace=false; line.loop=loop; line.positionCount=points.Length;
            line.SetPositions(points); line.startWidth=line.endWidth=width; line.sharedMaterial=ink; line.numCapVertices=3;
            return line;
        }
        void Circle(Transform parent,float radius,float width,int count,List<LineRenderer> list)
        {
            var points=new Vector3[count]; for(int i=0;i<count;i++) { float a=i*Mathf.PI*2/count; points[i]=new Vector3(Mathf.Cos(a),Mathf.Sin(a),0)*radius; }
            list.Add(Line(parent,points,width,true));
        }
        static void SetAlpha(List<LineRenderer> lines,float alpha)
        { foreach(var l in lines) l.startColor=l.endColor=new Color(1,1,1,alpha); }
        public void Show(Vector3 from,Vector3 target,float charge,float flight,float fade,bool blocked)
        {
            var direction=(target-from).normalized;
            seal.position=from-direction*.12f; seal.rotation=Quaternion.LookRotation(direction)*Quaternion.Euler(0,0,charge*32);
            seal.localScale=Vector3.one*Mathf.Lerp(.15f,1.15f,charge);
            SetAlpha(sealLines,charge*(1-fade));
            radiance.transform.position=from; radiance.intensity=charge*(1-fade)*5;
            beam.enabled=thread.enabled=flight>0 && fade<1;
            float length=Vector3.Distance(from,target);
            var up=Vector3.Cross(direction,Vector3.right).normalized;
            if(up.sqrMagnitude<.1f) up=Vector3.up;
            var side=Vector3.Cross(direction,up);
            for(int i=0;i<41;i++)
            {
                float t=i/40f; float along=Mathf.Lerp(Mathf.Max(0,flight-.30f),flight,t);
                Vector3 p=Vector3.Lerp(from,target,along);
                float shape=Mathf.Sin(t*Mathf.PI);
                if(family==2 || family==3) p+=(up*Mathf.Sin(along*18)+side*Mathf.Cos(along*18))*shape*.27f;
                else if(family==4) p+=up*Mathf.Sin(t*Mathf.PI)*.7f;
                else if(family==1) p+=side*(i%2==0?.05f:-.05f)*shape;
                beam.SetPosition(i,transform.InverseTransformPoint(p)); thread.SetPosition(i,transform.InverseTransformPoint(p));
            }
            beam.startColor=beam.endColor=new Color(1,1,1,(1-fade)*.8f);
            thread.startColor=thread.endColor=new Color(1,1,1,1-fade);
            impact.position=target-direction*.25f; impact.rotation=Quaternion.LookRotation(direction);
            impact.localScale=Vector3.one*(blocked?1.0f+fade*.2f:.25f+fade*2.4f);
            SetAlpha(impactLines,flight>=1 ? (1-fade)*(blocked?1:.85f):0);
        }
        void OnDestroy() { if(ink)Destroy(ink); if(core)Destroy(core); }
    }
}
