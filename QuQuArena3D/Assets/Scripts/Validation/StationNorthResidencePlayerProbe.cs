using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Three isolated starts: home to vessel, vessel to arena, then restore arena.
    public sealed class StationNorthResidencePlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, error, loadSource, scene;
            public float walkedMeters;
            public int moves, hatchUses;
            public Vector3 start, end;
            public bool floorSupported = true, saved, hatchesClosed;
        }

        [Serializable]
        sealed class SavedPosition { public Vector3 safePosition; }

        string output, stage;
        StationGrayboxWalker walker;
        CharacterController controller;
        StationDockAirlock airlock;
        StationDockedVesselHatch berth;
        Result result;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-north-route-output");
            var stageAt = Array.IndexOf(args, "--station-north-route-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("North residence route Player probe")
                .AddComponent<StationNorthResidencePlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            result = new Result { stage = stage, scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene().name };
            walker = FindFirstObjectByType<StationGrayboxWalker>();
            controller = walker ? walker.GetComponent<CharacterController>() : null;
            airlock = FindFirstObjectByType<StationDockAirlock>();
            berth = FindFirstObjectByType<StationDockedVesselHatch>();
            var save = FindFirstObjectByType<StationWorldSave>();
            try
            {
                if (!walker || !controller || !airlock || !berth || !save || !save.enabled ||
                    airlock.InnerOpen || airlock.OuterOpen || berth.IsOpen)
                    throw new InvalidOperationException("North route components or closed hatches missing");
                result.loadSource = save.LastLoadSource;
                result.start = walker.transform.position;
                walker.enabled = false;
                if (stage == "write")
                {
                    if (save.LastLoadSource != "fresh")
                        throw new InvalidOperationException("Write stage did not start from a fresh world");
                    Walk(new[] {
                        P(104,0,35), P(94,0,35), P(94,0,105), P(125,0,105),
                        P(125,0,125), P(12,0,125), P(12,0,205), P(12,1.7f,216),
                        P(12,2.2f,223), P(12,2.2f,245), P(12,2.2f,223)
                    });
                    if (!berth.Use()) throw new InvalidOperationException("Vessel did not seal from inside");
                    result.hatchUses++;
                    Walk(new[] { P(12,2.2f,223), P(12,2.2f,245) });
                    result.saved = save.SaveNow();
                    var saved = result.saved
                        ? JsonUtility.FromJson<SavedPosition>(File.ReadAllText(save.FilePath)) : null;
                    if (saved == null || Vector3.Distance(saved.safePosition, P(12,2.2f,245)) > .25f)
                        throw new InvalidOperationException("Vessel position was not saved safely");
                }
                else if (stage == "read")
                {
                    if (save.LastLoadSource != "primary" ||
                        Vector3.Distance(walker.transform.position, P(12,2.2f,245)) > .25f)
                        throw new InvalidOperationException("Vessel position did not restore in a new process");
                    Walk(new[] { P(12,2.2f,245), P(12,2.2f,223) });
                    if (!berth.Use()) throw new InvalidOperationException("Vessel did not reopen from inside");
                    result.hatchUses++;
                    Walk(new[] {
                        P(12,2.2f,223), P(12,1.7f,216), P(12,0,205), P(12,0,125),
                        P(12,0,105), P(48,0,105), P(48,0,50), P(35,0,20)
                    });
                    result.saved = save.SaveNow();
                    var saved = result.saved
                        ? JsonUtility.FromJson<SavedPosition>(File.ReadAllText(save.FilePath)) : null;
                    if (saved == null || Vector3.Distance(saved.safePosition, P(35,0,20)) > .25f)
                        throw new InvalidOperationException("Arena landing was not saved safely");
                }
                else if (stage == "confirm")
                {
                    if (save.LastLoadSource != "primary" ||
                        Vector3.Distance(walker.transform.position, P(35,0,20)) > .25f)
                        throw new InvalidOperationException("Arena landing did not restore in a new process");
                    result.saved = save.SaveNow();
                }
                else throw new InvalidOperationException("Unknown north route stage");
                result.hatchesClosed = !airlock.InnerOpen && !airlock.OuterOpen && !berth.IsOpen;
                if (!result.hatchesClosed || !result.saved)
                    throw new InvalidOperationException("Route ended with an open hatch or unsaved state");
            }
            catch (Exception error) { result.error = error.Message; }
            result.end = walker ? walker.transform.position : Vector3.zero;
            File.WriteAllText(Path.Combine(output, stage + ".json"), JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) && result.floorSupported ? 0 : 1);
        }

        static Vector3 P(float x, float y, float z) => new Vector3(x, y + .06f, z);

        void Hatches(float before, float after)
        {
            bool Cross(float z) => before < z && after >= z || before > z && after <= z;
            if (Mathf.Abs(walker.transform.position.x - 12) > 4) return;
            if (after > before)
            {
                if (Cross(130) && !airlock.UseInner() || Cross(138) && !airlock.UseInner() ||
                    Cross(170) && !airlock.UseOuter() || Cross(178) && !airlock.UseOuter() ||
                    Cross(216) && !berth.Use())
                    throw new InvalidOperationException("Outgoing hatch sequence failed near " + walker.transform.position);
                if (Cross(130) || Cross(138) || Cross(170) || Cross(178) || Cross(216)) result.hatchUses++;
            }
            else if (after < before)
            {
                if (Cross(216) && !berth.Use() || Cross(178) && !airlock.UseOuter() ||
                    Cross(170) && !airlock.UseOuter() || Cross(138) && !airlock.UseInner() ||
                    Cross(130) && !airlock.UseInner())
                    throw new InvalidOperationException("Returning hatch sequence failed near " + walker.transform.position);
                if (Cross(216) || Cross(178) || Cross(170) || Cross(138) || Cross(130)) result.hatchUses++;
            }
        }

        void Walk(Vector3[] points)
        {
            if (Vector3.Distance(walker.transform.position, points[0]) > .25f)
                throw new InvalidOperationException("Route discontinuity near " + walker.transform.position);
            for (var i = 1; i < points.Length; i++)
            {
                var from = points[i - 1];
                var to = points[i];
                var distance = Vector3.Distance(from, to);
                var steps = Mathf.CeilToInt(distance / .2f);
                for (var step = 1; step <= steps; step++)
                {
                    var next = Vector3.Lerp(from, to, (float)step / steps);
                    var before = walker.transform.position.z;
                    var delta = next - walker.transform.position;
                    delta.y -= .03f;
                    controller.Move(delta);
                    Hatches(before, walker.transform.position.z);
                    result.moves++;
                    var gap = Vector2.Distance(new Vector2(next.x, next.z),
                        new Vector2(walker.transform.position.x, walker.transform.position.z));
                    if (gap > .18f || Mathf.Abs(next.y - walker.transform.position.y) > .4f)
                        throw new InvalidOperationException("Route blocked near " + walker.transform.position);
                    var supported = false;
                    foreach (var hit in Physics.RaycastAll(walker.transform.position + Vector3.up * .5f,
                                 Vector3.down, 1.4f))
                    {
                        var name = hit.collider.name.ToLowerInvariant();
                        if (hit.normal.y > .65f && Mathf.Abs(hit.point.y - walker.transform.position.y) < .35f &&
                            (name.Contains("floor") || name.Contains("deck") || name.Contains("ramp") ||
                             name.Contains("connector") || name.Contains("corridor") || name.Contains("promenade")))
                            supported = true;
                    }
                    if (!supported)
                    {
                        result.floorSupported = false;
                        throw new InvalidOperationException("Route floor missing near " + walker.transform.position);
                    }
                }
                result.walkedMeters += distance;
            }
        }
    }
}
