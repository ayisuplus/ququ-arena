using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Isolated Player launches exercise the cabin-to-south walk and plant-care persistence.
    public sealed class StationGreenhousePlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, error, loadSource;
            public float walkedMeters;
            public int moves, careCount;
            public Vector3 player;
            public bool remoteRejected, floorSupported, inspected, watered, foliageChanged;
            public bool progressRestored, positionRestored, saveWritten;
        }

        string output, stage;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-greenhouse-probe-output");
            var stageAt = Array.IndexOf(args, "--station-greenhouse-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Station greenhouse Player probe")
                .AddComponent<StationGreenhousePlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result { stage = stage, floorSupported = true };
            var care = FindFirstObjectByType<StationGreenhouseCare>();
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var save = FindFirstObjectByType<StationWorldSave>();
            if (!care || !walker || !save || !save.enabled)
                result.error = "Greenhouse, walker or save is missing";
            else if (stage == "write")
            {
                result.remoteRejected = !care.Use();
                try { WalkFromCabin(walker, result); }
                catch (Exception error) { result.error = error.Message; }
                if (string.IsNullOrEmpty(result.error))
                {
                    walker.ThirdPersonMode = false;
                    walker.Face(new Vector3(32, 2.2f, -114));
                    yield return new WaitForEndOfFrame();
                    SaveFrame(Path.Combine(output, "greenhouse-before-care.png"));
                    var small = care.Foliage.localScale.y;
                    result.inspected = care.Use() && care.Stage == 1;
                    result.watered = care.Use() && care.Stage == 2 && care.CareCount == 1;
                    result.foliageChanged = care.Foliage.localScale.y > small + .3f;
                    result.saveWritten = save.SaveNow();
                    yield return new WaitForEndOfFrame();
                    SaveFrame(Path.Combine(output, "greenhouse-after-care.png"));
                    if (!result.remoteRejected || !result.floorSupported || !result.inspected ||
                        !result.watered || !result.foliageChanged || !result.saveWritten)
                        result.error = "South greenhouse care or route failed";
                }
            }
            else if (stage == "read" || stage == "repeat" || stage == "repeat-read")
            {
                var expected = stage == "repeat-read" ? 2 : 1;
                result.progressRestored = care.Stage == 2 && care.CareCount == expected;
                result.positionRestored = Vector3.Distance(walker.transform.position,
                    new Vector3(32, .06f, -107)) < .3f;
                if (save.LastLoadSource != "primary" || !result.progressRestored ||
                    !result.positionRestored) result.error = "Greenhouse state did not restore";
                if (stage == "repeat" && string.IsNullOrEmpty(result.error))
                {
                    result.inspected = care.Use() && care.Stage == 0 &&
                        care.Use() && care.Stage == 1;
                    result.watered = care.Use() && care.Stage == 2 && care.CareCount == 2;
                    result.saveWritten = save.SaveNow();
                    if (!result.inspected || !result.watered || !result.saveWritten)
                        result.error = "Second greenhouse care cycle failed";
                }
                if (stage == "read")
                {
                    walker.ThirdPersonMode = false;
                    walker.Face(new Vector3(32, 2.2f, -114));
                    yield return new WaitForEndOfFrame();
                    SaveFrame(Path.Combine(output, "greenhouse-resumed.png"));
                }
            }
            else if (stage == "legacy")
            {
                result.progressRestored = care.Stage == 0 && care.CareCount == 0;
                result.positionRestored = save.LastLoadSource == "primary";
                result.saveWritten = save.SaveNow();
                if (!result.progressRestored || !result.positionRestored || !result.saveWritten ||
                    !File.ReadAllText(save.FilePath).Contains("\"greenhouse\""))
                    result.error = "Previous v1 candidate save did not migrate";
            }
            else result.error = "Unknown greenhouse probe stage";
            result.loadSource = save ? save.LastLoadSource : "missing";
            result.careCount = care ? care.CareCount : -1;
            result.player = walker ? walker.transform.position : Vector3.zero;
            File.WriteAllText(Path.Combine(output, stage + ".json"), JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }

        static void WalkFromCabin(StationGrayboxWalker walker, Result result)
        {
            var controller = walker.GetComponent<CharacterController>();
            walker.enabled = false;
            Vector3 P(float x, float z) => new Vector3(x, .06f, z);
            var points = new[] { P(104, 35), P(94, 35), P(94, -20), P(85, -20),
                P(85, -100), P(32, -100), P(32, -107) };
            for (var i = 1; i < points.Length; i++)
            {
                var from = points[i - 1];
                var to = points[i];
                var distance = Vector3.Distance(from, to);
                var steps = Mathf.CeilToInt(distance / .25f);
                for (var step = 1; step <= steps; step++)
                {
                    var next = Vector3.Lerp(from, to, (float)step / steps);
                    var delta = next - walker.transform.position;
                    delta.y -= .01f;
                    controller.Move(delta);
                    result.moves++;
                    if (Vector2.Distance(new Vector2(next.x, next.z),
                            new Vector2(walker.transform.position.x, walker.transform.position.z)) > .18f)
                        throw new InvalidOperationException("Greenhouse route blocked near " +
                            walker.transform.position);
                    var supported = false;
                    foreach (var hit in Physics.RaycastAll(walker.transform.position + Vector3.up * .5f,
                                 Vector3.down, 1.4f))
                        if (hit.collider.name.Contains("floor")) supported = true;
                    if (!supported) throw new InvalidOperationException("Greenhouse route floor missing near " +
                        walker.transform.position);
                }
                result.walkedMeters += distance;
            }
            walker.enabled = true;
        }

        static void SaveFrame(string path)
        {
            var frame = ScreenCapture.CaptureScreenshotAsTexture();
            File.WriteAllBytes(path, frame.EncodeToPNG());
            Destroy(frame);
        }
    }
}
