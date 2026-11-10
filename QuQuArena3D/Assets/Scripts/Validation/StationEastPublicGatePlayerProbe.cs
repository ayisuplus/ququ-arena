using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Checks the W4C public doorway and adjacent-scene save continuity in Player.
    public sealed class StationEastPublicGatePlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, scene, loadSource, error;
            public Vector3 start, end;
            public int roomCount, residentCount, careCount, cafeServed;
            public float walkedMeters;
            public bool firstPerson, gateClosedAtStart, gateOpened,
                gateReclosed, thresholdSaveIgnored, cargoCompleted, saved;
        }

        [Serializable]
        sealed class SavedPosition { public Vector3 safePosition; }

        string output, stage;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-east-gate-probe-output");
            var stageAt = Array.IndexOf(args, "--station-east-gate-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("East core gate Player probe")
                .AddComponent<StationEastPublicGatePlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result { stage = stage, scene = SceneManager.GetActiveScene().name };
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var gate = FindFirstObjectByType<StationCoreEastGate>();
            var unsafeZone = FindFirstObjectByType<StationUnsafeSaveZone>();
            var save = FindFirstObjectByType<StationWorldSave>();
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var cargo = FindObjectsByType<StationDockCargoService>(FindObjectsSortMode.None);
            var rooms = FindObjectsByType<StationRoomIdentity>(FindObjectsSortMode.None);
            var residents = FindObjectsByType<StationResidentRoutine>(FindObjectsSortMode.None);
            try
            {
                if (result.scene != "BlackHoleStationEastPublicGateW4C" || !walker ||
                    !gate || !unsafeZone || !save || !save.enabled ||
                    gate.Walker != walker ||
                    save.Walker != walker || !greenhouse || !cafe || cargo.Length != 2)
                    throw new InvalidOperationException("W4C Player scene incomplete");
                StationDockCargoService left = null;
                foreach (var service in cargo)
                    if (service.StableId == "north-dock-left") left = service;
                if (!left) throw new InvalidOperationException("Left cargo missing");
                result.loadSource = save.LastLoadSource;
                result.start = walker.transform.position;
                result.firstPerson = !walker.ThirdPersonMode;
                result.gateClosedAtStart = !gate.IsOpen && gate.Door.activeSelf;
                result.roomCount = rooms.Length;
                result.residentCount = residents.Length;
                result.careCount = greenhouse.CareCount;
                result.cafeServed = cafe.ServedCount;
                result.cargoCompleted = left.Completed;
                var expectedSource = "fresh";
                var expectedPosition = P(210, 180);
                var expectedProgress = false;
                if (stage == "read")
                {
                    expectedSource = "primary";
                    expectedPosition = P(60, 6);
                }
                else if (stage == "migrate-w4a")
                {
                    expectedSource = "migrated-W4A-primary";
                    expectedProgress = true;
                }
                else if (stage == "migrate-w3")
                {
                    expectedSource = "migrated-W3-primary";
                    expectedProgress = true;
                }
                else if (stage == "invalid-w4a") expectedSource = "fresh";
                else if (stage != "fresh")
                    throw new InvalidOperationException("Unknown W4C probe stage");
                if (result.loadSource != expectedSource ||
                    Vector3.Distance(result.start, expectedPosition) > .25f ||
                    !result.firstPerson || !result.gateClosedAtStart ||
                    rooms.Length != 6 || residents.Length != 6 ||
                    result.careCount != (expectedProgress ? 1 : 0) ||
                    result.cafeServed != (expectedProgress ? 1 : 0) ||
                    result.cargoCompleted != expectedProgress)
                    throw new InvalidOperationException("W4C origin, housing or state mismatch");
                if (stage == "fresh")
                {
                    var body = walker.GetComponent<CharacterController>();
                    foreach (var resident in residents) resident.gameObject.SetActive(false);
                    walker.enabled = false;
                    Walk(walker, body, result, new[] {
                        P(210,180), P(190,180), P(190,0), P(124,0)
                    });
                    result.gateOpened = gate.Use() && gate.IsOpen;
                    if (!result.gateOpened)
                        throw new InvalidOperationException("Street-side gate action failed");
                    Walk(walker, body, result, new[] { P(124,0), P(120,0) });
                    if (!unsafeZone.Contains(walker.transform.position) ||
                        !save.SaveNow())
                        throw new InvalidOperationException("Door threshold save setup failed");
                    var stored = JsonUtility.FromJson<SavedPosition>(
                        File.ReadAllText(save.FilePath));
                    result.thresholdSaveIgnored = stored != null &&
                        !unsafeZone.Contains(stored.safePosition);
                    if (!result.thresholdSaveIgnored)
                        throw new InvalidOperationException("Door threshold was saved as spawn");
                    Walk(walker, body, result, new[] { P(120,0), P(116,0) });
                    result.gateReclosed = gate.Use() && !gate.IsOpen;
                    if (!result.gateReclosed)
                        throw new InvalidOperationException("Core-side gate action failed");
                    Walk(walker, body, result, new[] {
                        P(116,0), P(112,0), P(112,6), P(95,6), P(75,6), P(60,6)
                    });
                    walker.enabled = true;
                    foreach (var resident in residents) resident.gameObject.SetActive(true);
                }
                result.saved = save.SaveNow();
                if (!result.saved) throw new InvalidOperationException("W4C save failed");
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
                throw new InvalidOperationException("W4C route discontinuity");
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
                        throw new InvalidOperationException("W4C route blocked near " +
                            walker.transform.position);
                    var supported = false;
                    foreach (var hit in Physics.RaycastAll(walker.transform.position +
                        Vector3.up * .55f, Vector3.down, 1.5f))
                        if (hit.normal.y > .65f && hit.collider.GetComponent<Renderer>())
                            supported = true;
                    if (!supported)
                        throw new InvalidOperationException("W4C floor missing near " +
                            walker.transform.position);
                }
                result.walkedMeters += length;
            }
        }
    }
}
