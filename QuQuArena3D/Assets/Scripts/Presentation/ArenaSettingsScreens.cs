using System;
using System.IO;
using UnityEngine;

namespace QuQu
{
    /** 设置界面（P2 自 ArenaGame.ShowSettings 及四个子页逐行移出，行为保持一致）。 */
    public static class ArenaSettingsScreens
    {
        static int avatarIndex;

        public static void Show(IArenaShell shell, int tab)
        {
            if (shell.IsSpectating) shell.ToggleSpectator();
            var panel = shell.UI.OpenModal("你的斗兽场 / CUSTOMIZE");
            shell.UI.SetBack(shell.ShowHome);
            shell.UI.Button(panel, "形象", 28, 82, 180, () => Show(shell, 0), tab == 0);
            shell.UI.Button(panel, "声音", 224, 82, 180, () => Show(shell, 1), tab == 1);
            shell.UI.Button(panel, "界面", 420, 82, 180, () => Show(shell, 2), tab == 2);
            shell.UI.Button(panel, "显示", 616, 82, 180, () => Show(shell, 3), tab == 3);
            shell.UI.Button(panel, "预设文件夹 ↗", 812, 82, 198, () => { Directory.CreateDirectory(ArenaPreferences.Folder); Application.OpenURL(new Uri(ArenaPreferences.Folder).AbsoluteUri); });
            if (tab == 0) Avatar(shell, panel);
            if (tab == 1) Audio(shell, panel);
            if (tab == 2) Interface(shell, panel);
            if (tab == 3)
            {
                shell.UI.Label(panel, "窗口与画面", 28, 158, 970, 45, 25);
                shell.UI.Button(panel, Screen.fullScreen ? "切换窗口模式" : "切换全屏", 28, 230, 982, () => { shell.SetFullscreen(!Screen.fullScreen); Show(shell, 3); });
                int[] widths = { 1920, 2560, 3840 }; int[] heights = { 1080, 1440, 2160 };
                for (int i = 0; i < 3; i++) { int w = widths[i], h = heights[i]; shell.UI.Button(panel, w + " × " + h, 28 + i * 334, 306, 314, () => Screen.SetResolution(w, h, Screen.fullScreenMode)); }
                shell.UI.Button(panel, shell.Preferences.avatarMode == ArenaAvatarModes.Chibi ? "角色：圆润 Q 版" : "角色：标准", 28, 382, 475, () => { shell.Preferences.avatarMode = shell.Preferences.avatarMode == ArenaAvatarModes.Chibi ? ArenaAvatarModes.Standard : ArenaAvatarModes.Chibi; shell.Preferences.NotifyChanged(); Show(shell, 3); });
                shell.UI.Button(panel, shell.Preferences.blackHoleEnabled ? "黑洞：开启" : "黑洞：关闭", 535, 382, 475, () => { shell.Preferences.blackHoleEnabled = !shell.Preferences.blackHoleEnabled; shell.Preferences.NotifyChanged(); Show(shell, 3); });
                shell.UI.Slider(panel, "星星亮度", shell.Preferences.starBrightness, .5f, 4, 28, 461, 980, v => { shell.Preferences.starBrightness = v; shell.Preferences.NotifyChanged(); });
                shell.AvatarModeStatus = shell.UI.Label(panel, "", 28, 542, 980, 38, 20);
                shell.UI.Label(panel, "独立保存 · 关闭黑洞后保留银河与星空 · Esc 菜单 / F11 全屏", 28, 585, 970, 32, 19);
            }
            shell.UI.Label(panel, "设置自动保存在本机 · 按模型 ID 记住形象，重新开赛仍然有效", 28, 624, 982, 32, 15);
        }

