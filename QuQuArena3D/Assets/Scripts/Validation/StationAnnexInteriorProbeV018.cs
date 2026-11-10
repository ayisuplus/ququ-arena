using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

namespace QuQu
{
    // Opt-in physical checks. No probe object is created in normal game sessions.
    public sealed class StationAnnexInteriorProbeV018 : MonoBehaviour
    {
        [Serializable] public sealed class Waypoint { public string name; public float x,y,z; }
        [Serializable] public sealed class Building { public string id,root; public List<Waypoint> points; }
        [Serializable] public sealed class Routes { public List<Building> buildings; }
        [Serializable] sealed class Report
        {
            public string scene,building,segment,graphicsDevice;
            public float phase,distance,seconds;
            public Vector3 localPosition;
            public int transientGroundReferenceFrames;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> obstructions=new List<string>();
            public List<string> unsupportedSamples=new List<string>();
        }
        readonly Report report=new Report();
        string output,routesFile,filter;
        StationGrayboxWalker walker;
        StationRotatingRing ring;
        Transform frame;
        bool reached;
        Keyboard keyboard,priorKeyboard;

        public void Begin(string directory,string routePath,float phase,string building="")
        {
            if(!Path.IsPathRooted(directory)||!Path.IsPathRooted(routePath))throw new ArgumentException("Absolute paths required");
            output=directory;routesFile=routePath;report.phase=phase;filter=building;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"--station-annex-output");
            if(i<0||i+1>=args.Length)return;
            int r=Array.IndexOf(args,"--station-annex-routes"),p=Array.IndexOf(args,"--station-annex-phase"),b=Array.IndexOf(args,"--station-annex-building");
            if(r<0||r+1>=args.Length)throw new ArgumentException("Route manifest required");
            var probe=new GameObject("V018 annex physical validation").AddComponent<StationAnnexInteriorProbeV018>();
            probe.Begin(args[i+1],args[r+1],p<0?0:float.Parse(args[p+1],System.Globalization.CultureInfo.InvariantCulture),b<0?"":args[b+1]);
        }

