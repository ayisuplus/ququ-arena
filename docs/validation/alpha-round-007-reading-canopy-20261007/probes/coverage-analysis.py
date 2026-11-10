"""Round 7 read-only coverage analysis.

Answers one question: do the existing native Player probe camera views in
StationAnnexRenderProbeV018.cs actually look at the wood soffit underside of
"Reading curved linking canopy" closely enough to judge texture density?

Inputs are two real Unity CLI read-only receipts (no scene mutation):
  - canopy world AABB + material slots   (Newtonsoft JSON from `command eval`)
  - probe root transforms               (Newtonsoft JSON from `command eval`)

Camera contract taken from the probe source:
  camera world pos  = root.TransformPoint(eye)          (walker camera sits 1.63 m
                     above the walker, which the probe offsets by -1.63 m)
  camera forward    = normalize(root.TransformPoint(target) - camera pos)
                     (StationGrayboxWalker.Face: yaw from planar dir, pitch
                      = -atan2(dy, planar))
  FOV               = 65 deg vertical, capture RT 1600x1000

LIMITATION: this is a frustum-level coarse estimate and camera-candidate
screening only. It samples the canopy's rectangular world AABB as a plane, not
the real soffit triangles, and performs no occlusion, backface, material-slot or
rasterisation test. It cannot show that the oak slot is actually visible from a
given viewpoint, and it cannot prove any texture density is correct.
"""
import math

# --- receipt: canopy target -------------------------------------------------
CANOPY_CENTER = (-40.862, 5.132, 128.517)
CANOPY_SIZE = (31.350, 0.636, 15.858)          # world AABB, thin plate
SOFFIT_BOTTOM_Y = CANOPY_CENTER[1] - CANOPY_SIZE[1] / 2.0

# --- receipt: probe roots (position, yaw degrees) ---------------------------
ROOTS = {
    "R2 public planning deck": ((0.0, 0.0, 0.0), 0.0),
    "V019 reading court architecture": ((-31.2154, 0.0, 126.5545), 344.0),
    "V015 package - 06 study": ((-67.0, 0.0, 116.0474), 240.0),
    "V019 research court architecture": ((-81.3205, 0.0, -100.8512), 120.0),
    "V015 package - research main and entry canopy": ((-67.0, 0.0, -116.0474), 120.0),
    "V015 package - cafe and observation gallery": ((132.0, 0.0, 0.0), 0.0),
    "V019 cafe court architecture": ((132.0, 0.0, 0.0), 0.0),
    "V015 package - existing shared resident lounge": ((38.029, 0.0, -215.6729), 80.0),
    "V019 homes shared architecture": ((38.029, 0.0, -215.6729), 80.0),
    "R3 homes and ecology planning deck": ((0.0, 0.0, 0.0), 0.0),
    "V015 package - gemini glm kimi existing home group": ((-38.029, 0.0, -215.6729), 100.0),
}

# --- probe source: every view list in StationAnnexRenderProbeV018.cs ---------
D = "R2 public planning deck"
S = "V015 package - 06 study"
RC = "V019 reading court architecture"
RS = "V019 research court architecture"
RP = "V015 package - research main and entry canopy"
CF = "V015 package - cafe and observation gallery"
CC = "V019 cafe court architecture"
LO = "V015 package - existing shared resident lounge"
HS = "V019 homes shared architecture"
HD = "R3 homes and ecology planning deck"
GG = "V015 package - gemini glm kimi existing home group"