        static void Avatar(IArenaShell shell, RectTransform panel)
        {
            if (shell.Stage.Fighters.Count == 0) return; avatarIndex %= shell.Stage.Fighters.Count; var f = shell.Stage.Fighters[avatarIndex];
            shell.UI.Label(panel, "当前模型：" + f.State.Name, 28, 158, 736, 40, 24);
            shell.UI.Button(panel, "下一位 →", 820, 150, 190, () => { avatarIndex++; Show(shell, 0); });
            shell.UI.Label(panel, "基础造型", 28, 217, 200, 30, 18);
            string[] styles = { "玉甲拳手", "圆滚滚", "电子蛐蛐" };
            for (int i = 0; i < styles.Length; i++) { int style = i; shell.UI.Button(panel, styles[i], 170 + i * 173, 209, 160, () => { f.Look.style = style; f.Look.modelPath = f.Look.presetId = ""; RebuildAvatar(shell, f); Show(shell, 0); }, f.Look.style == i && string.IsNullOrEmpty(f.Look.presetId) && string.IsNullOrEmpty(f.Look.modelPath)); }
            shell.UI.Label(panel, "队伍配色", 28, 284, 200, 30, 18);
            for (int i = 0; i < ArenaPreferences.Colors.Length; i++) { string color = ArenaPreferences.Colors[i]; var b = shell.UI.Button(panel, "", 170 + i * 65, 274, 50, () => { f.Look.color = color; RebuildAvatar(shell, f); }); ColorUtility.TryParseHtmlString(color, out var tint); b.GetComponent<UnityEngine.UI.Image>().color = tint; }
            shell.UI.Slider(panel, "形象大小", f.Look.scale, .65f, 1.45f, 28, 345, 640, v => { f.Look.scale = v; f.BodyRoot.localScale = Vector3.one * v; shell.Preferences.NotifyChanged(); });
            var preview = shell.UI.Box(panel, "Live avatar preview", 710, 209, 300, 360).gameObject.AddComponent<UnityEngine.UI.RawImage>();
            preview.gameObject.AddComponent<ArenaAvatarPreview>().Initialize(f, shell.Stage.View);
            shell.UI.Label(panel, (ArenaModelPresets.Find(f.Look.presetId)?.Name ?? "形象预览") + " · 拖动旋转", 710, 579, 300, 30, 16);
            shell.UI.Button(panel, "导入 GLB 3D 模型", 28, 433, 300, async () =>
            {
                var path = LocalFilePicker.Pick("选择贴图内嵌的 GLB（64 MB 以内）", "GLB 3D model\0*.glb\0\0"); if (path == null) return;
                try { var local = ArenaPreferences.ImportFile(path, new[] { ".glb" }, 64 * 1024 * 1024); if (await shell.Media.LoadAvatar(f, local, shell.Notify)) { f.Look.modelPath = local; f.Look.presetId = ""; shell.UI.SetRoster(shell.Stage.Fighters); shell.Stage.Refit(); shell.Preferences.NotifyChanged(); } } catch (Exception e) { shell.Notify(e.Message); }
            });
            shell.UI.Button(panel, "导入 PNG / JPG 头像", 352, 433, 316, () =>
            {
                var path = LocalFilePicker.Pick("选择头像图片", "Image\0*.png;*.jpg;*.jpeg\0\0"); if (path == null) return;
                shell.Try(() => { var local = ArenaPreferences.ImportFile(path, new[] { ".png", ".jpg", ".jpeg" }, 16 * 1024 * 1024); f.Look.facePath = local; f.Look.modelPath = f.Look.presetId = ""; RebuildAvatar(shell, f); });
            });
            shell.UI.Button(panel, "恢复基础造型", 28, 490, 300, () => { f.Look.modelPath = f.Look.facePath = f.Look.presetId = ""; RebuildAvatar(shell, f); Show(shell, 0); });
            shell.UI.Button(panel, "模型角色预设 · 6 款", 352, 490, 316, () => ModelPresets(shell, f));
            shell.UI.Label(panel, "GLB 保留模型和贴图，统一到赛场尺寸，使用整体冲刺与受击。\n内置拳手带骨骼动作。自定义外观不影响评分。", 28, 548, 640, 64, 17);
        }

