using System.Collections.Generic;
using UnityEngine;

namespace QuQu
{
    // Decorative architecture and the official never enter the combat roster.
    public class ArenaVenue : MonoBehaviour
    {
        public ArenaFighter Referee { get; private set; }
        public int SeatCount { get; private set; }
        public string JudgeId { get; private set; }
        readonly List<Object> owned = new List<Object>();
        readonly Dictionary<Material,List<CombineInstance>> batches = new Dictionary<Material,List<CombineInstance>>();
        // V29: Blender seating units (production/props-v29/build_seats.py) replace the
        // primitive cube behind every combine instance. The Radial layout, the five
        // material batches and the 104 seat count are untouched — only the mesh and
        // the grade it resolves to are new.
        readonly Dictionary<string,List<UnitPart>> units = new Dictionary<string,List<UnitPart>>();
        struct UnitPart { public Mesh mesh; public Material material; public Matrix4x4 transform; }
        public Transform JudgeSeat { get; private set; }
        Material stone, marble, gold, velvet, light;
        Material Material(string name, Color color, float metal, float smooth, float emission = 0)
        {
            var m=ArenaStage.Mat(color,emission);m.name=name;m.SetFloat("_Metallic",metal);m.SetFloat("_Smoothness",smooth);owned.Add(m);return m;
        }
        // Blender's Prop* placeholders select the graded material, so the grading
        // table keeps living here and nowhere else — same discipline as the V28 props.
        Material Grade(Material placeholder)
        {
            string name=placeholder?placeholder.name:"";
            if(name.Contains("Titanium"))return stone;
            if(name.Contains("Alloy"))return marble;
            if(name.Contains("Trim"))return gold;
            if(name.Contains("Velvet"))return velvet;
            if(name.Contains("Light"))return light;
            throw new System.InvalidOperationException("Unmapped V29 seating material: "+name);
        }
        List<UnitPart> Unit(string id)
        {
            if(units.TryGetValue(id,out var cached))return cached;
            var prefab=Resources.Load<GameObject>("Art/PropsV29/"+id);
            if(!prefab)throw new System.InvalidOperationException("Missing V29 seating prefab Art/PropsV29/"+id+"; run ArenaPropsBuildV29.Build first");
            var parts=new List<UnitPart>();
            foreach(var filter in prefab.GetComponentsInChildren<MeshFilter>(true))
            {
                var renderer=filter.GetComponent<Renderer>();
                parts.Add(new UnitPart { mesh=filter.sharedMesh,material=Grade(renderer?renderer.sharedMaterial:null),transform=prefab.transform.worldToLocalMatrix*filter.transform.localToWorldMatrix });
            }
            if(parts.Count==0)throw new System.InvalidOperationException("V29 seating prefab "+id+" carries no meshes");
            units[id]=parts;return parts;
        }
        void Block(Material material, Mesh mesh, Matrix4x4 local, Vector3 position, Vector3 size, float yaw=0)
        {
            if(!batches.TryGetValue(material,out var items))batches[material]=items=new List<CombineInstance>();
            items.Add(new CombineInstance { mesh=mesh,transform=Matrix4x4.TRS(position,Quaternion.Euler(0,yaw,0),size)*local });
        }
        static Vector3 Radial(float radius,float angle,float height)=>new Vector3(Mathf.Sin(angle*Mathf.Deg2Rad)*radius,height,Mathf.Cos(angle*Mathf.Deg2Rad)*radius);
        // Every piece keeps its exact runtime TRS, which is why the units are built
        // around the same pivots: 1x1x1 primitives for the pieces the runtime scales,
        // and a fixed-scale seat whose origin sits on the tier surface.
        void RadialUnit(string id,float radius,float angle,float height,Vector3 size)
        {
            foreach(var part in Unit(id))Block(part.material,part.mesh,part.transform,Radial(radius,angle,height),size,angle);
        }
        public void Create()
        {
            // Same grading table as B1: titanium .90/.35, brushed metal .78/.45, coated trim/lights .10/.30.
            // Seat fabric stays dielectric (0/.18) — velvet must never pick up skybox reflections.
            stone=Material("Titanium gallery",new Color(.72f,.76f,.79f),.90f,.35f);
            marble=Material("Brushed alloy",new Color(.82f,.85f,.88f),.78f,.45f);
            // Prefixed on purpose: ArenaLightShow normalises materials over the whole
            // scenery subtree by exact name, and "Cyan trim"/"Aisle lights" are two of
            // the names it claims — unprefixed, the gallery's trim and aisle strips came
            // back wearing the instrument silver and frosted markings instead.
            gold=Material("Gallery cyan trim",new Color(.16f,.55f,.68f),.10f,.30f,.18f);
            velvet=Material("Graphite seat cushions",new Color(.18f,.22f,.24f),0,.18f);
            light=Material("Gallery aisle lights",new Color(.30f,.60f,.85f),.10f,.30f,.8f);
            // Four banks leave a broad central approach to the referee and open side aisles.
            foreach(int side in new[]{-1,1})
            {
                Gallery(side,24,54,6);Gallery(side,69,102,7);
                for(int step=0;step<12;step++)
                {
                    float radius=7.95f+step*.27f,top=.08f+step*.15f;
                    RadialUnit("ApproachStep",radius,side*61.5f,top/2-.10f,new Vector3(.95f,top+.2f,.29f));
                    RadialUnit("AisleLight",radius-.11f,side*61.5f,top+.008f,new Vector3(.78f,.018f,.025f));
                }
            }
            foreach(var batch in batches)
            {
                // Bevelled seating units push the merged tiers past the 16-bit index
                // ceiling (65 535 vertices); without this CombineMeshes silently truncates.
                var mesh=new Mesh { name=batch.Key.name };mesh.indexFormat=UnityEngine.Rendering.IndexFormat.UInt32;mesh.CombineMeshes(batch.Value.ToArray());owned.Add(mesh);
                var part=new GameObject(batch.Key.name,typeof(MeshFilter),typeof(MeshRenderer));part.transform.SetParent(transform,false);
                part.GetComponent<MeshFilter>().sharedMesh=mesh;part.GetComponent<MeshRenderer>().sharedMaterial=batch.Key;
            }
            batches.Clear();
            SetJudge(null);
        }
        void Gallery(int side,float start,float end,int seats)
        {
            for(int row=0;row<4;row++)
            {
                float radius=8.15f+row*.81f,top=.16f+row*.48f;
                int pieces=Mathf.CeilToInt((end-start)*Mathf.Deg2Rad*radius/.45f);
                for(int p=0;p<pieces;p++)
                {
                    float angle=side*Mathf.Lerp(start,end,(p+.5f)/pieces),width=radius*(end-start)*Mathf.Deg2Rad/pieces+.03f;
                    RadialUnit("TierRiser",radius,angle,(top-.6f)/2,new Vector3(width,top+.6f,.85f));
                    RadialUnit("StepLip",radius-.38f,angle,top-.025f,new Vector3(width,.10f,.08f));
                    if(row==3){RadialUnit("WallPanel",radius+.4f,angle,top+.4f,new Vector3(width,.8f,.12f));RadialUnit("TrimBar",radius+.4f,angle,top+.82f,new Vector3(width,.05f,.18f));}
                }
                for(int i=0;i<seats;i++)
                {
                    float angle=side*Mathf.Lerp(start+3,end-3,(i+.5f)/seats);
                    // One Blender seat replaces the five stacked cubes. Its origin sits
                    // on the tier surface (the old plinth centre was top+.18 of a .36
                    // tall block), so the pivot is top, and scale stays 1 — the seat is
                    // furniture now, not a box the runtime stretches.
                    RadialUnit("Seat",radius,angle,top,Vector3.one);
                    SeatCount++;
                }
            }
        }
        public void SetJudge(ModelInfo model)
        {
            string id=model?.id ?? "";if(Referee && JudgeId==id)return;JudgeId=id;
            if(Referee){Referee.gameObject.SetActive(false);Destroy(Referee.gameObject);}
            var preset=ArenaModelPresets.Match(id,model?.name);
            var go=new GameObject("Referee avatar");go.transform.SetParent(transform,false);Referee=go.AddComponent<ArenaFighter>();
            Referee.Create(new ModelInfo{id="referee:"+id,name=model?.name ?? "规则裁判"},new AvatarPreference {presetId=preset?.Id ?? "",style=0,color=preset?.Color ?? "#D8C18C",scale=.9f},JudgeSeat ? JudgeSeat.position : new Vector3(24,11,18));
            Referee.ShowNameplate=false;Referee.Motion=0;

        }
        public void PlaceJudge(Transform seat)
        {
            JudgeSeat=seat; if(Referee)Referee.SetHome(seat.position);
        }
        void OnDestroy(){foreach(var asset in owned)if(asset)Destroy(asset);}
    }
}
