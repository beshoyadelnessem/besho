# Measured behaviour of this MCP on SOLIDWORKS 2026 (rev 30.1.0)

Everything here was observed on this machine, not taken from documentation. Where the
published API enum and the MCP's constants disagreed, the geometry decided.

## Hazard — this one crashed SolidWorks

**`swInputDimValOnCreate` (user preference id 10) is ON by default**, and it is on again
after every SolidWorks restart. With it on, `IModelDoc2::AddDimension2` raises the modal
"Modify" box, which **interrupts macro execution**, hangs the MCP call, and crashed
SolidWorks during this session.

Run the preflight before any modelling session:

```bash
.venv/Scripts/python.exe swagent/bin/swagent.py args action=preflight
# then run sw_control.swb
```

Never call `AddDimension2` without disabling it first. `sw_dimension.swb` reads the current
state, disables it, dimensions, and restores it.

## The active document drifts

`ISldWorks::ActiveDoc` changed between consecutive MCP calls during this session, and a
SolidWorks restart resets it entirely. A measurement taken from the wrong document is worse
than no measurement.

- every probe accepts `doc=<title>` and activates it before doing anything
- `swagent report` and `swagent verify` accept `--expect-doc <title>` and fail on mismatch

Use both. Always.

## MCP tools that report success when they have failed

| tool | actual behaviour |
|---|---|
| `sw_rebuild_model` | discards `EditRebuild3`'s return; always reports `rebuilt: true` |
| `sw_check_geometry` | swallows the `CheckDocument` exception; always reports `errors: 0` |
| `sw_run_vba_code` | executes but returns no data, only `executed: true` |

## MCP tools that are broken

| tool | symptom | use instead |
|---|---|---|
| `sw_edit_sketch` | `Error: <unknown>.MenuCommand` | `sw_dimension.swb` with `sketch=<name>` re-enters the sketch |
| `sw_list_open_documents` | every entry is `{"title": null, "type": "Unknown"}` | `sw_control.swb` with `action=list` |
| `sw_add_sketch_dimension` | returns "Failed to add dimension", or hangs | `sw_dimension.swb` |
| `sw_add_drawing_view` | `Parameter not optional.` on every call | `sw_drawing.swb` with `model=<path>` |

`sw_client.add_drawing_view` calls `CreateDrawViewFromModelView3(ModelName, ViewName,
LocX, LocY)`. The COM method takes a fifth argument, `LocZ`, and it is not optional, so no
view is ever created. `sw_drawing.swb` passes all five and places the three standard views;
`sw_hlv.swb` then sets each one to hidden-lines-visible. Note that `IView::DisplayMode` is
not a settable property on this build — it raises 438 — so the display mode has to be
applied by selecting the view and calling `IModelDoc2::ViewDisplayHiddengreyed`.

A probe file must be saved with **CRLF** line endings. A `.swb` written with bare LF fails
to compile and `sw_run_macro` reports only `failed (error=0)` with no output file, which is
indistinguishable from a wrong path or a wrong sub name.

## `sw_extrude` mis-maps two arguments

`IFeatureManager::FeatureExtrusion3` has **no `is_cut` parameter**. Its second argument is
`Flip`. `sw_client.extrude` passes `is_cut` into that slot and `draft_on` into `Ddir1`
(draft *direction*) instead of `Dchk1` (draft *enable*). Consequences:

- `sw_extrude(is_cut=True)` makes a flipped **boss**, never a cut
- `sw_extrude(draft_angle=...)` produces no draft

A real cut needs `FeatureCut4` (27 arguments). `sw_extrude.swb` does this correctly and
reports the actual COM error instead of swallowing it in a bare `except: pass`.

### End-condition constants

`SW_END_MID_PLANE = 8` in `sw_client.py` silently produces **no feature** — the call returns
`Nothing` with no COM error. Measured on this build:

| value | result |
|---|---|
| 0 | Blind — confirmed working for boss and cut |
| 1 | Through All — confirmed working for cut, **needs `flip=1`** when the sketch sits on the near face |
| 6 | **Mid Plane** — confirmed working for boss. `depth=` is the **total** span, half each side of the sketch plane |
| 7 | Up To Body — returns `Nothing` when no other body exists, which reads exactly like a failure |
| 8 | Through All Both — returns `Nothing` for a boss with nothing to run into |

So the enum on this build is the published `swEndConditions_e`: Blind 0, ThroughAll 1,
ThroughNext 2, UpToVertex 3, UpToSurface 4, OffsetFromSurface 5, **MidPlane 6**, UpToBody 7,
ThroughAllBoth 8. `SW_END_MID_PLANE = 8` in `sw_client.py` is off by two and lands on
ThroughAllBoth, which is why it produces nothing.

