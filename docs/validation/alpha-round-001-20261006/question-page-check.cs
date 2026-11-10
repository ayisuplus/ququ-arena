// Alpha round 001 -- StationQuestionBoard paging behaviour, live Play Mode session.
// Expected on the current unfixed source: passed=false with exactly one failing check,
// 1-same-duel.same-text.new-round-keeps-page-2.
// Run:
//   unity command eval_file E:/projects/黑洞空间站/.cache/alpha-round-001/question-page-check.cs 30000 \
//     --project-path 'E:/projects/黑洞空间站/QuQuArena3D' --caller plugin --skill unity-cli --timeout 40 --format json

var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
var dirtyBefore = scene.isDirty;
var started = UnityEngine.Time.unscaledTime;
var rows = new System.Collections.Generic.List<string>();
var deferred = new System.Collections.Generic.List<string>();
var failed = 0;

void Check(string name, bool ok, string actual, string expected)
{
    rows.Add(name + " | passed=" + ok + " | actual=" + actual + " | expected=" + expected);
    if (!ok) failed++;
}

object Report(string note, int pageCount = -1) => new
{
    passed = failed == 0,
    failed,
    checks = rows.ToArray(),
    deferred = deferred.ToArray(),
    unity = UnityEngine.Application.unityVersion,
    scene = scene.name,
    sceneDirtyBefore = dirtyBefore,
    sceneDirtyAfter = scene.isDirty,
    elapsedSeconds = UnityEngine.Time.unscaledTime - started,
    questionPageCount = pageCount,
    note
};

System.Func<string, int, string> Lines = (tag, count) =>
{
    var b = new System.Text.StringBuilder();
    for (int i = 1; i <= count; i++)
        b.Append(tag).Append(i.ToString("D3"))
         .Append(" QUQU ARENA STATION READING BODY ASCII 0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ\n");
    return b.ToString();
};

var longText = Lines("PRIMARYLINE", 48);
var otherText = Lines("SECONDLINE", 48);
var placeholder = new string(new char[] { '\u7B49', '\u5F85', '\u8D5B', '\u9898' });

Check("premise.play-mode", UnityEngine.Application.isPlaying,
    UnityEngine.Application.isPlaying.ToString(), "True");
if (!UnityEngine.Application.isPlaying) return Report("not in Play Mode; nothing was created");

var go = new UnityEngine.GameObject("AlphaRound001_QuestionPageCheck");
var board = go.AddComponent<QuQu.StationQuestionBoard>();
TMPro.TMP_Text heading = null, question = null, footer = null;
foreach (var label in go.GetComponentsInChildren<TMPro.TMP_Text>())
{
    if (label.name == "Station round heading") heading = label;
    else if (label.name == "Station full question") question = label;
    else if (label.name == "Station score footer") footer = label;
}
Check("premise.tmp-labels-found", question != null && heading != null,
    "question=" + (question != null) + ", heading=" + (heading != null),
    "question=True, heading=True");
if (question == null)
{
    UnityEngine.Object.DestroyImmediate(go);
    return Report("TMP child labels not found; test object destroyed");
}

board.Show("D1", "R1", 1, longText, "ALPHA", "BRAVO", "STATUS_ONE");
var pages = UnityEngine.Mathf.Max(1, question.textInfo.pageCount);
Check("premise.long-ascii-text-paginates", pages > 1, pages.ToString(), "> 1");
Check("setup.first-show-settles-on-page-1", question.pageToDisplay == 1,
    question.pageToDisplay.ToString(), "1");

question.pageToDisplay = 2;
board.Show("D1", "R2", 2, longText, "ALPHA", "BRAVO", "STATUS_TWO");
Check("1-same-duel.same-text.new-round-keeps-page-2", question.pageToDisplay == 2,
    question.pageToDisplay.ToString(), "2");
Check("1-same-duel.heading-follows-round-and-status",
    heading.text.Contains("STATUS_TWO") && !heading.text.Contains("STATUS_ONE"),
    heading.text, "contains STATUS_TWO and not STATUS_ONE");

question.pageToDisplay = 2;
board.Show("D1", "R2", 2, longText, "CHARLIE", "DELTA", "STATUS_THREE");
Check("2-same-round.status-and-names-only-keeps-page-2", question.pageToDisplay == 2,
    question.pageToDisplay.ToString(), "2");
Check("2-same-round.heading-follows-new-status", heading.text.Contains("STATUS_THREE"),
    heading.text, "contains STATUS_THREE");

board.Show("D1", "R3", 3, null, "CHARLIE", "DELTA", "STATUS_FOUR");
Check("3-placeholder.null-resets-to-page-1", question.pageToDisplay == 1,
    question.pageToDisplay.ToString(), "1");
Check("3-placeholder.null-shows-placeholder-text", question.text == placeholder,
    question.text, placeholder);

board.Show("D1", "R3", 3, "", "CHARLIE", "DELTA", "STATUS_FIVE");
Check("4-placeholder.empty-normalizes-like-null",
    question.text == placeholder && question.pageToDisplay == 1,
    "text=" + question.text + ", page=" + question.pageToDisplay,
    "text=" + placeholder + ", page=1");

board.Show("D1", "R4", 4, longText, "CHARLIE", "DELTA", "STATUS_SIX");
Check("5-back-to-long-text.resets-to-page-1", question.pageToDisplay == 1,
    question.pageToDisplay.ToString(), "1");
Check("5-back-to-long-text.body-restored", question.text.StartsWith("PRIMARYLINE"),
    question.text.Substring(0, 20), "PRIMARYLINE001 QUQU A RE");

question.pageToDisplay = 2;
board.Show("D2", "R5", 5, longText, "CHARLIE", "DELTA", "STATUS_SEVEN");
Check("6-new-duel.same-text.resets-to-page-1", question.pageToDisplay == 1,
    question.pageToDisplay.ToString(), "1");

question.pageToDisplay = 2;
board.Show("D2", "R5", 5, otherText, "CHARLIE", "DELTA", "STATUS_EIGHT");
Check("7-new-question-text.resets-to-page-1", question.pageToDisplay == 1,
    question.pageToDisplay.ToString(), "1");
Check("7-new-question-text.body-replaced", question.text.StartsWith("SECONDLINE"),
    question.text.Substring(0, 20), "SECONDLINE001 QUQU ARE");

deferred.Add("footer VS line | observed=" + (footer == null ? "null" : footer.text) +
    " | reason=written by LateUpdate, which cannot run inside one blocking eval_file call");
deferred.Add("8 second auto rotation | reason=needs a frame-yielding run longer than 8s");
deferred.Add("elapsed=" + (UnityEngine.Time.unscaledTime - started).ToString("0.000") +
    "s | the 8s LateUpdate rotation could not have fired during this check");

UnityEngine.Object.DestroyImmediate(go);
Check("cleanup.test-object-removed",
    UnityEngine.GameObject.Find("AlphaRound001_QuestionPageCheck") == null,
    UnityEngine.GameObject.Find("AlphaRound001_QuestionPageCheck") == null ? "null" : "present",
    "null");

return Report("old source must fail only 1-same-duel.same-text.new-round-keeps-page-2; " +
    "no scene save, no asset edits, test object destroyed", pages);
