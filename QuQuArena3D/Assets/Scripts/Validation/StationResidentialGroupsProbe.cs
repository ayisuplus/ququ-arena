using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Opt-in movement verification of the new court; no match or save integration.
    public sealed class StationResidentialGroupsProbe : MonoBehaviour
    {
        [Serializable] public sealed class Report
        {
            public float phase, distance;
            public bool passed;
            public string scope;
            public List<StandingSample> standing = new List<StandingSample>();
            public List<StationRingPrototypeProbe.Check> checks = new List<StationRingPrototypeProbe.Check>();
        }
        [Serializable] public sealed class StandingSample
        {
            public Vector3 start, finish;
            public float horizontal, vertical, fps, seconds, ringAngle;
            public bool supported;
        }
        string output;
        bool standingOnly;
        readonly Report report = new Report();
        StationGrayboxWalker walker;
        StationRotatingRing ring;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-residential-groups-output");
            if(at<0||at+1>=args.Length||!Path.IsPathRooted(args[at+1]))return;
            var probe=new GameObject("Residential groups route verification").AddComponent<StationResidentialGroupsProbe>();
            probe.standingOnly=Array.IndexOf(args,"--station-residential-groups-standing-only")>=0;
            probe.output=args[at+1];int phase=Array.IndexOf(args,"--station-residential-groups-phase");
            if(phase>=0&&phase+1<args.Length)probe.report.phase=float.Parse(args[phase+1],System.Globalization.CultureInfo.InvariantCulture);
        }

        IEnumerator Start()
        {
            yield return null;yield return null;
            if(!UnityEngine.SceneManagement.SceneManager.GetActiveScene().path.EndsWith("BlackHoleStationThreeRingBuildingsV015.unity"))throw new InvalidOperationException("Real-building candidate required");
            walker=FindFirstObjectByType<StationGrayboxWalker>();walker.enabled=false;
            ring=Array.Find(FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None),r=>r.RingId=="v015-r3");
            ring.transform.rotation=Quaternion.Euler(0,report.phase,0);
            var controller=walker.GetComponent<CharacterController>();controller.enabled=false;
            report.scope=standingOnly?"Three local standing diagnostics":"Full residential court routes";
            if(standingOnly)
            {
                foreach(var site in new[]{new Vector2(199,37),new Vector2(237,96),new Vector2(219,143)})
                {
                    controller.enabled=false;walker.transform.position=Point(site.x,site.y)+Vector3.up*.08f;controller.enabled=true;
                    Physics.SyncTransforms();walker.ResetGroundReference();
                    yield return Walk(site.x,site.y,site.y+2);yield return Standing();
                }
            }
            else
            {
            walker.transform.position=Point(199,37)+Vector3.up*.08f;controller.enabled=true;
            Physics.SyncTransforms();walker.ResetGroundReference();
            yield return Walk(199,37,80);yield return Radial(199,191,80);yield return Radial(191,204,80);yield return Radial(204,199,80);
            yield return Walk(199,80,60);yield return Radial(199,206,60);yield return Radial(206,199,60);
            yield return Walk(199,60,50);yield return Radial(199,191,50);yield return Radial(191,206,50);yield return Radial(206,199,50);
            yield return Walk(199,50,40);yield return Radial(199,206,40);yield return Radial(206,199,40);yield return Walk(199,40,37);yield return Standing();
            controller.enabled=false;walker.transform.position=Point(237,96)+Vector3.up*.08f;controller.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();
            yield return Walk(237,96,104);yield return Walk(237,104,100);yield return Radial(237,247,100);yield return Radial(247,235,100);yield return Radial(235,237,100);yield return Walk(237,100,96);yield return Standing();
            controller.enabled=false;walker.transform.position=Point(219,143)+Vector3.up*.08f;controller.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();
            yield return Walk(219,143,157);yield return Walk(219,157,150);yield return Radial(219,191,150);yield return Radial(191,219,150);yield return Walk(219,150,143);yield return Standing();
            }
            report.passed=report.checks.TrueForAll(c=>c.passed);Directory.CreateDirectory(output);
            File.WriteAllText(Path.Combine(output,"groups.json"),JsonUtility.ToJson(report,true));
            walker.enabled=true;if(!Application.isEditor)Application.Quit(report.passed?0:1);
        }


        IEnumerator Standing()
        {
            var local=ring.transform.InverseTransformPoint(walker.transform.position);float started=Time.time,until=Time.time+3,max=0;int frame=Time.frameCount;
            var rotation=ring.transform.rotation;var sample=new StandingSample{start=local,supported=true};
            while(Time.time<until){walker.MoveOnGround(Vector3.zero,Time.deltaTime);var p=ring.transform.InverseTransformPoint(walker.transform.position);max=Mathf.Max(max,Vector3.Distance(local,p));sample.horizontal=Mathf.Max(sample.horizontal,Vector2.Distance(new Vector2(local.x,local.z),new Vector2(p.x,p.z)));sample.vertical=Mathf.Max(sample.vertical,Mathf.Abs(local.y-p.y));sample.supported&=walker.GroundRing==ring;yield return null;}
            sample.finish=ring.transform.InverseTransformPoint(walker.transform.position);sample.seconds=Time.time-started;sample.fps=(Time.frameCount-frame)/sample.seconds;sample.ringAngle=Quaternion.Angle(rotation,ring.transform.rotation);report.standing.Add(sample);
            Check("Standing follows outer ring",walker.GroundRing==ring&&max<.04f,max);
        }
        Vector3 Point(float radius,float angle)=>ring.transform.TransformPoint(Quaternion.Euler(0,angle,0)*Vector3.right*radius);
        IEnumerator Walk(float radius,float from,float to)
        {
            int count=Mathf.CeilToInt(Mathf.Abs(to-from)/2);
            for(int i=1;i<=count;i++)yield return Move("Court arc "+from+" to "+to+" point "+i,()=>Point(radius,Mathf.Lerp(from,to,(float)i/count)));
        }
        IEnumerator Radial(float from,float to,float angle)=>Move("Court to ring "+from+" to "+to,()=>Point(to,angle));
        IEnumerator Move(string label,Func<Vector3> target)
        {
            float end=Time.time+15,minY=10,maxY=-10;bool clear=true,supported=true;
            while(Time.time<end)
            {
                var before=walker.transform.position;var delta=target()-before;delta.y=0;if(delta.magnitude<.1f)break;
                walker.MoveOnGround(delta.normalized*Mathf.Min(4,delta.magnitude/Time.deltaTime),Time.deltaTime);
                supported&=walker.GroundRing==ring;var p=walker.transform.position;report.distance+=Vector3.Distance(p,before);minY=Mathf.Min(minY,p.y);maxY=Mathf.Max(maxY,p.y);
                foreach(var c in Physics.OverlapCapsule(p+Vector3.up*.35f,p+Vector3.up*1.45f,.27f))
                    if(!c.isTrigger&&c.GetComponentInParent<StationGrayboxWalker>()!=walker)clear=false;
                yield return null;
            }
            var gap=target()-walker.transform.position;gap.y=0;
            Check(label+" reached",gap.magnitude<.15f,gap.magnitude);Check(label+" supported",supported&&minY>-.15f&&maxY<.2f,maxY-minY);Check(label+" clear",clear,0);
        }
        void Check(string name,bool passed,float error)=>report.checks.Add(new StationRingPrototypeProbe.Check{name=name,passed=passed,error=error});
    }
}