Measured by building three Ø100 × 100 mm cylinders on the Front, Top and Right planes:
`endcond=6` gave a bounding box of exactly −50..+50 on every axis, and a union volume of
941983.8 mm³ against the analytic 941980.9 mm³.

Treat every other value as unverified until a probe confirms it produces the geometry you
expect. Pass `endcond=` to `sw_extrude.swb` raw and check the bounding box and volume.

## Degrees of freedom — the calibration

`ISketch::GetConstrainedStatus` on this build:

| raw | meaning | how it was measured |
|---|---|---|
| 2 | UNDER_DEFINED | centre rectangle with no dimensions |
| 3 | FULLY_DEFINED | same rectangle after two 80 mm dimensions |

Stored in `%LOCALAPPDATA%\SWAgent\calibration.json`. Over-defined and unsolvable are still
uncalibrated; `swagent` prints the raw value rather than guessing a label.

## Feature type names from `GetTypeName2`

| feature | type name |
|---|---|
| sketch | `ProfileFeature` |
| boss extrude | `Extrusion` |
| **cut extrude** | **`ICE`** — not `Extrusion` |
| reference plane | `RefPlane` |

## Sketch mechanics

- A **centre rectangle is 6 segments**: 4 profile lines plus 2 construction diagonals.
  Closure checks must skip construction geometry, and must count endpoint multiplicity per
  location rather than matching pairs greedily — three ends meet at each corner.
- `RelationManager.GetRelationsCount(True)` counts only relations among *selected* entities
  and returns 0. Pass `False`.
- **`EditRebuild3` closes the active sketch.** A rebuild between two dimension calls leaves
  the second unable to select anything. `sw_dimension.swb` makes the rebuild opt-in
  (`rebuild=1`) and re-enters the sketch when it finds it closed.
- After `sw_exit_sketch`, **nothing is selected**. An extrude needs
  `sw_select_entity(name, "SKETCH")` first, or it fails with the generic closed-profile
  message.

## Macro mechanics

- A plain-text `.swb` exposes **only `main`**; the `sub_name` argument is ignored. Dispatch
  on an `action=` argument instead.
