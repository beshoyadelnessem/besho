"""Derive first-angle views of the square-in-square candidate solids from exact geometry.

Author: Beshoy Adel. Assumed sizes: outer square A = 100 mm, inner square B = 60 mm.
"""
import json
import itertools
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from scipy.spatial import ConvexHull

ROOT = Path(__file__).resolve().parent.parent
A, B = 100.0, 60.0
CELL = 10.0  # every boundary sits on a 10 mm grid, so voxel volumes are exact
N = int(A / CELL)

# View frames (SOLIDWORKS axes: X right, Y up, Z toward the front viewer).
# First angle: left view drawn right of the front view, top view drawn below it;
# the object's front faces away from the front view in both.
VIEWS = {
    "front": dict(axis=2, sign=+1, u=(0, +1), v=(1, +1)),
    "left": dict(axis=0, sign=-1, u=(2, +1), v=(1, +1)),
    "top": dict(axis=1, sign=+1, u=(0, +1), v=(2, -1)),
}


# ---------- voxel solids ----------
def centers():
    c = (np.arange(N) + 0.5) * CELL - A / 2
    return np.meshgrid(c, c, c, indexing="ij")


def two_holes():
    x, y, z = centers()
    hole_z = (abs(x) < B / 2) & (abs(y) < B / 2)
    hole_x = (abs(z) < B / 2) & (abs(y) < B / 2)
    return ~(hole_z | hole_x)


def three_holes():
    x, y, z = centers()
    hole_z = (abs(x) < B / 2) & (abs(y) < B / 2)
    hole_x = (abs(z) < B / 2) & (abs(y) < B / 2)
    hole_y = (abs(x) < B / 2) & (abs(z) < B / 2)
    return ~(hole_z | hole_x | hole_y)


def boss():
    x, y, z = centers()
    plate = z < A / 2 - 20
    bump = (abs(x) < B / 2) & (abs(y) < B / 2)
    return plate | bump


def voxel_edges(solid):
    """B-rep edges: grid edges whose four neighbouring voxels hold 1 or 3 solids."""
    pad = np.pad(solid, 1)
    edges = []
    for ax in range(3):
        o1, o2 = [a for a in range(3) if a != ax]
        for idx in itertools.product(range(N), range(N + 1), range(N + 1)):
            i, j, k = idx
            base = [0, 0, 0]
            base[ax], base[o1], base[o2] = i, j, k
            quad = []
            for dj, dk in ((0, 0), (1, 0), (0, 1), (1, 1)):
                p = list(base)
                p[ax] += 1  # voxel i along the edge sits at pad index i + 1
                p[o1] += dj  # node j touches voxels j-1 and j -> pad j and j + 1
                p[o2] += dk
                quad.append(pad[p[0], p[1], p[2]])
            filled = sum(quad)
            if filled in (1, 3):
                a = np.array(base, float) * CELL - A / 2
                b = a.copy()
                b[ax] += CELL
                edges.append((a, b))
    return edges


def occupied(solid, p):
    idx = np.floor((p + A / 2) / CELL).astype(int)
    if np.any(idx < 0) or np.any(idx >= N):
        return False
    return bool(solid[tuple(idx)])


def voxel_visible(solid, a, b, view):
    ax, sign = view["axis"], view["sign"]
    d = b - a
    if abs(d[ax]) > 1e-9:
        return None  # edge seen end-on
    mid = (a + b) / 2
    side = [i for i in range(3) if i != ax and abs(d[i]) < 1e-9][0]
    for off in (-1e-3, 1e-3):
        clear = True
        for t in np.arange(0.5, A + 1, 0.5):
            p = mid.copy()
            p[side] += off
            p[ax] += sign * t
            if occupied(solid, p):
                clear = False
                break
        if clear:
            return True
    return False


# ---------- frustum (convex, exact) ----------
def frustum():
    lo = [(-A / 2, 0, -A / 2), (A / 2, 0, -A / 2), (A / 2, 0, A / 2), (-A / 2, 0, A / 2)]
    hi = [(-B / 2, A, -B / 2), (B / 2, A, -B / 2), (B / 2, A, B / 2), (-B / 2, A, B / 2)]
    v = np.array(lo + hi)
    faces = [[0, 1, 2, 3], [4, 5, 6, 7]] + [[i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4] for i in range(4)]
    centroid = v.mean(axis=0)
    normals = []
    for f in faces:
        n = np.cross(v[f[1]] - v[f[0]], v[f[2]] - v[f[0]])
        n /= np.linalg.norm(n)
        if np.dot(n, v[f[0]] - centroid) < 0:
            n = -n
        normals.append(n)
    edge_faces = {}
    for fi, f in enumerate(faces):
        for i in range(4):
            e = tuple(sorted((f[i], f[(i + 1) % 4])))
            edge_faces.setdefault(e, []).append(fi)
    return v, faces, normals, edge_faces


