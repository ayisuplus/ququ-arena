using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace QuQu
{
    /** 参赛席面板（P2 UI 构建收口）：左侧选手列表的构建、装载与逐帧刷新。
     *  代码自 ArenaUI 逐行移出，布局数值不变（出处见 ArenaLayout）。 */
    public sealed class ArenaRosterPanel
    {
        RectTransform roster;
        readonly Dictionary<string, TMP_Text> names = new Dictionary<string, TMP_Text>();
        readonly Dictionary<string, UnityEngine.UI.Image> health = new Dictionary<string, UnityEngine.UI.Image>();

        public void Build(ArenaUI ui)
        {
            ui.Left = ui.Box(ui.Root, "Contestants", ArenaLayout.RosterX, ArenaLayout.RosterY, ArenaLayout.RosterW, ArenaLayout.RosterH, ArenaLayout.Panel);
            ui.Label(ui.Left, "CONTENDERS / 参赛席", 20, 20, 245, 27, 17, ui.Accent);
            roster = ui.Scroll(ui.Left, 15, 65, 255, ArenaLayout.RosterScrollH);
            ui.Label(ui.Left, "耐久按已判失分展示\n等待与调用失败不扣分", 20, 547, 245, 48, 14, ArenaLayout.Muted);
        }

        public void SetRoster(ArenaUI ui, List<ArenaFighter> fighters)
        {
            foreach (Transform child in roster) UnityEngine.Object.Destroy(child.gameObject);
            names.Clear(); health.Clear();
            for (int i = 0; i < fighters.Count; i++)
            {
                var f = fighters[i]; var id = f.State.Id; var r = ui.Box(roster, "Fighter " + id, 0, i * ArenaLayout.RosterRowStep, 243, ArenaLayout.RosterRowH, ArenaLayout.Field);
                var b = r.gameObject.AddComponent<UnityEngine.UI.Button>(); r.GetComponent<UnityEngine.UI.Image>().raycastTarget = true; b.targetGraphic = r.GetComponent<UnityEngine.UI.Image>(); b.onClick.AddListener(() => { ui.Click(); ui.SelectFighter?.Invoke(id); });
                ui.Box(r, "Team color", 0, 0, 4, ArenaLayout.RosterRowH, f.Tint);
                var portrait = ArenaModelPresets.Find(f.Look.presetId)?.Portrait;
                if (portrait) { var image = ui.Box(r, "Character portrait", 12, 5, 35, 62).gameObject.AddComponent<UnityEngine.UI.RawImage>(); image.texture = portrait; image.raycastTarget = false; }
                names[id] = ui.Label(r, f.State.Name, portrait ? 56 : 14, 9, portrait ? 178 : 220, 57, 17);
                var track = ui.Box(r, "Health track", 14, 70, ArenaLayout.RosterHealthW, 5, ArenaLayout.Panel);
                health[id] = ui.Box(track, "Health fill", 0, 0, ArenaLayout.RosterHealthW, 5, f.Tint).GetComponent<UnityEngine.UI.Image>();
            }
            roster.sizeDelta = new Vector2(roster.sizeDelta.x, Mathf.Max(ArenaLayout.RosterScrollH, fighters.Count * ArenaLayout.RosterRowStep));
        }

        public void Refresh(List<ArenaFighter> fighters)
        {
            foreach (var f in fighters)
            {
                if (names.TryGetValue(f.State.Id, out var t)) t.text = f.State.Name + "\n" + ArenaUI.StateName(f.State.Status) + "  ·  " + Mathf.RoundToInt(f.State.Health) + "%";
                if (health.TryGetValue(f.State.Id, out var h)) h.rectTransform.sizeDelta = new Vector2(ArenaLayout.RosterHealthW * f.State.Health / 100, 5);
            }
        }
    }
}
