using UnityEngine;

namespace QuQu
{
    // Asset selection only. Original appearance preferences remain untouched.
    public static class ArenaAvatarMode
    {
        public static bool Chibi { get; private set; }
        public static void Set(string mode) { Chibi = mode == "chibi"; }
        public static GameObject Prefab(AvatarPreference look)
        {
            string id = string.IsNullOrEmpty(look.modelPath) && string.IsNullOrEmpty(look.facePath) && ArenaModelPresets.Find(look.presetId) != null ? look.presetId : "generic";
            return Resources.Load<GameObject>("Art/ChibiV22/" + id);
        }
        public static GameObject GalleryPrefab(string id) => Resources.Load<GameObject>("Art/ChibiV22/" + id);
        public static RuntimeAnimatorController GalleryController(string id) => Resources.Load<RuntimeAnimatorController>("Art/ChibiV22/" + id + "-gallery");
    }
}
