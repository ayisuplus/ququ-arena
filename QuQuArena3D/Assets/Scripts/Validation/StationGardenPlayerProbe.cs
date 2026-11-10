using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Opt-in, isolated Player traversal and cross-process plant-care validation.
    public sealed class StationGardenPlayerProbe : MonoBehaviour
    {
        string output, stage;
        StationGrayboxWalker walker;
        CharacterController body;
        JObject report;
        readonly JArray segments = new JArray();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, "--station-v013-garden-probe-output");
            var s = Array.IndexOf(args, "--station-v013-garden-probe-stage");
            if (i < 0 || i + 1 >= args.Length || s < 0 || s + 1 >= args.Length || !Path.IsPathRooted(args[i + 1])) return;
            var probe = new GameObject("Garden Player validation").AddComponent<StationGardenPlayerProbe>();
            probe.output = args[i + 1];probe.stage = args[s + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            walker = FindFirstObjectByType<StationGrayboxWalker>();body = walker.GetComponent<CharacterController>();
            var save = FindFirstObjectByType<StationWorldSave>();var care = FindFirstObjectByType<StationGreenhouseCare>();
            report = new JObject { ["scene"] = SceneManager.GetActiveScene().name, ["stage"] = stage,
                ["graphics"] = SystemInfo.graphicsDeviceName, ["segments"] = segments, ["loadSource"] = save.LastLoadSource };
            Check(report["scene"].ToString() == "BlackHoleStationSereneV013" && care.StableId == "south-greenhouse-veggie-01", "Scene and crop identity");
            if (stage == "read")
            {
                Check(save.LastLoadSource == "primary" && care.CareCount == 1 && care.Stage == 2, "Plant care restored across processes");
                Check(Vector3.Distance(walker.transform.position, P(-190,-170)) < .2f, "Safe garden position restored");
                yield return Frame("resumed", new Vector3(-190,2,-190));
            }
            else if (stage == "write")
            {
                Check(save.LastLoadSource == "fresh" && Vector3.Distance(walker.transform.position, new Vector3(210,.06f,180)) < .2f, "Formal arrival spawn retained");
                var seats = FindObjectsByType<StationGardenSeat>(FindObjectsSortMode.None).Where(s => s.StableId.StartsWith("v013-garden-seat-")).OrderBy(s => s.StableId).ToArray();
                Check(seats.Length == 4 && seats.Select(s => s.StableId).Distinct().Count() == 4, "Four distinct garden seats");
                Check(seats.All(s => !s.Use()) && !care.Use(), "Remote interactions rejected");
                // This focused probe transfers once to the existing east garden road after checking formal spawn.
                walker.enabled = false;body.enabled = false;walker.transform.position = P(-160,-190);body.enabled = true;
                yield return Walk(-166,-190);yield return Walk(-166,-170);yield return Walk(-190,-170);
                yield return Frame("north-arrival",new Vector3(-190,2,-185));
                yield return Walk(-215,-170);yield return Walk(-215,-190);yield return Walk(-215,-205);
                yield return Walk(-190,-205);yield return Walk(-166,-205);yield return Walk(-166,-170);yield return Walk(-190,-170);
                yield return Walk(-190,-176);
                var doors = FindObjectsByType<StationPressureVestibule>(FindObjectsSortMode.None);
                var north = doors.Single(d => d.StableId == "south-greenhouse-north");
                var south = doors.Single(d => d.StableId == "south-greenhouse-south");
                Check(north.UseStreet(), "North outer opens");Physics.SyncTransforms();
                yield return Walk(-190,-181);
                Check(!north.UseRoom() && north.UseStreet() && north.UseRoom(), "North door interlock");Physics.SyncTransforms();
                yield return Walk(-190,-185);Check(north.UseRoom(), "North inner closes");
                yield return Walk(-190,-186);yield return Frame("crop-before",new Vector3(-190,2,-193));
                var small = care.Foliage.localScale.y;
                Check(care.Use() && care.Stage == 1 && care.Use() && care.Stage == 2 && care.CareCount == 1, "Inspect and water crop");
                Check(care.Foliage.localScale.y > small + .3f, "Living crop responds to care");
                yield return Frame("crop-after",new Vector3(-190,2,-193));
                yield return Walk(-200,-186);yield return Walk(-200,-195);yield return Walk(-190,-195);
                Check(south.UseRoom(), "South inner opens");Physics.SyncTransforms();yield return Walk(-190,-199.25f);
                Check(!south.UseStreet() && south.UseRoom() && south.UseStreet(), "South door interlock");Physics.SyncTransforms();
                yield return Walk(-190,-204);Check(south.UseStreet(), "South outer closes");
                Check(!north.RoomOpen && !north.StreetOpen && !south.RoomOpen && !south.StreetOpen, "Four greenhouse doors closed after traversal");
                yield return Walk(-190,-205);
                var seatChecks = new JArray();report["seats"] = seatChecks;
                foreach (var index in new[] { 2,3,1,0 })
                {
                    var seat = seats[index];float z = index >= 2 ? -205 : -173.5f;
                    if (index == 1) { yield return Walk(-166,-205);yield return Walk(-166,z); }
                    yield return Walk(seat.transform.position.x,z);
                    walker.enabled = true;var at = walker.transform.position;var eye = walker.View.transform.localPosition;
                    var originalBlock = walker.InputBlocked;walker.InputBlocked = () => true;
                    Check(!seat.Use(), "Blocked input cannot sit");walker.InputBlocked = originalBlock;
                    Check(seat.Use() && seat.IsSeated && !walker.enabled && Vector3.Distance(at,walker.transform.position) < .01f, "Seated view with safe standing body " + index);
                    yield return null;yield return new WaitForEndOfFrame();Capture("seat-"+index);
                    Check(Vector3.Dot(walker.View.transform.forward, seat.transform.forward) > .999f, "Seat facing " + index);
                    if (index == 0) { seat.enabled = false;Check(!seat.IsSeated && walker.enabled, "Disable releases seat");seat.enabled = true; }
                    else Check(seat.Use() && !seat.IsSeated && walker.enabled, "Stand from garden seat " + index);
                    Check(Vector3.Distance(eye,walker.View.transform.localPosition) < .001f, "Standing view restored " + index);
                    seatChecks.Add(new JObject { ["id"] = seat.StableId, ["standing"] = walker.transform.position.ToString("F3"), ["restored"] = !seat.IsSeated });
                }
                yield return Walk(-215,-173.5f);yield return Walk(-215,-205);
                yield return Walk(-225,-220);yield return Walk(-235,-235);yield return Walk(-225,-220);yield return Walk(-215,-205);
                yield return Walk(-215,-170);yield return Walk(-190,-170);
                var roofs = new JArray();report["roof"] = roofs;
                foreach (var x in new[] { -214f,-207f,-190f,-173f,-166f })foreach (var z in new[] { -213f,-205f,-175f,-168f })
                {
                    bool hit = Physics.Raycast(new Vector3(x,1.6f,z),Vector3.up,out var roof,7);
                    roofs.Add(new JObject { ["x"] = x,["z"] = z,["hit"] = roof.collider ? roof.collider.name : "none",["passed"] = hit });Check(hit,"Garden canopy " + x + "," + z);
                }
                report["lightmaps"] = LightmapSettings.lightmaps.Length;report["lightProbes"] = LightmapSettings.lightProbes.count;
                Check(LightmapSettings.lightmaps.Length > 0 && LightmapSettings.lightProbes.count > 531, "Garden baked lighting loaded");
                foreach (var n in new[] { "Garden north","Garden south","Garden west","Garden east","Greenhouse" })
                { var p = GameObject.Find(n+" reflections").GetComponent<ReflectionProbe>();Check(p.texture is Cubemap && p.texture.width == 128,"Local reflection " + n); }
                walker.enabled = true;report["saved"] = save.SaveNow();Check(report["saved"].Value<bool>(),"Garden safe save");
            }
            else Check(false,"Unknown stage");
            report["careCount"] = care.CareCount;report["careStage"] = care.Stage;report["complete"] = report["error"] == null;
            File.WriteAllText(Path.Combine(output,stage+".json"),report.ToString());
            Debug.Log("GARDEN_PLAYER_RESULT " + stage + " " + report["complete"]);Application.Quit(report["error"] == null ? 0 : 1);
        }

        static Vector3 P(float x,float z) => new Vector3(x,.06f,z);
        void Check(bool pass,string name) { if (!pass && report["error"] == null)report["error"] = name; }
        IEnumerator Walk(float x,float z)
        {
            if (report["error"] != null)yield break;
            walker.enabled = false;var start = walker.transform.position;var target = P(x,z);var side = 0;var ground = 0;
            var delta = target-start;delta.y = 0;if (delta.magnitude < .06f)yield break;
            var limit = Mathf.CeilToInt(delta.magnitude/.1f)+15;
            for (int i=0;i<limit;i++)
            {
                delta=target-walker.transform.position;delta.y=0;if(delta.magnitude<.06f)break;
                var flags=body.Move(delta.normalized*Mathf.Min(.1f,delta.magnitude)+Vector3.down*.02f);
                if((flags&CollisionFlags.Sides)!=0)side++;if((flags&CollisionFlags.Below)!=0)ground++;
                if(i%8==0)yield return null;
            }
            delta=target-walker.transform.position;delta.y=0;
            segments.Add(new JObject{["from"]=start.ToString("F3"),["to"]=target.ToString("F3"),["error"]=delta.magnitude,["sideHits"]=side,["groundedSteps"]=ground,["y"]=walker.transform.position.y});
            Check(delta.magnitude<.12f&&side==0&&ground>0&&walker.transform.position.y<.15f,"Garden route blocked " + target);
        }
        IEnumerator Frame(string name,Vector3 target)
        { walker.enabled=true;walker.Face(target);yield return null;yield return new WaitForEndOfFrame();Capture(name); }
        void Capture(string name)
        {
            var camera=walker.View;var rt=new RenderTexture(1280,720,24);var old=camera.targetTexture;var active=RenderTexture.active;
            var frame=new Texture2D(1280,720,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;frame.ReadPixels(new Rect(0,0,1280,720),0,0);frame.Apply();File.WriteAllBytes(Path.Combine(output,name+".png"),frame.EncodeToPNG());}
            finally{camera.targetTexture=old;RenderTexture.active=active;Destroy(frame);rt.Release();Destroy(rt);}
        }
    }
}
