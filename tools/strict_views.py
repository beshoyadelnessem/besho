"""Exact B-rep check of the square-in-square question with OpenCascade hidden-line removal.

Author: Beshoy Adel. Axes as SOLIDWORKS: X right, Y up, Z toward the front viewer.
Assumed sizes: outer square A = 100 mm, inner square B = 60 mm. Projection: first angle.
"""
import json
from pathlib import Path

import cadquery as cq
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
from OCP.HLRAlgo import HLRAlgo_Projector
from OCP.HLRBRep import HLRBRep_Algo, HLRBRep_HLRToShape

ROOT = Path(__file__).resolve().parent.parent
A, B = 100.0, 60.0
a, b = A / 2, B / 2
TOL = 1e-4

# viewer direction (object -> eye) and the drawing's horizontal axis
VIEWS = {
    "front": ((0, 0, 1), (1, 0, 0)),
    "left": ((-1, 0, 0), (0, 0, 1)),  # first angle: drawn right of the front view
    "top": ((0, 1, 0), (1, 0, 0)),  # first angle: drawn below; object's front at the bottom
    "iso": ((-1, 1.2, 2.2), (2.2, 0, 1)),
}


# ---------- solids ----------
def prism_xz(points_xz, y0=-a, h=A):
    """Vertical prism over a polygon given in plan as (x, z)."""
    plane = cq.Plane(origin=(0, y0, 0), xDir=(1, 0, 0), normal=(0, 1, 0))  # local y = -Z
    return cq.Workplane(plane).polyline([(x, -z) for x, z in points_xz]).close().extrude(h).val()


def box(x0, x1, y0, y1, z0, z1):
    return cq.Solid.makeBox(x1 - x0, y1 - y0, z1 - z0, cq.Vector(x0, y0, z0))


WEDGE = [(a, a), (a, -a), (-a, -a)]  # half of the cube, cut on the plan diagonal z = x
CUBE60 = lambda: box(-b, b, -b, b, -b, b)


def wedge_boss():
    return prism_xz(WEDGE).fuse(CUBE60()).clean()


def wedge_notch():
    return prism_xz(WEDGE).cut(CUBE60()).clean()


def two_holes():
    s = box(-a, a, -a, a, -a, a)
    return s.cut(box(-b, b, -b, b, -a, a)).cut(box(-a, a, -b, b, -b, b)).clean()


def three_holes():
    return two_holes().cut(box(-b, b, -a, a, -b, b)).clean()


def plate_boss():
    return box(-a, a, -a, a, -a, a - 20).fuse(box(-b, b, -b, b, a - 20, a)).clean()


def frustum_vertical():
    plane = cq.Plane(origin=(0, -a, 0), xDir=(1, 0, 0), normal=(0, 1, 0))
    return cq.Workplane(plane).rect(A, A).workplane(offset=A).rect(B, B).loft().val()


def frustum_toward_front():
    base = cq.Workplane("XY").workplane(offset=-a).rect(A, A)
    return base.workplane(offset=A).rect(B, B).loft().val()


# ---------- hidden-line removal ----------
def hlr(shape, view):
    n, x = VIEWS[view]
    algo = HLRBRep_Algo()
    algo.Add(shape.wrapped)
    algo.Projector(HLRAlgo_Projector(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(*n), gp_Dir(*x))))
    algo.Update()
    algo.Hide()
    h = HLRBRep_HLRToShape(algo)
    out = {"visible": [], "hidden": []}
    for kind, comps in (("visible", (h.VCompound(), h.Rg1LineVCompound(), h.OutLineVCompound())),
                        ("hidden", (h.HCompound(), h.Rg1LineHCompound(), h.OutLineHCompound()))):
        for c in comps:
            if c.IsNull():
                continue
            for e in cq.Shape.cast(c).Edges():
                pts = [e.positionAt(t) for t in np.linspace(0, 1, 2 if e.geomType() == "LINE" else 24)]
                out[kind].append(np.array([(p.x, p.y) for p in pts]))
    return out


def on_segment(p, s0, s1):
    d = s1 - s0
    L = np.dot(d, d)
    t = 0 if L == 0 else np.clip(np.dot(p - s0, d) / L, 0, 1)
    return np.linalg.norm(s0 + t * d - p) < TOL


def covered(p, polylines):
    return any(on_segment(p, pl[i], pl[i + 1]) for pl in polylines for i in range(len(pl) - 1))


ALLOWED = [np.array(s) for s in (
    [(-a, -a), (a, -a)], [(a, -a), (a, a)], [(a, a), (-a, a)], [(-a, a), (-a, -a)],
    [(-b, -b), (b, -b)], [(b, -b), (b, b)], [(b, b), (-b, b)], [(-b, b), (-b, -b)])]


def samples(pl, step=1.0):
    pts = []
    for i in range(len(pl) - 1):
        n = max(2, int(np.linalg.norm(pl[i + 1] - pl[i]) / step) + 1)
        pts += [pl[i] + t * (pl[i + 1] - pl[i]) for t in np.linspace(0, 1, n)]
    return pts


