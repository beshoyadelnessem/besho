# Truncated-Pyramid — finishing the part in SOLIDWORKS

Author: Beshoy Adel

The part in `D:\mcv\Truncated-Pyramid` already holds:

- `Sketch1`: a 100 mm square on the Top Plane
- `Plane1`: offset 100 mm from the Top Plane
- `Sketch2`: a 60 mm square on Plane1

The only step missing is the loft.

## Do it by hand (recommended, takes about 30 seconds)

`sw_loft` is broken: its `InsertProtrusionBlend2` call passes the wrong number of arguments.
Guessing those arguments through `sw_run_vba_code` has already locked SOLIDWORKS in VBA break
mode once, so don't try it again.

1. **Insert → Boss/Base → Loft**.
2. In **Profiles**, pick `Sketch1`, then `Sketch2`. Click near the **same corner** of each
   square so the connectors do not twist.
3. Leave the start and end constraints at **None**, then click **OK**.

## Alternative without a loft

Use one Boss-Extrude on `Sketch1` with a depth of 100 mm and an inward **draft of 11.3099°**
(= atan(20/100)).

This gives the same frustum, but `Sketch2` and `Plane1` then go unused.

## Verify (use measured geometry, not a screenshot)

| check | target |
|---|---|
| volume | **653,333.33 mm³** = H/3 · (A1 + A2 + √(A1·A2)) |
| bounding box | 100 × 100 × 100 mm |
| faces | 6 (2 squares + 4 trapezoids) |
| top view | outer square + inner square + **4 corner diagonals** |
| front and left views | trapezoid, 100 at the base, 60 at the top, 100 high |

The reference images in `images/` were generated from exact geometry by
`tools/square_in_square_views.py`.