        static void Audio(IArenaShell shell, RectTransform panel)
        {
            shell.UI.Label(panel, "赛场配乐", 28, 166, 900, 40, 24);
            shell.UI.Slider(panel, "音乐音量", shell.Preferences.musicVolume, 0, 1, 28, 237, 455, v => { shell.Preferences.musicVolume = v; shell.Preferences.NotifyChanged(); });
            shell.UI.Slider(panel, "交手音效", shell.Preferences.soundVolume, 0, 1, 548, 237, 455, v => { shell.Preferences.soundVolume = v; shell.Preferences.NotifyChanged(); });
            shell.UI.Button(panel, "导入 MP3 / OGG / WAV", 28, 347, 455, () =>
            {
                var path = LocalFilePicker.Pick("选择赛场音乐", "Music\0*.mp3;*.ogg;*.wav\0\0"); if (path == null) return;
                shell.Try(() => { var local = ArenaPreferences.ImportFile(path, new[] { ".mp3", ".ogg", ".wav" }, 128 * 1024 * 1024); shell.Media.LoadMusic(local, message => { shell.Notify(message); if (message == "音乐已载入") { shell.Preferences.musicPath = local; shell.Preferences.NotifyChanged(); } }); });
            });
            shell.UI.Button(panel, "使用内置《月下咖啡馆》", 548, 347, 455, () => { shell.Preferences.musicPath = ""; shell.Media.LoadMusic("", shell.Notify); shell.Preferences.NotifyChanged(); });
            shell.UI.Label(panel, "音乐文件复制到本机自定义目录。可随时更换或将音量降为零。", 28, 432, 982, 72, 18);
        }

