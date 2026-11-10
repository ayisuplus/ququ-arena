using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    [Serializable] public class AvatarPreference
    { public string modelId, color = "#61F0C4", modelPath = "", facePath = "", presetId = ""; public float scale = 1; public int style; }
    [Serializable] public class ArenaPreferences
    {
        public int version = 1;
        public string endpoint = "http://127.0.0.1:8181", accent = "#61F0C4", musicPath = "", backgroundPath = "";
        public float musicVolume = .25f, soundVolume = .35f, uiScale = 1, opacity = .92f, motion = 1;
        public bool answersVisible = true, mirrorPanels;
        public List<AvatarPreference> avatars = new List<AvatarPreference>();
        public static string Folder => Path.Combine(Application.persistentDataPath, "Customization");
        public static string FilePath => Path.Combine(Folder, "profile.json");
        public static readonly string[] Colors = { "#61F0C4", "#FF9563", "#AA97FF", "#70C8FF", "#F2CF68", "#FD8FBE", "#C1E775", "#EFEFEF" };
        public AvatarPreference Avatar(string id, int index, string name = null)
        {
            var avatar = avatars.FirstOrDefault(a => a.modelId == id);
            if (avatar == null)
            {
                var preset = ArenaModelPresets.Match(id, name);
                avatar = new AvatarPreference { modelId = id, color = preset?.Color ?? Colors[index % Colors.Length], style = index % 3, presetId = preset?.Id ?? "" };
                avatars.Add(avatar);
            }
            return avatar;
        }
        public void Validate()
        {
            if (version != 1) throw new InvalidDataException("不支持这个预设版本");
            musicVolume = Safe(musicVolume, 0, 1, .25f); soundVolume = Safe(soundVolume, 0, 1, .35f);
            uiScale = Safe(uiScale, .8f, 1.2f, 1); opacity = Safe(opacity, .5f, 1, .92f); motion = Safe(motion, 0, 1, 1);
            if (!ColorUtility.TryParseHtmlString(accent, out _)) accent = Colors[0];
            avatars = (avatars ?? new List<AvatarPreference>()).Where(a => a != null && !string.IsNullOrEmpty(a.modelId)).GroupBy(a => a.modelId).Select(g => g.First()).Take(128).ToList();
            foreach (var a in avatars) { a.scale = Safe(a.scale, .65f, 1.45f, 1); a.style = Mathf.Clamp(a.style, 0, 2); if (!ColorUtility.TryParseHtmlString(a.color, out _)) a.color = Colors[0]; if (ArenaModelPresets.Find(a.presetId) == null) a.presetId = ""; }
        }
        static float Safe(float v, float min, float max, float fallback) => float.IsNaN(v) || float.IsInfinity(v) ? fallback : Mathf.Clamp(v, min, max);
        public void Save()
        {
            Validate(); Directory.CreateDirectory(Folder);
            var temp = FilePath + ".tmp"; System.IO.File.WriteAllText(temp, JsonUtility.ToJson(this, true));
            if (System.IO.File.Exists(FilePath)) System.IO.File.Replace(temp, FilePath, FilePath + ".bak"); else System.IO.File.Move(temp, FilePath);
        }
        public static ArenaPreferences Load()
        {
            try { return Import(FilePath); } catch (Exception) { return new ArenaPreferences(); }
        }
        public static ArenaPreferences Import(string path)
        {
            if (new FileInfo(path).Length > 1024 * 1024) throw new InvalidDataException("预设文件过大");
            var p = JsonUtility.FromJson<ArenaPreferences>(System.IO.File.ReadAllText(path));
            if (p == null) throw new InvalidDataException("预设内容无效"); p.Validate(); return p;
        }
        public static string ImportFile(string source, string[] extensions, long maxBytes)
        {
            source = source.Trim().Trim('"'); var ext = Path.GetExtension(source).ToLowerInvariant();
            if (!extensions.Contains(ext) || !System.IO.File.Exists(source)) throw new InvalidDataException("请选择支持的本地文件");
            if (new FileInfo(source).Length > maxBytes) throw new InvalidDataException("文件太大，请先压缩素材");
            Directory.CreateDirectory(Folder);
            var dest = Path.Combine(Folder, Guid.NewGuid().ToString("N") + ext); System.IO.File.Copy(source, dest); return dest;
        }
    }
}
