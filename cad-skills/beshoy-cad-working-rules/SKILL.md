---
name: beshoy-cad-working-rules
description: How Beshoy Adel wants CAD and engineering work done — SOLIDWORKS, Creo, engineering drawings, missing-view questions, design reports. Use at the start of any CAD, 3D-modelling, engineering-drawing or mechanical-design task for Beshoy, and whenever a session learns something new that should be kept. Covers language, file and folder rules, the shared SOLIDWORKS instance, verification before delivery, and how to send new lessons to the shared knowledge inbox.
---

# Working with Beshoy Adel on CAD and design

## Who

Mechanical design engineer. Works hands-on in **SOLIDWORKS 2022 SP1** (rev 30.1.0) and
**Creo**. Applied for a Design Engineer role at MCV (bus manufacturer); exam passed,
technical interview held 2026-09-19/20. Building a professional SOLIDWORKS CAD agent on a
local MCP server and benchmarks it against MecAgent.

- **Reply in Egyptian Arabic.**
- **Every file, report or document is in English, authored as "Beshoy Adel".**
- He is impatient with long silent work: show progress, give the conclusion early.
- He often brings research from another assistant. Treat it as candidate ideas to check
  against his real setup, not as decisions. Do not replace his MCP without a reason.

## Files and folders

- **Never delete anything.** Move it instead (old material goes to `D:\claude\mcp solid\_old`).
- **Nothing on the Desktop** without asking first. Scratch output goes to a temp folder.
- **One folder per part, named after the part, with an `images\` subfolder**, created
  before the first save. Nothing loose in a root folder (`D:\mcv`, `D:\claude\solidworks`).
- Back up a file before editing it: `D:\claude\mcp solid\_backup_<name>.<date>`.

## SOLIDWORKS sessions

- The MCP server lives at `D:\claude\solidworks`; measured tool behaviour is in
  `D:\claude\solidworks\swagent\MCP_NOTES.md` (also bundled in the
  `solidworks-professional-modeling` skill as `references/MCP_NOTES.md`). Read it first.
- **Several Claude sessions share one SOLIDWORKS instance.** Check the active document
  title (`sw_get_model_info`) before any feature or destructive call. Never close a
  document you did not open.
- **Work in one document.** Do not open a new part for every retry.
- **SOLIDWORKS must never start on its own.** The MCP server only attaches at startup.
- **Confirm under-dimensioned geometry before modelling.** State the reading, ask for the
  one missing number. Never invent a dimension.
- **Verify before delivering.** Run it, measure it, fix it, then hand it over. Never send
  a script or model to "try". Screenshots are supporting evidence only.
- Do not help bypass or repair software licensing. If SOLIDWORKS shows a licence error,
  stop and tell him.

## Workflow

`ANALYZE → PLAN → EXECUTE → VERIFY → CORRECT → FINAL VERIFY`, using the skills
`solidworks-drawing-analysis`, `solidworks-cad-planning`, `solidworks-professional-modeling`,
`solidworks-validation`, `solidworks-error-recovery`.

## Engineering-drawing conventions he uses

- Egypt / ISO = **first-angle projection**: the view to the right of the front view is the
  LEFT view, and the view below the front view is the TOP view.
- Angle rule taught in his MCV report: plane-to-plane or axis-to-axis uses **cos**,
  plane-to-axis uses **sin**.

## Keep the knowledge growing — every session

When something new is learned (a tool quirk, a correction from Beshoy, a preference, a
working method), record it **as it happens**:

- If you can write files on his PC (Claude Code, Cowork with folder access): add one
  Markdown file to `D:\claude\knowledge\inbox\` named `YYYY-MM-DD-<topic>.md`, using the
  format in `D:\claude\knowledge\README.md`.
- If you cannot (claude.ai chat): end your answer with a fenced block titled
  `LESSONS FOR THE KNOWLEDGE INBOX` in that same format, so he can paste it into Claude Code.

A Claude Code session merges the inbox into these skills and rebuilds the upload zips.

## More preferences, learned across sessions

- **Explain the reading and the build steps before modelling**, and when he says
  "متشتغلش غير لما اقولك", wait for his go. List ambiguities as numbered questions.
- **Correct shape first.** In a quick exercise he said "مش مهم fully defined المهم انو يبقي صح";
  still fully define by default, but never trade correctness for constraint discipline.
- **Do not save on your own initiative into his folders** ("ليه بتعمل سيف من مزاجك") — create the
  job folder first, save only there, and never leave duplicates or `~$` lock files behind.
- **Screen recording:** he records the screen himself. Do not change system settings (Game Bar
  `AppCaptureEnabled`, registry) without explicit permission. When asked, place SOLIDWORKS on
  the left half of the screen and build fast without pauses.
- **When he says "do it yourself" (اعمل انت كل حاجه اتصرف)**, solve blockers yourself — e.g.
  request folder access — instead of handing steps back.
- **Before driving SOLIDWORKS, check that no other session is driving it**: recent writes to
  `%LOCALAPPDATA%\SWAgent\in\args.txt` / `out\*.json`, or a window title like
  "Sketch1 of <part>". Two sessions writing the same args file corrupt each other's work.
- Long silent work annoys him; send a one-line progress note every few steps.

## Windows / shell traps on this machine

- Windows Python and some tools hit **MAX_PATH**; use short paths (e.g. `%TEMP%\kh`) for
  scratch output from deep session folders.
- PowerShell 5.1 `Set-Content -Encoding UTF8` writes a **BOM** — it can break JSON readers.
  Write JSON from Python or with `-Encoding ascii` when content allows.
- In Bash, `\a` inside a double-quoted Windows path becomes a BEL character; prefer forward
  slashes or the Write tool for files that contain Windows paths.
- The 8.3 short path `C:\Users\BESHOY~1` is not always resolved by Bash tools; use the long
  path in Bash and the short one only in PowerShell.
- The Windows locale is Arabic (**cp1256**): Python CLIs that print Unicode crash with
  `UnicodeEncodeError`; run them with `PYTHONUTF8=1`.
- Claude in Chrome `file_upload` only reads folders granted to the session — call
  `request_directory` first (used to upload skills to claude.ai: Settings > Skills > Add >
  Upload skill, several zips at once).

## Video editing (separate toolkit)

- Skill `video-edit` and the tools live in `~/video-tools` (agentic-video-editor, OpenMontage,
  his Remotion project `besho`, branch `claude/upbeat-keller-8vmjqx`). FFmpeg 9.0.2 with
  vidstab is on PATH; `make` is not installed.
- **Ask before anything that spends money or credits** (Gemini/Veo, Higgsfield, ElevenLabs...).
- **API keys are never typed in chat** — he writes them into the `.env` files himself.
- Never overwrite the original video; outputs go to `<input-folder>\edited\`.
- Do not invent facts about a video (the CNC clip is a CNC router cutting a groove in wood).
