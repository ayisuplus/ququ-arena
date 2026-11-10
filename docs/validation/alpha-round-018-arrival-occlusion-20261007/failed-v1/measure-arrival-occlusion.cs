// Run through Unity Pipeline eval_file. This is an edit-mode diagnostic, not a Player replay.
var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
if (scene.name != "BlackHoleStationDistrictsV019" || scene.isDirty || UnityEditor.EditorApplication.isPlaying || UnityEditor.EditorApplication.isCompiling)
    throw new System.Exception("Saved V019 Edit required");
const string output = "../docs/validation/alpha-round-018-arrival-occlusion-20261007/measurement";
if (System.IO.Directory.Exists(output)) throw new System.Exception("Preserve existing measurement; use a new output path");
var frame = UnityEngine.GameObject.Find("V015 package - research main and entry canopy").transform;
var research = UnityEngine.GameObject.Find("V019 research court architecture").transform;
var canopy = UnityEngine.GameObject.Find("V015 public research and reading courts").transform.Find("Research folded linking canopy");
var source = UnityEngine.GameObject.Find("Player eye camera").GetComponent<UnityEngine.Camera>();
var method = typeof(UnityEditor.HandleUtility).GetMethod("IntersectRayMesh", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
float[] V(UnityEngine.Vector3 p) => new[] { p.x, p.y, p.z };
float[] M(UnityEngine.Matrix4x4 m) => System.Linq.Enumerable.Range(0, 16).Select(i => m[i]).ToArray();
string Path(UnityEngine.Transform t) => t.parent ? Path(t.parent) + "/" + t.name : t.name;
object Pose(UnityEngine.Transform t) => new { path = Path(t), position = V(t.position), localPosition = V(t.localPosition), euler = V(t.eulerAngles), matrixColumnMajor = M(t.localToWorldMatrix) };
string Id(UnityEngine.Object o) => UnityEditor.GlobalObjectId.GetGlobalObjectIdSlow(o).ToString();
string Sha(string path) { using (var h = System.Security.Cryptography.SHA256.Create()) return System.BitConverter.ToString(h.ComputeHash(System.IO.File.ReadAllBytes(path))).Replace("-", "").ToLowerInvariant(); }
var hashCache = new System.Collections.Generic.Dictionary<string, string>();
object Asset(UnityEngine.Object o) {
    var path = UnityEditor.AssetDatabase.GetAssetPath(o);
    if (System.IO.File.Exists(path) && !hashCache.ContainsKey(path)) hashCache[path] = Sha(path);
    return new { path, guid = UnityEditor.AssetDatabase.AssetPathToGUID(path), sha256 = hashCache.ContainsKey(path) ? hashCache[path] : null };
}
object Material(UnityEngine.Material m) => m == null ? null : new { m.name, asset = Asset(m), shader = m.shader.name, queue = m.renderQueue,
    surface = m.HasProperty("_Surface") ? (float?)m.GetFloat("_Surface") : null,
    alphaClip = m.HasProperty("_AlphaClip") ? (float?)m.GetFloat("_AlphaClip") : null,
    cull = m.HasProperty("_Cull") ? (float?)m.GetFloat("_Cull") : null };
bool Intersect(UnityEngine.Ray ray, UnityEngine.Mesh mesh, UnityEngine.Matrix4x4 matrix, out UnityEngine.RaycastHit hit) {
    object[] args = { ray, mesh, matrix, null };
    bool ok = (bool)method.Invoke(null, args); hit = ok ? (UnityEngine.RaycastHit)args[3] : default; return ok;
}
var temporary = new UnityEngine.GameObject("R18 temporary arrival geometry camera") { hideFlags = UnityEngine.HideFlags.HideAndDontSave };
var probeMesh = new UnityEngine.Mesh { hideFlags = UnityEngine.HideFlags.HideAndDontSave };
UnityEngine.RenderTexture rt = null; UnityEngine.Texture2D pixels = null;
var previousActive = UnityEngine.RenderTexture.active;
var rootsBefore = scene.rootCount - 1;
object result;
try {
    var cam = temporary.AddComponent<UnityEngine.Camera>(); cam.CopyFrom(source); cam.enabled = false;
    var sourceData = source.GetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>();
    var cameraData = temporary.AddComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>();
    UnityEditor.EditorJsonUtility.FromJsonOverwrite(UnityEditor.EditorJsonUtility.ToJson(sourceData), cameraData);
    cam.fieldOfView = 65; cam.aspect = 1.6f; cam.transform.position = frame.TransformPoint(new UnityEngine.Vector3(24, 1.7f, 0));
    cam.transform.LookAt(frame.TransformPoint(new UnityEngine.Vector3(-5, 6, -10)));
    var cameraBefore = cam.transform.localToWorldMatrix; var researchBefore = research.localToWorldMatrix; var canopyBefore = canopy.localToWorldMatrix;
    var planes = UnityEngine.GeometryUtility.CalculateFrustumPlanes(cam);
    var renderers = UnityEngine.Object.FindObjectsByType<UnityEngine.MeshRenderer>(UnityEngine.FindObjectsSortMode.None)
        .Where(r => r.enabled && !r.forceRenderingOff && r.gameObject.activeInHierarchy && r.gameObject.scene == scene && (cam.cullingMask & (1 << r.gameObject.layer)) != 0)
        .Where(r => r.GetComponent<UnityEngine.MeshFilter>()?.sharedMesh != null && UnityEngine.GeometryUtility.TestPlanesAABB(planes, r.bounds)).ToArray();
    var meshes = renderers.Select(r => r.GetComponent<UnityEngine.MeshFilter>().sharedMesh).ToArray();
    var matrices = renderers.Select(r => r.localToWorldMatrix).ToArray();
    var vertices = meshes.Select(m => m.vertices).ToArray(); var triangles = meshes.Select(m => m.triangles).ToArray();
    var targetNames = new[] { "Research porcelain", "Research blue", "Research silver", "Research wood", "V019 rear wall finish" };
    var targetIndices = System.Linq.Enumerable.Range(0, renderers.Length).Where(i => renderers[i].transform.parent == research && targetNames.Contains(renderers[i].name)).ToArray();
    if (targetIndices.Length != targetNames.Length) throw new System.Exception("Expected five structural target meshes");
    object Hit(int i, UnityEngine.RaycastHit h, UnityEngine.Ray ray) {
        var mesh = meshes[i]; int submesh = -1;
        for (int s = 0; s < mesh.subMeshCount; s++) { var desc = mesh.GetSubMesh(s); if (h.triangleIndex * 3 >= desc.indexStart && h.triangleIndex * 3 < desc.indexStart + desc.indexCount) submesh = s; }
        var mats = renderers[i].sharedMaterials; var mat = submesh >= 0 && submesh < mats.Length ? mats[submesh] : null;
        int k = h.triangleIndex * 3; var normal = UnityEngine.Vector3.Cross(matrices[i].MultiplyVector(vertices[i][triangles[i][k + 1]] - vertices[i][triangles[i][k]]), matrices[i].MultiplyVector(vertices[i][triangles[i][k + 2]] - vertices[i][triangles[i][k]])).normalized;
        string surface = mat == null || !mat.HasProperty("_Surface") || !mat.HasProperty("_AlphaClip") ? "unknown" : mat.GetFloat("_AlphaClip") > 0 ? "alpha-clip-unknown" : mat.GetFloat("_Surface") > 0 || mat.renderQueue >= 3000 ? "transparent" : "opaque";
        bool front = UnityEngine.Vector3.Dot(normal, ray.direction) < 0;
        bool facingAccepted = mat != null && mat.HasProperty("_Cull") && (mat.GetFloat("_Cull") == 0 || (mat.GetFloat("_Cull") == 2 && front) || (mat.GetFloat("_Cull") == 1 && !front));
        var sharedLocal = canopy.parent.InverseTransformPoint(h.point);
        return new { renderer = i, h.distance, h.triangleIndex, submesh, point = V(h.point), researchLocal = V(research.InverseTransformPoint(h.point)), normal = V(normal), front, facingAccepted, surface,
            isCanopy = renderers[i].transform == canopy, angle = UnityEngine.Mathf.Atan2(-sharedLocal.z, sharedLocal.x) * UnityEngine.Mathf.Rad2Deg, radius = new UnityEngine.Vector2(sharedLocal.x, sharedLocal.z).magnitude };
    }
    // Calibrate the native helper's winding behavior instead of assuming backface culling.
    probeMesh.vertices = new[] { new UnityEngine.Vector3(-1,-1,0), new UnityEngine.Vector3(1,-1,0), new UnityEngine.Vector3(0,1,0) }; probeMesh.triangles = new[] { 0,1,2 }; probeMesh.RecalculateBounds();
    bool frontProbe = Intersect(new UnityEngine.Ray(UnityEngine.Vector3.forward, UnityEngine.Vector3.back), probeMesh, UnityEngine.Matrix4x4.identity, out var frontHit);
    bool backProbe = Intersect(new UnityEngine.Ray(UnityEngine.Vector3.back, UnityEngine.Vector3.forward), probeMesh, UnityEngine.Matrix4x4.identity, out var backHit);
    var rows = new System.Collections.Generic.List<object>(); int nonTarget = 0, belowUpper = 0;
    for (int y = 10; y < 1000; y += 20) for (int x = 10; x < 1600; x += 20) {
        var ray = cam.ViewportPointToRay(new UnityEngine.Vector3(x / 1600f, y / 1000f, 0));
        int target = -1; UnityEngine.RaycastHit targetHit = default; float distance = cam.farClipPlane;
        foreach (int i in targetIndices) if (renderers[i].bounds.IntersectRay(ray) && Intersect(ray, meshes[i], matrices[i], out var h) && h.distance < distance) { target = i; targetHit = h; distance = h.distance; }
        if (target < 0) { nonTarget++; continue; }
        float height = research.InverseTransformPoint(targetHit.point).y;
        if (height < 8.54f) { belowUpper++; continue; }
        var foreground = new System.Collections.Generic.List<(float distance, object hit)>();
        for (int i = 0; i < renderers.Length; i++) {
            if (!renderers[i].bounds.IntersectRay(ray, out float entry) || entry > distance || !Intersect(ray, meshes[i], matrices[i], out var h) || h.distance >= distance - .005f) continue;
            foreground.Add((h.distance, Hit(i, h, ray)));
        }
        rows.Add(new { x, y, origin = V(ray.origin), direction = V(ray.direction), target = Hit(target, targetHit, ray), band = height >= 13.2f ? "crown" : height >= 8.8f ? "upper" : "terrace-slab-edge", foreground = foreground.OrderBy(h => h.distance).Select(h => h.hit).ToArray() });
    }
    System.IO.Directory.CreateDirectory(output);
    rt = new UnityEngine.RenderTexture(1600, 1000, 24, UnityEngine.RenderTextureFormat.ARGB32); rt.Create(); cam.targetTexture = rt; cam.Render();
    UnityEngine.RenderTexture.active = rt; pixels = new UnityEngine.Texture2D(1600, 1000, UnityEngine.TextureFormat.RGB24, false); pixels.ReadPixels(new UnityEngine.Rect(0,0,1600,1000),0,0); pixels.Apply();
    System.IO.File.WriteAllBytes(output + "/arrival-edit-mode.png", pixels.EncodeToPNG()); cam.targetTexture = null;
    if (cameraBefore != cam.transform.localToWorldMatrix || researchBefore != research.localToWorldMatrix || canopyBefore != canopy.localToWorldMatrix || scene.isDirty || renderers.Where((r,i) => r.localToWorldMatrix != matrices[i]).Any()) throw new System.Exception("State changed during measurement");
    var ancestors = new System.Collections.Generic.List<object>();
    for (var t = frame.parent; t; t = t.parent) ancestors.Add(Pose(t));
    result = new { schema = 1, utc = System.DateTime.UtcNow.ToString("o"), mode = "current saved edit-mode; source-defined arrival; not R16 Player replay", scene = scene.path,
        camera = new { width = 1600, height = 1000, pose = Pose(cam.transform), cam.fieldOfView, cam.aspect, cam.nearClipPlane, cam.farClipPlane, cam.cullingMask, projectionColumnMajor = M(cam.projectionMatrix), worldToCameraColumnMajor = M(cam.worldToCameraMatrix), urp = Newtonsoft.Json.Linq.JObject.Parse(UnityEditor.EditorJsonUtility.ToJson(cameraData)) },
        phase = new { frame = Pose(frame), research = Pose(research), canopy = Pose(canopy), ancestors },
        calibration = new { frontProbe, backProbe, frontDistance = frontHit.distance, backDistance = backHit.distance },
        sampling = new { stepPixels = 20, offsetPixels = 10, rays = 4000, nonTarget, belowUpper, upperSamples = rows.Count, targetIndices, minimumHeight = 8.54f, epsilonMetres = .005f },
        renderers = renderers.Select((r,i) => new { index = i, path = Path(r.transform), id = Id(r), mesh = Asset(meshes[i]), meshes[i].vertexCount, matrixColumnMajor = M(matrices[i]), materials = r.sharedMaterials.Select(Material).ToArray() }).ToArray(),
        rows, limitations = new[] { "Sample counts, not visible pixel area", "Nearest native mesh hit only; rejected backface can hide farther front face", "Transparent/alpha-clip/unknown surfaces do not prove opaque obstruction", "Skinned/particle/line/terrain renderers excluded", "No gameplay, Player phase or walking proof" } };
} finally {
    UnityEngine.RenderTexture.active = previousActive;
    if (pixels) UnityEngine.Object.DestroyImmediate(pixels);
    if (rt) { rt.Release(); UnityEngine.Object.DestroyImmediate(rt); }
    UnityEngine.Object.DestroyImmediate(temporary); UnityEngine.Object.DestroyImmediate(probeMesh);
}
if (scene.isDirty || scene.rootCount != rootsBefore) throw new System.Exception("Diagnostic changed scene state");
System.IO.File.WriteAllText(output + "/occlusion.json", Newtonsoft.Json.JsonConvert.SerializeObject(result, Newtonsoft.Json.Formatting.Indented));
return new { output, scene.isDirty, roots = scene.rootCount, success = true };
