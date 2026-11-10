using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    // Walks one continuous public loop through all four districts and their reused activities.
    public sealed class StationFourDistrictTourPlayerProbe : MonoBehaviour
    {
        string output, stage;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var outputAt = Array.IndexOf(args, "--station-district-tour-output");
            var stageAt = Array.IndexOf(args, "--station-district-tour-stage");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                stageAt < 0 || stageAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            var probe = new GameObject("Station four-district tour Player probe")
                .AddComponent<StationFourDistrictTourPlayerProbe>();
            probe.output = args[outputAt + 1];
            probe.stage = args[stageAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            Directory.CreateDirectory(output);
            var report = new JObject { ["stage"] = stage,
                ["scene"] = SceneManager.GetActiveScene().name };
            try
            {
                var save = FindFirstObjectByType<StationWorldSave>();
                var walker = FindFirstObjectByType<StationGrayboxWalker>();
                var hud = FindFirstObjectByType<StationMatchHUD>();
                var singularity = GameObject.Find("World-space black hole below central shaft");
                if (SceneManager.GetActiveScene().name !=
                        "BlackHoleStationTourConnectorsW4G" &&
                    SceneManager.GetActiveScene().name !=
                        "BlackHoleStationLifeStreetW4H" &&
                    SceneManager.GetActiveScene().name !=
                        "BlackHoleStationWestRingW4I" &&
                    SceneManager.GetActiveScene().name !=
                        "BlackHoleStationGreenhousePressureW4J" &&
                    SceneManager.GetActiveScene().name !=
                        "BlackHoleStationOuterRingCanopyW4K" &&
                    SceneManager.GetActiveScene().name !=
                        "BlackHoleStationDistrictRingBaysW4L" &&
                    SceneManager.GetActiveScene().name !=
                        "BlackHoleStationSoutheastCafeW4M" &&
                    SceneManager.GetActiveScene().name !=
                        "BlackHoleStationSouthCrossingW4N" &&
                    SceneManager.GetActiveScene().name !=
                        "BlackHoleStationPublicMatchNoticeW4O" &&
                    SceneManager.GetActiveScene().name !=
                        "BlackHoleStationSouthGardenLoopW4P" ||
                    !save || !save.enabled || !walker || !hud ||
                    !hud.IsCompact || hud.WatchRequested == null ||
                    !singularity || singularity.transform.localScale != new Vector3(800,800,800) ||
                    !walker.View || Mathf.Abs(walker.View.farClipPlane-1200)>.1f)
                    throw new InvalidOperationException("W4G-W4P tour scene incomplete");
                report["loadSource"] = save.LastLoadSource;
                report["hudCompactOnStart"] = hud.IsCompact;
                report["watchAvailable"] = hud.WatchRequested != null;
                report["singularityProxyScale"] = singularity.transform.localScale.ToString();
                report["viewFarClipPlane"] = walker.View.farClipPlane;
                if (stage == "tour")
                {
                    if (save.LastLoadSource != "fresh" ||
                        Vector3.Distance(walker.transform.position,P(210,180))>.25f)
                        throw new InvalidOperationException("Tour must start from fresh port arrival");
                    report.Merge(RunTour(true));
                }
                else if (stage == "crossing")
                {
                    if (SceneManager.GetActiveScene().name !=
                        "BlackHoleStationSouthCrossingW4N" ||
                        save.LastLoadSource != "fresh")
                        throw new InvalidOperationException("W4N crossing must start fresh");
                    report.Merge(RunSouthCrossing());
                }
                else if (stage == "read" || stage == "migrate-w4g" ||
                    stage == "migrate-w4h" || stage == "migrate-w4i" ||
                    stage == "migrate-w4j" || stage == "migrate-w4k" ||
                    stage == "migrate-w4l" || stage == "migrate-w4m" ||
                    stage == "migrate-w4n" || stage == "migrate-w4o")
                {
                    var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
                    var cafe = FindFirstObjectByType<StationCafeMoment>();
                    var cargo = FindObjectsByType<StationDockCargoService>(
                        FindObjectsSortMode.None).Single(x=>x.StableId=="north-dock-left");
                    var expectedSource = stage == "read" ? "primary" :
                        stage == "migrate-w4g" ? "migrated-W4G-primary" :
                        stage == "migrate-w4h" ? "migrated-W4H-primary" :
                        stage == "migrate-w4i" ? "migrated-W4I-primary" :
                        stage == "migrate-w4j" ? "migrated-W4J-primary" :
                        stage == "migrate-w4k" ? "migrated-W4K-primary" :
                        stage == "migrate-w4l" ? "migrated-W4L-primary" :
                        stage == "migrate-w4m" ? "migrated-W4M-primary" :
                        stage == "migrate-w4n" ? "migrated-W4N-primary" :
                        "migrated-W4O-primary";
                    if ((stage == "migrate-w4g" &&
                            SceneManager.GetActiveScene().name !=
                                "BlackHoleStationLifeStreetW4H") ||
                        (stage == "migrate-w4h" &&
                            SceneManager.GetActiveScene().name !=
                                "BlackHoleStationWestRingW4I") ||
                        (stage == "migrate-w4i" &&
                            SceneManager.GetActiveScene().name !=
                                "BlackHoleStationGreenhousePressureW4J") ||
                        (stage == "migrate-w4j" &&
                            SceneManager.GetActiveScene().name !=
                                "BlackHoleStationOuterRingCanopyW4K") ||
                        (stage == "migrate-w4k" &&
                            SceneManager.GetActiveScene().name !=
                                "BlackHoleStationDistrictRingBaysW4L") ||
                        (stage == "migrate-w4l" &&
                            SceneManager.GetActiveScene().name !=
                                "BlackHoleStationSoutheastCafeW4M") ||
                        (stage == "migrate-w4m" &&
                            SceneManager.GetActiveScene().name !=
                                "BlackHoleStationSouthCrossingW4N") ||
                        (stage == "migrate-w4n" &&
                            SceneManager.GetActiveScene().name !=
                                "BlackHoleStationPublicMatchNoticeW4O") ||
                        (stage == "migrate-w4o" &&
                            SceneManager.GetActiveScene().name !=
                                "BlackHoleStationSouthGardenLoopW4P") ||
                        save.LastLoadSource != expectedSource ||
                        Vector3.Distance(walker.transform.position,P(60,6))>.25f ||
                        !greenhouse || greenhouse.CareCount != 1 ||
                        !cafe || cafe.ServedCount != 1 || cafe.DrunkCount != 1 ||
                        cargo.CaptureState().id != "north-dock-left")
                        throw new InvalidOperationException("Tour progress did not restore");
                    report["position"] = walker.transform.position.ToString();
                    report["careCount"] = greenhouse.CareCount;
                    report["cafeServed"] = cafe.ServedCount;
                    report["cafeDrunk"] = cafe.DrunkCount;
                    report["cargoMoving"] = cargo.Moving;
                    report["saved"] = save.SaveNow();
                    if (!(bool)report["saved"])
                        throw new InvalidOperationException("Tour reload save failed");
                }
                else throw new InvalidOperationException("Unknown tour stage");
            }
            catch (Exception error) { report["error"] = error.Message; }
            File.WriteAllText(Path.Combine(output,stage + ".json"),report.ToString());
            Application.Quit(report["error"] == null ? 0 : 1);
        }

        static Vector3 P(float x,float z) => new Vector3(x,.06f,z);
        static Vector3 ResearchRamp(float x) => new Vector3(x,(x+244)/6f+.06f,242);
        static Vector3 SoutheastRamp(float z) => new Vector3(175,(z+258)/4f+.06f,z);
        static Vector3 WestRamp(float x) => new Vector3(x,(x+332)*.15f+.06f,0);
        static Vector3 Ring(int index) => P(330*Mathf.Cos(index*Mathf.PI/24),
            330*Mathf.Sin(index*Mathf.PI/24));

        static JObject RunSouthCrossing()
        {
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var body = walker ? walker.GetComponent<CharacterController>() : null;
            var match = FindFirstObjectByType<ArenaStationLiveMatch>();
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var names = new[] { "Garden south walk guide", "South crossroad guide",
                "Cafe south walk guide" };
            var guides = names.Select(name => GameObject.Find(name)?
                .GetComponent<StationArrivalGuide>()).ToArray();
            if (!body || !match || !greenhouse || !cafe ||
                guides.Any(guide => !guide || guide.Walker != walker ||
                    guide.Match != match))
                throw new InvalidOperationException("W4N destinations or route guides missing");
            var previousEnabled = walker.enabled;
            var distance = 0f;
            var stops = new JArray();
            walker.enabled = false;
            body.enabled = false;
            walker.transform.position = P(-190,-204);
            body.enabled = true;

            void Walk(params Vector3[] points)
            {
                if (Vector3.Distance(walker.transform.position, points[0]) > .25f)
                    throw new InvalidOperationException("South crossing route discontinuous");
                for (var leg = 1; leg < points.Length; leg++)
                {
                    var length = Vector3.Distance(points[leg-1],points[leg]);
                    var steps = Mathf.CeilToInt(length/.2f);
                    for (var step = 1; step <= steps; step++)
                    {
                        var target = Vector3.Lerp(points[leg-1], points[leg],
                            (float)step/steps);
                        body.Move(target-walker.transform.position+Vector3.down*.01f);
                        if (Vector2.Distance(new Vector2(target.x,target.z),
                            new Vector2(walker.transform.position.x,
                                walker.transform.position.z)) > .18f)
                            throw new InvalidOperationException("South crossing blocked at " +
                                walker.transform.position + " toward " + target);
                        if (!Physics.RaycastAll(walker.transform.position+
                            Vector3.up*.55f,Vector3.down,1.5f).Any(hit =>
                            hit.normal.y>.65f && hit.collider.GetComponent<Renderer>()))
                            throw new InvalidOperationException("South crossing unsupported at " +
                                walker.transform.position);
                    }
                    distance += length;
                }
            }

            void Read(int index, string destination)
            {
                walker.enabled = true;
                var guide = guides[index];
                var opened = guide.Use() && guide.IsOpen && walker.MovementLocked;
                var linked = guide.Report().Contains(destination) &&
                    guide.Report().Contains(match.Status);
                var closed = guide.Use() && !guide.IsOpen && !walker.MovementLocked;
                walker.enabled = false;
                if (!opened || !linked || !closed)
                    throw new InvalidOperationException("South crossing route choice failed: " +
                        names[index]);
                stops.Add(names[index]);
            }

            try
            {
                Walk(P(-190,-204),P(-175,-204),P(-175,-190),P(-160,-190));
                Read(0,"咖啡厅");
                Walk(P(-160,-190),P(-68,-190),P(-68,-197),P(-68,-190),
                    P(0,-190));
                Walk(P(0,-190),P(-2,-190));
                Read(1,"核心公共回廊");
                Walk(P(-2,-190),P(0,-190),P(0,-208),P(0,-190),P(68,-190),
                    P(68,-197),P(68,-190),P(160,-190));
                Read(2,"温室");
                Walk(P(160,-190),P(190,-190),P(190,-205),P(198,-208),
                    P(209,-208));
                if (Vector3.Distance(walker.transform.position,P(209,-208))>.2f ||
                    cafe.StableId != "east-lounge-cafe-01")
                    throw new InvalidOperationException("South crossing did not reach cafe");
                Walk(P(209,-208),P(198,-208),P(190,-205),P(190,-190),
                    P(160,-190),P(80,-190),P(0,-190),P(-80,-190),
                    P(-160,-190),P(-175,-190),P(-175,-204),P(-190,-204));
                if (Vector3.Distance(walker.transform.position,P(-190,-204))>.2f ||
                    greenhouse.StableId != "south-greenhouse-veggie-01")
                    throw new InvalidOperationException("South crossing did not return to garden");
                return new JObject { ["roundTripMeters"] = Math.Round(distance,1),
                    ["guidesOpened"] = stops, ["gardenReturned"] = true,
                    ["cafeReached"] = true };
            }
            finally { walker.enabled = previousEnabled; }
        }

        public static JObject RunTour(bool persist)
        {
            var scene = SceneManager.GetActiveScene();
            var w4m = scene.name == "BlackHoleStationSoutheastCafeW4M" ||
                scene.name == "BlackHoleStationSouthCrossingW4N" ||
                scene.name == "BlackHoleStationPublicMatchNoticeW4O" ||
                scene.name == "BlackHoleStationSouthGardenLoopW4P";
            var w4l = w4m || scene.name == "BlackHoleStationDistrictRingBaysW4L";
            var w4k = w4l || scene.name == "BlackHoleStationOuterRingCanopyW4K";
            var w4j = w4k || scene.name == "BlackHoleStationGreenhousePressureW4J";
            var w4i = w4j || scene.name == "BlackHoleStationWestRingW4I";
            var w4h = w4i || scene.name == "BlackHoleStationLifeStreetW4H";
            var w4g = w4h || scene.name == "BlackHoleStationTourConnectorsW4G";
            if (!w4g && scene.name != "BlackHoleStationObservationBayW4F")
                throw new InvalidOperationException("Open W4F through W4P for tour");
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var body = walker ? walker.GetComponent<CharacterController>() : null;
            var save = FindFirstObjectByType<StationWorldSave>();
            var archive = FindFirstObjectByType<StationResearchDesk>();
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            var cafe = FindFirstObjectByType<StationCafeMoment>();
            var gate = FindFirstObjectByType<StationCoreEastGate>();
            var match = FindFirstObjectByType<ArenaStationLiveMatch>();
            var northGuide = w4g ? GameObject.Find("North ring junction route console")?
                .GetComponent<StationArrivalGuide>() : null;
            var southeastBoard = w4h ? GameObject.Find("Southeast civic match board")?
                .GetComponent<StationArrivalGuide>() : null;
            var cargo = FindObjectsByType<StationDockCargoService>(
                FindObjectsSortMode.None).Single(x=>x.StableId=="north-dock-left");
            var residents = FindObjectsByType<StationResidentRoutine>(
                FindObjectsSortMode.None);
            var vestibules = w4j ? FindObjectsByType<StationPressureVestibule>(
                FindObjectsSortMode.None) : Array.Empty<StationPressureVestibule>();
            var northVestibule = vestibules.FirstOrDefault(x =>
                x.StableId == "south-greenhouse-north");
            var southVestibule = vestibules.FirstOrDefault(x =>
                x.StableId == "south-greenhouse-south");
            var districtBoards = w4l ? FindObjectsByType<StationDistrictStatusBoard>(
                FindObjectsSortMode.None) : Array.Empty<StationDistrictStatusBoard>();
            if (!body || !save || !archive || !greenhouse || !cafe || !gate ||
                !match || walker.ThirdPersonMode || residents.Length!=6 ||
                archive.Match!=match || cafe.StableId!="east-lounge-cafe-01" ||
                (w4g && (!northGuide || northGuide.Walker!=walker ||
                    northGuide.Match!=match)) ||
                (w4h && (!southeastBoard || southeastBoard.Walker!=walker ||
                    southeastBoard.Match!=match)) ||
                greenhouse.StableId!="south-greenhouse-veggie-01" ||
                (w4j && (vestibules.Length != 2 || !northVestibule ||
                    !southVestibule || northVestibule.RoomOpen ||
                    northVestibule.StreetOpen || southVestibule.RoomOpen ||
                    southVestibule.StreetOpen ||
                    northVestibule.Walker != walker ||
                    southVestibule.Walker != walker)) ||
                (w4l && (districtBoards.Length != 4 ||
                    districtBoards.Any(board => board.Walker != walker ||
                        board.Match != match))))
                throw new InvalidOperationException("District integrations missing");

            var greenhouseEnvelopeClosed = false;
            if (w4j)
            {
                var center = new Vector3(-190, 1.7f, -190);
                bool Has(string name, Vector3 direction) =>
                    Physics.RaycastAll(center, direction, 20).Any(hit =>
                        hit.collider.name == name);
                var roof = GameObject.Find("Greenhouse roof")?
                    .GetComponent<Renderer>();
                greenhouseEnvelopeClosed = roof && roof.sharedMaterial &&
                    roof.sharedMaterial.name == "P3-pressure-window" &&
                    Has(roof.name, Vector3.up) &&
                    Has(northVestibule.RoomDoor.name, Vector3.forward) &&
                    Has(southVestibule.RoomDoor.name, Vector3.back) &&
                    Has("Greenhouse west wall", Vector3.left) &&
                    Has("Greenhouse east wall", Vector3.right);
                if (!greenhouseEnvelopeClosed)
                    throw new InvalidOperationException("Greenhouse boundary is open");
            }

            var ringRoofHits = 0;
            var ringInnerHits = 0;
            var ringOuterHits = 0;
            var junctionWindowHits = 0;
            if (w4k)
            {
                var ring = GameObject.Find(
                    "Outer ring - four districts connect without the core");
                if (!ring || !GameObject.Find("Outer ring framed canopy W4K"))
                    throw new InvalidOperationException("Outer ring canopy missing");
                Physics.SyncTransforms();
                for (var i = 0; i < 48; i++)
                {
                    var floor = ring.transform.Find(
                        "Outer promenade segment " + i + " floor");
                    if (!floor) throw new InvalidOperationException("Ring floor missing");
                    var eye = floor.position + Vector3.up * 1.7f;
                    if (Physics.RaycastAll(eye, Vector3.up, 10).Any(hit =>
                        hit.collider.name == "Outer ring canopy " + i)) ringRoofHits++;
                    if (Physics.RaycastAll(eye, -floor.right, w4l ? 11 : 6).Any(hit =>
                        hit.collider.name == "Outer ring side window " + i + " -1"))
                        ringInnerHits++;
                    if (Physics.RaycastAll(eye, floor.right, 6).Any(hit =>
                        hit.collider.name == "Outer ring side window " + i + " 1"))
                        ringOuterHits++;
                }
                for (var i = 0; i < 48; i += 6)
                {
                    var direction = new Vector3(Mathf.Cos(i * Mathf.PI / 24),
                        0, Mathf.Sin(i * Mathf.PI / 24));
                    var eye = direction * 330 + Vector3.up * 1.7f;
                    foreach (var side in new[] { -1, 1 })
                        junctionWindowHits += Physics.RaycastAll(eye,
                            direction * side, 8).Count(hit =>
                            hit.collider.name.StartsWith("Outer ring side window"));
                }
                if (ringRoofHits != 48 || ringInnerHits != 48 ||
                    ringOuterHits != 48 || junctionWindowHits != 0)
                    throw new InvalidOperationException("Outer ring canopy or junction gap incomplete");
            }

            var segments = new JArray();
            var total = 0f;
            var wasEnabled = walker.enabled;
            walker.enabled = false;
            body.enabled = false;
            walker.transform.position = P(210,180);
            body.enabled = true;

            void Walk(string name,Vector3[] points)
            {
                if (Vector3.Distance(walker.transform.position,points[0])>.25f)
                    throw new InvalidOperationException(name + " discontinuous");
                var distance=0f;
                for(var leg=1;leg<points.Length;leg++)
                {
                    var from=points[leg-1];
                    var to=points[leg];
                    var length=Vector3.Distance(from,to);
                    var steps=Mathf.CeilToInt(length/.2f);
                    for(var step=1;step<=steps;step++)
                    {
                        var target=Vector3.Lerp(from,to,(float)step/steps);
                        body.Move(target-walker.transform.position+Vector3.down*.01f);
                        if(Vector2.Distance(new Vector2(target.x,target.z),
                            new Vector2(walker.transform.position.x,
                                walker.transform.position.z))>.18f)
                            throw new InvalidOperationException(name+" blocked at "+
                                walker.transform.position+" toward "+target);
                        if(!Physics.RaycastAll(walker.transform.position+
                            Vector3.up*.55f,Vector3.down,1.5f).Any(hit=>
                            hit.normal.y>.65f && hit.collider.GetComponent<Renderer>()))
                            throw new InvalidOperationException(name+" unsupported at "+
                                walker.transform.position);
                    }
                    distance+=length;
                }
                total+=distance;
                segments.Add(new JObject { ["route"]=name,
                    ["meters"]=Math.Round(distance,1),
                    ["end"]=walker.transform.position.ToString() });
            }

            void Arc(string name,int first,int last)
            {
                var points=new Vector3[last-first+1];
                for(var i=first;i<=last;i++) points[i-first]=Ring(i);
                Walk(name,points);
            }

            var districtBayVisits = 0;
            void ArcWithBay(string name, int first, int last, int index)
            {
                if (!w4l) { Arc(name, first, last); return; }
                Arc(name + " before bay", first, index);
                var floor = GameObject.Find("Outer promenade segment " + index + " floor")
                    .transform;
                var middle = P(floor.position.x, floor.position.z);
                var inside = floor.position - floor.right * 6.7f;
                var stop = P(inside.x, inside.z);
                Walk(name + " bay approach", new[] { Ring(index), middle, stop });
                var id = index == 9 ? "ring-port-status" :
                    index == 21 ? "ring-research-status" :
                    index == 33 ? "ring-garden-status" : "ring-civic-status";
                var board = districtBoards.SingleOrDefault(x => x.StableId == id);
                if (!board || board.Source !=
                    (StationDistrictStatusBoard.District)districtBayVisits)
                    throw new InvalidOperationException("District bay board missing: " + id);
                walker.enabled = true;
                var opened = board.Use() && board.IsOpen && walker.MovementLocked;
                var report = board.Report();
                var linked = index == 9 ? report.Contains("货箱正在移动") :
                    index == 21 ? report.Contains(archive.Report()) :
                    index == 33 ? report.Contains("已完成照料：" +
                        greenhouse.CareCount) :
                    report.Contains("咖啡已供应：" + cafe.ServedCount) &&
                        report.Contains(match.Status);
                var closed = board.Use() && !board.IsOpen && !walker.MovementLocked;
                if (!opened || !linked || !closed)
                    throw new InvalidOperationException("District bay interaction failed: " + id);
                walker.enabled = false;
                Walk(name + " bay return", new[] { stop, middle, Ring(index + 1) });
                Arc(name + " after bay", index + 1, last);
                districtBayVisits++;
            }

            var cafeApronX = w4g ? 219.5f : 217.5f;
            var cafeSouthJoinX = w4g ? 220f : 218f;
            var cafeSouthJoinZ = w4g ? -220f : -218f;
            var gardenWindowHits = 0;
            var researchWindowHits = 0;
            var southeastWindowHits = 0;
            var westWindowHits = 0;
            var greenhouseInterlockVerified = false;
            var southeastBoardOpened = false;
            try
            {
                Walk("arrival to port worksite",new[] {
                    P(210,180),P(190,180),P(185,180),P(185,212),P(178,212)
                });
                var cargoTask="started";
                if(cargo.AtInspection && !cargo.Inspected)
                {
                    Walk("port cargo inspection",new[] {P(178,212),P(178,190)});
                    if(!cargo.Inspect())
                        throw new InvalidOperationException("Port cargo inspection unavailable");
                    Walk("port cargo terminal return",new[] {P(178,190),P(178,212)});
                    cargoTask="inspected-and-returned";
                }
                walker.enabled=true;
                var cargoStarted=cargo.Use() && cargo.Moving;
                if(!cargoStarted) throw new InvalidOperationException("Port cargo unavailable");
                walker.enabled=false;
                Walk("port to outer ring",new[] {
                    P(178,212),P(185,212),P(185,190),P(190,190),
                    P(190,208),P(210,208),Ring(6)
                });
                if(w4g)
                {
                    ArcWithBay("ring northeast to north junction",6,12,9);
                    Walk("north junction stop",new[] {
                        Ring(12),P(8,330),P(8,335)
                    });
                    walker.enabled=true;
                    var guideOpened=northGuide.Use() && northGuide.IsOpen &&
                        northGuide.Report().Contains("西北科研") &&
                        northGuide.Report().Contains(match.Status);
                    var guideClosed=northGuide.Use() && !northGuide.IsOpen;
                    if(!guideOpened || !guideClosed)
                        throw new InvalidOperationException("North junction guide unavailable");
                    walker.enabled=false;
                    Walk("north junction return",new[] {
                        P(8,335),P(8,330),Ring(12)
                    });
                    Arc("ring north junction to northwest",12,18);
                }
                else Arc("ring northeast to northwest",6,18);
                Walk("northwest archive approach",new[] {
                    Ring(18),P(-218,217),P(-190,217),P(-190,205),P(-204,205)
                });
                walker.enabled=true;
                var archiveOpened=archive.Use() && archive.IsOpen &&
                    archive.Report().Contains(match.Status);
                var archiveClosed=archive.Use() && !archive.IsOpen;
                if(!archiveOpened || !archiveClosed)
                    throw new InvalidOperationException("Northwest archive unavailable");
                walker.enabled=false;
                if(w4g)
                {
                    Walk("northwest lower observation bay",new[] {
                        P(-204,205),P(-190,205),P(-190,217),P(-218,217),
                        P(-235,235),P(-242,242),ResearchRamp(-244),
                        ResearchRamp(-248),ResearchRamp(-252),
                        ResearchRamp(-258),ResearchRamp(-262),
                        new Vector3(-263,-2.94f,242),
                        new Vector3(-263,-2.94f,238),
                        new Vector3(-259,-2.94f,238)
                    });
                    var blackHole = new Vector3(0,-145,0);
                    walker.Face(blackHole);
                    var eye = walker.View.transform.position;
                    foreach(var hit in Physics.RaycastAll(eye,
                        (blackHole-eye).normalized,Vector3.Distance(eye,blackHole)))
                    {
                        var renderer = hit.collider.GetComponent<Renderer>();
                        if(renderer && renderer.sharedMaterial &&
                            renderer.sharedMaterial.name=="P3-pressure-window")
                            researchWindowHits++;
                        else throw new InvalidOperationException(
                            "Research lookout blocked by "+hit.collider.name);
                    }
                    if(researchWindowHits==0)
                        throw new InvalidOperationException("Research lookout window missing");
                    Walk("northwest lookout return",new[] {
                        new Vector3(-259,-2.94f,238),
                        new Vector3(-263,-2.94f,238),
                        new Vector3(-263,-2.94f,242),ResearchRamp(-262),
                        ResearchRamp(-258),ResearchRamp(-252),
                        ResearchRamp(-248),ResearchRamp(-244),
                        P(-242,242),P(-235,235),P(-218,217),Ring(18)
                    });
                }
                else Walk("northwest return to ring",new[] {
                    P(-204,205),P(-190,205),P(-190,217),P(-218,217),Ring(18)
                });
                if(w4i)
                {
                    ArcWithBay("ring northwest to west junction",18,24,21);
                    Walk("west ring lower lookout",new[] {
                        Ring(24),P(-332,0),WestRamp(-336),WestRamp(-340),
                        WestRamp(-344),WestRamp(-348),WestRamp(-352),
                        new Vector3(-352,-2.94f,8),
                        new Vector3(-351,-2.94f,8)
                    });
                    var blackHole = new Vector3(0,-145,0);
                    walker.Face(blackHole);
                    var eye = walker.View.transform.position;
                    foreach(var hit in Physics.RaycastAll(eye,
                        (blackHole-eye).normalized,Vector3.Distance(eye,blackHole)))
                    {
                        var renderer = hit.collider.GetComponent<Renderer>();
                        if(renderer && renderer.sharedMaterial &&
                            renderer.sharedMaterial.name=="P3-pressure-window")
                            westWindowHits++;
                        else throw new InvalidOperationException(
                            "West ring lookout blocked by "+hit.collider.name);
                    }
                    if(westWindowHits==0)
                        throw new InvalidOperationException("West ring window missing");
                    Walk("west ring lookout return",new[] {
                        new Vector3(-351,-2.94f,8),
                        new Vector3(-352,-2.94f,8),WestRamp(-352),
                        WestRamp(-348),WestRamp(-344),WestRamp(-340),
                        WestRamp(-336),P(-332,0),Ring(24)
                    });
                    Arc("ring west junction to southwest",24,30);
                }
                else Arc("ring northwest to southwest",18,30);
                if(w4g)
                {
                    Walk("southwest black-hole lookout",new[] {
                        Ring(30),P(-235,-235),P(-244,-235),
                        P(-250,-235),P(-250,-250)
                    });
                    var blackHole = new Vector3(0,-145,0);
                    walker.Face(blackHole);
                    var eye = walker.View.transform.position;
                    foreach(var hit in Physics.RaycastAll(eye,
                        (blackHole-eye).normalized,Vector3.Distance(eye,blackHole)))
                    {
                        var renderer = hit.collider.GetComponent<Renderer>();
                        if(renderer && renderer.sharedMaterial &&
                            renderer.sharedMaterial.name=="P3-pressure-window")
                            gardenWindowHits++;
                        else throw new InvalidOperationException(
                            "Garden lookout blocked by "+hit.collider.name);
                    }
                    if(gardenWindowHits==0)
                        throw new InvalidOperationException("Garden lookout window missing");
                    Walk("southwest lookout return",new[] {
                        P(-250,-250),P(-250,-235),P(-244,-235),
                        P(-235,-235),Ring(30)
                    });
                }
                if(w4j)
                {
                    Walk("southwest greenhouse north entrance",new[] {
                        Ring(30),P(-215,-205),P(-215,-170),
                        P(-190,-170),P(-190,-176)
                    });
                    if(!northVestibule.UseStreet())
                        throw new InvalidOperationException("Greenhouse north outer door unavailable");
                    Walk("greenhouse north vestibule",new[] {
                        P(-190,-176),P(-190,-181)
                    });
                    if(northVestibule.UseRoom() ||
                        !northVestibule.UseStreet() ||
                        !northVestibule.UseRoom())
                        throw new InvalidOperationException("Greenhouse north interlock failed");
                    Walk("greenhouse north room entry",new[] {
                        P(-190,-181),P(-190,-185)
                    });
                    if(!northVestibule.UseRoom())
                        throw new InvalidOperationException("Greenhouse north inner door stayed open");
                    Walk("greenhouse care approach",new[] {
                        P(-190,-185),P(-190,-186)
                    });
                }
                else Walk("southwest greenhouse approach",new[] {
                    Ring(30),P(-215,-205),P(-215,-170),P(-190,-170),P(-190,-186)
                });
                walker.enabled=true;
                var careBefore=greenhouse.CareCount;
                for(var attempt=0;attempt<3 && greenhouse.CareCount==careBefore;attempt++)
                    if(!greenhouse.Use())
                        throw new InvalidOperationException("Southwest greenhouse unavailable");
                if(greenhouse.CareCount!=careBefore+1)
                    throw new InvalidOperationException("Southwest care did not complete");
                walker.enabled=false;
                if(w4j)
                {
                    Walk("greenhouse west aisle to south door",new[] {
                        P(-190,-186),P(-200,-186),P(-200,-195),P(-190,-195)
                    });
                    if(!southVestibule.UseRoom())
                        throw new InvalidOperationException("Greenhouse south inner door unavailable");
                    Walk("greenhouse south vestibule",new[] {
                        P(-190,-195),P(-190,-199.25f)
                    });
                    if(southVestibule.UseStreet() ||
                        !southVestibule.UseRoom() ||
                        !southVestibule.UseStreet())
                        throw new InvalidOperationException("Greenhouse south interlock failed");
                    Walk("greenhouse south garden exit",new[] {
                        P(-190,-199.25f),P(-190,-204)
                    });
                    if(!southVestibule.UseStreet())
                        throw new InvalidOperationException("Greenhouse south outer door stayed open");
                    Walk("southwest garden return to ring",new[] {
                        P(-190,-204),P(-215,-205),Ring(30)
                    });
                    greenhouseInterlockVerified =
                        !northVestibule.RoomOpen && !northVestibule.StreetOpen &&
                        !southVestibule.RoomOpen && !southVestibule.StreetOpen;
                    if(!greenhouseInterlockVerified)
                        throw new InvalidOperationException("Greenhouse door left open");
                }
                else Walk("southwest return to ring",new[] {
                    P(-190,-186),P(-190,-170),P(-215,-170),P(-215,-205),Ring(30)
                });
                ArcWithBay("ring southwest to southeast",30,42,33);
                Walk("southeast cafe counter",new[] {
                    Ring(42),P(cafeSouthJoinX,cafeSouthJoinZ),
                    P(cafeApronX,-190),P(190,-190),P(190,-205),
                    P(198,-208),P(209,-208)
                });
                walker.enabled=true;
                var servedBefore=cafe.ServedCount;
                var drunkBefore=cafe.DrunkCount;
                if(!cafe.Use() || cafe.ServedCount!=servedBefore+1)
                    throw new InvalidOperationException("Cafe counter unavailable");
                walker.enabled=false;
                Walk("cafe seat",new[] {P(209,-208),P(209,-205)});
                walker.enabled=true;
                var standingViewPosition=walker.View.transform.localPosition;
                var standingViewRotation=walker.View.transform.localRotation;
                var sat=cafe.Use() && cafe.SeatedSeatIndex>=0;
                var drank=cafe.Use() && cafe.DrunkCount==drunkBefore+1;
                var stood=cafe.Use() && cafe.SeatedSeatIndex<0 && walker.enabled;
                if(!sat || !drank || !stood)
                    throw new InvalidOperationException("Cafe visit incomplete");
                if(Vector3.Distance(walker.View.transform.localPosition,
                       standingViewPosition)>.001f ||
                   Quaternion.Angle(walker.View.transform.localRotation,
                       standingViewRotation)>.1f)
                    throw new InvalidOperationException("Cafe standing camera not restored");
                walker.enabled=false;
                if(w4g)
                {
                    Walk("southeast lower lookout",new[] {
                        P(209,-205),P(209,-208),P(198,-208),P(190,-205),
                        P(190,-240),P(190,-247),P(175,-255),P(175,-258),
                        SoutheastRamp(-262),SoutheastRamp(-266),
                        SoutheastRamp(-270),
                        new Vector3(175,-2.94f,-282),
                        new Vector3(175,-2.94f,-290),
                        new Vector3(175,-2.94f,-298),
                        new Vector3(172,-2.94f,-298),
                        new Vector3(172,-2.94f,-292)
                    });
                    var blackHole = new Vector3(0,-145,0);
                    walker.Face(blackHole);
                    var eye = walker.View.transform.position;
                    foreach(var hit in Physics.RaycastAll(eye,
                        (blackHole-eye).normalized,Vector3.Distance(eye,blackHole)))
                    {
                        var renderer = hit.collider.GetComponent<Renderer>();
                        if(renderer && renderer.sharedMaterial &&
                            renderer.sharedMaterial.name=="P3-pressure-window")
                            southeastWindowHits++;
                        else throw new InvalidOperationException(
                            "Southeast lookout blocked by "+hit.collider.name);
                    }
                    if(southeastWindowHits==0)
                        throw new InvalidOperationException("Southeast lookout window missing");
                    Walk("southeast lookout return",new[] {
                        new Vector3(172,-2.94f,-292),
                        new Vector3(172,-2.94f,-298),
                        new Vector3(175,-2.94f,-298),
                        new Vector3(175,-2.94f,-290),
                        new Vector3(175,-2.94f,-282),SoutheastRamp(-270),
                        SoutheastRamp(-266),
                        SoutheastRamp(-262),P(175,-258),P(175,-255),
                        P(190,-247),P(190,-240),P(190,-205),
                        P(198,-208),P(209,-208),P(209,-205)
                    });
                }
                if(w4h)
                {
                    Walk("southeast match pavilion",new[] {
                        P(209,-205),P(209,-208),P(198,-208),P(190,-205),
                        P(190,-190),P(174,-190),P(174,-207)
                    });
                    walker.enabled=true;
                    southeastBoardOpened=southeastBoard.Use() && southeastBoard.IsOpen &&
                        southeastBoard.Report().Contains("观景咖啡厅") &&
                        southeastBoard.Report().Contains(match.Status);
                    var boardClosed=southeastBoard.Use() && !southeastBoard.IsOpen;
                    if(!southeastBoardOpened || !boardClosed)
                        throw new InvalidOperationException("Southeast match board unavailable");
                    walker.enabled=false;
                    Walk("southeast match pavilion return",new[] {
                        P(174,-207),P(174,-190),P(190,-190),P(190,-205),
                        P(198,-208),P(209,-208),P(209,-205)
                    });
                }
                Walk("southeast return to ring",new[] {
                    P(209,-205),P(209,-208),P(198,-208),P(190,-205),
                    P(190,-190),P(cafeApronX,-190),
                    P(cafeSouthJoinX,cafeSouthJoinZ),Ring(42)
                });
                ArcWithBay("ring southeast to northeast",42,54,45);
                Walk("return via east spine to core gate",new[] {
                    Ring(54),P(210,208),P(190,208),P(190,190),
                    P(190,180),P(190,0),P(124,0)
                });
                walker.enabled=true;
                var gateOpened=gate.Use() && gate.IsOpen;
                if(!gateOpened) throw new InvalidOperationException("Core gate unavailable");
                walker.enabled=false;
                Walk("core return",new[] {
                    P(124,0),P(116,0),P(112,0),P(112,6),
                    P(95,6),P(75,6),P(60,6)
                });
                walker.enabled=true;
                var saved=persist && save.SaveNow();
                if(persist && !saved) throw new InvalidOperationException("Tour save failed");
                return new JObject {
                    ["firstPerson"]=true,["residentCount"]=residents.Length,
                    ["ringSegments"]=48,["routeSegments"]=segments.Count,
                    ["walkedMeters"]=Math.Round(total,1),
                    ["estimatedUninterruptedWalkMinutesAt3_5mps"]=
                        Math.Round(total/3.5f/60,1),
                    ["cargoTask"]=cargoTask,["cargoStarted"]=cargoStarted,
                    ["archiveOpened"]=archiveOpened,
                    ["researchLookoutOpaqueClear"]=w4g && researchWindowHits>0,
                    ["researchWindowHits"]=researchWindowHits,
                    ["gardenLookoutOpaqueClear"]=w4g && gardenWindowHits>0,
                    ["gardenWindowHits"]=gardenWindowHits,
                    ["southeastLookoutOpaqueClear"]=w4g && southeastWindowHits>0,
                    ["southeastWindowHits"]=southeastWindowHits,
                    ["westLookoutOpaqueClear"]=w4i && westWindowHits>0,
                    ["westWindowHits"]=westWindowHits,
                    ["ringRoofHits"]=ringRoofHits,
                    ["ringInnerWindowHits"]=ringInnerHits,
                    ["ringOuterWindowHits"]=ringOuterHits,
                    ["junctionWindowHits"]=junctionWindowHits,
                    ["districtBayVisits"]=districtBayVisits,
                    ["greenhouseEnvelopeClosed"]=greenhouseEnvelopeClosed,
                    ["greenhouseInterlockVerified"]=greenhouseInterlockVerified,
                    ["southeastBoardOpened"]=southeastBoardOpened,
                    ["careDelta"]=greenhouse.CareCount-careBefore,
                    ["cafeServedDelta"]=cafe.ServedCount-servedBefore,
                    ["cafeDrunkDelta"]=cafe.DrunkCount-drunkBefore,
                    ["coreGateOpened"]=gateOpened,["saved"]=saved,
                    ["end"]=walker.transform.position.ToString(),
                    ["segments"]=segments
                };
            }
            finally
            {
                if(cafe && cafe.SeatedSeatIndex>=0) cafe.Stand();
                if(archive && archive.IsOpen) archive.Use();
                if(walker) walker.enabled=wasEnabled;
            }
        }
    }
}
