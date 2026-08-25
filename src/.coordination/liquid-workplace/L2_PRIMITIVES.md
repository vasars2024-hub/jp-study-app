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

## 2026-08-17 · primary · L5 opens — the fifth role, because migration is not construction

| Slice | Commit | What landed |
| --- | --- | --- |
| L5.1 contextual role | `7bc4cc57` | `ContextualSurface` + `.lq-contextual` + the `.fwin-liquid` paint gate; lens picker adopts it; 48/48 |

**The measurement that forced it.** On the Liquid Dictionary window, category 3 read
`denseWorkOnTranslucent` **0** (rule 1 holding) and `liquidTreatedEligible` **0 of 9**.
L3.2 made the frame Liquid and pinned `.fwin-body` opaque — that is half of §2.3. The
nine navigation/contextual regions inside it had nothing.

**The decision, standing auto-approval, reversible.** `LiquidSurface` paints
unconditionally. Correct for a NEW surface; wrong for migrating an existing one, because
marking a region `lq-liquid` makes it glass in every **conventional** window and §2's
first non-negotiable is that conventional is the default. Rejected alternative: gate the
tokens per presentation — that moves the branch into the token sheet, where every shell
remap inherits it. So the role splits: the region declares, the window decides.
`.lq-contextual` carries layout, hit floor and focus only; `theme/liquid-window.css` is
the sole painter and only under `.fwin-liquid`.

**No `backdrop-filter` on that rule, and it is not an omission.** `.fwin` carries
`transform: translateZ(0)`, making it a backdrop root for its descendants — a
backdrop-filter there samples the window's own opaque body and paints nothing. Inert
glass that measures as translucent is the failure mode; the frame supplies the blur.

**Live, after a renderer reload, on 食べる results:**

| | liquid | standard |
| --- | --- | --- |
| picker box | **772x50** | **772x32** |
| background | `color(srgb … / 0.72)` | `rgba(0, 0, 0, 0)` |
| border / radius / padding | 1px @ .14 / 16px / 8px | 0px / 0px / 0px |
| its 3 buttons | 32 / 32 / 32 px | — |

Dense work unchanged in both: `.dict-entries` transparent over `.fwin-body`
`rgb(18,28,23)`. Category 3: **0 of 9 → 1 of 9** treated, `denseWorkOnTranslucent` **0**,
24 regions. Conventional height is 32px, the same as the pre-migration probe recorded, so
adoption cost the conventional window nothing.

**3 mutation controls, each red for its own named case, each file restored
byte-identical:** paint the contextual base → *"no paint property anywhere in this
sheet"*; drop the `.fwin-liquid` prefix → *"only under an opted-in window"* (2 red — the
older namespace guard catches it too); give the component `lq-liquid` → *"is NOT the
liquid class"*.

**Traps.**
1. **The dev server holds these files open.** A restore write failed `UNKNOWN` /
   `errno -4094` and left a mutation on disk. `debug/l5-mutate-contextual.cjs` now retries
   for 10 s and **exits non-zero rather than continuing** if a restore fails. A mutation
   harness that cannot guarantee its own restore is worse than none.
2. **Adding a role to `LIQUID_SURFACE_ROLES` breaks a test that looks unrelated.**
   `renders each role with its class and role marker` iterates that array against a fixed
   render block — the new role reads as a missing element, not as a list change.
3. **`DictionaryView.tsx` owns 3 of the remaining 8 eligible regions and is ` M`** with
   the i18n track's live hunks *on the adjacent lines* (`view-head` at :143). Not touched.
   The 4 `details.lexicon-*` are a deliberate exclusion, not an oversight: they hold dense
   reading content when open, so §2.3 keeps them opaque.

**Next slice:** the remaining eligible regions once the i18n track lands
`DictionaryView.tsx`, then categories 1, 2, 4, 5, 8 re-scored on the Liquid window —
L1 measured all five pre-Liquid and they are stale by the rubric's own rule.
`LIQUID_SCORECARD.md` stays empty until all eight sit on one surface.

## 2026-08-18 · primary · L5.2 — and the denominator that was measured on a closed drawer

| Slice | Commit | What landed |
| --- | --- | --- |
| L5.2 contextual adoption | *this commit* | `view-head` + `dict-saved-searches` adopt `ContextualSurface`; 4 new cases |

**The headline, and it corrects this file's own previous entry.** The `1 of 9` that opened
L5 was measured on **collapsed, unloaded panels**. `details.lexicon-{compounds,collocations,
examples,neighbors}` and `div.dict-examples` each render a title, a note and one *run*
button until someone clicks it — 45–53 px tall, `li=0`. The classifier calls that
`Liquid-eligible` because it is small and has focusables, which is correct for what was on
screen and wrong about what the region **is**. Driven into its real functional state (each
run button clicked, results back: compounds **5 li**, examples **8 li**, neighbors **12
li**, collocations **0 li** — an honest empty; `dict-examples` 53→656 px, text 17→628) all
five reclassify **Work**. The real denominator is **4, not 9**, and it was never 9.

