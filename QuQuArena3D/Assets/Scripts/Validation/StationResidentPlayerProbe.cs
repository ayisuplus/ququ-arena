using System;
using System.Collections;
using System.IO;
using System.Reflection;
using UnityEngine;

namespace QuQu
{
    // A separate Player validates resident routes and public dialogue.
    public sealed class StationResidentPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string error;
            public int steps, chatVisits, claudeVisits, chatReturns, claudeReturns;
            public float minimumSeparation;
            public bool floorSupported, uniqueDuringMatch, reappeared, nearDialogue, saveEnabled;
            public bool publicAnswerOwned, unpublishedHidden;
            public string unsupportedResident, unsupportedPosition, supportHits;
            public ResidentCycle[] cycles;
        }

        [Serializable]
        sealed class ResidentCycle
        {
            public string id;
            public int visits, returns;
        }

        string output;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-resident-probe-output");
            if (at < 0 || at + 1 >= args.Length || !Path.IsPathRooted(args[at + 1])) return;
            var probe = new GameObject("Station resident Player probe")
                .AddComponent<StationResidentPlayerProbe>();
            probe.output = args[at + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result { floorSupported = true, minimumSeparation = float.PositiveInfinity };
            var residents = FindObjectsByType<StationResidentRoutine>(FindObjectsSortMode.None);
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var match = FindFirstObjectByType<ArenaStationLiveMatch>();
            var save = FindFirstObjectByType<StationWorldSave>();
            result.saveEnabled = save && save.enabled;
            StationResidentRoutine chat = null, claude = null;
            foreach (var resident in residents)
            {
                if (resident.PresetId == "chatgpt") chat = resident;
                if (resident.PresetId == "claude") claude = resident;
            }
            if (!chat || !claude || !walker || !match || !result.saveEnabled ||
                !chat.Visible || !claude.Visible || chat.Talk())
                result.error = "Resident spawn, world save or remote dialogue failed";
            else
            {
                var chatReturn = Vector3.zero;
                var claudeReturn = Vector3.zero;
                for (; result.steps < 12000 &&
                       Array.Exists(residents, resident => resident.HomeReturns < 1);
                       result.steps++)
                {
                    foreach (var resident in residents) resident.Advance(.05f);
                    if (chat.HomeReturns == 1 && chatReturn == Vector3.zero)
                        chatReturn = chat.transform.position;
                    if (claude.HomeReturns == 1 && claudeReturn == Vector3.zero)
                        claudeReturn = claude.transform.position;
                    result.minimumSeparation = Mathf.Min(result.minimumSeparation,
                        Vector3.Distance(chat.transform.position, claude.transform.position));
                    foreach (var resident in residents)
                    {
                        var supported = false;
                        var hits = "";
                        foreach (var hit in Physics.RaycastAll(resident.transform.position +
                                     Vector3.up * .5f, Vector3.down, 1.4f))
                        {
                            hits += hit.collider.name + " (" + hit.normal.y.ToString("0.00") + "); ";
                            if (hit.normal.y > .65f &&
                                hit.collider.GetComponent<Renderer>()) supported = true;
                        }
                        if (!supported)
                        {
                            result.floorSupported = false;
                            result.unsupportedResident = resident.PresetId;
                            result.unsupportedPosition = resident.transform.position.ToString("F2");
                            result.supportHits = hits;
                            break;
                        }
                    }
                    if (!result.floorSupported) break;
                }
                if (!result.floorSupported || result.steps == 12000 ||
                    Array.Exists(residents, resident => resident.LoungeVisits < 1 ||
                        resident.HomeReturns < 1) ||
                    result.minimumSeparation < .7f ||
                    Vector3.Distance(chatReturn, chat.Route[0]) > .3f ||
                    Vector3.Distance(claudeReturn, claude.Route[0]) > .3f)
                    result.error = "Resident floor, spacing or round trip failed";
                if (string.IsNullOrEmpty(result.error))
                {
                    var field = typeof(ArenaStationLiveMatch).GetField("fighters",
                        BindingFlags.Instance | BindingFlags.NonPublic);
                    var fighters = (ArenaFighter[])field.GetValue(match);
                    var fixture = new GameObject("Visible ChatGPT fighter fixture")
                        .AddComponent<ArenaFighter>();
                    fixture.Look = new AvatarPreference { presetId = "chatgpt" };
                    fighters[0] = fixture;
                    chat.Advance(.05f);
                    claude.Advance(.05f);
                    result.uniqueDuringMatch = !chat.Visible && claude.Visible &&
                        !chat.GetComponent<CharacterController>().enabled;
                    fixture.gameObject.SetActive(false);
                    chat.Advance(.05f);
                    result.reappeared = chat.Visible &&
                        chat.GetComponent<CharacterController>().enabled;
                    fighters[0] = null;
                    Destroy(fixture.gameObject);
                    var body = walker.GetComponent<CharacterController>();
                    body.enabled = false;
                    walker.transform.position = chat.transform.position + Vector3.right * 1.5f;
                    body.enabled = true;
                    result.nearDialogue = chat.Talk() && chat.SpokenCount == 1;
                    var snapshotField = typeof(ArenaStationLiveMatch).GetField("snapshot",
                        BindingFlags.Instance | BindingFlags.NonPublic);
                    var originalSnapshot = snapshotField.GetValue(match);
                    snapshotField.SetValue(match, new CompetitionSnapshot { duels = new[] {
                        new CompetitionDuel { rounds = new[] {
                            new CompetitionRound { index = 2, settled = true, records = new[] {
                                new CompetitionAnswer { model = "chatgpt", answer = "CHAT_PUBLIC",
                                    reasoning = "PRIVATE_REASONING", score = 8.5 },
                                new CompetitionAnswer { model = "claude", answer = "CLAUDE_PUBLIC" }
                            } },
                            new CompetitionRound { index = 3, settled = false, records = new[] {
                                new CompetitionAnswer { model = "chatgpt",
                                    answer = "UNSETTLED_SECRET" }
                            } }
                        } }
                    } });
                    var dialogue = chat.PublicDialogue();
                    result.publicAnswerOwned = dialogue.Contains("CHAT_PUBLIC") &&
                        dialogue.Contains("8.5") && !dialogue.Contains("CLAUDE_PUBLIC") &&
                        !dialogue.Contains("PRIVATE_REASONING");
                    result.unpublishedHidden = !dialogue.Contains("UNSETTLED_SECRET");
                    snapshotField.SetValue(match, originalSnapshot);
                    if (!result.uniqueDuringMatch || !result.reappeared ||
                        !result.nearDialogue || !result.publicAnswerOwned ||
                        !result.unpublishedHidden)
                        result.error = "Contestant presence or nearby dialogue failed";
                }
            }
            result.chatVisits = chat ? chat.LoungeVisits : -1;
            result.claudeVisits = claude ? claude.LoungeVisits : -1;
            result.chatReturns = chat ? chat.HomeReturns : -1;
            result.claudeReturns = claude ? claude.HomeReturns : -1;
            result.cycles = Array.ConvertAll(residents, resident => new ResidentCycle {
                id = resident.PresetId, visits = resident.LoungeVisits,
                returns = resident.HomeReturns });
            File.WriteAllText(Path.Combine(output, "resident-player.json"),
                JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }
    }
}
