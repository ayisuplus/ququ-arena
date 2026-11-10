using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Opt-in verification uses synthetic events and never saves user preferences.
    [ArenaHarness("--arena-preset-validation", false)]
    public static class ArenaModelPresetCheck
    {
        [Serializable] public class Character { public string id; public int triangles, bones, animatedStates; public float height; }
        [Serializable] public class Result { public bool passed, assignmentPersisted, galleryButtonWorked; public string error, graphics; public int impacts, materialGrowth; public List<Character> characters = new List<Character>(); }
        public static IEnumerator Run(IArenaTestShell shell)
        {
            string dir = Path.Combine(Application.persistentDataPath,"ValidationModelPresets");
            var args = Environment.GetCommandLineArgs(); int arg = Array.IndexOf(args,"--arena-qa-output");
            if (arg >= 0 && arg + 1 < args.Length) dir = Path.GetFullPath(args[arg+1]);
            Directory.CreateDirectory(dir); var result = new Result { graphics = SystemInfo.graphicsDeviceName };
            var steps = Check(shell,dir,result);
            while (true)
            {
                bool more; object next;
                try { more = steps.MoveNext(); next = more ? steps.Current : null; }
                catch (Exception e) { result.error = e.ToString(); Debug.LogException(e); break; }
                if (!more) { result.passed = true; break; }
                yield return next;
            }
            (steps as IDisposable)?.Dispose();
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(result,true));
        }
        static IEnumerator Check(IArenaTestShell shell, string dir, Result result)
        {
            yield return new WaitForSecondsRealtime(2);
            shell.Link.Disconnect(); shell.UI.CloseModal();
            var roster = ArenaModelPresets.All.Select(p => new ModelInfo { id = "preset-qa/" + p.Id, name = p.Name }).ToArray();
            shell.Accept(new Frame { type = "start", roster = roster, total = 6, title = "模型角色动作验证 · 模拟事件" });
            yield return new WaitForSecondsRealtime(.5f);
            foreach (var fighter in shell.Stage.Fighters)
            {
                var preset = ArenaModelPresets.Match(fighter.State.Id);
                Require(fighter.Look.presetId == preset.Id && preset.Portrait,"Automatic preset and original portrait");
                var skins = fighter.BodyRoot.GetComponentsInChildren<SkinnedMeshRenderer>();
                Require(skins.Length > 0 && skins.All(s => s.sharedMaterial.mainTexture),"Textured skinned model: " + preset.Id);
                var animator = fighter.BodyRoot.GetComponentInChildren<Animator>();
                var bones = animator.GetComponentsInChildren<Transform>().Where(t => t != animator.transform).ToArray();
                float minY = float.PositiveInfinity, maxY = float.NegativeInfinity;
                foreach (var skin in skins)
                {
                    var baked = new Mesh(); skin.BakeMesh(baked);
                    foreach (var vertex in baked.vertices) { float y = skin.transform.TransformPoint(vertex).y; minY = Mathf.Min(minY,y); maxY = Mathf.Max(maxY,y); }
                    UnityEngine.Object.Destroy(baked);
                }
                var row = new Character { id = preset.Id, bones = skins.SelectMany(s => s.bones).Distinct().Count(), triangles = skins.Sum(s => Enumerable.Range(0,s.sharedMesh.subMeshCount).Sum(i => (int)s.sharedMesh.GetIndexCount(i) / 3)), height = maxY-minY };
                result.characters.Add(row);
                foreach (string state in new[] { "Idle", "Jab", "Hit", "Block", "Victory", "Defeat", "Advance", "Retreat", "AttackA", "AttackB", "AttackC", "Evade" })
                {
                    Require(animator.HasState(0,Animator.StringToHash(state)),"Missing state: " + state);
                    animator.Play(state,0,.05f); animator.Update(0);
                    var before = bones.Select(t => t.localRotation).ToArray(); animator.Update(.35f);
                    Require(bones.Where((t,i) => Quaternion.Angle(before[i],t.localRotation) > .1f).Any(),"Stationary clip: " + preset.Id + "/" + state);
                    row.animatedStates++;
                }
                animator.Play("Idle");
            }
            Screen.SetResolution(1920,1080,FullScreenMode.Windowed); yield return new WaitForSecondsRealtime(.5f);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"six-characters.png")); yield return null;
            var first = shell.Stage.Fighters[0];
            shell.ShowModelPresets(first); yield return new WaitForSecondsRealtime(.4f);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"preset-gallery-1920.png")); yield return null;
            var card = shell.UI.Modal.GetComponentsInChildren<Transform>().Single(t => t.name == "Preset kimi");
            card.GetComponentInChildren<UnityEngine.UI.Button>().onClick.Invoke(); yield return new WaitForSecondsRealtime(.3f);
            result.galleryButtonWorked = first.Look.presetId == "kimi" && shell.UI.Modal.GetComponentInChildren<ArenaAvatarPreview>();
            Require(result.galleryButtonWorked,"Gallery selection must change the model and open the 3D preview");
            foreach (var preset in ArenaModelPresets.All)
            {
                shell.ApplyModelPreset(first,preset.Id); shell.ShowSettings(0); yield return new WaitForSecondsRealtime(.4f);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir,"preview-" + preset.Id + ".png")); yield return null;
            }
            shell.ApplyModelPreset(first,"chatgpt"); shell.UI.CloseModal();
            shell.Accept(new Frame { type = "start", roster = roster, total = 6, title = "模型角色对战验证 · 模拟事件" });
            first = shell.Stage.Fighters[0];
            result.assignmentPersisted = first.Look.presetId == "chatgpt";
            Require(result.assignmentPersisted,"Roster restart preserves selected preset");
            yield return new WaitForSecondsRealtime(.4f);
            int materials = Resources.FindObjectsOfTypeAll<Material>().Length;
            for (int i = 0; i < 12; i++) { shell.ApplyModelPreset(first,ArenaModelPresets.All[i%6].Id); yield return null; }
            shell.ApplyModelPreset(first,"chatgpt"); yield return null; yield return null;
            result.materialGrowth = Resources.FindObjectsOfTypeAll<Material>().Length - materials;
            Require(result.materialGrowth <= 2,"Preset switching leaks materials");
            Action<bool> impact = _ => result.impacts++; shell.Stage.OnImpact += impact;
            try
            {
                shell.Accept(new Frame { type="model", modelId=first.State.Id, taskId="qa",seq=1,status="generating" });
                yield return new WaitForSecondsRealtime(.3f); Require(result.impacts == 0,"Thinking must not deal damage");
                shell.Accept(new Frame { type="model", modelId=first.State.Id, taskId="qa",seq=2,status="done",hasScore=true,score=.9f,answer="答题完成，驱动一次出拳。" });
                yield return new WaitForSecondsRealtime(.65f);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir,"combat.png"));
                float deadline = Time.realtimeSinceStartup + 12;
                while (result.impacts == 0 && Time.realtimeSinceStartup < deadline) yield return null;
                Require(result.impacts == 1,"One judged answer must produce one impact");
            }
            finally { shell.Stage.OnImpact -= impact; }
            Screen.SetResolution(1280,720,FullScreenMode.Windowed); shell.Preferences.uiScale = 1.2f; shell.ApplyPreferences();
            shell.ShowModelPresets(first); yield return new WaitForSecondsRealtime(.6f);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"preset-gallery-1280-scale120.png")); yield return new WaitForSecondsRealtime(.2f);
            shell.UI.CloseModal(); shell.Preferences.uiScale = 1; shell.ApplyPreferences();
        }
        static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
    }
}
