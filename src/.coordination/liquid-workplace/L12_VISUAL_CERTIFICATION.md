# L12 — Visual certification and release handoff

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §L12. This file is the receipt for
**bullet 1**, *"Run every app's standard/Liquid/theme/state screenshot matrix."* Bullet 2's
receipt is `PARITY_LEDGER.md`; bullet 3's is `L3_PRESENTATION.md`; bullet 4 is not started.

Harness: `probes/l12-visual-matrix.cjs`. RULE 1 — it is parameterised over all four axes and
has a second caller (`--atlas`, bullet 4), so it is not a single-use probe. Nothing about a
surface, a theme id, a window title or a pixel is written into it: apps come from
`DESKTOP_WIN_SECTIONS` in `src/shared/desktop.ts`, themes from `listThemes()` on the live
registry, presentation from each window's own `.fwin-b-liquid`, state from the shell's own
title-bar control.

## 2026-09-01 — opened by `primary` as interrupted-work recovery

The slice was `backup`'s; its session ended mid-turn at 22:10:49 EDT with the harness written,
one full run VOIDed, and a fix drafted but never executed. Recovered at `a02f54da`, repaired
at `fa5c6718` and `6f7a862f`, run below.

### What the aborted run left behind, and why it is recorded

One empty sticky note on desktop 1 that was **not** in the pre-run layout, plus its
`.ui-dialog` confirm. Cause: `closeSection` clicks `.fwin-close`, and on a note window that
button is titled "Delete note" and raises *"Delete this note? This cannot be undone."* A close
that stops at the modal closes nothing. Fixed in `fa5c6718`; the harness now confirms via
`.ui-btn--danger`, which is safe **only** because `live` contains just the windows the run
itself opened. Desk restored before measuring: `desktop-layout.json` back to sha256
`9dfb6e2f23618897…`, byte-identical to `debug/_bk-layout-pre.json`, 0 windows, 0 dialogs.

Observed while restoring, recorded and not repaired because it is not L12's subject: clicking
`.fwin-close` on a note N times stacks **N identical confirm dialogs** — six were live at once.

### Three fixes, and the two that did not work are the point

The aborted run VOIDed on control C1 (a repeat capture of an unchanged cell must be
byte-identical). Three successive diagnoses, each contradicted by measurement:

| # | Diagnosis | Fix | Did C1 pass? |
| - | --------- | --- | ------------ |
| 1 | `settle()` polls `body`/`html`/`.os-desktop` colours, none of which belong to the window being photographed | settle on the captured bytes instead (`captureStable`, 2-in-a-row) | **No** |
| 2 | a blinking caret — `activeElement` is an `INPUT`, Chromium blinks at ~530 ms, longer than the 220 ms gap, so two consecutive shots share a phase and the gate converges on a *random* phase | `caret-color: transparent` for the run, `--no-freeze` as its falsifier | **No** |
| 3 | the surface settles in **steps**, and 2-in-a-row converges *inside* a plateau | require 3 consecutive identical frames 300 ms apart | **Yes** |

Diagnosis 2 is real and kept — the repeat trace goes `ABBCDEEDEEDDEE` (5 distinct of 14, tail
oscillating D/E/D/E, a *period*, not a transition) and with the freeze on it goes `AAABCCCCCC`,
one image six times running. It simply was not what failed C1. It is written down because a
plausible fix that does not move the number is the cheapest false credit available here.

### The floor, measured rather than assumed — and what it condemned

The two frames C1 compared differed in **171 of 475,600 pixels**, scattered over the whole
frame, at a **maximum channel delta of 1**. That reads exactly like compositor noise; had it
been, byte-identity would be an impossible gate and every control would need a tolerance. So
it was measured directly with `sharp`:

| pair | pixels differing | max channel delta |
| ---- | ---------------- | ----------------- |
| same window, settled, two captures back to back | **0.000 %** | 0 |
| same window, either side of a theme round trip away and back | **0.000 %** | 0 |
| study-os vs classic-light | 99.591 % | 255 (mean 249.6) |
| standard vs liquid | 92.728 % | 232 (mean 21.75) |

