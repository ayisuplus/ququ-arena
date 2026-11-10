using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Opt-in Player validation of the built circular bowl using the normal movement controller.
    public sealed class StationCircularStandProbe : MonoBehaviour
    {
        [Serializable] sealed class Report
        {
            public string scene, segment, scope;
            public float phase, seconds, distance;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks = new List<StationRingPrototypeProbe.Check>();
            public List<string> blockages = new List<string>();
            public List<string> supportGaps = new List<string>();
        }
        string output;
        readonly Report report = new Report();
        StationGrayboxWalker walker;
        CharacterController body;
        StationRotatingRing ring;
        bool aborted;
        bool stairsOnly;
        bool guardsOnly;
        const float Top = 17.175f;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs(); int at=Array.IndexOf(args,"--station-circular-stand-output");
            if(at<0 || at+1>=args.Length || !Path.IsPathRooted(args[at+1]))return;
            var p=new GameObject("Circular stand route verification").AddComponent<StationCircularStandProbe>();
            p.output=args[at+1]; int phase=Array.IndexOf(args,"--station-circular-stand-phase");
            p.stairsOnly=Array.IndexOf(args,"--station-circular-stairs-only")>=0;
            p.guardsOnly=Array.IndexOf(args,"--station-circular-guards-only")>=0;
            if(phase>=0 && phase+1<args.Length)p.report.phase=float.Parse(args[phase+1],System.Globalization.CultureInfo.InvariantCulture);
        }
        IEnumerator Start()
        {
            yield return null; yield return null;
            report.scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path;
            report.scope=guardsOnly?"Four guard pressure checks only":stairsOnly?"First stair and its eight row connections only":"Four entrances, four ramps, full concourse, four stairs, 17 row connections and four guards";
            Directory.CreateDirectory(output); float start=Time.time;
            int cap=Application.targetFrameRate,sync=QualitySettings.vSyncCount;
            Application.targetFrameRate=60; QualitySettings.vSyncCount=0;
            walker=FindFirstObjectByType<StationGrayboxWalker>(); body=walker.GetComponent<CharacterController>();
            walker.enabled=true; walker.MovementLocked=true;
            var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);
            foreach(var r in rings)r.transform.rotation=Quaternion.Euler(0,r.RingId=="v015-r2"?-report.phase:report.phase,0);
            ring=rings.Single(r=>r.RingId=="v015-r1"); var initial=ring.transform.rotation;
            Check("circular bowl present",GameObject.Find("V015 circular spectator stands"));
            Check("normal time",Mathf.Approximately(Time.timeScale,1));
            var gate=FindFirstObjectByType<StationCoreEastGate>();
            for(int q=0;q<4 && !aborted && !stairsOnly && !guardsOnly;q++)
            {
                var rotation=Quaternion.Euler(0,q*90,0);
                var path=new List<Vector3>{new Vector3(81,0,0),new Vector3(46,0,0),new Vector3(46,0,3),new Vector3(37,0,3),new Vector3(37,0,0)};
                path=path.Select(p=>rotation*p).ToList();
                Place(path[0]);
                if(q==0)Check("ground entrance opens",gate.Use() && gate.IsOpen);
                yield return Route("ground entrance and lift bypass "+q,path);
                if(q==0 && !aborted)Check("ground entrance closes",gate.Use() && !gate.IsOpen);
            }
            // Each independent route is placed only at its start; both directions use real walking.
            for(int q=0;q<4 && !aborted && !stairsOnly && !guardsOnly;q++)
            {
                float a=q*90; var path=new List<Vector3>{P(74,a+4,0),P(74,a+7,0)};
                for(int i=1;i<=38;i++)path.Add(P(74,a+7+i*2,Top*i/38));
                path.Add(P(74,a+85,Top)); path.Add(P(65,a+85,Top));
                yield return Route("outer ramp "+q,path);
            }
            if(!aborted && !stairsOnly && !guardsOnly)
            {
                Place(P(65,0,Top));
                for(int a=2;a<=360 && !aborted;a+=2)yield return Move("upper circular walk "+a,P(65,a,Top));
                yield return Hold("upper circle");
            }
            for(int q=0;q<(stairsOnly?1:4) && !aborted && !guardsOnly;q++)
            {
                float a=q*90+45; var path=new List<Vector3>{P(37,a,0)};
                for(int step=0;step<112;step++)path.Add(P(38+20f*(step+.5f)/112,a,Top*(step+1)/112));
                path.Add(P(58.4f,a,Top)); path.Add(P(65,a,Top));
                yield return Route("radial stair "+q,path);
            }
            for(int q=0;q<(stairsOnly?1:4) && !aborted && !guardsOnly;q++)for(int row=0;row<8 && !aborted;row++)
            {
                if(q>0 && row!=1 && row!=4 && row!=7)continue;
                float r=38+row*2.5f,a=q*90+45,y=Top*row/8;
                float stairY=Top*Mathf.Ceil((r+.05f-38)*112/20)/112;
                var path=new List<Vector3>{P(r+.05f,a,stairY),P(r+.05f,a-3,y),P(r+1.9f,a-3,y)};
                for(int i=1;i<=8;i++)path.Add(P(r+1.9f,a-3-i*2,y));
                yield return Route("row access stair "+q+" row "+row,path);
            }
            if(!aborted && !stairsOnly)
            {
                yield return Press("outer concourse",68,72,20,Top,69.85f);
                yield return Press("inner concourse",60.7f,57,3,Top,59.5f);
                yield return Press("outer ramp",74,78,45,Top*.5f,75.9f);
                yield return Press("inner ramp",74,70,45,Top*.5f,72.1f);
            }
            Check("normal ring rotation",Quaternion.Angle(initial,ring.transform.rotation)>.05f);
            report.seconds=Time.time-start; report.passed=report.checks.All(c=>c.passed); Save("stands");
            walker.MovementLocked=false; Application.targetFrameRate=cap; QualitySettings.vSyncCount=sync;
            if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }
        static Vector3 P(float r,float a,float y)=>Quaternion.Euler(0,a,0)*new Vector3(r,y,0);
        Vector3 World(Vector3 p)=>ring.transform.TransformPoint(p);
        void Place(Vector3 p)
        {
            body.enabled=false; walker.transform.position=World(p)+Vector3.up*.08f; body.enabled=true;
            Physics.SyncTransforms(); walker.ResetGroundReference();
        }
        void Step(Vector3 target)
        {
            var before=walker.transform.position; var d=target-before; d.y=0;
            walker.MoveOnGround(d.normalized*Mathf.Min(6,d.magnitude/Time.deltaTime),Time.deltaTime);
            report.distance+=Vector3.Distance(before,walker.transform.position);
        }
        IEnumerator Route(string label,List<Vector3> path)
        {
            Place(path[0]);
            for(int i=1;i<path.Count && !aborted;i++)yield return Move(label+" up "+i,path[i]);
            if(!aborted)yield return Hold(label+" top");
            for(int i=path.Count-2;i>=0 && !aborted;i--)yield return Move(label+" down "+i,path[i]);
        }
        IEnumerator Hold(string label)
        {
            var local=ring.transform.InverseTransformPoint(walker.transform.position); float end=Time.time+2,drift=0; bool supported=true;
            while(Time.time<end)
            {
                Step(walker.transform.position); supported&=walker.GroundRing==ring;
                drift=Mathf.Max(drift,Vector3.Distance(local,ring.transform.InverseTransformPoint(walker.transform.position))); yield return null;
            }
            Check(label+" holds rotating floor",supported && drift<.05f,drift);
        }
        IEnumerator Move(string label,Vector3 local)
        {
            report.segment=label; float end=Time.time+25,progress=Time.time,best=float.MaxValue; bool supported=true,clear=true;
            while(Time.time<end)
            {
                var target=World(local); var d=target-walker.transform.position; d.y=0; if(d.magnitude<.07f)break;
                if(d.magnitude<best-.07f){best=d.magnitude;progress=Time.time;} if(Time.time-progress>4)break;
                Step(target); supported&=walker.GroundRing==ring;
                if(walker.GroundRing!=ring && report.supportGaps.Count<30)
                {
                    var hits=Physics.RaycastAll(walker.transform.position+Vector3.up*.25f,Vector3.down,2,~0,QueryTriggerInteraction.Ignore)
                        .Where(h=>h.collider!=body).OrderBy(h=>h.distance);
                    report.supportGaps.Add(label+" local="+ring.transform.InverseTransformPoint(walker.transform.position).ToString("F4")+
                        " grounded="+body.isGrounded+" floor="+string.Join(";",hits.Select(h=>h.collider.name+" distance="+h.distance.ToString("F4")+" normal="+h.normal.ToString("F4"))));
                }
                foreach(var c in Physics.OverlapCapsule(walker.transform.position+Vector3.up*.65f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore))
                    if(c.GetComponentInParent<StationGrayboxWalker>()!=walker)
                    {clear=false; string entry=label+": "+c.name; if(!report.blockages.Contains(entry))report.blockages.Add(entry);}
                yield return null;
            }
            var gap=World(local)-walker.transform.position; float height=Mathf.Abs(gap.y); gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude); Check(label+" elevation",height<.35f,height);
            Check(label+" supported",supported); Check(label+" body clearance",clear);
            if(gap.magnitude>=.15f || height>=.35f)aborted=true;
            Save("progress");
        }
        IEnumerator Press(string label,float from,float to,float angle,float height,float edge)
        {
            Place(P(from,angle,height)); float end=Time.time+1.2f,worst=0,maxHeight=0; bool supported=true;
            Check(label+" start clear",!Physics.OverlapCapsule(walker.transform.position+Vector3.up*.4f,walker.transform.position+Vector3.up*1.4f,.27f,~0,QueryTriggerInteraction.Ignore)
                .Any(c=>c.GetComponentInParent<StationGrayboxWalker>()!=walker));
            while(Time.time<end)
            {
                Step(World(P(to,angle,height))); var p=ring.transform.InverseTransformPoint(walker.transform.position);
                float radius=new Vector2(p.x,p.z).magnitude; worst=Mathf.Max(worst,(radius-edge)*Mathf.Sign(to-from));
                maxHeight=Mathf.Max(maxHeight,Mathf.Abs(p.y-height)); supported&=walker.GroundRing==ring; yield return null;
            }
            var delta=World(P(to,angle,height))-walker.transform.position; delta.y=0;
            string guard=label.Contains("concourse")?"Circular stand concourse guard":"Circular stand ramp "+(to>from?"outer":"inner")+" guard";
            Check(label+" contacts intended guard",Physics.OverlapCapsule(walker.transform.position+Vector3.up*.6f,walker.transform.position+Vector3.up*1.2f,.6f,~0,QueryTriggerInteraction.Ignore)
                .Any(c=>c.name==guard));
            Check(label+" guard blocks target",delta.magnitude>.6f,delta.magnitude);
            Check(label+" stays inside guard",worst<.05f,worst); Check(label+" floor support",supported && maxHeight<.35f,maxHeight);
        }
        void Check(string name,bool passed,float error=0)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
        void Save(string name)=>File.WriteAllText(Path.Combine(output,name+".json"),JsonUtility.ToJson(report,true));
    }
}
