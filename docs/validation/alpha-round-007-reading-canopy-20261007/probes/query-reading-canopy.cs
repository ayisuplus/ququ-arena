// Round 7 read-only scene query: locate "Reading curved linking canopy" in the
// V019 candidate and measure how existing native Player probe cameras cover it.
// No mutation: only reads scene state and returns a report.
var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
var deck = GameObject.Find("R2 public planning deck");
if (!deck) return new { error = "R2 public planning deck not found", scene = scene.path };

var targets = new System.Collections.Generic.List<object>();
var renderers = UnityEngine.Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None);
foreach (var r in renderers)
{
    var f = r.GetComponent<MeshFilter>();
    if (!f || !f.sharedMesh) continue;
    if (f.sharedMesh.name.IndexOf("Reading curved linking canopy", System.StringComparison.OrdinalIgnoreCase) < 0) continue;
    var mats = r.sharedMaterials;
    var slots = new System.Collections.Generic.List<object>();
    for (int i = 0; i < mats.Length; i++)
    {
        var m = mats[i];
        object tex = null;
        if (m && m.HasProperty("_BaseMap") && m.GetTexture("_BaseMap") != null)
        {
            var t = m.GetTexture("_BaseMap");
            tex = new { name = t.name, tiling = m.GetTextureScale("_BaseMap"), offset = m.GetTextureOffset("_BaseMap") };
        }
        slots.Add(new { index = i, material = m ? m.name : "<null>", baseMap = tex });
    }
    var chain = new System.Collections.Generic.List<string>();
    for (var t = r.transform; t; t = t.parent) chain.Add(t.name);
    targets.Add(new
    {
        objectName = r.gameObject.name,
        path = UnityEditor.AnimationUtility.CalculateTransformPath(r.transform, deck.transform),
        parentChain = chain,
        mesh = f.sharedMesh.name,
        meshPath = UnityEditor.AssetDatabase.GetAssetPath(f.sharedMesh),
        vertexCount = f.sharedMesh.vertexCount,
        subMeshCount = f.sharedMesh.subMeshCount,
        sharedMeshName = f.sharedMesh.name,
        localBoundsCenter = f.sharedMesh.bounds.center,
        localBoundsSize = f.sharedMesh.bounds.size,
        rendererWorldCenter = r.bounds.center,
        rendererWorldSize = r.bounds.size,
        lossyScale = r.transform.lossyScale,
        enabled = r.enabled,
        sharedMaterialCount = mats.Length,
        slots = slots,
        hasCollider = !!r.GetComponent<MeshCollider>()
    });
}

return new
{
    scene = scene.path,
    dirty = scene.isDirty,
    playing = UnityEditor.EditorApplication.isPlaying,
    compiling = UnityEditor.EditorApplication.isCompiling,
    deckPosition = deck.transform.position,
    deckRotation = deck.transform.eulerAngles,
    deckScale = deck.transform.lossyScale,
    canopyRendererCount = targets.Count,
    canopies = targets
};