**The floor is exactly zero.** `capturePage` is byte-deterministic once content stops moving,
so byte-identity is the right equality after all; the plateau (diagnosis 3) was the whole
story. `AAAABBBBBB` — one image held for four consecutive captures, ~1.3 s, then changed for
good.

The same number condemned the *must-differ* controls as first written. **With a floor of zero,
any single changed pixel satisfied "differs"** — C2, C3 and C4 could each have passed while
the theme flip, the presentation toggle or the crop did nothing at all. They now assert a
magnitude: **≥1 % of pixels differing by more than 8**, four orders above the floor and two
below the weakest real signal. `sharp` is a transitive dependency, not a declared one, so a
missing copy degrades to byte-inequality with `magnitude: null` rather than a silent claim.

### Two decorative axes, found and closed

- **State.** `--states` was parsed, written into every cell filename, and connected to nothing;
  no cell was ever maximized. The control has no distinguishing class
  (`DesktopShell.tsx:3871` renders a bare `.fwin-b` labelled `t('desktop.maximize')`), so the
  harness requires two language-independent handles to agree — the literal `▢` glyph and the
  sibling position before `.fwin-close` — because clicking the wrong sibling *minimizes* the
  window. C5 scores this axis geometrically (maximized area strictly greater), since maximizing
  changes the capture's dimensions and a pixel comparison would pass trivially on "different
  sizes" while saying nothing about whether anything maximized.
- **Atlas.** `--atlas` printed `atlas: true` and returned. It now writes an HTML contact sheet
  beside the gitignored PNGs, risk cells first.

### Traps for the next worker, each one paid for once already

1. **A 650-cell sweep is ~4,000 short-lived HTTP connections and one of them will fail.** A
   full run died at cell 164 with a bare `TypeError: fetch failed` while `/health` answered
   normally seconds later — the app was fine, one socket was not. `post()` now retries with
   backoff and unwraps `e.cause`, because "fetch failed" alone names nothing. A crash also
   banks a partial manifest now; before that, 164 cells of real measurement were simply gone.
2. **Do not edit renderer source while a sweep is in flight.** Vite HMR fires on save and
   re-renders the desktop under the harness. This run survived one (25 windows still open,
   cells still accruing, and the edit was behavioural not visual) — but a visual edit would
   have split the matrix across two builds with nothing in the manifest saying so.
3. **`os:open` on an already-open window RAISES it and does not remount**, so `openSection`
   reports `alreadyOpen` rather than mapping the section to whatever window happened to be
   last in the list. A desk that is not empty at the start silently shrinks the app axis.
4. **The bridge's `/eval` takes one expression** — no trailing `;`, no awaited promise.

### What is committed

Only the JSON manifest — size, sha256, dimensions, per-cell verdicts. The PNGs land in
`debug/shots/l12-matrix/`, covered by `.gitignore:125`. A sha256 per cell is checkable forever
without putting a megabyte of binaries in git, which the boss audit counts.

## 2026-09-02 — the matrix RAN, and bullet 1 CLOSES

The section above was written with the harness repaired and the run still ahead of it; the
session ended before it started. Recovered, the desk restored, and swept to completion.

**Residue the crashed run left, cleared before a pixel was measured.** 25 `.fwin` still open,
one `Delete note?` confirm live, and the theme abandoned mid-sweep at `ocean-blue`. Closed
through the shell's own `os:window`/`closeAll`, the note's own `.ui-btn--danger`, and
`applyTheme('study-os')` on the live engine module. The note's textarea was 0 characters, i.e.
the empty one this file already recorded the aborted run creating — not user content.

### Three runs, and the third is a control on the second

