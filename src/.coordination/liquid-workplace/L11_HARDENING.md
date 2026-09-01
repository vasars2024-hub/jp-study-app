# L11 — Accessibility, performance, and long-session hardening

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §L11. Gate: *no regression against L0
performance and interaction baselines — scored as rubric category 7, measured after a real
restart, not asked of a human.* Opened 2026-09-01 by `primary`, the turn L10 closed 4/4
(`8a2a30a3`).

Surface sample (RULE C), unchanged from L10 and for the same reasons: **Settings** — the densest
row in `CENSUS.md` (1,307 controls / 83 commands / 67 settings), and **Media Center / Video**
(`@.fwin:has(.mc-video-page)`) — the most different surface the app has, a media stage with a
canvas, a transport and a shelf where Settings is a form. `sampled-out:` Dictionary, Grammar,
Translate, Agent, Reading, Library, Music, Study Mode, Discover, Readiness, Review, the Wired
shell, the Aero shell, Blanc.

| bullet | the claim | categories to run first | instrument |
| --- | --- | --- | --- |
| 1 | full keyboard and screen-reader pass | cat1 accessibility `--mode keyboard` (traversal + naming), cat5 UI clarity | `cat1-accessibility.cjs --mode keyboard`, `cat5-ui-clarity.cjs` |
| 2 | high contrast, zoom, text scaling, compact widths, reduced/disabled motion | cat1 (motion, contrast), cat4 use of space, cat3 Liquid utilization | `cat1-accessibility.cjs`, `cat4-use-of-space.cjs`, `cat3-liquid-utilization.cjs` |
| 3 | drag/resize at target frame rate under real load | cat7 perf | `cat7-perf.cjs --jank`, `cat7-collection-weight.cjs` |
| 4 | blur fallback, GPU-loss recovery, multi-monitor, restart persistence, long-session memory | cat7 perf, cat8 honest states | `cat7-perf.cjs`, `cat8-honest-states.cjs` |

## Progress

### Bullet 1 — full keyboard and screen-reader pass. **CLOSED 2026-09-01, RULE C 16/16.**

Two product defects, both found by a real Tab walk and both fixed; one instrument correction,
mutation-proven.

**The walk itself** is `cat1-accessibility.cjs --mode keyboard` (`a455940d`), a MODE on the
existing category-1 harness rather than an eightieth probe — it presses a real `Tab` through the
bridge's `/key` and records, per stop, the accessible name, the focus ring and whether the stop
is painted. That is both halves of this bullet's words: traversal is `noTrap` + `walkTerminates`,
and the screen-reader half is `everyStopNamed` (an accessible name resolved the way an AT
resolves it) plus cat8's `statesNamed`/`rawKeys` and cat5's ten clarity questions.

**Defect 1 — Settings search was mouse-only (`d517de7e`, product).** The walk stopped after 7
stops and dropped to `document.body`. The hypothesis banked in the handoff was that the 25-item
nav rail is keyboard-unreachable; it is not — one more Tab re-entered the surface and the rail
traversed fine. The real cause was worse: focusing the search input opens a panel of 16
shortcuts, every item carrying `onMouseDown={e => e.preventDefault()}` so a CLICK never blurs the
input — but a TAB does, and `onBlur` on the input closed the panel unconditionally, unmounting it
under the option the browser had just focused. **1 of 16 items reachable by keyboard, 16 of 16 by
mouse.** Closing now belongs to focus leaving the WIDGET (`relatedTarget` on the container), and
Escape from an option hands focus back to the input with the dismissal remembered in a ref rather
than inferred. Two ARIA corrections fell out of the same reading: the panel claimed
`role="listbox"` in the empty-query state where its children are two labelled groups of
query-filling buttons (`group` there, listbox only when options exist), and `aria-selected`
tracked an arrow cursor Tab could leave behind (`active` now follows real focus both ways).
8 new cases in `settingsSearchKeyboard.test.tsx`; mutating the `relatedTarget` guard kills 2 of
them, mutating the panel role kills 1.

