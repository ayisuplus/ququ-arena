using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Separate Player processes verify the east lounge route and candidate save.
    public sealed class StationCafePlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, error, loadSource;
            public float walkedMeters;
            public int moves, served, drunk;
            public bool remoteRejected, floorSupported, seated, drank, stood;
            public bool progressRestored, positionRestored, saveWritten;
            public Vector3 player;
        }

        string output, stage;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-cafe-probe-output");
            var stageAt = Array.IndexOf(args, "--station-cafe-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Station cafe Player probe").AddComponent<StationCafePlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result { stage = stage, floorSupported = true };
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var save = FindFirstObjectByType<StationWorldSave>();
            if (!cafe || !walker || !save || !save.enabled)
                result.error = "Cafe, walker or world save is missing";
            else if (stage == "write")
            {
                result.remoteRejected = !cafe.Use();
                try { WalkFromCabin(walker, result); }
                catch (Exception error) { result.error = error.Message; }
                if (string.IsNullOrEmpty(result.error))
                {
                    result.seated = cafe.SeatedSeatIndex == 3 && !walker.enabled &&
                        !walker.VisibleAvatar.activeSelf;
                    result.drank = result.seated && cafe.Use() && cafe.DrunkCount == 1;
                    result.stood = result.drank && cafe.Use() && walker.enabled &&
                        cafe.SeatedSeatIndex == -1;
                    result.saveWritten = save.SaveNow();
                    if (!result.remoteRejected || !result.floorSupported || !result.seated ||
                        !result.drank || !result.stood || !result.saveWritten)
                        result.error = "East lounge route or interaction failed";
                }
            }
            else if (stage == "read")
            {
                result.progressRestored = cafe.ServedCount == 1 && cafe.DrunkCount == 1 &&
                    !cafe.HoldingDrink;
                result.positionRestored = Vector3.Distance(walker.transform.position,
                    new Vector3(84.7f, .06f, 58.85f)) < .3f;
                result.seated = cafe.Use() && cafe.SeatedSeatIndex == 3;
                result.stood = result.seated && cafe.Use() && walker.enabled;
                if (save.LastLoadSource != "primary" || !result.progressRestored ||
                    !result.positionRestored || !result.seated || !result.stood)
                    result.error = "Cafe progress or player position did not restore";
            }
            else if (stage == "legacy")
            {
                result.progressRestored = cafe.ServedCount == 0 && cafe.DrunkCount == 0 &&
                    !cafe.HoldingDrink;
                result.positionRestored = Vector3.Distance(walker.transform.position,
                    new Vector3(85, -11.94f, -30)) < .3f;
                result.saveWritten = save.SaveNow();
                if (save.LastLoadSource != "primary" || !result.progressRestored ||
                    !result.positionRestored || !result.saveWritten ||
                    !File.ReadAllText(save.FilePath).Contains("\"cafe\""))
                    result.error = "Previous v1 candidate save did not migrate";
            }
            else result.error = "Unknown cafe probe stage";
            result.loadSource = save ? save.LastLoadSource : "missing";
            result.served = cafe ? cafe.ServedCount : -1;
            result.drunk = cafe ? cafe.DrunkCount : -1;
            result.player = walker ? walker.transform.position : Vector3.zero;
            File.WriteAllText(Path.Combine(output, stage + ".json"), JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }

        static void WalkFromCabin(StationGrayboxWalker walker, Result result)
        {
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var controller = walker.GetComponent<CharacterController>();
            Vector3 P(float x, float z) => new Vector3(x, .06f, z);
            void Walk(Vector3[] points)
            {
                walker.enabled = false;
                for (var i = 1; i < points.Length; i++)
                {
                    var from = points[i - 1];
                    var to = points[i];
                    var distance = Vector3.Distance(from, to);
                    var steps = Mathf.CeilToInt(distance / .2f);
                    for (var step = 1; step <= steps; step++)
                    {
                        var next = Vector3.Lerp(from, to, (float)step / steps);
                        var delta = next - walker.transform.position;
                        delta.y -= .03f;
                        controller.Move(delta);
                        result.moves++;
                        if (Vector2.Distance(new Vector2(next.x, next.z),
                                new Vector2(walker.transform.position.x, walker.transform.position.z)) > .18f)
                            throw new InvalidOperationException("Cafe route blocked near " +
                                walker.transform.position);
                        var supported = false;
                        foreach (var hit in Physics.RaycastAll(walker.transform.position +
                                     Vector3.up * .5f, Vector3.down, 1.4f))
                            if (hit.normal.y > .65f &&
                                Mathf.Abs(hit.point.y - walker.transform.position.y) < .35f &&
                                hit.collider.name.ToLowerInvariant().Contains("floor")) supported = true;
                        if (!supported) throw new InvalidOperationException("Cafe route floor missing near " +
                            walker.transform.position);
                    }
                    result.walkedMeters += distance;
                }
                walker.enabled = true;
            }
            if (Vector3.Distance(walker.transform.position, P(104, 35)) > .25f)
                throw new InvalidOperationException("Player did not start in cabin");
            Walk(new[] { P(104, 35), P(94, 35), P(94, 62), P(84, 62),
                P(84, 65.5f), P(80, 65.5f) });
            if (!cafe.Use() || cafe.ServedCount != 1 || !cafe.HoldingDrink)
                throw new InvalidOperationException("Cafe counter did not serve");
            Walk(new[] { P(80, 65.5f), P(84, 65.5f), P(84.7f, 62),
                P(84.7f, 58.85f) });
            if (!cafe.Use()) throw new InvalidOperationException("Cafe seat unavailable");
        }
    }
}
