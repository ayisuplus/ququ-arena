using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Player check for the first port-to-core stop and scene-save succession.
    public sealed class StationArrivalGuidePlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, scene, loadSource, error;
            public Vector3 start, end;
            public float walkedMeters, walkSpeed, sprintSpeed;
            public bool firstPerson, guideOpened, guideClosed, reportLinked,
                gateOpened, saved, leftCargoCompleted;
            public int rooms, residents, careCount, cafeServed;
        }

        string output, stage;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-arrival-probe-output");
            var stageAt = Array.IndexOf(args, "--station-arrival-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Station arrival Player probe")
                .AddComponent<StationArrivalGuidePlayerProbe>();
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
            var guide = FindFirstObjectByType<StationArrivalGuide>();
            var match = FindFirstObjectByType<ArenaStationLiveMatch>();
            var gate = FindFirstObjectByType<StationCoreEastGate>();
            var save = FindFirstObjectByType<StationWorldSave>();
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var cargo = FindObjectsByType<StationDockCargoService>(FindObjectsSortMode.None);
            try
            {
                if (result.scene != "BlackHoleStationArrivalGuideW4D" ||
                    !walker || !guide || !match || !gate || !save ||
                    !save.enabled || guide.Walker != walker || guide.Match != match)
                    throw new InvalidOperationException("W4D Player scene incomplete");
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
                var fromOld = stage == "migrate-w4c";
                if (stage != "fresh" && stage != "read" && !fromOld)
                    throw new InvalidOperationException("Unknown W4D probe stage");
                var expectedSource = stage == "fresh" ? "fresh" :
                    fromOld ? "migrated-W4C-primary" : "primary";
                var expectedPosition = stage == "read" ? P(60, 6) : P(210, 180);
                if (result.loadSource != expectedSource ||
                    Vector3.Distance(result.start, expectedPosition) > .25f ||
                    !result.firstPerson || result.rooms != 6 || result.residents != 6 ||
                    Mathf.Abs(result.walkSpeed - 3.5f) > .001f ||
                    Mathf.Abs(result.sprintSpeed - 6f) > .001f ||
                    result.careCount != (fromOld ? 1 : 0) ||
                    result.cafeServed != (fromOld ? 1 : 0) ||
                    result.leftCargoCompleted != fromOld)
                    throw new InvalidOperationException("W4D entry, progress or pace mismatch");
                result.reportLinked = guide.Report().Contains(match.Status) &&
                    guide.Report().Contains(match.ConnectionStatus);
                if (!result.reportLinked)
                    throw new InvalidOperationException("Guide lost real match status");
                if (stage == "fresh")
                {
                    var body = walker.GetComponent<CharacterController>();
                    var residents = FindObjectsByType<StationResidentRoutine>(
                        FindObjectsSortMode.None);
                    foreach (var resident in residents) resident.gameObject.SetActive(false);
                    walker.enabled = false;
                    Walk(walker, body, result, new[] {
                        P(210,180), P(190,180), P(190,110)
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
                        P(190,110), P(190,0), P(124,0)
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
                if (!result.saved) throw new InvalidOperationException("W4D save failed");
            }
            catch (Exception error) { result.error = error.Message; }
            result.end = walker ? walker.transform.position : Vector3.zero;
            File.WriteAllText(Path.Combine(output, stage + ".json"),
                JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }

        static Vector3 P(float x, float z) => new Vector3(x, .06f, z);

        static void Walk(StationGrayboxWalker walker, CharacterController body,
            Result result, Vector3[] points)
        {
            if (Vector3.Distance(walker.transform.position, points[0]) > .25f)
                throw new InvalidOperationException("W4D route discontinuity");
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
                        throw new InvalidOperationException("W4D route blocked near " +
                            walker.transform.position);
                    var supported = false;
                    foreach (var hit in Physics.RaycastAll(walker.transform.position +
                        Vector3.up * .55f, Vector3.down, 1.5f))
                        if (hit.normal.y > .65f && hit.collider.GetComponent<Renderer>())
                            supported = true;
                    if (!supported)
                        throw new InvalidOperationException("W4D floor missing near " +
                            walker.transform.position);
                }
                result.walkedMeters += length;
            }
        }
    }
}
