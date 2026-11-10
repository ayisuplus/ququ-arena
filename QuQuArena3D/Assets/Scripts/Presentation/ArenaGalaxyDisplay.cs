using System;
using TMPro;
using UnityEngine;

namespace QuQu
{
    // Presentation only: authoritative events are sequenced by ArenaDuelController.
    public class ArenaGalaxyDisplay : MonoBehaviour
    {
        public static readonly Bounds ScreenBounds = new Bounds(new Vector3(0, 5.1f, 6.6f), new Vector3(12.6f, 5.3f, .4f));
        public TMP_Text Question { get; private set; }
        public int Page => Question.pageToDisplay;
        public int PageCount => Mathf.Max(1, Question.textInfo.pageCount);
        public string Winner { get; private set; }
        public bool Championship { get; private set; }
        public int CelebrationCount { get; private set; }
        public bool Animating => !restored && Winner != null && stage.Motion > 0 && Time.unscaledTime - victoryAt < Duration;
        float Duration => Championship ? 6 : 3;
        ArenaStage stage;
        ArenaDuelController duel;
        TMP_Text heading, footer, winnerLabel;
        string roundKey, resultKey;
        float pageAt, victoryAt;
        bool restored;
        MaterialPropertyBlock properties;
        readonly System.Collections.Generic.List<Renderer> surfaces=new System.Collections.Generic.List<Renderer>();

        public void Create(ArenaStage owner, Transform architecture)
        {
            stage = owner; properties = new MaterialPropertyBlock();
            foreach (var r in architecture.GetComponentsInChildren<Renderer>())
                if (r.sharedMaterial && r.sharedMaterial.shader.name == "QuQu/Galaxy Floor") surfaces.Add(r);
            if (surfaces.Count==0) throw new InvalidOperationException("Galaxy floor surface was not imported");
            heading = Label("Question screen heading", new Vector3(0, 7.12f, 6.52f), new Vector2(11.4f, .45f), .25f, new Color(.38f, .87f, 1));
            heading.text = "QUQU ARENA  /  银河竞技场";
            Question = Label("Live question", new Vector3(0, 5.17f, 6.51f), new Vector2(11.25f, 3.25f), .43f, new Color(.9f, .95f, 1));
            Question.alignment = TextAlignmentOptions.TopLeft;
            Question.overflowMode = TextOverflowModes.Page;
            Question.textWrappingMode = TextWrappingModes.Normal;
            Question.lineSpacing = 8;
            footer = Label("Question screen footer", new Vector3(0, 3.02f, 6.50f), new Vector2(11.4f, .36f), .22f, new Color(.5f, .72f, .83f));
            winnerLabel = Label("Winner floor identity", new Vector3(0, .07f, -2.65f), new Vector2(8, 1.2f), .65f, Color.white);
            winnerLabel.transform.localRotation = Quaternion.Euler(90, 0, 0);
            ResetDisplay();
        }

        TMP_Text Label(string name, Vector3 position, Vector2 size, float fontSize, Color color)
        {
            var go = new GameObject(name); go.transform.SetParent(transform, false); go.transform.localPosition = position;
            var text = go.AddComponent<TextMeshPro>(); text.font = Resources.Load<TMP_FontAsset>("ArenaFont");
            text.fontSize = fontSize * 10; text.color = color; text.alignment = TextAlignmentOptions.Center;
            text.rectTransform.sizeDelta = size; text.richText = false; text.enableAutoSizing = false;
            text.overflowMode = TextOverflowModes.Ellipsis;
            text.renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return text;
        }

