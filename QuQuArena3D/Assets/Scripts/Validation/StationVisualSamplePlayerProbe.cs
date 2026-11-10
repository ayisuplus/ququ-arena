using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Runs only for an isolated visual-sample Player launch with an explicit output directory.
    public sealed class StationVisualSamplePlayerProbe : MonoBehaviour
    {
        string output;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-v012-visual-probe-output");
            if (at < 0 || at + 1 >= args.Length || !Path.IsPathRooted(args[at + 1])) return;
            new GameObject("v012 visual Player probe")
                .AddComponent<StationVisualSamplePlayerProbe>().output = args[at + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var report = new JObject {
                ["scene"] = SceneManager.GetActiveScene().name,
                ["graphics"] = SystemInfo.graphicsDeviceName,
                ["width"] = Screen.width,
                ["height"] = Screen.height,
                ["segments"] = new JArray()
            };
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var controller = walker ? walker.GetComponent<CharacterController>() : null;
            var save = FindFirstObjectByType<StationWorldSave>();
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var broadcast = FindFirstObjectByType<StationLoungeBroadcast>();
            var approach = GameObject.Find("V012 A1 observation approach enclosure trial");
            report["keyboardAvailable"] = Keyboard.current != null;
            report["mouseAvailable"] = Mouse.current != null;
            report["firstPerson"] = walker && !walker.ThirdPersonMode;
            report["cafeId"] = cafe ? cafe.StableId : "missing";
            report["saveLoadSource"] = save ? save.LastLoadSource : "missing";
            var serene = report["scene"].Value<string>() == "BlackHoleStationSereneV013";
            if (serene)
            {
                var probeObject = GameObject.Find("Cafe local reflections");
                var probe = probeObject ? probeObject.GetComponent<ReflectionProbe>() : null;
                report["cafeReflectionMode"] = probe ? probe.mode.ToString() : "missing";
                report["cafeReflectionTexture"] = probe && probe.texture ? probe.texture.name : "missing";
                report["cafeReflectionResolution"] = probe && probe.texture ? probe.texture.width : 0;
                report["realtimeReflectionProbes"] = QualitySettings.realtimeReflectionProbes;
                var galleryReflections = new JArray();
                report["galleryReflections"] = galleryReflections;
                foreach (var name in new[] { "South link reflections", "South gallery reflections", "West gallery reflections", "Lookout interior reflections", "Pavilion local reflections" })
                {
                    var obj = GameObject.Find(name);
                    var reflection = obj ? obj.GetComponent<ReflectionProbe>() : null;
                    var valid = reflection && reflection.isActiveAndEnabled &&
                        reflection.mode == UnityEngine.Rendering.ReflectionProbeMode.Custom &&
                        reflection.texture is Cubemap && reflection.texture.width == 128;
                    galleryReflections.Add(new JObject { ["name"] = name, ["passed"] = valid });
                    if (!valid) report["error"] = "Gallery reflection cubemap missing: " + name;
                }
                var sightlines = new JArray();
                report["lookoutSightlines"] = sightlines;
                foreach (var z in new[] { -247f, -246f, -245f })
                {
                    var eye = new Vector3(169, 1.6f, z);
                    var hitGlass = Physics.Raycast(eye, new Vector3(-1200, -1000, 0) - eye, out var hit, 3f) &&
                        hit.collider.name == "West observation glass";
                    sightlines.Add(new JObject { ["z"] = z, ["firstHit"] = hit.collider ? hit.collider.name : "none", ["passed"] = hitGlass });
                    if (!hitGlass) report["error"] = "Lookout sightline obstructed at " + z;
                }
                if (!probe || !probe.isActiveAndEnabled ||
                    probe.mode != UnityEngine.Rendering.ReflectionProbeMode.Custom ||
                    !(probe.texture is Cubemap) || probe.texture.width != 256)
                    report["error"] = "Cafe interior reflection cubemap missing in Player";
                report["bakedLightmapCount"] = LightmapSettings.lightmaps.Length;
                report["bakedLightProbeCount"] = LightmapSettings.lightProbes ? LightmapSettings.lightProbes.count : 0;
                var ceiling = GameObject.Find("Rounded ceiling cloud");
                var ceilingRenderer = ceiling ? ceiling.GetComponent<Renderer>() : null;
                report["cafeCeilingLightmapIndex"] = ceilingRenderer ? ceilingRenderer.lightmapIndex : -1;
                var table = GameObject.Find("Rounded shared oak table");
                var wood = table ? table.GetComponent<Renderer>().sharedMaterial : null;
                report["oakRoughnessMap"] = wood && wood.GetTexture("_MetallicGlossMap") ?
                    wood.GetTexture("_MetallicGlossMap").name : "missing";
                report["oakRoughnessKeyword"] = wood && wood.IsKeywordEnabled("_METALLICSPECGLOSSMAP");
                if (LightmapSettings.lightmaps.Length == 0 || !ceilingRenderer || ceilingRenderer.lightmapIndex < 0 ||
                    ceilingRenderer.lightmapIndex >= LightmapSettings.lightmaps.Length ||
                    report["bakedLightProbeCount"].Value<int>() < 261 ||
                    report["oakRoughnessMap"].Value<string>() == "missing" ||
                    !report["oakRoughnessKeyword"].Value<bool>())
                    report["error"] = "Baked interior lighting or oak roughness missing in Player";
            }
            if ((!serene && report["scene"].Value<string>() != "BlackHoleStationVisualSampleV012A1") ||
                !walker || !walker.View || !controller || !save || !save.enabled ||
                !cafe || cafe.StableId != "east-lounge-cafe-01" || cafe.Seats.Length != (serene ? 10 : 4) ||
                !broadcast || !broadcast.Screen ||
                !approach || approach.transform.childCount != 48 ||
                walker.ThirdPersonMode || Keyboard.current == null || Mouse.current == null ||
                save.LastLoadSource != "fresh")
                report["error"] = "v012 sample, first-person input or fresh QA save missing";
            else
            {
                if (serene)
                {
                    report["arrivalSpawn"] = walker.transform.position.ToString("F3");
                    if (Vector3.Distance(walker.transform.position, new Vector3(210, .06f, 180)) > .2f)
                        report["error"] = "Formal arrival spawn missing";
                    controller.enabled = false;
                    walker.transform.position = P(205f, -209f);
                    controller.enabled = true;
                    Physics.SyncTransforms();
                }
                var outward = new[] {
                    P(205f, -209f), P(205f, -205f), P(205f, -209f),
                    P(196f, -207f), P(194f, -205f), P(190f, -205f),
                    P(190f, -216f), P(190f, -220f), P(190f, -222f),
                    P(186f, -222f), P(185f, -225f), P(184.7f, -230f),
                    P(185f, -236f), P(185f, -242f), P(185f, -246f),
                    P(178f, -246f), P(171.5f, -246f), P(168.7f, -244.7f)
                };
                var route = outward.Concat(outward.Reverse().Skip(1)).ToArray();
                walker.enabled = false;
                controller.Move(Vector3.down * .2f);
                report["initial"] = walker.transform.position.ToString("F3");
                for (var i = 1; i < route.Length && report["error"] == null; i++)
                {
                    var sideHits = 0;
                    var groundedSteps = 0;
                    var steps = 0;
                    var limit = Mathf.CeilToInt(Vector3.Distance(route[i - 1], route[i]) / .1f) + 10;
                    for (; steps < limit; steps++)
                    {
                        var remaining = route[i] - walker.transform.position;
                        remaining.y = 0f;
                        if (remaining.magnitude < .06f) break;
                        var move = remaining.normalized * Mathf.Min(.1f, remaining.magnitude);
                        var flags = controller.Move(move + Vector3.down * .02f);
                        if ((flags & CollisionFlags.Sides) != 0) sideHits++;
                        if ((flags & CollisionFlags.Below) != 0) groundedSteps++;
                        yield return null;
                    }
                    var offset = route[i] - walker.transform.position;
                    offset.y = 0f;
                    ((JArray)report["segments"]).Add(new JObject {
                        ["index"] = i, ["from"] = route[i - 1].ToString("F3"),
                        ["to"] = route[i].ToString("F3"), ["steps"] = steps,
                        ["horizontalError"] = offset.magnitude,
                        ["sideHits"] = sideHits, ["groundedSteps"] = groundedSteps,
                        ["endY"] = walker.transform.position.y
                    });
                    if (offset.magnitude > .12f || sideHits != 0 || groundedSteps == 0 ||
                        walker.transform.position.y > .15f)
                        report["error"] = "Route blocked or unsupported at segment " + i;
                    if (report["error"] == null && (i == 1 || i == 5 || i == 11 || i == 14 || i == 17))
                    {
                        walker.enabled = true;
                        yield return null;
                        walker.Face(i == 17 ? (serene ? new Vector3(-1200f, -1000f, 0f) : new Vector3(0f, -145f, 0f)) :
                            i == 14 ? new Vector3(169f, 1.5f, -246f) :
                            i == 11 ? new Vector3(173f, 1.5f, -246f) :
                            i == 5 ? new Vector3(205f, 1.5f, -205f) :
                            new Vector3(194f, 1.5f, -205f));
                        yield return new WaitForEndOfFrame();
                        var name = i == 17 ? "observation-window.png" :
                            i == 14 ? "west-turn.png" :
                            i == 11 ? "connector-window.png" :
                            i == 5 ? "street-to-cafe.png" : "cafe.png";
                        try { SaveFrame(walker.View, Path.Combine(output, name)); }
                        catch (Exception error) { report["error"] = error.Message; }
                        if (i == 1 && report["error"] == null)
                        {
                            walker.Face(broadcast.Screen.bounds.center);
                            yield return null;
                            yield return new WaitForEndOfFrame();
                            var feed = GameObject.Find("Lounge arena feed camera");
                            var feedCamera = feed ? feed.GetComponent<Camera>() : null;
                            var screenMaterial = broadcast.Screen.sharedMaterial;
                            report["broadcastFeedCameraEnabled"] = feedCamera && feedCamera.enabled;
                            report["broadcastShader"] = screenMaterial.shader.name;
                            report["broadcastBaseColor"] = screenMaterial.GetColor("_BaseColor").ToString("F3");
                            report["broadcastMapMatchesFeed"] = feedCamera &&
                                screenMaterial.GetTexture("_BaseMap") == feedCamera.targetTexture;
                            try { SaveFrame(walker.View, Path.Combine(output, "cafe-broadcast.png")); }
                            catch (Exception error) { report["error"] = error.Message; }
                            if (!feedCamera || !feedCamera.targetTexture ||
                                !report["broadcastMapMatchesFeed"].Value<bool>())
                                report["error"] = "Lounge broadcast feed or screen texture missing";
                            else
                            {
                                try
                                {
                                    report["broadcastNonBlackPixels"] = SaveTarget(feedCamera.targetTexture,
                                        Path.Combine(output, "broadcast-feed.png"));
                                    if (report["broadcastNonBlackPixels"].Value<int>() < 10000)
                                        report["error"] = "Lounge broadcast feed remained black";
                                }
                                catch (Exception error) { report["error"] = error.Message; }
                            }
                        }
                        walker.enabled = false;
                    }
                }
                report["end"] = walker.transform.position.ToString("F3");
                report["segmentCount"] = ((JArray)report["segments"]).Count;
                report["complete"] = report["error"] == null &&
                    report["segmentCount"].Value<int>() == route.Length - 1;
                if (serene && report["error"] == null)
                {
                    var probeObject = GameObject.Find("Forecourt local reflections");
                    var probe = probeObject ? probeObject.GetComponent<ReflectionProbe>() : null;
                    report["forecourtReflectionTexture"] = probe && probe.texture ? probe.texture.name : "missing";
                    var halo = GameObject.Find("Forecourt recessed light 0");
                    var haloMaterial = halo ? halo.GetComponent<Renderer>().sharedMaterial : null;
                    report["forecourtEmissionEnabled"] = haloMaterial && haloMaterial.IsKeywordEnabled("_EMISSION");
                    if (!probe || !probe.isActiveAndEnabled || !(probe.texture is Cubemap) || probe.texture.width != 256 ||
                        !report["forecourtEmissionEnabled"].Value<bool>())
                        report["error"] = "Forecourt reflection or emissive light material missing";
                    var roof = new JArray();
                    report["forecourtRoof"] = roof;
                    foreach (var x in new[] { 186f, 190f, 193f })
                    foreach (var z in new[] { -185f, -192f, -199f, -206f, -213f })
                    {
                        var hitRoof = Physics.Raycast(new Vector3(x, 1.6f, z), Vector3.up, out var hit, 4f) &&
                            hit.collider.name == "Cafe approach transparent canopy" && Mathf.Abs(hit.point.y - 4.31f) < .02f;
                        roof.Add(new JObject { ["x"] = x, ["z"] = z, ["passed"] = hitRoof });
                        if (!hitRoof) report["error"] = "Forecourt roof gap at " + x + "," + z;
                    }
                    var pavilionRoof = new JArray();
                    report["pavilionRoof"] = pavilionRoof;
                    foreach (var x in new[] { 169f, 174f, 179f })
                    foreach (var z in new[] { -204f, -209f, -214f })
                    {
                        var hitRoof = Physics.Raycast(new Vector3(x, 1.6f, z), Vector3.up, out var hit, 4f) &&
                            hit.collider.name == "Pavilion integrated roof" && Mathf.Abs(hit.point.y - 4.44f) < .02f;
                        pavilionRoof.Add(new JObject { ["x"] = x, ["z"] = z, ["passed"] = hitRoof });
                        if (!hitRoof) report["error"] = "Pavilion roof gap at " + x + "," + z;
                    }
                    var branch = new[] { P(196f, -207f), P(194f, -205f), P(190f, -205f), P(190f, -187f),
                        P(186f, -187f), P(174f, -187f), P(174f, -198f), P(174f, -207f),
                        P(168.5f, -207f), P(168.5f, -214f), P(174f, -214f), P(174f, -217f),
                        P(182f, -217f), P(182f, -198f), P(186f, -198f), P(190f, -198f), P(190f, -205f),
                        P(186f, -205f), P(186f, -218f), P(186f, -205f), P(190f, -205f),
                        P(194f, -205f), P(196f, -207f), P(205f, -209f) };
                    var branches = new JArray();
                    report["forecourtSegments"] = branches;
                    for (var index = 0; index < branch.Length && report["error"] == null; index++)
                    {
                        var destination = branch[index];
                        var limit = Mathf.CeilToInt(Vector3.Distance(walker.transform.position, destination) / .1f) + 20;
                        var sideHits = 0;
                        var groundedSteps = 0;
                        for (var step = 0; step < limit; step++)
                        {
                            var delta = destination - walker.transform.position;
                            delta.y = 0;
                            if (delta.magnitude < .06f) break;
                            var flags = controller.Move(delta.normalized * Mathf.Min(.1f, delta.magnitude) + Vector3.down * .02f);
                            if ((flags & CollisionFlags.Sides) != 0) sideHits++;
                            if ((flags & CollisionFlags.Below) != 0) groundedSteps++;
                            yield return null;
                        }
                        var offset = destination - walker.transform.position;
                        offset.y = 0;
                        branches.Add(new JObject { ["index"] = index, ["target"] = destination.ToString("F3"),
                            ["horizontalError"] = offset.magnitude, ["sideHits"] = sideHits, ["groundedSteps"] = groundedSteps });
                        if (offset.magnitude > .12f || sideHits != 0 || groundedSteps == 0)
                            report["error"] = "Forecourt route blocked at " + index;
                        if (index == 3 || index == 7 || index == 14 || index == 18)
                        {
                            walker.enabled = true;
                            yield return null;
                            walker.Face(index == 3 ? new Vector3(190, 2, -216) :
                                index == 7 ? new Vector3(174, 1.7f, -211) :
                                index == 14 ? new Vector3(195, 2, -209) : new Vector3(189, 2, -192));
                            yield return new WaitForEndOfFrame();
                            try { SaveFrame(walker.View, Path.Combine(output, "forecourt-" + index + ".png")); }
                            catch (Exception error) { report["error"] = error.Message; }
                            walker.enabled = false;
                        }
                    }
                    report["complete"] = report["error"] == null && branches.Count == branch.Length;
                }
                if (serene && report["error"] == null)
                {
                    var seats = new JArray();
                    report["seats"] = seats;
                    var start = walker.transform.position;
                    for (var seatIndex = 0; seatIndex < cafe.Seats.Length && report["error"] == null; seatIndex++)
                    {
                        var seat = cafe.Seats[seatIndex];
                        var approachPoint = seat.position + seat.forward * (seatIndex < 4 ? -.95f : 1.02f);
                        // New window seats are reached from the aisle, not teleported through furniture.
                        var seatRoute = seatIndex < 4 ? new[] { approachPoint } :
                            new[] { P(196f, -207f), P(196f, seatIndex < 8 ? -199f : -209f),
                                P(approachPoint.x, seatIndex < 8 ? -199f : -209f), approachPoint };
                        if (seatIndex < 4)
                        {
                            controller.enabled = false;
                            walker.transform.position = approachPoint + Vector3.up * .06f;
                            controller.enabled = true;
                        }
                        var sideHits = 0;
                        foreach (var destination in seatRoute)
                        {
                            var limit = Mathf.CeilToInt(Vector3.Distance(walker.transform.position, destination) / .1f) + 20;
                            for (var step = 0; step < limit; step++)
                            {
                                var delta = destination - walker.transform.position;
                                delta.y = 0;
                                if (delta.magnitude < .06f) break;
                                if ((controller.Move(delta.normalized * Mathf.Min(.1f, delta.magnitude) + Vector3.down * .02f) & CollisionFlags.Sides) != 0) sideHits++;
                                yield return null;
                            }
                            var approachError = destination - walker.transform.position;
                            approachError.y = 0;
                            if (approachError.magnitude > .12f) report["error"] = "Cafe approach incomplete: " + seatIndex;
                        }
                        walker.enabled = true;
                        var sat = cafe.Use() && cafe.SeatedSeatIndex == seatIndex;
                        var facing = Vector3.Dot(walker.View.transform.forward, seat.forward) > .999f;
                        if (sat) SaveFrame(walker.View, Path.Combine(output, "seat-" + seatIndex + ".png"));
                        var stood = cafe.Stand();
                        seats.Add(new JObject { ["index"] = seatIndex, ["sat"] = sat, ["stood"] = stood, ["facing"] = facing, ["sideHits"] = sideHits });
                        walker.enabled = false;
                        if (!sat || !stood || !facing || sideHits != 0) report["error"] = "Cafe seat failed: " + seatIndex;
                        // Return along the same free aisle before approaching the next seat.
                        if (seatIndex >= 4)
                        {
                            foreach (var destination in seatRoute.Reverse().Skip(1).Append(start))
                            {
                                var limit = Mathf.CeilToInt(Vector3.Distance(walker.transform.position, destination) / .1f) + 20;
                                for (var step = 0; step < limit; step++)
                                {
                                    var delta = destination - walker.transform.position; delta.y = 0;
                                    if (delta.magnitude < .06f) break;
                                    if ((controller.Move(delta.normalized * Mathf.Min(.1f, delta.magnitude) + Vector3.down * .02f) & CollisionFlags.Sides) != 0) report["error"] = "Cafe seat return blocked: " + seatIndex;
                                    yield return null;
                                }
                                var returnError = destination - walker.transform.position;
                                returnError.y = 0;
                                if (returnError.magnitude > .12f) report["error"] = "Cafe return incomplete: " + seatIndex;
                            }
                        }
                        else
                        {
                            controller.enabled = false; walker.transform.position = start;
                            controller.enabled = true;
                        }
                    }
                    report["complete"] = report["error"] == null && seats.Count == cafe.Seats.Length;
                }
            }
            File.WriteAllText(Path.Combine(output, "route.json"), report.ToString());
            Application.Quit(report["error"] == null ? 0 : 1);
        }

        static Vector3 P(float x, float z) => new Vector3(x, 0f, z);

        static void SaveFrame(Camera camera, string path)
        {
            var target = new RenderTexture(1280, 720, 24);
            var oldTarget = camera.targetTexture;
            var oldActive = RenderTexture.active;
            var frame = new Texture2D(1280, 720, TextureFormat.RGB24, false);
            try
            {
                camera.targetTexture = target;
                camera.Render();
                RenderTexture.active = target;
                frame.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
                frame.Apply();
                File.WriteAllBytes(path, frame.EncodeToPNG());
            }
            finally
            {
                camera.targetTexture = oldTarget;
                RenderTexture.active = oldActive;
                Destroy(frame);
                target.Release();
                Destroy(target);
            }
        }

        static int SaveTarget(RenderTexture target, string path)
        {
            var previous = RenderTexture.active;
            var frame = new Texture2D(target.width, target.height, TextureFormat.RGB24, false);
            try
            {
                RenderTexture.active = target;
                frame.ReadPixels(new Rect(0, 0, target.width, target.height), 0, 0);
                frame.Apply();
                var bright = frame.GetPixels32().Count(pixel =>
                    pixel.r + pixel.g + pixel.b > 25);
                File.WriteAllBytes(path, frame.EncodeToPNG());
                return bright;
            }
            finally
            {
                RenderTexture.active = previous;
                Destroy(frame);
            }
        }
    }
}
