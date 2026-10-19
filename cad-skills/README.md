# CAD Skills — SOLIDWORKS & Creo

Author: Beshoy Adel

Claude skills for CAD work (SOLIDWORKS + Creo), exported from claude.ai so they can be installed on another machine.

| Skill | Purpose |
|---|---|
| `beshoy-cad-working-rules` | General working rules (language, folders, shared SOLIDWORKS, verification) |
| `creo-modeling` | Creo Parametric 12.4 — setup facts, workflow, traps |
| `solidworks-modeling` | SOLIDWORKS COM API macros (VBScript) instead of GUI clicking |
| `solidworks-drawing-analysis` | Layer 1 — drawing → DRAWING SPEC |
| `solidworks-cad-planning` | Layer 2 — spec → FEATURE PLAN |
| `solidworks-professional-modeling` | Layer 3 — execute the plan via MCP + swagent probes |
| `solidworks-validation` | Layer 4 — measured pass/fail verification |
| `solidworks-error-recovery` | Layer 5 — controlled diagnosis and repair |

## Install

**claude.ai / Claude Desktop:** Settings > Skills (Capabilities) > Add > Upload skill — upload the zips in `zips/` (several at once is fine).

**Claude Code:** copy the skill folders into `~/.claude/skills/` (Windows: `%USERPROFILE%\.claude\skills\`):

```powershell
git clone -b claude/stoic-hawking-2ukpl2 https://github.com/beshoyadelnessem/besho.git
Copy-Item -Recurse besho\cad-skills\* $env:USERPROFILE\.claude\skills\ -Exclude zips,README.md
```

Note: the skills reference files on the original PC (`D:\claude\solidworks`, the swagent probes and templates). Those are not part of this folder — copy them to the new machine as well.