VIEWS = [
    ("districts-default", RS, "research-front", (-12, 1.7, 1), (-2, 6, -14)),
    ("districts-default", RS, "research-reading", (0, 1.7, -9), (-6, 1.4, -16)),
    ("districts-default", RS, "research-terrace", (-7, 10.5, -7.8), (4, 10, -7.8)),
    ("districts-default", RS, "research-upper", (1.8, 14.9, -12.9), (-0.5, 14.6, -16)),
    ("--station-reading-render", RC, "reading-front", (-21, 1.7, 18), (-5, 4, 28)),
    ("--station-reading-render", RC, "reading-room", (-3, 1.7, 24), (-10, 1.4, 30)),
    ("--station-reading-render", RC, "reading-terrace", (1, 8.9, 25), (-10, 8.6, 25.2)),
    ("--station-reading-render", RC, "reading-upper", (-3, 8.9, 29.5), (-10, 8.6, 31.5)),
    ("--station-reading-render", S, "reading-old-court", (-24, 1.7, 18), (0, 1.5, 13)),
    ("--station-reading-render", RC, "reading-side-window", (-27, 1.7, 29), (-10, 1.5, 29)),
    ("--station-reading-materials-render", D, "group-overview", (-119, 43, 59), (-47, 1, 121)),
    ("--station-reading-materials-render", D, "main-arrival", (-29.7, 1.7, 92), (-40, 3, 127)),
    ("--station-reading-materials-render", D, "new-entry", (-63.7142944, 1.7, 71.75638), (-80.01666, 4, 86.59292)),
    ("--station-reading-materials-render", D, "reading-wall", (-65, 1.7, 90), (-71, 2, 95)),
    ("--station-reading-materials-render", D, "activity-door", (-41, 1.7, 130), (-24, 3, 132)),
    ("--station-reading-materials-render", D, "deck-near", (-51, 1.7, 99), (-46, 0, 106)),
    ("--station-reading-materials-render", D, "street-loop", (-49, 1.7, 83), (-66, 4, 94)),
    ("--station-reading-materials-render", D, "distant-street", (-106, 1.7, 63), (-55, 7, 116)),
    ("--station-reading-link-render", D, "new-entry", (-63.7142944, 1.7, 71.75638), (-80.01666, 4.0, 86.59292)),
    ("--station-reading-link-render", D, "entry-gap", (-66.7142944, 1.7, 76.95253), (-82.38269, 4.0, 88.6909943)),
    ("--station-reading-link-render", D, "court-to-old", (-73.45448, 1.7, 89.22689), (-78.25833, 3.0, 109.5474)),
    ("--station-reading-link-render", D, "court-rear", (-40.0, 1.7, 130.0), (-44.0, 1.0, 147.0)),
    ("--station-reading-link-render", D, "main-arrival", (-29.7, 1.7, 92.0), (-40.0, 3.0, 127.0)),
    ("--station-reading-link-render", D, "street-loop", (-49.0, 1.7, 83.0), (-66.0, 4.0, 94.0)),
    ("--station-reading-court-render", D, "group-overview", (-119, 43, 59), (-47, 1, 121)),
    ("--station-reading-court-render", D, "main-arrival", (-29.7, 1.7, 92), (-40, 3, 127)),
    ("--station-reading-court-render", D, "approach-mid", (-33.3, 1.7, 102.4), (-44, 4, 153)),
    ("--station-reading-court-render", D, "forecourt", (-40, 1.7, 130), (-44, 4, 153)),
    ("--station-reading-court-render", D, "activity-side", (-29, 1.7, 132), (-44, 4, 153)),
    ("--station-reading-court-render", D, "former-site", (-63.7142944, 1.7, 71.75638), (-80.01666, 4, 86.59292)),
    ("--station-reading-court-render", D, "outer-street", (-61, 1.7, 164), (-44, 5, 155)),
    ("--station-reading-court-render", RC, "upper-terrace", (-10, 8.9, 24), (-10, 8.5, 0)),
    ("--station-reading-group-render", D, "street-arrival", (-29.7, 1.7, 92), (-40, 3, 127)),
    ("--station-reading-group-render", D, "reading-door", (-43, 1.7, 122), (-57, 3, 123)),
    ("--station-reading-group-render", D, "activity-door", (-41, 1.7, 130), (-24, 3, 132)),
    ("--station-reading-group-render", D, "reading-street-turn", (-65, 1.7, 75), (-74, 5, 102)),
    ("--station-reading-group-render", D, "reading-corner", (-43, 1.7, 103), (-59, 3.2, 113)),
    ("--station-street-sample-render", D, "street-arrival", (-29.7, 1.7, 92), (-40, 3, 127)),
    ("--station-street-sample-render", D, "reading-door", (-43, 1.7, 122), (-57, 3, 123)),
    ("--station-street-sample-render", D, "activity-door", (-41, 1.7, 130), (-24, 3, 132)),
    ("--station-street-sample-render", D, "surface-near", (-40, 1.7, 124), (-42, 0.05, 127)),
    ("--station-street-sample-render", D, "street-end", (-40, 1.7, 86), (-28, 0.012, 91)),
    ("--station-r2-review-render", D, "reading-arrival", (-29.7, 1.7, 92), (-40, 3, 127)),
    ("--station-r2-review-render", D, "reading-turn", (-33.3, 1.7, 102.4), (-44, 4, 153)),
    ("--station-r2-review-render", D, "reading-court", (-40, 1.7, 130), (-44, 4, 153)),
    ("--station-r2-surfaces-render", S, "reading-entry", (-12, 1.7, 23), (0, 4, 7)),
    ("--station-r2-surfaces-render", S, "reading-court", (-24, 1.7, 18), (0, 1.5, 13)),
    ("--station-r2-surfaces-render", RP, "research-court", (24, 1.7, 0), (-5, 6, -10)),
    ("--station-r2-surfaces-render", RP, "research-old-room", (-10, 1.7, 15), (-20, 4, 20)),
    ("--station-cafe-render", CC, "cafe-loggia", (-8, 1.7, 17), (-22, 1.7, 24)),
]