def square_in_square_check(lines):
    """Exactly the two squares: every line on them, both fully drawn, no dashed line showing."""
    extra = sum(1 for kind in ("visible", "hidden") for pl in lines[kind]
                for p in samples(pl) if not covered(p, ALLOWED))
    missing = sum(1 for s in ALLOWED for p in samples(s) if not covered(p, lines["visible"]))
    dashed = sum(1 for pl in lines["hidden"] for p in samples(pl) if not covered(p, lines["visible"]))
    return dict(extra_line_samples=extra, missing_square_samples=missing, dashed_line_samples=dashed,
                exactly_two_squares=extra == 0 and missing == 0 and dashed == 0)


# ---------- drawing ----------
def draw(ax, lines, title, hidden=True):
    for pl in (lines["hidden"] if hidden else []):
        ax.plot(pl[:, 0], pl[:, 1], color="#c0392b", lw=1.3, ls=(0, (4, 3)))
    for pl in lines["visible"]:
        ax.plot(pl[:, 0], pl[:, 1], color="black", lw=2.0, solid_capstyle="round")
    ax.set_title(title, fontsize=10)
    ax.set_aspect("equal")
    ax.axis("off")


def sheet(shape, title, note, path, given=True):
    fig = plt.figure(figsize=(10, 10))
    slots = {"front": ([0.04, 0.52, 0.42, 0.42], "FRONT VIEW (given)" if given else "FRONT VIEW"),
             "left": ([0.52, 0.52, 0.42, 0.42], "LEFT VIEW (given)" if given else "LEFT VIEW"),
             "top": ([0.04, 0.05, 0.42, 0.42], "TOP VIEW  = the answer" if given else "TOP VIEW"),
             "iso": ([0.55, 0.04, 0.38, 0.28], "isometric (visible edges)")}
    for view, (rect, label) in slots.items():
        ax = fig.add_axes(rect)
        draw(ax, hlr(shape, view), label, hidden=view != "iso")
        if view != "iso":
            ax.set_xlim(-a - 12, a + 12)
            ax.set_ylim(-a - 12, a + 12)
    fig.text(0.55, 0.49, title, fontsize=12, weight="bold", va="top")
    fig.text(0.55, 0.46, note + "\nBlack = visible, red dashed = hidden\nA = 100, B = 60 mm (assumed)   Author: Beshoy Adel",
             fontsize=9, va="top", family="monospace")
    fig.savefig(path, dpi=120)
    plt.close(fig)


def main():
    candidates = {
        "Wedge-With-Square-Boss": wedge_boss,
        "Wedge-With-Square-Notch": wedge_notch,
        "Cube-Two-Square-Holes": two_holes,
        "Cube-Three-Square-Holes": three_holes,
        "Block-Square-Boss": plate_boss,
        "Truncated-Pyramid (axis toward front)": frustum_toward_front,
    }
    report = {}
    for name, make in candidates.items():
        s = make()
        bb = s.BoundingBox()
        report[name] = dict(
            valid=s.isValid(), volume_mm3=round(s.Volume(), 3),
            bbox_mm=[round(bb.xlen, 3), round(bb.ylen, 3), round(bb.zlen, 3)],
            front=square_in_square_check(hlr(s, "front")),
            left=square_in_square_check(hlr(s, "left")),
        )
        report[name]["fits_both_given_views"] = report[name]["front"]["exactly_two_squares"] and \
            report[name]["left"]["exactly_two_squares"]
        if name.startswith("Wedge"):
            folder = ROOT / name
            (folder / "images").mkdir(parents=True, exist_ok=True)
            cq.exporters.export(cq.Workplane().add(s), str(folder / f"{name}.step"))
            note = {"Wedge-With-Square-Boss": "Half-cube wedge (plan diagonal z = x)\n+ 60 cube centred, half of it sticks out",
                    "Wedge-With-Square-Notch": "Half-cube wedge (plan diagonal z = x)\n- 60 cube centred, cut into the diagonal face"}[name]
            sheet(s, name.replace("-", " "), note, folder / "images" / "three-views.png")
    fv = frustum_vertical()
    bb = fv.BoundingBox()
    report["Truncated-Pyramid (base on Top Plane)"] = dict(valid=fv.isValid(), volume_mm3=round(fv.Volume(), 3),
                                                        bbox_mm=[round(bb.xlen, 3), round(bb.ylen, 3), round(bb.zlen, 3)])
    tp = ROOT / "Truncated-Pyramid"
    (tp / "images").mkdir(parents=True, exist_ok=True)
    cq.exporters.export(cq.Workplane().add(fv), str(tp / "Truncated-Pyramid.step"))
    sheet(fv, "Truncated Pyramid", "100 sq base on Top Plane, 60 sq top, H 100\nTop: squares + 4 corner diagonals\nFront/left: trapezoids",
          tp / "images" / "three-views.png", given=False)
    out = ROOT / "Square-in-Square-Answer" / "verification.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, default=bool))
    for k, v in report.items():
        if "front" not in v:
            print(k, v)
            continue
        print(f"{k:40s} valid={v['valid']} vol={v['volume_mm3']:>12} bbox={v['bbox_mm']} "
              f"front={v['front']['exactly_two_squares']} left={v['left']['exactly_two_squares']} "
              f"(extra/missing/dashed front {v['front']['extra_line_samples']}/{v['front']['missing_square_samples']}/{v['front']['dashed_line_samples']}, "
              f"left {v['left']['extra_line_samples']}/{v['left']['missing_square_samples']}/{v['left']['dashed_line_samples']})")


if __name__ == "__main__":
    main()
