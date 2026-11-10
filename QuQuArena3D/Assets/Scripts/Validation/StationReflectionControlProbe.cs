using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace QuQu
{
    // Opt-in control scene: no station, rotating groups, custom display probes or updater.
    public sealed class StationReflectionControlProbe : MonoBehaviour
    {
        string output;
        Camera camera;
        ReflectionProbe probe;
        RenderTexture target, view;
        int renderId, frames;
        float started;
        bool previousRealtime;
        bool freshProbe, manualRender;
        int contexts, manualContexts, cameraRenders, reflectionRenders;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--station-reflection-control-output");
            if(at<0||at+1>=args.Length||!Path.IsPathRooted(args[at+1]))return;
            if(UnityEngine.SceneManagement.SceneManager.GetActiveScene().name!="ReflectionSchedulingControlV015")
                throw new InvalidOperationException("Reflection control requires its isolated scene");
            var control=new GameObject("Reflection scheduling control").AddComponent<StationReflectionControlProbe>();
            control.output=args[at+1];
            control.freshProbe=Array.IndexOf(args,"--station-reflection-control-fresh")>=0;
        }

        IEnumerator Start()
        {
            Directory.CreateDirectory(output);Application.runInBackground=true;
            previousRealtime=QualitySettings.realtimeReflectionProbes;
            QualitySettings.realtimeReflectionProbes=true;
            RenderPipelineManager.beginContextRendering+=ContextStarted;
            RenderPipelineManager.beginCameraRendering+=CameraStarted;
            camera=GameObject.Find("Control camera").GetComponent<Camera>();
            probe=GameObject.Find("Control probe").GetComponent<ReflectionProbe>();
            view=new RenderTexture(256,256,24);camera.targetTexture=view;
            target=new RenderTexture(128,128,16,RenderTextureFormat.ARGBHalf)
                {dimension=TextureDimension.Cube,useMipMap=true,autoGenerateMips=false};target.Create();
            for(int i=0;i<4;i++)yield return new WaitForEndOfFrame();
            if(freshProbe)
            {
                var source=probe;
                probe=new GameObject("Fresh runtime control probe").AddComponent<ReflectionProbe>();
                probe.transform.SetPositionAndRotation(source.transform.position,source.transform.rotation);
                probe.mode=source.mode;probe.refreshMode=source.refreshMode;probe.timeSlicingMode=source.timeSlicingMode;
                probe.resolution=source.resolution;probe.size=source.size;probe.intensity=source.intensity;
                probe.clearFlags=source.clearFlags;probe.backgroundColor=source.backgroundColor;
                source.enabled=false;
            }
            started=Time.realtimeSinceStartup;renderId=probe.RenderProbe(target);
            while(!probe.IsFinishedRendering(renderId)&&Time.realtimeSinceStartup-started<20)yield return null;
            bool finished=probe.IsFinishedRendering(renderId);
            var previous=RenderTexture.active;Graphics.SetRenderTarget(target,0,CubemapFace.PositiveZ);
            var pixel=new Texture2D(1,1,TextureFormat.RGBAHalf,false,true);
            pixel.ReadPixels(new Rect(64,64,1,1),0,0);pixel.Apply();var color=pixel.GetPixel(0,0);
            RenderTexture.active=previous;
            var report=new JObject { ["finished"]=finished,["renderId"]=renderId,["seconds"]=Time.realtimeSinceStartup-started,
                ["manualFrames"]=frames,["frameCount"]=Time.frameCount,["renderedFrameCount"]=Time.renderedFrameCount,
                ["freshProbe"]=freshProbe,["contexts"]=contexts,["manualContexts"]=manualContexts,
                ["cameraRenders"]=cameraRenders,["reflectionRenders"]=reflectionRenders,
                ["focused"]=Application.isFocused,["batchMode"]=Application.isBatchMode,["quality"]=QualitySettings.names[QualitySettings.GetQualityLevel()],
                ["realtimeReflections"]=QualitySettings.realtimeReflectionProbes,["probeSize"]=probe.size.x,["probeIntensity"]=probe.intensity,
                ["mode"]=probe.timeSlicingMode.ToString(),["positiveZ"]=new JArray(color.r,color.g,color.b,color.a) };
            RenderTexture.active=view;
            var image=new Texture2D(256,256,TextureFormat.RGB24,false);
            image.ReadPixels(new Rect(0,0,256,256),0,0);image.Apply();
            float max=0;foreach(var p in image.GetPixels())max=Mathf.Max(max,p.maxColorComponent);
            report["viewMaximum"]=max;
            File.WriteAllBytes(Path.Combine(output,"view.png"),image.EncodeToPNG());Destroy(image);
            RenderTexture.active=previous;
            File.WriteAllText(Path.Combine(output,"control.json"),report.ToString());
            RenderPipelineManager.beginContextRendering-=ContextStarted;
            RenderPipelineManager.beginCameraRendering-=CameraStarted;
            Destroy(pixel);camera.targetTexture=null;view.Release();Destroy(view);target.Release();Destroy(target);
            camera=null;
            QualitySettings.realtimeReflectionProbes=previousRealtime;
            if(!Application.isEditor)Application.Quit(finished?0:1);
        }

        void ContextStarted(ScriptableRenderContext context,List<Camera> cameras)
        {contexts++;if(manualRender)manualContexts++;}
        void CameraStarted(ScriptableRenderContext context,Camera rendered)
        {cameraRenders++;if(rendered.cameraType==CameraType.Reflection)reflectionRenders++;}
        void LateUpdate()
        {
            if(!camera)return;
            manualRender=true;
            try{camera.Render();frames++;}finally{manualRender=false;}
        }
        void OnDestroy()
        {
            RenderPipelineManager.beginContextRendering-=ContextStarted;
            RenderPipelineManager.beginCameraRendering-=CameraStarted;
        }
    }
}
