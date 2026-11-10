using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Opt-in collision traversal. Accelerated steps are neither keyboard input nor performance evidence.
    public sealed class StationPromenadePlayerProbe : MonoBehaviour
    {
        public string Output;
        StationGrayboxWalker walker;
        CharacterController body;
        JObject report;
        readonly JArray segments = new JArray(), checks = new JArray();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();var i = Array.IndexOf(args,"--station-v013-promenade-probe-output");
            if (i < 0 || i + 1 >= args.Length || !Path.IsPathRooted(args[i + 1])) return;
            new GameObject("Promenade route validation").AddComponent<StationPromenadePlayerProbe>().Output=args[i+1];
        }

        IEnumerator Start()
        {
            yield return null;Directory.CreateDirectory(Output);
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();
            report=new JObject{["scene"]=SceneManager.GetActiveScene().name,["mode"]=Application.isEditor?"Editor Play":"Standalone Player",
                ["runner"]="CharacterController.Move, 0.1 m steps, accelerated; one explicit initial placement; no keyboard or FPS claim",
                ["segments"]=segments,["checks"]=checks};
            Check(report["scene"].ToString()=="BlackHoleStationSereneV013","Serene scene");
            Check(FindObjectsByType<StationRoomIdentity>(FindObjectsSortMode.None).Length==6 && FindObjectsByType<StationResidentRoutine>(FindObjectsSortMode.None).Length==6,"Six homes and six residents retained");
            var save=FindFirstObjectByType<StationWorldSave>();report["savePath"]=save.FilePath;
            var cafeFixture=FindFirstObjectByType<StationCafeMoment>();report["cafeInitialState"]=JObject.FromObject(cafeFixture.CaptureState());
            cafeFixture.RestoreState(new StationCafeState{id=cafeFixture.StableId});report["cafeFixture"]="Explicit empty inventory in isolated QA save";
            var match=FindFirstObjectByType<ArenaStationLiveMatch>();match.GetComponent<ArenaConnection>().Disconnect();
            walker.enabled=false;body.enabled=false;walker.transform.position=P(210,180);body.enabled=true;
            yield return Route(P(190,180),P(190,209),P(190,217),P(218,217),Ring(6));
            yield return Arc(6,18);yield return Frame("northwest-ring",new Vector3(-207,2,205));
            yield return Route(P(-218,217),P(-190,217),P(-190,205),P(-204,205));
            if(report["error"]==null){var desk=FindFirstObjectByType<StationResearchDesk>();walker.enabled=true;Check(desk.Use() && desk.IsOpen,"Research desk opens from continuous walk");Check(desk.Use() && !desk.IsOpen,"Research desk closes");}
            yield return Route(P(-190,205),P(-190,162),P(-190,6),P(-190,0),P(-190,-6),P(-190,-162),P(-190,-170));
            yield return Frame("west-street-garden",new Vector3(-190,2,-190));
            yield return Route(P(-215,-170),P(-215,-205),P(-190,-205),P(-166,-205),P(-166,-190),P(-156,-190),P(-6,-190));
            yield return Frame("garden-south-link",new Vector3(-166,2,-190));
            yield return Route(P(-156,-190),P(-166,-190),P(-166,-170),P(-190,-170),P(-190,-6),P(-190,0),P(-190,6),P(-190,162),P(-190,205),P(-190,217),P(-218,217),Ring(18));
            yield return Arc(18,30);yield return Route(P(-225,-220),P(-215,-205),P(-215,-170));
            yield return Frame("garden-from-ring",new Vector3(-203,2,-193));
            yield return Route(P(-215,-205),P(-225,-220),Ring(30));yield return Arc(30,42);
            yield return Route(P(220,-220),P(219.5f,-190),P(190,-190),P(190,-205),P(195,-205),P(198,-205),P(198,-208),P(209,-208));
            if(report["error"]==null){var cafe=FindFirstObjectByType<StationCafeMoment>();walker.enabled=true;var before=cafe.ServedCount;Check(cafe.Use() && cafe.ServedCount==before+1,"Cafe serves from continuous walk");}
            yield return Frame("cafe-from-ring",new Vector3(204,2,-202));
            yield return Route(P(198,-208),P(198,-205),P(190,-205),P(190,-190),P(219.5f,-190),P(220,-220),Ring(42));
            yield return Arc(42,54);yield return Route(P(218,217),P(190,217),P(190,180),P(210,180));
            if(report["error"]==null){walker.enabled=true;Check(save.SaveNow(),"Isolated QA save writes after the continuous tour");}
            report["complete"]=report["error"]==null;Flush();walker.enabled=true;
            Debug.Log("PROMENADE_ROUTE_RESULT "+report["complete"]);if(!Application.isEditor)Application.Quit(report["error"]==null?0:1);
        }
        static Vector3 P(float x,float z)=>new Vector3(x,.06f,z);
        static Vector3 Ring(int i)=>P(330*Mathf.Cos(i*Mathf.PI/24),330*Mathf.Sin(i*Mathf.PI/24));
        IEnumerator Arc(int first,int last){for(int i=first+1;i<=last;i++){yield return Walk(Ring(i));if(i%12==0)yield return Frame("ring-"+i,Ring(i+1)+Vector3.up*1.5f);}}
        IEnumerator Route(params Vector3[] points){foreach(var p in points)yield return Walk(p);}
        void Check(bool passed,string name){checks.Add(new JObject{["name"]=name,["passed"]=passed});if(!passed && report["error"]==null)report["error"]=name;}
        void Flush()=>File.WriteAllText(Path.Combine(Output,"promenade.json"),report.ToString());
        IEnumerator Walk(Vector3 target)
        {
            if(report["error"]!=null)yield break;walker.enabled=false;var start=walker.transform.position;walker.Face(target+Vector3.up*1.6f);
            var delta=target-start;delta.y=0;int limit=Mathf.CeilToInt(delta.magnitude/.1f)+15,sides=0,grounded=0;
            for(int i=0;i<limit;i++){
                delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.06f)break;
                var flags=body.Move(delta.normalized*Mathf.Min(.1f,delta.magnitude)+Vector3.down*.02f);
                if((flags&CollisionFlags.Sides)!=0)sides++;if((flags&CollisionFlags.Below)!=0)grounded++;if(i%12==0)yield return null;
            }
            delta=target-walker.transform.position;delta.y=0;
            segments.Add(new JObject{["from"]=start.ToString("F3"),["target"]=target.ToString("F3"),["horizontalError"]=delta.magnitude,["sideHits"]=sides,["groundedSteps"]=grounded,["actualY"]=walker.transform.position.y});
            Check(delta.magnitude<.12f && sides==0 && grounded>0 && Mathf.Abs(walker.transform.position.y-target.y)<.2f,"Route "+target);Flush();
        }
        IEnumerator Frame(string name,Vector3 target)
        {
            if(report["error"]!=null)yield break;walker.enabled=true;walker.Face(target);yield return new WaitForEndOfFrame();
            var camera=walker.View;var rt=new RenderTexture(1280,720,24);var old=camera.targetTexture;var active=RenderTexture.active;var image=new Texture2D(1280,720,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();File.WriteAllBytes(Path.Combine(Output,name+".png"),image.EncodeToPNG());}
            finally{camera.targetTexture=old;RenderTexture.active=active;Destroy(image);rt.Release();Destroy(rt);}
        }
    }
}