**Defect 2 — the scroll-trap detector called a line-clamped card title unreachable content
(this turn, instrument).** `span.medialib-card__title` is `-webkit-line-clamp: 2` over a
three-line title, so it reports 17 px "unreachable" on every long card; the Video surface scored
2 scroll traps and cat2's negative control VOIDed three runs in a row on `[0,0,3] → [0,0,2]`,
because two of the three traps it thought it had planted were the product's own cards. The clamp
is an ellipsised truncation, not a hidden region. The sixth exclusion added to
`cat2-clunkiness.cjs` is deliberately NOT "it is clamped, so it is fine" — that would pass a card
whose full title exists nowhere. The bar is the rubric's own words, *content with no way to reach
it*, so the full string must be RECOVERABLE and proven from the DOM: the element or an ancestor
must carry `title`/`aria-label` CONTAINING the element's own `textContent`, and no control may be
stranded past the clip line. Live on the Media Library both routes exist —
`span.medialib-card__title[title]` and `.medialib-card[aria-label]`, both the full string.
**Mutation control, in the Video window only (the Media window shows the same cards and a
document-wide strip hit the wrong one first):** strip `title` + `aria-label` up the ancestor chain
→ scrollTraps **0 → 1**, decorativeClips 2 → 1; restore the 3 attributes → **1 → 0**, clips back
to 2. After the correction cat2's own plant reads `dirty [1,1,1]` and `restored [0,0,0]`.

**16 of 16.** 14 re-derived at this HEAD; the 2 cat7 cells are carried from L10 bullet 2
(`cat7-l10b2-settings.json` score 10, `cat7-l10b2-video.json` score 10, both measured 02:21–02:22
EDT the same session) with the reason stated: the only product delta since is `SettingsSearch.tsx`
focus/role handling, which adds no render work to the drag, resize, theme, heavy or idle legs
cat7 scores, and touches nothing in the Video window at all.

| category | Settings | Media Center / Video |
| --- | --- | --- |
| 1 accessibility (`--mode keyboard`) | PASS 10/10 — 66 stops, 0 unnamed / 0 unringed / 0 unpainted, control unringed 0→1→0 with stops stable at 66 (`cat1kb-l11b1-settings-after.json`) | PASS 10/10 — 36 stops, exits to the Start button (`cat1kb-l11b1-media.json`) |
| 2 clunkiness | PASS 10/10 — 2 clicks + 5 keystrokes, worst recv 54 ms, 0 over the 100 ms bar; presentation leg standard 7 / liquid 7, geometry 960x680 restored (`cat2-l11b1-settings.json`) | PASS 10/10 — 1 click + 4 keystrokes, worst recv 10.2 ms; presentation leg standard 5 / liquid 5, 1080x679 restored (`cat2-l11b1-video.json`) |
| 3 Liquid utilization | PASS 10/10 (Home, liquid presentation) | PASS 10/10 |
| 4 use of space | PASS 10/10 | PASS 10/10 |
| 5 UI clarity | PASS 10/10, control FAILED AS REQUIRED on Q2, Q3, Q4, Q5, Q10 | PASS 10/10, same 5 control questions falsified |
| 6 feature parity | PASS 10/10, control proven | PASS 10/10, control proven |
| 7 performance | 10 — carried from `cat7-l10b2-settings.json` | 10 — carried from `cat7-l10b2-video.json` |
| 8 honest states | PASS 10/10 — `statesNamed` + `languagesDiffer` both measured (`--drive-input .os-set-search-input --langs`) | PASS 10/10 — `statesNamed` 1 of 1 observable, `--langs` |

**Traps this bullet paid for, so nobody re-pays them:**

1. **The Media Center window's TITLE is derived from its current page.** Navigating the "Video"
   window to Library renames it "Media", and there are then two windows called "Media" — a
   title-matched probe re-resolves to the other one mid-run and compares a surface against a
   different surface. Symptom: cat2 read a real navigation as a dead end. Any Media Center task
   that navigates must restore the tab in `--undo`.