        IEnumerator Start()
        {
            yield return null;yield return null;if(output==null)yield break;
            Directory.CreateDirectory(output);report.scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path;
            bool districts=report.scene.EndsWith("BlackHoleStationDistrictsV019.unity");
            Check("Supported annex or district candidate",districts||report.scene.EndsWith("BlackHoleStationAnnexInteriorsV018.unity"));
            report.graphicsDevice=SystemInfo.graphicsDeviceName;float started=Time.time;
            walker=FindFirstObjectByType<StationGrayboxWalker>();bool locked=walker.MovementLocked;walker.MovementLocked=true;
            int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            priorKeyboard=Keyboard.current;keyboard=InputSystem.AddDevice<Keyboard>();
            var routes=JsonUtility.FromJson<Routes>(File.ReadAllText(routesFile));
            var selected=routes.buildings.Where(b=>string.IsNullOrEmpty(filter)||b.id==filter).ToArray();Check("Requested routes exist",selected.Length>0);
            var ids=FindObjectsByType<StationGardenSeat>(FindObjectsSortMode.None).Where(s=>s.StableId.StartsWith("v018-")).Select(s=>s.StableId).ToArray();
            Check("New seat IDs unique",ids.Length==34&&ids.Distinct().Count()==ids.Length);
            if(districts)
            {
                var researchIds=FindObjectsByType<StationGardenSeat>(FindObjectsSortMode.None).Where(s=>s.StableId.StartsWith("v019-research-")).Select(s=>s.StableId).ToArray();
                Check("Research seat IDs unique",researchIds.Length==14&&researchIds.Distinct().Count()==14);
                if(selected.Any(b=>b.id=="Reading"))
                {
                    var readingIds=FindObjectsByType<StationGardenSeat>(FindObjectsSortMode.None).Where(s=>s.StableId.StartsWith("v019-reading-")).Select(s=>s.StableId).ToArray();
                    Check("Reading seat IDs unique",readingIds.Length==12&&readingIds.Distinct().Count()==12);
                }
                if(selected.Any(b=>b.id=="Cafe"))
                {
                    var cafeIds=FindObjectsByType<StationGardenSeat>(FindObjectsSortMode.None).Where(s=>s.StableId.StartsWith("v019-cafe-")).Select(s=>s.StableId).ToArray();
                    Check("Cafe seat IDs unique",cafeIds.Length==16&&cafeIds.Distinct().Count()==16);
                }
                if(selected.Any(b=>b.id=="Homes"))
                {
                    var homesIds=FindObjectsByType<StationGardenSeat>(FindObjectsSortMode.None).Where(s=>s.StableId.StartsWith("v019-homes-")).Select(s=>s.StableId).ToArray();
                    Check("Homes seat IDs unique",homesIds.Length==12&&homesIds.Distinct().Count()==12);
                }
            }
            foreach(var building in selected)
            {
                report.building=building.id;frame=GameObject.Find(building.root).transform;ring=frame.GetComponentInParent<StationRotatingRing>();
                ring.transform.rotation=Quaternion.Euler(0,report.phase,0);Check(building.id+" ring remains enabled",ring.enabled);
                var start=building.points[0];Teleport(new Vector3(start.x,start.y,start.z));yield return Hold(2.2f);
                foreach(var door in frame.GetComponentsInChildren<StationConservatoryDoor>())Check(door.name+" starts closed",!door.IsOpen);
                bool routeComplete=true;
                foreach(var point in building.points.Skip(1))
                {
                    yield return Move(point);if(!reached){routeComplete=false;break;}
                }
                Check(building.id+" complete continuous route",routeComplete);yield return Hold(2.5f);
                if(routeComplete)foreach(var door in frame.GetComponentsInChildren<StationConservatoryDoor>())Check(door.name+" closes after exit",!door.IsOpen);
                if(routeComplete)
                {
                    foreach(var seat in frame.GetComponentsInChildren<StationGardenSeat>().Where(s=>s.StableId.StartsWith("v018-")||s.StableId.StartsWith("v019-research-")||s.StableId.StartsWith("v019-reading-")||s.StableId.StartsWith("v019-cafe-")||s.StableId.StartsWith("v019-homes-")))
                    {
                        var local=StandingPoint(seat,building.points,out var anchor,out bool found);Check(seat.StableId+" clear supported approach exists",found);if(!found)continue;
                        Teleport(new Vector3(anchor.x,anchor.y,anchor.z));yield return Hold(.5f);
                        yield return Move(new Waypoint{name=seat.StableId+" continuous approach",x=local.x,y=local.y,z=local.z});if(!reached)continue;
                        yield return Hold(.5f);var standing=walker.transform.position;var standingLocal=frame.InverseTransformPoint(standing);
                        var standingViewPosition=walker.View.transform.localPosition;var standingViewRotation=walker.View.transform.localRotation;
                        Check(seat.StableId+" standing spot grounded",walker.GroundRing==ring&&Mathf.Abs(frame.InverseTransformPoint(standing).y-local.y)<.18f);
                        Check(seat.StableId+" nearest seat",(bool)typeof(StationGardenSeat).GetMethod("IsNearest",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance).Invoke(seat,null));
                        InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.E));yield return null;yield return new WaitForEndOfFrame();InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;
                        Check(seat.StableId+" seated via E",seat.IsSeated&&!walker.enabled);
                        yield return new WaitForSeconds(.6f);
                        Check(seat.StableId+" seated view follows ring",Vector3.Distance(walker.View.transform.position,seat.transform.position+Vector3.up*1.25f)<.025f);
                        Check(seat.StableId+" stands",seat.Stand()&&!seat.IsSeated&&walker.enabled&&Vector3.Distance(frame.InverseTransformPoint(walker.transform.position),standingLocal)<.03f&&Vector3.Distance(walker.View.transform.localPosition,standingViewPosition)<.01f&&Quaternion.Angle(walker.View.transform.localRotation,standingViewRotation)<.1f);
                    }
                }
                Save("progress");
            }
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed)&&report.obstructions.Count==0;Save("route");
            walker.MovementLocked=locked;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            InputSystem.RemoveDevice(keyboard);if(priorKeyboard!=null)priorKeyboard.MakeCurrent();
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }

        void Teleport(Vector3 local)
        {
            var body=walker.GetComponent<CharacterController>();body.enabled=false;walker.transform.position=frame.TransformPoint(local+Vector3.up*.09f);body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();
        }
        IEnumerator Hold(float seconds)
        {
            float until=Time.time+seconds;while(Time.time<until){walker.MoveOnGround(Vector3.zero,Time.deltaTime);yield return null;}
        }
        IEnumerator Move(Waypoint point)
        {
            report.segment=point.name;float until=Time.time+18,stalled=0;bool supported=true,clear=true;
            while(Time.time<until)
            {
                var target=frame.TransformPoint(new Vector3(point.x,point.y,point.z));var delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.10f)break;
                var before=walker.transform.position;walker.MoveOnGround(delta.normalized*Mathf.Min(2.6f,delta.magnitude/Time.deltaTime),Time.deltaTime);
                float moved=Vector3.Distance(before,walker.transform.position);report.distance+=moved;stalled=moved<.002f?stalled+Time.deltaTime:0;
                bool floor=Supported(walker.transform.position);
                if(!floor&&report.unsupportedSamples.Count<32){var p=frame.InverseTransformPoint(walker.transform.position);var h=Physics.RaycastAll(walker.transform.position+Vector3.up*.25f,Vector3.down,2,~0,QueryTriggerInteraction.Ignore).Where(h=>h.normal.y>.65f).OrderBy(h=>h.distance).FirstOrDefault();report.unsupportedSamples.Add(point.name+" "+p.ToString("F4")+" grounded="+walker.GetComponent<CharacterController>().isGrounded+" ring="+(walker.GroundRing?walker.GroundRing.RingId:"none")+" below="+(h.collider?h.collider.name:"none")+" depth="+(h.distance-.25f).ToString("F4"));}
                supported&=floor;if(floor&&walker.GroundRing!=ring)report.transientGroundReferenceFrames++;
                foreach(var c in Physics.OverlapCapsule(walker.transform.position+Vector3.up*.49f,walker.transform.position+Vector3.up*1.50f,.28f,~0,QueryTriggerInteraction.Ignore))
                    if(c.GetComponentInParent<StationGrayboxWalker>()!=walker){clear=false;if(!report.obstructions.Contains(c.name))report.obstructions.Add(c.name);}
                if(stalled>2)break;yield return null;
            }
            var local=frame.InverseTransformPoint(walker.transform.position);report.localPosition=local;float gap=new Vector2(local.x-point.x,local.z-point.z).magnitude;
            reached=gap<.15f;Check(point.name+" reached",reached,gap);Check(point.name+" floor",supported&&Mathf.Abs(local.y-point.y)<.20f,local.y-point.y);Check(point.name+" body clearance",clear);
            Save("progress");
        }
        bool Supported(Vector3 position)
        {
            var body=walker.GetComponent<CharacterController>();float closest=float.MaxValue;Collider support=null;
            foreach(var h in Physics.RaycastAll(position+Vector3.up*.25f,Vector3.down,.25f+body.stepOffset+body.skinWidth,~0,QueryTriggerInteraction.Ignore))
                if(h.collider!=body&&h.normal.y>.65f&&h.distance<closest){closest=h.distance;support=h.collider;}
            if(support==null)
            {
                float radius=body.radius-body.skinWidth;
                foreach(var h in Physics.SphereCastAll(position+Vector3.up*radius,radius,Vector3.down,.25f+body.skinWidth,~0,QueryTriggerInteraction.Ignore))
                    if(h.collider!=body&&h.normal.y>.65f&&h.distance<closest){closest=h.distance;support=h.collider;}
            }
            return support&&support.GetComponentInParent<StationRotatingRing>()==ring;
        }
        Vector3 StandingPoint(StationGardenSeat seat,List<Waypoint> points,out Waypoint anchor,out bool found)
        {
            var all=FindObjectsByType<StationGardenSeat>(FindObjectsSortMode.None);
            foreach(var offset in new[]{new Vector3(0,0,-1.10f),new Vector3(0,0,1.10f),new Vector3(.95f,0,0),new Vector3(-.95f,0,0),new Vector3(.8f,0,-.6f),new Vector3(-.8f,0,-.6f)})
            {
                var spot=seat.transform.TransformPoint(offset)-Vector3.up*.03f;var feet=spot+Vector3.up*.09f;
                if(!Supported(feet))continue;
                if(Physics.OverlapCapsule(feet+Vector3.up*.49f,feet+Vector3.up*1.50f,.28f,~0,QueryTriggerInteraction.Ignore).Any(c=>c.GetComponentInParent<StationGrayboxWalker>()!=walker))continue;
                float distance=(feet-seat.transform.position).sqrMagnitude;
                if(all.Any(s=>s!=seat&&s.Walker==walker&&(feet-s.transform.position).sqrMagnitude<distance))continue;
                foreach(var point in points.Where(p=>Mathf.Abs(p.y-frame.InverseTransformPoint(spot).y)<.12f).OrderBy(p=>Vector3.Distance(spot,frame.TransformPoint(new Vector3(p.x,p.y,p.z)))))
                {
                    var start=frame.TransformPoint(new Vector3(point.x,point.y,point.z))+Vector3.up*.09f;var direction=feet-start;
                    if(Physics.CapsuleCastAll(start+Vector3.up*.49f,start+Vector3.up*1.50f,.28f,direction.normalized,direction.magnitude,~0,QueryTriggerInteraction.Ignore).Any(h=>h.collider.GetComponentInParent<StationGrayboxWalker>()!=walker))continue;
                    anchor=point;found=true;return frame.InverseTransformPoint(spot);
                }
            }
            anchor=null;found=false;return Vector3.zero;
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(output,name+".json"),JsonUtility.ToJson(report,true));
    }
}
