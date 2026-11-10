using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Unity.Profiling;
using UnityEngine;

namespace QuQu
{
    // Opt-in Player capture and frame-time comparison; normal sessions create nothing.
    public sealed class StationEcologicalParkProbeV017 : MonoBehaviour
    {
        [Serializable] sealed class ViewResult
        {
            public string name;
            public int frames,renderedFrames;
            public float medianMs,p95Ms,maximumMs;
            public double batches,drawCalls,setPasses,triangles,shadowCasters;
        }
        [Serializable] sealed class Report
        {
            public string scene,graphicsDevice,graphicsApi,urp;
            public int width,height;
            public bool passed,waterMotionCaptured,normalRenderingVerified,renderCountersVerified;
            public List<ViewResult> views=new List<ViewResult>();
            public List<string> errors=new List<string>();
            public List<LodView> lodViews=new List<LodView>();
        }
        [Serializable] sealed class LodView
        {
            public string name;
            public float distance,transitionHeight,lodBias;
            public Vector3 eyePosition;
        }
        readonly Report report=new Report();
        string output;
        StationGrayboxWalker walker;
        Transform frame;
        int renderedFrames;
        ProfilerRecorder[] counters;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"--station-park-probe-output");
            if(i<0||i+1>=args.Length||!Path.IsPathRooted(args[i+1]))return;
            new GameObject("V017 ecological park capture validation").AddComponent<StationEcologicalParkProbeV017>().output=args[i+1];
        }
        IEnumerator Start()
        {
            Application.logMessageReceived+=Log;
            Directory.CreateDirectory(output);Application.runInBackground=true;
            Application.targetFrameRate=-1;QualitySettings.vSyncCount=0;
            yield return null;yield return null;
            report.scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path;
            if(!report.scene.EndsWith("BlackHoleStationCreativeBuildingsV016.unity")&&!report.scene.EndsWith("BlackHoleStationEcologicalParkV017.unity"))throw new InvalidOperationException("V016 or V017 candidate required");
            report.graphicsDevice=SystemInfo.graphicsDeviceName;report.graphicsApi=SystemInfo.graphicsDeviceType.ToString();report.width=Screen.width;report.height=Screen.height;
            walker=FindFirstObjectByType<StationGrayboxWalker>();frame=GameObject.Find("V015 package - glass ecology garden").transform;
            walker.MovementLocked=true;walker.InputBlocked=()=>true;walker.ThirdPersonMode=false;walker.View.fieldOfView=65;
            UnityEngine.Rendering.RenderPipelineManager.beginCameraRendering+=Rendered;
            counters=new[]{"Batches Count","Draw Calls Count","SetPass Calls Count","Triangles Count","Shadow Casters Count"}.Select(n=>ProfilerRecorder.StartNew(ProfilerCategory.Render,n,1)).ToArray();
            report.urp=JsonUtility.ToJson(walker.View.GetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>());
            Place(new Vector3(-14.5f,.08f,11.5f),new Vector3(-8,1,17));
            if(report.scene.EndsWith("V017.unity"))
            {
                var rings=FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None);foreach(var r in rings)r.enabled=false;
                var reflection=FindFirstObjectByType<StationLandscapeReflections>();reflection.enabled=false;
                var particles=frame.GetComponentsInChildren<ParticleSystem>();foreach(var p in particles)p.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
                yield return new WaitForSecondsRealtime(2);Capture("water-motion-a");
                yield return new WaitForSecondsRealtime(2);Capture("water-motion-b");report.waterMotionCaptured=true;
                foreach(var r in rings)r.enabled=true;reflection.enabled=true;foreach(var p in particles)p.Play();
            }
            yield return new WaitForSecondsRealtime(24);
            foreach(var view in new[]{
                (name:"entry",p:new Vector3(0,.08f,20),t:new Vector3(12,3,12)),
                (name:"plant-layers",p:new Vector3(14,.08f,-2),t:new Vector3(19,3,-11)),
                (name:"water",p:new Vector3(-14.5f,.08f,11.5f),t:new Vector3(-8,1,17)),
                (name:"fountain",p:new Vector3(14.5f,.08f,9),t:new Vector3(10,1,16))})
            {
                Place(view.p,view.t);yield return new WaitForSecondsRealtime(3);
                var times=new List<float>();float start=Time.realtimeSinceStartup;int renderedStart=renderedFrames;
                var totals=new double[counters.Length];
                while(Time.realtimeSinceStartup-start<8){yield return null;times.Add(Time.unscaledDeltaTime*1000);for(int n=0;n<counters.Length;n++)if(counters[n].Valid)totals[n]+=counters[n].LastValue;}
                times.Sort();report.views.Add(new ViewResult{name=view.name,frames=times.Count,renderedFrames=renderedFrames-renderedStart,medianMs=times[times.Count/2],p95Ms=times[Mathf.Min(times.Count-1,(int)(times.Count*.95f))],maximumMs=times[times.Count-1],batches=totals[0]/times.Count,drawCalls=totals[1]/times.Count,setPasses=totals[2]/times.Count,triangles=totals[3]/times.Count,shadowCasters=totals[4]/times.Count});
                yield return new WaitForEndOfFrame();Capture(view.name);Save(false);
            }
            var b03=GameObject.Find("V016 B03 tidal seed exterior trial").transform;
            Place(frame.InverseTransformPoint(b03.TransformPoint(new Vector3(0,.08f,0))),frame.InverseTransformPoint(b03.TransformPoint(new Vector3(-6,2.2f,4))));
            yield return new WaitForSecondsRealtime(2);yield return new WaitForEndOfFrame();Capture("b03-collection");
            if(report.scene.EndsWith("V017.unity"))
            {
                var hero=frame.GetComponentsInChildren<LODGroup>().Single(g=>g.name=="P01UnfurlCanopy");var levels=hero.GetLODs();
                for(int level=0;level<2;level++)foreach(float factor in new[]{.94f,1.06f}){
                    float scale=Mathf.Max(Mathf.Abs(hero.transform.lossyScale.x),Mathf.Abs(hero.transform.lossyScale.y),Mathf.Abs(hero.transform.lossyScale.z));
                    float distance=hero.size*scale*QualitySettings.lodBias/(2*Mathf.Tan(walker.View.fieldOfView*Mathf.Deg2Rad/2)*levels[level].screenRelativeTransitionHeight)*factor;
                    var target=frame.InverseTransformPoint(hero.transform.TransformPoint(hero.localReferencePoint));var eye=target+new Vector3(0,.3f,1).normalized*distance;
                    Place(eye-Vector3.up*walker.View.transform.localPosition.y,target);yield return new WaitForSecondsRealtime(3);yield return new WaitForEndOfFrame();
                    string name="lod-transition-"+level+(factor<1?"-near":"-far");Capture(name);report.lodViews.Add(new LodView{name=name,distance=Vector3.Distance(walker.View.transform.position,hero.transform.TransformPoint(hero.localReferencePoint)),transitionHeight=levels[level].screenRelativeTransitionHeight,lodBias=QualitySettings.lodBias,eyePosition=frame.InverseTransformPoint(walker.View.transform.position)});
                }
            }
            report.normalRenderingVerified=report.views.All(v=>v.renderedFrames>=v.frames*.9f);
            report.renderCountersVerified=counters.All(c=>c.Valid)&&report.views.All(v=>v.batches>0&&v.drawCalls>0&&v.setPasses>0&&v.triangles>0);
            report.passed=report.errors.Count==0&&report.views.All(v=>v.frames>=30)&&report.normalRenderingVerified&&report.renderCountersVerified;Save(true);
            UnityEngine.Rendering.RenderPipelineManager.beginCameraRendering-=Rendered;
            Application.logMessageReceived-=Log;Application.Quit(report.passed?0:1);
        }
        void Place(Vector3 local,Vector3 target)
        {
            var body=walker.GetComponent<CharacterController>();body.enabled=false;walker.transform.position=frame.TransformPoint(local);body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();walker.Face(frame.TransformPoint(target));
        }
        void Capture(string name)
        {
            var camera=walker.View;var prior=camera.targetTexture;var active=RenderTexture.active;
            var rt=new RenderTexture(1600,1000,24);var pixels=new Texture2D(1600,1000,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;pixels.ReadPixels(new Rect(0,0,1600,1000),0,0);pixels.Apply();File.WriteAllBytes(Path.Combine(output,name+".png"),pixels.EncodeToPNG());}
            finally{camera.targetTexture=prior;RenderTexture.active=active;rt.Release();Destroy(rt);Destroy(pixels);}
        }
        void Save(bool complete)=>File.WriteAllText(Path.Combine(output,complete?"performance.json":"progress.json"),JsonUtility.ToJson(report,true));
        void Log(string message,string stack,LogType type){if(type==LogType.Error||type==LogType.Exception||type==LogType.Assert)report.errors.Add(message);}
        void Rendered(UnityEngine.Rendering.ScriptableRenderContext context,Camera camera){if(walker&&camera==walker.View)renderedFrames++;}
        void OnDestroy(){if(counters!=null)foreach(var counter in counters)counter.Dispose();}
    }
}