2. **Typing in `.mc-global-search` navigates the Media Center to Library.** So
   `--surface "@.fwin:has(.mc-video-page)"` is stable for a READ but refuses mid-task, and cat8's
   `--drive-input` on that field VOIDs with "surface not found". cat8 needs no drive input on
   Video — the page already shows a named state (`statesNamed: 1 of 1 observable`).
3. **`cat2-clunkiness.cjs`'s detector block lives inside a template literal.** A BACKTICK in a
   comment ends the string and the whole probe stops parsing — and because the probe writes its
   `--out` file only on success, the previous run's JSON is still there and reads like a result.
   Cost one run and one wrong conclusion. A note to that effect is now in the file.
4. **A Tab walk leaves the nav rail scrolled** (`.os-set-nav-scroll` at 596 of 1019). The next
   probe's `click:.os-set-nav-item` then refuses "centre resolves to null". Put
   `scroll:.os-set-nav-scroll=0` in the undo.
5. **cat5 refuses to score until a cat6 baseline with the SAME `--label` exists** — Q7/Q8/Q9 read
   it. Run cat6 first or cat5 VOIDs on three MEASURE rows.

**Banked against this phase, not closed by it:** cat3 on Settings > **Appearance** is 12 of 26
`liquidTreatedEligible` — fourteen eligible regions untreated and on no shared primitive
(`cat3-l10b4-settings-appearance.json`, control movedOne true / allWorkFailed true / returned
true). Page-scoped, sampled out of L10 bullet 4, and still open.

### Banked cat3 FAIL on Settings > Appearance — RESOLVED 2026-09-01, and the defect was the instrument's

L10 bullet 4 banked `cat3-l10b4-settings-appearance.json` at **12 of 26 `liquidTreatedEligible`**
— "fourteen eligible regions untreated and on no shared primitive" — and left it open. The
`--detail` flag added to `cat3-liquid-utilization.cjs` this turn names them, which no prior run
could: **all fourteen are `header.os-set-card-head`**, one per settings card, 644x42 each,
`ownAlpha 0`, backing `opaque at section.os-set-card`.

That is the `<h3>` + description strip inside `section.os-set-card` — a settings FORM card's own
caption. Glassing fourteen of them is the "universal glass is a failure" outcome §2.3 forbids and
CLAUDE.md restates ("keep reading, editing, forms, tables… on stable high-contrast anchor
surfaces"). So the FAIL was the measurement's, and the correction goes in `l1-surface-roles.js`,
not in the product.

The rule is HTML's own scoping, not a heuristic: `<header>` maps to the `banner` landmark and
`<footer>` to `contentinfo` **only** when they are not descendants of `article`/`aside`/`main`/
`nav`/`section`; nested, the browser exposes them as generic and they caption their section. The
exemption is narrow — an explicit `lq-` primitive class or an explicit landmark `role` still
counts at any depth, and `nav`, `aside` and the role selectors are untouched, so a toolbar inside
a dense editor pane stays contextual chrome.

**The product supplied its own discriminator, which is why this is not a weakened bar.** A
document-wide sweep found exactly FOUR distinct header shapes in the whole app, and the three
that are real chrome already carry `lq-contextual` — `os-set-page-head`, `mc-topbar`,
`medialib-browser__head`. Only the card caption is bare. The instrument was second-guessing an
opt-in the product already makes explicitly.

After, live: Settings > Appearance **PASS 10/10, 12 of 12 treated**, `Liquid-eligible` 26 → 12 and
`Anchor` 56 → 70 (the fourteen move, none vanish), control `movedOne`/`allWorkFailed`/`returned`
all true. Regression check on the two cells this could have emptied — a denominator of 0 caps the
category at 0 — **Settings Home still 13 of 13 and Video still 4 of 4, both PASS 10/10 with their
controls proven**; neither surface has a bare nested header, so neither moved.

Trap: the first control run of the corrected probe VOIDed on `returned: false` with
`denseWorkOnTranslucent` stuck at 1 while `oneMaterialReturned` was true — the liquid
presentation's backdrop had not settled. Re-run clean. One gesture reading is noise here.

### Bullet 2 — high contrast, zoom, text scaling, compact widths, reduced/disabled motion. **OPEN — all 5 clauses now MEASURED, 4 pass, text scaling fails with a number.**

This bullet names five specific user requests, so it is scored against those words first and the
RULE C grid second — a 16/16 built only from the default display preferences would not have
touched the bullet at all. Measured live this turn on Settings and Media Center / Video, driving
the product's own `data-display-*` hooks on `<html>` (attribute-level, never the persisted store —
captured, patched and restored; `contrast normal / bold 0 / transparency full` verified back).

