using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace QuQu
{
    /** 答题台面板（P2 UI 构建收口）：右侧题目/作答/推理区的构建与内容刷新。
     *  代码自 ArenaUI 逐行移出（含 FitAnswer/SetQuestion 的滚动高度算法），像素不变。 */
    public sealed class ArenaAnswerDesk
    {
        RectTransform answerContent;

        public void Build(ArenaUI ui, IArenaCommands commands)
        {
            ui.Right = ui.Box(ui.Root, "Answer desk", ArenaLayout.DeskX, ArenaLayout.DeskY, ArenaLayout.DeskW, ArenaLayout.DeskH, ArenaLayout.Panel);
            ui.Round = ui.Label(ui.Right, "LIVE / 等待开赛", 20, 18, 370, 30, 17, ui.Accent);
            var questionContent = ui.Scroll(ui.Right, 20, 58, 370, ArenaLayout.QuestionMinH);
            ui.Question = ui.Label(questionContent, "选择题库和模型，开始一场真实比赛。", 0, 0, ArenaLayout.DeskInnerW, ArenaLayout.QuestionMinH, 20);
            ui.Question.overflowMode = TextOverflowModes.Overflow;
            ui.Label(ui.Right, "当前选手的回答", 20, 196, 370, 26, 15, ArenaLayout.Muted);
            answerContent = ui.Scroll(ui.Right, 20, 232, 370, 292);
            ui.Answer = ui.Label(answerContent, "点击左侧选手，查看它的作答。", 0, 0, ArenaLayout.DeskInnerW, 290, 18);
            ui.Answer.overflowMode = TextOverflowModes.Overflow;
            ui.Button(ui.Right, "回答 / 公开推理", 20, 546, 176, commands.ToggleReasoning);
            ui.Button(ui.Right, "完整答卷", 210, 546, 178, () => commands.History(true));
        }

        /** 只渲染当前选中选手的作答/推理（原 ArenaUI.Refresh 的选中分支）。 */
        public void Render(ArenaUI ui, List<ArenaFighter> fighters, string selected, bool reasoning)
        {
            foreach (var f in fighters)
            {
                if (f.State.Id != selected) continue;
                var value = reasoning ? f.State.Reasoning : f.State.Answer;
                if (string.IsNullOrEmpty(value)) value = reasoning ? "接口尚未提供公开推理内容。" : "等待回答…";
                value = f.State.Name + " · " + f.State.TaskId + "\n\n" + value + (string.IsNullOrEmpty(f.State.Note) ? "" : "\n\n" + f.State.Note);
                if (value.Length > 24000) value = value.Substring(0, 24000) + "\n\n（内容较长，请点完整答卷查看。）";
                if (ui.Answer.text != value) { ui.Answer.text = value; Fit(ui); }
            }
        }

        public void SetQuestion(ArenaUI ui, string text)
        {
            ui.Question.text = text ?? "";
            float height = Mathf.Max(ArenaLayout.QuestionMinH, ui.Question.GetPreferredValues(ui.Question.text, ArenaLayout.DeskInnerW, 0).y + 12);
            ui.Question.rectTransform.sizeDelta = new Vector2(ArenaLayout.DeskInnerW, height);
            ((RectTransform)ui.Question.transform.parent).sizeDelta = new Vector2(ArenaLayout.DeskScrollW, height);
        }

        public void Fit(ArenaUI ui)
        {
            float height = Mathf.Max(ArenaLayout.AnswerMinH, ui.Answer.GetPreferredValues(ui.Answer.text, ArenaLayout.DeskInnerW, 0).y + 30);
            ui.Answer.rectTransform.sizeDelta = new Vector2(ArenaLayout.DeskInnerW, height);
            answerContent.sizeDelta = new Vector2(ArenaLayout.DeskScrollW, height);
        }
    }
}
