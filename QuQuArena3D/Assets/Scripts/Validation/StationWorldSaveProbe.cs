using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Separate Player launches verify persistence across process boundaries.
    public sealed class StationWorldSaveProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, loadSource, error;
            public Vector3 player;
            public bool cargoRestored, playerRestored, saveWritten, backupExists;
            public bool residentResumed;
            public StationResidentState[] residents;
        }

        string output, stage;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-world-save-probe-output");
            var stageAt = Array.IndexOf(args, "--station-world-save-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Station world save probe").AddComponent<StationWorldSaveProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result { stage = stage };
            var save = FindFirstObjectByType<StationWorldSave>();
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            StationDockCargoService left = null;
            foreach (var cargo in FindObjectsByType<StationDockCargoService>(FindObjectsSortMode.None))
                if (cargo.StableId == "north-dock-left") left = cargo;
            if (!save || !walker || !left || !save.enabled)
                result.error = "World save scene wiring is missing";
            else if (stage == "write")
            {
                if (save.LastLoadSource != "fresh") result.error = "Save probe directory is not fresh";
                else
                {
                    Move(walker, new Vector3(-1, .08f, 209.5f));
                    var started = left.Use();
                    yield return new WaitForSecondsRealtime(3.3f);
                    var arrived = left.AtInspection && !left.Moving;
                    Move(walker, new Vector3(-1, .08f, 185.6f));
                    yield return null;
                    var inspected = left.Inspect();
                    Move(walker, new Vector3(12, .08f, 185));
                    yield return null;
                    result.saveWritten = save.SaveNow() && File.Exists(save.FilePath);
                    if (!started || !arrived || !inspected || !result.saveWritten)
                        result.error = "Could not write a dock inspection and safe player position";
                }
            }
            else if (stage == "read" || stage == "recover" || stage == "finish" || stage == "complete")
            {
                var finished = stage == "complete";
                result.cargoRestored = finished
                    ? left.Completed && !left.AtInspection && !left.Moving &&
                      Mathf.Abs(left.Cargo.position.z - 202) < .01f
                    : left.AtInspection && left.Inspected && !left.Moving &&
                      Mathf.Abs(left.Cargo.position.z - 190) < .01f;
                result.playerRestored = Vector3.Distance(walker.transform.position,
                    new Vector3(12, .08f, 185)) < .25f;
                var expected = stage == "recover" ? "backup" : "primary";
                if (save.LastLoadSource != expected || !result.cargoRestored || !result.playerRestored)
                    result.error = "World save did not restore from " + expected;
                if (stage == "finish" && string.IsNullOrEmpty(result.error))
                {
                    Move(walker, new Vector3(-1, .08f, 209.5f));
                    var returning = left.Use();
                    yield return new WaitForSecondsRealtime(3.3f);
                    Move(walker, new Vector3(12, .08f, 185));
                    yield return null;
                    result.saveWritten = returning && left.Completed && save.SaveNow();
                    if (!result.saveWritten) result.error = "Completed dock work order was not saved";
                }
            }
            else if (stage == "upper" || stage == "lower")
            {
                var position = stage == "upper" ? new Vector3(105, 14.06f, 5) :
                    new Vector3(85, -11.94f, -30);
                Move(walker, position);
                yield return null;
                result.saveWritten = save.SaveNow();
                if (!result.saveWritten) result.error = "Cross-level safe position was not saved";
            }
            else if (stage == "upper-read" || stage == "lower-read")
            {
                var position = stage == "upper-read" ? new Vector3(105, 14.06f, 5) :
                    new Vector3(85, -11.94f, -30);
                result.playerRestored = Vector3.Distance(walker.transform.position, position) < .25f;
                result.cargoRestored = left.Completed && !left.Moving;
                if (save.LastLoadSource != "primary" || !result.playerRestored || !result.cargoRestored)
                    result.error = "Cross-level safe position did not restore";
            }
            else if (stage == "resident-write" || stage == "resident-read")
            {
                var residents = FindObjectsByType<StationResidentRoutine>(FindObjectsSortMode.None);
                if (residents.Length != 6 || !Array.TrueForAll(residents, resident => resident.Visible))
                    result.error = "Resident avatars are not initialized";
                else if (stage == "resident-write")
                {
                    if (save.LastLoadSource != "fresh") result.error = "Resident save directory is not fresh";
                    else
                    {
                        for (var i = 0; i < 1200; i++)
                            foreach (var resident in residents) resident.Advance(.05f);
                        result.residents = Array.ConvertAll(residents, resident => resident.CaptureState());
                        result.saveWritten = save.SaveNow();
                        var chat = Array.Find(result.residents, resident => resident.id == "resident/chatgpt");
                        if (!result.saveWritten || chat == null || chat.targetIndex < 2 ||
                            Vector3.Distance(chat.position, Array.Find(residents,
                                resident => resident.ResidentId == chat.id).Route[0]) < 5)
                            result.error = "Resident did not leave home before save";
                    }
                }
                else
                {
                    var previous = JsonUtility.FromJson<Result>(File.ReadAllText(
                        Path.Combine(output, "resident-write.json")));
                    result.residents = Array.ConvertAll(residents, resident => resident.CaptureState());
                    if (save.LastLoadSource != "primary" || previous.residents.Length != residents.Length)
                        result.error = "Resident save was not loaded";
                    else
                        foreach (var expected in previous.residents)
                        {
                            var actual = Array.Find(result.residents, resident => resident.id == expected.id);
                            if (actual == null || Vector3.Distance(actual.position, expected.position) > .3f ||
                                actual.targetIndex != expected.targetIndex ||
                                actual.outbound != expected.outbound ||
                                actual.visits != expected.visits || actual.returns != expected.returns ||
                                actual.inLounge != expected.inLounge)
                                result.error = "Resident route progress did not survive reload: " + expected.id;
                        }
                    var chat = Array.Find(residents, resident => resident.ResidentId == "resident/chatgpt");
                    var before = chat.transform.position;
                    chat.Advance(.05f);
                    result.residentResumed = Vector3.Distance(before, chat.transform.position) > .02f;
                    if (!result.residentResumed) result.error = "Resident did not resume walking";
                }
            }
            else if (stage == "resident-legacy")
            {
                var residents = FindObjectsByType<StationResidentRoutine>(FindObjectsSortMode.None);
                result.residents = Array.ConvertAll(residents, resident => resident.CaptureState());
                if (save.LastLoadSource != "primary" || residents.Length != 6 ||
                    Array.Exists(residents, resident => !resident.Visible ||
                        Vector3.Distance(resident.transform.position, resident.Route[0]) > .3f))
                    result.error = "Legacy save without resident state did not load safely";
            }
            else result.error = "Unknown save probe stage";
            result.loadSource = save ? save.LastLoadSource : "missing";
            result.player = walker ? walker.transform.position : Vector3.zero;
            result.backupExists = save && File.Exists(save.FilePath + ".bak");
            File.WriteAllText(Path.Combine(output, stage + ".json"), JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }

        static void Move(StationGrayboxWalker walker, Vector3 position)
        {
            var controller = walker.GetComponent<CharacterController>();
            walker.enabled = false;
            controller.enabled = false;
            walker.transform.position = position;
            controller.enabled = true;
            walker.enabled = true;
        }
    }
}
