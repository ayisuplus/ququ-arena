using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Opt-in physical entry/interior test; normal game sessions do not create it.
    public sealed class StationSeedConservatoryProbeV016 : MonoBehaviour
    {
        [Serializable] sealed class Report
        {
            public string scene, segment, graphicsDevice;
            public float phase, distance, seconds, maximumGroundError, holdDrift;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks = new List<StationRingPrototypeProbe.Check>();
            public List<string> obstructions = new List<string>();
        }
        readonly Report report = new Report();
        string output;
        StationGrayboxWalker walker;
        StationRotatingRing ring;
        StationConservatoryDoor door;
        Transform frame;

        public void Begin(string directory, float phase)
        {
            if (!Path.IsPathRooted(directory)) throw new ArgumentException("Absolute output required");
            output=directory;report.phase=phase;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"--station-v016-b03-interior-output");
            if(i<0||i+1>=args.Length)return;
            int p=Array.IndexOf(args,"--station-v016-b03-phase");
            float phase=p>=0?float.Parse(args[p+1],System.Globalization.CultureInfo.InvariantCulture):0;
            new GameObject("V016 seed conservatory physical validation").AddComponent<StationSeedConservatoryProbeV016>().Begin(args[i+1],phase);
        }

        IEnumerator Start()
        {
            yield return null;yield return null;
            if(output==null)yield break;
            report.scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path;
            if(!report.scene.EndsWith("BlackHoleStationCreativeBuildingsV016.unity") && !report.scene.EndsWith("BlackHoleStationEcologicalParkV017.unity") && !report.scene.EndsWith("BlackHoleStationAnnexInteriorsV018.unity"))throw new InvalidOperationException("V016, ecological park or annex candidate required");
            Directory.CreateDirectory(output);float started=Time.time;
            report.graphicsDevice=SystemInfo.graphicsDeviceName;
            walker=FindFirstObjectByType<StationGrayboxWalker>();bool locked=walker.MovementLocked;walker.MovementLocked=true;
            int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            frame=GameObject.Find("V016 B03 tidal seed exterior trial").transform;
            ring=frame.GetComponentInParent<StationRotatingRing>();ring.transform.rotation=Quaternion.Euler(0,report.phase,0);
            door=frame.GetComponentInChildren<StationConservatoryDoor>();
            Check("Existing automatic door reused",door&&door.enabled&&door.LeftPanel&&door.RightPanel);
            Check("R3 movement retained",ring.RingId=="v015-r3"&&ring.enabled&&walker.enabled);
            Check("Core gameplay remains disabled",!FindFirstObjectByType<ArenaStationLiveMatch>().enabled);
            var body=walker.GetComponent<CharacterController>();body.enabled=false;walker.transform.position=frame.TransformPoint(new Vector3(18.8f,.08f,0));body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();
            yield return Hold(3);
            Check("Unattended entrance initially closed",!door.IsOpen&&Mathf.Abs(door.LeftPanel.localPosition.x+1.03f)<.01f);
            yield return Move("Outside ramp approach",16.7f,0);
            yield return Hold(1.2f);Check("Door opens from outside",door.IsOpen);
            yield return Move("Ramp and outer threshold",13.95f,0);
            yield return Hold(2.2f);Check("Occupied threshold holds door open",door.IsOpen);
            Check("Door threshold excluded from safe spawn",door.GetComponent<StationUnsafeSaveZone>().Contains(walker.transform.position));
            yield return Move("Enter through actual glazing opening",10.3f,0);
            yield return Move("North front path",9.2f,6.15f);
            yield return Move("North planted aisle",0,5.8f);
            yield return Move("North rear turn", -6,3.6f);
            yield return Move("Tail viewing turn", -8,0);
            yield return Move("South rear turn",-6,-3.6f);
            yield return Move("South planted aisle",0,-5.8f);
            yield return Move("South front path",9.2f,-6.15f);
            yield return Move("Return from planting loop",10.3f,0);
            yield return Move("Central independent walkway",0,0);
            var local=frame.InverseTransformPoint(walker.transform.position);float holdYaw=ring.transform.eulerAngles.y,holdStarted=Time.time;
            yield return Hold(4);
            report.holdDrift=Vector3.Distance(local,frame.InverseTransformPoint(walker.transform.position));
            Check("Standing on interior follows moving ring",walker.GroundRing==ring&&report.holdDrift<.04f,report.holdDrift);
            float yaw=Mathf.DeltaAngle(holdYaw,ring.transform.eulerAngles.y),expected=ring.DegreesPerSecond*(Time.time-holdStarted);
            Check("Normal ring speed during indoor stand",Mathf.Abs(yaw)>.001f&&Mathf.Abs(yaw-expected)<.005f,yaw-expected);
            Check("Door closes after entry clears",!door.IsOpen&&Mathf.Abs(door.LeftPanel.localPosition.x+1.03f)<.01f);
            foreach(int side in new[]{-1,1})
            {
                var origin=frame.TransformPoint(new Vector3(0,2,0));
                bool hit=Physics.Raycast(origin,frame.TransformDirection(new Vector3(0,0,side)),out var wall,12,~0,QueryTriggerInteraction.Ignore);
                Check("Glass boundary blocks from inside "+side,hit&&wall.collider.transform.IsChildOf(frame)&&wall.collider is MeshCollider);
            }
            yield return Move("Inside door approach",11,0);
            yield return Hold(1.2f);Check("Door opens from inside",door.IsOpen);
            yield return Move("Exit threshold",14.4f,0);
            yield return Move("Descend ramp to R3 street",18.8f,0);
            yield return Hold(3);Check("Door closes after exit clears",!door.IsOpen&&Mathf.Abs(door.LeftPanel.localPosition.x+1.03f)<.01f);
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed)&&report.obstructions.Count==0;Save("route");
            walker.MovementLocked=locked;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }

        IEnumerator Hold(float seconds)
        {
            float until=Time.time+seconds;
            while(Time.time<until){walker.MoveOnGround(Vector3.zero,Time.deltaTime);yield return null;}
        }

        IEnumerator Move(string label,float x,float z)
        {
            report.segment=label;float until=Time.time+18,maxError=0;bool supported=true,clear=true;
            while(Time.time<until)
            {
                var target=frame.TransformPoint(new Vector3(x,0,z));var delta=target-walker.transform.position;delta.y=0;
                if(delta.magnitude<.10f)break;
                var before=walker.transform.position;walker.MoveOnGround(delta.normalized*Mathf.Min(2.6f,delta.magnitude/Time.deltaTime),Time.deltaTime);
                report.distance+=Vector3.Distance(before,walker.transform.position);
                var p=frame.InverseTransformPoint(walker.transform.position);
                float ground=p.x>18?0:p.x>14.45f?(.015f+(18-p.x)*.585f/3.55f):.62f;
                maxError=Mathf.Max(maxError,Mathf.Abs(p.y-ground));supported&=walker.GroundRing==ring;
                foreach(var c in Physics.OverlapCapsule(walker.transform.position+Vector3.up*.48f,walker.transform.position+Vector3.up*1.42f,.26f,~0,QueryTriggerInteraction.Ignore))
                    if(c.GetComponentInParent<StationGrayboxWalker>()!=walker){clear=false;if(!report.obstructions.Contains(c.name))report.obstructions.Add(c.name);}
                yield return null;
            }
            var gap=frame.TransformPoint(new Vector3(x,0,z))-walker.transform.position;gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);
            Check(label+" body clearance",clear);
            Check(label+" supported by R3 floor",supported&&maxError<.20f,maxError);
            report.maximumGroundError=Mathf.Max(report.maximumGroundError,maxError);Save("progress");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(output,name+".json"),JsonUtility.ToJson(report,true));
    }
}
