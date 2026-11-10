using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Opt-in Player evidence from the traversable lower corridor glass floor.
    public sealed class StationSingularityPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string error, graphics;
            public bool glassSupportsPlayer, shaftOpen, holeHasNoCollider;
            public float initialClock, finalClock;
        }

        string output;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-singularity-probe-output");
            if (at < 0 || at + 1 >= args.Length || !Path.IsPathRooted(args[at + 1])) return;
            new GameObject("Station singularity Player probe")
                .AddComponent<StationSingularityPlayerProbe>().output = args[at + 1];
        }

        IEnumerator Start()
        {
            Directory.CreateDirectory(output);
            var result = new Result { graphics = SystemInfo.graphicsDeviceName };
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var hole = GameObject.Find("World-space black hole below central shaft");
            var glass = GameObject.Find("Lower south pressure-glass viewing floor");
            if (!walker || !walker.View || !hole || !glass)
                result.error = "Player view, black hole or lower viewport missing";
            else
            {
                var controller = walker.GetComponent<CharacterController>();
                result.holeHasNoCollider = !hole.GetComponent<Collider>();
                result.shaftOpen = !Physics.Raycast(new Vector3(0, 40, 0),
                    Vector3.down, 240);
                result.glassSupportsPlayer = Physics.Raycast(
                    new Vector3(0, -9, -85), Vector3.down, out var floorHit, 5) &&
                    floorHit.collider.gameObject == glass;
                if (!controller || !result.glassSupportsPlayer ||
                    !result.holeHasNoCollider || !result.shaftOpen)
                    result.error = "World geometry did not pass Player checks";
                else
                {
                    controller.enabled = false;
                    walker.transform.position = new Vector3(0, -11.94f, -85);
                    controller.enabled = true;
                    walker.ThirdPersonMode = false;
                    yield return null;
                    walker.enabled = false;
                    walker.View.transform.LookAt(new Vector3(0, -145, 0));
                    var renderer = hole.GetComponent<Renderer>();
                    var properties = new MaterialPropertyBlock();
                    renderer.GetPropertyBlock(properties);
                    result.initialClock = properties.GetFloat("_ShowTime");
                    yield return new WaitForSecondsRealtime(.5f);
                    renderer.GetPropertyBlock(properties);
                    result.finalClock = properties.GetFloat("_ShowTime");
                    if (result.finalClock <= result.initialClock)
                        result.error = "Singularity animation clock did not advance";
                }
            }
            File.WriteAllText(Path.Combine(output, "player.json"),
                JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }
    }
}
