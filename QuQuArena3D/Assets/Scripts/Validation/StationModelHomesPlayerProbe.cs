using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Two isolated Player launches verify the port spawn and scene-specific save.
    public sealed class StationModelHomesPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string stage, scene, loadSource, error;
            public Vector3 start, end;
            public int roomCount, residentCount;
            public bool firstPerson, reservedSlotFree, saved;
        }

        string output, stage;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-model-homes-probe-output");
            var stageAt = Array.IndexOf(args, "--station-model-homes-probe-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Model homes Player probe")
                .AddComponent<StationModelHomesPlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result { stage = stage, scene = SceneManager.GetActiveScene().name };
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var save = FindFirstObjectByType<StationWorldSave>();
            var rooms = FindObjectsByType<StationRoomIdentity>(FindObjectsSortMode.None);
            var residents = FindObjectsByType<StationResidentRoutine>(FindObjectsSortMode.None);
            try
            {
                if (result.scene != "BlackHoleStationModelHomesW4A" || !walker || !save ||
                    !save.enabled || save.Walker != walker)
                    throw new InvalidOperationException("W4A Player scene is incomplete");
                result.loadSource = save.LastLoadSource;
                result.start = walker.transform.position;
                result.firstPerson = !walker.ThirdPersonMode;
                result.roomCount = rooms.Length;
                result.residentCount = residents.Length;
                var ids = new[] { "chatgpt", "claude", "deepseek", "gemini", "glm", "kimi" };
                foreach (var id in ids)
                {
                    var roomId = "room/resident/" + id;
                    var residentId = "resident/" + id;
                    var roomCount = 0;
                    var actorCount = 0;
                    foreach (var room in rooms)
                        if (room.RoomId == roomId && room.ResidentId == residentId)
                            roomCount++;
                    foreach (var actor in residents)
                        if (actor.ResidentId == residentId && actor.Room &&
                            actor.Room.RoomId == roomId)
                            actorCount++;
                    if (roomCount != 1 || actorCount != 1)
                        throw new InvalidOperationException("Housing identity missing: " + id);
                }
                var slot = GameObject.Find("Future model home 7x6 slot - unassigned");
                result.reservedSlotFree = slot && !slot.GetComponent<StationRoomIdentity>() &&
                    Physics.OverlapBox(new Vector3(-90.5f, 2f, 55f),
                        new Vector3(3.3f, 1.7f, 2.7f)).Length == 0;
                if (!result.firstPerson || rooms.Length != 6 || residents.Length != 6 ||
                    !result.reservedSlotFree)
                    throw new InvalidOperationException("W4A first person or expansion slot missing");
                if (stage == "write")
                {
                    if (save.LastLoadSource != "fresh" ||
                        Vector3.Distance(result.start, new Vector3(210, .06f, 180)) > .25f)
                        throw new InvalidOperationException("Visitor did not arrive at northeast port");
                    var controller = walker.GetComponent<CharacterController>();
                    walker.enabled = false;
                    for (var i = 1; i <= 100; i++)
                    {
                        var target = Vector3.Lerp(new Vector3(210, .06f, 180),
                            new Vector3(190, .06f, 180), i / 100f);
                        controller.Move(target - walker.transform.position + Vector3.down * .01f);
                        if (Vector3.Distance(new Vector3(target.x, 0, target.z),
                            new Vector3(walker.transform.position.x, 0,
                                walker.transform.position.z)) > .18f)
                            throw new InvalidOperationException("Northeast port route blocked");
                    }
                    walker.enabled = true;
                    result.saved = save.SaveNow();
                }
                else if (stage == "read")
                {
                    if (save.LastLoadSource != "primary" ||
                        Vector3.Distance(result.start, new Vector3(190, .08f, 180)) > .25f)
                        throw new InvalidOperationException("Port visitor position did not restore");
                    result.saved = save.SaveNow();
                }
                else throw new InvalidOperationException("Unknown W4A probe stage");
                if (!result.saved) throw new InvalidOperationException("W4A save failed");
            }
            catch (Exception error) { result.error = error.Message; }
            result.end = walker ? walker.transform.position : Vector3.zero;
            File.WriteAllText(Path.Combine(output, stage + ".json"),
                JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }
    }
}
