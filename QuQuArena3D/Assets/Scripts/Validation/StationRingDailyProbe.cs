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
    public sealed class StationRingDailyProbe : MonoBehaviour
    {
        [Serializable] public sealed class Result
        {
            public string scene,segment;
            public float phase,seconds,distance,maxSeatDrift,maxEyeError;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> blockages=new List<string>();
            public List<string> viewRestores=new List<string>();
        }
        public string OutputDirectory;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        StationCafeMoment cafe;
        Result report;
        Keyboard keyboard,priorKeyboard;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-daily-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var p=new GameObject("V015 daily life validation").AddComponent<StationRingDailyProbe>();p.OutputDirectory=args[at+1];
            at=Array.IndexOf(args,"--station-daily-probe-phase");if(at>=0 && at+1<args.Length)p.Phase=float.Parse(args[at+1],System.Globalization.CultureInfo.InvariantCulture);
        }
        IEnumerator Start()
        {
            yield return null;yield return null;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,phase=Phase};
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity") && !report.scene.EndsWith("BlackHoleStationEcologicalParkV017.unity") && !report.scene.EndsWith("BlackHoleStationAnnexInteriorsV018.unity"))throw new InvalidOperationException("Buildings, ecological park or annex candidate required");
            Directory.CreateDirectory(OutputDirectory);float started=Time.time;int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();walker.MovementLocked=true;
            cafe=FindFirstObjectByType<StationCafeMoment>();var care=FindFirstObjectByType<StationGreenhouseCare>();
            foreach(var r in FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None))r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-Phase:Phase,0);
            Physics.SyncTransforms();priorKeyboard=Keyboard.current;keyboard=InputSystem.AddDevice<Keyboard>();
            Check("cafe and greenhouse enabled",cafe.enabled && care.enabled);Check("ten original cafe seats",cafe.Seats.Length==10);
            var cf=GameObject.Find("V015 package - cafe and observation gallery").transform;
            Place(cf,new Vector3(-32,0,5));Check("remote cafe rejected",!cafe.Use());
            yield return Move("cafe public approach",cf,new Vector3(0,0,5));
            yield return Move("cafe entrance",cf,new Vector3(7,0,5));
            yield return Move("cafe counter aisle",cf,new Vector3(20,0,5));
            yield return Move("cafe counter",cf,new Vector3(20,0,2));
            var targets=new[]{new Vector3(10,0,8.9f),new Vector3(18,0,8.9f),new Vector3(10,0,7.1f),new Vector3(18,0,7.1f),
                new Vector3(10.2f,0,12.9f),new Vector3(13.8f,0,12.9f),new Vector3(15.2f,0,12.9f),new Vector3(18.8f,0,12.9f),
                new Vector3(7.2f,0,-2.9f),new Vector3(10.8f,0,-2.9f)};
            int cafeEvents=0;cafe.StateChanged+=()=>cafeEvents++;
            for(int i=0;i<targets.Length;i++)
            {
                var input=walker.InputBlocked;walker.InputBlocked=()=>true;Check("counter blocks modal input "+i,!cafe.Use());walker.InputBlocked=input;
                yield return Press();Check("one drink served "+i,cafe.HoldingDrink && cafe.ServedCount==i+1 && cafe.DrunkCount==i);
                var path=new List<Vector3>{new Vector3(20,0,5)};
                if(i<4){path.Add(new Vector3(i%2==0?9:20,0,5));path.Add(new Vector3(i%2==0?9:20,0,targets[i].z));}
                else if(i<8){path.Add(new Vector3(21,0,5));path.Add(new Vector3(21,0,10.7f));path.Add(new Vector3(targets[i].x,0,10.7f));}
                else{path.Add(new Vector3(targets[i].x,0,5));}
                path.Add(targets[i]);foreach(var p in path)yield return Move("seat "+i+" approach",cf,p);
                walker.ThirdPersonMode=i%2==0;yield return new WaitForEndOfFrame();
                var eye=walker.View.transform.localPosition;var rotation=walker.View.transform.localRotation;bool avatar=walker.VisibleAvatar.activeSelf;
                var standing=cf.InverseTransformPoint(walker.transform.position);var yaw=Quaternion.Inverse(cf.rotation)*walker.transform.rotation;
                if(i==0)
                {
                    cafe.SeatAvailable=_=>false;Check("reserved seats rejected",!cafe.Use());cafe.SeatAvailable=null;
                }
                yield return Press();Check("requested seat selected "+i,cafe.SeatedSeatIndex==i && !walker.enabled && body.enabled);
                if(cafe.SeatedSeatIndex!=i)throw new InvalidOperationException("Cafe seat mismatch "+i);
                float until=Time.time+(i==0?8:1),drift=0,eyeError=0,yawError=0,angle=cf.eulerAngles.y;
                while(Time.time<until)
                {
                    yield return new WaitForEndOfFrame();drift=Mathf.Max(drift,Vector3.Distance(standing,cf.InverseTransformPoint(walker.transform.position)));
                    eyeError=Mathf.Max(eyeError,Vector3.Distance(walker.View.transform.position,cafe.Seats[i].position+Vector3.up*1.25f));
                    yawError=Mathf.Max(yawError,Quaternion.Angle(yaw,Quaternion.Inverse(cf.rotation)*walker.transform.rotation));
                }
                report.maxSeatDrift=Mathf.Max(report.maxSeatDrift,drift);report.maxEyeError=Mathf.Max(report.maxEyeError,eyeError);
                Check("seated body follows ring "+i,drift<.03f && yawError<.1f && walker.GroundRing==cf.GetComponentInParent<StationRotatingRing>(),drift);
                Check("seated view follows marker "+i,eyeError<.01f && Vector3.Dot(walker.View.transform.forward,cafe.Seats[i].forward)>.9999f && !walker.VisibleAvatar.activeSelf,eyeError);
                if(i==0){Check("cafe normal rotation during rest",Mathf.Abs(Mathf.DeltaAngle(angle,cf.eulerAngles.y))>.1f);Capture("cafe-seated");}
                yield return Press();Check("drink consumed exactly once "+i,!cafe.HoldingDrink && cafe.DrunkCount==i+1 && cafe.SeatedSeatIndex==i);
                var storedEye=(Vector3)typeof(StationCafeMoment).GetField("standingViewLocalPosition",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance).GetValue(cafe);
                Vector3 immediateEye=Vector3.zero;
                Quaternion immediateRotation=Quaternion.identity;
                void CaptureRestoredView(){immediateEye=walker.View.transform.localPosition;immediateRotation=walker.View.transform.localRotation;}
                if(i==9){cafe.enabled=false;CaptureRestoredView();Check("disabled cafe rejects use",!cafe.Use());cafe.enabled=true;}
                else yield return Press(CaptureRestoredView);
                Check("standing state restored "+i,cafe.SeatedSeatIndex<0 && walker.enabled && body.enabled && walker.VisibleAvatar.activeSelf==avatar);
                report.viewRestores.Add(i+": position="+Vector3.Distance(eye,walker.View.transform.localPosition).ToString("R")+
                    ", angle="+Quaternion.Angle(rotation,walker.View.transform.localRotation).ToString("R")+
                    ", expected="+rotation.ToString("F9")+", actual="+walker.View.transform.localRotation.ToString("F9")+
                    ", before="+eye.ToString("F9")+", stored="+storedEye.ToString("F9")+", immediate="+immediateEye.ToString("F9")+
                    ", final="+walker.View.transform.localPosition.ToString("F9")+", bodyDrift="+Vector3.Distance(standing,cf.InverseTransformPoint(walker.transform.position)).ToString("R"));
                // Verify restoration before LateUpdate recomputes the third-person collision distance.
                Check("standing view restored "+i,Vector3.Distance(eye,immediateEye)<.001f && Quaternion.Angle(rotation,immediateRotation)<.05f,Vector3.Distance(eye,immediateEye));
                Check("standing camera clear after follow update "+i,!Physics.OverlapSphere(walker.View.transform.position,.05f,~0,QueryTriggerInteraction.Ignore)
                    .Any(c=>c.GetComponentInParent<StationGrayboxWalker>()!=walker));
                for(int k=path.Count-2;k>=0;k--)yield return Move("seat "+i+" return",cf,path[k]);
                yield return Move("return to counter "+i,cf,new Vector3(20,0,2));
            }
            Check("twenty cafe progress events",cafeEvents==20,cafeEvents);
            var cafeState=JsonUtility.ToJson(cafe.CaptureState());File.WriteAllText(Path.Combine(OutputDirectory,"cafe-state.json"),cafeState);
            Check("cafe invalid identity rejected",!cafe.CanRestore(new StationCafeState{id="wrong"}));
            Check("cafe impossible counts rejected",!cafe.CanRestore(new StationCafeState{id=cafe.StableId,served=1,drunk=2}));
            cafe.RestoreState(new StationCafeState{id=cafe.StableId});cafe.RestoreState(JsonUtility.FromJson<StationCafeState>(File.ReadAllText(Path.Combine(OutputDirectory,"cafe-state.json"))));
            Check("cafe serialized progress restored",cafe.ServedCount==10 && cafe.DrunkCount==10 && !cafe.HoldingDrink && cafeEvents==20);
            yield return Move("cafe return aisle",cf,new Vector3(20,0,5));yield return Move("cafe exit",cf,new Vector3(0,0,5));yield return Move("cafe back to public street",cf,new Vector3(-32,0,5));

            var gf=GameObject.Find("V015 package - glass ecology garden").transform;
            var locks=gf.GetComponentsInChildren<StationPressureVestibule>().OrderByDescending(v=>gf.InverseTransformPoint(v.RoomDoor.position).z).ToArray();
            Check("two original pressure vestibules enabled",locks.Length==2 && locks.All(v=>v.enabled));
            Place(gf,new Vector3(0,0,28));Check("remote care rejected",!care.Use());
            yield return Move("garden outer automatic entry",gf,new Vector3(0,0,16));
            foreach(var point in new[]{new Vector3(0,0,12.3f),new Vector3(14.5f,0,12.3f),new Vector3(14.5f,0,-12.3f),
                new Vector3(0,0,-12.3f),new Vector3(-14.5f,0,-12.3f),new Vector3(-14.5f,0,12.3f),new Vector3(0,0,12.3f),new Vector3(0,0,16)})
                yield return Move("garden planted court circuit "+point,gf,point);
            yield return Airlock(gf,locks[0],1,true);
            yield return Move("care station",gf,new Vector3(0,0,3.5f));
            int careEvents=0;care.StateChanged+=()=>careEvents++;float initialScale=care.Foliage.localScale.y;
            var block=walker.InputBlocked;walker.InputBlocked=()=>true;Check("care blocks modal input",!care.Use());walker.InputBlocked=block;
            yield return Press();Check("plant inspected",care.Stage==1 && care.CareCount==0);
            yield return Press();Check("plant watered",care.Stage==2 && care.CareCount==1 && careEvents==2);
            var crops=care.Foliage.Cast<Transform>().Where(t=>t.name.StartsWith("Living crop ")).ToArray();
            Check("six original crops grow",crops.Length==6 && crops.All(t=>t.gameObject.activeInHierarchy && t.GetComponentsInChildren<Renderer>().Length>0) && care.Foliage.localScale.y>initialScale*1.7f);
            walker.ThirdPersonMode=false;yield return new WaitForEndOfFrame();walker.Face(care.Foliage.position+Vector3.up*1.5f);yield return new WaitForEndOfFrame();Capture("garden-care");
            yield return Press();yield return Press();yield return Press();Check("repeat care cycle",care.Stage==2 && care.CareCount==2 && careEvents==5);
            var careState=JsonUtility.ToJson(care.CaptureState());File.WriteAllText(Path.Combine(OutputDirectory,"care-state.json"),careState);
            Check("care invalid stage rejected",!care.CanRestore(new StationGreenhouseState{id=care.StableId,stage=3}));
            Check("care completion without count rejected",!care.CanRestore(new StationGreenhouseState{id=care.StableId,stage=2}));
            care.RestoreState(new StationGreenhouseState{id=care.StableId});care.RestoreState(JsonUtility.FromJson<StationGreenhouseState>(File.ReadAllText(Path.Combine(OutputDirectory,"care-state.json"))));
            Check("care serialized progress restored",care.Stage==2 && care.CareCount==2 && careEvents==5);
            care.enabled=false;Check("disabled care rejects use",!care.Use());care.enabled=true;
            yield return Move("garden around crop rack",gf,new Vector3(9,0,3.5f));yield return Move("garden south aisle",gf,new Vector3(9,0,-5));yield return Move("garden south inner approach",gf,new Vector3(0,0,-5));
            yield return Airlock(gf,locks[1],-1,false);
            yield return Move("garden outside south canopy",gf,new Vector3(0,0,-28));
            yield return Move("garden exterior west corner",gf,new Vector3(-27,0,-28));yield return Move("garden exterior west edge",gf,new Vector3(-27,0,28));yield return Move("garden returns to entry",gf,new Vector3(0,0,28));
            Check("pressure doors closed after tour",locks.All(v=>!v.RoomOpen && !v.StreetOpen));
            InputSystem.RemoveDevice(keyboard);if(priorKeyboard!=null)priorKeyboard.MakeCurrent();
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("daily");
            walker.MovementLocked=false;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        IEnumerator Airlock(Transform frame,StationPressureVestibule v,int side,bool enter)
        {
            yield return Move(v.name+" approach",frame,new Vector3(0,0,side*(enter?13.5f:5)));
            Check(v.name+" opens first",enter?v.UseStreet():v.UseRoom());
            Check(v.name+" interlock prevents both open",!(enter?v.UseRoom():v.UseStreet()));
            yield return Move(v.name+" occupied first threshold",frame,new Vector3(0,0,side*(enter?11.5f:7)));
            Check(v.name+" refuses closing on occupant",!(enter?v.UseStreet():v.UseRoom()));
            yield return Move(v.name+" chamber",frame,new Vector3(0,0,side*9.25f));
            Check(v.name+" chamber interlock blocks reachable second door",!(enter?v.UseRoom():v.UseStreet()) && (enter?v.StreetOpen:v.RoomOpen));
            yield return Press();Check(v.name+" first closes via E",!v.RoomOpen && !v.StreetOpen);
            yield return Move(v.name+" second approach",frame,new Vector3(0,0,side*(enter?9:9.5f)));
            yield return Press();Check(v.name+" second opens via E",enter?v.RoomOpen:v.StreetOpen);
            yield return Move(v.name+" occupied second threshold",frame,new Vector3(0,0,side*(enter?7:11.5f)));
            Check(v.name+" second refuses closing on occupant",!(enter?v.UseRoom():v.UseStreet()));
            yield return Move(v.name+" through second",frame,new Vector3(0,0,side*(enter?4.5f:14)));
            Check(v.name+" closes second",enter?v.UseRoom():v.UseStreet());
        }
        IEnumerator Press(Action afterUpdate=null)
        {
            InputSystem.QueueStateEvent(keyboard,new KeyboardState(Key.E));yield return null;afterUpdate?.Invoke();yield return new WaitForEndOfFrame();
            InputSystem.QueueStateEvent(keyboard,new KeyboardState());yield return null;
        }
        void Place(Transform frame,Vector3 p){body.enabled=false;walker.transform.position=frame.TransformPoint(p)+Vector3.up*.08f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        IEnumerator Move(string label,Transform frame,Vector3 p)
        {
            report.segment=label;float until=Time.time+35,best=float.MaxValue,progress=Time.time;bool supported=true,clear=true;var ring=frame.GetComponentInParent<StationRotatingRing>();
            while(Time.time<until)
            {
                var target=frame.TransformPoint(p);var delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.08f)break;
                if(delta.magnitude<best-.1f){best=delta.magnitude;progress=Time.time;}if(Time.time-progress>4)break;
                var before=walker.transform.position;walker.MoveOnGround(delta.normalized*Mathf.Min(6,delta.magnitude/Time.deltaTime),Time.deltaTime);report.distance+=Vector3.Distance(before,walker.transform.position);
                supported&=walker.GroundRing==ring && Mathf.Abs(walker.transform.position.y-target.y)<.3f;
                foreach(var c in Physics.OverlapCapsule(walker.transform.position+Vector3.up*.65f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore))
                    if(c.GetComponentInParent<StationGrayboxWalker>()!=walker){clear=false;string s=label+": "+c.name;if(!report.blockages.Contains(s))report.blockages.Add(s);}
                yield return null;
            }
            var gap=frame.TransformPoint(p)-walker.transform.position;gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);Check(label+" supported",supported);Check(label+" no penetration",clear);Save("progress");
            if(gap.magnitude>=.15f)throw new InvalidOperationException("Daily route blocked at "+label+"; see progress.json");
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
