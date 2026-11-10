using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Opt-in movement verification of the new court; no match or save integration.
    public sealed class StationPublicCourtProbe : MonoBehaviour
    {
        [Serializable] public sealed class Report
        {
            public float phase, distance;
            public bool passed;
            public List<StationRingPrototypeProbe.Check> checks = new List<StationRingPrototypeProbe.Check>();
        }
        string output;
        readonly Report report = new Report();
        StationGrayboxWalker walker;
        StationRotatingRing ring;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-public-court-output");
            if(at<0||at+1>=args.Length||!Path.IsPathRooted(args[at+1]))return;
            var probe=new GameObject("Public court route verification").AddComponent<StationPublicCourtProbe>();
            probe.output=args[at+1];int phase=Array.IndexOf(args,"--station-public-court-phase");
            if(phase>=0&&phase+1<args.Length)probe.report.phase=float.Parse(args[phase+1],System.Globalization.CultureInfo.InvariantCulture);
        }

        IEnumerator Start()
        {
            yield return null;yield return null;
            walker=FindFirstObjectByType<StationGrayboxWalker>();walker.enabled=false;
            ring=Array.Find(FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None),r=>r.RingId=="v015-r2");
            ring.transform.rotation=Quaternion.Euler(0,report.phase,0);
            var controller=walker.GetComponent<CharacterController>();controller.enabled=false;
            walker.transform.position=Point(110.5f,3)+Vector3.up*.08f;controller.enabled=true;
            Physics.SyncTransforms();walker.ResetGroundReference();
            yield return Walk(3,50);yield return Walk(50,3);
            // The public inner ring route remains outside the new courtyard footprint.
            yield return Radial(110.5f,96,3);yield return Radial(96,110.5f,3);
            var local=ring.transform.InverseTransformPoint(walker.transform.position);float until=Time.time+3,max=0;
            while(Time.time<until){walker.MoveOnGround(Vector3.zero,Time.deltaTime);max=Mathf.Max(max,Vector3.Distance(local,ring.transform.InverseTransformPoint(walker.transform.position)));yield return null;}
            Check("Standing follows middle ring",walker.GroundRing==ring&&max<.04f,max);
            report.passed=report.checks.TrueForAll(c=>c.passed);Directory.CreateDirectory(output);
            File.WriteAllText(Path.Combine(output,"court.json"),JsonUtility.ToJson(report,true));
            walker.enabled=true;if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }

        Vector3 Point(float radius,float angle)=>ring.transform.TransformPoint(Quaternion.Euler(0,angle,0)*Vector3.right*radius);
        IEnumerator Walk(float from,float to)
        {
            int count=Mathf.CeilToInt(Mathf.Abs(to-from)/2);
            for(int i=1;i<=count;i++)yield return Move("Court arc "+from+" to "+to+" point "+i,()=>Point(110.5f,Mathf.Lerp(from,to,(float)i/count)));
        }
        IEnumerator Radial(float from,float to,float angle)=>Move("Court to ring "+from+" to "+to,()=>Point(to,angle));
        IEnumerator Move(string label,Func<Vector3> target)
        {
            float end=Time.time+15,minY=10,maxY=-10;bool clear=true;
            while(Time.time<end)
            {
                var before=walker.transform.position;var delta=target()-before;delta.y=0;if(delta.magnitude<.1f)break;
                walker.MoveOnGround(delta.normalized*Mathf.Min(4,delta.magnitude/Time.deltaTime),Time.deltaTime);
                var p=walker.transform.position;report.distance+=Vector3.Distance(p,before);minY=Mathf.Min(minY,p.y);maxY=Mathf.Max(maxY,p.y);
                foreach(var c in Physics.OverlapCapsule(p+Vector3.up*.35f,p+Vector3.up*1.45f,.27f))
                    if(!c.isTrigger&&c.GetComponentInParent<StationGrayboxWalker>()!=walker)clear=false;
                yield return null;
            }
            var gap=target()-walker.transform.position;gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);Check(label+" supported",minY>-.15f&&maxY<.2f,maxY-minY);Check(label+" clear",clear,0);
        }
        void Check(string name,bool passed,float error)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
    }
}
