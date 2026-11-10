using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Independent Player walk from the cabin to the west research desk.
    public sealed class StationResearchPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string error;
            public float walkedMeters;
            public int moves;
            public bool remoteRejected, floorSupported, opened, closed;
            public bool noCompetitionMessage, saveEnabled;
        }

        string output;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-research-probe-output");
            if (at < 0 || at + 1 >= args.Length || !Path.IsPathRooted(args[at + 1])) return;
            new GameObject("Station research Player probe")
                .AddComponent<StationResearchPlayerProbe>().output = args[at + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result { floorSupported = true };
            var desk = FindFirstObjectByType<StationResearchDesk>();
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var save = FindFirstObjectByType<StationWorldSave>();
            result.saveEnabled = save && save.enabled;
            if (!desk || !walker || !result.saveEnabled || desk.Walker != walker)
                result.error = "Research desk, walker or save is missing";
            else
            {
                result.remoteRejected = !desk.Use();
                var body = walker.GetComponent<CharacterController>();
                var points = new[] {
                    new Vector2(104, 35), new Vector2(94, 35),
                    new Vector2(94, 48), new Vector2(94, 52),
                    new Vector2(82, 62), new Vector2(66, 62),
                    new Vector2(48, 50), new Vector2(0, 60),
                    new Vector2(-60, 60), new Vector2(-60, 62),
                    new Vector2(-70, 62), new Vector2(-83, 62),
                    new Vector2(-83, 65)
                };
                walker.enabled = false;
                for (var i = 1; i < points.Length && string.IsNullOrEmpty(result.error); i++)
                {
                    var from = points[i - 1];
                    var to = points[i];
                    var length = Vector2.Distance(from, to);
                    var steps = Mathf.CeilToInt(length / .25f);
                    for (var step = 1; step <= steps; step++)
                    {
                        var next = Vector2.Lerp(from, to, (float)step / steps);
                        body.Move(new Vector3(next.x - walker.transform.position.x,
                            -.01f, next.y - walker.transform.position.z));
                        result.moves++;
                        if (Vector2.Distance(next, new Vector2(walker.transform.position.x,
                                walker.transform.position.z)) > .18f)
                        {
                            result.error = "West research route is blocked";
                            break;
                        }
                        var supported = false;
                        foreach (var hit in Physics.RaycastAll(walker.transform.position +
                                     Vector3.up * .5f, Vector3.down, 1.4f))
                            if (hit.normal.y > .65f &&
                                hit.collider.name.ToLowerInvariant().Contains("floor")) supported = true;
                        if (!supported)
                        {
                            result.floorSupported = false;
                            result.error = "West research route has no floor";
                            break;
                        }
                    }
                    result.walkedMeters += length;
                }
                walker.enabled = true;
                if (string.IsNullOrEmpty(result.error))
                {
                    var previousLock = walker.MovementLocked;
                    result.opened = desk.Use() && desk.IsOpen && walker.MovementLocked;
                    result.noCompetitionMessage = desk.Report().Contains("当前没有可查阅的赛题");
                    result.closed = desk.Use() && !desk.IsOpen &&
                        walker.MovementLocked == previousLock;
                    if (!result.remoteRejected || !result.opened || !result.closed ||
                        !result.noCompetitionMessage) result.error = "Research desk interaction failed";
                }
            }
            File.WriteAllText(Path.Combine(output, "research-player.json"),
                JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }
    }
}