**High contrast — PASSES on both surfaces.** With `data-display-contrast='high'` **and**
`data-display-bold='1'` set together, `cat1-accessibility.cjs` scores **Settings PASS 10/10** and
**Video PASS 10/10**: 0 failing text runs, 0 targets below the 32 px hit floor, 0 stolen, 0
WCAG 2.5.8 failures, 0 keyboard-unreachable, motion `during 0` against `before 46` / `before 40`
(a non-empty baseline, so the motion leg is not scored on an empty harness).
`cat1-l11b2-settings-hc.json`, `cat1-l11b2-video-hc.json`.

**No-blur / no-transparency dependency — PASSES, and the Liquid presentation honours it.** This
is the clause most likely to have rotted, because `styles.css:1285`'s selector list predates
Liquid and only strips `backdrop-filter`. Measured on the Settings window driven into Liquid
presentation, one preference at a time:

| `data-display-transparency` | `.fwin` background | `backdrop-filter` | `--lq-liquid-bg` | `--lq-liquid-blur` |
| --- | --- | --- | --- | --- |
| `full` | `srgb 0.102 0.094 0.137 / **0.72**` | `blur(8px) saturate(1.25)` | `color-mix(… 72%, transparent)` | `8px` |
| `reduced` | `… / **0.88**` | `blur(6px)` | `color-mix(… 88%, transparent)` | `6px` |
| `off` | `rgb(26, 24, 35)` — **fully opaque** | `none` | `#1a1823` | `0px` |

