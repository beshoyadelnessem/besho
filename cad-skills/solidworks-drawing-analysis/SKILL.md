---
name: solidworks-drawing-analysis
description: Read an engineering drawing into a structured DRAWING SPEC before any CAD work begins. Use whenever the user supplies a drawing, sketch, blueprint, photo of a part, PDF/DWG, or a described part and wants it modelled in SolidWorks. Extracts views, datums, symmetry, centerlines, overall and feature dimensions, holes/slots/cuts/bosses/grooves/fillets/chamfers, patterns, mirrors, hidden features, section views, units and design intent, and flags every missing or ambiguous dimension. Always runs before solidworks-cad-planning. Never invents a dimension.
---

# Layer 1 — Engineering Drawing Analyst

You are reading a drawing, not building a part. **SolidWorks stays untouched during this
skill.** No `sw_*` tool call belongs in this phase.

The deliverable is one file: a **DRAWING SPEC**. Copy the template and fill it in.

```
D:\claude\solidworks\swagent\templates\drawing_spec.template.json
```

Write the filled spec next to the user's drawing, or to
`%LOCALAPPDATA%\SWAgent\specs\<name>.spec.json` when there is no obvious home for it.

## The cardinal rule

**Never invent a dimension.** Not a rounded one, not a "typical" one, not one inferred
from how the drawing looks. Every number in the spec carries a `provenance` tag:

| provenance | meaning |
|---|---|
| `stated` | printed on the drawing as a dimension or note |
| `derived` | computed from stated values by arithmetic you can show |
| `assumed` | you chose it; **must** also appear in `open_questions` |
| `missing` | needed but absent; **must** also appear in `open_questions` |

A `derived` value must record the arithmetic. "60 overall minus two 10 walls = 40" is
derived. "Looks like about 40" is `assumed`, and it is a question, not a dimension.

## Reading order

Work through these in sequence and record what you find. Do not skip ahead to modelling
even when the part looks trivial.

1. **Inventory the views.** List every view on the sheet: front, top, right, isometric,
   section, detail, auxiliary, broken. Record the scale of each.
2. **Pick the primary view.** The one carrying the most shape information and the most
   dimensions. It usually becomes the base sketch plane in Layer 2. Say why you picked it.
3. **Establish projection convention.** First-angle or third-angle changes which side a
   view represents. Look for the projection symbol in the title block. If absent, infer
   from consistency between views and mark it `assumed`.
4. **Find the datums.** Datum feature symbols (A, B, C), and in their absence, the faces
   that dimensions actually originate from. Datums decide the origin strategy later.
5. **Find symmetry.** Centerlines, mirrored dimension pairs, "SYM" notes, a bolt circle.
   Symmetry is the single highest-value thing to detect: it turns two features into one
   mirrored feature and halves the sketch work.
6. **Read the centerlines.** Each one means something: an axis of revolution, a plane of
   symmetry, or a bolt-circle centre. Record which.
7. **Take the overall dimensions.** X, Y, Z envelope. These become the first acceptance
   check in Layer 3, so they must be exact.
8. **Take the feature dimensions.** Walk feature by feature, not dimension by dimension.
   For each: what it is, where it sits, what it references.
9. **Hunt hidden geometry.** Dashed lines in one view are a real feature you cannot see in
   another. Cross-read every view. A pocket visible only as hidden lines in the front view
   is still a pocket. **Do not simplify it away.**
10. **Read the section views.** Sections exist precisely because the internal geometry
    could not be dimensioned otherwise. Wall thicknesses, counterbores, internal fillets
    and through-features usually live here.
11. **Settle the units.** Look for the title-block unit note, the decimal convention, and
    the magnitude of the numbers. A 25.4 or a 0.5 tells you a lot. If genuinely unclear,
    that is a blocking question, because every dimension depends on it.
12. **State the design intent.** In a sentence or two: what this part does, what drives
    what, what would change if it were resized. This decides feature order in Layer 2.

## Feature taxonomy

Classify every feature you find as one of: boss, cut, hole, slot, groove, pocket, rib,
fillet, chamfer, thread, shell, draft, pattern, mirror. Record for each:

- the geometry that defines it (diameter, depth, width, length, radius, angle)
- where it is positioned and **what it is positioned from** (origin, a datum, another face)
- whether it is through or blind
- whether it repeats, and if so, whether as a linear pattern, circular pattern, or mirror

A repeated feature recorded as N separate features is a spec bug. Record it once with its
pattern definition. Layer 2 will build it as a pattern, which is what a designer would do.

## Ambiguity handling

Sort every gap into one of two buckets:

**Blocking** — the value changes topology or engineering meaning. A missing hole diameter,
an unclear through-vs-blind, an unreadable wall thickness, unknown units, a dimension that
contradicts another. **Stop. Ask.** Give the user the candidate readings you are choosing
between, and say what each would produce.

**Non-blocking** — the value is cosmetic and does not change what the part is. A fillet
radius on a non-functional edge, an unspecified chamfer size. Record it as `assumed`, put
it in `open_questions` with `blocking: false`, state the value you used, and continue.

When the drawing contradicts itself, say so explicitly and quote both numbers. Do not
silently pick one.

## Finishing

Set `ready_to_plan: true` only when no `open_questions` entry has `blocking: true`.

Then report to the user, in prose:

- what the part is, in one sentence
- the view inventory and which view is primary
- the overall envelope
- the feature list with counts
- **every assumption you made and every question you still have**

Then hand off to `solidworks-cad-planning`. Do not start modelling from this skill.

## Reference

`references/projection-and-intersection.md` — first-angle layout, the square-in-square
analysis, intersection-line rules, ellipse major/minor and the cos-vs-sin rule, as worked
out for Beshoy's MCV exam. Read it for any missing-view or intersection question.