| run | dimensions | cells | captured | failed | unconverged | controls | certifiable |
| --- | --- | ----- | -------- | ------ | ----------- | -------- | ----------- |
| A `l12-matrix-normal.json` | 25 apps × 13 themes × 2 pres × normal | **650** | 611 | 39 | 68 | C0–C5 **all pass** | **true** |
| B `l12-matrix-maximized.json` | 25 apps × 2 themes × 2 pres × **maximized** | **100** | 90 | 10 | **0** | C0–C5 **all pass** | **true** |
| C `l12-matrix-tries40.json` | 25 apps × oled-black × liquid, `--tries 40` | 25 | 22 | 3 | 4 | none (a control, not evidence) | false, and says so |

Controls, run A, `sharp` present so every must-differ carries a magnitude:
**C0 floor 0.000 % of 475,600 px, max channel delta 0** — so byte-identity is the right gate.
**C1** repeat byte-identical. **C2** theme 97.931 % of pixels over delta 8 (max 243).
**C3** presentation 35.445 % over 8 (max 234). **C4** app 74.149 % over 8 (max 247).
**C5** state, scored geometrically: 820×580 = 475,600 → 1264×765 = 966,960, **ratio 2.03**.
Gate is 1 % over delta 8 — four orders above the floor, two below the weakest real signal.

### Every failure is explained, and none of them is a capture failure

**39 of 39** in run A are one sentence: `visualizer`, `musicwidget` and `city` **offer no
presentation toggle of their own** (3 apps × 13 themes × liquid). 22 of 25 canonical sections
are presentable; those three are standard-only, which is a product fact this matrix now
records rather than a hole in the sweep. Run B adds **4** more of a second kind: `note` has no
maximize control (frameless chrome), so its 2 themes × 2 presentations are `stateBlocked`.

### The 68 unconverged cells — the first two explanations were both WRONG

`converged:false` means the cell never produced 3 byte-identical frames in its budget and
banked its last one instead. Two cheap readings and both were disproved by the next control:

1. *"Those surfaces never settle."* — **False.** Driven ALONE, `Statistics` liquid on
   oled-black traces `ABBBCCCCCCCC` and `Agent` liquid traces `ABBBCCCCCCCCCC`: one image ten
   frames running. Both are in run A's unconverged set.
2. *"The 12-frame budget is too small."* — **False, and this is what `--tries` was added to
   ask.** Run C repeats oled-black/liquid on the SAME 25-window desk at 40 frames.
   Every cell that converges converges in **≤ 12** — not one converged cell went past the old
   budget. The four that do not burn all **40** frames at **streak 1**: no two consecutive
   frames were ever identical, over 12 seconds.

What is left is the SCENE, and run B is the discriminating measurement nobody designed for it:
a **maximized** window covers the desk and had **0 of 90** unconverged. Same surfaces, same
themes, same instrument. Run A's own data carries the matching opaque control — `agent` at
oled-black converges in **standard** and is streak-1 in **liquid**, one desk, one theme. So a
translucent Liquid surface composites whatever moves behind it, and on a 25-window desk
something always does. **Byte-identity is reachable for every surface here; it is not reachable
for a translucent one over a live desk**, and that is a certification constraint rather than a
defect. 68 of 611 is 11.1 %; each is named in the manifest and listed first in the atlas.

### Numbers a later reader will want

Run A took **~27 min** for 650 cells (**4,186** capture attempts, 50.5 MB of PNG, 592 distinct
images of 611). Theme settle p50 **1,101 ms**, max **1,423 ms** — a fixed sleep would have been
wrong in both directions. Restore is measured, not asserted: theme back to `study-os` stored,
caret freeze removed, **0 windows / 0 dialogs left**, and `%APPDATA%\jp-study-app\
desktop-layout.json` hashes **9DFB6E2F2361…**, byte-identical to `debug/_bk-layout-pre.json`.

`sampledOut` is empty for the app axis in every run: all 25 canonical sections were requested.
Run B sampled the theme axis to `oled-black,paper` (the extremes of the light flag) and run C
to `oled-black`; both record exactly what they swept in `dimensions`, so neither can be read as
a full sweep.

