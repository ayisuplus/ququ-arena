using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Exercises real presentation mechanics with fixture identities; this is not backend match proof.
    public sealed class StationRingArenaSafetyProbe : MonoBehaviour
    {
        [Serializable] public sealed class Result
        {
            public string scene, segment, scope="Original presentation coroutines, safety geometry and walker; fixture contestants, no backend result authority";
            public float phase, seconds;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> collisions=new List<string>();
        }
        public string OutputDirectory;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        StationArenaSafety safety;
        ArenaDuelPlatforms rig;
        StationRotatingRing inner;
        ArenaFighter[] fighters;
        Collider[] barriers;
        Result report;
        float started;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-arena-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var p=new GameObject("V015 arena safety validation").AddComponent<StationRingArenaSafetyProbe>();p.OutputDirectory=args[at+1];
            int phase=Array.IndexOf(args,"--station-arena-probe-phase");
            if(phase>=0 && phase+1<args.Length)p.Phase=float.Parse(args[phase+1],System.Globalization.CultureInfo.InvariantCulture);
        }
        IEnumerator Start()
        {
            yield return null;yield return null;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,phase=Phase};
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Real candidate required");
            Directory.CreateDirectory(OutputDirectory);started=Time.time;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            safety=FindFirstObjectByType<StationArenaSafety>();rig=safety.Rig;walker=safety.Walker;body=walker.GetComponent<CharacterController>();walker.MovementLocked=true;
            var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            foreach(var r in rings)r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-Phase:Phase,0);
            inner=rings.Single(r=>r.RingId=="v015-r1");
            barriers=FindObjectsByType<Collider>(FindObjectsInactive.Include,FindObjectsSortMode.None).Where(c=>
                c.name.StartsWith("V015 controlled well guard") || c.name.StartsWith("V015 fixed arena rim guard") ||
                c.name.StartsWith("V015 moving arena rim guard") || c.name.StartsWith("V015 lift shaft guard") ||
                safety.Gates.Any(g=>c.transform.IsChildOf(g.Panel.transform))).ToArray();
            Check("normal time scale",Mathf.Approximately(Time.timeScale,1));Check("eight wired gates",safety.Gates.Length==8);
            MakeFighters();rig.Bind(fighters[0],fighters[1]);Place(new Vector3(50,0,8));safety.Refresh();
            Check("parked four closed gates",safety.Gates.Count(g=>g.Panel.activeSelf)==4);
            Capture("parked",new Vector3(48,9,15),new Vector3(33,0,0));
            foreach(float sign in new[]{-1f,1f})
            {
                yield return Press("lift inner "+sign,new Vector3(sign*39.95f,0,0),Vector3.right*sign);
                yield return Press("lift outer "+sign,new Vector3(sign*44.05f,0,0),Vector3.left*sign);
                yield return Press("lift front "+sign,new Vector3(sign*42,0,2.05f),Vector3.back);
                yield return Press("lift back "+sign,new Vector3(sign*42,0,-2.05f),Vector3.forward);
                foreach(float x in new[]{39.95f,44.05f})foreach(float z in new[]{-2.05f,2.05f})
                    yield return Press("lift corner "+sign+" "+x+" "+z,new Vector3(sign*x,0,z),new Vector3(sign*(42-x),0,-z).normalized);
                yield return Press("parked well "+sign,new Vector3(sign*25.13f,0,0),Vector3.left*sign);
            }
            Place(new Vector3(26.5f,0,0));yield return null;
            bool entered=false;var entrance=StartCoroutine(Complete(rig.Enter(),()=>entered=true));
            yield return new WaitForSeconds(.5f);
            Check("occupied stage pauses entrance",safety.MotionBlocked && rig.Phase=="lift" && Mathf.Abs(Local(rig.Lifts[0]).y+12.125f)<.01f);
            yield return Walk("leave stage through two supported gates",new Vector3(37,0,0));
            yield return Walk("clear parked board",new Vector3(38,0,4));
            yield return Observe("ordinary entrance",()=>entered,entrance);
            Check("combat six closed gates",safety.Gates.Count(g=>g.Panel.activeSelf)==6);
            yield return Combat();
            yield return Press("raised fixed rim",new Vector3(36.18f,0,0),Vector3.left);
            yield return Press("raised well",new Vector3(25.13f,12,0),Vector3.left);
            yield return Press("raised moving rim",new Vector3(35.80f,12,0),Vector3.right);
            Place(new Vector3(38.5f,0,0));yield return Walk("open lift gate boarding",new Vector3(42,0,0));
            bool returned=false;var returning=StartCoroutine(Complete(rig.ReturnBoth(),()=>returned=true));
            float parkedHeight=Local(rig.Ring).y;yield return new WaitForSeconds(.5f);
            Check("occupied lift pauses return",safety.MotionBlocked && Mathf.Abs(Local(rig.Ring).y-parkedHeight)<.01f);
            yield return Walk("leave lift through supported gate",new Vector3(38,0,0));
            yield return Walk("clear lift route",new Vector3(38,0,4));
            yield return Observe("ordinary return",()=>returned,returning);rig.ResetAfterExit();safety.Refresh();
            Check("ordinary dock reset",rig.Phase=="docked" && safety.Gates.Count(g=>g.Panel.activeSelf)==4 && rig.Boards.All(b=>b.activeSelf));
            foreach(int winner in new[]{0,1})
            {
                foreach(var fighter in fighters)fighter.gameObject.SetActive(true);
                rig.Bind(fighters[0],fighters[1]);Place(new Vector3(50,0,8));
                yield return Run("champion entrance "+winner,rig.Enter());yield return Combat();
                yield return Run("champion drop "+winner,rig.RemoveLoserForChampionship(fighters[winner].State.Id));
                Check("exactly loser board removed "+winner,rig.Removals==1 && rig.Boards[winner].activeSelf && !rig.Boards[1-winner].activeSelf);
                Check("loser exited shaft "+winner,!fighters[1-winner].gameObject.activeSelf);
                yield return Run("champion award "+winner,rig.ChampionAward());
                Check("award relative position "+winner,Vector3.Distance(Local(rig.Trophy),new Vector3(winner==0?-1.6f:1.6f,19.5f,0))<.01f);
                yield return Run("idempotent settled drop "+winner,rig.RemoveLoserForChampionship(fighters[winner].State.Id));
                Check("one removal after replay "+winner,rig.Removals==1);
                yield return Run("champion return "+winner,rig.ReturnWinner());rig.ResetAfterExit();
                Check("champion dock reset "+winner,rig.Phase=="docked" && rig.Boards.All(b=>b.activeSelf) && !rig.Trophy.gameObject.activeSelf);
            }
            rig.RestoreSnapshot(fighters[0],fighters[1],true);yield return null;yield return Combat();
            yield return Run("restored combat return",rig.ReturnBoth());rig.ResetAfterExit();
            // Same original mechanics also retain the legacy, stationary world-coordinate contract.
            inner.enabled=false;inner.transform.rotation=Quaternion.identity;rig.MovementFrame=null;Place(new Vector3(50,0,8));
            foreach(var fighter in fighters)fighter.gameObject.SetActive(true);rig.Bind(fighters[0],fighters[1]);
            yield return Run("legacy stationary entrance",rig.Enter());
            Check("legacy world coordinates",Vector3.Distance(fighters[0].transform.position,new Vector3(-1.6f,12.09f,0))<.02f);
            yield return Run("legacy stationary return",rig.ReturnBoth());rig.ResetAfterExit();rig.MovementFrame=inner.transform;inner.enabled=true;
            var owner=new GameObject("Fixture presentation owner");var live=owner.AddComponent<ArenaStationLiveMatch>();live.enabled=false;owner.GetComponent<ArenaConnection>().enabled=false;
            var flags=System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic;
            var owned=(ArenaFighter[])typeof(ArenaStationLiveMatch).GetField("fighters",flags).GetValue(live);
            var retained=new ArenaFighter[2];for(int i=0;i<2;i++){retained[i]=new GameObject("Owned frame fighter").AddComponent<ArenaFighter>();retained[i].transform.SetParent(inner.transform);owned[i]=retained[i];}
            var prize=new GameObject("Owned frame trophy");prize.transform.SetParent(inner.transform);typeof(ArenaStationLiveMatch).GetField("ownedTrophy",flags).SetValue(live,prize);
            Destroy(owner);yield return null;yield return null;
            Check("destroy presenter cleans frame fighters",retained.All(f=>!f));Check("destroy presenter cleans frame trophy",!prize);
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("arena");
            walker.MovementLocked=false;
            foreach(var fighter in fighters)Destroy(fighter.gameObject);Destroy(rig.Trophy.gameObject);rig.Trophy=null;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        void MakeFighters()
        {
            fighters=new ArenaFighter[2];
            for(int i=0;i<2;i++)
            {
                fighters[i]=new GameObject("Safety fixture contestant "+i).AddComponent<ArenaFighter>();
                fighters[i].Create(new ModelInfo{id="safety:"+i,name="机构验证选手"+i},new AvatarPreference{style=0,color=i==0?"#70CFED":"#EFAB77",scale=1},rig.WorldPosition(new Vector3(i==0?-42:42,-11.91f,0)));
            }
            rig.Trophy=Instantiate(Resources.Load<GameObject>("Art/PropsV29/Trophy"),inner.transform).transform;
            foreach(var collider in rig.Trophy.GetComponentsInChildren<Collider>())Destroy(collider);
            rig.Trophy.gameObject.SetActive(false);
        }
        Vector3 Local(Transform t)=>inner.transform.InverseTransformPoint(t.position);
        void Place(Vector3 p)
        {body.enabled=false;walker.transform.position=inner.transform.TransformPoint(p)+Vector3.up*.08f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        void Step(Vector3 target)
        {var d=inner.transform.TransformPoint(target)-walker.transform.position;d.y=0;walker.MoveOnGround(d.normalized*Mathf.Min(4,d.magnitude/Time.deltaTime),Time.deltaTime);}
        IEnumerator Walk(string label,Vector3 target)
        {
            report.segment=label;float end=Time.time+12;bool supported=true;
            while(Time.time<end)
            {var p=Local(walker.transform);p.y=target.y;if(Vector3.Distance(p,target)<.1f)break;Step(target);supported&=walker.GroundRing==inner && Mathf.Abs(Local(walker.transform).y-target.y)<.3f;yield return null;}
            var gap=Local(walker.transform)-target;gap.y=0;Check(label+" reached",gap.magnitude<.15f,gap.magnitude);Check(label+" supported",supported);Save("progress");
        }
        IEnumerator Press(string label,Vector3 edge,Vector3 outward)
        {
            report.segment=label;Place(edge-outward*.9f);float end=Time.time+.8f,worst=-100,minY=100,maxY=-100;
            while(Time.time<end){Step(edge+outward*2);var p=Local(walker.transform);worst=Mathf.Max(worst,Vector3.Dot(p-edge,outward));minY=Mathf.Min(minY,p.y);maxY=Mathf.Max(maxY,p.y);yield return null;}
            Check(label+" reached barrier",Vector3.Dot(Local(walker.transform)-edge,outward)>-.65f);
            Check(label+" blocks fall",worst<-.2f,worst);Check(label+" retains floor",minY>edge.y-.1f && maxY<edge.y+.3f);Save("progress");
        }
        IEnumerator Combat()
        {
            Check("combat phase",rig.Phase=="combat");var rotation=inner.transform.rotation;yield return new WaitForSeconds(.4f);
            Capture("raised",new Vector3(48,20,22),new Vector3(30,10,0));
            for(int i=0;i<2;i++)
            {
                Check("combat position "+i,Vector3.Distance(Local(fighters[i].transform),new Vector3(i==0?-1.6f:1.6f,12.09f,0))<.02f);
                var expected=inner.transform.rotation*Quaternion.Euler(0,(i==0?90:-90)-fighters[i].StanceAngle,0);
                Check("combat facing "+i,Quaternion.Angle(expected,fighters[i].transform.rotation)<.2f);
            }
            Check("combat frame continues rotating",Mathf.Abs(Mathf.DeltaAngle(rotation.eulerAngles.y,inner.transform.eulerAngles.y))>.01f);
            int impacts=0;yield return fighters[0].SlapResolved(fighters[1],(p,c,b)=>impacts++);
            Check("existing resolved slap fires once",impacts==1);
        }
        IEnumerator Complete(IEnumerator sequence,Action done){yield return sequence;done();}
        IEnumerator Run(string label,IEnumerator sequence)
        {bool done=false;var active=StartCoroutine(Complete(sequence,()=>done=true));yield return Observe(label,()=>done,active);}
        IEnumerator Observe(string label,Func<bool> done,Coroutine active)
        {
            report.segment=label;float end=Time.time+35;bool clear=true,aligned=true;
            while(!done() && Time.time<end)
            {
                Physics.SyncTransforms();
                foreach(var f in fighters.Where(f=>f.gameObject.activeSelf))
                    foreach(var c in Physics.OverlapCapsule(f.transform.position+Vector3.up*.4f,f.transform.position+Vector3.up*1.65f,.26f,~0,QueryTriggerInteraction.Ignore))
                        if(barriers.Contains(c)){clear=false;if(!report.collisions.Contains(c.transform.parent.name+"/"+c.name))report.collisions.Add(c.transform.parent.name+"/"+c.name);}
                if(rig.Phase=="transport" || rig.Phase=="raising")for(int i=0;i<2;i++)
                    aligned&=Vector3.Distance(fighters[i].transform.position,rig.Boards[i].transform.position+Vector3.up*.15f)<.025f;
                yield return null;
            }
            Check(label+" completed",done());Check(label+" no guard collision",clear);Check(label+" actor remains on board",aligned);Save("progress");
            if(!done()){StopCoroutine(active);report.seconds=Time.time-started;report.passed=false;Save("arena");if(!Application.isEditor)Application.Quit(1);throw new InvalidOperationException(label+" timed out");}
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
        void Capture(string name,Vector3 position,Vector3 target)
        {
            var path=Path.Combine(OutputDirectory,name+".png");if(!Application.isEditor || File.Exists(path))return;
            var go=new GameObject("Temporary arena evidence camera");var camera=go.AddComponent<Camera>();camera.CopyFrom(walker.View);camera.enabled=false;
            camera.transform.position=inner.transform.TransformPoint(position);camera.transform.LookAt(inner.transform.TransformPoint(target));camera.farClipPlane=1800;camera.fieldOfView=65;
            go.AddComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>().renderPostProcessing=true;
            var rt=new RenderTexture(1600,1000,24);camera.targetTexture=rt;var previous=RenderTexture.active;Texture2D image=null;
            try{camera.Render();RenderTexture.active=rt;image=new Texture2D(1600,1000,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1600,1000),0,0);image.Apply();File.WriteAllBytes(path,image.EncodeToPNG());}
            finally{RenderTexture.active=previous;camera.targetTexture=null;rt.Release();Destroy(rt);if(image)Destroy(image);Destroy(go);}
        }
    }
}