V_FOV = 65.0
ASPECT = 1600.0 / 1000.0
H_HALF = math.degrees(math.atan(math.tan(math.radians(V_FOV / 2.0)) * ASPECT))
V_HALF = V_FOV / 2.0



def px_projection(cam, fwd, right, up):
    """Project the plate AABB corners to pixels; clamp near plane at 0.5 m.
    Returns (x0, x1, y0, y1, area_fraction_of_frame, nearest_point_distance)."""
    tv = math.tan(math.radians(V_HALF))
    th = tv * ASPECT
    near = 0.5
    xs, ys, behind = [], [], 0
    for c in CORNERS:
        d = sub(c, cam)
        z = max(dot(d, fwd), near)
        if dot(d, fwd) <= near:
            behind += 1
        xs.append(dot(d, right) / z / th)
        ys.append(dot(d, up) / z / tv)
    if behind == 8:
        return None
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w = max(0.0, min(1.0, x1) - max(-1.0, x0))
    h = max(0.0, min(1.0, y1) - max(-1.0, y0))
    nearest = min(max(abs(dot(sub(c, cam), fwd)), near) for c in CORNERS)
    return dict(px_w=round(w * 1600), px_h=round(h * 1000),
                area_pct=round(100 * w * h, 2),
                nearest_m=round(nearest, 2),
                m_per_px_at_near=round(2 * tv * nearest / 1000.0, 3),
                behind_corners=behind)
def xform(root, p):
    pos, yaw = ROOTS[root]
    a = math.radians(yaw)
    ca, sa = math.cos(a), math.sin(a)
    return (pos[0] + p[0] * ca + p[2] * sa, pos[1] + p[1], pos[2] - p[0] * sa + p[2] * ca)


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    m = math.sqrt(dot(a, a))
    return (a[0] / m, a[1] / m, a[2] / m) if m else (0.0, 0.0, 0.0)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def corners():
    cx, cy, cz = CANOPY_CENTER
    hx, hy, hz = CANOPY_SIZE[0] / 2, CANOPY_SIZE[1] / 2, CANOPY_SIZE[2] / 2
    return [(cx + sx * hx, cy + sy * hy, cz + sz * hz)
            for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]


CORNERS = corners()


def analyse(mode, root, name, eye, target):
    cam = xform(root, eye)
    aim = xform(root, target)
    fwd = norm(sub(aim, cam))
    right = norm(cross(fwd, (0.0, 1.0, 0.0)))
    up = cross(right, fwd)
    dist = math.sqrt(dot(sub(CANOPY_CENTER, cam), sub(CANOPY_CENTER, cam)))
    us, rs, behind = [], [], 0
    for c in CORNERS:
        d = sub(c, cam)
        z = dot(d, fwd)
        if z <= 0.05:
            behind += 1
            continue
        us.append(dot(d, up) / z)
        rs.append(dot(d, right) / z)
    tv = math.tan(math.radians(V_HALF))
    th = math.tan(math.radians(H_HALF))
    if us and rs:
        vspan = (max(us) - min(us)) / (2 * tv)
        hspan = (max(rs) - min(rs)) / (2 * th)
    else:
        vspan = hspan = None
    inside = us and rs and min(us) >= -tv and max(us) <= tv and min(rs) >= -th and max(rs) <= th
    px = px_projection(cam, fwd, right, up)
    if px is None:
        return dict(mode=mode, view=name, dist=dist, in_frame=False, vspan=None, hspan=None,
                    px_w=0, px_h=0, area_pct=0.0, nearest_m=None, m_per_px=None,
                    note="all corners behind camera")
    note = ""
    if behind:
        note = "%d/8 corners behind camera (camera inside/near plate AABB)" % behind
    if px["behind_corners"]:
        note = (note + "; " if note else "") + ("%d/8 corners within near plane" % px["behind_corners"])
    return dict(mode=mode, view=name, dist=dist, in_frame=bool(inside),
                vspan=None if vspan is None else round(vspan * 100, 1),
                hspan=None if hspan is None else round(hspan * 100, 1),
                px_w=px["px_w"], px_h=px["px_h"], area_pct=px["area_pct"],
                nearest_m=px["nearest_m"], m_per_px=px["m_per_px_at_near"], note=note)


print("AABB lower-bound sampling plane world Y = %.3f m; canopy AABB %s size %s" % (SOFFIT_BOTTOM_Y, CANOPY_CENTER, CANOPY_SIZE))
print("vertical FOV %.1f deg, horizontal FOV %.2f deg (1600x1000)" % (V_FOV, 2 * H_HALF))
print()
rows = [analyse(*v) for v in VIEWS]
rows.sort(key=lambda r: (not r["in_frame"], -(r["vspan"] or -1)))
print("%-32s %-20s %7s %8s %6s %7s %8s  %s" % (
    "mode", "view", "dist m", "px bbox", "area%", "near m", "m/px", "note"))