- Arguments: `%LOCALAPPDATA%\SWAgent\in\args.txt`, `key=value` per line.
- Output: `%LOCALAPPDATA%\SWAgent\out\`.
- Passing a Variant array element into a `ByRef Double` parameter is a **VBA compile
  error**. Declare helpers `ByVal` and wrap with `CDbl()`.
- Without `Option Explicit`, an unresolved API constant silently becomes `0`. In a macro
  that writes user preferences that would set the wrong preference, so `sw_dimension.swb`
  uses `Option Explicit` deliberately.
- A sidecar Python process cannot reach SolidWorks here: `GetActiveObject` fails with
  `MK_E_UNAVAILABLE`. That is why state is read through in-process macros writing JSON to
  disk rather than through a second COM client.

## Measured 2026-09-19, cube with three square holes

**`endcond=8` is not Through All Both for a cut.** On a 100 mm cube a 60 mm square cut with
`endcond=8` removed one side only: volume came out 820000 mm³ instead of 640000, and the
centre of mass moved to z = +5.488. Use `endcond=6` with `depth` set to the full thickness;
mid plane through a symmetric part is through in both directions and stays parametric.

**`sw_delete_feature` cannot be trusted either way.** It returned `result: true` while the
feature was still in the tree, `result: false` while the feature was gone, and on one call
it deleted a different sketch from the one named. Always list the features after a delete.

**Two new probes**

| probe | what it fills |
|---|---|
| `sw_relation.swb` | re-opens a closed sketch (`sw_edit_sketch` is broken) and adds a relation. Note: `SketchAddConstraints` accepted `sgATMIDPOINT` and reported no error while adding no relation, so check the relation count afterwards. |
| `sw_dims.swb` | applies up to six driving dimensions to one sketch in a single run. A centred rectangle needs four, two for size and two to locate it from the origin, and one probe call each is the slowest part of a build. |

**Locating a centred rectangle.** `CreateCenterRectangle` at (0,0) does not tie itself to the
origin, and the sketch stays under-defined after the two size dimensions. Two distance
dimensions from `Point1@Origin` to two adjacent lines fully define it. `Point1@Origin` with
type `EXTSKETCHPOINT` selects reliably; the rectangle's own centre point does not answer to
`Point1`.

## Measured 2026-09-20, square-in-square variants

**Sketch segments select by their BARE name while the sketch is open.** `Line1@Sketch1`
fails; `Line1` succeeds. `sw_dims.swb` reported `selected: false` on all four dimensions
with the qualified name and `true` with the bare one. `Point1@Origin` with type
`EXTSKETCHPOINT` still needs its qualifier. Rule: geometry inside the sketch being edited
is unqualified, geometry outside it is qualified.

**`sw_open_document` does not activate an already-open document.** It calls `OpenDoc6` with
`swOpenDocOptions_Silent`, which returns the document without making it `ActiveDoc`. The
title it reports back is the document it found, not the document the next MCP call will
act on. There is no MCP tool that activates; `sw_control.swb action=activate` is the only
route, and it is a macro.

**This is how a delete lands in the wrong file.** `sw_delete_feature("Cut-Extrude2")` was
issued after an `sw_open_document` that appeared to switch parts. It ran against the other
open document, which has no feature of that name, reported `deleted: true`, and removed
`Boss-Extrude2` instead — a different feature, in a different file, reported as a success.
Check `sw_get_model_info` for the title before any destructive MCP call, and re-list
afterwards.

**`sw_close_document` ignores its title argument.** Passing `Draw1` closed the active part
`Cube-Two-Square-Holes`; passing `Part1` closed whatever was active. Treat it as "close the
active document" and set the active document first.

**`GetTypeName2` returns `ICE` for every extrude after the first, adding or removing.** The
earlier note that `ICE` marks a cut extrude is wrong. Measured: the extrude that creates the
body reports `Extrusion`; a second boss extrude that merges into it reports `ICE` while the
volume rises by exactly the added material. `ICE` means "extrude that modifies an existing
body", not "cut".

**`sw_capture_screenshot` ignores `file_path`.** It always leaves a BMP at
`%TEMP%\sw_screenshot.bmp` and returns that path. Convert it yourself; `System.Drawing` from
PowerShell works and is also the cheapest way to crop.

**`sw_create_reference_plane` and `sw_loft` are both short of arguments.**
`InsertRefPlane` is called with 4 arguments and needs 6; `InsertProtrusionBlend2` is called
with 14 and needs 17. Both raise `Parameter not optional.` The plane can be added through
`sw_run_vba_code` with `InsertRefPlane(8, dist, 0, 0, 0, 0)` after selecting the reference
plane — that works.

**A wrong-arity COM call inside `sw_run_vba_code` parks SolidWorks in VBA break mode.**
`InsertProtrusionBlend2` with 17 arguments timed out the MCP call and left the process with
its main window titled `Microsoft Visual Basic for Applications [break]`. After that every
`sw_run_macro` returns `failed (error=0)` — indistinguishable from a bad path — while plain
COM tools keep working. Only Run > Reset in the VBA editor clears it. Symptom to check
first: `Get-Process SLDWORKS | Select MainWindowTitle`.

**`sw_save_document` on a drawing returned `Save failed. Errors: 256`.** Parts saved fine in
the same session.

## Measured 2026-09-24, wedge with square boss/notch (SW 2022 SP1, rev 30.1)

**A wrong parameter name is silently replaced by the default.** The MCP's pydantic inputs
ignore unknown keys. `sw_create_sketch({"plane_name": "Top Plane"})` created the sketch
on the **Front Plane** (the default) and reported `"plane": "Front Plane"` — the only
clue. The field is `plane`. Read the returned plane every time, and check field names
in `server.py` (`class ...Input`) before first use of a tool.

**Deleting a feature does not reset the name counter.** After deleting a mis-placed
`Sketch1` the next sketch would be `Sketch2`. To keep plan names, close the part without
saving (`sw_close_document` discards) and reopen the last saved copy.

**`IModelDocExtension::RayIntersections` returned 0 hits** for a ray that must cross the
solid twice — options 0 and 4, hit radius 1e-7 and 1e-5 m, HighPrecision True and False,
arrays passed as fixed `Double()` and as `Variant`. Not usable here. Point containment is
now decided in Python from `sw_topo.swb` (faces + edge segments, plain getters) by ray
parity; `swagent verify` reads it for `vertex_count` and `point_checks`.

**After one failed probe, every macro failed** — including `sw_inspect.swb`, which had
just worked — with `failed (error=0)`, while the main window title stayed normal and no
dialog was visible. COM tools (`sw_get_model_info`, `sw_save_document`) kept working.
Save through COM, then restart SOLIDWORKS (or Run > Reset in the VBA editor). Keep
experimental API calls out of shared probes; try them in a throwaway `.swb` first.

**`sw_set_display_mode` is off by one** — its map is 0..4, the real swViewDisplayMode_e is
Wireframe 1, HLR 2, HLV 3, Shaded 4, ShadedWithEdges 5 (from SolidWorks.Interop.swconst.dll).

**New probes (2026-10-01):** `sw_topo.swb` (vertices, faces, edge segments → `swagent verify`
`vertex_count` and `point_checks`), `sw_display.swb` (turns off annotations, dimensions, planes,
origins, sketches before a picture), `sw_drawing_fa.swb` (first-angle Front / Left-right / Top-below,
HLV, reads back projection flag and view positions — written, not yet run).
