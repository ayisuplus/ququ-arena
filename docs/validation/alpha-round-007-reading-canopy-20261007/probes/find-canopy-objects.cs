// Round 7 read-only: find canopy objects by GameObject name / mesh asset name,
// including inactive objects, and report renderer type and mesh identity.
var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
var deck = GameObject.Find("R2 public planning deck");

var byName = new System.Collections.Generic.List<object>();
foreach (var go in UnityEngine.Object.FindObjectsByType<GameObject>(FindObjectsInactive.Include, FindObjectsSortMode.None))
{
    if (go.name.IndexOf("linking canopy", System.StringComparison.OrdinalIgnoreCase) < 0) continue;
    var path = deck ? UnityEditor.AnimationUtility.CalculateTransformPath(go.transform, deck.transform) : "<no-deck>";
    var meshes = new System.Collections.Generic.List<string>();
    foreach (var mf in go.GetComponentsInChildren<MeshFilter>(true))
        if (mf.sharedMesh) meshes.Add(mf.sharedMesh.name + " @ " + UnityEditor.AssetDatabase.GetAssetPath(mf.sharedMesh));
    foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
        if (smr.sharedMesh) meshes.Add("skinned:" + smr.sharedMesh.name + " @ " + UnityEditor.AssetDatabase.GetAssetPath(smr.sharedMesh));
    byName.Add(new
    {
        name = go.name,
        activeInHierarchy = go.activeInHierarchy,
        pathFromDeck = path,
        localPosition = go.transform.localPosition,
        localEuler = go.transform.localEulerAngles,
        lossyScale = go.transform.lossyScale,
        worldPosition = go.transform.position,
        renderers = go.GetComponentsInChildren<Renderer>(true).Length,
        meshCount = meshes.Count,
        meshes = meshes
    });
}

var meshAssetHits = new System.Collections.Generic.List<object>();
foreach (var o in UnityEditor.AssetDatabase.FindAssets("Reading curved linking canopy"))
{
    var p = UnityEditor.AssetDatabase.GUIDToAssetPath(o);
    var m = UnityEditor.AssetDatabase.LoadAssetAtPath<Mesh>(p);
    meshAssetHits.Add(new
    {
        path = p,
        isMesh = m != null,
        vertices = m ? m.vertexCount : 0,
        subMeshes = m ? m.subMeshCount : 0,
        boundsSize = m ? m.bounds.size : Vector3.zero,
        boundsCenter = m ? m.bounds.center : Vector3.zero
    });
}

return new
{
    scene = scene.path,
    dirty = scene.isDirty,
    playing = UnityEditor.EditorApplication.isPlaying,
    gameObjectHits = byName.Count,
    gameObjects = byName,
    meshAssets = meshAssetHits
};
