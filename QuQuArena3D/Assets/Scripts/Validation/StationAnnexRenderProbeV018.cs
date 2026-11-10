using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Unity.Profiling;
using UnityEngine;

namespace QuQu
{
    // Opt-in normal Player rendering check, separate from collision diagnostics.
    public sealed class StationAnnexRenderProbeV018 : MonoBehaviour
    {
        [Serializable] sealed class View { public string name; public int frames,renderedFrames; public float p95Ms; public double drawCalls; }
        [Serializable] sealed class Report
        {
            public string scene,graphicsDevice,graphicsApi,urp; public int width,height; public bool passed;
            public int reflectionCaptures,reflectionCycles; public List<string> researchReflectionTextures=new List<string>();
            public List<string> readingReflectionTextures=new List<string>();
            public List<string> originalReadingReflectionTextures=new List<string>();
            public List<string> cafeReflectionTextures=new List<string>();
            public List<string> r2ReflectionTextures=new List<string>();
            public List<string> homesReflectionTextures=new List<string>();
            public List<View> views=new List<View>();public List<string> errors=new List<string>();
        }
        readonly Report report=new Report();string output;StationGrayboxWalker walker;int renderedFrames;ProfilerRecorder calls;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Launch()
        {
            var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"--station-annex-render-output");
            if(i<0||i+1>=args.Length||!Path.IsPathRooted(args[i+1]))return;
            new GameObject("V018 normal Player rendering validation").AddComponent<StationAnnexRenderProbeV018>().output=args[i+1];
        }
        IEnumerator Start()
        {
            yield return null;yield return null;Directory.CreateDirectory(output);Application.logMessageReceived+=Log;
            report.scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene().path;
            bool districts=report.scene.EndsWith("BlackHoleStationDistrictsV019.unity");
            bool reading=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-reading-render")>=0;
            bool cafe=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-cafe-render")>=0;
            bool r2Review=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-r2-review-render")>=0;
            bool r2Ssao=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-r2-ssao-render")>=0;
            bool r2=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-r2-surfaces-render")>=0||r2Review||r2Ssao;
            bool homes=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-homes-render")>=0;
            bool homesGroup=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-homes-group-render")>=0;
            bool sharedBoundaries=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-shared-boundaries-render")>=0;
            bool homesThresholds=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-homes-thresholds-render")>=0;
            bool homesArrival=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-homes-arrival-render")>=0;
            bool street=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-street-sample-render")>=0;
            bool readingLink=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-reading-link-render")>=0;
            bool readingMaterials=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-reading-materials-render")>=0;
            bool readingCourt=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-reading-court-render")>=0;
            bool readingGroup=Array.IndexOf(Environment.GetCommandLineArgs(),"--station-reading-group-render")>=0;
            if(!districts&&!report.scene.EndsWith("BlackHoleStationAnnexInteriorsV018.unity"))throw new InvalidOperationException("V018 or V019 required");
            Application.runInBackground=true;Application.targetFrameRate=-1;QualitySettings.vSyncCount=0;
            report.graphicsDevice=SystemInfo.graphicsDeviceName;report.graphicsApi=SystemInfo.graphicsDeviceType.ToString();report.width=Screen.width;report.height=Screen.height;
            walker=FindFirstObjectByType<StationGrayboxWalker>();walker.MovementLocked=true;walker.InputBlocked=()=>true;walker.ThirdPersonMode=false;walker.View.fieldOfView=65;
            report.urp=JsonUtility.ToJson(walker.View.GetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>());
            UnityEngine.Rendering.RenderPipelineManager.beginCameraRendering+=Rendered;calls=ProfilerRecorder.StartNew(ProfilerCategory.Render,"Draw Calls Count",1);
            var views=new[]{
                (name:"b01-meeting",root:"V016 B01 moon sail exterior trial",eye:new Vector3(-9,1.85f,5),target:new Vector3(-6,1.3f,1)),
                (name:"b02-gallery",root:"V016 B02 crystal archive exterior trial",eye:new Vector3(-2.2f,7.9f,-2.5f),target:new Vector3(-1.1f,7.35f,1.73f)),
                (name:"b04-lounge",root:"V016 B04 terraced lounge exterior trial",eye:new Vector3(9,2.4f,-2),target:new Vector3(5.5f,2,4.3f))};
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"--station-annex-render-approaches")>=0)views=new[]{
                (name:"b01-approach",root:"V016 B01 moon sail exterior trial",eye:new Vector3(0,1.65f,22),target:new Vector3(0,1.2f,10)),
                (name:"b02-approach",root:"V016 B02 crystal archive exterior trial",eye:new Vector3(-1.213f,1.65f,28),target:new Vector3(-1.213f,1.2f,3)),
                (name:"b03-approach",root:"V016 B03 tidal seed exterior trial",eye:new Vector3(20,1.65f,-19.1f),target:new Vector3(19,1.2f,0)),
                (name:"b04-approach",root:"V016 B04 terraced lounge exterior trial",eye:new Vector3(.5f,1.65f,28),target:new Vector3(.5f,1.2f,4))};
            if(districts)views=new[]{
                (name:"research-front",root:"V019 research court architecture",eye:new Vector3(-12,1.7f,1),target:new Vector3(-2,6,-14)),
                (name:"research-reading",root:"V019 research court architecture",eye:new Vector3(0,1.7f,-9),target:new Vector3(-6,1.4f,-16)),
                (name:"research-terrace",root:"V019 research court architecture",eye:new Vector3(-7,10.5f,-7.8f),target:new Vector3(4,10,-7.8f)),
                (name:"research-upper",root:"V019 research court architecture",eye:new Vector3(1.8f,14.9f,-12.9f),target:new Vector3(-.5f,14.6f,-16))};
            if(!districts&&Array.IndexOf(Environment.GetCommandLineArgs(),"--station-district-render-baseline")>=0)views=new[]{
                (name:"research-front",root:"V015 package - research main and entry canopy",eye:new Vector3(-12,1.7f,1),target:new Vector3(-2,6,-14))};
            if(reading&&districts)views=new[]{
                (name:"reading-front",root:"V019 reading court architecture",eye:new Vector3(-21,1.7f,18),target:new Vector3(-5,4,28)),
                (name:"reading-room",root:"V019 reading court architecture",eye:new Vector3(-3,1.7f,24),target:new Vector3(-10,1.4f,30)),
                (name:"reading-terrace",root:"V019 reading court architecture",eye:new Vector3(1,8.9f,25),target:new Vector3(-10,8.6f,25.2f)),
                (name:"reading-upper",root:"V019 reading court architecture",eye:new Vector3(-3,8.9f,29.5f),target:new Vector3(-10,8.6f,31.5f)),
                (name:"reading-old-court",root:"V015 package - 06 study",eye:new Vector3(-24,1.7f,18),target:new Vector3(0,1.5f,13)),
                (name:"reading-side-window",root:"V019 reading court architecture",eye:new Vector3(-27,1.7f,29),target:new Vector3(-10,1.5f,29))};
            if(cafe&&districts)views=new[]{
                (name:"cafe-court",root:"V015 package - cafe and observation gallery",eye:new Vector3(-8,1.7f,26),target:new Vector3(8,2,6)),
                (name:"cafe-loggia",root:"V019 cafe court architecture",eye:new Vector3(-8,1.7f,17),target:new Vector3(-22,1.7f,24)),
                (name:"cafe-low-terrace",root:"V019 cafe court architecture",eye:new Vector3(-11.8f,5.7f,17),target:new Vector3(-21,5.2f,24)),
                (name:"cafe-upper",root:"V019 cafe court architecture",eye:new Vector3(-13,9.7f,41),target:new Vector3(-22,9.2f,39)),
                (name:"cafe-old-room",root:"V015 package - cafe and observation gallery",eye:new Vector3(6,1.7f,5),target:new Vector3(19,1.5f,0)),
                (name:"cafe-group",root:"V015 package - cafe and observation gallery",eye:new Vector3(-38,1.7f,45),target:new Vector3(-10,4,25))};
            if(r2&&districts)views=new[]{
                (name:"cafe-court",root:"V015 package - cafe and observation gallery",eye:new Vector3(-8,1.7f,26),target:new Vector3(8,2,6)),
                (name:"cafe-old-room",root:"V015 package - cafe and observation gallery",eye:new Vector3(6,1.7f,5),target:new Vector3(19,2,0)),
                (name:"cafe-loggia",root:"V019 cafe court architecture",eye:new Vector3(-8,1.7f,17),target:new Vector3(-22,1.7f,24)),
                (name:"reading-entry",root:"V015 package - 06 study",eye:new Vector3(-12,1.7f,23),target:new Vector3(0,4,7)),
                (name:"reading-court",root:"V015 package - 06 study",eye:new Vector3(-24,1.7f,18),target:new Vector3(0,1.5f,13)),
                (name:"research-court",root:"V015 package - research main and entry canopy",eye:new Vector3(24,1.7f,0),target:new Vector3(-5,6,-10)),
                (name:"research-old-room",root:"V015 package - research main and entry canopy",eye:new Vector3(-10,1.7f,15),target:new Vector3(-20,4,20))};
            if(homes&&districts)views=new[]{
                (name:"homes-street",root:"V019 homes shared architecture",eye:new Vector3(-27,1.7f,-32),target:new Vector3(0,5,-30)),
                (name:"homes-court",root:"V019 homes shared architecture",eye:new Vector3(-5,1.7f,-12),target:new Vector3(-5,5,-32)),
                (name:"homes-ground",root:"V019 homes shared architecture",eye:new Vector3(-4.5f,1.7f,-29),target:new Vector3(-8,1,-24)),
                (name:"homes-middle",root:"V019 homes shared architecture",eye:new Vector3(-4.5f,4.9f,-24),target:new Vector3(-4.5f,5.5f,-33)),
                (name:"homes-upper",root:"V019 homes shared architecture",eye:new Vector3(-6.5f,10.02f,-37),target:new Vector3(-1.3f,9.5f,-37)),
                (name:"homes-upper-terrace",root:"V019 homes shared architecture",eye:new Vector3(-5,10.02f,-29),target:new Vector3(-12,10,-26))};
            if(street&&districts)views=new[]{
                (name:"street-arrival",root:"R2 public planning deck",eye:new Vector3(-29.7f,1.7f,92),target:new Vector3(-40,3,127)),
                (name:"reading-door",root:"R2 public planning deck",eye:new Vector3(-43,1.7f,122),target:new Vector3(-57,3,123)),
                (name:"activity-door",root:"R2 public planning deck",eye:new Vector3(-41,1.7f,130),target:new Vector3(-24,3,132)),
                (name:"surface-near",root:"R2 public planning deck",eye:new Vector3(-40,1.7f,124),target:new Vector3(-42,.05f,127)),
                (name:"street-end",root:"R2 public planning deck",eye:new Vector3(-40,1.7f,86),target:new Vector3(-28,.012f,91))};
            if(readingGroup&&districts)views=new[]{
                (name:"street-arrival",root:"R2 public planning deck",eye:new Vector3(-29.7f,1.7f,92),target:new Vector3(-40,3,127)),
                (name:"reading-door",root:"R2 public planning deck",eye:new Vector3(-43,1.7f,122),target:new Vector3(-57,3,123)),
                (name:"activity-door",root:"R2 public planning deck",eye:new Vector3(-41,1.7f,130),target:new Vector3(-24,3,132)),
                (name:"reading-street-turn",root:"R2 public planning deck",eye:new Vector3(-65,1.7f,75),target:new Vector3(-74,5,102)),
                (name:"reading-corner",root:"R2 public planning deck",eye:new Vector3(-43,1.7f,103),target:new Vector3(-59,3.2f,113))};
            if(readingLink&&districts)views=new[]{
                (name:"new-entry",root:"R2 public planning deck",eye:new Vector3(-63.7142944f,1.7f,71.75638f),target:new Vector3(-80.01666f,4.0f,86.59292f)),
                (name:"entry-gap",root:"R2 public planning deck",eye:new Vector3(-66.7142944f,1.7f,76.95253f),target:new Vector3(-82.38269f,4.0f,88.6909943f)),
                (name:"court-to-old",root:"R2 public planning deck",eye:new Vector3(-73.45448f,1.7f,89.22689f),target:new Vector3(-78.25833f,3.0f,109.5474f)),
                (name:"court-rear",root:"R2 public planning deck",eye:new Vector3(-40.0f,1.7f,130.0f),target:new Vector3(-44.0f,1.0f,147.0f)),
                (name:"main-arrival",root:"R2 public planning deck",eye:new Vector3(-29.7f,1.7f,92.0f),target:new Vector3(-40.0f,3.0f,127.0f)),
                (name:"street-loop",root:"R2 public planning deck",eye:new Vector3(-49.0f,1.7f,83.0f),target:new Vector3(-66.0f,4.0f,94.0f))};
            if(readingMaterials&&districts)views=new[]{
                (name:"group-overview",root:"R2 public planning deck",eye:new Vector3(-119,43,59),target:new Vector3(-47,1,121)),
                (name:"main-arrival",root:"R2 public planning deck",eye:new Vector3(-29.7f,1.7f,92),target:new Vector3(-40,3,127)),
                (name:"new-entry",root:"R2 public planning deck",eye:new Vector3(-63.7142944f,1.7f,71.75638f),target:new Vector3(-80.01666f,4,86.59292f)),
                (name:"reading-wall",root:"R2 public planning deck",eye:new Vector3(-65,1.7f,90),target:new Vector3(-71,2,95)),
                (name:"activity-door",root:"R2 public planning deck",eye:new Vector3(-41,1.7f,130),target:new Vector3(-24,3,132)),
                (name:"deck-near",root:"R2 public planning deck",eye:new Vector3(-51,1.7f,99),target:new Vector3(-46,0,106)),
                (name:"street-loop",root:"R2 public planning deck",eye:new Vector3(-49,1.7f,83),target:new Vector3(-66,4,94)),
                (name:"distant-street",root:"R2 public planning deck",eye:new Vector3(-106,1.7f,63),target:new Vector3(-55,7,116))};
            if(homesGroup&&districts)views=new[]{
                (name:"overview",root:"V015 package - existing shared resident lounge",eye:new Vector3(-112,140,25),target:new Vector3(-16,0,25)),
                (name:"shared-street",root:"V015 package - existing shared resident lounge",eye:new Vector3(-31,1.7f,15),target:new Vector3(-8,3.5f,36)),
                (name:"homes-to-shared",root:"V015 package - existing shared resident lounge",eye:new Vector3(-40,1.7f,78),target:new Vector3(-7,5,-20)),
                (name:"new-court-entry",root:"V015 package - existing shared resident lounge",eye:new Vector3(-30,1.7f,26),target:new Vector3(-2,3,34)),
                (name:"shared-building",root:"V019 homes shared architecture",eye:new Vector3(-27,1.7f,-32),target:new Vector3(0,5,-30)),
                (name:"six-homes-back",root:"V015 package - existing shared resident lounge",eye:new Vector3(21,1.7f,52),target:new Vector3(-5,3,67))};
            if(homesArrival&&districts)views=new[]{
                (name:"group",root:"V015 package - existing shared resident lounge",eye:new Vector3(-85,75,55),target:new Vector3(0,1,-8)),
                (name:"street-76",root:"V015 package - existing shared resident lounge",eye:new Vector3(-20.4847527f,1.7f,13.8815422f),target:new Vector3(-5,3,-27)),
                (name:"street-78",root:"V015 package - existing shared resident lounge",eye:new Vector3(-20.1212177f,1.7f,6.944992f),target:new Vector3(-5,3,-27)),
                (name:"court",root:"V015 package - existing shared resident lounge",eye:new Vector3(-27,1.7f,-16),target:new Vector3(-5,4,-27)),
                (name:"old-lounge-entry",root:"V015 package - existing shared resident lounge",eye:new Vector3(-17,1.7f,0.155f),target:new Vector3(4,1.7f,.155f)),
                (name:"old-lounge-interior",root:"V015 package - existing shared resident lounge",eye:new Vector3(18,1.7f,-8),target:new Vector3(3,1.5f,3)),
                (name:"outer-promenade",root:"V015 package - existing shared resident lounge",eye:new Vector3(32,1.7f,20),target:new Vector3(32,1.7f,-15))};
            if(homesThresholds&&districts)views=new[]{
                (name:"deepseek-entry",root:"V015 package - resident deepseek home package",eye:new Vector3(-25.0000000f,1.7000000f,10.0000000f),target:new Vector3(-12.0000000f,1.7000000f,0.0000000f)),
                (name:"chatgpt-entry",root:"V015 package - resident chatgpt home package",eye:new Vector3(-25.0000000f,1.7000000f,10.0000000f),target:new Vector3(-12.0000000f,1.7000000f,0.0000000f)),
                (name:"claude-entry",root:"V015 package - resident claude home package",eye:new Vector3(-25.0000000f,1.7000000f,10.0000000f),target:new Vector3(-12.0000000f,1.7000000f,0.0000000f)),
                (name:"crossing-55",root:"R3 homes and ecology planning deck",eye:new Vector3(111.2738340f,1.7000000f,-158.9155000f),target:new Vector3(121.5982060f,2.0000000f,-173.6602330f)),
                (name:"crossing-65",root:"R3 homes and ecology planning deck",eye:new Vector3(81.9879400f,1.7000000f,-175.8237150f),target:new Vector3(89.5950700f,2.0000000f,-192.1372530f)),
                (name:"street-sequence",root:"V015 package - existing shared resident lounge",eye:new Vector3(-43.0000000f,1.7000000f,80.0000000f),target:new Vector3(-10.0000000f,4.0000000f,20.0000000f)),
                (name:"overview",root:"V015 package - existing shared resident lounge",eye:new Vector3(-95.0000000f,90.0000000f,70.0000000f),target:new Vector3(-20.0000000f,0.0000000f,65.0000000f))};
            if(sharedBoundaries&&districts)views=new[]{
                (name:"shared-home-entry",root:"V015 package - gemini glm kimi existing home group",eye:new Vector3(26f,1.7f,11f),target:new Vector3(14f,1.7f,0f)),
                (name:"shared-home-hall",root:"V015 package - gemini glm kimi existing home group",eye:new Vector3(0f,1.7f,-1f),target:new Vector3(-8.5f,1.7f,6f)),
                (name:"gemini-threshold",root:"V015 package - gemini glm kimi existing home group",eye:new Vector3(-8.5f,1.7f,-1f),target:new Vector3(-8.5f,1.5f,6f)),
                (name:"glm-kimi-thresholds",root:"V015 package - gemini glm kimi existing home group",eye:new Vector3(0f,1.7f,0f),target:new Vector3(9f,1.7f,0f)),
                (name:"court-west",root:"V015 package - existing shared resident lounge",eye:new Vector3(-20f,1.7f,-14f),target:new Vector3(-5f,2f,-20f)),
                (name:"court-east",root:"V015 package - existing shared resident lounge",eye:new Vector3(20f,1.7f,-16f),target:new Vector3(-6f,2f,-19f))};
            if(readingCourt&&districts)views=new[]{
                (name:"group-overview",root:"R2 public planning deck",eye:new Vector3(-119,43,59),target:new Vector3(-47,1,121)),
                (name:"main-arrival",root:"R2 public planning deck",eye:new Vector3(-29.7f,1.7f,92),target:new Vector3(-40,3,127)),
                (name:"approach-mid",root:"R2 public planning deck",eye:new Vector3(-33.3f,1.7f,102.4f),target:new Vector3(-44,4,153)),
                (name:"forecourt",root:"R2 public planning deck",eye:new Vector3(-40,1.7f,130),target:new Vector3(-44,4,153)),
                (name:"activity-side",root:"R2 public planning deck",eye:new Vector3(-29,1.7f,132),target:new Vector3(-44,4,153)),
                (name:"former-site",root:"R2 public planning deck",eye:new Vector3(-63.7142944f,1.7f,71.75638f),target:new Vector3(-80.01666f,4,86.59292f)),
                (name:"outer-street",root:"R2 public planning deck",eye:new Vector3(-61,1.7f,164),target:new Vector3(-44,5,155)),
                (name:"upper-terrace",root:"V019 reading court architecture",eye:new Vector3(-10,8.9f,24),target:new Vector3(-10,8.5f,0))};
            if(r2Review&&districts)
            {
                foreach(var text in FindObjectsByType<TMPro.TMP_Text>(FindObjectsSortMode.None))
                { var renderer=text.GetComponent<Renderer>(); if(renderer)renderer.enabled=false; }
                views=new[]{
                (name:"research-arrival",root:"V015 package - research main and entry canopy",eye:new Vector3(24f,1.7f,0f),target:new Vector3(-5f,6f,-10f)),
                (name:"research-turn",root:"V019 research court architecture",eye:new Vector3(-18f,1.7f,7f),target:new Vector3(0f,5f,-14f)),
                (name:"research-court",root:"V019 research court architecture",eye:new Vector3(-12f,1.7f,1f),target:new Vector3(-2f,6f,-14f)),
                (name:"research-near",root:"V019 research court architecture",eye:new Vector3(-9f,1.7f,-7f),target:new Vector3(-7f,2f,-12f)),
                (name:"reading-arrival",root:"R2 public planning deck",eye:new Vector3(-29.7f,1.7f,92f),target:new Vector3(-40f,3f,127f)),
                (name:"reading-turn",root:"R2 public planning deck",eye:new Vector3(-33.3f,1.7f,102.4f),target:new Vector3(-44f,4f,153f)),
                (name:"reading-court",root:"R2 public planning deck",eye:new Vector3(-40f,1.7f,130f),target:new Vector3(-44f,4f,153f)),
                (name:"cafe-arrival",root:"V015 package - cafe and observation gallery",eye:new Vector3(-38f,1.7f,45f),target:new Vector3(-10f,4f,25f)),
                (name:"cafe-turn",root:"V019 cafe court architecture",eye:new Vector3(-28f,1.7f,15f),target:new Vector3(-18f,4f,28f)),
                (name:"cafe-court",root:"V015 package - cafe and observation gallery",eye:new Vector3(-8f,1.7f,26f),target:new Vector3(8f,2f,6f)),
                (name:"cafe-street",root:"V019 cafe court architecture",eye:new Vector3(-48f,1.7f,16f),target:new Vector3(-15f,4f,24f))};
            }
            if(r2Ssao&&districts)
            {
                foreach(var text in FindObjectsByType<TMPro.TMP_Text>(FindObjectsSortMode.None))
                { var renderer=text.GetComponent<Renderer>(); if(renderer)renderer.enabled=false; }
                views=new[]{
                (name:"research-arrival",root:"V015 package - research main and entry canopy",eye:new Vector3(24f,1.7f,0f),target:new Vector3(-5f,6f,-10f)),
                (name:"research-turn",root:"V019 research court architecture",eye:new Vector3(-18f,1.7f,7f),target:new Vector3(0f,5f,-14f)),
                (name:"research-court",root:"V019 research court architecture",eye:new Vector3(-12f,1.7f,1f),target:new Vector3(-2f,6f,-14f)),
                (name:"research-near",root:"V019 research court architecture",eye:new Vector3(-9f,1.7f,-7f),target:new Vector3(-7f,2f,-12f))};
            }
            foreach(var spec in views)
            {
                var frame=GameObject.Find(spec.root).transform;var body=walker.GetComponent<CharacterController>();body.enabled=false;walker.transform.position=frame.TransformPoint(spec.eye-Vector3.up*1.63f);body.enabled=true;Physics.SyncTransforms();walker.ResetGroundReference();walker.Face(frame.TransformPoint(spec.target));
                yield return new WaitForSecondsRealtime(report.views.Count==0?24:3);
                var times=new List<float>();double total=0;float start=Time.realtimeSinceStartup;int renders=renderedFrames;
                while(Time.realtimeSinceStartup-start<8){yield return null;times.Add(Time.unscaledDeltaTime*1000);if(calls.Valid)total+=calls.LastValue;}
                times.Sort();report.views.Add(new View{name=spec.name,frames=times.Count,renderedFrames=renderedFrames-renders,p95Ms=times[(int)(times.Count*.95f)],drawCalls=total/times.Count});
                yield return new WaitForEndOfFrame();Capture(spec.name);File.WriteAllText(Path.Combine(output,"progress.json"),JsonUtility.ToJson(report,true));
            }
            var reflections=FindFirstObjectByType<StationLandscapeReflections>();
            report.reflectionCaptures=reflections.CompletedCaptures;report.reflectionCycles=reflections.CompletedCycles;
            if(districts)
            {
                if(homes||homesGroup||homesArrival||homesThresholds||sharedBoundaries)
                {
                    var homesProbes=reflections.RuntimeProbes.Where(p=>p.name.StartsWith("V019 reflection - homes ")).ToArray();
                    foreach(var probe in homesProbes)report.homesReflectionTextures.Add(probe.name+" updates="+probe.customBakedTexture.updateCount);
                    if(homesProbes.Length!=2||homesProbes.Any(p=>p.customBakedTexture.updateCount==0))report.errors.Add("Homes probes did not complete runtime captures");
                    if(sharedBoundaries)
                    {
                        var shared=reflections.RuntimeProbes.Where(p=>p.name=="V015 reflection - shared homes runtime").ToArray();
                        foreach(var probe in shared)report.homesReflectionTextures.Add(probe.name+" updates="+probe.customBakedTexture.updateCount);
                        if(shared.Length!=1||shared.Any(p=>p.customBakedTexture.updateCount==0))report.errors.Add("Shared residence probe did not complete runtime captures");
                    }
                    if(homesArrival)
                    {
                        var lounge=reflections.RuntimeProbes.Where(p=>p.name=="V015 reflection - shared living runtime").ToArray();
                        foreach(var probe in lounge)report.homesReflectionTextures.Add(probe.name+" updates="+probe.customBakedTexture.updateCount);
                        if(lounge.Length!=1||lounge.Any(p=>p.customBakedTexture.updateCount==0))report.errors.Add("Relocated lounge probe did not complete runtime captures");
                    }
                    if(homesGroup||homesThresholds)
                    {
                        var moved=reflections.RuntimeProbes.Where(p=>p.name.Contains("resident deepseek home package")||p.name.Contains("resident chatgpt home package")||p.name.Contains("resident claude home package")).ToArray();
                        foreach(var probe in moved)report.homesReflectionTextures.Add(probe.name+" updates="+probe.customBakedTexture.updateCount);
                        if(moved.Length!=3||moved.Any(p=>p.customBakedTexture.updateCount==0))report.errors.Add("Relocated home probes did not complete runtime captures");
                    }
                }
                if(r2)
                {
                    var probes=reflections.RuntimeProbes.Where(p=>p.name.Contains("research")||p.name.Contains("reading")||p.name.Contains("cafe")||p.name=="V015 reflection - 06 study runtime").ToArray();
                    foreach(var probe in probes)report.r2ReflectionTextures.Add(probe.name+" updates="+probe.customBakedTexture.updateCount);
                    if(probes.Length!=8||probes.Any(p=>p.customBakedTexture.updateCount==0))report.errors.Add("R2 surface probes did not complete runtime captures");
                }
                var research=reflections.RuntimeProbes.Where(p=>p.name.StartsWith("V019 reflection - research ")).ToArray();
                foreach(var probe in research)report.researchReflectionTextures.Add(probe.name+" updates="+probe.customBakedTexture.updateCount);
                if(research.Length!=2||report.reflectionCycles<1)report.errors.Add("New research probes did not complete a runtime capture cycle");
                if(cafe)
                {
                    var cafeProbes=reflections.RuntimeProbes.Where(p=>p.name.StartsWith("V019 reflection - cafe ")).ToArray();
                    foreach(var probe in cafeProbes)report.cafeReflectionTextures.Add(probe.name+" updates="+probe.customBakedTexture.updateCount);
                    if(cafeProbes.Length!=2||cafeProbes.Any(p=>p.customBakedTexture.updateCount==0))report.errors.Add("Cafe probes did not complete runtime captures");
                }
                if(reading||readingMaterials||readingCourt)
                {
                    var readingProbes=reflections.RuntimeProbes.Where(p=>p.name.StartsWith("V019 reflection - reading ")).ToArray();
                    foreach(var probe in readingProbes)report.readingReflectionTextures.Add(probe.name+" updates="+probe.customBakedTexture.updateCount);
                    if(readingProbes.Length!=1||readingProbes.Any(p=>p.customBakedTexture.updateCount==0))report.errors.Add("Reading probe did not complete a runtime capture");
                    var originalReading=reflections.RuntimeProbes.Where(p=>p.name=="V015 reflection - 06 study runtime").ToArray();
                    foreach(var probe in originalReading)report.originalReadingReflectionTextures.Add(probe.name+" updates="+probe.customBakedTexture.updateCount);
                    if(originalReading.Length!=1||originalReading.Any(p=>p.customBakedTexture.updateCount==0))report.errors.Add("Original reading hall probe did not complete a runtime capture");
                }
            }
            report.passed=report.errors.Count==0&&calls.Valid&&report.views.All(v=>v.frames>=30&&v.renderedFrames>=v.frames*.9f&&v.drawCalls>0&&v.p95Ms<=16.67f);
            File.WriteAllText(Path.Combine(output,"rendering.json"),JsonUtility.ToJson(report,true));UnityEngine.Rendering.RenderPipelineManager.beginCameraRendering-=Rendered;Application.logMessageReceived-=Log;Application.Quit(report.passed?0:1);
        }
        void Capture(string name)
        {
            var camera=walker.View;var prior=camera.targetTexture;var active=RenderTexture.active;var rt=new RenderTexture(1600,1000,24);var pixels=new Texture2D(1600,1000,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;pixels.ReadPixels(new Rect(0,0,1600,1000),0,0);pixels.Apply();File.WriteAllBytes(Path.Combine(output,name+".png"),pixels.EncodeToPNG());}
            finally{camera.targetTexture=prior;RenderTexture.active=active;rt.Release();Destroy(rt);Destroy(pixels);}
        }
        void Rendered(UnityEngine.Rendering.ScriptableRenderContext context,Camera camera){if(walker&&camera==walker.View)renderedFrames++;}
        void Log(string message,string stack,LogType type){if(type==LogType.Error||type==LogType.Exception||type==LogType.Assert)report.errors.Add(message);}
        void OnDestroy(){calls.Dispose();}
    }
}
