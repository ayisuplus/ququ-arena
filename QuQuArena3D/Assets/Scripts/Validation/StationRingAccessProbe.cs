using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Actual CharacterController journeys with doors enabled; no panel/collider exclusions.
    public sealed class StationRingAccessProbe : MonoBehaviour
    {
        [Serializable] public sealed class Result
        {
            public string scene, segment;
            public string scope="Moving guest/conservatory doors, public interiors and four shared lounge entrances; other station systems remain separate";
            public float phase, seconds, distance;
            public int frames;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> blockages=new List<string>();
        }
        public string OutputDirectory;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        Result report;
        float started;
        int holdNumber;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-access-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var probe=new GameObject("V015 actual entrance and door routes").AddComponent<StationRingAccessProbe>();
            probe.OutputDirectory=args[at+1];int phase=Array.IndexOf(args,"--station-access-probe-phase");
            if(phase>=0 && phase+1<args.Length)probe.Phase=float.Parse(args[phase+1],System.Globalization.CultureInfo.InvariantCulture);
        }

        IEnumerator Start()
        {
            yield return null;yield return null;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,phase=Phase};
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Real building candidate required");
            Directory.CreateDirectory(OutputDirectory);started=Time.time;
            int oldCap=Application.targetFrameRate,oldSync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();
            walker.enabled=true;walker.MovementLocked=true;
            var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            foreach(var ring in rings)ring.transform.rotation=Quaternion.Euler(0,ring.RingId=="v015-r2"?-Phase:Phase,0);
            var rotations=rings.Select(r=>r.transform.rotation).ToArray();
            var guestDoors=FindObjectsByType<StationGuestDoor>(FindObjectsSortMode.None).OrderBy(d=>d.Room).ToArray();
            var gardenDoors=FindObjectsByType<StationConservatoryDoor>(FindObjectsSortMode.None).OrderBy(d=>d.name).ToArray();
            Check("eight guest doors enabled",guestDoors.Length==8 && guestDoors.All(d=>d.enabled));
            Check("four conservatory doors enabled",gardenDoors.Length==4 && gardenDoors.All(d=>d.enabled));

            foreach(var door in guestDoors)
            {
                var building=door.transform.parent;var ring=door.GetComponentInParent<StationRotatingRing>();
                string label="Guest "+door.Room;
                var center=ring.transform.InverseTransformPoint(building.position);center.y=0;
                var start=ring.transform.TransformPoint(center.normalized*(ring.InnerRadius+4));
                var local=building.InverseTransformPoint(start);local.y=.08f;
                Place(start);yield return Move(label+" from ring street",building,new Vector3(local.x,.08f,-13));
                yield return Move(label+" building entrance",building,new Vector3(0,.08f,-13));
                yield return Move(label+" hall to room",building,new Vector3(0,.08f,door.transform.localPosition.z));
                yield return Move(label+" approach closed door",door.transform,new Vector3(0,.08f,-1.4f));
                float blockedUntil=Time.time+.8f;
                while(Time.time<blockedUntil){Step(door.transform.TransformPoint(0,.08f,1.4f),2);yield return null;}
                Check(label+" closed panel blocks crossing",door.transform.InverseTransformPoint(walker.transform.position).z<-.25f && !door.IsOpen);
                Face(door.transform);Check(label+" open request",door.Use());yield return Hold(.9f);
                Check(label+" fully open",door.IsOpen && Mathf.Abs(door.Panel.localPosition.x-1.85f)<.02f);
                yield return Move(label+" enters suite",door.transform,new Vector3(0,.08f,1.4f));
                yield return Move(label+" doorway occupied",door.transform,new Vector3(0,.08f,0));
                Face(door.transform);Check(label+" refuses close on occupant",!door.Use() && door.IsOpen);yield return Hold(.5f);
                yield return Move(label+" leaves threshold",door.transform,new Vector3(0,.08f,-1.4f));
                Face(door.transform);Check(label+" close request",door.Use());yield return Hold(.9f);
                Check(label+" fully closes",!door.IsOpen && Mathf.Abs(door.Panel.localPosition.x)<.02f);
                Face(door.transform);Check(label+" reopen request",door.Use());yield return Hold(.9f);
                Face(door.transform);Check(label+" starts closing",door.Use());
                yield return Move(label+" returns while closing",door.transform,new Vector3(0,.08f,0),3);
                yield return Hold(.8f);Check(label+" reopens on returning occupant",door.IsOpen && Mathf.Abs(door.Panel.localPosition.x-1.85f)<.02f);
                yield return Move(label+" back to hall",door.transform,new Vector3(0,.08f,-1.4f));
                yield return Move(label+" hall center",building,new Vector3(0,.08f,door.transform.localPosition.z));
                yield return Move(label+" exits building",building,new Vector3(0,.08f,-13));
                yield return Move(label+" returns to ring street",building,new Vector3(local.x,.08f,-13));
                Snapshot("progress");
            }

            foreach(var door in gardenDoors)
            {
                string label=door.name;Place(door.transform.TransformPoint(0,.08f,-6));
                yield return Move(label+" approaches",door.transform,new Vector3(0,.08f,-2.5f),3);yield return Hold(.9f);
                Check(label+" automatically opens",door.IsOpen);
                yield return Move(label+" enters threshold",door.transform,new Vector3(0,.08f,0),3);
                yield return Hold(2);Check(label+" stays open with occupant",door.IsOpen);
                yield return Move(label+" crosses",door.transform,new Vector3(0,.08f,6),3);
                yield return Hold(3);Check(label+" closes after leaving",!door.IsOpen && Vector3.Distance(door.LeftPanel.localPosition,door.RightPanel.localPosition)<2.3f);
                yield return Move(label+" returns through automatic door",door.transform,new Vector3(0,.08f,-6),3);
                yield return Hold(3);Check(label+" closes after return",!door.IsOpen);
                Snapshot("progress");
            }

            foreach(string name in new[]{"05  /  COMMONS","06  /  STUDY","07  /  VISITOR","08  /  ACTIVITY","09  /  READING","10  /  WORKROOM"})
            {
                var building=GameObject.Find(name).transform;Place(building.TransformPoint(0,.08f,-17));
                yield return Move(name+" through hall",building,new Vector3(0,.08f,17));
                yield return Move(name+" returns through hall",building,new Vector3(0,.08f,-17));
                foreach(int side in new[]{-1,1})foreach(float z in new[]{-6.5f,6.5f})
                {
                    yield return Move(name+" room hall "+side+" "+z,building,new Vector3(0,.08f,z));
                    yield return Move(name+" room entry "+side+" "+z,building,new Vector3(side*5,.08f,z));
                    yield return Move(name+" room seating "+side+" "+z,building,new Vector3(side*9,.08f,z+1.35f));
                    yield return Move(name+" room return "+side+" "+z,building,new Vector3(side*5,.08f,z));
                    yield return Move(name+" room hall return "+side+" "+z,building,new Vector3(0,.08f,z));
                }
                yield return Move(name+" exits",building,new Vector3(0,.08f,-17));
            }
            var lounge=GameObject.Find("V015 package - existing shared resident lounge").transform;
            foreach(int side in new[]{-1,1})
            {
                var outside=new Vector3(side*17,.08f,.15f);Place(lounge.TransformPoint(outside));
                yield return Move("Lounge side "+side+" enters",lounge,new Vector3(side*11,.08f,.15f),3);
                yield return Move("Lounge side "+side+" holds threshold",lounge,new Vector3(side*14,.08f,.15f),3);
                yield return Hold(2);
                yield return Move("Lounge side "+side+" exits",lounge,outside,3);
                outside=new Vector3(12,.08f,side*15);Place(lounge.TransformPoint(outside));
                yield return Move("Lounge end "+side+" enters",lounge,new Vector3(12,.08f,side*9),3);
                yield return Move("Lounge end "+side+" holds threshold",lounge,new Vector3(12,.08f,side*12),3);
                yield return Hold(2);
                yield return Move("Lounge end "+side+" exits",lounge,outside,3);
            }
            for(int i=0;i<rings.Length;i++)Check(rings[i].RingId+" rotates normally",Quaternion.Angle(rotations[i],rings[i].transform.rotation)>.2f);
            report.passed=report.checks.All(c=>c.passed);report.seconds=Time.time-started;Snapshot("access");
            walker.MovementLocked=false;Application.targetFrameRate=oldCap;QualitySettings.vSyncCount=oldSync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }

        void Place(Vector3 point)
        {body.enabled=false;walker.transform.position=point+Vector3.up*.08f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        void Face(Transform target)=>walker.View.transform.LookAt(target.position+Vector3.up*1.4f);
        void Step(Vector3 destination,float speed)
        {
            var before=walker.transform.position;var delta=destination-before;delta.y=0;
            walker.MoveOnGround(delta.normalized*Mathf.Min(speed,delta.magnitude/Time.deltaTime),Time.deltaTime);
            report.frames++;report.distance+=Vector3.Distance(before,walker.transform.position);
        }
        IEnumerator Hold(float seconds)
        {
            var ring=walker.GroundRing;var start=ring?ring.transform.InverseTransformPoint(walker.transform.position):walker.transform.position;
            float end=Time.time+seconds,drift=0;
            while(Time.time<end)
            {
                walker.MoveOnGround(Vector3.zero,Time.deltaTime);report.frames++;
                var local=ring?ring.transform.InverseTransformPoint(walker.transform.position):walker.transform.position;local.y=start.y;
                drift=Mathf.Max(drift,Vector3.Distance(start,local));yield return null;
            }
            Check("stationary hold "+(++holdNumber)+" follows its ground",walker.GroundRing==ring && drift<.05f,drift);
        }
        IEnumerator Move(string label,Transform frame,Vector3 point,float speed=6)
        {
            report.segment=label;float until=Time.time+30,lastProgress=Time.time,best=float.MaxValue,minY=10,maxY=-10;bool clear=true,supported=true;
            var expectedRing=frame.GetComponentInParent<StationRotatingRing>();
            while(Time.time<until)
            {
                var target=frame.TransformPoint(point);var delta=target-walker.transform.position;delta.y=0;
                if(delta.magnitude<.1f)break;
                if(delta.magnitude<best-.1f){best=delta.magnitude;lastProgress=Time.time;}
                if(Time.time-lastProgress>4)break;
                Step(target,speed);var local=frame.InverseTransformPoint(walker.transform.position);
                supported&=walker.GroundRing==expectedRing;
                minY=Mathf.Min(minY,local.y);maxY=Mathf.Max(maxY,local.y);
                foreach(var collider in Physics.OverlapCapsule(walker.transform.position+Vector3.up*.4f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore))
                    if(collider.GetComponentInParent<StationGrayboxWalker>()!=walker)
                    {clear=false;string entry=label+": "+collider.name;if(!report.blockages.Contains(entry))report.blockages.Add(entry);}
                yield return null;
            }
            var gap=frame.TransformPoint(point)-walker.transform.position;gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);
            Check(label+" supported",supported && minY>-.2f && maxY<.25f,maxY-minY);
            Check(label+" no penetration",clear);Snapshot("progress");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Snapshot(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