        public void Bind(ArenaDuelController controller)
        {
            duel = controller; duel.RoundUpdated += ShowRound; duel.PresentationReset += ResetDisplay; duel.ResultPresented += ShowResult;
        }
        public void ShowRound(CompetitionRound round)
        {
            string key = duel.DuelId + "/" + round.id;
            string input = round.question?.task?.input ?? "等待题目…";
            if (roundKey == key && Question.text == input) return;
            roundKey = key; Question.text = input; Question.pageToDisplay = 1;
            stage.SetCombatCamera(true);
            Question.ForceMeshUpdate(); pageAt = Time.unscaledTime;
        }
        public void ResetDisplay()
        {
            roundKey = resultKey = Winner = null; Championship = restored = false;
            Question.text = "等待开赛\n双方将在这里看到同一道题目"; Question.pageToDisplay = 1; Question.ForceMeshUpdate();
            pageAt = Time.unscaledTime; winnerLabel.text = "";
            properties.Clear(); properties.SetFloat("_Victory", 0); foreach(var surface in surfaces)surface.SetPropertyBlock(properties);
        }
        public void ShowResult(ArenaDuelResult result)
        {
            if (string.IsNullOrEmpty(result.Winner)) return;
            var fighter = stage.Fighters.Find(f => f.State.Id == result.Winner);
            if (!fighter) return;
            string key = result.CompetitionId + "/" + result.DuelId + "/" + result.Winner;
            if (resultKey == key && (!result.Championship || Championship)) return;
            bool promotion = resultKey == key;
            resultKey = key; Winner = result.Winner; Championship = result.Championship; restored = result.Restored;
            if (!promotion) { victoryAt = Time.unscaledTime; if (!restored && stage.Motion > 0) CelebrationCount++; }
            var preset = ArenaModelPresets.Match(fighter.State.Id, fighter.State.Name) ?? ArenaModelPresets.Find(fighter.Look.presetId);
            int emblem = preset == null ? 0 : Array.IndexOf(ArenaModelPresets.All, preset) + 1;
            properties.SetVector("_Origin", fighter.transform.position);
            properties.SetColor("_WinnerColor", fighter.Tint);
            properties.SetFloat("_Emblem", emblem);
            winnerLabel.color = fighter.Tint;
            winnerLabel.text = (Championship ? "冠军  /  " : "胜者  /  ") + fighter.State.Name;
        }
        void LateUpdate()
        {
            if (!Question) return;
            if (PageCount > 1 && Time.unscaledTime - pageAt >= 8)
            { Question.pageToDisplay = Page % PageCount + 1; pageAt = Time.unscaledTime; }
            if (duel)
            {
                heading.text = duel.Round == null ? "QUQU ARENA  /  银河竞技场" : (duel.Round.overtime ? "加赛 " : "第 ") + duel.Round.index + " 题  /  " + Phase(duel.PresentedPhase);
                footer.text = "双方同时作答                                      " + Page + " / " + PageCount + "  ·  8 秒翻页";
            }
            properties.SetFloat("_Clock", Animating ? Time.unscaledTime - victoryAt : Duration);
            properties.SetFloat("_ShowTime", stage.LightShow ? stage.LightShow.Clock : 0);
            if (Winner != null)
            {
                var winner = stage.Fighters.Find(f => f.State.Id == Winner);
                if (winner) { properties.SetVector("_Origin", winner.transform.position); properties.SetColor("_WinnerColor", winner.Tint); winnerLabel.color = winner.Tint; }
                properties.SetFloat("_Victory", 1);
                properties.SetFloat("_Progress", Animating ? Mathf.Clamp01((Time.unscaledTime - victoryAt) / Duration) : 1);
                properties.SetFloat("_Champion", Championship ? 1 : 0);
            }
            foreach(var surface in surfaces)surface.SetPropertyBlock(properties);
        }
        static string Phase(string phase) => phase switch { "solving" => "正在作答", "judging" => "正在判分", "clash" => "交锋", "result" => "本题结果", "completed" => "已结算", "intermission" => "场间休息", _ => "等待比赛" };
        void OnDestroy()
        {
            if (duel) { duel.RoundUpdated -= ShowRound; duel.PresentationReset -= ResetDisplay; duel.ResultPresented -= ShowResult; }
        }
    }
    public readonly struct ArenaDuelResult
    {
        public readonly string CompetitionId, DuelId, Winner;
        public readonly bool Championship, Restored;
        public ArenaDuelResult(string competitionId, string duelId, string winner, bool championship, bool restored)
        { CompetitionId = competitionId; DuelId = duelId; Winner = winner; Championship = championship; Restored = restored; }
    }
}