def view_dir(view):
    d = np.zeros(3)
    d[view["axis"]] = view["sign"]
    return d  # points from object toward viewer


def project(p, view):
    (ui, us), (vi, vs) = view["u"], view["v"]
    return us * p[ui], vs * p[vi]


def frustum_view_lines(view):
    v, faces, normals, edge_faces = frustum()
    toward = view_dir(view)
    lines = []
    for (i, j), fs in edge_faces.items():
        pa, pb = project(v[i], view), project(v[j], view)
        if np.allclose(pa, pb):
            continue
        vis = any(np.dot(normals[f], toward) > 1e-9 for f in fs)
        lines.append((pa, pb, vis))
    return lines


def voxel_view_lines(solid, view):
    lines = []
    for a, b in voxel_edges(solid):
        vis = voxel_visible(solid, a, b, view)
        if vis is None:
            continue
        lines.append((project(a, view), project(b, view), vis))
    return lines


def dedupe(lines):
    key = lambda pa, pb: tuple(sorted((tuple(np.round(pa, 3)), tuple(np.round(pb, 3)))))
    vis = {key(pa, pb) for pa, pb, s in lines if s}
    out, seen = [], set()
    for pa, pb, s in lines:
        k = key(pa, pb)
        if k in seen or (not s and k in vis):
            continue
        seen.add(k)
        out.append((pa, pb, s))
    return out


# ---------- drawing ----------
def draw_view(ax, lines, title, show_hidden=True):
    for pa, pb, s in dedupe(lines):
        if not s and not show_hidden:
            continue
        ax.plot([pa[0], pb[0]], [pa[1], pb[1]], color="black" if s else "#c0392b",
                lw=2.0 if s else 1.3, ls="-" if s else (0, (4, 3)), solid_capstyle="round")
    ax.set_title(title, fontsize=10)
    ax.set_aspect("equal")
    ax.axis("off")


def three_view_layout(get_lines, title, path, note=None):
    fig = plt.figure(figsize=(9, 9))
    slots = {"front": (0.05, 0.52), "left": (0.52, 0.52), "top": (0.05, 0.05)}
    names = {"front": "FRONT VIEW", "left": "LEFT VIEW (first angle)", "top": "TOP VIEW (first angle)"}
    for name, (x0, y0) in slots.items():
        ax = fig.add_axes([x0, y0, 0.42, 0.42])
        draw_view(ax, get_lines(VIEWS[name]), names[name])
        ax.set_xlim(-65, 65)
        lo = min(l[0][1] for l in get_lines(VIEWS[name]))
        hi = max(l[0][1] for l in get_lines(VIEWS[name]))
        mid = (lo + hi) / 2
        ax.set_ylim(mid - 65, mid + 65)
    tax = fig.add_axes([0.52, 0.05, 0.42, 0.42])
    tax.axis("off")
    txt = title + "\n\nBlack = visible edge\nRed dashed = hidden edge\n\nA = 100 mm, B = 60 mm (assumed)\nAuthor: Beshoy Adel"
    if note:
        txt += "\n\n" + note
    tax.text(0.02, 0.98, txt, va="top", fontsize=10, family="monospace")
    fig.savefig(path, dpi=130)
    plt.close(fig)


def iso_frustum(path):
    v, faces, normals, _ = frustum()
    eye = np.array([1.0, 0.8, 1.2])
    eye /= np.linalg.norm(eye)
    up = np.array([0, 1.0, 0])
    r = np.cross(up, eye)
    r /= np.linalg.norm(r)
    u = np.cross(eye, r)
    P = lambda p: (np.dot(p, r), np.dot(p, u))
    light = np.array([0.4, 0.9, 0.6])
    light /= np.linalg.norm(light)
    fig, ax = plt.subplots(figsize=(6, 6))
    for f, n in sorted(zip(faces, normals), key=lambda t: np.dot(v[t[0]].mean(axis=0), eye)):
        if np.dot(n, eye) <= 0:
            continue
        shade = 0.45 + 0.5 * max(0, np.dot(n, light))
        ax.add_patch(Polygon([P(v[i]) for i in f], closed=True, fc=(0.35 * shade, 0.55 * shade, 0.85 * shade),
                             ec="black", lw=1.8))
    ax.set_aspect("equal")
    ax.autoscale_view()
    ax.axis("off")
    ax.set_title("Truncated pyramid (frustum) - isometric\n100 sq base, 60 sq top, H 100", fontsize=10)
    fig.savefig(path, dpi=130, bbox_inches="tight")
    plt.close(fig)


