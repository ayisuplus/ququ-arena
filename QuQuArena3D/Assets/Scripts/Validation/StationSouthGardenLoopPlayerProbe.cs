using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Walks both W4P garden-loop entrances and captures the Player's 3D view.
    public sealed class StationSouthGardenLoopPlayerProbe : MonoBehaviour
    {
        string output;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-south-loop-output");
            if (at < 0 || at + 1 >= args.Length ||
                !Path.IsPathRooted(args[at + 1])) return;
            var probe = new GameObject("Station south garden loop Player probe")
                .AddComponent<StationSouthGardenLoopPlayerProbe>();
            probe.output = args[at + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var report = new JObject { ["scene"] = SceneManager.GetActiveScene().name };
            try
            {
                var walker = FindFirstObjectByType<StationGrayboxWalker>();
                var save = FindFirstObjectByType<StationWorldSave>();
                var notice = FindFirstObjectByType<StationPublicMatchNotice>();
                var match = FindFirstObjectByType<ArenaStationLiveMatch>();
                var root = GameObject.Find("Southeast south garden loop W4P");
                if (report["scene"].ToString() != "BlackHoleStationSouthGardenLoopW4P" ||
                    !walker || !walker.View || !save || !save.enabled ||
                    save.LastLoadSource != "fresh" || !notice || notice.Match != match ||
                    !root || !GameObject.Find("Loop Veggie six plant foliage"))
                    throw new InvalidOperationException("W4P fresh scene incomplete");
                var body = walker.GetComponent<CharacterController>();
                walker.enabled = false;
                body.enabled = false;
                walker.transform.position = P(100, -190);
                body.enabled = true;
                var distance = 0f;
                void Walk(Vector3 from, Vector3 to)
                {
                    if (Vector3.Distance(walker.transform.position, from) > .2f)
                        throw new InvalidOperationException("Loop route discontinuous");
                    var length = Vector3.Distance(from, to);
                    var steps = Mathf.CeilToInt(length / .2f);
                    for (var i = 1; i <= steps; i++)
                    {
                        var target = Vector3.Lerp(from, to, (float)i / steps);
                        body.Move(target - walker.transform.position + Vector3.down * .01f);
                        if (Vector2.Distance(new Vector2(target.x, target.z),
                            new Vector2(walker.transform.position.x,
                                walker.transform.position.z)) > .18f)
                            throw new InvalidOperationException("Loop blocked near " +
                                walker.transform.position + " toward " + target);
                        if (!Physics.RaycastAll(walker.transform.position +
                                Vector3.up * .55f, Vector3.down, 1.5f).Any(hit =>
                                hit.normal.y > .65f && hit.collider.GetComponent<Renderer>()))
                            throw new InvalidOperationException("Loop floor missing near " +
                                walker.transform.position);
                    }
                    distance += length;
                }
                Walk(P(100,-190), P(108,-190));
                Walk(P(108,-190), P(108,-217));
                SaveWorld(walker.View, walker.transform.position, P(120,-218),
                    Path.Combine(output, "west-entry.png"));
                Walk(P(108,-217), P(120,-217));
                SaveWorld(walker.View, walker.transform.position, P(120,-226),
                    Path.Combine(output, "plant-terrace.png"));
                Walk(P(120,-217), P(132,-217));
                Walk(P(132,-217), P(132,-190));
                Walk(P(132,-190), P(140,-190));
                report["westToEastMeters"] = Math.Round(distance, 1);
                Walk(P(140,-190), P(132,-190));
                Walk(P(132,-190), P(132,-217));
                Walk(P(132,-217), P(108,-217));
                Walk(P(108,-217), P(108,-190));
                Walk(P(108,-190), P(100,-190));
                report["roundTripMeters"] = Math.Round(distance, 1);
                var detourDistance = distance;
                Walk(P(100,-190), P(140,-190));
                Walk(P(140,-190), P(100,-190));
                report["directRoadMeters"] = Math.Round(distance - detourDistance, 1);
                report["bothEntrances"] = Vector3.Distance(
                    walker.transform.position, P(100,-190)) < .2f;
                report["plantDisplay"] = root.GetComponentsInChildren<Transform>(true)
                    .Count(t => t.name.StartsWith("Loop Veggie plant pillow ")) == 6;
                if (!(bool)report["bothEntrances"] || !(bool)report["plantDisplay"])
                    throw new InvalidOperationException("Loop route or six plants missing");
                walker.enabled = true;
                report["saved"] = save.SaveNow();
                if (!(bool)report["saved"])
                    throw new InvalidOperationException("Garden loop safe save failed");
            }
            catch (Exception error) { report["error"] = error.ToString(); }
            File.WriteAllText(Path.Combine(output, "loop.json"), report.ToString());
            Application.Quit(report["error"] == null ? 0 : 1);
        }

        static Vector3 P(float x, float z) => new Vector3(x, .06f, z);

        static void SaveWorld(Camera camera, Vector3 position, Vector3 target, string path)
        {
            var priorPosition = camera.transform.position;
            var priorRotation = camera.transform.rotation;
            var priorTarget = camera.targetTexture;
            var priorActive = RenderTexture.active;
            var texture = new RenderTexture(1280, 720, 24);
            var image = new Texture2D(1280, 720, TextureFormat.RGB24, false);
            try
            {
                camera.transform.position = position + Vector3.up * 1.63f;
                camera.transform.LookAt(target + Vector3.up * 1.4f);
                camera.targetTexture = texture;
                camera.Render();
                RenderTexture.active = texture;
                image.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0);
                image.Apply();
                File.WriteAllBytes(path, image.EncodeToPNG());
            }
            finally
            {
                camera.transform.SetPositionAndRotation(priorPosition, priorRotation);
                camera.targetTexture = priorTarget;
                RenderTexture.active = priorActive;
                Destroy(image);
                texture.Release();
                Destroy(texture);
            }
        }
    }
}