**Category 3 on the Liquid Dictionary window, 食べる, every panel loaded:**
`denseWorkOnTranslucent` **0**, `liquidTreatedEligible` **4 of 4** (was 1 of 9 collapsed →
4 of 9 after this edit → 4 of 4 loaded), 24 regions, `byRole` Work 12 / eligible 4 /
Anchor 4 / holds-work 4.

**Conventional presentation cost exactly 0 px**, which is §2's first non-negotiable
measured rather than asserted. Standard after == standard before on every property read:
`view-head` **772x47**, transparent, `0px/0px` padding, buttons **69x33 / 56x33**;
`dict-saved-searches` **772x35**, button **101x35**. The `--lq-hit-target` floor is free
here because both were already ≥ 32 px. Liquid after: **772x65** and **772x53**, both
`color(srgb … / 0.72)` + `1px … / 0.14` + `16px` + `8px`.

**Negative control, live and reversible:** `classList.add('lq-contextual')` on
`.dict-entries` + two loaded `details` → `denseWorkOnTranslucent` **0 → 3**, each named
with its measured `alpha 0.72`; removed → back to **0**. Category 3 can produce a low
score, so its 0 means something. **3 mutation controls**, each red with its own message and
each file restored byte-identical (`debug/l5b-mutate-dictview.cjs`): plain `div` → *".view-head
is contextual: expected false to be true"*; `LiquidSurface` instead → *"expected 1 to be +0"*
on the `lq-liquid` count; the search form wrapped → *"expected true to be false"*.

**Traps.**
1. **`DictionaryView.tsx` is CRLF *and* dirty with the i18n track** (menu labels, status
   fields, the description paragraph — all in the worktree, none in HEAD). `git add` absorbs
   them. `node debug/l5b-stage-dictview.cjs` rebuilds HEAD + these 5 edits, prints the
   added/removed line sets, and hashes `--no-filters`. An LF anchor matches nothing in it.
2. **Do not score a lazy panel without clicking its run button.** The rubric's "empty state
   caps at 0" is not only about empty *apps*; a closed drawer is an empty state, and here it
   inflated a denominator by 125%.

**Next slice:** category 3 is now scorable on this surface. Categories 2, 4, 5, 8 are still
L1-era and pre-Liquid, so `LIQUID_SCORECARD.md` stays empty until they are re-driven here.

## 2026-08-25 · primary · L5.3 + L5.4 — Grammar and Translate, and the region that stayed plain

| Slice | Commit | What landed |
| --- | --- | --- |
| L5.3 Grammar | `b211841f` | `GrammarView`'s `.view-head` adopts `ContextualSurface`; 3 cases |
| L5.4 Translate | `79ad40c2` | `TranslateView`'s `.view-head` adopts it; 3 cases |

L5's order is Dictionary → Grammar → Translate → Agent. Dictionary landed 2026-08-18;
these are stops two and three. Same shape each time and deliberately so: exactly one
region per view is a contextual tool — an intro line plus a mode/direction switch —
and everything the switch selects is dense Work that stays on an opaque anchor.

**The decision worth recording, because it is the one that could have gone either
way: `.tr-actions` stays plain.** It carries the busy status and the error line, and
§2.3's honest-states requirement makes a translucent error a legibility risk rather
than a contextual tool. It is named in the same assertion as `.tr-panes`,
`.tr-textarea` and `.tr-output` so a later worker reads a decision, not an omission.
Grammar's four mode panels (prose, practice form, curation table, guides browser) are
the same call and are driven through the switch one at a time rather than asserted on
the default one.

**Conventional presentation cost 0**, §2's first non-negotiable: both render
`lq-contextual` + `data-lq-role` and never `lq-liquid`, and `.lq-contextual` paints
nothing until an ancestor opts in with `.fwin-liquid`. Asserted as a count of 0.

**Controls.** Swap each `ContextualSurface` back for a plain `div`: Grammar **2 red**,
Translate **3 red**. Both restored; 22/22 across the three region suites plus the new
one. The third case in each file asserts the surface COUNT first — without that,
"every panel is outside the contextual surface" passes trivially when there is none,
which is exactly what the control produces.

**Trap paid.** `GrammarView.tsx` is dirty with another track (an extra import plus a
~24-line block inside the component), so `git add` absorbs it.
`debug/l8b-stage-grammarview.cjs` rebuilds HEAD + these 3 edits, prints the
added/removed line sets and hashes `--no-filters`; it is `l5b-stage-dictview.cjs` with
new anchors. `TranslateView.tsx` was clean and needed none of that — check with
`git diff --stat -- <file>` before reaching for the script.

**Next slice:** L5's fourth stop, Agent (`AgentView`/the agent surface), then the
category re-drive on these three surfaces — 2/4/5/8 are still L1-era and pre-Liquid,
so `LIQUID_SCORECARD.md` gains no row from L5 alone.
