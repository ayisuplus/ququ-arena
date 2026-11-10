using TMPro;
using UnityEngine;

namespace QuQu
{
    // A physical reading wall for the same public round as the existing research desk.
    public sealed class StationResearchArchive : MonoBehaviour
    {
        public StationResearchDesk Desk;
        public TMP_Text Question;
        public TMP_Text[] Answers;
        float nextRefresh;

        void Update()
        {
            if (Time.unscaledTime < nextRefresh) return;
            nextRefresh = Time.unscaledTime + .5f;
            Refresh();
        }

        public void Refresh()
        {
            var match = Desk ? Desk.Match : null;
            var round = match ? match.CurrentRound : null;
            Set(Question, "公开赛题档案\n\n" + (match ? match.Status : "未连接") + "\n\n" +
                (round == null ? "当前没有可查阅的赛题。" :
                    "第 " + round.index + " 题\n\n" + (round.question?.task?.input ?? "赛题尚未同步")));
            for (int i = 0; i < Answers.Length; i++)
            {
                var answer = round != null && round.settled && round.records != null && i < round.records.Length
                    ? round.records[i] : null;
                Set(Answers[i], answer == null ? "公开答卷\n\n" +
                    (round == null ? "等待赛事资料" : !round.settled ? "答卷与评分等待服务端结算。" : "无公开答卷") :
                    match.DisplayName(answer.model) + " · " + answer.score.ToString("0.##") + " 分\n\n" +
                    (string.IsNullOrWhiteSpace(answer.answer) ? answer.error ?? "无公开答卷" : answer.answer));
            }
        }

        static void Set(TMP_Text label, string text)
        {
            if (label.text != text) label.text = text;
        }
    }
}
