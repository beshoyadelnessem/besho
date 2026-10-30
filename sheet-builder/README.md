# Session Sheet Builder

A separate tool, not part of the clinic app yet. It lets the doctor write a physiotherapy session sheet by tapping instead of handwriting. Everything is in English.

**The rule:** every option comes from the clinic's own 11 session sheets.
- Each option shows the sheets it was read from (S4 = sheet 4).
- The tool never diagnoses. It only writes out what the doctor picks.

## How the doctor writes a sheet (from the 11 sheets)

Every sheet follows the same five steps. The choices inside each step are below.

### 1. Area and side
- **Areas:** Cervical, Dorsolumbar, Knee, Hip, Wrist & hand, Fingers.
- **Side:** (R), (L) or bilat.
- **Several areas on one sheet:** each one gets its own line.
  - Examination: "Cervical → ..."
  - Rehabilitation: "⇒ (R) knee → ...".
- **Knee and hip sheets** almost always add a Dorsolumbar part (sheets 4, 8, 9, 10, 11).

### 2. Examination
Findings fall into the same families on every sheet:
- Tenderness (site)
- Limited ROM (which movement)
- Weakness (which muscles)
- Tests (+ve ULTT, +ve Spurling, SIJ −ve)
- Edema, hyperalgesia, tightness
- ↓ Proximal control and ↓ Proprioception, for any area

### 3. Medical treatment
Always in this order:
1. **Current**
   - **Russian:** on the weak muscle (wrist flexors or quads).
   - **2-pole current on the painful area:** HF on TFCC, wrist, index, lateral arm or anterior hip; surge on the knee or hand. 20 min.
   - **Spine:** Dipole (cervicodorsal up to T8, or dorsolumbar), 15 min.
   - **Wrist and hand:** one of three alternatives (TFCC, wrist or hand), so the tool asks the doctor to pick one.
2. **Cold:** ice massage 5 min on a small spot (TFCC), or cryo 15 min (knee).
3. **Laser:** 15 min on the area. 10 min on a grafted area. The wrist and hand laser options are alternatives, so pick one.
4. **Extras:**
   - Phonophoresis by Betaderm on the repaired side or grafted area (5–8 min).
   - Electrical pad.

### 4. Rehabilitation
For each area, in the same progression, always ending with home exercises:

- **Knee:**
  1. Swelling & mobility: lymphatic drainage, PF mobilization, auto-passive flexion, unloading MWM
  2. Activation: quads & hamstring sets, SLR short arc
  3. Strengthening: TKE OKC → CKC, isometric angular, theraband, leg extension, abd/add
  4. Control & function: proximal control short lever, proprioception, gait with crutch
  5. Home
- **Dorsolumbar:**
  1. Release & mobility: TL fascia release, prone extension to neutral, knee to chest
  2. Activation: TrA, multifidus, glute max, clamshell
  3. Stabilization: rhythmic stabilization then alternating, trunk motor control from supine & quadruped
  4. Hips IR/ER (isometric → concentric)
  5. Home
- **Cervical:**
  1. Manual: traction, MET, periscapular and suboccipital release
  2. Mulligan: C2 SNAG, bridging, reverse NAGs, SNAG C5-6-7
  3. Nerve & mobility: NDT median & radial, mobility exercises
  4. Activation & strength: deep neck flexors, trapezius & serratus, IR/ER
  5. Proximal control
  6. Home
- **Wrist & hand:**
  1. Scar mobilization and mobility (PROM, auto-passive, PIP/DIP Gr. II–III)
  2. Hand grip: ROM → auto-passive → isometric
  3. Strength: O.T. hand exercises, isometric wrist, gradual loading
  4. Home
- **Fingers:**
  1. Mobilization: PIP mobilization, MWM for index
  2. Strength: isometric PIP, DIP, grip
  3. Home
- **Hip:**
  1. Unloading MWM, then loading MWM
  2. Activation: quads & hamstring sets, SLR short arc, TKE
  3. Strength & control: abd/add, proximal control, proprioception
  4. Home