        static void Interface(IArenaShell shell, RectTransform panel)
        {
            shell.UI.Slider(panel, "界面字号", shell.Preferences.uiScale, .8f, 1.2f, 28, 165, 455, v => { shell.Preferences.uiScale = v; shell.Preferences.NotifyChanged(); });
            shell.UI.Slider(panel, "面板不透明度", shell.Preferences.opacity, .5f, 1, 548, 165, 455, v => { shell.Preferences.opacity = v; shell.Preferences.NotifyChanged(); });
            shell.UI.Slider(panel, "动作强度（0 为静态）", shell.Preferences.motion, 0, 1, 28, 252, 455, v => { shell.Preferences.motion = v; shell.Preferences.NotifyChanged(); });
            shell.UI.Button(panel, "左右交换面板", 548, 258, 455, () => { shell.Preferences.mirrorPanels = !shell.Preferences.mirrorPanels; shell.Preferences.NotifyChanged(); });
            shell.UI.Label(panel, "主题强调色", 28, 346, 200, 30, 18);
            for (int i = 0; i < ArenaPreferences.Colors.Length; i++) { string color = ArenaPreferences.Colors[i]; var b = shell.UI.Button(panel, "", 230 + i * 65, 335, 50, () => { shell.Preferences.accent = color; shell.Preferences.NotifyChanged(); Show(shell, 2); }); ColorUtility.TryParseHtmlString(color, out var tint); b.GetComponent<UnityEngine.UI.Image>().color = tint; }
            shell.UI.Button(panel, "导入界面背景", 28, 414, 300, () =>
            {
                var path = LocalFilePicker.Pick("选择界面背景图片", "Image\0*.png;*.jpg;*.jpeg\0\0"); if (path == null) return;
                shell.Try(() => { var local = ArenaPreferences.ImportFile(path, new[] { ".png", ".jpg", ".jpeg" }, 16 * 1024 * 1024); SetBackground(shell, local); shell.Preferences.backgroundPath = local; shell.Preferences.NotifyChanged(); });
            });
            shell.UI.Slider(panel, "观战俯角", shell.Preferences.spectator.pitch, 20, 55, 700, 415, 305, v => { shell.Preferences.spectator.pitch = v; shell.Preferences.NotifyChanged(); });
            shell.UI.Button(panel, "清除界面背景", 352, 414, 300, () => { shell.Preferences.backgroundPath = ""; shell.UI.Background.color = Color.clear; shell.Preferences.NotifyChanged(); });
            shell.UI.Button(panel, "导入 JSON 预设", 28, 489, 300, () =>
            {
                var path = LocalFilePicker.Pick("导入自定义预设", "JSON preset\0*.json\0\0"); if (path == null) return;
                shell.Try(() => ApplyPreset(shell, ArenaPreferences.Import(path)));
            });
            shell.UI.Button(panel, "导出当前预设", 352, 489, 300, () => shell.Try(() => { shell.Preferences.Save(); File.Copy(ArenaPreferences.FilePath, Path.Combine(ArenaPreferences.Folder, "preset-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".json")); shell.Notify("预设已导出到自定义文件夹"); }));
            shell.UI.Button(panel, "导入完整素材包", 28, 551, 300, () =>
            {
                var path = LocalFilePicker.Pick("导入形象、音乐和界面素材包", "QuQu bundle\0*.ququ\0\0"); if (path == null) return;
                shell.Try(() => ApplyPreset(shell, ArenaPresetArchive.Import(path, ArenaPreferences.Folder)));
            });
            shell.UI.Button(panel, "导出预设 + 全部素材", 352, 551, 300, () => shell.Try(() =>
            {
                Directory.CreateDirectory(ArenaPreferences.Folder);
                var path = Path.Combine(ArenaPreferences.Folder, "arena-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".ququ");
                ArenaPresetArchive.Export(shell.Preferences, path); shell.Notify("已导出完整素材包，可复制到另一台电脑使用");
            }));
        }

        static void ApplyPreset(IArenaShell shell, ArenaPreferences next)
        {
            next.endpoint = shell.Preferences.endpoint; shell.Preferences = next; shell.Preferences.NotifyChanged();
            foreach (var f in shell.Stage.Fighters) { f.Look = shell.Preferences.Avatar(f.State.Id, shell.Stage.Fighters.IndexOf(f)); RebuildAvatar(shell, f); }
            shell.Media.LoadMusic(shell.Preferences.musicPath, shell.Notify); SetBackground(shell, shell.Preferences.backgroundPath); Show(shell, 2);
        }

        public static void SetBackground(IArenaShell shell, string path)
        {
            if (string.IsNullOrEmpty(path)) { shell.UI.Background.color = Color.clear; return; }
            try { var texture = ArenaMedia.Texture(path); if (shell.UI.Background.texture) UnityEngine.Object.Destroy(shell.UI.Background.texture); shell.UI.Background.texture = texture; shell.UI.Background.color = new Color(1, 1, 1, .13f); }
            catch (Exception e) { shell.Notify(e.Message); }
        }

        public static void ApplyModelPreset(IArenaShell shell, ArenaFighter fighter, string id)
        {
            var preset = ArenaModelPresets.Find(id);
            if (preset == null || !preset.Prefab) { shell.Notify("这个角色尚未安装"); return; }
            fighter.Look.presetId = id; fighter.Look.modelPath = fighter.Look.facePath = "";
            RebuildAvatar(shell, fighter);
        }

        public static void ModelPresets(IArenaShell shell, ArenaFighter fighter)
        {
            var panel = shell.UI.OpenModal("模型角色 / CHARACTER PRESETS");
            shell.UI.Label(panel, "为 " + fighter.State.Name + " 选择形象 · 任意模型均可使用", 28, 82, 982, 44, 20);
            for (int i = 0; i < ArenaModelPresets.All.Length; i++)
            {
                var preset = ArenaModelPresets.All[i]; bool selected = fighter.Look.presetId == preset.Id;
                var card = shell.UI.Box(panel, "Preset " + preset.Id, 28 + i % 3 * 334, 142 + i / 3 * 232, 316, 218, new Color(.075f, .095f, .135f));
                var portrait = shell.UI.Box(card, "Reference portrait", 10, 11, 110, 196).gameObject.AddComponent<UnityEngine.UI.RawImage>();
                portrait.texture = preset.Portrait; portrait.raycastTarget = false;
                shell.UI.Label(card, preset.Name, 132, 18, 174, 40, 23);
                shell.UI.Label(card, preset.Description, 132, 64, 174, 68, 17);
                shell.UI.Button(card, selected ? "已使用 ✓" : "使用此形象", 132, 160, 174, () => { ApplyModelPreset(shell, fighter, preset.Id); Show(shell, 0); }, selected);
            }
            shell.UI.Label(panel, "参考形象由你提供 · 已配待机、出拳、受击、格挡、胜利与落败动作", 28, 618, 780, 34, 16);
            shell.UI.Button(panel, "← 返回", 844, 615, 166, () => Show(shell, 0));
        }

        static void RebuildAvatar(IArenaShell shell, ArenaFighter f) { shell.MarkAppearancesDirty(); shell.Preferences.NotifyChanged(); shell.UI.SetRoster(shell.Stage.Fighters); }
    }
}
