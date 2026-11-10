using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // One isolated Player session crosses both deck loops and the dock without repositioning.
    public sealed class StationContinuousWorldPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string error, competitionId, winner, status;
            public float walkedMeters;
            public int moves, hatchUses, rounds;
            public bool upperLoop, lowerLoop, cafe, research, greenhouse, vessel;
            public bool floorSupported = true, saved, matchAtDock, matchPreserved, returnedHome;
            public Vector3 end;
        }

        string output;
        Result result;
        StationGrayboxWalker walker;
        CharacterController body;
        StationDockAirlock airlock;
        StationDockedVesselHatch berth;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-continuous-probe-output");
            if (at < 0 || at + 1 >= args.Length || !Path.IsPathRooted(args[at + 1])) return;
            new GameObject("Continuous station Player probe")
                .AddComponent<StationContinuousWorldPlayerProbe>().output = args[at + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            result = new Result();
            walker = FindFirstObjectByType<StationGrayboxWalker>();
            body = walker ? walker.GetComponent<CharacterController>() : null;
            airlock = FindFirstObjectByType<StationDockAirlock>();
            berth = FindFirstObjectByType<StationDockedVesselHatch>();
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var research = FindFirstObjectByType<StationResearchDesk>();
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            var save = FindFirstObjectByType<StationWorldSave>();
            var match = FindFirstObjectByType<ArenaStationLiveMatch>();
            var link = match ? match.GetComponent<ArenaConnection>() : null;
            if (!walker || !body || !airlock || !berth || !cafe || !research ||
                !greenhouse || !save || !save.enabled || !match || !link ||
                link.BaseUrl != "http://127.0.0.1:8181" ||
                save.LastLoadSource != "fresh")
                result.error = "Continuous world fixture, backend or fresh save missing";

            if (result.error == null)
            {
                walker.enabled = false;
                yield return Walk("east cafe", new[] {
                    P(104,0,35), P(94,0,35), P(94,0,62), P(84,0,62),
                    P(84,0,65.5f), P(80,0,65.5f)
                });
                if (result.error == null)
                {
                    walker.enabled = true;
                    var served = cafe.Use() && cafe.ServedCount == 1;
                    walker.enabled = false;
                    yield return Walk("east cafe seat", new[] {
                        P(80,0,65.5f), P(84,0,65.5f), P(84.7f,0,62), P(84.7f,0,58.85f)
                    });
                    if (result.error == null)
                    {
                        walker.enabled = true;
                        var seated = cafe.Use() && cafe.SeatedSeatIndex == 3;
                        var drank = seated && cafe.Use() && cafe.DrunkCount == 1;
                        result.cafe = served && seated && drank && cafe.Use() && walker.enabled;
                        if (!result.cafe) result.error = "East cafe interaction failed";
                    }
                }
            }
            if (result.error == null)
            {
                walker.enabled = false;
                yield return Walk("east ramp", new[] {
                    P(84.7f,0,58.85f), P(84.7f,0,62), P(84,0,65.5f),
                    P(94,0,62), P(94,0,52), P(82,0,62), P(66,0,62),
                    P(48,0,50), P(48,0,-20), P(85,0,-20), P(85,14,70),
                    P(105,14,70)
                });
            }
            if (result.error == null)
            {
                yield return Walk("upper full loop", new[] {
                    P(105,14,70), P(105,14,105), P(5,14,105), P(5,14,108),
                    P(-5,14,108), P(-5,14,105), P(-105,14,105),
                    P(-105,14,5), P(-108,14,5), P(-108,14,-5),
                    P(-105,14,-5), P(-105,14,-105), P(-5,14,-105),
                    P(-5,14,-108), P(5,14,-108), P(5,14,-105),
                    P(105,14,-105), P(105,14,-5), P(108,14,-5),
                    P(108,14,5), P(105,14,5), P(105,14,70)
                });
                result.upperLoop = result.error == null;
            }
            if (result.error == null)
            {
                yield return Walk("upper west exit to research", new[] {
                    P(105,14,70), P(105,14,105), P(5,14,105), P(5,14,108),
                    P(-5,14,108), P(-5,14,105), P(-105,14,105),
                    P(-105,14,70), P(-85,14,70), P(-85,0,-20),
                    P(-60,0,-20), P(-60,0,60), P(-70,0,62), P(-83,0,65)
                });
                if (result.error == null)
                {
                    walker.enabled = true;
                    result.research = research.Use() && research.IsOpen &&
                        research.Report().Contains("当前没有可查阅的赛题") &&
                        research.Use() && !research.IsOpen && !walker.MovementLocked;
                    walker.enabled = false;
                    if (!result.research) result.error = "West research interaction failed";
                }
            }
            if (result.error == null)
            {
                yield return Walk("west descent", new[] {
                    P(-83,0,65), P(-70,0,62), P(-60,0,60),
                    P(-60,0,-20), P(-85,0,-20), P(-85,0,-100), P(-115,0,-100),
                    P(-115,0,-80), P(-135,0,-80), P(-135,-12,10), P(-85,-12,10)
                });
            }
            if (result.error == null)
            {
                yield return Walk("lower full loop", new[] {
                    P(-85,-12,10), P(-85,-12,85), P(85,-12,85),
                    P(85,-12,-85), P(-85,-12,-85), P(-85,-12,10)
                });
                result.lowerLoop = result.error == null;
                result.saved = result.lowerLoop && save.SaveNow();
                if (!result.saved) result.error = "Lower loop safe position did not save";
            }
            if (result.error == null)
            {
                yield return Walk("south keel ascent", new[] {
                    P(-85,-12,10), P(-85,-12,-85), P(-18,-12,-85),
                    P(-18,-12,-124), P(-3,-9,-124), P(12,-6,-124),
                    P(27,-3,-124), P(42,0,-124), P(42,0,-117),
                    P(42,0,-108), P(32,0,-107)
                });
                if (result.error == null)
                {
                    walker.enabled = true;
                    result.greenhouse = greenhouse.Use() && greenhouse.Stage == 1 &&
                        greenhouse.Use() && greenhouse.Stage == 2 &&
                        greenhouse.CareCount == 1;
                    walker.enabled = false;
                    if (!result.greenhouse) result.error = "South greenhouse care failed";
                }
            }
            if (result.error == null)
            {
                yield return Walk("south to west research", new[] {
                    P(32,0,-107), P(32,0,-100), P(85,0,-100),
                    P(85,0,-20), P(48,0,-20), P(48,0,50),
                    P(0,0,60), P(-60,0,60), P(-70,0,62), P(-83,0,65)
                });
                if (result.error == null)
                {
                    var entrants = new[] { "mock:xueba-o9", "mock:huatou-72b" };
                    link.Launch(new Launch {
                        arena = "tongjia-pinyin", models = entrants, draw = entrants,
                        limit = 2, demo = true
                    });
                    yield return null;
                    if (!link.Launching && string.IsNullOrEmpty(link.Competition))
                        result.error = "Local mock competition did not launch";
                }
            }
            if (result.error == null)
            {
                yield return Walk("west to dock and vessel", new[] {
                    P(-83,0,65), P(-70,0,62), P(-60,0,60),
                    P(0,0,60), P(48,0,50), P(48,0,105),
                    P(12,0,105), P(12,0,205), P(12,1.7f,216),
                    P(12,2.2f,223), P(12,2.2f,245), P(12,2.2f,223)
                });
                if (result.error == null)
                {
                    result.vessel = berth.IsOpen && berth.Use() && !berth.IsOpen;
                    if (!result.vessel) result.error = "Vessel hatch did not close inside";
                }
            }
            if (result.error == null)
            {
                yield return Walk("vessel cabin", new[] { P(12,2.2f,223), P(12,2.2f,245) });
                var deadline = Time.realtimeSinceStartup + 180;
                while (result.error == null &&
                       match.Status != "冠军演出完成 · 双方已离场" &&
                       Time.realtimeSinceStartup < deadline)
                {
                    if (!string.IsNullOrEmpty(link.LastError)) result.error = link.LastError;
                    yield return null;
                }
                result.matchAtDock = result.error == null &&
                    match.Status == "冠军演出完成 · 双方已离场" &&
                    match.ChampionshipAwards == 1 &&
                    match.ResolvedRounds > 0 && !string.IsNullOrEmpty(match.WinningModel) &&
                    !string.IsNullOrEmpty(match.CompetitionId);
                if (!result.matchAtDock) result.error = result.error ?? "Competition did not settle at dock";
                result.competitionId = match.CompetitionId;
                result.winner = match.WinningModel;
                result.rounds = match.ResolvedRounds;
                result.status = match.Status;
                result.saved &= save.SaveNow();
                if (!result.saved) result.error = "Vessel position did not save";
            }
            if (result.error == null)
            {
                yield return Walk("vessel to cabin", new[] {
                    P(12,2.2f,245), P(12,2.2f,223)
                });
                if (result.error == null && !berth.Use())
                    result.error = "Vessel hatch did not reopen inside";
            }
            if (result.error == null)
            {
                yield return Walk("dock return to cabin", new[] {
                    P(12,2.2f,223), P(12,1.7f,216), P(12,0,205),
                    P(12,0,125), P(12,0,105), P(48,0,105), P(48,0,50),
                    P(66,0,62), P(82,0,62), P(94,0,52), P(94,0,35), P(104,0,35)
                });
                result.returnedHome = result.error == null &&
                    Vector3.Distance(walker.transform.position, P(104,0,35)) < .3f;
                result.matchPreserved = match.CompetitionId == result.competitionId &&
                    match.WinningModel == result.winner && match.ResolvedRounds == result.rounds &&
                    match.ChampionshipAwards == 1;
                result.saved &= save.SaveNow();
                if (!result.returnedHome || !result.matchPreserved || !result.saved ||
                    result.hatchUses < 10 ||
                    airlock.InnerOpen || airlock.OuterOpen || berth.IsOpen)
                    result.error = "Return, match, save or closed hatches failed";
            }
            if (walker) walker.enabled = true;
            result.end = walker ? walker.transform.position : Vector3.zero;
            File.WriteAllText(Path.Combine(output, "continuous-world.json"),
                JsonUtility.ToJson(result, true));
            Application.Quit(result.error == null && result.floorSupported ? 0 : 1);
        }

        static Vector3 P(float x, float deck, float z) => new Vector3(x, deck + .06f, z);

        IEnumerator Walk(string label, Vector3[] points)
        {
            if (Vector3.Distance(walker.transform.position, points[0]) > .3f)
            {
                result.error = label + " route discontinuity at " + walker.transform.position;
                yield break;
            }
            for (var i = 1; i < points.Length; i++)
            {
                var from = points[i - 1];
                var to = points[i];
                var distance = Vector3.Distance(from, to);
                var steps = Mathf.CeilToInt(distance / .25f);
                for (var step = 1; step <= steps; step++)
                {
                    var next = Vector3.Lerp(from, to, (float)step / steps);
                    var beforeZ = walker.transform.position.z;
                    var delta = next - walker.transform.position;
                    delta.y -= .02f;
                    body.Move(delta);
                    result.moves++;
                    if (!Hatches(beforeZ, walker.transform.position.z) ||
                        Vector2.Distance(new Vector2(next.x, next.z),
                            new Vector2(walker.transform.position.x, walker.transform.position.z)) > .18f ||
                        Mathf.Abs(next.y - walker.transform.position.y) > .4f)
                    {
                        result.error = label + " blocked near " + walker.transform.position +
                            " target " + next;
                        yield break;
                    }
                    var supported = false;
                    foreach (var hit in Physics.RaycastAll(walker.transform.position +
                                 Vector3.up * .5f, Vector3.down, 1.4f))
                    {
                        var name = hit.collider.name.ToLowerInvariant();
                        if (hit.normal.y > .65f &&
                            Mathf.Abs(hit.point.y - walker.transform.position.y) < .35f &&
                            (name.Contains("floor") || name.Contains("deck") ||
                             name.Contains("ramp") || name.Contains("corridor") ||
                             name.Contains("connector") || name.Contains("promenade") ||
                             name.Contains("bridge"))) supported = true;
                    }
                    if (!supported)
                    {
                        result.floorSupported = false;
                        result.error = label + " floor missing near " + walker.transform.position;
                        yield break;
                    }
                    if (result.moves % 20 == 0) yield return null;
                }
                result.walkedMeters += distance;
            }
        }

        bool Hatches(float before, float after)
        {
            if (Mathf.Abs(walker.transform.position.x - 12) > 4 ||
                Mathf.Abs(walker.transform.position.y) > 3) return true;
            bool Cross(float z) => before < z && after >= z || before > z && after <= z;
            bool Use(bool crossing, Func<bool> action)
            {
                if (!crossing) return true;
                if (!action()) return false;
                result.hatchUses++;
                return true;
            }
            if (after > before)
                return Use(Cross(130), airlock.UseInner) &&
                    Use(Cross(138), airlock.UseInner) &&
                    Use(Cross(170), airlock.UseOuter) &&
                    Use(Cross(178), airlock.UseOuter) &&
                    Use(Cross(216), berth.Use);
            if (after < before)
                return Use(Cross(216), berth.Use) &&
                    Use(Cross(178), airlock.UseOuter) &&
                    Use(Cross(170), airlock.UseOuter) &&
                    Use(Cross(138), airlock.UseInner) &&
                    Use(Cross(130), airlock.UseInner);
            return true;
        }
    }
}
