---
name: solidworks-cad-planning
description: Turn a DRAWING SPEC into an explicit SolidWorks FEATURE PLAN and proposed feature tree before any CAD command runs. Use after solidworks-drawing-analysis and before any modelling. Decides starting plane, origin and symmetry strategy, master/reference geometry, base sketch, primary feature, additive and subtractive features, patterns, mirrors, fillets and chamfers, and picks the right SolidWorks feature type (Extrude, Revolve, Sweep, Loft, Hole Wizard, Shell, Rib, Pattern, Mirror) rather than the one that is easiest to automate. Emits the acceptance criteria that Layer 3 is verified against.
---

# Layer 2 — CAD Planner

Input: a DRAWING SPEC with `ready_to_plan: true`.
Output: a **FEATURE PLAN** file. Copy and fill:

```
D:\claude\solidworks\swagent\templates\feature_plan.template.json
```

**Still no `sw_*` calls.** This skill produces a plan and shows it to the user. Execution
is Layer 3's job.

The plan is not a description of intent, it is a **contract**. `swagent verify --plan`
reads `feature_tree` and `expected` back out of it and fails the build when the model
disagrees. Write it as something you are willing to be measured against.

## Decisions, in order

### 1. Starting plane
Match the drawing's primary view to a SolidWorks plane so the model's orientation matches
the drawing's. Front view → Front Plane, plan/top view → Top Plane, side view → Right
Plane. A part modelled in the wrong orientation is technically correct and practically
useless, because every downstream drawing view comes out wrong. Record why you chose it.

### 2. Origin strategy
Put the origin where the drawing's dimensions originate from.

- Symmetric part → origin at the centre of symmetry, so mirroring is free.
- Dimensioned from one corner → origin at that corner.
- Rotational part → origin on the axis of revolution.

The origin is not arbitrary. It is the datum the whole model inherits.

### 3. Symmetry strategy
If the spec found symmetry, use it. In descending preference:

1. **Mid-plane extrude** — one feature, symmetric by construction, nothing to maintain.
2. **Mirror feature** — build one side, mirror about a plane.
3. **Sketch symmetry relations** — symmetric constraints inside the sketch.
4. Duplicating geometry by hand — **do not**.

### 4. Master / reference geometry
Decide before sketching whether you need reference planes, axes, or a layout sketch.
A part built on reference geometry driven by a few master dimensions stays editable.
A part built on numbers scattered across ten sketches does not.

### 5. Primary feature
The single feature that establishes the part's bulk. Everything else modifies it. Usually
the base extrude or revolve from the primary view's outline.

### 6. Feature order
Order features the way a machinist would make the part, and the way a designer would model
it:

```
base solid  →  additive features  →  subtractive features  →  patterns
            →  mirrors  →  fillets and chamfers  →  shell / finishing
```

Rules that matter:

- **Fillets and chamfers go last.** They are cosmetic-to-topology and they break downstream
  face references when they come early. The one exception is a fillet a later feature must
  actually reference.
- **Pattern after the seed feature is complete**, including its own fillets when those are
  part of the repeated unit.
- **Shell after the solid is fully shaped** but before the fillets that should not be
  shelled.
- **Hole Wizard holes after the faces they sit on exist**, obviously, but also after
  patterns when the holes themselves are what repeats.

### 7. Feature type selection

Choose by what the geometry *is*, not by what is easy to automate:

| geometry | feature |
|---|---|
| constant cross-section along a straight path | **Extrude** |
| cross-section revolved about an axis | **Revolve** |
| constant section along a non-straight path | **Sweep** |
| section that changes between stations | **Loft** |
| standard fastener hole (counterbore, countersink, tapped) | **Hole Wizard** |
| plain round hole with no standard behind it | Cut-Extrude with a circle |
| uniform wall from a solid | **Shell** |
| repeated feature | **Linear / Circular Pattern** |
| mirrored half | **Mirror** |
| edge break | **Fillet / Chamfer** |
| stiffener between faces | **Rib** |

A revolved part modelled as a stack of extrudes is wrong even when the geometry comes out
right, because it does not edit the way the real part edits. **Do not pick an easier
feature because it is easier for you.**

Use Hole Wizard when the drawing names a standard (M6, 1/4-20, counterbore for M8 socket
head). Use a plain cut when the drawing just gives a diameter. Hole Wizard carries the
standard into the model and into the hole table; a plain cut does not.

### 8. Sketch plan
For each sketch in the tree, commit in advance to:

- which plane or face it sits on
- what entities it contains
- **which relations make it fully defined** — name them: coincident to origin, horizontal,
  vertical, tangent, concentric, equal, symmetric, collinear
- which dimensions drive it, and what each one drives
- whether construction geometry is needed (bolt circles, symmetry axes, layout lines)
- `expected_dof`: `fully_defined`, or `under_defined` **with a written reason**

Plan the constraints, not the coordinates. Coordinates get you geometry that looks right
and collapses on the first edit. See `solidworks-professional-modeling` for the execution
rules.

### 9. Checkpoints
Mark the steps after which the model should be checkpointed. At minimum: after the base
solid, and before any feature you flagged as risky. Checkpoints are cheap and they are the
difference between rolling back one feature and rebuilding the part.

### 10. Acceptance criteria
Fill `expected` with numbers the finished model must read back:

- `dx`, `dy`, `dz` — the overall envelope from the spec
- `body_count` — normally 1; if not, say why
- `face_count` / `edge_count` — when you can predict them confidently, they catch a
  surprising number of wrong-topology builds
- `volume_mm3`, `mass_kg` — when they are computable or stated

Set `require_fully_defined` true unless the plan deliberately leaves a sketch open, in
which case list it in `under_defined_allowed` and give the reason in the tree entry.

## Present the plan

Show the user the proposed feature tree before executing:

```
Front Plane
 └─ Sketch1          outer profile, symmetric about origin, fully defined
    └─ Boss-Extrude1  mid-plane, 44 mm
       └─ Sketch2     bolt circle, 4× Ø8 on Ø46 PCD
          └─ Cut-Extrude1  through all
             └─ CirPattern1  4 instances, 90°
                └─ Fillet1   R3 on vertical edges
```

with the envelope and the acceptance criteria. Then hand off to
`solidworks-professional-modeling`.
