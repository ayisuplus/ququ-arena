using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Opt-in exterior route probe; no behaviour is added to normal game sessions.
    public sealed class StationCreativeBuildingProbeV016 : MonoBehaviour
    {
        [Serializable] sealed class Report
        {
            public string scene, segment, graphicsDevice, building, ringId;
            public int triangles, collisionTriangles;
            public float phase, distance, seconds, holdYaw, expectedHoldYaw;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks = new List<StationRingPrototypeProbe.Check>();
            public List<string> obstructions = new List<string>();
        }
        readonly Report report = new Report();
        string output;
        StationGrayboxWalker walker;
        StationRotatingRing ring;
        Transform frame;
        float halfWidth=15, halfDepth=13;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();
            string Arg(string key){int i=Array.IndexOf(args,key);return i>=0&&i+1<args.Length?args[i+1]:null;}
            string path=Arg("--station-v016-b02-output");
            if(string.IsNullOrEmpty(path)||!Path.IsPathRooted(path))return;
            var probe=new GameObject("V016 B02 exterior route validation").AddComponent<StationCreativeBuildingProbeV016>();
            probe.output=path;
            probe.report.building=Arg("--station-v016-building")??"B02";
            if(probe.report.building!="B01" && probe.report.building!="B02" && probe.report.building!="B03" && probe.report.building!="B04")throw new ArgumentException("B01, B02, B03 or B04 required");
            if(probe.report.building=="B01"){probe.halfWidth=19;probe.halfDepth=14;}
            if(probe.report.building=="B03"){probe.halfWidth=18;probe.halfDepth=12;}
            if(probe.report.building=="B04"){probe.halfWidth=17;probe.halfDepth=14;}
            probe.report.phase=float.Parse(Arg("--station-v016-b02-phase")??"0",System.Globalization.CultureInfo.InvariantCulture);
        }

        IEnumerator Start()
        {
            yield return null;yield return null;
            report.scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path;
            report.graphicsDevice=SystemInfo.graphicsDeviceName;
            if(!report.scene.EndsWith("BlackHoleStationCreativeBuildingsV016.unity"))throw new InvalidOperationException("V016 candidate required");
            Directory.CreateDirectory(output);float started=Time.time;
            int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();bool locked=walker.MovementLocked;
            walker.MovementLocked=true;
            frame=GameObject.Find(report.building=="B01"?"V016 B01 moon sail exterior trial":report.building=="B03"?"V016 B03 tidal seed exterior trial":report.building=="B04"?"V016 B04 terraced lounge exterior trial":"V016 B02 crystal archive exterior trial").transform;
            report.triangles=frame.GetComponentsInChildren<MeshFilter>().Sum(m=>Enumerable.Range(0,m.sharedMesh.subMeshCount).Sum(i=>(int)m.sharedMesh.GetIndexCount(i)/3));
            Check("Runtime mesh index metadata present",report.triangles>0);
            report.collisionTriangles=frame.GetComponentsInChildren<MeshCollider>().Sum(c=>Enumerable.Range(0,c.sharedMesh.subMeshCount).Sum(i=>(int)c.sharedMesh.GetIndexCount(i)/3));
            Check("Collision triangle budget",report.collisionTriangles>0 && report.collisionTriangles<5000,report.collisionTriangles);
            var renderers=frame.GetComponentsInChildren<Renderer>();var renderBounds=renderers[0].bounds;
            foreach(var renderer in renderers)renderBounds.Encapsulate(renderer.bounds);
            var colliders=frame.GetComponentsInChildren<MeshCollider>();var collisionBounds=colliders[0].bounds;
            foreach(var collider in colliders)collisionBounds.Encapsulate(collider.bounds);
            Check("Collision proxy aligned with render bounds",Vector3.Distance(renderBounds.center,collisionBounds.center)<.5f && Vector3.Distance(renderBounds.size,collisionBounds.size)<.5f,Vector3.Distance(renderBounds.size,collisionBounds.size));
            ring=frame.GetComponentInParent<StationRotatingRing>();
            report.ringId=ring.RingId;
            ring.transform.rotation=Quaternion.Euler(0,-report.phase,0);
            Check("Expected ring remains enabled and rotating",ring.RingId==((report.building=="B03"||report.building=="B04")?"v015-r3":"v015-r2") && ring.enabled && walker.enabled);
            if(report.building=="B04")Check("Five independent lounge modules retained",frame.GetComponentsInChildren<Transform>().Count(t=>t.name.StartsWith("Module0"))==5);
            Check("Core gameplay remains disabled",!FindFirstObjectByType<ArenaStationLiveMatch>().enabled);
            var body=walker.GetComponent<CharacterController>();body.enabled=false;
            walker.transform.position=frame.TransformPoint(new Vector3(-halfWidth,.08f,-halfDepth));body.enabled=true;
            Physics.SyncTransforms();walker.ResetGroundReference();
            for(int i=0;i<3;i++){walker.MoveOnGround(Vector3.zero,Time.deltaTime);yield return null;}
            yield return Move("Rear perimeter",halfWidth,-halfDepth);
            yield return Move("Right perimeter",halfWidth,halfDepth);
            yield return Move("Front perimeter",-halfWidth,halfDepth);
            yield return Move("Left perimeter",-halfWidth,-halfDepth);
            var local=frame.InverseTransformPoint(walker.transform.position);float yaw=ring.transform.eulerAngles.y;
            float holdStart=Time.time,until=Time.time+4,maxDrift=0;
            while(Time.time<until)
            {
                walker.MoveOnGround(Vector3.zero,Time.deltaTime);
                maxDrift=Mathf.Max(maxDrift,Vector3.Distance(local,frame.InverseTransformPoint(walker.transform.position)));
                yield return null;
            }
            Check("Standing follows building ring",walker.GroundRing==ring && maxDrift<.04f,maxDrift);
            report.holdYaw=Mathf.DeltaAngle(yaw,ring.transform.eulerAngles.y);
            report.expectedHoldYaw=ring.DegreesPerSecond*(Time.time-holdStart);
            Check("Ring moves at normal speed",Mathf.Abs(report.holdYaw)>.001f && Mathf.Abs(report.holdYaw-report.expectedHoldYaw)<.005f,report.holdYaw-report.expectedHoldYaw);
            // The exterior trial is closed; verify its front blocks entry rather than allowing a fall into an unfinished shell.
            var rayOrigin=frame.TransformPoint(new Vector3(0,1.2f,halfDepth));
            bool hit=Physics.Raycast(rayOrigin,-frame.forward,out var barrier,28,~0,QueryTriggerInteraction.Ignore);
            Check("Exterior facade has collision",hit && barrier.collider.transform.IsChildOf(frame));
            if(report.building=="B03")
            {
                // The FBX axis conversion places the broad entrance on local +X.
                var entranceOrigin=frame.TransformPoint(new Vector3(halfWidth,1.2f,0));
                bool entranceHit=Physics.Raycast(entranceOrigin,-frame.right,out var entranceBarrier,5,~0,QueryTriggerInteraction.Ignore);
                Check(frame.GetComponentInChildren<StationConservatoryDoor>()?"Automatic greenhouse entrance closes when unattended":"Unfinished greenhouse entrance remains closed",entranceHit && entranceBarrier.collider.transform.IsChildOf(frame));
            }
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("route");
            walker.MovementLocked=locked;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }

        IEnumerator Move(string label,float x,float z)
        {
            report.segment=label;float until=Time.time+20,minY=10,maxY=-10;bool supported=true,clear=true;
            var target=new Vector3(x,.035f,z);
            while(Time.time<until)
            {
                var before=walker.transform.position;var delta=frame.TransformPoint(target)-before;delta.y=0;
                if(delta.magnitude<.1f)break;
                walker.MoveOnGround(delta.normalized*Mathf.Min(3,delta.magnitude/Time.deltaTime),Time.deltaTime);
                var p=walker.transform.position;report.distance+=Vector3.Distance(p,before);
                float y=frame.InverseTransformPoint(p).y;minY=Mathf.Min(minY,y);maxY=Mathf.Max(maxY,y);
                supported&=walker.GroundRing==ring;
                foreach(var c in Physics.OverlapCapsule(p+Vector3.up*.4f,p+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore))
                    if(c.GetComponentInParent<StationGrayboxWalker>()!=walker)
                    {clear=false;if(!report.obstructions.Contains(c.name))report.obstructions.Add(c.name);}
                yield return null;
            }
            var gap=frame.TransformPoint(target)-walker.transform.position;gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);
            Check(label+" clear",clear);
            Check(label+" supported by building ring",supported && minY>-.2f && maxY<.25f,maxY-minY);
            Save("progress");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(output,name+".json"),JsonUtility.ToJson(report,true));
    }
}
