---
name: solidworks-professional-modeling
description: Execute an approved SolidWorks FEATURE PLAN with checkpoints, parametric sketch discipline and per-feature verification. Use for any request to draw, sketch, model, extrude, cut, pattern, mirror, fillet or otherwise build or edit geometry in SolidWorks. Creates each feature, rebuilds, then verifies against measured API geometry rather than screenshots, using the swagent probes. Enforces fully-defined sketches, proper relations, design intent and editable feature trees, and batches operations to keep CAD tool calls low.
---

# Layer 3 — SolidWorks Executor

Input: an approved FEATURE PLAN. If there is no plan, stop and run
`solidworks-cad-planning` first. Modelling straight from a drawing image is the failure
mode this whole workflow exists to prevent.

## The setup you are driving

The MCP server is `Solidworks-MCP-Server` (187 `sw_*` tools, Python + COM), at
`D:\claude\solidworks`. Alongside it sits the **swagent
verification sidecar**, which is where trustworthy model state comes from.

### Reading model state — the only reliable route

```
1. sw_run_macro(macro_path="D:\\claude\\solidworks\\swagent\\probes\\sw_inspect.swb",
                module_name="sw_inspect", sub_name="main")
2. Bash: "D:\claude\solidworks\.venv\Scripts\python.exe" \
         "D:\claude\solidworks\swagent\bin\swagent.py" report
```

Two calls give you: rebuild status, every feature with its real error code, every sketch's
constrained status, open-endpoint count and relation count, bounding box, volume, surface
area, mass, centre of mass, and body/face/edge counts.

### Preflight, every session

```
swagent.py args action=preflight     then run sw_control.swb
```

`swInputDimValOnCreate` (preference 10) is on by default and again after every SolidWorks
restart. It raises a modal box when a dimension is created, which interrupts macro
execution, hangs the MCP call, and has crashed SolidWorks here. Preflight disables it.

### Pin the document

`ActiveDoc` drifts between calls. Pass `doc=<title>` to every probe and `--expect-doc` to
every report and verify. Do not skip this because the document "should" still be active.

### Three MCP tools that report success when they have failed

Verified by reading the server source. Do not trust them:

| tool | what it actually does |
|---|---|
| `sw_rebuild_model` | calls `EditRebuild3` and **discards the return value**; always reports `rebuilt: true` |
| `sw_check_geometry` | swallows the exception from `CheckDocument` and returns `errors: 0, status: OK` |
| `sw_run_vba_code` | executes, but returns only `executed: true` — **no data channel** |

Call `sw_rebuild_model` to trigger the rebuild, then read the real status from
`sw_inspect`'s `rebuild.isClean` and `featureSummary.withErrors`. Never report a rebuild as
clean on the strength of `sw_rebuild_model`'s own answer.

### Probe mechanics

- A plain-text `.swb` macro **only exposes its `main` entry point**. `sub_name` is ignored.
  `sw_control.swb` therefore dispatches on an `action=` argument.
- Arguments go in `%LOCALAPPDATA%\SWAgent\in\args.txt` as `key=value` lines. Write them
  with `swagent.py args action=checkpoint label=base_solid`.
