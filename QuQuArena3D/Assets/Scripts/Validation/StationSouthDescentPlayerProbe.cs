using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Isolated Player launches walk from the cabin through the south descent and back by the west ramp.
    public sealed class StationSouthDescentPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, error, loadSource;
            public float walkedMeters;
            public int moves;
            public Vector3 player;
            public bool floorSupported, lowerRestored, exitedAtGreenhouse, saved;
        }

        string output, stage;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-south-probe-output");
            var stageAt = Array.IndexOf(args, "--station-south-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("South descent Player probe")
                .AddComponent<StationSouthDescentPlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result { stage = stage, floorSupported = true };
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var save = FindFirstObjectByType<StationWorldSave>();
            if (!walker || !save || !save.enabled ||
                !GameObject.Find("South keel descent - greenhouse to lower loop"))
                result.error = "South descent, walker or save is missing";
            else
            {
                walker.enabled = false;
                if (stage == "write")
                {
                    result.error = Walk(walker, result, new[] {
                        P(104, 0, 35), P(94, 0, 35), P(94, 0, -20), P(85, 0, -20),
                        P(85, 0, -100), P(32, 0, -100), P(32, 0, -107),
                        P(42, 0, -108), P(42, 0, -117), P(42, 0, -124)
                    });
                    if (string.IsNullOrEmpty(result.error))
                    {
                        walker.ThirdPersonMode = false;
                        walker.enabled = true;
                        yield return new WaitForEndOfFrame();
                        walker.Face(P(-18, -12, -124));
                        yield return new WaitForEndOfFrame();
                        SaveFrame(Path.Combine(output, "south-descent-top.png"));
                        walker.enabled = false;
                        result.error = Walk(walker, result, new[] {
                            P(42, 0, -124), P(27, -3, -124), P(12, -6, -124),
                            P(-3, -9, -124), P(-18, -12, -124)
                        });
                    }
                    if (string.IsNullOrEmpty(result.error))
                    {
                        walker.enabled = true;
                        yield return new WaitForEndOfFrame();
                        walker.Face(P(-18, -12, -130));
                        yield return new WaitForEndOfFrame();
                        SaveFrame(Path.Combine(output, "south-keel-turn.png"));
                        walker.enabled = false;
                        result.error = Walk(walker, result, new[] {
                            P(-18, -12, -124), P(-18, -12, -85)
                        });
                    }
                    if (string.IsNullOrEmpty(result.error))
                    {
                        result.saved = save.SaveNow();
                        if (!result.saved) result.error = "Lower south position did not save";
                    }
                }
                else if (stage == "read")
                {
                    result.lowerRestored = save.LastLoadSource == "primary" &&
                        Vector3.Distance(walker.transform.position, P(-18, -12, -85)) < .3f;
                    if (!result.lowerRestored) result.error = "Lower south position did not restore";
                    else
                    {
                        walker.ThirdPersonMode = false;
                        walker.enabled = true;
                        yield return new WaitForEndOfFrame();
                        walker.Face(P(0, -12, 0));
                        yield return new WaitForEndOfFrame();
                        SaveFrame(Path.Combine(output, "south-lower-arrival.png"));
                        walker.enabled = false;
                        result.error = Walk(walker, result, new[] {
                            P(-18, -12, -85), P(-85, -12, -85), P(-85, -12, 10),
                            P(-135, -12, 10), P(-135, 0, -80), P(-115, 0, -80),
                            P(-115, 0, -100), P(32, 0, -100), P(32, 0, -107)
                        });
                        if (string.IsNullOrEmpty(result.error))
                        {
                            result.exitedAtGreenhouse = Vector3.Distance(walker.transform.position,
                                P(32, 0, -107)) < .3f;
                            if (!result.exitedAtGreenhouse) result.error = "South lower loop did not close";
                        }
                    }
                }
                else result.error = "Unknown south descent stage";
            }
            result.loadSource = save ? save.LastLoadSource : "missing";
            result.player = walker ? walker.transform.position : Vector3.zero;
            File.WriteAllText(Path.Combine(output, stage + ".json"), JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) && result.floorSupported ? 0 : 1);
        }

        static Vector3 P(float x, float deck, float z) => new Vector3(x, deck + .06f, z);

        static string Walk(StationGrayboxWalker walker, Result result, Vector3[] points)
        {
            var controller = walker.GetComponent<CharacterController>();
            if (Vector3.Distance(walker.transform.position, points[0]) > .3f)
                return "Route did not start at " + points[0];
            for (var i = 1; i < points.Length; i++)
            {
                var from = points[i - 1];
                var to = points[i];
                var distance = Vector3.Distance(from, to);
                var steps = Mathf.CeilToInt(distance / .25f);
                for (var step = 1; step <= steps; step++)
                {
                    var next = Vector3.Lerp(from, to, (float)step / steps);
                    var delta = next - walker.transform.position;
                    delta.y -= .01f;
                    controller.Move(delta);
                    result.moves++;
                    if (Vector2.Distance(new Vector2(next.x, next.z),
                            new Vector2(walker.transform.position.x, walker.transform.position.z)) > .18f ||
                        Mathf.Abs(next.y - walker.transform.position.y) > .25f)
                        return "South route blocked near " + walker.transform.position +
                            " target " + next;
                    var supported = false;
                    foreach (var hit in Physics.RaycastAll(walker.transform.position + Vector3.up * .5f,
                                 Vector3.down, 1.4f))
                    {
                        var name = hit.collider.name.ToLowerInvariant();
                        if (name.Contains("floor") || name.Contains("corridor") ||
                            name.Contains("connector") || name.Contains("bridge"))
                            supported = true;
                    }
                    if (!supported)
                    {
                        result.floorSupported = false;
                        return "South route floor missing near " + walker.transform.position;
                    }
                }
                result.walkedMeters += distance;
            }
            return null;
        }

        static void SaveFrame(string path)
        {
            var frame = ScreenCapture.CaptureScreenshotAsTexture();
            File.WriteAllBytes(path, frame.EncodeToPNG());
            Destroy(frame);
        }
    }
}
