using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    public sealed class StationRingUpperGuardProbe : MonoBehaviour
    {
        [Serializable] public sealed class Pressure
        {public string label;public Vector3 final,target;public float minHeight,maxHeight,maxOutward;public bool upperFloorSupported;}
        [Serializable] public sealed class Result
        {
            public string scene, segment;
            public float phase, seconds, distance;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks=new List<StationRingPrototypeProbe.Check>();
            public List<string> blockages=new List<string>();
            public List<Pressure> pressures=new List<Pressure>();
        }
        public string OutputDirectory;
        public float Phase;
        StationGrayboxWalker walker;
        CharacterController body;
        Collider[] floors;
        Result report;
        float started;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-upper-guard-probe-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var p=new GameObject("V015 upper guard validation").AddComponent<StationRingUpperGuardProbe>();p.OutputDirectory=args[at+1];
            int phase=Array.IndexOf(args,"--station-upper-guard-probe-phase");
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
            floors=FindObjectsByType<Collider>(FindObjectsSortMode.None).Where(c=>c.enabled && !c.isTrigger &&
                (c.name=="Spectator rise ramp" || c.name=="Spectator upper gallery" || c.name=="Spectator north gallery" ||
                 c.name=="Spectator north crossing" || c.name=="Spectator elevated seat landing" || c.name=="Spectator ramp top connector" ||
                 c.name=="NE elevated view floor" || c.name.StartsWith("NE ascent ramp "))).ToArray();
            var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            foreach(var r in rings)r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-Phase:Phase,0);
            var inner=rings.Single(r=>r.RingId=="v015-r1");var outer=rings.Single(r=>r.RingId=="v015-r3");
            Check("normal time",Mathf.Approximately(Time.timeScale,1));
            Vector3 G(float x,float z)=>new Vector3(x,17.175f,z);
            var cases=new[]{
                ("connector west",G(35,-53),Vector3.left),("connector south",G(39,-56),Vector3.back),
                ("connector east",G(43,-53),Vector3.right),("connector southwest",G(35,-56),new Vector3(-1,0,-1).normalized),
                ("connector southeast",G(43,-56),new Vector3(1,0,-1).normalized),
                ("gallery south join",G(44.5f,-50),Vector3.back),("gallery outside join",G(46,-49.5f),Vector3.right),
                ("gallery inner north",G(40,45),Vector3.left),("gallery inner end",G(40,55),Vector3.left),
                ("north east step",G(45,60),Vector3.forward),("crossing east end",G(43,61.5f),Vector3.right),
                ("crossing northeast",G(43,63),new Vector3(1,0,1).normalized),
                ("landing west",G(1,60),Vector3.left),("landing southwest",G(1,56.5f),new Vector3(-1,0,-1).normalized),
                ("landing northwest",G(1,63.5f),new Vector3(-1,0,1).normalized),
                ("landing north legacy join",G(4.5f,63.5f),Vector3.forward),("landing east legacy strip",G(8,63.5f),new Vector3(1,0,1).normalized)};
            foreach(var c in cases)yield return Press(c.Item1,inner.transform,c.Item2,c.Item3,inner);
            // The lower ramp is overlapped by the gallery slab here; the actual body must still be blocked.
            foreach(float z in new[]{-44f,-47f,-49f})
                yield return Press("ramp upper slab "+z,inner.transform,new Vector3(40,8.6801f+(-z-15)*17/70,z),Vector3.right,inner);
            var frame=GameObject.Find("V015 package - r3-upper-observation").transform;
            foreach(float angle in new[]{-85f,-65f,-48f,205f,212f,216f})foreach(float radius in new[]{7.03f,9.97f})
            {
                float a=angle*Mathf.Deg2Rad;var radial=new Vector3(Mathf.Cos(a),0,Mathf.Sin(a));
                var edge=radial*radius;edge.y=.06f+7.34f*(angle+90)/315;
                yield return Press("spiral "+angle+" radius "+radius,frame,edge,radius<8?-radial:radial,outer);
            }
            foreach(var c in new[]{
                ("platform inner join",new Vector3(-4.97f,7.4f,-4.97f),new Vector3(1,0,1).normalized),
                ("platform east",new Vector3(-4,7.4f,-7),Vector3.right),
                ("platform south",new Vector3(-6,7.4f,-9),Vector3.back),
                ("platform west join",new Vector3(-8,7.4f,-6),Vector3.left),
                ("platform southeast",new Vector3(-4,7.4f,-9),new Vector3(1,0,-1).normalized),
                ("platform southwest",new Vector3(-8,7.4f,-9),new Vector3(-1,0,-1).normalized),
                ("platform entrance outer corner",new Vector3(-8,7.4f,-5),new Vector3(-1,0,1).normalized)})
                yield return Press(c.Item1,frame,c.Item2,c.Item3,outer);
            report.seconds=Time.time-started;report.passed=report.checks.All(c=>c.passed);Save("upper-guards");
            walker.MovementLocked=false;Application.targetFrameRate=cap;QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        static Vector3 World(Transform frame,Vector3 p)=>frame?frame.TransformPoint(p):p;
        void Place(Vector3 p)
        {body.enabled=false;walker.transform.position=p+Vector3.up*.08f;body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();}
        void Step(Vector3 target)
        {var before=walker.transform.position;var d=target-before;d.y=0;walker.MoveOnGround(d.normalized*Mathf.Min(6,d.magnitude/Time.deltaTime),Time.deltaTime);report.distance+=Vector3.Distance(before,walker.transform.position);}
        IEnumerator Press(string label,Transform frame,Vector3 edge,Vector3 outward,StationRotatingRing ground)
        {
            report.segment=label;Place(World(frame,edge-outward*1.3f));
            float end=Time.time+1.1f,worst=-100,minY=100,maxY=-100;bool supported=true,floorSupported=true;
            var overlaps=Physics.OverlapCapsule(walker.transform.position+Vector3.up*.4f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore)
                .Where(c=>c.GetComponentInParent<StationGrayboxWalker>()!=walker).Select(c=>c.name).ToArray();
            Check(label+" start clear",overlaps.Length==0);
            foreach(var name in overlaps)report.blockages.Add(label+": "+name);
            while(Time.time<end)
            {
                Step(World(frame,edge+outward*2));var p=frame?frame.InverseTransformPoint(walker.transform.position):walker.transform.position;
                worst=Mathf.Max(worst,Vector3.Dot(p-edge,outward));minY=Mathf.Min(minY,p.y);maxY=Mathf.Max(maxY,p.y);
                supported&=walker.GroundRing==ground;
                var ray=new Ray(walker.transform.position+Vector3.up*.2f,Vector3.down);
                floorSupported&=floors.Any(c=>c.Raycast(ray,out var hit,.55f) && hit.normal.y>.65f);yield return null;
            }
            var final=frame?frame.InverseTransformPoint(walker.transform.position):walker.transform.position;
            var near=Physics.OverlapCapsule(walker.transform.position+Vector3.up*.6f,walker.transform.position+Vector3.up*1.2f,.6f,~0,QueryTriggerInteraction.Ignore);
            Check(label+" contacts edge barrier",near.Any(c=>c.name.Contains("guard") || c.name.Contains("rail") || c.name.StartsWith("V015 upper protection") ||
                (label.StartsWith("ramp upper slab") && floors.Contains(c) && c.name!="Spectator rise ramp")));
            var gap=final-(edge+outward*2);gap.y=0;
            // At re-entrant floor corners the body may slide onto the adjoining safe slab.
            Check(label+" outside target blocked",gap.magnitude>.6f,gap.magnitude);
            Check(label+" continuous upper floor support",floorSupported);
            report.pressures.Add(new Pressure{label=label,final=final,target=edge+outward*2,minHeight=minY,maxHeight=maxY,maxOutward=worst,upperFloorSupported=floorSupported});
            Check(label+" stays on floor",minY>edge.y-.35f && maxY<edge.y+.35f,maxY-minY);
            Check(label+" correct ground reference",supported);Save("progress");
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(OutputDirectory,name+".json"),JsonUtility.ToJson(report,true));
    }
}