## 2026-09-02 — the plate namespace was the defect; re-captured on the same profile (`backup`)

`557cdf3b` — **a banked sha256 must name a file only its own run can write.** Plates were named
by their four dimension coordinates alone, so any two runs sharing a coordinate wrote the same
path: the later destroyed the earlier image while the earlier manifest kept asserting a hash for
bytes that were gone. Fixed with a per-run **directory** (`SHOT_ROOT/RUN_ID`), not a longer
filename — a run-tagged filename is still one namespace and a re-run with identical flags
collides again. Default id is unique without being asked (manifest basename + UTC stamp + pid);
`--run-id` pins one deliberately. `runId`/`shotDir` now ride in the manifest.

THIRD INDEPENDENT INSTRUMENT, agreeing with primary2's two: 723 indexed cells over the three
baselines resolve to **701 distinct paths — 22 written twice, 21 disagreeing**, all `oled-black`,
all stale for `l12-matrix-normal.json`, all on-disk hashes equal to `l12-matrix-tries40.json`'s
own. 680 verified / 0 missing. NEW FACT neither earlier instrument had: **16 of the 21 were
`converged: true` in BOTH runs** — settled on three byte-identical frames, twice, and still
differed. "Only the flaky cells were overwritten" is false, and convergence does not make a plate
reproducible across runs. The 22nd shared path is `settings__liquid__oled-black__normal.png`,
the lone re-shot that reproduced byte-for-byte.

THE RE-CAPTURE, live on the SAME profile (pid 53288, the scene that produced the originals — a
scratch profile would make these a different scene and the theme axis would then compare scenes):
25 apps × oled-black × standard/liquid × normal = **50 cells, 46 captured, 0 mismatch, 0 missing,
integrity `all-present`**, controls **C0–C5 all pass**, `certifiable: true`. Banked as
`baselines/l12-matrix-oledblack.json`.

THE DISCRIMINATING CONTROL, and it is a counterfactual on this very run: **all 46 of these plates
would have overwritten banked plates under the old naming** — this run alone would have taken the
damage from 21 to 67. With the fix, **0 of 46 collide** with the legacy 701.

FOUR MUTATION CONTROLS on `l12PlateIdentity.test.ts`, all fire, baseline and final GREEN: flatten
`SHOT_DIR` (harness restored byte-exact by sha256), a manifest with no `runId`, a plate outside
its own `shotDir`, a collision with a legacy path. The legacy three are FROZEN at their known
damage, not "repaired" — those images are gone and cannot be un-clobbered.

`ed9a9f05` — `probes/l12-atlas.cjs` carried two raw NULs (bytes 11796/11990) past git's
8000-byte binary window, so every diff read clean while ripgrep answered a search of its 566
lines with "Binary file … matches". The existing gate exempted `src/.coordination/`; that scope
was the defect, since the harm it names is searchability. Scan 2,637 → 2,750 files.

ONE CAPTURE FAILURE, and it is NOT a product defect: `agent/standard` returned
`Error: UnknownVizError` on the 25-window desk. Driven ALONE it captures in both presentations,
converged in 4 attempts each — a compositor flake under load, reproduced 0 of 1 in isolation.
The atlas correctly refuses `certifiable` on it while classifying the 3 toggle-less surfaces
(visualizer, musicwidget, city) as a product gap rather than a failure.

**b4 STAYS OPEN.** The blocker named in the last handoff is cleared and the instrument now reads
`all-present` over a fresh matrix — but `final` still means bullet 1's full matrix, and 21 of its
611 plates remain permanently unverifiable from disk. That is an evidence gap to state, not a
reason to flip bullet 1: the run happened, its controls passed, and only re-verification of those
21 hashes is lost. Restore measured, not asserted: theme `study-os`, 0 windows / 0 dialogs,
`desktop-layout.json` **9DFB6E2F2361…**, byte-identical to `debug/_bk-layout-pre.json`.