for r in rows:
    print("%-32s %-20s %7.1f %8s %6s %7s %8s  %s" % (
        r["mode"], r["view"], r["dist"], "%dx%d" % (r["px_w"], r["px_h"]),
        r["area_pct"], r["nearest_m"], r["m_per_px"], r["note"]))
print()
inframe = [r for r in rows if r["in_frame"]]
print("views whose whole canopy AABB fits the frame: %d" % len(inframe))
close = [r for r in rows if r["in_frame"] and r["dist"] < 12.0]
print("views closer than 12 m: %d" % len(close))


# --- soffit-only sampling: how many pixels does one 5 m wood repeat get? -----
# The R2 rework rewrapped this canopy to CanopyMetersPerUv = 2.5 (Editor
# StationR2Rework.cs) and the oak material tiles 0.5, so one texture repeat
# covers 2.5 / 0.5 = 5 m of surface.
REPEAT_M = 2.5 / 0.5


def soffit_stats(cam, fwd, right, up, label):
    """Sample the soffit plane (y = AABB bottom, inside the AABB footprint).
    Returns in-frame sample share, vertical pixel span, and the pixel size of
    one texture repeat along the view direction (grain compression)."""
    tv = math.tan(math.radians(V_HALF))
    th = tv * ASPECT
    x0, x1 = CANOPY_CENTER[0] - CANOPY_SIZE[0] / 2, CANOPY_CENTER[0] + CANOPY_SIZE[0] / 2
    z0, z1 = CANOPY_CENTER[2] - CANOPY_SIZE[2] / 2, CANOPY_CENTER[2] + CANOPY_SIZE[2] / 2
    nx, nz = 80, 40
    rows = {}
    total = 0
    for i in range(nx + 1):
        x = x0 + (x1 - x0) * i / nx
        for k in range(nz + 1):
            z = z0 + (z1 - z0) * k / nz
            total += 1
            d = sub((x, SOFFIT_BOTTOM_Y, z), cam)
            zc = dot(d, fwd)
            if zc <= 0.2:
                continue
            ny = dot(d, up) / zc / tv
            nxs = dot(d, right) / zc / th
            if abs(ny) > 1 or abs(nxs) > 1:
                continue
            rows.setdefault(round(ny, 6), []).append(zc)
    if not rows:
        return "%-52s in-frame samples 0/%d (soffit not visible)" % (label, total)
    keys = sorted(rows)
    span_px = (max(keys) - min(keys)) / 2 * 1000
    flat = sorted(zc for v in rows.values() for zc in v)
    mid = flat[len(flat) // 2]
    lo = [zc for zc in flat if abs(zc - mid) >= REPEAT_M / 2]
    if lo:
        target_z = min(lo, key=lambda v: abs(v - mid))
        band = [k for k in keys if any(abs(zc - target_z) < 0.5 * REPEAT_M for zc in rows[k])]
        repeat_px = (max(band) - min(band)) / 2 * 1000 if len(band) > 1 else float("nan")
    else:
        repeat_px = float("nan")
    return ("%-52s in-frame %5.1f%%  vertical span %6.1f px  px per %.1f m repeat %6.1f"
            % (label, 100.0 * sum(len(v) for v in rows.values()) / total, span_px, REPEAT_M, repeat_px))


def report_view(root, eye, target, label):
    cam = xform(root, eye)
    fwd = norm(sub(xform(root, target), cam))
    right = norm(cross(fwd, (0.0, 1.0, 0.0)))
    up = cross(right, fwd)
    return soffit_stats(cam, fwd, right, up, label)


print()
print("=== soffit visibility, best existing views ===")
print(report_view(D, (-33.3, 1.7, 102.4), (-44, 4, 153), "existing approach-mid / reading-turn"))
print(report_view(D, (-29.7, 1.7, 92), (-40, 3, 127), "existing main-arrival (baseline PNG)"))
print(report_view(D, (-41, 1.7, 130), (-24, 3, 132), "existing activity-door (under plate)"))
print(report_view(D, (-40.0, 1.7, 130.0), (-44.0, 1.0, 147.0), "existing court-rear (under plate)"))
print(report_view(D, (-43, 1.7, 122), (-57, 3, 123), "existing reading-door (under plate)"))
print()
print("=== proposed, NOT implemented this round ===")
print(report_view(D, (-30.0, 1.7, 124.0), (-34.0, 4.6, 131.0), "proposed under link, look up along it"))
print(report_view(D, (-52.0, 1.7, 128.0), (-44.0, 4.9, 132.0), "proposed under link, look up across it"))
print(report_view(D, (-40.0, 1.7, 122.0), (-40.0, 5.2, 130.0), "proposed under link, look up steeply"))
