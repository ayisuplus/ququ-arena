using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.Rendering;

namespace QuQu
{
    // Retains the shared presentation clock; scientific instruments replace the former light show.
    public class ArenaLightShow : MonoBehaviour
    {
        public float Clock { get; private set; }
        public int BeamCount => 0;
        public int HologramCount { get; private set; }
        public IReadOnlyList<Transform> SurveyMounts => surveyMounts;
        public IReadOnlyList<Transform> SurveyHeads => surveyHeads;
        public Transform InspectionCarriage => inspectionCarriage;
        public Transform InspectionProbe => inspectionProbe;
        public bool InspectionDocked { get; private set; }
        ArenaStage stage;
        readonly List<Object> owned = new List<Object>();
        readonly List<Material> displays = new List<Material>();
        readonly List<Transform> surveyMounts = new List<Transform>();
        readonly List<Transform> surveyHeads = new List<Transform>();
        Transform inspectionCarriage,inspectionProbe;
        Material silver, graphite, ceramic, markings, telemetry;
        TMP_Text contestants;
        float nextReadout;

        Material Metal(string name, Color color, float metal, float smooth, float emission=0)
        {
            var material=ArenaStage.Mat(color,metal,smooth,emission);material.name=name;owned.Add(material);return material;
        }
        // V28 Blender props replace the primitive assemblies. The imported Prop*
        // placeholder materials are remapped onto the graded materials above so the
        // grading table stays in one place; shadows come enabled from the importer.
        Transform Prop(string id,string name)
        {
            var prefab=Resources.Load<GameObject>("Art/PropsV28/"+id);
            if(!prefab)throw new System.InvalidOperationException("Missing V28 prop prefab Art/PropsV28/"+id+"; run ArenaPropsBuildV28.Build first");
            var root=Instantiate(prefab,transform,false);root.name=name;
            foreach(var renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                var material=renderer.sharedMaterial;if(!material)continue;
                if(material.name.Contains("Graphite"))renderer.sharedMaterial=graphite;
                else if(material.name.Contains("Ceramic"))renderer.sharedMaterial=ceramic;
                else if(material.name.Contains("Markings"))renderer.sharedMaterial=markings;
                else if(material.name.Contains("Silver"))renderer.sharedMaterial=silver;
            }
            return root.transform;
        }
        public void Create(ArenaStage owner, Transform architecture)
        {
            stage=owner;
            silver=Metal("Instrument alloy",new Color(.47f,.55f,.59f),.90f,.35f);
            graphite=Metal("Recessed data housing",new Color(.035f,.055f,.066f),.20f,.65f);
            ceramic=Metal("Instrument ceramic",new Color(.72f,.79f,.81f),.05f,.55f);
            markings=Metal("Frosted equipment markings",new Color(.48f,.65f,.66f),.10f,.30f,.12f);
            foreach(var renderer in architecture.GetComponentsInChildren<Renderer>())
            {
                var original=renderer.sharedMaterial;if(!original)continue;
                if(original.name=="GalaxyCyan" || original.name=="GalaxyViolet" || original.name=="Cyan trim")renderer.sharedMaterial=silver;
                else if(original.name=="Aisle lights" || original.name=="StationIce")renderer.sharedMaterial=markings;
            }
            CreateDataChannel();
            for(int side=-1;side<=1;side+=2)
            {
                var console=Prop("Console",side<0?"Match telemetry console":"Orbital field console");
                console.localPosition=new Vector3(side*8.3f,.38f,1.3f);
                console.localRotation=Quaternion.Euler(0,side*18,0);
                var panel=new GameObject("Suspended instrument glass").transform;panel.SetParent(console,false);
                panel.localPosition=new Vector3(0,2.7f,0);panel.localRotation=Quaternion.Euler(12,0,0);
                var material=DisplayMaterial(side<0?0:1);if(side<0)telemetry=material;
                Shape(panel,"Telemetry projection",PrimitiveType.Quad,Vector3.zero,new Vector3(3.65f,2.48f,1),material);
                Label(panel,side<0?"01 / DUEL TELEMETRY":"02 / ORBITAL OBSERVATION",new Vector3(0,1.00f,-.025f),new Vector2(3.25f,.38f),1.6f);
                Label(panel,side<0?"现场状态 / 比赛数据":"轨道示意 / 观测阵列",new Vector3(0,.69f,-.025f),new Vector2(3.25f,.34f),1.65f);
                Label(panel,side<0?"AUTHORITATIVE MATCH FEED":"FIELD VISUALIZATION",new Vector3(0,-1.02f,-.025f),new Vector2(3.25f,.20f),1.35f);
                if(side<0)contestants=Label(panel,"等待选手",new Vector3(0,-.63f,-.025f),new Vector2(3.18f,.48f),1.65f);
                HologramCount++;
                for(int row=0;row<2;row++)CreateSensor(new Vector3(side*(10.05f+row*.3f),.45f,4.3f+row*3.6f),side);
            }
            CreateInspectionRail();
            Update();
        }
        GameObject Shape(Transform parent,string name,PrimitiveType type,Vector3 pos,Vector3 scale,Material material,bool casts=false)
        {
            var go=ArenaStage.Shape(parent,name,type,pos,scale,material);
            var renderer=go.GetComponent<Renderer>();
            // 大件投影生根（casts=true），小件不投影防碎阴影噪点；接收全开让仪器落在地面上
            renderer.shadowCastingMode=casts?ShadowCastingMode.On:ShadowCastingMode.Off;
            renderer.receiveShadows=true;return go;
        }
        Material DisplayMaterial(int mode)
        {
            var material=new Material(Shader.Find("QuQu/Research Display"));
            material.SetFloat("_Mode",mode);displays.Add(material);owned.Add(material);return material;
        }
        void CreateSensor(Vector3 position,int side)
        {
            var root=Prop("SurveyInstrument","Optical survey instrument");
            root.localPosition=position;root.localRotation=Quaternion.Euler(0,-side*24,0);
            surveyMounts.Add(root.Find("Survey azimuth bearing"));
            surveyHeads.Add(root.Find("Survey azimuth bearing/Survey elevation head"));
        }
        void CreateInspectionRail()
        {
            var rail=Prop("InspectionRail","Supported corridor inspection rail");
            rail.localPosition=new Vector3(1.9f,0,11.5f);
            inspectionCarriage=rail.Find("Rail inspection carriage");
            inspectionProbe=rail.Find("Rail inspection carriage/Telescoping inspection probe");
        }
        void UpdateInstruments()
        {
            for(int i=0;i<surveyHeads.Count;i++)
            {
                float t=Mathf.Repeat(Clock+i*5.3f,28);
                float aim=t<8?Mathf.SmoothStep(0,1,t/8):t<14?1:t<22?1-Mathf.SmoothStep(0,1,(t-14)/8):0;
                float hold=t>=8 && t<14?(t-8)/6:t>=22?(t-22)/6:0;
                float fine=1.6f*Mathf.Sin(hold*Mathf.PI)*Mathf.Sin(hold*Mathf.PI*2);
                surveyMounts[i].localRotation=Quaternion.Euler(0,Mathf.Lerp(-32,32,aim),0);
                surveyHeads[i].localRotation=Quaternion.Euler(Mathf.Lerp(-8,9,aim)+fine,0,0);
            }
            float phase=Mathf.Repeat(Clock,24);
            InspectionDocked=phase<3 || (phase>=12 && phase<15);
            float travel=phase<3?0:phase<12?Mathf.SmoothStep(0,1,(phase-3)/9):phase<15?1:1-Mathf.SmoothStep(0,1,(phase-15)/9);
            inspectionCarriage.localPosition=new Vector3(0,0,Mathf.Lerp(-3,3,travel));
            float pause=phase<3?phase/3:phase>=12 && phase<15?(phase-12)/3:0;
            float extension=.18f*Mathf.Pow(Mathf.Sin(pause*Mathf.PI),2);
            inspectionProbe.localPosition=new Vector3(.25f+extension,.62f,0);
        }
        void CreateDataChannel()
        {
            const int segments=192;var vertices=new Vector3[(segments+1)*2];var uv=new Vector2[vertices.Length];var triangles=new int[segments*6];
            for(int i=0;i<=segments;i++)
            {
                float a=i*Mathf.PI*2/segments;
                for(int j=0;j<2;j++){float radius=6.68f+j*.14f;vertices[i*2+j]=new Vector3(Mathf.Sin(a)*radius,.036f,Mathf.Cos(a)*radius);uv[i*2+j]=new Vector2((float)i/segments,j);}
                if(i==segments)continue;int v=i*2,t=i*6;triangles[t]=v;triangles[t+1]=v+1;triangles[t+2]=v+2;triangles[t+3]=v+2;triangles[t+4]=v+1;triangles[t+5]=v+3;
            }
            var mesh=new Mesh{name="Embedded segmented data bus"};mesh.vertices=vertices;mesh.uv=uv;mesh.triangles=triangles;mesh.RecalculateBounds();owned.Add(mesh);
            var go=new GameObject("Embedded data channel",typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(transform,false);go.GetComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=go.GetComponent<MeshRenderer>();renderer.sharedMaterial=DisplayMaterial(2);renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
            // Discrete metal index tabs make the perimeter read as instrumentation, not a neon ring.
            for(int i=0;i<24;i++)
            {
                float a=i*Mathf.PI*2/24;var tab=Shape(transform,"Survey index",PrimitiveType.Cube,new Vector3(Mathf.Sin(a)*6.98f,.024f,Mathf.Cos(a)*6.98f),new Vector3(.075f,.035f,i%3==0?.3f:.14f),silver);
                tab.transform.localRotation=Quaternion.Euler(0,i*15,0);
            }
        }
        TMP_Text Label(Transform parent,string value,Vector3 position,Vector2 size,float fontSize)
        {
            var go=new GameObject(value);go.transform.SetParent(parent,false);go.transform.localPosition=position;
            var text=go.AddComponent<TextMeshPro>();text.font=Resources.Load<TMP_FontAsset>("ArenaFont");text.text=value;text.fontSize=fontSize;
            text.color=new Color(.7f,.85f,.85f);text.alignment=TextAlignmentOptions.Left;text.rectTransform.sizeDelta=size;
            text.richText=false;text.textWrappingMode=TextWrappingModes.NoWrap;text.overflowMode=TextOverflowModes.Ellipsis;text.renderer.shadowCastingMode=ShadowCastingMode.Off;return text;
        }
        void Update()
        {
            if(!stage)return;
            if(stage.Motion>0)Clock+=Time.unscaledDeltaTime*Mathf.Clamp01(stage.Motion);
            UpdateInstruments();
            foreach(var material in displays)material.SetFloat("_Clock",Clock);
            if(!contestants || Time.unscaledTime<nextReadout)return;nextReadout=Time.unscaledTime+.25f;
            var fighters=stage.Fighters;
            float a=fighters.Count>0?fighters[0].State.Health:0,b=fighters.Count>1?fighters[1].State.Health:0;
            telemetry.SetVector("_Levels",new Vector4(a/100,b/100,0,0));
            contestants.text=fighters.Count<2?"等待选手接入":fighters[0].State.Name+"  /  "+a.ToString("0")+" HP\n"+fighters[1].State.Name+"  /  "+b.ToString("0")+" HP";
        }
        void OnDestroy(){foreach(var asset in owned)if(asset)Destroy(asset);}
    }
}
