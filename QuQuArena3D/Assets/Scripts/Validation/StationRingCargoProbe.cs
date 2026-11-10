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
    public sealed class StationRingCargoProbe : MonoBehaviour
    {
        [Serializable] public sealed class States { public StationDockCargoState[] cargo; }
        [Serializable] public sealed class Result
        {
            public string scene,stage,segment;
            public float phase,seconds,distance;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> blockages=new List<string>();
        }
        public string OutputDirectory,LegacyPath,ResumePath;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        StationDockCargoService[] cargo;
        Keyboard keyboard,priorKeyboard;
        Result report;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();
            string Arg(string name){int at=Array.IndexOf(args,name);return at>=0 && at+1<args.Length?args[at+1]:null;}
            string path=Arg("--station-cargo-probe-output");if(string.IsNullOrEmpty(path) || !Path.IsPathRooted(path))return;
            var p=new GameObject("V015 cargo migration validation").AddComponent<StationRingCargoProbe>();
            p.OutputDirectory=path;p.LegacyPath=Arg("--station-cargo-probe-legacy");p.ResumePath=Arg("--station-cargo-probe-resume");
            p.Phase=float.Parse(Arg("--station-cargo-probe-phase")??"0",System.Globalization.CultureInfo.InvariantCulture);
        }
        IEnumerator Start()
        {
            yield return null;yield return null;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,phase=Phase,stage=string.IsNullOrEmpty(ResumePath)?"write":"read"};
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Buildings candidate required");
            Directory.CreateDirectory(OutputDirectory);float started=Time.time;int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();walker.MovementLocked=true;
            cargo=FindObjectsByType<StationDockCargoService>(FindObjectsSortMode.None).OrderBy(c=>c.StableId).ToArray();
            foreach(var r in FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None))r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-Phase:Phase,0);
            Place(new Vector3(0,0,250));priorKeyboard=Keyboard.current;keyboard=InputSystem.AddDevice<Keyboard>();
            Check("two fixed cargo services enabled",cargo.Length==2 && cargo.All(c=>c.enabled && !c.GetComponentInParent<StationRotatingRing>()));
            foreach(var c in cargo)
            {
                Check(c.StableId+" preserves twelve metre travel",Mathf.Abs(c.Cargo.position.z-c.InspectionZ-12)<.001f);
                Check(c.StableId+" visible cargo model retained",c.Cargo.GetComponentsInChildren<Renderer>().Count(r=>r.enabled)==6);
                Check(c.StableId+" remote operation rejected",!c.Use() && !c.Inspect());
            }
            if(report.stage=="write")
            {
                var legacy=JsonUtility.FromJson<States>(File.ReadAllText(LegacyPath));
                foreach(var c in cargo)
                {
                    var old=legacy.cargo.Single(s=>s.id==c.StableId);float parked=c.Cargo.position.z;
                    Check(c.StableId+" authentic legacy parked state accepted",old.version==0 && old.z==166 && c.CanRestore(old));
                    c.RestoreState(old);Check(c.StableId+" old state translated once",Mathf.Abs(c.Cargo.position.z-parked)<.001f && c.CaptureState().version==1);
                    var normalized=c.CaptureState();c.RestoreState(normalized);Check(c.StableId+" normalized reload has no second translation",Mathf.Abs(c.Cargo.position.z-parked)<.001f);
                    ValidateStates(c,parked);
                }
            }
            else
            {
                var restored=JsonUtility.FromJson<States>(File.ReadAllText(ResumePath));
                Check("two saved cargo identities",restored.cargo.Length==2 && restored.cargo.Select(s=>s.id).Distinct().Count()==2);
                foreach(var c in cargo)
                {
                    var state=restored.cargo.Single(s=>s.id==c.StableId);float parked=c.Cargo.position.z;
                    Check(c.StableId+" cross-process state accepted",state.version==1 && c.CanRestore(state));c.RestoreState(state);
                    Check(c.StableId+" saved travel progress restored",Mathf.Abs(c.Cargo.position.z-Mathf.Lerp(parked,c.InspectionZ,state.progress))<.001f && c.Moving);
                }
                yield return WaitCargo(cargo[0]);yield return WaitCargo(cargo[1]);
                Check("outbound resumes to inspection",cargo[0].AtInspection && !cargo[0].Inspected);
                Check("inbound resumes to completed berth",cargo[1].Completed && !cargo[1].AtInspection);
            }
            yield return Move("outer ring to fixed port",new Vector3(0,0,258));Check("fixed arrival floor",!walker.GroundRing);
            float center=(cargo[0].transform.position.x+cargo[1].transform.position.x)*.5f;
            float controlZ=cargo[0].transform.position.z+2.2f,aisle=controlZ+1;
            yield return Move("arrival centerline",new Vector3(center,0,258));yield return Move("cargo rear aisle",new Vector3(center,0,aisle));
            for(int i=0;i<cargo.Length;i++)
            {
                var c=cargo[i];float x=c.Cargo.position.x,side=i==0?-1:1;int events=0;c.StateChanged+=()=>events++;
                yield return Move(c.StableId+" rear bay",new Vector3(x,0,aisle));
                yield return Move(c.StableId+" controller",new Vector3(x,0,controlZ));
                var blocked=walker.InputBlocked;walker.InputBlocked=()=>true;Check(c.StableId+" modal input rejected",!c.Use() && !c.Inspect());walker.InputBlocked=blocked;
                if(!c.AtInspection)
                {
                    yield return Press();Check(c.StableId+" E starts outbound",c.Moving && !c.AtInspection);
                }
                yield return WaitCargo(c);Check(c.StableId+" controller refuses return before inspection",c.AtInspection && !c.Use());
                yield return Move(c.StableId+" clear service aisle",new Vector3(x+side*4,0,aisle));
                yield return Move(c.StableId+" inspection approach",new Vector3(x+side*4,0,c.InspectionZ));
                yield return WaitCargo(c);Check(c.StableId+" arrives at relocated inspection",c.AtInspection && !c.Inspected && Mathf.Abs(c.Cargo.position.z-c.InspectionZ)<.001f);
                Check(c.StableId+" cannot return before inspection",!c.Use());
                walker.ThirdPersonMode=false;yield return new WaitForEndOfFrame();walker.Face(c.Cargo.position);yield return new WaitForEndOfFrame();Capture(c.StableId);
                yield return Press();Check(c.StableId+" E inspects once",c.Inspected && !c.Moving);Check(c.StableId+" duplicate inspection rejected",!c.Inspect());
                yield return Move(c.StableId+" return service aisle",new Vector3(x+side*4,0,aisle));yield return Move(c.StableId+" return controller",new Vector3(x,0,controlZ));
                yield return Press();Check(c.StableId+" E starts return",c.Moving && c.AtInspection);yield return WaitCargo(c);
                Check(c.StableId+" complete at berth",c.Completed && c.Inspected && !c.AtInspection && Mathf.Abs(c.Cargo.position.z-c.InspectionZ-12)<.001f);
                Check(c.StableId+" expected progress events",events==(report.stage=="read" && i==0?3:5),events);
                c.enabled=false;Check(c.StableId+" disabled controller rejects use",!c.Use());c.enabled=true;
                yield return Move(c.StableId+" leave bay",new Vector3(x,0,aisle));
                yield return Move(c.StableId+" leave controller",new Vector3(center,0,aisle));
            }
            yield return Move("return through arrival hall",new Vector3(center,0,258));yield return Move("fixed port return seam",new Vector3(0,0,258));yield return Move("back to outer ring",new Vector3(0,0,250));
            Check("outer ring ground restored",walker.GroundRing && walker.GroundRing.RingId=="v015-r3");
            if(report.stage=="write")
            {
                foreach(var c in cargo)
                {
                    float side=c==cargo[0]?-1:1,x=c.Cargo.position.x,z=c.InspectionZ+6;
                    foreach(bool outbound in new[]{true,false})
                    {
                        Place(new Vector3(x,0,z));c.RestoreState(new StationDockCargoState{id=c.StableId,z=outbound?166:154,moving=true,towardInspection=outbound,atInspection=!outbound,inspected=!outbound});
                        float until=Time.time+1.5f;bool clear=true;
                        while(Time.time<until){clear&=Clear();yield return null;}
                        Check(c.StableId+" occupied lane pauses "+outbound,c.Blocked && c.Moving && clear && Mathf.Abs(c.Cargo.position.z-z)>2.9f);
                        float stopped=c.Cargo.position.z;yield return new WaitForSeconds(.5f);Check(c.StableId+" no creep while blocked "+outbound,Mathf.Abs(c.Cargo.position.z-stopped)<.001f);
                        Check(c.StableId+" lane detection "+outbound,c.IsInTravelLane(walker.transform.position) && !c.IsInTravelLane(walker.transform.position+Vector3.right*4));
                        yield return Move(c.StableId+" leaves cargo lane "+outbound,new Vector3(x+side*4,0,z));yield return WaitCargo(c);
                        Check(c.StableId+" resumes when lane clears "+outbound,!c.Blocked && (outbound?c.AtInspection:c.Completed));
                    }
                }
                Place(new Vector3(center,0,258));
                cargo[0].RestoreState(new StationDockCargoState{id=cargo[0].StableId,z=162,moving=true,towardInspection=true});
                cargo[1].RestoreState(new StationDockCargoState{id=cargo[1].StableId,z=158,moving=true,atInspection=true,inspected=true});
                yield return null;
                File.WriteAllText(Path.Combine(OutputDirectory,"resume.json"),JsonUtility.ToJson(new States{cargo=cargo.Select(c=>c.CaptureState()).ToArray()},true));
                Check("opposite moving states saved for separate process",cargo[0].Moving && cargo[1].Moving);
            }
            File.WriteAllText(Path.Combine(OutputDirectory,"final-state.json"),JsonUtility.ToJson(new States{cargo=cargo.Select(c=>c.CaptureState()).ToArray()},true));
            InputSystem.RemoveDevice(keyboard);if(priorKeyboard!=null)priorKeyboard.MakeCurrent();
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("cargo");walker.MovementLocked=false;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        void ValidateStates(StationDockCargoService c,float parked)
        {
            var initial=c.CaptureState();
            foreach(var state in new[]{new StationDockCargoState{id=c.StableId,z=160,moving=true,towardInspection=true},
                new StationDockCargoState{id=c.StableId,z=154,atInspection=true,towardInspection=true},
                new StationDockCargoState{id=c.StableId,z=154,atInspection=true,towardInspection=true,inspected=true},
                new StationDockCargoState{id=c.StableId,z=160,atInspection=true,moving=true,inspected=true},
                new StationDockCargoState{id=c.StableId,z=166,completed=true,inspected=true}})
            {
                Check(c.StableId+" valid legacy phase",c.CanRestore(state));c.RestoreState(state);
                float expected=parked+(state.z-166);Check(c.StableId+" legacy position mapped",Mathf.Abs(c.Cargo.position.z-expected)<.001f);
                var normalized=JsonUtility.FromJson<StationDockCargoState>(JsonUtility.ToJson(c.CaptureState()));c.RestoreState(normalized);
                Check(c.StableId+" phase round trip",Mathf.Abs(c.Cargo.position.z-expected)<.001f && c.Moving==state.moving && c.Completed==state.completed && c.Inspected==state.inspected);
            }
            foreach(var invalid in new[]{new StationDockCargoState{id="wrong",z=166},new StationDockCargoState{id=c.StableId,z=170},
                new StationDockCargoState{id=c.StableId,z=float.NaN},new StationDockCargoState{id=c.StableId,version=2},
                new StationDockCargoState{id=c.StableId,version=1,progress=1.1f},new StationDockCargoState{id=c.StableId,version=1,progress=float.NaN},
                new StationDockCargoState{id=c.StableId,z=160},new StationDockCargoState{id=c.StableId,z=160,moving=true,completed=true},
                new StationDockCargoState{id=c.StableId,z=154,atInspection=true},new StationDockCargoState{id=c.StableId,z=166,completed=true}})
            {
                var before=c.CaptureState();bool rejected=false;try{c.RestoreState(invalid);}catch(ArgumentException){rejected=true;}
                Check(c.StableId+" invalid state rejected without mutation",!c.CanRestore(invalid) && rejected && JsonUtility.ToJson(before)==JsonUtility.ToJson(c.CaptureState()));
            }
            c.RestoreState(initial);
        }
        IEnumerator WaitCargo(StationDockCargoService c)
        {float until=Time.time+8;while(c.Moving && Time.time<until)yield return null;Check(c.StableId+" movement reaches endpoint",!c.Moving);Save("progress");}
        IEnumerator Press(){InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.E));yield return null;yield return new WaitForEndOfFrame();InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;}
        void Place(Vector3 p){body.enabled=false;walker.transform.position=p+Vector3.up*.08f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        bool Clear()=>Physics.OverlapCapsule(walker.transform.position+Vector3.up*.55f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore).All(c=>c.GetComponentInParent<StationGrayboxWalker>()==walker);
        IEnumerator Move(string label,Vector3 target)
        {
            report.segment=label;float until=Time.time+35,best=float.MaxValue,progress=Time.time;bool clear=true,supported=true;
            while(Time.time<until)
            {
                var delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.08f)break;
                if(delta.magnitude<best-.1f){best=delta.magnitude;progress=Time.time;}if(Time.time-progress>4)break;
                var before=walker.transform.position;walker.MoveOnGround(delta.normalized*Mathf.Min(6,delta.magnitude/Time.deltaTime),Time.deltaTime);report.distance+=Vector3.Distance(before,walker.transform.position);
                supported&=Mathf.Abs(walker.transform.position.y-target.y)<.3f && Physics.RaycastAll(walker.transform.position+Vector3.up*.2f,Vector3.down,.6f,~0,QueryTriggerInteraction.Ignore).Any(h=>h.collider!=body && h.normal.y>.65f);
                if(!Clear()){clear=false;if(!report.blockages.Contains(label))report.blockages.Add(label);}yield return null;
            }
            var gap=target-walker.transform.position;gap.y=0;Check(label+" reached",gap.magnitude<.15f,gap.magnitude);Check(label+" supported",supported);Check(label+" no penetration",clear);Save("progress");
            if(gap.magnitude>=.15f)throw new InvalidOperationException("Cargo route blocked at "+label);
        }
        void Capture(string name)
        {
            var camera=walker.View;var oldTarget=camera.targetTexture;var old=RenderTexture.active;var rt=new RenderTexture(1200,800,24);var pixels=new Texture2D(1200,800,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;pixels.ReadPixels(new Rect(0,0,1200,800),0,0);pixels.Apply();File.WriteAllBytes(Path.Combine(OutputDirectory,name+".png"),pixels.EncodeToPNG());}
            finally{camera.targetTexture=oldTarget;RenderTexture.active=old;rt.Release();Destroy(rt);Destroy(pixels);}
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
