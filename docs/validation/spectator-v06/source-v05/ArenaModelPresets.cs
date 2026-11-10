using System;
using System.Text.RegularExpressions;
using UnityEngine;

namespace QuQu
{
    public sealed class ArenaModelPreset
    {
        public readonly string Id, Name, Description, Color;
        public ArenaModelPreset(string id, string name, string description, string color)
        { Id = id; Name = name; Description = description; Color = color; }
        public GameObject Prefab => Resources.Load<GameObject>("Art/ModelPresets/" + Id);
        public Texture2D Portrait => Resources.Load<Texture2D>("Art/ModelPresets/Portraits/" + Id);
    }

    public static class ArenaModelPresets
    {
        public static readonly ArenaModelPreset[] All = {
            new ArenaModelPreset("chatgpt", "ChatGPT", "淡紫龙角 · 星环裁决", "#B5A5F5"),
            new ArenaModelPreset("claude", "Claude", "圆框眼镜 · 六芒言灵", "#EEA36C"),
            new ArenaModelPreset("deepseek", "DeepSeek", "鲸鱼胸针 · 潮汐共鸣", "#639CFF"),
            new ArenaModelPreset("gemini", "Gemini", "学者贝雷帽 · 双星咏唱", "#9E9CF7"),
            new ArenaModelPreset("glm", "GLM", "黑发猫耳 · 暗影月刃", "#B9C5D7"),
            new ArenaModelPreset("kimi", "Kimi", "月亮发饰 · 月轮神术", "#CBD2FF")
        };
        public static ArenaModelPreset Find(string id) => Array.Find(All, p => p.Id == id);
        public static ArenaModelPreset Match(string id, string name = null)
        {
            // Resolve the actual model ID first; friendly names may be user-authored.
            return MatchText(id) ?? MatchText(name);
        }
        static ArenaModelPreset MatchText(string value)
        {
            if (string.IsNullOrEmpty(value)) return null;
            string text = value.ToLowerInvariant();
            foreach (var preset in All)
            {
                string family = preset.Id == "chatgpt" ? "(?:chatgpt|gpt|o[134])" : preset.Id;
                if (Regex.IsMatch(text, @"(^|[^a-z0-9])" + family + @"(?=$|[^a-z]|[0-9])")) return preset;
            }
            return null;
        }
    }
}
