using System;
using System.IO;
using System.Linq;
using QuQu;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

public static class ArenaModelPresetBuild
{
    static readonly string[] States = { "Idle", "Jab", "Hit", "Block", "Victory", "Defeat" };
    public static string ImportAll()
    {
        AssetDatabase.Refresh();
        return string.Join("\n", ArenaModelPresets.All.Select(Import));
    }
    static string Import(ArenaModelPreset preset)
    {
        string folder = "Assets/Art/ModelPresets/" + preset.Id;
        string path = folder + "/" + preset.Id + "-v02.fbx";
        AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
        var importer = AssetImporter.GetAtPath(path) as ModelImporter;
        if (!importer) throw new Exception("Missing FBX: " + path);
        importer.globalScale = 1; importer.importAnimation = true;
        importer.animationType = ModelImporterAnimationType.Generic;
        importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
        importer.motionNodeName = "Hips"; importer.importCameras = false; importer.importLights = false;
        var takes = importer.defaultClipAnimations;
        foreach (var clip in takes)
        {
            clip.loopTime = clip.name.Contains("Idle"); clip.loopPose = clip.loopTime;
            clip.lockRootRotation = clip.lockRootPositionXZ = clip.lockRootHeightY = true;
        }
        importer.clipAnimations = takes; importer.SaveAndReimport();
        var clips = AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview__")).ToArray();
        if (clips.Length != 6 || States.Any(s => !clips.Any(c => c.name.EndsWith(s)))) throw new Exception("Expected six named clips: " + preset.Id);
        string controllerPath = "Assets/Resources/Art/ModelPresets/" + preset.Id + ".controller";
        var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
        if (!controller) controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
        var machine = controller.layers[0].stateMachine;
        foreach (string name in States)
        {
            var state = machine.states.Select(s => s.state).FirstOrDefault(s => s.name == name) ?? machine.AddState(name);
            state.motion = clips.Single(c => c.name.EndsWith(name));
            if (name == "Idle") machine.defaultState = state;
        }
        string texturePath = folder + "/SourceBaseColor.png";
        AssetDatabase.ImportAsset(texturePath,ImportAssetOptions.ForceSynchronousImport);
        var textureImporter = (TextureImporter)AssetImporter.GetAtPath(texturePath);
        ArenaVisualBuild.ConfigureTexture(textureImporter);
        var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(texturePath);
        if (!texture) throw new Exception("Missing base color for " + preset.Id);
        string materialPath = folder + "/Character.mat";
        var material = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
        var shader = Shader.Find("QuQu/Painted Character");
        if (!material) { material = new Material(shader); AssetDatabase.CreateAsset(material,materialPath); }
        material.shader = shader; material.shaderKeywords = Array.Empty<string>();
        // The generated anime atlas already contains painted shading. Preserve it under arena lights.
        material.color = Color.white; material.mainTexture = texture; material.SetFloat("_Cull",0);
        string normalPath = folder + "/SourceNormal.png";
        AssetDatabase.ImportAsset(normalPath,ImportAssetOptions.ForceSynchronousImport);
        var normalImporter = (TextureImporter)AssetImporter.GetAtPath(normalPath);
        normalImporter.textureType = TextureImporterType.NormalMap;
        normalImporter.sRGBTexture = false; normalImporter.maxTextureSize = 2048;
        normalImporter.textureCompression = TextureImporterCompression.Uncompressed;
        normalImporter.filterMode = FilterMode.Trilinear; normalImporter.anisoLevel = 16; normalImporter.SaveAndReimport();
        material.SetTexture("_BumpMap",AssetDatabase.LoadAssetAtPath<Texture2D>(normalPath)); material.SetFloat("_BumpScale",.65f);
        EditorUtility.SetDirty(material);
        var instance = UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(path)); instance.name = preset.Name;
        try
        {
            var skins = instance.GetComponentsInChildren<SkinnedMeshRenderer>();
            if (skins.Length == 0 || skins.Any(s => s.bones.Length < 15)) throw new Exception("No valid skin: " + preset.Id);
            foreach (var skin in skins) skin.sharedMaterials = Enumerable.Repeat(material,skin.sharedMaterials.Length).ToArray();
            var animator = instance.GetComponent<Animator>() ?? instance.AddComponent<Animator>();
            animator.runtimeAnimatorController = controller; animator.applyRootMotion = false; animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            animator.Rebind(); animator.Update(0);
            // Renderer bounds cover every imported motion, including falling and jumping.
            // Measure actual vertices in the idle pose instead of that conservative volume.
            float minY = float.PositiveInfinity, maxY = float.NegativeInfinity;
            foreach (var skin in skins)
            {
                var baked = new Mesh();
                try { skin.BakeMesh(baked); foreach (var vertex in baked.vertices) { float y = skin.transform.TransformPoint(vertex).y; minY = Mathf.Min(minY,y); maxY = Mathf.Max(maxY,y); } }
                finally { UnityEngine.Object.DestroyImmediate(baked); }
            }
            float height = maxY - minY;
            if (height < 1.5f || height > 3f) throw new Exception("Unexpected character height: " + height);
            PrefabUtility.SaveAsPrefabAsset(instance,"Assets/Resources/Art/ModelPresets/" + preset.Id + ".prefab");
            AssetDatabase.SaveAssets();
            if (File.Exists(folder + "/Motion-v03.fbx")) ArenaMotionBuild.Import(preset.Id);
            return preset.Id + ": " + skins.Sum(s => (long)s.sharedMesh.triangles.Length / 3) + " triangles, " + height.ToString("0.00") + " m, six clips";
        }
        finally { UnityEngine.Object.DestroyImmediate(instance); }
    }
    public static string CheckPreferences()
    {
        string[] ids = { "openai/gpt-5.4", "anthropic/claude-opus-4.6", "deepseek/deepseek-v3", "google/gemini-3.1", "z-ai/glm-4.7", "moonshotai/kimi-k2" };
        for (int i = 0; i < ids.Length; i++) Require(ArenaModelPresets.Match(ids[i])?.Id == ArenaModelPresets.All[i].Id,"Family match: " + ids[i]);
        Require(ArenaModelPresets.Match("unknown", "Claude Sonnet")?.Id == "claude", "Friendly name fallback");
        Require(ArenaModelPresets.Match("openai/o3")?.Id == "chatgpt" && ArenaModelPresets.Match("unknown", "dogptastic") == null, "Bounded names");
        var profile = new ArenaPreferences();
        var avatar = profile.Avatar(ids[0],0); avatar.presetId = "kimi"; avatar.scale = 1.2f; avatar.color = "#abcdef";
        Require(profile.Avatar(ids[0],4) == avatar && avatar.presetId == "kimi", "Manual selection must survive roster changes");
        var legacy = JsonUtility.FromJson<ArenaPreferences>("{\"version\":1,\"avatars\":[{\"modelId\":\"openai/gpt-5.4\",\"style\":2,\"scale\":1.1,\"color\":\"#ABCDEF\",\"modelPath\":\"my.glb\"}]}");
        legacy.Validate(); var old = legacy.Avatar(ids[0],0);
        Require(string.IsNullOrEmpty(old.presetId) && old.style == 2 && old.modelPath == "my.glb", "Legacy customization must remain intact");
        string root = Path.Combine(Path.GetTempPath(),"ququ-character-check-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        try
        {
            string bundle = Path.Combine(root,"presets.ququ"); ArenaPresetArchive.Export(profile,bundle);
            var imported = ArenaPresetArchive.Import(bundle,Path.Combine(root,"import")); var restored = imported.Avatar(ids[0],3);
            Require(restored.presetId == "kimi" && restored.scale == 1.2f && restored.color == "#abcdef", "Portable preset round trip");
        }
        finally { Directory.Delete(root,true); }
        return "11 model identity, legacy customization and portable preset checks passed";
    }
    static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
}
