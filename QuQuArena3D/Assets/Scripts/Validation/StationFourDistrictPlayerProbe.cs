using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Two independent Player launches verify the new first-person cafe and save.
    public sealed class StationFourDistrictPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, scene, error, loadSource;
            public Vector3 start, end;
            public float walkedMeters;
            public int served, drunk, moves;
            public bool firstPerson, floorSupported = true, cafeUsed, saved, homeReturn;
        }

        string output, stage;
        StationGrayboxWalker walker;
        CharacterController controller;
        Result result;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-four-district-probe-output");
            var stageAt = Array.IndexOf(args, "--station-four-district-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Four district Player probe")
                .AddComponent<StationFourDistrictPlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            result = new Result { stage = stage, scene = SceneManager.GetActiveScene().name };
            walker = FindFirstObjectByType<StationGrayboxWalker>();
            controller = walker ? walker.GetComponent<CharacterController>() : null;
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var save = FindFirstObjectByType<StationWorldSave>();
            try
            {
                if (result.scene != "BlackHoleStationSoutheastLifeW2V2" ||
                    !walker || !controller || !cafe || !save || !save.enabled ||
                    save.Cafe != cafe || cafe.StableId != "east-lounge-cafe-01")
                    throw new InvalidOperationException("W2 V2 Player scene is incomplete");
                result.loadSource = save.LastLoadSource;
                result.firstPerson = !walker.ThirdPersonMode;
                result.start = walker.transform.position;
                if (!result.firstPerson)
                    throw new InvalidOperationException("Player did not start in first person");
                if (stage == "write")
                {
                    if (save.LastLoadSource != "fresh" ||
                        Vector3.Distance(walker.transform.position, P(104,35)) > .25f)
                        throw new InvalidOperationException("Write stage did not start fresh at home");
                    walker.enabled = false;
                    Walk(new[] {
                        P(104,35), P(94,35), P(94,-20), P(85,-20), P(85,-100),
                        P(115,-100), P(115,-82), P(125,-82), P(125,0), P(190,0),
                        P(190,-190), P(190,-205), P(198,-208), P(209,-208)
                    });
                    walker.enabled = true;
                    var served = cafe.Use() && cafe.ServedCount == 1 && cafe.HoldingDrink;
                    walker.enabled = false;
                    Walk(new[] { P(209,-208), P(209,-205) });
                    walker.enabled = true;
                    var seated = cafe.Use() && cafe.SeatedSeatIndex >= 0 && !walker.enabled;
                    var drank = seated && cafe.Use() && cafe.DrunkCount == 1 &&
                        !cafe.HoldingDrink;
                    var stood = drank && cafe.Use() && walker.enabled &&
                        cafe.SeatedSeatIndex < 0;
                    result.cafeUsed = served && seated && drank && stood;
                    if (!result.cafeUsed)
                        throw new InvalidOperationException("Cafe interaction failed in Player");
                    walker.enabled = false;
                    Walk(new[] {
                        P(209,-205), P(209,-208), P(198,-208), P(190,-205),
                        P(190,-218), P(190,-247)
                    });
                    result.saved = save.SaveNow();
                }
                else if (stage == "read")
                {
                    if (save.LastLoadSource != "primary" ||
                        cafe.ServedCount != 1 || cafe.DrunkCount != 1 ||
                        cafe.HoldingDrink ||
                        Vector3.Distance(walker.transform.position, P(190,-247)) > .25f)
                        throw new InvalidOperationException("Cafe or lookout did not restore");
                    walker.enabled = false;
                    Walk(new[] {
                        P(190,-247), P(190,-218), P(190,-190), P(0,-190),
                        P(0,-115), P(-8,-115), P(-8,-90), P(-60,-90),
                        P(-60,60), P(0,60), P(48,50), P(66,62),
                        P(82,62), P(94,52), P(94,35), P(104,35)
                    });
                    result.homeReturn = Vector3.Distance(walker.transform.position,
                        P(104,35)) < .25f;
                    result.cafeUsed = cafe.ServedCount == 1 && cafe.DrunkCount == 1;
                    result.saved = result.homeReturn && save.SaveNow();
                }
                else throw new InvalidOperationException("Unknown W2 Player probe stage");
                if (!result.saved) throw new InvalidOperationException("World save failed");
            }
            catch (Exception error) { result.error = error.Message; }
            result.end = walker ? walker.transform.position : Vector3.zero;
            result.served = cafe ? cafe.ServedCount : -1;
            result.drunk = cafe ? cafe.DrunkCount : -1;
            File.WriteAllText(Path.Combine(output, stage + ".json"),
                JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) &&
                result.floorSupported ? 0 : 1);
        }

        static Vector3 P(float x, float z) => new Vector3(x, .06f, z);

        void Walk(Vector3[] points)
        {
            if (Vector3.Distance(walker.transform.position, points[0]) > .25f)
                throw new InvalidOperationException("Route discontinuity near " +
                    walker.transform.position);
            for (var leg = 1; leg < points.Length; leg++)
            {
                var start = points[leg - 1];
                var end = points[leg];
                var distance = Vector3.Distance(start, end);
                var steps = Mathf.CeilToInt(distance / .2f);
                for (var step = 1; step <= steps; step++)
                {
                    var target = Vector3.Lerp(start, end, (float)step / steps);
                    controller.Move(target - walker.transform.position + Vector3.down * .01f);
                    result.moves++;
                    if (Vector2.Distance(new Vector2(target.x, target.z),
                            new Vector2(walker.transform.position.x,
                                walker.transform.position.z)) > .18f)
                        throw new InvalidOperationException("Route blocked near " +
                            walker.transform.position);
                    var supported = false;
                    foreach (var hit in Physics.RaycastAll(walker.transform.position +
                        Vector3.up * .55f, Vector3.down, 1.5f))
                        if (hit.normal.y > .65f && hit.collider.GetComponent<Renderer>())
                            supported = true;
                    if (!supported)
                    {
                        result.floorSupported = false;
                        throw new InvalidOperationException("Floor missing near " +
                            walker.transform.position);
                    }
                }
                result.walkedMeters += distance;
            }
        }
    }
}
