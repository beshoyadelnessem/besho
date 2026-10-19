---
name: solidworks-modeling
description: "Build or edit SOLIDWORKS geometry by generating a macro that drives the SOLIDWORKS COM API, instead of clicking the GUI. Use whenever asked to draw, sketch, model, extrude, or modify a part in SOLIDWORKS."
---

# SOLIDWORKS modeling

## Core rule

**Never build geometry by clicking in the SOLIDWORKS graphics area.** Generate a script that drives the SOLIDWORKS COM API and have the user run it.

GUI clicking fails on SOLIDWORKS specifically because:

- Geometry needs pixel-exact clicks, but the origin's screen position must be reverse-engineered from the status bar, and the view auto-zooms after every operation.
- Sketch entities snap to whatever is nearest, so a click a few pixels off silently produces wrong geometry.
- One stray `Escape` or `Ctrl+Z` deletes the whole sketch, and PropertyManager fields collapse entities when edited out of order.
- Every step needs a screenshot to verify, so a five-feature part costs dozens of round trips.

The API has none of these problems: exact numbers, repeatable, one shot.

Use the GUI only for things that are *not* geometry: opening a file, checking a result visually, changing a view.

## Workflow

1. Ask for the dimensions if the user did not give them. Do not guess silently — if you must assume, state the assumption.
2. Write the script (see boilerplate below).
3. Deliver it and get it run — pick whichever path fits the session:
   - **`.vbs` file** — send it with `SendUserFile`; the user double-clicks it. If a folder is connected, write it there with `device_commit_files` instead so it lands on their machine directly.
   - **VBA macro** — paste the same code (minus the `GetObject` block) into `Tools > Macro > New`, then Run. Use this when antivirus blocks `.vbs`.
4. Verify: take a screenshot of the SOLIDWORKS window and confirm the feature tree and geometry match what was asked.

## Units — the single most common bug

The API is **always meters and radians**, regardless of the document's unit system. A 100 mm extrusion is `0.1`. A 30° draft is `0.5236`. Define a constant and convert once:

```vbs
Const MM = 0.001
Dim side : side = 100 * MM   ' 100 mm
```

## Boilerplate (VBScript)

```vbs
Option Explicit
Const MM = 0.001

Dim swApp, swModel, swSketchMgr, swFeatMgr, sTemplate

On Error Resume Next
Set swApp = GetObject(, "SldWorks.Application")
If swApp Is Nothing Then
    Err.Clear
    Set swApp = CreateObject("SldWorks.Application")
End If
On Error GoTo 0

If swApp Is Nothing Then
    MsgBox "Could not connect to SOLIDWORKS.", 16 : WScript.Quit
End If
swApp.Visible = True

sTemplate = swApp.GetUserPreferenceStringValue(9)   ' 9=part 10=assembly 11=drawing
Set swModel = swApp.NewDocument(sTemplate, 0, 0, 0)
If swModel Is Nothing Then MsgBox "No default part template.", 16 : WScript.Quit

Set swSketchMgr = swModel.SketchManager
Set swFeatMgr   = swModel.FeatureManager

' ... geometry here ...

swModel.ShowNamedView2 "*Isometric", 7
swModel.ViewZoomtofit2
swModel.ClearSelection2 True
```

To work on the **already-open** document instead of a new one, use `Set swModel = swApp.ActiveDoc` and skip `NewDocument`.

## Recipes

### Sketch on a plane

```vbs
swModel.Extension.SelectByID2 "Front Plane", "PLANE", 0, 0, 0, False, 0, Nothing, 0
swSketchMgr.InsertSketch True      ' open
' ... entities ...
swSketchMgr.InsertSketch True      ' close
```

Plane names depend on the template — `"Front Plane"`, `"Top Plane"`, `"Right Plane"` in the standard English one. If `SelectByID2` returns `False`, the name is wrong; fall back to selecting by index through `FeatureByPositionReverse`.

### Sketch entities (all coordinates in meters)

```vbs
swSketchMgr.CreateCenterRectangle 0, 0, 0, w/2, h/2, 0    ' centred on origin
swSketchMgr.CreateCornerRectangle 0, 0, 0, w, h, 0
swSketchMgr.CreateCircleByRadius  0, 0, 0, r
swSketchMgr.CreateLine  x1, y1, 0, x2, y2, 0
swSketchMgr.CreatePolygon 0, 0, 0, r, 0, 0, n, True       ' n sides, inscribed
swSketchMgr.CreateCenterLine 0, 0, 0, 0, h, 0             ' revolve axis
```

Centre sketches on the origin whenever the geometry is symmetric — it fully defines position with no extra relations.

### Extrude

```vbs
swModel.Extension.SelectByID2 "Sketch1", "SKETCH", 0, 0, 0, False, 0, Nothing, 0
swFeatMgr.FeatureExtrusion3 _
    True, False, False, _        ' single-ended, no flip, no reverse
    0, 0, _                      ' end conditions: 0=Blind, 4=MidPlane, 1=ThroughAll
    depth, 0.01, _
    False, False, False, False, _
    0.0174533, 0.0174533, _
    False, False, False, False, _
    True, True, True, _
    0, 0, False
```

For a symmetric solid use `4` (MidPlane) as the first end condition **and** pass `False` for the first argument.

### Other features

```vbs
' Cut — same signature shape as extrusion
swFeatMgr.FeatureCut4 True, False, False, 0, 0, d, 0.01, False, False, False, False, _
    0.0174533, 0.0174533, False, False, False, False, False, True, True, True, True, _
    False, 0, 0, False, False

' Revolve — select the profile sketch and a centreline first
swFeatMgr.FeatureRevolve2 True, True, False, False, False, False, 0, 0, _
    6.2831853, 0, False, False, 0.01, 0.01, 0, 0, 0, True, True, True

' Fillet — select edges/faces first
swFeatMgr.FeatureFillet3 195, r, 0, 0, 0, 0, 0, Nothing, Nothing, Nothing, Nothing
```

### Save and export

```vbs
Dim errs, warns
swModel.Extension.SaveAs "C:\path\part.SLDPRT", 0, 1, Nothing, errs, warns
swModel.Extension.SaveAs "C:\path\part.STEP",   0, 1, Nothing, errs, warns
```

## Selection types for `SelectByID2`

`"PLANE"`, `"SKETCH"`, `"FACE"`, `"EDGE"`, `"VERTEX"`, `"SOLIDBODY"`, `"BODYFEATURE"`, `"AXIS"`.
Pass `True` as the `Append` argument to add to the current selection instead of replacing it.

## When computer use is genuinely needed

If you must drive the SOLIDWORKS window (opening a file, running the macro, checking a view) and clicks appear to succeed but nothing happens:

- **SOLIDWORKS is running as administrator.** Windows UIPI blocks synthetic input from a lower-integrity process. Screenshots still work, which is what makes it confusing. Fix: uncheck *Run this program as an administrator* in the shortcut's Compatibility tab and relaunch.
- A stuck `TextInputHost.exe` window can sit invisibly in front and swallow input. Granting it in the allowlist surfaces the error rather than failing silently.
- Verify input reaches *any* app (type into Notepad) before concluding the device is broken.