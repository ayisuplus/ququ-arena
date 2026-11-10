// Read-only Editor survey for layout discussion. Does not modify or save scenes.
var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
if (scene.name != "BlackHoleStationEcologicalGardenV014" || UnityEditor.EditorApplication.isPlaying)
    throw new System.Exception("Expected the existing ecological candidate in Edit Mode.");
var roots = scene.GetRootGameObjects();
var all = roots.SelectMany(g => g.GetComponentsInChildren<UnityEngine.Transform>(true)).ToArray();
float[] V(UnityEngine.Vector3 v) => new[] { v.x, v.y, v.z };
string Path(UnityEngine.Transform t) => t.parent == null ? t.name : Path(t.parent) + "/" + t.name;
object Row(UnityEngine.Transform t)
{
    var rs = t.GetComponentsInChildren<UnityEngine.Renderer>(true)
        .Where(r => r.enabled && r.gameObject.activeInHierarchy && !(r is UnityEngine.ParticleSystemRenderer)).ToArray();
    var b = new UnityEngine.Bounds(t.position, UnityEngine.Vector3.zero);
    if (rs.Length > 0) { b = rs[0].bounds; foreach (var r in rs.Skip(1)) b.Encapsulate(r.bounds); }
    return new { name = t.name, parent = t.parent == null ? null : Path(t.parent), path = Path(t), id = UnityEditor.GlobalObjectId.GetGlobalObjectIdSlow(t.gameObject).ToString(),
        active = t.gameObject.activeInHierarchy, position = V(t.position), yaw = t.eulerAngles.y,
        min = V(b.min), max = V(b.max), renderers = rs.Length, children = t.childCount,
        components = t.GetComponents<UnityEngine.Component>().Where(c => c != null).Select(c => c.GetType().Name).ToArray() };
}
var owners = new[] { "P2 station graybox", "P2W world connectivity graybox", "Four district W1 connected world graybox",
    "V014 civic buildings", "V014 north south civic buildings", "V014 balanced civic buildings", "V014 guest lodges" };
var groups = all.Where(t => t.parent == null || (t.parent != null && owners.Contains(t.parent.name)) ||
    t.name == "Southeast public cafe and street stop" || t.name == "South public greenhouse graybox" ||
    t.name == "Northwest public archive and observation pavilion" ||
    (t.parent != null && t.parent.name == "Concept outer habitat volume study" &&
        (t.name.Contains("roof") || t.name.Contains("crown") || t.name.Contains("drum")))).Select(Row).ToArray();
var report = new { scene = scene.path, dirty = scene.isDirty, playing = UnityEditor.EditorApplication.isPlaying,
    roots = roots.Length, transforms = all.Length, groups,
    rooms = all.SelectMany(t => t.GetComponents<QuQu.StationRoomIdentity>()).Select(r => new { r.RoomId, path = Path(r.transform), position = V(r.transform.position) }).ToArray(),
    seats = all.SelectMany(t => t.GetComponents<QuQu.StationGardenSeat>()).Where(s => s.gameObject.activeInHierarchy)
        .Select(s => new { s.StableId, s.Place, path = Path(s.transform), position = V(s.transform.position) }).ToArray(),
    residents = all.SelectMany(t => t.GetComponents<QuQu.StationResidentRoutine>()).Select(r => new { r.ResidentId, roomId = r.Room.RoomId, r.DestinationName }).ToArray() };
System.IO.File.WriteAllText("../docs/黑洞空间站升级方案/v014/layout-organization-20261001/inventory.json", Newtonsoft.Json.JsonConvert.SerializeObject(report, Newtonsoft.Json.Formatting.Indented));
return new { report.scene, report.dirty, report.playing, report.roots, report.transforms, groups = groups.Length, seats = report.seats.Length };