- Probe output lands in `%LOCALAPPDATA%\SWAgent\out\`.
- VBA passes Variant array elements into `ByRef Double` parameters as a **compile error**.
  If you edit a probe, declare helper parameters `ByVal` and wrap with `CDbl()`.

## Checkpoints

```
swagent.py args action=checkpoint label=<step>
sw_run_macro(... sw_control.swb ..., sub_name="main")
```

Saves a full copy to `%LOCALAPPDATA%\SWAgent\checkpoints\<label>_<timestamp>.SLDPRT`
without changing the active document's identity. Take one:

- after the base solid is verified
- before any step the plan flagged as risky
- before any operation on a face whose identity could shift

To restore, open the checkpoint file with `sw_open_document`. For surgical undo, delete
the offending feature with `sw_delete_feature` instead — cheaper, and it keeps the
document you are working in.

## The execution loop

For every feature in the plan, in order:

**Create → Rebuild → Verify → Inspect → Continue**

1. **Create** — issue the `sw_*` calls the plan specifies.
2. **Rebuild** — `sw_rebuild_model`.
3. **Verify** — run `sw_inspect`, read the report.
4. **Inspect** — check, for this feature:
   - it exists, with the **name and type the plan predicted**
   - `hasError` is false
   - it landed on the intended plane or face
   - its sketch is closed (`openEndpointCount == 0`) when it feeds a solid feature
   - its sketch's DOF matches `expected_dof`
   - the dimensions read back what you set
   - the bounding box moved the way the feature should have moved it
5. **Continue** — only when all of that holds.

Batch the cheap deterministic calls inside one feature — sketch entities, relations,
dimensions — then verify once at the feature boundary. Verifying after every sketch line is
waste; verifying only at the end of the part is how a wrong model reaches the user.

**Never continue past an error.** Hand off to `solidworks-error-recovery`.

## Broken tools and their replacements

| instead of | use |
|---|---|
| `sw_add_sketch_dimension` (fails, or hangs) | `sw_dimension.swb` with `sketch=` `sel1=` `value=` `dimname=` |
| `sw_edit_sketch` (`MenuCommand` error) | `sw_dimension.swb` re-enters the sketch itself |
| `sw_list_open_documents` (all nulls) | `sw_control.swb` with `action=list` |
| `sw_extrude` for a **cut** (never cuts) | `sw_extrude.swb` with `cut=1` |
| `sw_extrude` mid-plane (no feature) | `sw_extrude.swb` with a measured `endcond=` |

`swagent/MCP_NOTES.md` in the server repo carries the full measured reference, including
the DOF calibration, the end-condition values that actually work, and the fact that a cut
extrude reports its type as `ICE`.

Two sequencing facts that cost a rebuild each if forgotten:

- **a rebuild closes the active sketch**, so a rebuild between two dimension calls leaves
  the second with nothing selected
- **after `sw_exit_sketch` nothing is selected**, so an extrude needs
  `sw_select_entity(name, "SKETCH")` first

## Four ways the geometry comes out wrong without an error

Measured on SOLIDWORKS 2022. None of these reports a failure.

**Draw every arc before any line.** The MCP never sets `SketchManager.AddToDB`, so
inferencing is live and each new entity snaps onto geometry that already exists. A line
drawn before the arc it should meet has nothing to snap to, and the arc created afterwards
lands a fraction of a nanometre away, leaving two separate points. Coordinates read back
identical to nine decimals, every endpoint looks paired, and the extrude returns only
"Ensure a closed sketch profile is selected/active". Confirm with
`ISketch::GetSketchContours` — a profile that should be one loop comes back as 2. Chasing
decimal precision does not fix this; only creation order does.

**Wrap a lone circle in `AddToDB`, never a profile.** With inferencing on, a circle snaps
its radius to something nearby: a Ø12 bolt hole came out R6.1631. Setting
`sk.AddToDB = True` around the single `CreateCircleByRadius` call, then `False` before
exiting, gives exactly R6.0000. Do not do this for a multi-entity profile — without
inferencing the endpoints never merge and the contour splits in two.

**A Top Plane sketch's vertical axis is −Z.** Sketch `(u, v)` maps to model `(X, −Z)`, so a
profile drawn at `v = +22` lands at `z = −22`. The feature then finds no material and
returns Nothing with no error text, which reads exactly like a bad profile. Negate every
`v` on the Top Plane, and swap arc start/end to keep the sweep direction.

**Put every cut after the bosses it must pass through.** A cut removes material from the
body as it stands at that moment, and a boss added later fills the void straight back in
with nothing complaining. A clamp split cut before the ears were extruded produced solid
ears that still passed every automated check. The proof that a split really cut: faces it
passes through appear **twice** in a face audit — one R14 ear end becomes two, one R6 hole
becomes two.

## A timed-out macro may still have run

`sw_run_vba_code` reporting a timeout does not mean the macro failed, and re-issuing it can
execute the whole thing a second time. A duplicate `Boss-Extrude` in the tree is the
symptom. After any timeout, list the features and count bosses and cuts against the plan
before running anything again.

## Parametric sketch rules

A sketch built from coordinates alone is a drawing, not a model. Build every sketch so the
dimensions drive the geometry.

**Relations first, dimensions second, coordinates last.** Prefer, in this order:

- coincident — tie the profile to the origin; this is what anchors the sketch
- horizontal / vertical — on every line that is nominally orthogonal
- symmetric — about a centerline, for anything the drawing shows as symmetric
- equal — for features the drawing dimensions once and repeats
- concentric — circles and arcs sharing a centre
- tangent — arc-to-line and arc-to-arc transitions
- collinear, midpoint, pierce — where the geometry calls for them

Then dimension only what actually drives the shape. A fully defined sketch has exactly
enough dimensions and not one more.

Construction geometry is not optional decoration. Use it for bolt-circle diameters,
symmetry axes, and layout lines. It carries design intent that coordinates cannot.

With this MCP, relations and dimensions are applied by selection:

```
sw_select_entity(entity_name="Line1", entity_type="SKETCHSEGMENT")
sw_select_entity(entity_name="Line3", entity_type="SKETCHSEGMENT", append=True)
sw_add_sketch_constraint(relation_type="EQUAL")
```

Available relations: HORIZONTAL, VERTICAL, COINCIDENT, PARALLEL, PERPENDICULAR, TANGENT,
COLLINEAR, CONCENTRIC, EQUAL, SYMMETRIC, MIDPOINT, INTERSECTION, FIX, PIERCE.

Name the dimensions that matter. `sw_set_dimension("Width@Sketch1", 60)` is a parameter.
`D1@Sketch1` is a number nobody will recognise in six months. Link related dimensions with
`sw_add_equation` and `sw_link_dimension_to_equation` where the drawing implies a
relationship rather than two independent values.

**Do not leave a sketch under-defined by accident.** Check `constrainedStatusRaw` against
the calibration table on every sketch. If you leave one under-defined on purpose — an
imported profile, a spline whose exact form is not dimensioned — say so, and list it in the
plan's `under_defined_allowed`.

### FIX is not a constraint

`FIX` pins geometry in place and makes the sketch report as defined without expressing any
design intent. It is the sketching equivalent of a magic number. Use it only to calibrate
the DOF enum, never in a delivered model.

## Design intent rules

The model must stay editable. Concretely:

- dimensions drive geometry, never the reverse
- symmetry instead of duplicated geometry
- patterns instead of repeated features
- mirrors instead of a second hand-built half
- reference geometry instead of derived coordinates
- Hole Wizard for standard holes, so the standard travels with the model

The finished tree should read like something a professional drew by hand. If a SolidWorks
designer opening it would not recognise the approach, the approach is wrong even if the
geometry is right.

## Speed

Optimise for fewer CAD tool calls, never for fewer checks.

- Plan deterministic runs of operations and issue them together.
- Use the API through the MCP; never drive SolidWorks by clicking through computer-use.
- Take screenshots as **supporting** evidence only. `sw_capture_screenshot` confirms
  nothing on its own — a wrong model photographs beautifully.
- Do not re-query state that has not changed.
- Roll back to a checkpoint rather than rebuilding the part from scratch.

## Finishing

When the last feature is in, hand off to `solidworks-validation`. The part is not done
because the tree is complete. It is done when it has been measured.

## Reference files in this skill

- `references/MCP_NOTES.md` — measured behaviour of every MCP tool on this machine (copied
  from `D:\claude\solidworks\swagent\MCP_NOTES.md` when the upload zip is built; the D:
  copy is the master).
- `references/solidworks-com-quirks.md` — COM argument counts, template trap, image export,
  mass-property lag, and the machine setup facts (mcp<2 pin, Desktop config overwrite).