### 5. Precautions and the next visit
- **Precautions** go in brackets after the program, e.g. "[No resisted exs or manual exs]" (sheet 2).
- **Next visit:** the same program is written again, or the doctor writes "date + As previous" (sheet 8).

## What the tool does with this
- **Steps:** five steps in that order. Options are grouped the way the doctor chooses between them. "Pick one" groups replace the earlier choice.
- **Live sheet:** written in the doctor's own style.
  - Items are separated with " / ".
  - Each area gets an "⇒ area →" line.
  - Precautions go in red brackets.
- **Copy sheet:** copies the whole sheet as text. **Download PDF** saves it as a PDF.
- **Save session / Repeat last session:** brings back a patient's last sheet, or writes "As previous" instead.
- **Add usual set:** adds what was written on at least half of that area's sheets.
- **Written together before:** shows options that appeared on the same sheet as something already picked. They are only reminders for the doctor to decide on, never advice.
- **Suggest from my sheets (AI):** the AI may only return ids from the tool's own option list.
  - It is told not to diagnose and not to name any condition.
  - Anything outside the list is dropped.
  - Suggestions appear with a dashed border, and the doctor taps to add.
- **Find:** search across everything the doctor writes ("slr", "clamshell", "snag").
- **Add your own:** adds a new option under an area. It is saved, and frequently used options move to the front.

## Voice ("Say it")
- **How to dictate:** the doctor says what he would write, in any order. For example: "Right knee. Russian, cryo, laser 10 minutes. Lymphatic drainage, quad sets, SLR, TKE, home exercises. Back: clamshell, TrA."
- **Matching:** words are matched only to the options above, by the spoken names in `SAY` in `index.html`.
- **Areas and sides:** said like "right knee", "left wrist", "neck", "back" or "both hips". The area switches mid-sentence when he names a new one.
- **Minutes:** "laser 10 minutes" changes the minutes.
- **Confirming:** what was heard appears as chips to confirm. The doctor can leave any out before "Add to the sheet".
- **Words that match nothing:** listed as "Not on your sheets, left out" and never added.
- **Match the rest with AI:** asks the AI to map the leftover words to existing option ids only. Its picks show dashed and still need a tap.
- **Ways in:**
  - **Microphone, outside the Claude viewer:** "Start talking" uses the browser's speech service.
    - If that service is missing or refused, the button becomes "Record". The recording is turned into text on the phone itself (Whisper tiny English through transformers.js 3.0.2). The model, about 40 MB, downloads the first time and is cached after that.
    - If Chrome has the mic switched off, the page shows the exact steps to allow it.
    - If the link was opened inside another app (WhatsApp, the Claude app), the page says to open it in Chrome.
  - **Inside the Claude viewer:** the microphone is blocked, so the doctor taps the box and uses the mic on his phone keyboard. It works the same way.

## Storage
- **Where:** sessions, the doctor's own options and usage counts stay in this browser on this device only (localStorage). Nothing is sent anywhere.
- **What's left out:** there are no accounts and no sync between devices. When this joins the clinic app, it should move to the clinic database.

## Readings to confirm with the doctor (left out until confirmed)
- Sheet 3:
  - The word before "cervical & dorsal traction"
  - "IR / ER strengthening from scapular 90°"
  - "(No pain killer (?) or manual)"
- Sheet 6:
  - The grade of PIP mobilization
  - "MCP (?) mobilization index"
  - "PIP flexion with MCP neutral"
- Sheets 8–10:
  - "Half prone with (?) mobilization"
  - "(?) for lumbar flexion"
  - "Headache SNAGs (?)"
  - "Cycling exs (?)"
- Sheets 9 and 11:
  - The angles of "isometric angular knee strengthening"
  - "Stretch (?) in full extension"
  - "Leg press (?)"
- **The letters "HF" in "2 pole HF":** read as the 2-pole current exactly as written.
