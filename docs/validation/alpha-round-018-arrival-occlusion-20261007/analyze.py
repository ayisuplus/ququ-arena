"""Summarize stored mesh-hit samples; this does not measure rendered pixel visibility."""
import collections
import json
from pathlib import Path

root = Path(__file__).resolve().parent
data = json.loads((root / "measurement-v2/occlusion.json").read_text(encoding="utf-8"))
assert data["sampling"]["rays"] == 4000
assert data["sampling"]["nonTarget"] + data["sampling"]["belowUpper"] + len(data["rows"]) == 4000
assert data["calibration"]["frontProbe"] and data["calibration"]["frontTriangle"] == 0
bands = collections.defaultdict(collections.Counter)
blockers = collections.Counter()
examples = []
canopy_hits = []
for row in data["rows"]:
    counts = bands[row["band"]]
    counts["samples"] += 1
    assert row["validTarget"] == (row["target"]["surface"] == "opaque" and row["target"]["facingAccepted"])
    assert all(h["distance"] < row["target"]["distance"] - .005 for h in row["foreground"])
    assert [h["distance"] for h in row["foreground"]] == sorted(h["distance"] for h in row["foreground"])
    if not row["validTarget"]:
        counts["invalid_or_unknown_target"] += 1
        continue
    counts["valid_target"] += 1
    opaque = [h for h in row["foreground"] if h["surface"] == "opaque" and h["facingAccepted"]]
    uncertain = [h for h in row["foreground"] if h["surface"] not in ("opaque", "transparent") or not h["facingAccepted"]]
    counts["with_uncertain_foreground"] += bool(uncertain)
    counts["with_transparent_foreground"] += any(h["surface"] == "transparent" for h in row["foreground"])
    if not opaque:
        counts["no_accepted_opaque_hit"] += 1
        continue
    nearest = opaque[0]
    counts["accepted_opaque_blocker"] += 1
    blockers[data["renderers"][nearest["renderer"]]["path"]] += 1
    if nearest["isCanopy"]:
        counts["nearest_accepted_opaque_is_canopy"] += 1
        canopy_hits.append(nearest)
        examples.append({"x": row["x"], "y": row["y"], "band": row["band"], "target": row["target"], "nearestAcceptedOpaque": nearest})

assert sum(c["samples"] for c in bands.values()) == len(data["rows"])
assert canopy_hits, "No accepted canopy/target obstruction; do not claim one."
summary = {
    "scope": "Current edit-mode sampled geometry; no pixel-area, Player-replay or artistic verdict",
    "bands": dict(bands),
    "nearestAcceptedOpaqueBlockers": dict(blockers),
    "canopySideSamples": dict(collections.Counter("below124" if h["angle"] < 124 else "above128" if h["angle"] > 128 else "opening-boundary" for h in canopy_hits)),
    "canopyIntersectionRange": {key: [min(h[key] for h in canopy_hits), max(h[key] for h in canopy_hits)] for key in ("angle", "radius", "distance")},
    "examples": [examples[0], examples[len(examples)//2], examples[-1]],
    "verifiedSamples": len(data["rows"]),
}
(root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: v for k, v in summary.items() if k != "examples"}, ensure_ascii=False, indent=2))
