// Alpha round 001 -- real-time paging rotation check for StationQuestionBoard.
// The coordinator writes one stage word into timing-mode.txt next to this file and calls
// eval_file once per stage, roughly 3.5s, 8.7s and 8.5s apart. No stage blocks or waits.
// Run:
//   unity command eval_file E:/projects/黑洞空间站/.cache/alpha-round-001/question-timing-check.cs 30000 \
//     --project-path 'E:/projects/黑洞空间站/QuQuArena3D' --caller plugin --skill unity-cli --timeout 40 --format json

const string modePath = "../.cache/alpha-round-001/timing-mode.txt";
const string boardName = "AlphaRound001_QuestionTimingCheck";

var mode = (System.IO.File.Exists(modePath) ? System.IO.File.ReadAllText(modePath) : "").Trim().ToLowerInvariant();
var startedAt = UnityEngine.Time.unscaledTime;
var rows = new System.Collections.Generic.List<string>();
var failed = 0;

void Check(string name, bool ok, string actual, string expected)
{
    rows.Add(name + " | passed=" + ok + " | actual=" + actual + " | expected=" + expected);
    if (!ok) failed++;
}

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

QuQu.StationQuestionBoard Board()
{
    var go = UnityEngine.GameObject.Find(boardName);
    return go ? go.GetComponent<QuQu.StationQuestionBoard>() : null;
}

TMPro.TMP_Text Label(string label)
{
    var go = UnityEngine.GameObject.Find(boardName);
    if (!go) return null;
    foreach (var text in go.GetComponentsInChildren<TMPro.TMP_Text>())
        if (text.name == label) return text;
    return null;
}

Check("mode.file-readable", mode.Length > 0,
    mode.Length == 0 ? (System.IO.File.Exists(modePath) ? "empty" : "missing") : mode,
    "a stage word from timing-mode.txt");

var pages = -1;
var reusedExistingBoard = false;

if (mode == "start")
{
    var go = UnityEngine.GameObject.Find(boardName);
    reusedExistingBoard = go != null;
    if (!go) go = new UnityEngine.GameObject(boardName);
    var board = go.GetComponent<QuQu.StationQuestionBoard>();
    if (!board) board = go.AddComponent<QuQu.StationQuestionBoard>();
    Check("start.board-ready", board != null, board != null ? "ready" : "null", "ready");

    board.Show("D1", "R1", 1, longText, "ALPHA", "BRAVO", "STATUS_START");
    var question = Label("Station full question");
    Check("start.question-label-found", question != null, question != null ? "found" : "null", "found");
    pages = question == null ? -1 : UnityEngine.Mathf.Max(1, question.textInfo.pageCount);
    Check("start.long-text-paginates", pages > 1, pages.ToString(), "> 1");
    Check("start.settles-on-page-1", question != null && question.pageToDisplay == 1,
        question == null ? "null" : question.pageToDisplay.ToString(), "1");
}
else if (mode == "switch")
{
    var board = Board();
    var question = Label("Station full question");
    var heading = Label("Station round heading");
    Check("switch.board-present", board != null && question != null,
        "board=" + (board != null) + ", question=" + (question != null), "board=True, question=True");
    if (board != null && question != null)
    {
        board.Show("D1", "R2", 2, longText, "CHARLIE", "DELTA", "STATUS_SWITCH");
        Check("switch.page-still-1", question.pageToDisplay == 1,
            question.pageToDisplay.ToString(), "1");
        Check("switch.heading-follows-new-status",
            heading != null && heading.text.Contains("STATUS_SWITCH"),
            heading == null ? "null" : heading.text, "contains STATUS_SWITCH");
        Check("switch.body-unchanged", question.text.StartsWith("PRIMARYLINE"),
            question.text.Substring(0, 20), "PRIMARYLINE001 QUQU A RE");
    }
}
else if (mode == "check")
{
    var board = Board();
    var question = Label("Station full question");
    var heading = Label("Station round heading");
    var footer = Label("Station score footer");
    Check("check.board-present", board != null && question != null,
        "board=" + (board != null) + ", question=" + (question != null), "board=True, question=True");
    if (board != null && question != null)
    {
        pages = UnityEngine.Mathf.Max(1, question.textInfo.pageCount);
        Check("check.rotation-advanced-to-page-2", question.pageToDisplay == 2,
            question.pageToDisplay.ToString(), "2");
        Check("check.footer-shows-new-vs",
            footer != null && footer.text.Contains("CHARLIE") && footer.text.Contains("DELTA"),
            footer == null ? "null" : footer.text, "contains CHARLIE and DELTA");
        Check("check.heading-still-current",
            heading != null && heading.text.Contains("STATUS_SWITCH"),
            heading == null ? "null" : heading.text, "contains STATUS_SWITCH");

        board.Show("D1", "R3", 3, otherText, "CHARLIE", "DELTA", "STATUS_WRAP");
        Check("check.new-text-resets-to-page-1", question.pageToDisplay == 1,
            question.pageToDisplay.ToString(), "1");
        pages = UnityEngine.Mathf.Max(1, question.textInfo.pageCount);
        question.pageToDisplay = pages;
        Check("check.prepared-last-page", question.pageToDisplay == pages,
            question.pageToDisplay.ToString(), pages.ToString());
    }
}
else if (mode == "wrap")
{
    var question = Label("Station full question");
    var footer = Label("Station score footer");
    Check("wrap.board-present", question != null, question != null ? "found" : "null", "found");
    if (question != null)
    {
        pages = UnityEngine.Mathf.Max(1, question.textInfo.pageCount);
        Check("wrap.wrapped-back-to-page-1", question.pageToDisplay == 1,
            question.pageToDisplay.ToString(), "1");
        Check("wrap.footer-page-indicator-is-1",
            footer != null && footer.text.Contains("1 / " + pages),
            footer == null ? "null" : footer.text, "contains 1 / " + pages);
    }
}
else if (mode == "cleanup")
{
    var go = UnityEngine.GameObject.Find(boardName);
    Check("cleanup.object-present-before-delete", go != null,
        go != null ? "present" : "missing", "present");
    if (go != null) UnityEngine.Object.DestroyImmediate(go);
    Check("cleanup.object-removed", UnityEngine.GameObject.Find(boardName) == null,
        UnityEngine.GameObject.Find(boardName) == null ? "null" : "present", "null");
}
else
{
    Check("mode.known-stage", false, mode.Length == 0 ? "none" : mode,
        "start, switch, check, wrap or cleanup");
}

return new
{
    mode,
    passed = failed == 0,
    failed,
    checks = rows.ToArray(),
    pageCount = pages,
    startedAt,
    elapsedSeconds = UnityEngine.Time.unscaledTime - startedAt,
    unity = UnityEngine.Application.unityVersion,
    playMode = UnityEngine.Application.isPlaying,
    scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene().name,
    reusedExistingBoard,
    note = "one short synchronous stage per call; the 8s rotation is observed between calls, never awaited here"
};
