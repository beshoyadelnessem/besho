---
name: solidworks-validation
description: Independently verify a finished SolidWorks model against the drawing and the feature plan using measured API geometry. Use after modelling, or whenever asked to check, validate, confirm or measure a part. Checks overall and critical dimensions, feature count, hole count and positions, symmetry, bounding box, volume, mass, geometry validity, rebuild status, sketch degrees of freedom and feature-tree consistency, and produces a pass/fail build report. Rejects visual similarity as evidence.
---

# Layer 4 — Validation

A model is correct when it **measures** correct. "It looks right" is not a result, and a
screenshot is not evidence. This skill replaces visual acceptance with numbers.

## Run the verification

```
1. sw_rebuild_model                                  (trigger the rebuild)
2. sw_run_macro(macro_path="...\\swagent\\probes\\sw_inspect.swb",
                module_name="sw_inspect", sub_name="main")
3. Bash: <venv>\python.exe ...\swagent\bin\swagent.py verify --plan <feature_plan.json>
```

`swagent verify` exits 0 on pass and 1 on fail, and prints one line per check. It reads the
acceptance criteria out of the plan, so a plan with an empty `expected` block verifies
nothing. Fill it in during Layer 2.

Without a plan, `swagent report` gives the same measurements unjudged, and you compare them
against the DRAWING SPEC by hand.

## What gets checked

**Non-negotiable, every time**

- `rebuild.isClean` — the model rebuilt without error. Read this from the probe, never from
  `sw_rebuild_model`, which always claims success.
- `featureSummary.withErrors == 0` — no feature carries an error code.
- every sketch feeding a solid feature has `openEndpointCount == 0`.

**Against the drawing**

- overall envelope: `boundingBoxMm.dx/dy/dz` against the spec's overall dimensions
- critical dimensions: `sw_get_dimension` on each named dimension the drawing calls out
- feature count and feature types against the planned tree
- hole count and hole positions
- symmetry: for a part symmetric about a plane, the centre of mass must lie on it, and the
  bounding box must be symmetric about it
- volume and mass, when the drawing or the material makes them meaningful
- body count — an unexpected second body means a feature did not merge

**Model health**

- sketch degrees of freedom against the calibration table
- feature-tree consistency: the tree that exists matches the tree that was planned, in
  order, with the planned types

## Tolerances

`tolerance_mm` in the plan governs linear checks and defaults to 0.01 mm. Volume and mass
default to 0.1% and can be overridden with `volume_tolerance_mm3` and `mass_tolerance_kg`.
Do not widen a tolerance to make a check pass. A failing check is information.

## The DOF calibration table

`ISketch::GetConstrainedStatus` returns an integer whose meaning is **measured, not
assumed**. Until it is calibrated, `swagent report` prints
`dof=raw=N (UNCALIBRATED)` and `require_fully_defined` fails closed.

To calibrate:

```
swagent.py args action=calibrate
sw_run_macro(... sw_control.swb ..., sub_name="main")
# read %LOCALAPPDATA%\SWAgent\out\control.json
swagent.py calib --set UNDER_DEFINED=<underDefinedRaw> FULLY_DEFINED=<fullyDefinedRaw>
```

The probe builds a free line and a pinned line in a scratch part and reports what
SolidWorks actually returns for each. Close the scratch part afterwards with
`sw_close_document`.

## Hidden and occluded features

A feature you cannot see is still a feature that must be verified. Do not rotate the model
and take another picture. Use:

- `sw_get_mass_properties` and the probe's volume — a missing pocket shows up as volume
  that is too high, a doubled cut as volume too low
- `geometry.faceCount` / `edgeCount` — a through-hole adds a known number of faces
- `sw_measure_distance` between named entities
- `sw_create_section_view` when a human needs to see it, **after** the numbers already
  confirmed it

Volume is the sharpest single check available. For a part whose intended volume is
computable, it catches nearly every missing, doubled or misplaced feature at once.

## Reporting

Give the user:

1. **pass or fail**, first
2. the check table, failures first
3. measured against expected for every dimension that matters
4. anything that could not be verified, said plainly

Never write "the model matches the drawing" without the numbers behind it. If a check could
not run — no plan, no material, an uncalibrated enum — say which check and why, rather than
quietly dropping it.

On failure, hand off to `solidworks-error-recovery`. Do not adjust the model and re-verify
in the same breath without diagnosing first.
