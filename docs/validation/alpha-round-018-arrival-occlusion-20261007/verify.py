"""Check archived native completion, preserved state and current referenced asset bytes."""
import hashlib
import json
import math
import struct
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parents[2]
def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

data = read(root / "measurement-v2/occlusion.json")
native = read(root / "receipts/v2-native-telemetry.json")
assert native["command"] == "eval_file" and native["success"] is True
assert native["executionTimeMs"] == 7141
state = read(root / "receipts/v2-final-state.json")
assert state["success"] and state["data"]["result"]["success"]
state = state["data"]["result"]["result"]
assert state["roots"] == 12 and not state["isDirty"] and not state["playing"] and state["temporary"] == 0
preserved = read(root / "receipts/preservation.json")
assert all(preserved[k] for k in ("headUnchanged", "indexUnchanged", "sceneUnchanged", "canopyUnchanged"))
assert preserved["trackedDiff"] == []
before = read(root / "receipts/before.json")
assert sha(repo / "QuQuArena3D/Assets/Station/Scenes/Candidates/BlackHoleStationDistrictsV019.unity") == before["sceneSha256"].lower()
assert sha(repo / "QuQuArena3D/Assets/Station/Models/ArrivalV019v001/Research-canopy-open-v001.asset") == before["canopySha256"].lower()
canopy = next(r for r in data["renderers"] if r["path"].endswith("/Research folded linking canopy"))
canopy_path = "QuQuArena3D/" + canopy["mesh"]["path"]
baseline_blob = subprocess.check_output(["git", "show", before["head"] + ":" + canopy_path], cwd=repo)
assert hashlib.sha256(baseline_blob).hexdigest() == canopy["mesh"]["sha256"] == sha(repo / canopy_path)
png = (root / "measurement-v2/arrival-edit-mode.png").read_bytes()
assert png[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", png[16:24]) == (1600, 1000)
assets = {}
for renderer in data["renderers"]:
    for asset in [renderer["mesh"], *(m["asset"] for m in renderer["materials"] if m)]:
        if asset["sha256"]:
            assert asset["path"] not in assets or assets[asset["path"]] == asset["sha256"]
            assets[asset["path"]] = asset["sha256"]
for path, expected in assets.items():
    assert sha(repo / "QuQuArena3D" / path) == expected, path
assert len(data["rows"]) == data["sampling"]["structuralSamples"] == 207
def multiply(matrix, vector):
    return [sum(matrix[c * 4 + r] * vector[c] for c in range(4)) for r in range(4)]

max_pixel_error = max_ray_error = 0.0
for row in data["rows"]:
    for hit in [row["target"], *row["foreground"]]:
        ray_point = [o + hit["distance"] * d for o, d in zip(row["origin"], row["direction"])]
        max_ray_error = max(max_ray_error, math.dist(ray_point, hit["point"]))
        view = multiply(data["camera"]["worldToCameraColumnMajor"], hit["point"] + [1])
        clip = multiply(data["camera"]["projectionColumnMajor"], view)
        pixel = [(clip[i] / clip[3] + 1) * size / 2 for i, size in enumerate((1600, 1000))]
        max_pixel_error = max(max_pixel_error, math.dist(pixel, [row["x"], row["y"]]))
# The native rays and serialized Unity matrices use floats; require subpixel
# agreement (0.1px, versus the 20px sampling step), not exact inversion.
assert max_ray_error < .0001 and max_pixel_error < .1
print(json.dumps({"verified": True, "nativeExecutionMs": native["executionTimeMs"], "referencedAssetHashesChecked": len(assets), "structuralSamples": len(data["rows"]), "pngDimensions": [1600, 1000], "maxRayPointErrorMetres": max_ray_error, "maxProjectionErrorPixels": max_pixel_error, "actualCanopySha256MatchesBaseline": canopy["mesh"]["sha256"], "baselineHead": before["head"]}, indent=2))
