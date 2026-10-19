---
name: creo-modeling
description: Build or edit a part in PTC Creo Parametric for Beshoy Adel. Use whenever he asks to draw, model, sketch, extrude, cut or produce an isometric in Creo. Covers the installed version, how the window and start screen behave, unit templates, the cut/remove-material trap, and the explain-first workflow he expects. There is no Creo API automation on this machine yet; work is done by driving the GUI with computer use.
---

# Creo Parametric on Beshoy's machine

Measured in Claude Code sessions, September 2026.

## Setup facts

- **Creo Parametric 12.4.2.0** is installed. Its main window belongs to the process
  **`xtop.exe`**, not to the launcher — request computer-use access for `xtop.exe` or
  nothing is visible.
- On launch Creo shows a **start screen / list**. Close it, then **File > New** for a part.
- The default part template is **inch**. Use **`mmns_part_solid`** (millimetre). If the
  part was already started in inch, fix the units before the first feature.
- Launching twice by accident leaves two Creo processes. Close the extra one.
- Only **one Claude session can hold computer use at a time**. If clicks are refused,
  another session owns it — ask Beshoy to press Stop in that session, then retry.
- No Creo skill or automation API is set up. A faster route would be Creo's own
  automation (J-Link / Creo Toolkit / mapkeys); propose it before investing time.

## How he wants Creo work done

1. **Explain the drawing first.** Describe the body, every feature, its dimensions and the
   build order, and list every ambiguity (missing length, hidden vs visible line, which
   corners carry a chamfer). Wait for answers before opening Creo.
2. Ask once whether he needs a real Creo feature tree (graded) or only the 3D shape and
   isometric. Default: real feature tree.
3. Report each feature as it is finished.

## Traps that already cost time

- **A cut that adds material.** An extrude meant as a slot came out as added material;
  Beshoy caught it ("انت مقطعتش انت زودت ماتريال"). In the Extrude tab make sure
  **Remove Material** is on and the direction points into the body, then check from an
  isometric (Ctrl+D) that the slot is really empty.
- In the front view a slot cut along the depth direction is invisible — check from
  isometric before concluding anything.
- Selecting hidden edges for chamfers in 3D is unreliable. Switch to wireframe or use a
  precise selection filter; do not fall back to redrawing the base sketch.
- Beshoy prepares Creo himself when asked ("انا هفتحلك و اجهزلك انت ارسم فقط") — say
  exactly what you need ready: new part, mmns template, datum planes visible, model tree.