So the token layer described in `liquid-tokens.css:244` is reaching the live window, not just the
stylesheet. Independently on the Media Center: `aside.lq-contextual.mc-sidebar` goes
`blur(24px)`/alpha 0.94 → `none`/alpha **1**, and `header.lq-contextual.mc-topbar`
`blur(18px)`/0.72 → `none`/**1**. Settings' own 13 eligible regions read alpha 0 with no backdrop
in both states — they have no background of their own and inherit the window's, so there is
nothing there to opacify; that is a correct reading, not a silent pass.

**Compact widths — PASSES** on both surfaces via cat4's `allThreeSizes` + `restored` bars
(`cat4-l11b1-settings.json`, `cat4-l11b1-video.json`, both PASS 10/10).

**Reduced/disabled motion — PASSES on both triggers.** cat1's motion leg drives the OS-level
`prefers-reduced-motion` through `/emulate` and both surfaces pass (`duringOverThreshold 0`,
emulation demonstrably taken and released). The product's OWN switch is a second and independent
trigger, and it was measured separately: counting every element in each floating window whose
computed `transition-duration`/`animation-duration` exceeds the rubric's 0.01 s,
`data-display-anim` `full → none → full` gives **Settings 46 → 0 → 46, Media 85 → 0 → 85,
Video 49 → 0 → 49** across 280 / 396 / 309 elements. Non-empty baseline, exact restore, three
surfaces agreeing.

**Zoom — MEASURED, and it found a real defect on every window in the shell. `82c2c252`.**
`appZoom` sizes `#root` to (100/z)vw x (100/z)vh so the PAINTED box stays exactly one viewport,
which means at 200% the LAYOUT viewport halves while every window keeps the geometry it was
authored at. `#root` is `overflow: hidden` deliberately, so the excess is not scrolled to — it is
cut off. Measured before the fix: at zoom 2 a 960x680 Settings window painted **1920x1360** inside
a **1264x821** desk and hung **776 px right / 587 px bottom** outside it, with no scrollbar and no
route back except resizing the window by hand.

The shell now re-fits on `app-zoom-changed` through `clampLayoutToViewport` — the product's own
primitive, whose header already described this failure ("overflowing it with no way to reach the
far edge"). It was never reached from here because zoom is not a `resize` and does not re-hydrate.
The fit is re-derived from the STORED layout, not the live windows, so zooming back out restores
the authored size; and nothing is committed, so the clamp never overwrites that size.

| surface | zoom 2.0 before | zoom 2.0 after |
| --- | --- | --- |
| Settings | **FAIL** — deadRegion + contentGrowsNotChrome, default box 1920x1362, dead **19.4%** | **PASS 10/10**, 960x632, dead **6.7%** |

**The mutation control disables only this effect** (`if (deskEl) return;` at the top of the
subscriber) and returns the same FAIL with the same probe on the same route, so the PASS is the
product's and not the instrument's. `cat4-l11b2-settings-zoom2.json`,
`cat4-l11b2-settings-zoom2-control.json`.

Two surfaces are NOT closed by this and are not claimed:
- **Media** at zoom 2 is PASS on dead region (4.5%) but **FAILs `horizontal`** — a scroller or a
  hidden overflow-x that only appears at 200%. `cat4-l11b2-media-zoom2.json`. Open.
- **Video** at zoom 2 FAILs deadRegion 17.3% / 19.8%, chrome share 42.8 -> 51.1%. The clamp did
  its half (1080x679 would have painted 2160x1358; it painted 1080x630). **But the Video page is
  in its EMPTY state** — `video: false`, two `div.mc-video-empty` blocks — so the rubric caps this
  cell rather than scoring it, and it is neither a pass nor a product FAIL until measured with
  media loaded. `cat4-l11b2-video-zoom2.json`. Open.

**Text scaling — MEASURED, and it FAILS. Half repaired in `1346cf0b`, half open.**
The customization ladder carried three steps (`font-size-sm/md/lg`) while `theme/tokens.css`
defines five. The two missing ones are the ones the renderer leans on hardest: `--font-size-xs` is
the **most-used** font-size token in the app (**201** declarations against sm's 97) and
`--font-size-2xs` adds **86**. So `bigger-text` could only ever move the text that was already
largest. `UI_TOKEN_BASELINE` also said `font-size-sm: 12px` against the stylesheet's 0.8125rem =
13px, so a relative nudge landed one step up the ladder rather than 15 percent of anything. Both
corrected; the two new tokens also appear in the Theme Studio editor, which reads the same list.

| surface | reach BEFORE | reach AFTER | layout bars |
| --- | --- | --- | --- |
| Media Center | — | **35% of 100** sampled text elements (11px 38->15, 12px 13->2, new 14px x15, 15px x24) | PASS 10/10, dead 2.6 / 0.5 / 3.9 |
| Settings | 1 of 70 (13->14) | **1.4% — still 1 of 70** (13->15) | PASS 10/10, dead 4.8 / 0.7 / 7.0 |

**The clause fails on Settings and the layout bars are not the reason.** Settings' own CSS
hardcodes its sizes: across the renderer there are **2,408** `font-size` declarations and only
**550** use a token — 316 of them literal `12px`, 243 `11px`, 147 `13px`. A whole-surface
typography pass is what closes this, and folding one into a focused task is what CLAUDE.md
forbids. So the number is published and the clause stays open.

**TRAP, and it cost a landed fix to notice: `applyZoom` is NOT the probe-safe entry point.**
The previous turn's note here said it was, on the reasoning that it does not persist. It does not
dispatch `app-zoom-changed` either — and that event is the product's cross-surface zoom contract,
which both the Settings slider and (now) the shell's re-fit hang off. A probe on `applyZoom`
measures a state the product never reaches through its own control, and would have scored
`82c2c252` as broken. Drive **`setZoom`**, and capture-patch-restore `jp-app-zoom` around it —
including the ABSENT case, where the key must be REMOVED rather than written back as "1".

**The instrument is a MODE on cat4** (`--zoom`, `--ui-request`), per RULE 1 — the whole existing
three-size sweep runs under the condition. Correction 25 carries four guards, all of which fired
at least once during this bullet:
 (a) the condition must demonstrably apply — and correction 25b sharpened this after the first
     version compared only the `--font-size-*` custom properties, which the product had
     demonstrably rewritten, and so would have scored a surface that ignores those tokens
     entirely as a clean pass. It samples the surface's own visible text now, and reports
     `textReachLowerBoundPct`, because "changed" is a bit and one element of seventy satisfies it;
 (b) it must still be applied AFTER the sweep — `installZoomResizeHook` re-applies the PERSISTED
     zoom on any OS-window resize, so the `/bounds` lever on a root surface silently undoes it;
 (c) restore is byte-compared, not eyeballed. `uiCss` `null` and `''` are the same state (no
     customization CSS) and treating the product's own empty `<style>` element as drift VOIDed one
     otherwise clean round trip;
 (d) neither `jp-app-zoom` nor `jp-ui-customization-v1` may move. Both are compared before/after.

**Still true and still useful from the previous turn's source hunt:** `src/renderer/zoomCoords.ts`
exists because Chromium reports pointer coords in UNZOOMED pixels while layout is in zoomed ones,
so any probe that clicks by coordinate while zoomed must divide by `getZoomFactor()`. Text scaling
is `uiCustomization.ts`, a preset system — there is no `data-display-*` hook for it and looking
for one is the wrong search. The display-preference vocabulary is only `anim`, `bold`, `contrast`,
`flashes`, `focus`, `links`, `pointer`, `scroll`, `transparency`.

**Bullet 2 does not close.** Four clauses pass; text scaling fails with a measured reach of 1.4%
on Settings, and zoom leaves Media (`horizontal`) and Video (empty harness) open. The exact next
slice is Media's `horizontal` failure at zoom 2 — it is the only one of the three that is a
concrete named bar on a non-empty surface.

## L11 bullet 2 — Media's `horizontal` FAIL is closed, and it was never a zoom bug (2026-09-01, primary)

`b0` — `.medialib-rail__group` stays a COLUMN in the one-pane strip mode.

The previous turn left this as "a scroller or a hidden overflow-x that only appears at 200%".
It is neither, and it is not about zoom. `@container medialib (max-width: 420px)` turned the rail
into a wrapping strip and applied `flex-direction: row; flex-wrap: wrap` to **two** selectors —
the strip (`.medialib-rail .ui-sidebar`, correct) and the `<details>` group around it (wrong). A
`<details>` laid out as a row puts its heading beside its own content box, and that content box is
then a shrink-to-fit flex item sized to max-content, so `min-width: 0` on the nav resolves against
the nav's own 161px rather than against the rail. The shell's `overflow: hidden auto` then clips it.

**It reproduces at 100% zoom.** Live sweep of the Media window, 250..340px every 2px:

| | clipped widths | worst |
| --- | --- | --- |
| before | **18 of 46** — a continuous 264..298px band | `medialib-shell` 165 > 130, 35px of nav unreachable |
| after | **0 of 46** | — |

Why 200% found it first: the `120px` icon-only container query hides the labels below the band and
so hides the defect, and a `scrollbar-width: thin` scrollbar is painted in DEVICE px and does not
scale — so at zoom 2 the same 260x170 compact window has ~5 more CSS px of content box (131 vs 126)
and lands just inside the band instead of just under it.

| cat4 Media | verdict |
| --- | --- |
| zoom 2.0, before | FAIL `horizontal`, compact `div.medialib-shell 165>131` |
| zoom 2.0, after | **PASS 10/10** (`cat4-l11b2-media-zoom2-fixed.json`) |
| zoom 2.0, mutation control (that one declaration re-added live) | **FAIL `horizontal`**, same `165>131` (`...-control.json`) |
| zoom 1, after | PASS 10/10, no regression (`cat4-l11b3-media-nozoom.json`) |

Condition guards all green on both graded runs: `applied` `heldThroughSweep` `restored`
`persistedUnchanged` true, `driftedFields` [].

**MEASURED TRAP for anyone writing a responsive rule that must hold under app zoom: a
`@container` length is compared against the container's PAINTED size, while `clientWidth` reports
the zoom-adjusted one.** At zoom 2 a rail whose `clientWidth` reads 131 satisfies
`(max-width: 240px)` and fails `(max-width: 120px)` — every px breakpoint in the app fires at half
its visual width at 200%. `em` does track it (`9.2em` matched at both zooms, because the query
resolves the container's font-size in the same painted space), but it is not a fix on its own — the
breakpoint here was never the bug. Probed with four parallel `--cq*` custom properties on one
element; both zooms in one artifact.

## L11 bullet 2 — Video's zoom cell is no longer an empty harness, and it found two bars (2026-09-01, primary)

`b1` — the Media Center inspector could not shrink. The cell was CAPPED last turn because the
Video page rendered `video: false` and two `mc-video-empty` blocks. The page's own empty state
carries seven library tiles, so the harness was populated through the product's route — one click
on `button.mc-media-tile` (`E38 JoJo no Kimyou na Bouken - Ougon no Kaze 38 RAW`, a real local
file), no native dialog, no fixture. Video is a LAUNCHER for the media workspace, so one honest
`mc-video-empty` remains by design; `emptyCount` 2 -> 1 and the page now renders a chosen title,
an inspector and an up-next shelf.

Measured with content, it FAILS — and the first bar fails at 100% zoom too, so it was never a
zoom defect either:

| Video, cat4 | zoom 1 | zoom 2.0 |
| --- | --- | --- |
| loaded, before | FAIL `horizontal` — compact `main.mc-content 197>154` | FAIL `horizontal` + `contentGrowsNotChrome` |
| loaded, after | **PASS 10/10** | FAIL `contentGrowsNotChrome` only |

Two origins, found by walking only the elements whose PARENT does not also cross the edge:
`.mc-section-head > div` is an unclassed flex wrapper at `min-width: auto` carrying the uppercased
`Language-learning player` eyebrow's 126px unbreakable token (the head itself already had
`min-width: 0`, one level too high — which is why the h2's ellipsis never engaged); and
`.mc-inspector-score-row` used `repeat(3, 1fr)`, whose tracks floor at min-content, so
`subtitle lines / vocabulary / MAL score` held the row at 193px in a 154px pane. `minmax(0, 1fr)`
plus the wrapper's `min-width: 0` -> `main.mc-content` 197 > 154 becomes 154 = 154, 0 elements
past the edge. The before rows above are the control: same harness, same content, same probe,
at this HEAD minus the two declarations.

**`contentGrowsNotChrome` at zoom 2 stays open, and it is the container-query/zoom class again.**
Chrome is fixed in CSS px — sidebar 206, inspector 288 — and the queries that would collapse them
(`@container mc (max-width: 1040px)` -> 174px, `(max-width: 820px)` -> 58px) compare against the
PAINTED size, which at zoom 2 is double. So a window that is visually 540 CSS px wide reports
2084 to the query and keeps its widest three-column chrome: 494 of 540 px of width is chrome, and
the share grows 45.1% -> 49.9% as the box grows because the clipped inspector's height grows with
it. 9 `@container mc (...)` at-rules are affected. Converting them to `em` is the candidate fix
and is measured to track zoom correctly (see the previous entry); it is a whole-shell change, not
this slice, and it is the exact next slice.