def answer_sheet(rows, path):
    fig, axes = plt.subplots(len(rows), 3, figsize=(11, 3.6 * len(rows)))
    for r, (label, get_lines, verdict) in enumerate(rows):
        for c, name in enumerate(["front", "left", "top"]):
            ax = axes[r][c]
            lines = get_lines(VIEWS[name])
            draw_view(ax, lines, {"front": "front (given)", "left": "left (given)", "top": "TOP = the answer"}[name])
            ys = [p[1] for l in lines for p in l[:2]]
            mid = (min(ys) + max(ys)) / 2
            ax.set_xlim(-65, 65)
            ax.set_ylim(mid - 60, mid + 60)
        axes[r][0].text(-65, 0, label + "\n" + verdict, rotation=90, va="center", ha="right", fontsize=10)
    fig.suptitle("Square-in-square: which solid fits BOTH given views?  (black visible, red dashed hidden)", fontsize=12)
    fig.tight_layout(rect=(0.04, 0, 1, 0.97))
    fig.savefig(path, dpi=110)
    plt.close(fig)


def main():
    report = {}

    # Truncated pyramid
    tp = ROOT / "Truncated-Pyramid" / "images"
    tp.mkdir(parents=True, exist_ok=True)
    v, *_ = frustum()
    vol = ConvexHull(v).volume
    expected = A / 3 * (A * A + B * B + np.sqrt(A * A * B * B))
    bbox = (v.max(axis=0) - v.min(axis=0)).tolist()
    report["Truncated-Pyramid"] = dict(volume_mm3=round(vol, 2), expected_mm3=round(expected, 2),
                                       volume_ok=abs(vol - expected) < 0.01, bbox_mm=bbox,
                                       bbox_ok=bbox == [A, A, A])
    iso_frustum(tp / "isometric.png")
    three_view_layout(frustum_view_lines, "TRUNCATED PYRAMID (frustum)\nbase on Top Plane, axis vertical",
                      tp / "three-views.png",
                      note="Top: square-in-square PLUS\n4 corner diagonals.\nFront/left: trapezoids,\nnot squares.")

    # Voxel candidates
    solids = {"Cube-Two-Square-Holes": (two_holes(), 496_000),
              "Cube-Three-Square-Holes": (three_holes(), 352_000),
              "Block-Square-Boss": (boss(), 872_000)}
    for name, (s, exp) in solids.items():
        vol = float(s.sum() * CELL ** 3)
        report[name] = dict(volume_mm3=vol, expected_mm3=exp, volume_ok=vol == exp)

    rows = [
        ("TWO square through-holes", lambda vw: voxel_view_lines(solids["Cube-Two-Square-Holes"][0], vw),
         "front OK, left OK  -> RECOMMENDED"),
        ("THREE square through-holes", lambda vw: voxel_view_lines(solids["Cube-Three-Square-Holes"][0], vw),
         "front OK, left OK (extra, unforced hole)"),
        ("Square BOSS on front face", lambda vw: voxel_view_lines(solids["Block-Square-Boss"][0], vw),
         "front OK, left FAILS (stepped)"),
    ]
    ans = ROOT / "Square-in-Square-Answer" / "images"
    ans.mkdir(parents=True, exist_ok=True)
    answer_sheet(rows, ans / "answer-sheet.png")
    three_view_layout(lambda vw: voxel_view_lines(solids["Cube-Two-Square-Holes"][0], vw),
                      "RECOMMENDED ANSWER\nblock with two crossed\n60 x 60 square through-holes",
                      ans / "recommended-three-views.png",
                      note="Top view: outer square +\nhidden cross (plus) outline.\nOutline-only: a plain square.")

    (ROOT / "Square-in-Square-Answer" / "verification.json").write_text(json.dumps(report, indent=2, default=bool))
    print(json.dumps(report, indent=2, default=bool))


if __name__ == "__main__":
    main()
