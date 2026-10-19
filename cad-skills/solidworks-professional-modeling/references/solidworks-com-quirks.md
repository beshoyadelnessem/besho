# SOLIDWORKS 2022 COM API quirks (measured on Beshoy's machine)

Driving SOLIDWORKS 2022 (rev 30.1.0) on this machine via `cscript` + the COM API. These cost real debugging time to discover:

- **`FeatureCut4` takes 27 arguments** on this version. 26 raises "Argument not optional"; the 27th is a trailing boolean. `FeatureExtrusion3` takes 23. `FeatureExtrusion2` needs more than 20 — don't use it as a fallback.
- **`SketchManager.AddToDB` — the rule in SKILL.md supersedes this line.** Measured later: `AddToDB = True` around a single lone circle gives an exact radius, but around a multi-entity profile the endpoints never merge and the contour splits in two. Earlier note, kept for context: setting it before creating entities and back to `False` before closing the sketch Without it SOLIDWORKS applies auto-inferencing/snapping that silently shifts coordinates — a tangent-line contour came out 2% larger in area than specified.
- **`NewDocument` can produce an assembly** if the default-template preference is wrong. Verify `GetUserPreferenceStringValue(9)` ends in `.prtdot`, fall back to `GetDocumentTemplate(1, "", 0, 0, 0)` then `NewPart()`, and check `GetType() = 1`. Sketches work in an assembly, but `FeatureExtrusion3` silently returns Nothing — which looks exactly like a geometry bug.
- **Image export**: `SaveAs2(path, 0, True, False)` with a `.png` path writes the file even though it returns 0. `.bmp` returns a truthy value but writes nothing. Use PNG and check the file on disk, not the return value.
- **Mass properties lag the material.** After `SetMaterialPropertyName2`, the first `Extension.CreateMassProperty()` still reports density 1. Rebuild and create it a second time. Material db: `C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\lang\english\sldmaterials\solidworks materials.sldmat`.
- **`GetBodies2` elements are unusable** from out-of-process VBScript (`GetBodyBox` → "Object required"). To verify geometry, extrude a profile 1 mm and read the volume — the number equals the profile area in mm² — or export views as PNG and look at them.
- `GetObject(, "SldWorks.Application")` often fails; `CreateObject("SldWorks.Application")` attaches to the running instance.

Verify locally before handing anything over.

## Machine setup facts

- MCP server: `D:\claude\solidworks` (Eduardof0nt/Solidworks-MCP-Server, 187 tools) with its own `.venv`.
  Base Python 3.12.10 at `C:\Users\Beshoy Adel\AppData\Local\Programs\Python\Python312\python.exe`.
- **Pin `mcp<2`.** `requirements.txt` says `mcp>=1.0.0`; mcp 2.x removed `mcp.server.fastmcp` and the
  server fails to import. A plain `pip install -r requirements.txt` breaks it again.
- **`claude_desktop_config.json` is overwritten by Claude Desktop on quit.** Edit it only after every
  `claude.exe` has exited (`D:\claude\mcp solid\fix_mcp_path.py` waits for that). `tasklist` prints
  the name lowercase.
- `server.py` `_startup_connect()` is patched to attach only (`launch_if_not_running=False`), so
  SOLIDWORKS does not open whenever Claude Desktop starts. Re-apply after any upstream update.
- `sw_client.py` DISPIDs were written for SOLIDWORKS 2024; on 2022 some tools fail (see MCP_NOTES.md).
- "SOLIDWORKS closed by itself": read `SolidWorksPerformance.log` for a user-initiated shutdown before
  calling it a crash (see the error-recovery skill).

## Learned 2026-09-24 .. 10-01

- **`sw_set_display_mode` is off by one.** Its map sends 0..4; the real `swViewDisplayMode_e`
  (read from `SolidWorks.Interop.swconst.dll`) is Wireframe 1, HLR 2, HLV 3, Shaded 4,
  ShadedWithEdges 5. "shaded_with_edges" therefore gives plain Shaded.
- **Enum values: read them from the interop DLL**, not the .chm (the enum pages list names
  only): `[Reflection.Assembly]::LoadFile("C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\SolidWorks.Interop.swconst.dll")`
  then `[Enum]::Parse(...)`. The API help itself is local: decompile
  `api\sldworksapi.chm` with `hh.exe -decompile <short-dir> <copy.chm>` (needs a short path).
- **Loft:** `sw_loft` is broken (14 args). A probe `sw_loft.swb` calling
  `InsertProtrusionBlend2` with **18** arguments created `Loft1` without error on 2026-09-24
  (17 arguments had parked SOLIDWORKS in VBA break mode). Volume not yet verified.
- **Isometric of a part with a face on the plane z = x:** the standard (1,1,1) isometric shows
  that face edge-on. Use the (-1,1,1) corner: `front`, then `sw_view_rotate(y_deg=45)`, then
  `sw_view_rotate(x_deg=35.264)`.
- `sw_export_file(.png)` renders without edges and with whatever is selected; for a picture
  of the screen use `sw_capture_screenshot` (BMP in %TEMP%) and convert. Turn off annotations,
  dimensions, planes, origins and sketches first (`swagent/probes/sw_display.swb`).
- `sw_save_as_copy` works for branching a variant part from a shared start (wedge → boss and notch).
- Document unit system of the default template here is **inch** (dimensions show 3.94 for
  100 mm). The API is in metres regardless.
