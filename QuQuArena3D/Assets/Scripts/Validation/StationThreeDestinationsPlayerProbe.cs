using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Two Player launches check the relocated greenhouse and archive in one world.
    public sealed class StationThreeDestinationsPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, scene, error, loadSource;
            public Vector3 start, end;
            public float walkedMeters;
            public int moves, careCount;
            public bool firstPerson, floorSupported = true, archiveUsed, saved;
        }

        string output, stage;
        StationGrayboxWalker walker;
        CharacterController controller;
        Result result;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-three-destinations-probe-output");
            var stageAt = Array.IndexOf(args, "--station-three-destinations-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Three destinations Player probe")
                .AddComponent<StationThreeDestinationsPlayerProbe>();
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
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            var research = FindFirstObjectByType<StationResearchDesk>();
            var save = FindFirstObjectByType<StationWorldSave>();
            try
            {
                if (result.scene != "BlackHoleStationThreeDestinationsW3V2" ||
                    !walker || !controller || !greenhouse || !research || !save ||
                    !save.enabled || save.Greenhouse != greenhouse ||
                    greenhouse.StableId != "south-greenhouse-veggie-01")
                    throw new InvalidOperationException("W3 V2 Player scene is incomplete");
                result.loadSource = save.LastLoadSource;
                result.firstPerson = !walker.ThirdPersonMode;
                result.start = walker.transform.position;
                if (!result.firstPerson)
                    throw new InvalidOperationException("Player did not start in first person");
                if (stage == "write")
                {
                    if (save.LastLoadSource != "fresh" ||
                        Vector3.Distance(walker.transform.position, P(104,35)) > .25f)
                        throw new InvalidOperationException("Write stage did not start at home");
                    walker.enabled = false;
                    Walk(new[] {
                        P(104,35),P(94,35),P(94,52),P(82,62),P(66,62),
                        P(48,50),P(0,60),P(-60,60),P(-60,-20),P(-85,-20),
                        P(-85,-100),P(-115,-100),P(-115,-82),P(-125,-82),
                        P(-150,-82),P(-150,0),P(-190,0),P(-190,-170),
                        P(-190,-180),P(-190,-186)
                    });
                    walker.enabled = true;
                    if (!greenhouse.Use() || !greenhouse.Use() ||
                        greenhouse.Stage != 2 || greenhouse.CareCount != 1)
                        throw new InvalidOperationException("Southwest care failed in Player");
                    result.saved = save.SaveNow();
                }
                else if (stage == "read")
                {
                    if (save.LastLoadSource != "primary" ||
                        greenhouse.CareCount != 1 || greenhouse.Stage != 2 ||
                        Vector3.Distance(walker.transform.position, P(-190,-186)) > .25f)
                        throw new InvalidOperationException("Relocated care did not restore");
                    walker.enabled = false;
                    Walk(new[] {
                        P(-190,-186),P(-190,-180),P(-190,-170),P(-190,0),
                        P(-190,190),P(-190,205),P(-200,205),P(-204,205)
                    });
                    walker.enabled = true;
                    result.archiveUsed = research.Use() && research.IsOpen &&
                        research.Report().Contains("当前没有可查阅的赛题") &&
                        research.Use() && !research.IsOpen;
                    if (!result.archiveUsed)
                        throw new InvalidOperationException("Northwest archive failed in Player");
                    result.saved = save.SaveNow();
                }
                else throw new InvalidOperationException("Unknown W3 probe stage");
                if (!result.saved) throw new InvalidOperationException("World save failed");
            }
            catch (Exception error) { result.error = error.Message; }
            result.end = walker ? walker.transform.position : Vector3.zero;
            result.careCount = greenhouse ? greenhouse.CareCount : -1;
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
