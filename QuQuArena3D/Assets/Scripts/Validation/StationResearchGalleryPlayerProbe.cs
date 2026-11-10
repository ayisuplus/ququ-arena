using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Opt-in route and public-packet fixture. Editor and standalone evidence are labelled separately.
    public sealed class StationResearchGalleryPlayerProbe : MonoBehaviour
    {
        string output;
        StationGrayboxWalker walker;
        CharacterController body;
        JObject report;
        readonly JArray segments = new JArray();
        readonly JArray checks = new JArray();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();var i = Array.IndexOf(args,"--station-v013-research-probe-output");
            if (i < 0 || i + 1 >= args.Length || !Path.IsPathRooted(args[i + 1])) return;
            new GameObject("Research gallery Player validation").AddComponent<StationResearchGalleryPlayerProbe>().output = args[i + 1];
        }

        IEnumerator Start()
        {
            yield return null;Directory.CreateDirectory(output);
            walker=FindFirstObjectByType<StationGrayboxWalker>();body=walker.GetComponent<CharacterController>();
            var save=FindFirstObjectByType<StationWorldSave>();var desk=FindFirstObjectByType<StationResearchDesk>();
            var wall=FindFirstObjectByType<StationResearchArchive>();var match=desk.Match;
            report=new JObject{["scene"]=SceneManager.GetActiveScene().name,["graphics"]=SystemInfo.graphicsDeviceName,
                ["mode"]=Application.isEditor ? "Editor Play" : "Standalone Player",
                ["dataSource"]="Isolated public competition packet fixture through ArenaConnection.OnCompetition; no HTTP/model calls",["segments"]=segments,["checks"]=checks};
            Check(report["scene"].ToString()=="BlackHoleStationSereneV013","Research scene");
            if(!Application.isEditor)Check(save.LastLoadSource=="fresh" && Vector3.Distance(walker.transform.position,P(210,180))<.2f,"Formal arrival spawn");
            Check(!desk.Use(),"Remote desk rejected");
            // Transfer once to the existing west approach, then use CharacterController.Move for every segment.
            walker.enabled=false;body.enabled=false;walker.transform.position=P(-160,205);body.enabled=true;
            yield return Walk(P(-190,205));yield return Frame("entry",new Vector3(-207,2,205));
            yield return Walk(P(-198,205));yield return Walk(P(-198,210));yield return Walk(P(-204,210));
            yield return Frame("archive-empty",new Vector3(-207,3,214.4f));
            wall.Refresh();Check(wall.Question.text.Contains("当前没有可查阅") && desk.Report().Contains("当前没有可查阅"),"Empty archive agrees");
            var link=match.GetComponent<ArenaConnection>();link.Disconnect();match.CompetitionId="research-gallery-fixture";
            var round=new CompetitionRound{id="public-round",index=3,settled=false,
                question=new CompetitionQuestion{task=new CompetitionTask{id="optics",input="公开资料校验：光学观测为什么需要稳定的镜面？ <b>原文标签</b>"}},
                records=new[]{new CompetitionAnswer{model="model-a",answer="UNSETTLED_PRIVATE",reasoning="PRIVATE_REASONING",score=91}}};
            var packet=new CompetitionPacket{id=match.CompetitionId,seq=1,snapshot=new CompetitionSnapshot{id=match.CompetitionId,status="waiting",
                entrants=new[]{new ModelInfo{id="model-a",name="校验模型 A"},new ModelInfo{id="model-b",name="校验模型 B"}},
                duels=new[]{new CompetitionDuel{id="archive-fixture",status="completed",rounds=new[]{round}}}}};
            link.OnCompetition(packet,true);wall.Refresh();
            Check(wall.Question.text.Contains(round.question.task.input) && !wall.Question.richText,"Question rendered literally");
            Check(wall.Answers.All(t=>t.text.Contains("等待服务端结算") && !t.text.Contains("UNSETTLED_PRIVATE")) && !desk.Report().Contains("UNSETTLED_PRIVATE"),"Unsettled answers hidden");
            round.settled=true;round.records=new[]{
                new CompetitionAnswer{model="model-a",answer="稳定的镜面保持成像精度，减少振动带来的模糊。",reasoning="PRIVATE_REASONING",score=91.25},
                new CompetitionAnswer{model="model-b",answer="观测时控制温度与结构变形，可以维持光路对准。",reasoning="PRIVATE_REASONING",score=88.5}};
            packet.seq=2;link.OnCompetition(packet,true);wall.Refresh();
            for(int i=0;i<2;i++)Check(wall.Answers[i].text.Contains(round.records[i].answer) && wall.Answers[i].text.Contains(round.records[i].score.ToString("0.##")) && !wall.Answers[i].text.Contains("PRIVATE_REASONING") && !wall.Answers[i].richText,"Public answer and score "+i);
            yield return Frame("archive-public",new Vector3(-207,3,214.4f));
            yield return Walk(P(-204,205));walker.enabled=true;var hud=FindFirstObjectByType<StationMatchHUD>();var hudEnabled=hud.enabled;
            Check(desk.Use() && desk.IsOpen && walker.MovementLocked && !hud.enabled,"Original desk opens");
            Check(round.records.All(a=>desk.Report().Contains(a.answer)),"Original desk shows public records");
            Check(desk.Use() && !desk.IsOpen && !walker.MovementLocked && hud.enabled==hudEnabled,"Original desk restores controls");
            yield return Walk(P(-204,201));yield return Frame("optical-instrument",new Vector3(-213,2.3f,200));
            yield return Walk(P(-200,201));yield return Walk(P(-200,205));yield return Walk(P(-190,205));
            yield return Walk(P(-190,217));yield return Walk(P(-218,217));yield return Walk(P(-235,235));yield return Walk(P(-242,242));
            foreach(float x in new[]{-244f,-248f,-252f,-258f,-262f})yield return Walk(new Vector3(x,(x+244)/6f+.06f,242));
            yield return Walk(new Vector3(-263,-2.94f,242));yield return Frame("observation-floor",new Vector3(0,-4200,0));
            var rays=new JArray();report["blackHoleSightlines"]=rays;
            foreach(var p in new[]{new Vector3(-263,-2.94f,242),new Vector3(-263,-2.94f,239),new Vector3(-259,-2.94f,239)})
            {
                yield return Walk(p);walker.enabled=true;walker.Face(new Vector3(0,-4200,0));yield return null;
                var eye=walker.View.transform.position;var target=new Vector3(0,-4200,0);var hits=Physics.RaycastAll(eye,(target-eye).normalized,Vector3.Distance(eye,target));
                var opaque=hits.Where(h=>{var r=h.collider.GetComponent<Renderer>();return r && r.enabled && r.sharedMaterial && r.sharedMaterial.renderQueue<3000;}).Select(h=>h.collider.name).ToArray();
                Check(opaque.Length==0 && hits.Any(h=>h.collider.name=="Research lower observation bay floor"),"Glass-floor black hole sightline "+p);
                rays.Add(new JObject{["standing"]=p.ToString(),["opaque"]=JArray.FromObject(opaque),["hits"]=JArray.FromObject(hits.Select(h=>h.collider.name))});
            }
            var seats=FindObjectsByType<StationGardenSeat>(FindObjectsSortMode.None).Where(s=>s.StableId.StartsWith("v013-research-seat-")).OrderBy(s=>s.StableId).ToArray();
            Check(seats.Length==2,"Two observation rests");
            yield return Walk(new Vector3(-263,-2.94f,239));yield return Walk(new Vector3(-263,-2.94f,242));
            for(int i=0;i<seats.Length;i++)
            {
                if(i==1){yield return Walk(new Vector3(-263,-2.94f,244.4f));yield return Walk(new Vector3(-257,-2.94f,244.4f));}
                else yield return Walk(new Vector3(-263,-2.94f,244.4f));
                walker.enabled=true;var before=walker.View.transform.localPosition;Check(seats[i].Use() && seats[i].IsSeated,"Sit in observation cabin "+i);
                yield return null;yield return new WaitForEndOfFrame();Capture("observation-seat-"+i);
                Check(seats[i].Stand() && walker.enabled && Vector3.Distance(before,walker.View.transform.localPosition)<.001f,"Observation standing view restored "+i);
            }
            yield return Walk(new Vector3(-263,-2.94f,244.4f));yield return Walk(new Vector3(-263,-2.94f,242));
            foreach(float x in new[]{-262f,-258f,-252f,-248f,-244f})yield return Walk(new Vector3(x,(x+244)/6f+.06f,242));
            yield return Walk(P(-242,242));yield return Walk(P(-235,235));yield return Walk(P(-218,217));yield return Walk(P(-190,217));
            foreach(var n in new[]{"Research gallery","Research approach","Research observation"})
            {var probe=GameObject.Find(n+" reflections").GetComponent<ReflectionProbe>();Check(probe.texture is Cubemap && probe.texture.width==128,"Reflection "+n);}
            report["lightmaps"]=LightmapSettings.lightmaps.Length;report["lightProbes"]=LightmapSettings.lightProbes.count;
            Check(LightmapSettings.lightmaps.Length>0 && LightmapSettings.lightProbes.count>624,"Research baked lighting");
            walker.enabled=true;Check(save.SaveNow(),"Research safe save");
            report["complete"]=report["error"]==null;File.WriteAllText(Path.Combine(output,"research.json"),report.ToString());
            Debug.Log("RESEARCH_GALLERY_RESULT "+report["complete"]);Application.Quit(report["error"]==null?0:1);
        }
        static Vector3 P(float x,float z)=>new Vector3(x,.06f,z);
        void Check(bool pass,string name){checks.Add(new JObject{["name"]=name,["passed"]=pass});if(!pass && report["error"]==null)report["error"]=name;}
        IEnumerator Walk(Vector3 target)
        {
            if(report["error"]!=null)yield break;walker.enabled=false;var start=walker.transform.position;int sides=0,ground=0;
            var delta=target-start;delta.y=0;int limit=Mathf.CeilToInt(delta.magnitude/.1f)+15;
            for(int i=0;i<limit;i++)
            {
                delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.06f)break;
                var flags=body.Move(delta.normalized*Mathf.Min(.1f,delta.magnitude)+Vector3.down*.02f);
                if((flags&CollisionFlags.Sides)!=0)sides++;if((flags&CollisionFlags.Below)!=0)ground++;if(i%8==0)yield return null;
            }
            delta=target-walker.transform.position;delta.y=0;
            segments.Add(new JObject{["from"]=start.ToString("F3"),["to"]=target.ToString("F3"),["error"]=delta.magnitude,["sideHits"]=sides,["groundedSteps"]=ground,["actualY"]=walker.transform.position.y});
            Check(delta.magnitude<.12f && sides==0 && (ground>0 || Vector3.Distance(start,target)<.08f) && Mathf.Abs(walker.transform.position.y-target.y)<.2f,"Research route blocked "+target);
        }
        IEnumerator Frame(string name,Vector3 target){walker.enabled=true;walker.Face(target);yield return new WaitForSecondsRealtime(.1f);yield return new WaitForEndOfFrame();Capture(name);}
        void Capture(string name)
        {
            var camera=walker.View;var rt=new RenderTexture(1280,720,24);var old=camera.targetTexture;var active=RenderTexture.active;var image=new Texture2D(1280,720,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();File.WriteAllBytes(Path.Combine(output,name+".png"),image.EncodeToPNG());}
            finally{camera.targetTexture=old;RenderTexture.active=active;Destroy(image);rt.Release();Destroy(rt);}
        }
    }
}
