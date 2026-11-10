using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Runs only when the isolated world Player receives an explicit QA output path.
    public sealed class StationWorldPlayerProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string scene, graphics, error, spawnCollider;
            public int width, height, sampledFrames;
            public float sampledSeconds, averageFrameMs;
            public Vector3 initial, spawn, gallery, dock, dockArrival, dockOverlook, vessel;
            public bool initialGrounded, spawnGrounded, initialFloorFound, spawnFloorFound, galleryFloorFound, dockFloorFound;
            public bool dockInterlocked, dockDoorsClosed;
            public bool dockOverlookFloorFound, dockWindowSealed;
            public bool vesselRoundTrip, vesselDeckFound, vesselHatchClosed;
            public bool cargoMovedWhileIdle, cargoPausesForPlayer, cargoTransferRoundTrip;
            public bool cargoReturnBlockedUntilInspection, cargoInspectionRequiresPresence, cargoWorkOrderCompleted;
            public bool keyboardAvailable, mouseAvailable, inputBlocked, movementLocked;
        }

        string output;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var at = Array.IndexOf(args, "--station-world-probe-output");
            if (at < 0 || at + 1 >= args.Length || !Path.IsPathRooted(args[at + 1])) return;
            new GameObject("Station world Player probe").AddComponent<StationWorldPlayerProbe>().output = args[at + 1];
        }

        IEnumerator Start()
        {
            Directory.CreateDirectory(output);
            var result = new Result {
                scene = SceneManager.GetActiveScene().name,
                graphics = SystemInfo.graphicsDeviceName,
                width = Screen.width,
                height = Screen.height
            };
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            if (!walker || !walker.View)
                result.error = "Walking player or its camera is missing";
            else
            {
                var controller = walker.GetComponent<CharacterController>();
                result.initial = walker.transform.position;
                result.initialGrounded = controller.isGrounded;
                result.initialFloorFound = FloorAtSpawn();
                foreach (var mesh in FindObjectsByType<MeshCollider>(FindObjectsSortMode.None))
                    if (mesh.name == "Habitat square floor.001")
                        result.spawnCollider = "enabled=" + mesh.enabled + ",mesh=" +
                            (mesh.sharedMesh ? mesh.sharedMesh.name : "null") + ",bounds=" + mesh.bounds;
                yield return new WaitForEndOfFrame();
                SaveFrame(Path.Combine(output, "initial.png"));
                yield return new WaitForSecondsRealtime(2);
                result.keyboardAvailable = Keyboard.current != null;
                result.mouseAvailable = Mouse.current != null;
                result.inputBlocked = walker.InputBlocked?.Invoke() == true;
                result.movementLocked = walker.MovementLocked;
                var collision = controller.Move(Vector3.down * .1f);
                result.spawn = walker.transform.position;
                result.spawnGrounded = (collision & CollisionFlags.Below) != 0;
                result.spawnFloorFound = FloorAtSpawn();
                var start = Time.realtimeSinceStartup;
                for (var i = 0; i < 120; i++) yield return null;
                result.sampledFrames = 120;
                result.sampledSeconds = Time.realtimeSinceStartup - start;
                result.averageFrameMs = result.sampledSeconds * 1000 / result.sampledFrames;
                yield return new WaitForEndOfFrame();
                SaveFrame(Path.Combine(output, "spawn.png"));

                walker.enabled = false;
                controller.enabled = false;
                walker.transform.position = new Vector3(99, 21.48f, 98);
                controller.enabled = true;
                walker.ThirdPersonMode = false;
                walker.enabled = true;
                yield return null;
                walker.Face(new Vector3(0, 3, 0));
                yield return new WaitForEndOfFrame();
                result.gallery = walker.transform.position;
                foreach (var hit in Physics.RaycastAll(result.gallery + Vector3.up * .5f, Vector3.down, 1.4f))
                    if (hit.collider.name == "NE elevated view floor") result.galleryFloorFound = true;
                SaveFrame(Path.Combine(output, "gallery.png"));
                var airlock = FindFirstObjectByType<StationDockAirlock>();
                if (!airlock) result.error = "North dock airlock is missing";
                else
                {
                    walker.enabled = false;
                    void At(float z)
                    {
                        controller.enabled = false;
                        walker.transform.position = new Vector3(12, .08f, z);
                        controller.enabled = true;
                    }
                    At(130);
                    var innerOpened = airlock.UseInner();
                    At(170);
                    var outerBlocked = !airlock.UseOuter() && !airlock.OuterOpen;
                    At(138);
                    var innerClosed = airlock.UseInner();
                    At(170);
                    var outerOpened = airlock.UseOuter();
                    At(178);
                    var outerClosed = airlock.UseOuter();
                    result.dockInterlocked = innerOpened && outerBlocked && innerClosed && outerOpened && outerClosed;
                    result.dockDoorsClosed = !airlock.InnerOpen && !airlock.OuterOpen;
                    At(205);
                    walker.enabled = true;
                    yield return null;
                    walker.Face(new Vector3(12, 3, 219.5f));
                    yield return new WaitForEndOfFrame();
                    result.dock = walker.transform.position;
                    foreach (var hit in Physics.RaycastAll(result.dock + Vector3.up * .5f, Vector3.down, 1.4f))
                        if (hit.collider.name == "Exterior dock floor") result.dockFloorFound = true;
                    SaveFrame(Path.Combine(output, "dock.png"));
                    walker.enabled = false;
                    var berth = FindFirstObjectByType<StationDockedVesselHatch>();
                    if (berth)
                    {
                        At(205);
                        bool WalkVessel(float end)
                        {
                            var start = walker.transform.position.z;
                            var count = Mathf.CeilToInt(Mathf.Abs(end - start) / .2f);
                            for (var i = 1; i <= count; i++)
                            {
                                var next = Mathf.Lerp(start, end, (float)i / count);
                                controller.Move(new Vector3(0, -.08f, next - walker.transform.position.z));
                                if (Mathf.Abs(walker.transform.position.z - next) > .16f) return false;
                                var floor = false;
                                foreach (var hit in Physics.RaycastAll(walker.transform.position + Vector3.up * .5f,
                                             Vector3.down, 1.4f))
                                    if (hit.collider.name == "Exterior dock floor" ||
                                        hit.collider.name == "Dock berth access ramp" ||
                                        hit.collider.name == "Dock vessel adapter deck" ||
                                        hit.collider.name == "Dock vessel cabin deck") floor = true;
                                if (!floor) return false;
                            }
                            return true;
                        }
                        var inaccessible = !berth.Use();
                        var entered = WalkVessel(216) && berth.Use() && WalkVessel(245);
                        if (entered)
                        {
                            result.vessel = walker.transform.position;
                            foreach (var hit in Physics.RaycastAll(result.vessel + Vector3.up * .5f,
                                         Vector3.down, 1.4f))
                                if (hit.collider.name == "Dock vessel cabin deck")
                                    result.vesselDeckFound = true;
                            walker.enabled = true;
                            yield return null;
                            walker.Face(new Vector3(12, 6, 252));
                            yield return new WaitForEndOfFrame();
                            SaveFrame(Path.Combine(output, "docked-vessel.png"));
                            walker.enabled = false;
                        }
                        result.vesselRoundTrip = inaccessible && entered && WalkVessel(216) &&
                            berth.Use() && WalkVessel(205);
                        result.vesselHatchClosed = !berth.IsOpen && berth.Door.activeSelf;
                    }
                    At(185);
                    walker.enabled = true;
                    yield return null;
                    walker.Face(new Vector3(12, 7, 219.5f));
                    yield return new WaitForEndOfFrame();
                    result.dockArrival = walker.transform.position;
                    SaveFrame(Path.Combine(output, "dock-arrival.png"));
                    walker.enabled = false;
                    controller.enabled = false;
                    walker.transform.position = new Vector3(12, 10.06f, 177);
                    controller.enabled = true;
                    walker.enabled = true;
                    yield return null;
                    walker.Face(new Vector3(12, 7, 219.5f));
                    yield return new WaitForEndOfFrame();
                    result.dockOverlook = walker.transform.position;
                    foreach (var hit in Physics.RaycastAll(result.dockOverlook + Vector3.up * .5f,
                                 Vector3.down, 1.4f))
                        if (hit.collider.name == "North upper skybridge deck") result.dockOverlookFloorFound = true;
                    foreach (var hit in Physics.RaycastAll(result.dockOverlook + Vector3.up,
                                 Vector3.forward, 4))
                        if (hit.collider.name == "Dock upper observation pressure window")
                            result.dockWindowSealed = true;
                    SaveFrame(Path.Combine(output, "dock-overlook.png"));
                    StationDockCargoService cargo = null;
                    foreach (var service in FindObjectsByType<StationDockCargoService>(FindObjectsSortMode.None))
                        if (service.BayLabel == "左侧") cargo = service;
                    if (!cargo) result.error = "Dock cargo service is missing";
                    else
                    {
                        walker.enabled = false;
                        controller.enabled = false;
                        walker.transform.position = new Vector3(-1, .08f, 209.5f);
                        controller.enabled = true;
                        walker.enabled = true;
                        yield return null;
                        walker.Face(new Vector3(-1, 2, 195));
                        var started = cargo.Use();
                        yield return new WaitForSecondsRealtime(1.5f);
                        result.cargoMovedWhileIdle = started && cargo.Moving &&
                            cargo.Cargo.position.z < 201 && cargo.Cargo.position.z > 190;
                        yield return new WaitForEndOfFrame();
                        SaveFrame(Path.Combine(output, "dock-cargo-moving.png"));
                        walker.enabled = false;
                        controller.enabled = false;
                        walker.transform.position = new Vector3(-1, .08f, 190);
                        controller.enabled = true;
                        walker.enabled = true;
                        yield return new WaitForSecondsRealtime(1.5f);
                        result.cargoPausesForPlayer = cargo.Moving && cargo.Blocked &&
                            cargo.Cargo.position.z > 190;
                        walker.enabled = false;
                        controller.enabled = false;
                        walker.transform.position = new Vector3(-1, .08f, 209.5f);
                        controller.enabled = true;
                        walker.enabled = true;
                        yield return new WaitForSecondsRealtime(2);
                        var arrived = cargo.AtInspection && !cargo.Moving;
                        result.cargoReturnBlockedUntilInspection = arrived && !cargo.Use();
                        result.cargoInspectionRequiresPresence = !cargo.Inspect();
                        walker.enabled = false;
                        controller.enabled = false;
                        walker.transform.position = new Vector3(cargo.Cargo.position.x, .08f,
                            cargo.Cargo.position.z - 4.4f);
                        controller.enabled = true;
                        walker.enabled = true;
                        yield return null;
                        walker.Face(cargo.Cargo.position);
                        yield return new WaitForEndOfFrame();
                        SaveFrame(Path.Combine(output, "dock-cargo-inspection.png"));
                        var inspected = cargo.Inspect() && cargo.Inspected;
                        walker.enabled = false;
                        controller.enabled = false;
                        walker.transform.position = new Vector3(-1, .08f, 209.5f);
                        controller.enabled = true;
                        walker.enabled = true;
                        yield return null;
                        walker.Face(new Vector3(-1, 2, 195));
                        var returned = cargo.Use();
                        yield return new WaitForSecondsRealtime(3.5f);
                        yield return new WaitForEndOfFrame();
                        SaveFrame(Path.Combine(output, "dock-cargo-complete.png"));
                        result.cargoTransferRoundTrip = arrived && returned && !cargo.AtInspection &&
                            !cargo.Moving && Mathf.Abs(cargo.Cargo.position.z - 202) < .01f;
                        result.cargoWorkOrderCompleted = inspected && cargo.Completed;
                        if (!result.cargoMovedWhileIdle || !result.cargoPausesForPlayer ||
                            !result.cargoTransferRoundTrip || !result.cargoReturnBlockedUntilInspection ||
                            !result.cargoInspectionRequiresPresence || !result.cargoWorkOrderCompleted)
                            result.error = "Dock cargo work order failed";
                    }
                    if (!result.vesselRoundTrip || !result.vesselDeckFound || !result.vesselHatchClosed ||
                        !result.dockInterlocked || !result.dockDoorsClosed || !result.dockFloorFound ||
                        !result.dockOverlookFloorFound || !result.dockWindowSealed)
                        result.error = "Dock traversal validation failed";
                }
                if (!result.galleryFloorFound) result.error = "Gallery floor missing below player";
                if (!result.spawnFloorFound || !result.spawnGrounded) result.error = "Player spawn has no collision support";
                if (!result.keyboardAvailable || !result.mouseAvailable || result.inputBlocked || result.movementLocked)
                    result.error = "Walking input is unavailable at spawn";
            }
            File.WriteAllText(Path.Combine(output, "probe.json"), JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }

        static void SaveFrame(string path)
        {
            var frame = ScreenCapture.CaptureScreenshotAsTexture();
            File.WriteAllBytes(path, frame.EncodeToPNG());
            Destroy(frame);
        }

        static bool FloorAtSpawn()
        {
            foreach (var hit in Physics.RaycastAll(new Vector3(104, 2, 35), Vector3.down, 10))
                if (hit.collider.name == "Habitat square floor.001") return true;
            return false;
        }
    }
}
