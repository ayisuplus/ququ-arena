using System;
using System.Collections;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Explicit isolated Player validation; never attached during ordinary play.
    public sealed class StationArrivalPlayerProbe : MonoBehaviour
    {
        string output;
        StationGrayboxWalker walker;
        CharacterController controller;
        JObject report;
        readonly JArray segments = new JArray();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, "--station-v013-arrival-probe-output");
            if (i >= 0 && i + 1 < args.Length && Path.IsPathRooted(args[i + 1]))
                new GameObject("Arrival Player validation").AddComponent<StationArrivalPlayerProbe>().output = args[i + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            walker = FindFirstObjectByType<StationGrayboxWalker>();
            controller = walker.GetComponent<CharacterController>();
            var save = FindFirstObjectByType<StationWorldSave>();
            report = new JObject { ["scene"] = SceneManager.GetActiveScene().name,
                ["graphics"] = SystemInfo.graphicsDeviceName, ["segments"] = segments,
                ["initial"] = walker.transform.position.ToString("F3"), ["saveLoadSource"] = save.LastLoadSource };
            Check(report["scene"].Value<string>() == "BlackHoleStationSereneV013" &&
                save.LastLoadSource == "fresh" && !walker.ThirdPersonMode &&
                Vector3.Distance(walker.transform.position, new Vector3(210, .06f, 180)) < .2f, "Arrival fresh spawn");
            yield return Frame("arrival", new Vector3(190, 2, 191));
            walker.enabled = false;
            yield return Walk(new Vector3(222, 0, 180));
            yield return Frame("boarding", new Vector3(230, 2, 184));
            walker.enabled = false;
            yield return Walk(new Vector3(210, 0, 180));
            yield return Walk(new Vector3(190, 0, 180));
            yield return Frame("hall", new Vector3(190, 2, 211));
            walker.enabled = false;
            foreach (var z in new[] { 160f, 140f, 120f, 100f, 80f, 60f, 40f, 20f, 0f })
                yield return Walk(new Vector3(190, 0, z));
            var coreFinish = GameObject.Find("V013 core public approach");
            foreach (var x in new[] { 170f, 150f, 130f, 124f })
            {
                yield return Walk(new Vector3(x, 0, 0));
                if (coreFinish && x == 150)
                {
                    yield return Frame("gateway", new Vector3(120, 2.5f, 0));
                    walker.enabled = false;
                }
            }
            var gate = FindFirstObjectByType<StationCoreEastGate>();
            Check(!gate.IsOpen && gate.Door.activeSelf && gate.Use() && gate.IsOpen, "Public gate opens");
            Physics.SyncTransforms();
            yield return Walk(new Vector3(120, 0, 0));
            Check(!gate.Use() && gate.IsOpen, "Public gate cannot close onto visitor");
            yield return Walk(new Vector3(112, 0, 0));
            yield return Walk(new Vector3(112, 0, 6));
            foreach (var x in new[] { 95f, 75f, 60f })yield return Walk(new Vector3(x, 0, 6));
            yield return Frame("core", new Vector3(0, 2, 0));
            walker.enabled = false;
            foreach (var x in new[] { 75f, 95f, 112f })yield return Walk(new Vector3(x, 0, 6));
            yield return Walk(new Vector3(112, 0, 0));
            yield return Walk(new Vector3(124, 0, 0));
            Check(gate.Use() && !gate.IsOpen && gate.Door.activeSelf, "Public gate closes after return");
            if (coreFinish)
            {
                yield return Walk(new Vector3(125, 0, 0));
                foreach (var z in new[] { -20f, -40f, -60f, -74f, -60f, -40f, -20f, 0f,
                    20f, 40f, 60f, 80f, 100f, 122f, 100f, 80f, 60f, 40f, 20f, 0f })
                    yield return Walk(new Vector3(125, 0, z));
                var homes = FindObjectsByType<StationRoomIdentity>(FindObjectsSortMode.None);
                var ids = new JArray();report["homes"] = ids;
                foreach (var home in homes)
                {
                    ids.Add(new JObject { ["room"] = home.RoomId, ["resident"] = home.ResidentId });
                    Check(home.RoomId == "room/" + home.ResidentId, "Room identity retained " + home.RoomId);
                }
                Check(homes.Length == 6, "Six resident homes retained");
            }
            foreach (var x in new[] { 140f, 165f, 190f })yield return Walk(new Vector3(x, 0, 0));
            if (coreFinish)
            {
                yield return Walk(new Vector3(210, 0, 0));
                yield return Walk(new Vector3(190, 0, 0));
                yield return Walk(new Vector3(190, 0, -20));
                yield return Walk(new Vector3(190, 0, 0));
            }
            foreach (var z in new[] { 20f, 40f, 60f, 80f, 100f, 120f, 140f, 160f, 180f, 198f, 207f })yield return Walk(new Vector3(190, 0, z));
            var cargoChecks = new JArray();report["cargo"] = cargoChecks;
            foreach (var cargo in FindObjectsByType<StationDockCargoService>(FindObjectsSortMode.None))
            {
                var original = cargo.CaptureState();
                var x = cargo.Cargo.position.x;
                // Access the console through the north bypass, outside either moving carrier's sweep.
                yield return Walk(new Vector3(190, 0, 209));
                yield return Walk(new Vector3(x, 0, 209));
                Check(cargo.Use(), "Cargo starts " + cargo.StableId);
                var deadline = Time.time + 8;
                while (cargo.Moving && Time.time < deadline)yield return null;
                Check(cargo.AtInspection && !cargo.Moving, "Cargo arrives " + cargo.StableId);
                yield return Walk(new Vector3(x + 4.2f, 0, 209));
                yield return Walk(new Vector3(x + 4.2f, 0, 190));
                Check(cargo.Inspect(), "Cargo inspection " + cargo.StableId);
                yield return Walk(new Vector3(x + 4.2f, 0, 209));
                yield return Walk(new Vector3(x, 0, 209));
                Check(cargo.Use(), "Cargo returns " + cargo.StableId);
                deadline = Time.time + 8;
                while (cargo.Moving && Time.time < deadline)yield return null;
                var done = cargo.Completed && !cargo.AtInspection && !cargo.Moving && cargo.Inspected;
                Check(done, "Cargo complete " + cargo.StableId);
                cargoChecks.Add(new JObject { ["id"] = cargo.StableId, ["completed"] = done,
                    ["stateRestorable"] = cargo.CanRestore(cargo.CaptureState()) });
                cargo.RestoreState(original);
                yield return Walk(new Vector3(190, 0, 209));
            }
            Check(cargoChecks.Count == 2, "Two cargo services retained");
            var roofChecks = new JArray();report["roof"] = roofChecks;
            foreach (var p in new[] { new Vector3(190, 1.6f, 182),new Vector3(190, 1.6f, 198),new Vector3(210, 1.6f, 190),
                new Vector3(170,1.6f,190),new Vector3(190,1.6f,150),new Vector3(190,1.6f,90),new Vector3(220,1.6f,180) })
            {
                var hit = Physics.Raycast(p, Vector3.up, out var roof, 6f);
                roofChecks.Add(new JObject { ["point"] = p.ToString(), ["hit"] = roof.collider ? roof.collider.name : "none", ["passed"] = hit });
                Check(hit, "Continuous roof " + p);
            }
            if (coreFinish)
            {
                var coreRoof = new JArray();report["coreRoof"] = coreRoof;
                foreach (var x in new[] { 121f, 125f, 129f, 132f, 138f, 150f, 161f, 175f, 184.3f, 190f })
                    foreach (var z in new[] { -3f, 0f, 3f })
                    {
                        var hit = Physics.Raycast(new Vector3(x, 1.6f, z), Vector3.up, out var roof, 6f);
                        coreRoof.Add(new JObject { ["x"] = x, ["z"] = z, ["hit"] = roof.collider ? roof.collider.name : "none", ["passed"] = hit });
                        Check(hit, "Public bridge roof " + x + ", " + z);
                    }
                foreach (var name in new[] { "Core gateway reflections", "Core bridge reflections", "East junction reflections",
                    "Housing bypass north reflections", "Housing bypass south reflections" })
                {
                    var reflection = GameObject.Find(name).GetComponent<ReflectionProbe>();
                    Check(reflection.texture is Cubemap && reflection.texture.width == 128, "Core reflections " + name);
                }
            }
            report["lightmaps"] = LightmapSettings.lightmaps.Length;
            report["lightProbes"] = LightmapSettings.lightProbes.count;
            Check(LightmapSettings.lightmaps.Length > 0 && LightmapSettings.lightProbes.count >= 399, "Arrival baked lighting");
            foreach (var name in new[] { "Arrival hall reflections", "Arrival spine reflections", "Arrival boarding reflections" })
            {
                var probe = GameObject.Find(name).GetComponent<ReflectionProbe>();
                Check(probe.texture is Cubemap && probe.texture.width == 128, "Arrival reflections " + name);
            }
            report["complete"] = report["error"] == null;
            File.WriteAllText(Path.Combine(output, "report.json"), report.ToString());
            Debug.Log("ARRIVAL_PLAYER_RESULT " + report["complete"]);
            Application.Quit(report["error"] == null ? 0 : 1);
        }

        void Check(bool pass, string label) { if (!pass && report["error"] == null)report["error"] = label; }

        IEnumerator Walk(Vector3 target)
        {
            if (report["error"] != null)yield break;
            var start = walker.transform.position;var sideHits = 0;var grounded = 0;var steps = 0;
            var distance = target - start;distance.y = 0;
            if (distance.magnitude < .06f)yield break;
            var limit = Mathf.CeilToInt(Vector3.Distance(start, target) / .1f) + 15;
            for (; steps < limit; steps++)
            {
                var delta = target - walker.transform.position;delta.y = 0;
                if (delta.magnitude < .06f)break;
                var flags = controller.Move(delta.normalized * Mathf.Min(.1f, delta.magnitude) + Vector3.down * .02f);
                if ((flags & CollisionFlags.Sides) != 0)sideHits++;
                if ((flags & CollisionFlags.Below) != 0)grounded++;
                if (steps % 8 == 0)yield return null;
            }
            var error = target - walker.transform.position;error.y = 0;
            segments.Add(new JObject { ["from"] = start.ToString("F3"), ["to"] = target.ToString("F3"),
                ["horizontalError"] = error.magnitude, ["sideHits"] = sideHits, ["groundedSteps"] = grounded, ["endY"] = walker.transform.position.y });
            Check(error.magnitude < .12f && sideHits == 0 && grounded > 0 && walker.transform.position.y < .15f, "Arrival route blocked: " + target);
        }

        IEnumerator Frame(string name, Vector3 target)
        {
            walker.enabled = true;walker.Face(target);yield return null;yield return new WaitForEndOfFrame();
            var camera = walker.View;var rt = new RenderTexture(1280,720,24);var previous = RenderTexture.active;var old = camera.targetTexture;
            var frame = new Texture2D(1280,720,TextureFormat.RGB24,false);
            try { camera.targetTexture = rt;camera.Render();RenderTexture.active = rt;frame.ReadPixels(new Rect(0,0,1280,720),0,0);frame.Apply();File.WriteAllBytes(Path.Combine(output,name+".png"),frame.EncodeToPNG()); }
            finally { camera.targetTexture = old;RenderTexture.active = previous;Destroy(frame);rt.Release();Destroy(rt); }
        }
    }
}
