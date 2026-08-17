# L2 — semantic tokens and shared primitives

Log for `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §5.2 / L2. Append per slice; numbers, not adjectives.

## 2026-08-17 · backup · L2 opens

**Why L2 before more L1 scoring.** 6 of 8 rubric categories were being driven on L1 reference apps
while `parity-ledger.json` sat at 0 of 7 rows, all pending, every one recorded "no Liquid destination
exists". Category 6 is capped until a destination exists, and the Files app (plan 4) deletes the
Notebook section and builds a whole folder application — if L2 is not there first it gets built in the
old language and retrofitted twice.

| Slice | Commit | What landed |
| --- | --- | --- |
| L2.1 tokens | `b0c34c99` | `theme/liquid-tokens.css` — 60+ `--lq-*` across anchor/work/liquid/ambient + scaffold geometry + motion; Aero/Wired/high-contrast/perf/reduced-motion variants |
| L2.2 surfaces | `576bc45f` | `components/liquid/LiquidSurface.tsx` + `theme/liquid-surfaces.css` — the four roles as primitives |
| L2.3 scaffold | `b2c36a3b` | `components/liquid/LiquidAppScaffold.tsx` + `theme/liquid-scaffold.css` — rail/toolbar/canvas/inspector/dock spine |

**Live measurements** (running app, renderer reloaded, theme `forest-night`, `data-perf=performance`):

- anchor text-on-bg **14.02:1**, work **15.03:1**, both `backdrop-filter: none`; liquid
  `blur(8px) saturate(1.25)` over 0.72 alpha.
- Negative controls, restored after (`restored: true`): `data-theme=high-contrast` → **19.56:1**
  both, liquid collapses to opaque `rgb(0,0,0)` `blur(0px)`; `data-perf=battery` → liquid `blur(0px)`,
  alpha 0.92, `--lq-motion-scale` **0**.
- Scaffold geometry: wide 1400 → cols `232px 816px 320px`, rows `40px 472px 56px`; medium 900
  collapsed → `52px 512px 320px`; toolbar+canvas only → `1400px` / `40px 544px`, no ghost tracks.

**Defect the live gate caught and the unit tests did not** (they were 12/12 green over it): the
compact inspector rendered **520x8**. `max-height: 40%` on a grid ITEM resolves against its own row
(19px), so it capped the inspector to 40% of itself. Cap moved to the row track, `minmax(0, 40%)`,
four variants. After: canvas **520x252**, inspector **520x240 @ y=300**. Regression test added.

**Trap for the next worker — a "contains the token" assertion is not a token gate.** `liquidScaffold`
asserted `var(--lq-rail-width)` appeared *somewhere* in the sheet. Replacing one rule's use with a
literal `232px` still PASSED, because a sibling rule kept the var. Now every `grid-template-*`,
`min/max-height` and `width` value is checked for raw px. Same shape of hole is likely in any other
"the sheet uses the token" test in this tree.

**Second trap — do not append absent slots when probing the scaffold.** The first geometry probe
appended all five slot elements regardless of `data-has-*`; the extras landed in implicit grid tracks
and produced a fabricated compact reflow (`cols: 493.219px 0px 18.7812px`). The component renders
nothing for an absent slot; the probe must too.

**Unit:** tokens 6/6, surfaces 11/11, scaffold 13/13. Every one mutation-checked; 4 + 4 + 4 mutations,
all caught after the tightening above, all files restored byte-identical.

**Not done, deliberately.** No app has been migrated, so `parity-ledger.json` stays 0 of 7 — a
primitive layer is a destination for *new* surfaces, not a parity claim for an existing one. Nothing
scored on the rubric: L2's gate is "primitives pass contrast, keyboard, motion and performance checks
in isolation", which the above meets, and a surface score needs a surface. `LiquidDock`,
`LiquidInspector`, `AdaptiveRail` and `ContextToolbar` are named in §5.2 and are still absent — the
scaffold gives them slots and geometry, not implementations.

**Next slice:** `ContextToolbar` + `AdaptiveRail` as real primitives filling the scaffold's toolbar and
rail slots, then L3's per-window presentation state. Do NOT go back to widening L1 scores.

## 2026-08-17 · primary · L2's primitive list closes

| Slice | Commit | What landed |
| --- | --- | --- |
| L2.4 rail + toolbar | `001469f4` | `AdaptiveRail`, `ContextToolbar`, `theme/liquid-controls.css`, 23 tests |
| L2.4 fix | `5b6c4f19` | a NUL byte where `join(' ')`'s space should have been |
| L2.5 dock + inspector | `deb9c2e3` | `LiquidDock`, `LiquidInspector`, `railInSpine()`, 14 tests |

§5.2's list — surfaces, scaffold, dock, inspector, adaptive rail, context toolbar — is **complete**.

**Live, running app, renderer reloaded three times, theme `forest-night`, `data-perf=performance`:**

- Toolbar overflow, 12 real-length tools: 1400 → **12 visible / 0**, 900 → **6 / 6**, 520 → **3 / 9**.
  **Reachable is 12 at every width**; `lastVisibleOverlapsMore` false at both narrow ones.
- Dock at 520: rail items **0**, dock routes **4**, reachable **4**, nav landmarks **1**.
- Inspector: close fired **1** per width, **3** total; at compact 494x214 @ y=287, under the canvas.
- **8** hit targets per host, minimum **32x32** at every width. Rail label contrast 16.87.
- Negative controls: stripping one `aria-label` post-render moved `railNamesMissing` **0 → 1**, so the
  zeros are measurements. `high-contrast` + `battery` → `--lq-liquid-blur` 0px, `--lq-motion-scale` 0;
  restored to `blur(8px)` / `1`. 0 probe hosts left behind, all three runs.

**THE DEFECT THE LIVE GATE CAUGHT AND JSDOM STRUCTURALLY CANNOT.** The scaffold's rail slot carries
`.lq-liquid`, whose `--lq-space-4` padding + 1px border take **26px** of the 52px
`--lq-rail-width-collapsed` track. Collapsed rail item measured **18x32** against a 32px
`--lq-hit-target` floor. Slot and rail now use the tight inset collapsed; re-measured **38x32**
(= 52 − 10 − 4). Same 26px explains every "why is this narrower than its track" number in these logs.

**SECOND LIVE FINDING, a drift the primitives could not see.** Handing the dock its routes at every
width renders **two** navigation landmarks for one set of routes (navCount 2 at wide and medium).
`railInSpine(widthClass)` is exported from the scaffold and its own reflow reads it, so the caller's
guard and the breakpoint cannot diverge. After: nav count 1 at all three widths.

**Traps for the next worker.**
1. **`fitCount` is exported as a pure function on purpose.** jsdom reports
   `getBoundingClientRect().width === 0` for everything, so a measurement-only toolbar would have
   tests that pass while measuring nothing. Any future measured primitive splits the same way.
2. **Equal-width fixtures hide overflow bugs.** Deleting the overflow control's own width reservation
   survived the whole suite on `[100,100,100]` — every branch overshoots by a full action either way.
   `[100,20,20]` at 150px discriminates 1 from 2 and is now the test.
3. **A NUL byte can land in a Write-tool file and git will call the module binary.** `ContextToolbar`
   committed as `Bin 0 -> 12618 bytes` from one 0x00 in `join(' ')`. Suite, lint and the live probe
   were all green over it; only `git commit`'s own output named it. Check `git show --stat` for `Bin`
   after any commit of a new source file, and repair with PowerShell `ReadAllBytes`/`WriteAllBytes`.

**Not done, deliberately.** `parity-ledger.json` stays **0 of 7** and nothing is scored on the rubric.
No app has migrated: a primitive layer is a destination for new surfaces, not a parity claim for an
existing one, and a surface score needs a surface.

**Next slice:** L3 — per-window presentation state (`liquidWindowState.ts`: schema, migration,
validation, round trip), then the Make Liquid / Return to standard commands. Still do NOT widen L1.
