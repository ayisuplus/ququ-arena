using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    public sealed class StationRingEdgeProbe : MonoBehaviour
    {
        [Serializable] public sealed class Result
        {
            public string scene, segment;
            public float phase, seconds, distance;
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

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-edge-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var p=new GameObject("V015 edge validation").AddComponent<StationRingEdgeProbe>();p.OutputDirectory=args[at+1];
            int phase=Array.IndexOf(args,"--station-edge-probe-phase");
            if(phase>=0 && phase+1<args.Length)p.Phase=float.Parse(args[phase+1],System.Globalization.CultureInfo.InvariantCulture);
        }
        IEnumerator Start()
        {
            yield return null;yield return null;
            report=new Result{scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path,phase=Phase};
            if(!report.scene.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Real candidate required");
            Directory.CreateDirectory(OutputDirectory);started=Time.time;
            int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;Application.targetFrameRate=60;QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();walker.MovementLocked=true;
            var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            foreach(var r in rings)r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-Phase:Phase,0);
            var inner=rings.Single(r=>r.RingId=="v015-r1");var outer=rings.Single(r=>r.RingId=="v015-r3");
            Check("normal time",Mathf.Approximately(Time.timeScale,1));
            for(int a=0;a<360;a+=30)yield return Press("well "+a,inner.transform,P(25.16f,a),-P(1,a),inner);
            for(int a=30;a<=330;a+=30)yield return Press("outer "+a,null,P(254,a),P(1,a),outer);
            foreach(float side in new[]{-1f,1f})
            {
                float a=side*22.5f;
                yield return Press("arrival side "+side,null,P(292,a),Quaternion.Euler(0,a,0)*Vector3.right*side,null);
                yield return Press("arrival shoulder "+side,null,P(330,side*15),P(1,side*15),null);
                a=side*5.625f;
                yield return Press("berth side "+side,null,P(400,a),Quaternion.Euler(0,a,0)*Vector3.right*side,null);
            }
            yield return Press("berth end",null,P(470,0),Vector3.forward,null);
            yield return Circuit("well walk",inner,26.5f);
            yield return Circuit("outer promenade",outer,252);
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("edges");
            walker.MovementLocked=false;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        static Vector3 P(float radius,float angle)=>Quaternion.Euler(0,angle,0)*Vector3.forward*radius;
        static Vector3 World(Transform frame,Vector3 p)=>frame?frame.TransformPoint(p):p;
        void Place(Vector3 p)
        {body.enabled=false;walker.transform.position=p+Vector3.up*.08f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        void Step(Vector3 target)
        {var before=walker.transform.position;var d=target-before;d.y=0;walker.MoveOnGround(d.normalized*Mathf.Min(6,d.magnitude/Time.deltaTime),Time.deltaTime);report.distance+=Vector3.Distance(before,walker.transform.position);}
        IEnumerator Press(string label,Transform frame,Vector3 edge,Vector3 outward,StationRotatingRing ground)
        {
            report.segment=label;Place(World(frame,edge-outward*.9f));
            float end=Time.time+1.1f,worst=-100,minY=100,maxY=-100;bool supported=true;
            while(Time.time<end)
            {
                Step(World(frame,edge+outward*2));var p=frame?frame.InverseTransformPoint(walker.transform.position):walker.transform.position;
                worst=Mathf.Max(worst,Vector3.Dot(p-edge,outward));minY=Mathf.Min(minY,p.y);maxY=Mathf.Max(maxY,p.y);
                supported&=walker.GroundRing==ground;yield return null;
            }
            var final=frame?frame.InverseTransformPoint(walker.transform.position):walker.transform.position;
            Check(label+" actual edge reached",Vector3.Dot(final-edge,outward)>-.6f);
            Check(label+" barrier blocks",worst<-.2f,worst);
            Check(label+" stays on floor",minY>-.1f && maxY<.3f,maxY-minY);
            Check(label+" correct ground reference",supported);Save("progress");
        }
        IEnumerator Circuit(string label,StationRotatingRing ring,float radius)
        {
            var rotation=ring.transform.rotation;Place(ring.transform.TransformPoint(P(radius,0)));
            for(int angle=5;angle<=360;angle+=5)
            {
                report.segment=label+" "+angle;float end=Time.time+12,lastProgress=Time.time,best=float.MaxValue;
                bool supported=true,clear=true;
                while(Time.time<end)
                {
                    var target=ring.transform.TransformPoint(P(radius,angle));var delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.1f)break;
                    if(delta.magnitude<best-.1f){best=delta.magnitude;lastProgress=Time.time;}if(Time.time-lastProgress>3)break;
                    Step(target);supported&=walker.GroundRing==ring && walker.transform.position.y>-.1f && walker.transform.position.y<.3f;
                    foreach(var c in Physics.OverlapCapsule(walker.transform.position+Vector3.up*.5f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore))
                        if(c.GetComponentInParent<StationGrayboxWalker>()!=walker){clear=false;if(!report.blockages.Contains(c.name))report.blockages.Add(c.name);}
                    yield return null;
                }
                var gap=ring.transform.TransformPoint(P(radius,angle))-walker.transform.position;gap.y=0;
                Check(report.segment+" reached",gap.magnitude<.15f,gap.magnitude);Check(report.segment+" supported",supported);Check(report.segment+" no obstruction",clear);Save("progress");
                if(gap.magnitude>=.15f)throw new InvalidOperationException("Edge circuit blocked at "+report.segment);
            }
            Check(label+" normal rotation",Quaternion.Angle(rotation,ring.transform.rotation)>.1f);
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
