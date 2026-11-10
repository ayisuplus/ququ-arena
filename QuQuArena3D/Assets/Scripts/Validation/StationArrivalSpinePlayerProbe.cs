using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Player check for both east-arcade stops and scene-save succession.
    public sealed class StationArrivalSpinePlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, scene, loadSource, competitionId, status,
                statusAtBay,
                connection, winner, error;
            public Vector3 start, end;
            public float walkedMeters, walkSpeed, sprintSpeed;
            public bool firstPerson, guideOpened, guideClosed, reportLinked,
                matchOpened, matchClosed, matchLinked, gateOpened, saved,
                leftCargoCompleted, sawLiveAtBay, sawLiveInGreenhouse,
                greenhouseInterlockVerified, matchPreserved, cameraPreserved;
            public int rooms, residents, careCount, cafeServed, rounds,
                roundsAtBay, awardsAtBay, awards;
        }

        string output, stage;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-arrival-spine-probe-output");
            var stageAt = Array.IndexOf(args, "--station-arrival-spine-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Station arrival Player probe")
                .AddComponent<StationArrivalSpinePlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result {
                stage = stage, scene = SceneManager.GetActiveScene().name
            };
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var stops = FindObjectsByType<StationArrivalGuide>(
                FindObjectsSortMode.None);
            var guide = stops.SingleOrDefault(stop => !stop.ShowMatchDetail &&
                Vector3.Distance(stop.transform.position, P(195, 110)) < 5f);
            var matchStop = stops.SingleOrDefault(stop => stop.ShowMatchDetail);
            var match = FindFirstObjectByType<ArenaStationLiveMatch>();
            var gate = FindFirstObjectByType<StationCoreEastGate>();
            var save = FindFirstObjectByType<StationWorldSave>();
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var cargo = FindObjectsByType<StationDockCargoService>(FindObjectsSortMode.None);
            if (stage == "live")
            {
                yield return RunLive(result, walker, matchStop, match, gate, save);
                result.end = walker ? walker.transform.position : Vector3.zero;
                File.WriteAllText(Path.Combine(output, "live.json"),
                    JsonUtility.ToJson(result, true));
                Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
                yield break;
            }
            if (stage == "live-read")
            {
                try
                {
                    if (result.scene != "BlackHoleStationGreenhousePressureW4J" ||
                        !walker || !greenhouse || !save || !save.enabled ||
                        save.LastLoadSource != "primary" ||
                        Vector3.Distance(walker.transform.position, P(60, 6)) > .25f ||
                        greenhouse.CareCount != 1)
                        throw new InvalidOperationException("Greenhouse live save did not restore");
                    result.loadSource = save.LastLoadSource;
                    result.start = walker.transform.position;
                    result.careCount = greenhouse.CareCount;
                }
                catch (Exception error) { result.error = error.Message; }
                File.WriteAllText(Path.Combine(output, "live-read.json"),
                    JsonUtility.ToJson(result, true));
                Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
                yield break;
            }
            try
            {
                if ((result.scene != "BlackHoleStationArrivalSpineW4E" &&
                     result.scene != "BlackHoleStationObservationBayW4F" &&
                     result.scene != "BlackHoleStationTourConnectorsW4G") ||
                    !walker || !guide || !matchStop || !match || !gate || !save ||
                    !save.enabled || guide.Walker != walker || guide.Match != match ||
                    matchStop.Walker != walker || matchStop.Match != match)
                    throw new InvalidOperationException("Arrival Player scene incomplete");
                result.start = walker.transform.position;
                result.loadSource = save.LastLoadSource;
                result.walkSpeed = walker.WalkSpeed;
                result.sprintSpeed = walker.SprintSpeed;
                result.firstPerson = !walker.ThirdPersonMode;
                result.rooms = FindObjectsByType<StationRoomIdentity>(
                    FindObjectsSortMode.None).Length;
                result.residents = FindObjectsByType<StationResidentRoutine>(
                    FindObjectsSortMode.None).Length;
                result.careCount = greenhouse.CareCount;
                result.cafeServed = cafe.ServedCount;
                foreach (var service in cargo)
                    if (service.StableId == "north-dock-left")
                        result.leftCargoCompleted = service.Completed;
                var fromW4D = stage == "migrate-w4d";
                var fromW4E = stage == "migrate-w4e";
                var fromW4F = stage == "migrate-w4f";
                if (stage != "fresh" && stage != "read" && !fromW4D &&
                    !fromW4E && !fromW4F)
                    throw new InvalidOperationException("Unknown arrival probe stage");
                var expectedSource = stage == "fresh" ? "fresh" :
                    fromW4D ? "migrated-W4D-primary" :
                    fromW4E ? "migrated-W4E-primary" :
                    fromW4F ? "migrated-W4F-primary" : "primary";
                var expectedPosition = stage == "fresh" ? P(210, 180) : P(60, 6);
                if (result.loadSource != expectedSource ||
                    Vector3.Distance(result.start, expectedPosition) > .25f ||
                    !result.firstPerson || result.rooms != 6 || result.residents != 6 ||
                    Mathf.Abs(result.walkSpeed - 3.5f) > .001f ||
                    Mathf.Abs(result.sprintSpeed - 6f) > .001f ||
                    result.careCount != 0 || result.cafeServed != 0 ||
                    result.leftCargoCompleted)
                    throw new InvalidOperationException("Arrival entry, progress or pace mismatch");
                result.reportLinked = guide.Report().Contains(match.Status) &&
                    guide.Report().Contains(match.ConnectionStatus);
                result.matchLinked = matchStop.Report().Contains(match.Status) &&
                    matchStop.Report().Contains(match.ConnectionStatus);
                if (!result.reportLinked || !result.matchLinked)
                    throw new InvalidOperationException("A stop lost real match status");
                if (stage == "fresh")
                {
                    var body = walker.GetComponent<CharacterController>();
                    var residents = FindObjectsByType<StationResidentRoutine>(
                        FindObjectsSortMode.None);
                    foreach (var resident in residents) resident.gameObject.SetActive(false);
                    walker.enabled = false;
                    Walk(walker, body, result, new[] {
                        P(210,180), P(190,180), P(190,110), P(195,110)
                    });
                    walker.enabled = true;
                    result.guideOpened = guide.Use() && guide.IsOpen &&
                        walker.MovementLocked;
                    result.guideClosed = guide.Use() && !guide.IsOpen &&
                        !walker.MovementLocked;
                    if (!result.guideOpened || !result.guideClosed)
                        throw new InvalidOperationException("Guide interaction failed");
                    walker.enabled = false;
                    Walk(walker, body, result, new[] {
                        P(195,110), P(190,110), P(190,55), P(195,55)
                    });
                    walker.enabled = true;
                    result.matchOpened = matchStop.Use() && matchStop.IsOpen &&
                        walker.MovementLocked;
                    result.matchClosed = matchStop.Use() && !matchStop.IsOpen &&
                        !walker.MovementLocked;
                    if (!result.matchOpened || !result.matchClosed)
                        throw new InvalidOperationException("Match stop interaction failed");
                    walker.enabled = false;
                    Walk(walker, body, result, new[] {
                        P(195,55), P(195,48), P(200,48), P(201,53),
                        P(200,48), P(195,48), P(190,55), P(190,0), P(124,0)
                    });
                    result.gateOpened = gate.Use() && gate.IsOpen;
                    if (!result.gateOpened)
                        throw new InvalidOperationException("Core gate failed");
                    Walk(walker, body, result, new[] {
                        P(124,0), P(116,0), P(112,0), P(112,6),
                        P(95,6), P(75,6), P(60,6)
                    });
                    walker.enabled = true;
                    foreach (var resident in residents) resident.gameObject.SetActive(true);
                }
                result.saved = save.SaveNow();
                if (!result.saved) throw new InvalidOperationException("Arrival save failed");
            }
            catch (Exception error) { result.error = error.Message; }
            result.end = walker ? walker.transform.position : Vector3.zero;
            File.WriteAllText(Path.Combine(output, stage + ".json"),
                JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }

        IEnumerator RunLive(Result result, StationGrayboxWalker walker,
            StationArrivalGuide matchStop, ArenaStationLiveMatch match,
            StationCoreEastGate gate, StationWorldSave save)
        {
            var residents = FindObjectsByType<StationResidentRoutine>(
                FindObjectsSortMode.None);
            var camera = FindFirstObjectByType<StationSpectatorCamera>();
            var body = walker ? walker.GetComponent<CharacterController>() : null;
            var w4j = result.scene == "BlackHoleStationGreenhousePressureW4J";
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            var vestibules = FindObjectsByType<StationPressureVestibule>(
                FindObjectsSortMode.None);
            var north = vestibules.FirstOrDefault(x =>
                x.StableId == "south-greenhouse-north");
            var south = vestibules.FirstOrDefault(x =>
                x.StableId == "south-greenhouse-south");
            void WalkSegment(Vector3[] points)
            {
                var wasEnabled = walker.enabled;
                foreach (var resident in residents) resident.gameObject.SetActive(false);
                walker.enabled = false;
                try { Walk(walker, body, result, points); }
                finally
                {
                    walker.enabled = wasEnabled;
                    foreach (var resident in residents)
                        if (resident) resident.gameObject.SetActive(true);
                }
            }
            try
            {
                if ((result.scene != "BlackHoleStationArrivalSpineW4E" &&
                     result.scene != "BlackHoleStationObservationBayW4F" &&
                     result.scene != "BlackHoleStationTourConnectorsW4G" && !w4j) ||
                    !walker || !body || !matchStop || !match || !gate ||
                    !save || !save.enabled || !camera || residents.Length != 6 ||
                    (w4j && (!greenhouse || !north || !south)) ||
                    matchStop.Match != match || save.LastLoadSource != "fresh" ||
                    Vector3.Distance(walker.transform.position, P(210, 180)) > .25f ||
                    walker.ThirdPersonMode)
                    throw new InvalidOperationException("Arrival live Player scene incomplete");
                result.start = walker.transform.position;
                result.loadSource = save.LastLoadSource;
                result.firstPerson = true;
                result.matchLinked = true;
                result.residents = residents.Length;
                result.rooms = FindObjectsByType<StationRoomIdentity>(
                    FindObjectsSortMode.None).Length;
                result.walkSpeed = walker.WalkSpeed;
                result.sprintSpeed = walker.SprintSpeed;
                WalkSegment(new[] { P(210, 180), P(190, 180),
                    P(190, 110), P(190, 55), P(195, 55) });
                var models = new[] { "mock:xueba-o9", "mock:huatou-72b" };
                match.GetComponent<ArenaConnection>().Launch(new Launch {
                    arena = "tongjia-pinyin", models = models, draw = models,
                    limit = 2, demo = true, requestId = Guid.NewGuid().ToString()
                });
            }
            catch (Exception error) { result.error = error.Message; }
            if (!string.IsNullOrEmpty(result.error)) yield break;

            var link = match.GetComponent<ArenaConnection>();
            var deadline = Time.realtimeSinceStartup + 180;
            if (w4j)
            {
                while ((string.IsNullOrEmpty(match.CompetitionId) ||
                        !match.ConnectionStatus.StartsWith("已同步本机赛事")) &&
                       Time.realtimeSinceStartup < deadline &&
                       string.IsNullOrEmpty(result.error))
                {
                    if (!string.IsNullOrEmpty(link.LastError)) result.error = link.LastError;
                    yield return null;
                }
                try
                {
                    if (!string.IsNullOrEmpty(result.error) ||
                        string.IsNullOrEmpty(match.CompetitionId) ||
                        !match.ConnectionStatus.StartsWith("已同步本机赛事"))
                        throw new InvalidOperationException("Live match did not sync at bay");
                    result.sawLiveAtBay = true;
                    result.roundsAtBay = match.ResolvedRounds;
                    result.awardsAtBay = match.ChampionshipAwards;
                    result.statusAtBay = match.Status;
                    result.matchOpened = matchStop.Use() && matchStop.IsOpen &&
                        walker.MovementLocked;
                    result.matchClosed = matchStop.Use() && !matchStop.IsOpen &&
                        !walker.MovementLocked;
                    if (!result.matchOpened || !result.matchClosed)
                        throw new InvalidOperationException("Live match stop unavailable");
                    WalkSegment(new[] { P(195, 55), P(190, 55), P(190, 180),
                        P(190, 190), P(190, 208), P(210, 208), Ring(54) });
                    WalkSegment(Enumerable.Range(30, 25).Reverse()
                        .Select(Ring).ToArray());
                    WalkSegment(new[] { Ring(30), P(-215, -205), P(-215, -170),
                        P(-190, -170), P(-190, -176) });
                    if (!north.UseStreet())
                        throw new InvalidOperationException("Greenhouse north door unavailable");
                    WalkSegment(new[] { P(-190, -176), P(-190, -181) });
                    if (north.UseRoom() || !north.UseStreet() || !north.UseRoom())
                        throw new InvalidOperationException("Greenhouse north interlock failed");
                    WalkSegment(new[] { P(-190, -181), P(-190, -185) });
                    if (!north.UseRoom())
                        throw new InvalidOperationException("Greenhouse north door stayed open");
                    WalkSegment(new[] { P(-190, -185), P(-190, -186) });
                    var before = greenhouse.CareCount;
                    for (var attempt = 0; attempt < 3 && greenhouse.CareCount == before;
                         attempt++)
                        if (!greenhouse.Use())
                            throw new InvalidOperationException("Greenhouse care unavailable");
                    result.careCount = greenhouse.CareCount;
                    if (result.careCount != before + 1)
                        throw new InvalidOperationException("Greenhouse care did not complete");
                }
                catch (Exception error) { result.error = error.Message; }
                if (!string.IsNullOrEmpty(result.error)) yield break;
            }
            while (match.Status != "冠军演出完成 · 双方已离场" &&
                   Time.realtimeSinceStartup < deadline &&
                   string.IsNullOrEmpty(result.error))
            {
                if (!string.IsNullOrEmpty(link.LastError)) result.error = link.LastError;
                if (w4j && (match.ResolvedRounds > result.roundsAtBay ||
                            match.ChampionshipAwards > result.awardsAtBay))
                    result.sawLiveInGreenhouse = true;
                else if (!w4j && match.ResolvedRounds > 0)
                    result.sawLiveAtBay = true;
                yield return null;
            }
            if (w4j && (match.ResolvedRounds > result.roundsAtBay ||
                        match.ChampionshipAwards > result.awardsAtBay))
                result.sawLiveInGreenhouse = true;
            try
            {
                if (!string.IsNullOrEmpty(result.error))
                    throw new InvalidOperationException(result.error);
                if (!result.sawLiveAtBay ||
                    (w4j && !result.sawLiveInGreenhouse) ||
                    match.Status != "冠军演出完成 · 双方已离场" ||
                    match.ChampionshipAwards != 1 || match.ResolvedRounds < 1 ||
                    string.IsNullOrEmpty(match.WinningModel))
                    throw new InvalidOperationException("Live match did not finish during route");
                result.competitionId = match.CompetitionId;
                result.status = match.Status;
                result.connection = match.ConnectionStatus;
                result.winner = match.WinningModel;
                result.rounds = match.ResolvedRounds;
                result.awards = match.ChampionshipAwards;
                result.reportLinked = matchStop.Report().Contains(match.Status) &&
                    matchStop.Report().Contains(match.ConnectionStatus);
                if (w4j)
                {
                    WalkSegment(new[] { P(-190, -186), P(-200, -186),
                        P(-200, -195), P(-190, -195) });
                    if (!south.UseRoom())
                        throw new InvalidOperationException("Greenhouse south door unavailable");
                    WalkSegment(new[] { P(-190, -195), P(-190, -199.25f) });
                    if (south.UseStreet() || !south.UseRoom() ||
                        !south.UseStreet())
                        throw new InvalidOperationException("Greenhouse south interlock failed");
                    WalkSegment(new[] { P(-190, -199.25f), P(-190, -204) });
                    if (!south.UseStreet())
                        throw new InvalidOperationException("Greenhouse south door stayed open");
                    result.greenhouseInterlockVerified =
                        !north.RoomOpen && !north.StreetOpen &&
                        !south.RoomOpen && !south.StreetOpen;
                    if (!result.greenhouseInterlockVerified)
                        throw new InvalidOperationException("Greenhouse door left open");
                    WalkSegment(new[] { P(-190, -204), P(-215, -205), Ring(30) });
                    WalkSegment(Enumerable.Range(30, 25).Select(Ring).ToArray());
                    WalkSegment(new[] { Ring(54), P(210, 208), P(190, 208),
                        P(190, 190), P(190, 180), P(190, 0), P(124, 0) });
                }
                else
                {
                    result.matchOpened = matchStop.Use() && matchStop.IsOpen &&
                        walker.MovementLocked;
                    result.matchClosed = matchStop.Use() && !matchStop.IsOpen &&
                        !walker.MovementLocked;
                    WalkSegment(new[] { P(195, 55), P(195, 48), P(200, 48),
                        P(201, 53), P(200, 48), P(195, 48), P(190, 55),
                        P(190, 0), P(124, 0) });
                }
                result.gateOpened = gate.Use() && gate.IsOpen;
                if (!result.gateOpened)
                    throw new InvalidOperationException("East core gate failed");
                WalkSegment(new[] { P(124, 0), P(116, 0), P(112, 0),
                    P(112, 6), P(95, 6), P(75, 6), P(60, 6) });
                result.matchPreserved = match.CompetitionId == result.competitionId &&
                    match.WinningModel == result.winner &&
                    match.ResolvedRounds == result.rounds &&
                    match.Status == result.status;
                result.cameraPreserved = walker.View.enabled && !camera.CloseUp &&
                    !camera.Flying && walker.enabled;
                result.saved = save.SaveNow();
                if (!result.reportLinked || !result.matchOpened ||
                    !result.matchClosed || !result.matchPreserved ||
                    !result.cameraPreserved || !result.saved)
                    throw new InvalidOperationException("Live return or save mismatch");
            }
            catch (Exception error) { result.error = error.Message; }
        }

        static Vector3 P(float x, float z) => new Vector3(x, .06f, z);
        static Vector3 Ring(int index) => P(330 * Mathf.Cos(index * Mathf.PI / 24),
            330 * Mathf.Sin(index * Mathf.PI / 24));

        static void Walk(StationGrayboxWalker walker, CharacterController body,
            Result result, Vector3[] points)
        {
            if (Vector3.Distance(walker.transform.position, points[0]) > .25f)
                throw new InvalidOperationException("Arrival route discontinuity");
            for (var leg = 1; leg < points.Length; leg++)
            {
                var from = points[leg-1];
                var to = points[leg];
                var length = Vector3.Distance(from, to);
                var steps = Mathf.CeilToInt(length / .2f);
                for (var step = 1; step <= steps; step++)
                {
                    var target = Vector3.Lerp(from, to, (float)step / steps);
                    body.Move(target - walker.transform.position + Vector3.down * .01f);
                    if (Vector2.Distance(new Vector2(target.x, target.z),
                        new Vector2(walker.transform.position.x,
                            walker.transform.position.z)) > .18f)
                        throw new InvalidOperationException("Arrival route blocked near " +
                            walker.transform.position);
                    var supported = false;
                    foreach (var hit in Physics.RaycastAll(walker.transform.position +
                        Vector3.up * .55f, Vector3.down, 1.5f))
                        if (hit.normal.y > .65f && hit.collider.GetComponent<Renderer>())
                            supported = true;
                    if (!supported)
                        throw new InvalidOperationException("Arrival floor missing near " +
                            walker.transform.position);
                }
                result.walkedMeters += length;
            }
        }
    }
}
