using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Candidate-world state only. Match data and customization keep their existing owners.
    public sealed class StationWorldSave : MonoBehaviour
    {
        [Serializable]
        sealed class Snapshot
        {
            public int version = 1;
            public string sceneId;
            public Vector3 safePosition;
            public StationRingLocation ringLocation;
            public StationDockCargoState[] cargo;
            public StationGreenhouseState greenhouse;
            public StationCafeState cafe;
            public StationResidentState[] residents;
        }

        public StationGrayboxWalker Walker;
        public StationDockCargoService[] Cargo;
        public StationGreenhouseCare Greenhouse;
        public StationCafeMoment Cafe;
        public string LastLoadSource { get; private set; } = "fresh";
        public string FilePath { get; private set; }

        Vector3 lastSafePosition;
        StationRingLocation lastSafeRingLocation;
        StationUnsafeSaveZone[] unsafeZones;
        StationResidentRoutine[] residents;
        float nextSave;
        bool ready, preserveBackup;

        void Start()
        {
            unsafeZones = FindObjectsByType<StationUnsafeSaveZone>(FindObjectsSortMode.None);
            residents = FindObjectsByType<StationResidentRoutine>(FindObjectsSortMode.None);
            if (!Walker || !Greenhouse || string.IsNullOrWhiteSpace(Greenhouse.StableId) ||
                !Cafe || string.IsNullOrWhiteSpace(Cafe.StableId) ||
                Cargo == null || Cargo.Length != 2 ||
                Array.Exists(Cargo, service => !service || !service.Cargo ||
                    string.IsNullOrWhiteSpace(service.StableId)) ||
                !IsSafe(Walker.transform.position))
            {
                Debug.LogError("Station world save has no safe spawn or dock references");
                enabled = false;
                return;
            }
            var sceneName = SceneManager.GetActiveScene().name;
            var directory = Path.Combine(Application.persistentDataPath, "StationWorldCandidate");
            if (sceneName != "BlackHoleStationObservatory")
                directory = Path.Combine(directory, sceneName);
#if UNITY_EDITOR
            directory = Path.Combine(Application.temporaryCachePath, "StationWorldEditor", sceneName);
#endif
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-world-save-dir");
            if (at >= 0 && at + 1 < args.Length && Path.IsPathRooted(args[at + 1]))
                directory = args[at + 1];
            else
            {
                var qa = Array.IndexOf(args, "--station-world-probe-output");
                if (qa < 0) qa = Array.IndexOf(args, "--station-greenhouse-probe-output");
                if (qa >= 0 && qa + 1 < args.Length && Path.IsPathRooted(args[qa + 1]))
                    directory = Path.Combine(args[qa + 1], "save");
            }
            FilePath = Path.Combine(directory, "world-v1.json");
            lastSafePosition = Walker.transform.position;
            var backup = FilePath + ".bak";
            var primary = TryRead(FilePath, sceneName, false, out var state);
            var restored = primary || TryRead(backup, sceneName, false, out state);
            var migrated = false;
            if (!restored && !File.Exists(FilePath) && !File.Exists(backup))
            {
                var previousScenes = sceneName == "BlackHoleStationSouthGardenLoopW4P" ?
                    new[] { "BlackHoleStationPublicMatchNoticeW4O",
                        "BlackHoleStationSouthCrossingW4N",
                        "BlackHoleStationSoutheastCafeW4M",
                        "BlackHoleStationDistrictRingBaysW4L",
                        "BlackHoleStationOuterRingCanopyW4K",
                        "BlackHoleStationGreenhousePressureW4J",
                        "BlackHoleStationWestRingW4I",
                        "BlackHoleStationLifeStreetW4H",
                        "BlackHoleStationTourConnectorsW4G",
                        "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationPublicMatchNoticeW4O" ?
                    new[] { "BlackHoleStationSouthCrossingW4N",
                        "BlackHoleStationSoutheastCafeW4M",
                        "BlackHoleStationDistrictRingBaysW4L",
                        "BlackHoleStationOuterRingCanopyW4K",
                        "BlackHoleStationGreenhousePressureW4J",
                        "BlackHoleStationWestRingW4I",
                        "BlackHoleStationLifeStreetW4H",
                        "BlackHoleStationTourConnectorsW4G",
                        "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationSouthCrossingW4N" ?
                    new[] { "BlackHoleStationSoutheastCafeW4M",
                        "BlackHoleStationDistrictRingBaysW4L",
                        "BlackHoleStationOuterRingCanopyW4K",
                        "BlackHoleStationGreenhousePressureW4J",
                        "BlackHoleStationWestRingW4I",
                        "BlackHoleStationLifeStreetW4H",
                        "BlackHoleStationTourConnectorsW4G",
                        "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationSoutheastCafeW4M" ?
                    new[] { "BlackHoleStationDistrictRingBaysW4L",
                        "BlackHoleStationOuterRingCanopyW4K",
                        "BlackHoleStationGreenhousePressureW4J",
                        "BlackHoleStationWestRingW4I",
                        "BlackHoleStationLifeStreetW4H",
                        "BlackHoleStationTourConnectorsW4G",
                        "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationDistrictRingBaysW4L" ?
                    new[] { "BlackHoleStationOuterRingCanopyW4K",
                        "BlackHoleStationGreenhousePressureW4J",
                        "BlackHoleStationWestRingW4I",
                        "BlackHoleStationLifeStreetW4H",
                        "BlackHoleStationTourConnectorsW4G",
                        "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationOuterRingCanopyW4K" ?
                    new[] { "BlackHoleStationGreenhousePressureW4J",
                        "BlackHoleStationWestRingW4I",
                        "BlackHoleStationLifeStreetW4H",
                        "BlackHoleStationTourConnectorsW4G",
                        "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationGreenhousePressureW4J" ?
                    new[] { "BlackHoleStationWestRingW4I",
                        "BlackHoleStationLifeStreetW4H",
                        "BlackHoleStationTourConnectorsW4G",
                        "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationWestRingW4I" ?
                    new[] { "BlackHoleStationLifeStreetW4H",
                        "BlackHoleStationTourConnectorsW4G",
                        "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationLifeStreetW4H" ?
                    new[] { "BlackHoleStationTourConnectorsW4G",
                        "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationTourConnectorsW4G" ?
                    new[] { "BlackHoleStationObservationBayW4F",
                        "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationObservationBayW4F" ?
                    new[] { "BlackHoleStationArrivalSpineW4E",
                        "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationArrivalSpineW4E" ?
                    new[] { "BlackHoleStationArrivalGuideW4D",
                        "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationArrivalGuideW4D" ?
                    new[] { "BlackHoleStationEastPublicGateW4C",
                        "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationEastPublicGateW4C" ?
                    new[] { "BlackHoleStationModelHomesW4A",
                        "BlackHoleStationThreeDestinationsW3V2" } :
                    sceneName == "BlackHoleStationModelHomesW4A" ?
                    new[] { "BlackHoleStationThreeDestinationsW3V2" } :
                    // V016 没有更早的独立存档目录；V019 的旧档只存在于 V016 目录里
                    sceneName == "BlackHoleStationCreativeBuildingsV016" ?
                    Array.Empty<string>() :
                    sceneName == "BlackHoleStationDistrictsV019" ?
                    new[] { "BlackHoleStationCreativeBuildingsV016" } :
                    Array.Empty<string>();
                var parent = Path.GetDirectoryName(directory);
                if (!string.IsNullOrEmpty(parent))
                {
                    foreach (var previousScene in previousScenes)
                    {
                        var oldFile = Path.Combine(parent, previousScene, "world-v1.json");
                        var backupFile = oldFile + ".bak";
                        if (!File.Exists(oldFile) && !File.Exists(backupFile)) continue;
                        var fromW3 = previousScene == "BlackHoleStationThreeDestinationsW3V2";
                        var oldPrimary = TryRead(oldFile, previousScene, fromW3, out state);
                        migrated = oldPrimary ||
                            TryRead(backupFile, previousScene, fromW3, out state);
                        if (migrated)
                        {
                            var label = fromW3 ? "W3" :
                                previousScene == "BlackHoleStationModelHomesW4A" ?
                                "W4A" :
                                previousScene == "BlackHoleStationEastPublicGateW4C" ?
                                "W4C" : previousScene == "BlackHoleStationArrivalSpineW4E" ?
                                "W4E" : previousScene == "BlackHoleStationObservationBayW4F" ?
                                "W4F" : previousScene == "BlackHoleStationTourConnectorsW4G" ?
                                "W4G" : previousScene == "BlackHoleStationLifeStreetW4H" ?
                                "W4H" : previousScene == "BlackHoleStationWestRingW4I" ?
                                "W4I" : previousScene == "BlackHoleStationGreenhousePressureW4J" ?
                                "W4J" : previousScene == "BlackHoleStationOuterRingCanopyW4K" ?
                                "W4K" : previousScene == "BlackHoleStationDistrictRingBaysW4L" ?
                                "W4L" : previousScene == "BlackHoleStationSoutheastCafeW4M" ?
                                "W4M" : previousScene == "BlackHoleStationSouthCrossingW4N" ?
                                "W4N" : previousScene == "BlackHoleStationPublicMatchNoticeW4O" ?
                                "W4O" : previousScene == "BlackHoleStationCreativeBuildingsV016" ?
                                "V016" : "W4D";
                            LastLoadSource = "migrated-" + label + "-" +
                                (oldPrimary ? "primary" : "backup");
                        }
                        break;
                    }
                }
            }
            if (restored || migrated)
            {
                if (!migrated) LastLoadSource = primary ? "primary" : "backup";
                foreach (var service in Cargo)
                    foreach (var saved in state.cargo)
                        if (saved.id == service.StableId) service.RestoreState(saved);
                if (state.greenhouse != null) Greenhouse.RestoreState(state.greenhouse);
                if (state.cafe != null) Cafe.RestoreState(state.cafe);
                if (state.residents != null)
                    foreach (var resident in residents)
                        foreach (var saved in state.residents)
                            if (saved != null && saved.id == resident.ResidentId)
                            {
                                if (resident.CanRestore(saved)) resident.RestoreState(saved);
                                else Debug.LogWarning("Skipping incompatible resident position: " + saved.id);
                                break;
                            }
                var controller = Walker.GetComponent<CharacterController>();
                controller.enabled = false;
                Walker.transform.position = state.safePosition;
                if (state.ringLocation != null && StationRotatingRing.TryResolve(state.ringLocation,
                        out _, out var restoredRotation)) Walker.transform.rotation = restoredRotation;
                controller.enabled = true;
                Walker.ResetGroundReference();
                lastSafePosition = state.safePosition;
                lastSafeRingLocation = state.ringLocation;
                if (LastLoadSource == "backup")
                {
                    try { File.Copy(backup, FilePath, true); }
                    catch (Exception) { preserveBackup = true; }
                }
            }
            foreach (var service in Cargo) service.StateChanged += SaveOnChange;
            Greenhouse.StateChanged += SaveOnChange;
            Cafe.StateChanged += SaveOnChange;
            nextSave = Time.unscaledTime + 5;
            ready = true;
            if (migrated && !SaveNow())
                Debug.LogWarning("Station legacy save loaded but migration could not be written");
        }

        void Update()
        {
            if (Time.unscaledTime < nextSave) return;
            SaveNow();
            nextSave = Time.unscaledTime + 5;
        }

        void SaveOnChange() => SaveNow();
        void OnApplicationPause(bool paused) { if (paused) SaveNow(); }
        void OnApplicationQuit() => SaveNow();
        void OnDisable()
        {
            if (Cargo == null) return;
            foreach (var service in Cargo)
                if (service) service.StateChanged -= SaveOnChange;
            if (Greenhouse) Greenhouse.StateChanged -= SaveOnChange;
            if (Cafe) Cafe.StateChanged -= SaveOnChange;
        }

        public bool SaveNow()
        {
            if (!ready) return false;
            if (IsSafe(Walker.transform.position))
            {
                lastSafePosition = Walker.transform.position;
                lastSafeRingLocation = Walker.GroundRing ?
                    Walker.GroundRing.Capture(lastSafePosition, Walker.transform.rotation) : null;
            }
            else if (lastSafeRingLocation != null && StationRotatingRing.TryResolve(lastSafeRingLocation,
                         out var carriedSafePosition, out _)) lastSafePosition = carriedSafePosition;
            var state = new Snapshot {
                version = lastSafeRingLocation == null ? 1 : 2,
                sceneId = SceneManager.GetActiveScene().name,
                safePosition = lastSafePosition,
                ringLocation = lastSafeRingLocation,
                cargo = Array.ConvertAll(Cargo, service => service.CaptureState()),
                greenhouse = Greenhouse.CaptureState(),
                cafe = Cafe.CaptureState(),
                residents = Array.ConvertAll(residents, resident => resident.CaptureState())
            };
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                var temp = FilePath + ".tmp";
                File.WriteAllText(temp, JsonUtility.ToJson(state, true));
                if (!File.Exists(FilePath)) File.Move(temp, FilePath);
                else if (preserveBackup)
                {
                    File.Copy(temp, FilePath, true);
                    File.Delete(temp);
                    preserveBackup = false;
                }
                else File.Replace(temp, FilePath, FilePath + ".bak");
                return true;
            }
            catch (Exception error)
            {
                Debug.LogWarning("Station world save failed: " + error.Message);
                return false;
            }
        }

        bool TryRead(string path, string expectedScene, bool migrateW3,
            out Snapshot state)
        {
            state = null;
            try
            {
                if (!File.Exists(path) || new FileInfo(path).Length > 1024 * 1024) return false;
                var json = File.ReadAllText(path);
                var loaded = JsonUtility.FromJson<Snapshot>(json);
                if (loaded != null && !json.Contains("\"greenhouse\""))
                    loaded.greenhouse = null;
                if (loaded != null && !json.Contains("\"cafe\""))
                    loaded.cafe = null;
                if (loaded == null || (loaded.version != 1 && loaded.version != 2) ||
                    loaded.sceneId != expectedScene ||
                    loaded.cargo == null || loaded.cargo.Length != Cargo.Length ||
                    (loaded.greenhouse != null && !Greenhouse.CanRestore(loaded.greenhouse)) ||
                    (loaded.cafe != null && !Cafe.CanRestore(loaded.cafe))) return false;
                if (migrateW3) loaded.safePosition = W3PositionInModelHomes(loaded.safePosition);
                // A new scene session uses its authored phases. Restore to the same ring-local place.
                if (loaded.version == 2)
                {
                    if (!StationRotatingRing.TryResolve(loaded.ringLocation, out var position, out _))
                        return false;
                    loaded.safePosition = position;
                    Physics.SyncTransforms();
                }
                else loaded.ringLocation = null;
                if (!IsSafe(loaded.safePosition)) return false;
                var ids = new HashSet<string>();
                foreach (var saved in loaded.cargo)
                {
                    if (saved == null || !ids.Add(saved.id)) return false;
                    var found = false;
                    foreach (var service in Cargo)
                        if (service.StableId == saved.id && service.CanRestore(saved)) found = true;
                    if (!found) return false;
                }
                state = loaded;
                return true;
            }
            catch (Exception) { return false; }
        }

        static Vector3 W3PositionInModelHomes(Vector3 old)
        {
            if (float.IsNaN(old.y) || float.IsInfinity(old.y) ||
                Mathf.Abs(old.y) > .5f) return old;
            if (old.x > 100 && old.x < 121 && old.z > 29 && old.z < 41)
                return new Vector3(210, .06f, 180);
            if (old.x > -96 && old.x < -68 && old.z > 50 && old.z < 74)
                return new Vector3(-82, .06f, 62);
            if (old.x > 111 && old.x < 121 && old.z > 59 && old.z < 65)
                return new Vector3(94, .06f, 62);
            if (old.x > 111 && old.x < 121 && old.z > 86 && old.z < 93)
                return new Vector3(94, .06f, 89);
            return old;
        }

        bool IsSafe(Vector3 position)
        {
            // Exclude both sides of a joint, including the stationary transfer deck.
            foreach (var ring in FindObjectsByType<StationRotatingRing>(FindObjectsSortMode.None))
            {
                var local = ring.transform.InverseTransformPoint(position);
                var radius = new Vector2(local.x, local.z).magnitude;
                if (Mathf.Abs(local.y) < .5f && (Mathf.Abs(radius - ring.InnerRadius) < .8f ||
                    Mathf.Abs(radius - ring.OuterRadius) < .8f)) return false;
            }
            foreach (var zone in unsafeZones)
                if (zone && zone.Contains(position)) return false;
            if (float.IsNaN(position.x) || float.IsNaN(position.y) || float.IsNaN(position.z) ||
                float.IsInfinity(position.x) || float.IsInfinity(position.y) ||
                float.IsInfinity(position.z) || position.sqrMagnitude > 100000000 ||
                position.x * position.x + position.z * position.z < 40 * 40) return false;
            if (Cargo != null)
                foreach (var service in Cargo)
                    if (service && service.IsInTravelLane(position))
                        return false;
            foreach (var hit in Physics.RaycastAll(position + Vector3.up * .6f,
                         Vector3.down, 1.4f))
            {
                var name = hit.collider.name.ToLowerInvariant();
                var ring = hit.collider.GetComponentInParent<StationRotatingRing>();
                if (ring && !ring.IsAwayFromSeam(position)) continue;
                if (ring)
                {
                    var cc = Walker.GetComponent<CharacterController>();
                    var centre = position + cc.center;
                    var offset = Vector3.up * (cc.height * .5f - cc.radius);
                    foreach (var obstacle in Physics.OverlapCapsule(centre - offset, centre + offset,
                                 cc.radius * .85f, ~0, QueryTriggerInteraction.Ignore))
                        if (obstacle != cc && !obstacle.transform.IsChildOf(Walker.transform)) return false;
                }
                if (hit.normal.y > .65f && Mathf.Abs(hit.point.y - position.y) < .35f &&
                    (name.Contains("floor") || name.Contains("deck") || name.Contains("ramp") ||
                     name.Contains("promenade") || name.Contains("corridor") ||
                     name.Contains("connector") || name.Contains("skybridge")) &&
                    !name.Contains("lift") && !name.Contains("platform") &&
                    !name.Contains("guard") && !name.Contains("roof") &&
                    !name.Contains("rail") && !name.Contains("wall")) return true;
            }
            return false;
        }
    }
}
