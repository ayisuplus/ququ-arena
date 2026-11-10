"""Verify archived observations, including the preserved failed strict harness.

Run with Python 3 from any directory. Private copy sources are checked only
when --private-source points to the authoritative Alpha checkout.
This does not execute Alpha/Unity or establish candidate acceptance.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
GAME = ROOT.parents[2]


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def check(condition, label):
    if not condition:
        raise AssertionError(label)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--private-source", type=Path)
args = parser.parse_args()
r = read(ROOT / "receipts/receipt.json")
check(r["requests"] == 1 and r["retry"] is False, "single task, retry off")
check(r["responseModels"] == ["opencode-go/mimo-v2.6-pro"], "provider/model")
check(r["native"] == dict(status="completed", agentInvoked=True,
                         sessionSettled=True, hasError=False), "native completion")
check(r["after"]["messageCount"] - r["before"]["messageCount"] == 21, "message delta")
check(r["after"]["isSettled"] and not r["after"]["isStreaming"]
      and not r["after"]["hasPendingAsyncWork"]
      and r["after"]["queuedMessageCount"] == 0, "final idle")
check(r["game"]["before"] == r["game"]["after"]
      and r["game"]["after"]["status"] == "", "task Git unchanged")
check(r["configUnchanged"] and r["tools"]["restoreExact"], "config/tool restoration")
ready = read(ROOT / "receipts/readiness.json")
check(r["tools"]["restored"] == ready["previousTools"], "restored original tool collection")
check(ready["retryDisabled"] and ready["restricted"] == dict(
    enabled=["read", "bash"], active=["read", "bash"], mounted=[]), "task tool restriction")
check(r["latestSnapshot"]["changed"] == [], "snapshot changed set")

calls = read(ROOT / "raw/tool-transcript.json")
check(len(calls) == 11 and sum(c["isError"] for c in calls) == 1, "actual tool outcomes")
names = [c["toolName"] for c in calls]
check(names.count("read") == 6 and names.count("bash") == 5, "actual tool names")
check(names == r["tools"]["names"], "receipt matches tool transcript")
check(read(ROOT / "receipts/probe-exit.json")["exitCode"] == 1, "preserved strict failure")
query = read(ROOT / "receipts/alpha-unity-query.json")
check(query["outerSuccess"] and query["native"]["success"], "nested Unity query success")
raw_call = next(c for c in calls if c["toolCallId"] == query["toolCallId"])
raw_text = raw_call["content"][0]["text"]
check(raw_text.startswith("eval\ttrue\t"), "query outer success from raw TSV")
raw_query, _ = json.JSONDecoder().raw_decode(raw_text.split("\t", 2)[2])
raw_query["result"] = raw_query["result"].replace("\\r\\n", "\r\n")
check(raw_query == query["native"], "parsed query matches native raw result")
editor = read(ROOT / "receipts/editor-after.json")
check(editor["success"] and editor["data"]["result"]["success"], "editor API success")
scene = editor["data"]["result"]["result"]
check(not scene["isDirty"] and not scene["playing"] and not scene["compiling"]
      and scene["roots"] == 12 and scene["path"].endswith("BlackHoleStationDistrictsV019.unity"),
      "recorded editor state")

proof = read(ROOT / "receipts/copy-proof.json")["files"]
for item in proof:
    data = (ROOT / item["target"]).read_bytes()
    check(len(data) == item["bytes"] and sha(data) == item["sha256"], item["target"])
    if args.private_source:
        source = args.private_source / item["source"].replace("\\", "/")
        check(data == source.read_bytes(), "private source: " + item["target"])
for image in read(ROOT / "receipts/image-payloads.json")["images"]:
    data = (ROOT / "images" / image["file"]).read_bytes()
    check(sha(data) == image["sha256"] and len(data) == image["bytes"], "image bytes")
    check(sha(base64.b64encode(data)) == image["encodedSha256"], "native encoded image")
for original in r["imageReads"]:
    data = Path(original["path"]).read_bytes()
    check(sha(data) == original["sha256"], "original input image")

states = [json.loads(line) for line in (ROOT / "raw/states.jsonl").read_text().splitlines()]
pre = [s for s in states if not s["accepted"]]
check(len(pre) == 62 and all(not s["isSettled"] and s["hasPendingAsyncWork"] for s in pre),
      "no observed preparation false idle")
baseline = read(ROOT.parent / "alpha-round-018-arrival-occlusion-20261007/measurement-v2/occlusion.json")
canopy = []
for row in baseline["rows"]:
    accepted = sorted((f for f in row["foreground"] if f["surface"] == "opaque"
                       and f["facingAccepted"]), key=lambda f: f["distance"])
    if row["validTarget"] and accepted and accepted[0]["isCanopy"]:
        canopy.append((row, accepted[0]))
check(len(baseline["rows"]) == 207 and len(canopy) == 68, "baseline population")
check(sum(hit["angle"] < 115 + 22 / 3 for _, hit in canopy) == 0, "old criterion already zero")
targets = [(row, hit) for row, hit in canopy if hit["angle"] < 124]
check(len(targets) == 61 and all(row["band"] == "crown" for row, _ in targets), "fixed target population")
diff = subprocess.check_output(["git", "diff", "c21c4dc3d00764932457199735697d7f34223b8e",
                                "--", "QuQuArena3D"], cwd=GAME)
check(not diff, "Unity tracked business source unchanged")
manifest_path = ROOT / "manifest.json"
if manifest_path.exists():
    manifest = read(manifest_path)
    actual = {p.relative_to(ROOT).as_posix() for p in ROOT.rglob("*")
              if p.is_file() and p != manifest_path}
    check(actual == {f["path"] for f in manifest["files"]}, "manifest coverage")
    for item in manifest["files"]:
        data = (ROOT / item["path"]).read_bytes()
        check(sha(data) == item["sha256"] and len(data) == item["bytes"], item["path"])
print(json.dumps(dict(archiveChecks="passed", strictHarnessExit=1, nativeTask="completed",
                     toolCalls=11, toolErrors=1, copiedFiles=len(proof),
                     privateSourcesChecked=bool(args.private_source),
                     candidateAcceptance="not established", playerRun=False), indent=2))
