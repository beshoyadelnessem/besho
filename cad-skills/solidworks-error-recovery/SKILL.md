---
name: solidworks-error-recovery
description: Diagnose and repair a failed SolidWorks operation, rebuild error, invalid sketch or failed validation check in a controlled way. Use when a feature fails to create, a rebuild reports errors, a sketch will not close or solve, a dimension or relation is rejected, a validation check fails, or an MCP call returns an error. Identifies the precise cause, corrects the smallest possible part of the model, rebuilds, re-verifies, and rolls back to a checkpoint when needed. Forbids trying commands at random until something works.
---

# Layer 5 — Error Recovery

The rule that matters most: **do not try things until something works.** Randomly retrying
CAD commands corrupts the feature tree and destroys the design intent the plan encoded. One
diagnosis, one minimal correction, one re-verification.

## The loop

**Diagnose → Classify → Correct minimally → Rebuild → Re-verify → Continue**

### 1. Diagnose

Get the actual failure. Not the symptom, the cause.

```
sw_run_macro(... sw_inspect.swb ..., sub_name="main")
<venv>\python.exe ...\swagent\bin\swagent.py report
```

That gives you the failing feature's real error code, the rebuild state, and every sketch's
closure and DOF. Read it before forming a theory.

Remember that `sw_rebuild_model` and `sw_check_geometry` always report success. If your
only evidence that something is fine came from one of those, you have no evidence.

### 2. Classify

Put the failure in exactly one bucket. The bucket determines the fix.

| bucket | how it shows up | the actual fix |
|---|---|---|
| **wrong reference** | feature built on the wrong face; references shifted after an earlier edit | re-select by stable identity, or reorder so the reference exists first |
| **wrong plane** | geometry correct but oriented or positioned wrong | recreate the sketch on the intended plane; do not rotate the body to compensate |
| **invalid sketch** | "cannot create", zero-thickness, self-intersecting | check `openEndpointCount` and `segmentCount`; close the profile or remove the overlap |
| **missing constraint** | geometry drifts on rebuild; DOF not as planned | add the relation the plan named — not a FIX |
| **invalid feature order** | a feature references something built later | reorder the tree; this is a plan defect, fix the plan too |
| **rebuild failure** | `isClean` false, features carry error codes | fix the *first* failing feature; later errors are usually consequences |
| **API / MCP issue** | tool returns an error, or a call has no effect | check the tool's real signature in `server.py` before assuming the model is at fault |

**Fix the first failing feature first.** Errors cascade down a feature tree. The third
error in the list is very often the first one wearing a disguise.

### 3. Correct minimally

Change the smallest thing that can possibly explain the failure.

- one relation, not the whole sketch
- one dimension, not the whole feature
- one feature reordered, not the tree rebuilt

Do not delete and recreate a feature when a dimension will do. Do not restart the part when
a rollback will do. Each rebuild-from-scratch throws away the constraint work that made the
model editable.

### 4. Roll back when the correction is not local

```
swagent.py args action=checkpoint label=before_fix     # checkpoint the broken state first
```

Then choose:

- **surgical** — `sw_delete_feature` on the offending feature, then rebuild it correctly.
  Keeps the document and everything downstream that was fine.
- **full** — `sw_open_document` on the last good checkpoint in
  `%LOCALAPPDATA%\SWAgent\checkpoints\`, and replay the plan from that step.

Checkpoint the broken state before you repair it. A failure you can reproduce is worth more
than one you destroyed.

### 5. Rebuild and re-verify

`sw_rebuild_model`, then the probe, then the report. The fix is not confirmed until the
measurement confirms it. Re-run `swagent verify --plan` when there is a plan, because a
local fix can break a global acceptance criterion — a corrected cut depth changes the
volume.

### 6. Continue

Resume the plan at the next step only when the model is clean. If the same feature fails
twice with two different diagnoses, the diagnosis is wrong. Stop and reconsider the plan
rather than attempting a third fix.

## When to stop and ask

Stop and go back to the user when:

- the failure traces to a dimension the DRAWING SPEC marked `assumed` or `missing` — the
  drawing, not the model, is the problem
- the plan's feature order cannot produce the drawn geometry, and fixing it changes the
  design intent
- the same feature has failed twice
- the correction would require abandoning symmetry, a pattern, or a parametric relation the
  plan committed to

Say which bucket the failure fell into, what you tried, and what you need. Do not quietly
switch to a cruder modelling approach to get something on screen. A part that builds but is
not editable is a worse outcome than a part that stopped and asked.

## What not to do

- do not retry the same call hoping for a different result
- do not add `FIX` relations to silence a DOF complaint
- do not widen a tolerance to turn a failing check green
- do not suppress a failing feature and carry on
- do not accept a screenshot as proof that the repair worked

## "SolidWorks closed by itself" — check the exit record before calling it a crash

SOLIDWORKS rewrites `%APPDATA%\SolidWorks\SOLIDWORKS 2022\SolidWorksPerformance.log` when it
exits, and the tail says how it went:

- `<SW EXIT>Upper-Right "X" click</SW EXIT>` with `<BEGIN_SHUTDOWN> User_initiated` — the
  window was closed by hand. Not a crash.
- a `<PROCMEM> CMD:AppFinish` block ending in `<EOSL>0</EOSL>` — an orderly shutdown.
- SOLIDWORKS gone but the file not rewritten — suspect a hard crash or a killed process.

A real crash leaves at least one trace: an `Application Error` event 1000 naming
`SLDWORKS.exe`, a folder `C:\ProgramData\Microsoft\Windows\WER\ReportArchive\AppCrash_SLDWORKS.exe_*`,
or a dump in `%LOCALAPPDATA%\CrashDumps`. **Read the WER folder's creation date.** This
machine keeps crash reports for months; six from March 2026 nearly got blamed for a clean
close in September.

`%APPDATA%\SolidWorks\FileAccess.log` lists every file the session opened, in UTC — three
hours behind local time here. Cross-check the System log for event 42 (sleep) and 1074
(shutdown). On 2026-09-12 the window was closed at 19:35:38 and the laptop slept 40 seconds
later.

Two sessions can drive the same SOLIDWORKS, so before blaming the MCP, search the other
session transcripts for `ExitApp`, `sw_close` and `left_click`.
