using TMPro;
using UnityEngine;

namespace QuQu
{
    // World-space question board for the separate station scene. The app supplies presented state.
    public sealed class StationQuestionBoard : MonoBehaviour
    {
        TMP_Text heading, question, footer;
        string duelKey, phase;
        float pageAt;

        void Awake()
        {
            var font = Resources.Load<TMP_FontAsset>("ArenaFont");
            heading = Label("Station round heading", new Vector3(1.5f, 6.2f, .04f), new Vector2(8.5f, .55f), 3.5f, new Color(.38f, .87f, 1), font);
            question = Label("Station full question", new Vector3(1.5f, 4.9f, .04f), new Vector2(8.5f, 1.9f), 4.3f, new Color(.9f, .95f, 1), font);
            question.alignment = TextAlignmentOptions.TopLeft;
            question.overflowMode = TextOverflowModes.Page;
            question.textWrappingMode = TextWrappingModes.Normal;
            question.lineSpacing = 8;
            footer = Label("Station score footer", new Vector3(1.5f, 3.9f, .04f), new Vector2(8.5f, .5f), 3f, new Color(.7f, .83f, .9f), font);
            question.text = "等待开赛";
            question.ForceMeshUpdate();
            pageAt = Time.unscaledTime;
        }

        TMP_Text Label(string title, Vector3 position, Vector2 size, float fontSize, Color color, TMP_FontAsset font)
        {
            var go = new GameObject(title);
            go.transform.SetParent(transform, false);
            go.transform.localPosition = position;
            go.transform.localRotation = Quaternion.Euler(0, 180, 0);
            var label = go.AddComponent<TextMeshPro>();
            label.font = font;
            label.fontSize = fontSize;
            label.color = color;
            label.alignment = TextAlignmentOptions.Center;
            label.rectTransform.sizeDelta = size;
            label.richText = false;
            label.enableAutoSizing = false;
            label.overflowMode = TextOverflowModes.Ellipsis;
            label.renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return label;
        }

        public void Show(string duelId, string roundId, int roundIndex, string input,
            string left, string right, string status)
        {
            var duel = duelId ?? "";
            input = string.IsNullOrEmpty(input) ? "等待赛题" : input;
            if (duelKey != duel || question.text != input)
            {
                duelKey = duel;
                question.text = input;
                question.pageToDisplay = 1;
                question.ForceMeshUpdate();
                pageAt = Time.unscaledTime;
            }
            var title = roundIndex > 0 ? "第 " + roundIndex + " 题  /  " + status : status;
            if (heading.text != title) heading.text = title;
            phase = left + "    VS    " + right;
        }

        void LateUpdate()
        {
            if (!question) return;
            var pages = Mathf.Max(1, question.textInfo.pageCount);
            if (pages > 1 && Time.unscaledTime - pageAt >= 8)
            {
                question.pageToDisplay = question.pageToDisplay % pages + 1;
                pageAt = Time.unscaledTime;
            }
            var detail = phase + "    " + question.pageToDisplay + " / " + pages;
            if (footer.text != detail) footer.text = detail;
        }
    }
}
