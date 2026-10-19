# Projection, intersection and ellipse rules — Beshoy's MCV exam notes

Worked out and verified with him in September 2026 (MCV Design Engineer exam and interview).
Report: `D:\mcv\Report\Report About Design Exam at MCV.pdf`.

## Projection

- Egypt / ISO = **first angle**: the view right of the front view is the LEFT view; the view
  below the front view is the TOP view.
- Two views never define a solid uniquely. State the reading you assume, then draw the third
  view it forces. Say this sentence in an interview.
- Read each line as a surface: a sharp edge, the limb of a curved surface, or an
  intersection line. Decide visible vs hidden last.
- Exam figures for "imagine the solid" questions are often drawn **outline only, without
  hidden lines**. A clean figure does not prove there are no hidden features.

## Square inside a square (interview question)

- A **boss** gives a square-in-square view with no hidden lines but breaks the outline of the
  perpendicular views — unless the base is a **wedge** (half a cube cut on the plan
  diagonal). Wedge + centred square boss shows two clean square-in-square views (front and
  left); the top view is the right triangle with a small triangle sticking out of the
  hypotenuse. Wedge + square notch: same, with the notch as two hidden lines.
  Models: `D:\mcv\Wedge-With-Square-Boss`, `D:\mcv\Wedge-With-Square-Notch` (608,000 / 392,000 mm³).
- A **hole or pocket** can show in two views but leaves hidden lines in the others.
- A **frustum / chamfer** gives an inner square with no hidden lines but adds corner diagonals.

## Intersection (interpenetration) lines

- Two **equal** cylinders crossing at 90°: the intersection is two **plane ellipses**, seen
  edge-on as straight lines at 45° (an X). General rule: two quadrics that share a common
  inscribed sphere intersect in plane curves.
- Different diameters, or cone + cylinder: a true curve. Construct it with cutting planes:
  each horizontal plane cuts the cone in a circle and the cylinder in two lines; their
  intersections are points on the curve.
- **Full interpenetration curve** = draw the whole curve, the part buried inside material
  dashed. Production drawings show only real edges.
- Three equal cylinders on three axes (tricylinder): every view is the same square with an
  inscribed circle and diagonals.
- Workshop link (MCV bus frames): the intersection curve is the **fish-mouth / saddle cut**
  on a tube end.

## Ellipse major / minor

| case | kept | changed |
|---|---|---|
| circle tilted, then viewed (projection) | major = D | minor = D·cos θ (θ between planes) |
| cylinder cut by an inclined plane (true section) | minor = D | major = D ÷ cos θ (θ from the base) |
| two equal cylinders, axes at α | minor = D | majors D ÷ sin(α/2) and D ÷ cos(α/2) |
| isometric circle | ratio minor/major = 0.577 = tan 30° | full-scale D=100 → 122.5 × 70.7 |

**cos or sin:** plane-to-plane or axis-to-axis → **cos**; plane-to-axis → **sin**.
Zero test: if the given angle would be 0 with no tilt, use cos; if it would be 90°, use sin.
At 45° both give 0.707, so the mistake hides — at 30° or 60° it shows.
Projection shrinks (multiply); section stretches (divide).
