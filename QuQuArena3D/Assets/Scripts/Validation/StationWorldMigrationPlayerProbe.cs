using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Checks one-time W3 -> W4A import using isolated Player save directories.
    public sealed class StationWorldMigrationPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string testCase, scene, loadSource, error;
            public Vector3 position;
            public int careCount, cafeServed, cafeDrunk;
            public bool leftCargoCompleted, targetSaveExists;
        }

        string output, testCase;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-world-migration-output");
            var caseAt = Array.IndexOf(args, "--station-world-migration-case");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                caseAt < 0 || caseAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Station world migration Player probe")
                .AddComponent<StationWorldMigrationPlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.testCase = args[caseAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result {
                testCase = testCase,
                scene = SceneManager.GetActiveScene().name
            };
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var save = FindFirstObjectByType<StationWorldSave>();
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var cargo = FindObjectsByType<StationDockCargoService>(FindObjectsSortMode.None);
            try
            {
                if (result.scene != "BlackHoleStationModelHomesW4A" || !walker ||
                    !save || !save.enabled || !greenhouse || !cafe || cargo.Length != 2)
                    throw new InvalidOperationException("W4A migration scene incomplete");
                StationDockCargoService left = null;
                foreach (var service in cargo)
                    if (service.StableId == "north-dock-left") left = service;
                if (!left) throw new InvalidOperationException("Left cargo missing");
                result.loadSource = save.LastLoadSource;
                result.position = walker.transform.position;
                result.careCount = greenhouse.CareCount;
                result.cafeServed = cafe.ServedCount;
                result.cafeDrunk = cafe.DrunkCount;
                result.leftCargoCompleted = left.Completed;
                result.targetSaveExists = File.Exists(save.FilePath);
                var expectedPosition = new Vector3(210, .06f, 180);
                var expectedSource = "migrated-W3-primary";
                var expectedCare = 1;
                var expectedCafe = 1;
                var expectedCargo = true;
                if (testCase == "west-gallery")
                    expectedPosition = new Vector3(-82, .06f, 62);
                else if (testCase == "east-chatgpt")
                    expectedPosition = new Vector3(94, .06f, 62);
                else if (testCase == "east-claude")
                    expectedPosition = new Vector3(94, .06f, 89);
                else if (testCase == "unchanged")
                    expectedPosition = new Vector3(-204, .08f, 205);
                else if (testCase == "authentic-w3")
                {
                    expectedPosition = new Vector3(-204, .08f, 205);
                    expectedCafe = 0;
                    expectedCargo = false;
                }
                else if (testCase == "backup")
                    expectedSource = "migrated-W3-backup";
                else if (testCase == "reload")
                    expectedSource = "primary";
                else if (testCase == "existing-w4")
                {
                    expectedSource = "primary";
                    expectedPosition = new Vector3(190, .08f, 180);
                    expectedCare = 0;
                    expectedCafe = 0;
                    expectedCargo = false;
                }
                else if (testCase == "invalid-source")
                {
                    expectedSource = "fresh";
                    expectedCare = 0;
                    expectedCafe = 0;
                    expectedCargo = false;
                }
                else if (testCase != "old-home")
                    throw new InvalidOperationException("Unknown migration case");
                if (result.loadSource != expectedSource ||
                    Vector3.Distance(result.position, expectedPosition) > .25f ||
                    result.careCount != expectedCare ||
                    result.cafeServed != expectedCafe ||
                    result.cafeDrunk != expectedCafe ||
                    result.leftCargoCompleted != expectedCargo ||
                    (expectedCare > 0 && !result.targetSaveExists))
                    throw new InvalidOperationException("Migration source, landing or progress mismatch");
            }
            catch (Exception error) { result.error = error.Message; }
            File.WriteAllText(Path.Combine(output, testCase + ".json"),
                JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }
    }
}
