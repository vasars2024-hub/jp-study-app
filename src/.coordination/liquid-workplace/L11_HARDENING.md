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

**WITHDRAWN — this entry first published the opposite, and a discriminating re-test one slice
later falsified it.** The claim was that a `@container` length is compared against the container's
PAINTED size, so every px breakpoint would fire at half its visual width at 200%. It is not: the
comparison uses the ZOOM-ADJUSTED size, the same number `clientWidth` reports, and it is
self-consistent. Two measurements, either one sufficient:

- the rail at zoom 2 is 123 adjusted / 246 painted, and `(max-width: 240px)` MATCHED — which
  painted semantics forbids, since 246 > 240. The original entry had this datum and read it
  backwards;
- `.mc-root` at zoom 2 is 502 adjusted / 1004 painted, and `@container mc (max-width: 820px)`
  MATCHED and did its job: the Media Center sidebar collapsed 206 -> 58 CSS px on cue.

`em` agrees with `px` at both zooms rather than correcting it, because the container's font-size
is zoom-adjusted too — so converting breakpoints to `em` buys nothing, and a slice was nearly
spent doing it to nine `@container mc` at-rules.

**The trap that IS real and worth keeping: a `scrollbar-width: thin` scrollbar is painted in
DEVICE pixels and does not scale with app zoom.** So the same window has MORE CSS content width at
200% than at 100% — the rail measures 118 at zoom 1 and 123 at zoom 2 — and a breakpoint at 120
lands on opposite sides of it. That is the whole of why the clip below showed up at 200% first,
and it is why a knife-edge responsive threshold is not safe under zoom even though the query
itself is correct.

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

**`contentGrowsNotChrome` at zoom 2 stays open, and it is NOT the breakpoints.** That was this
turn's first hypothesis and it is disproved above: `@container mc (max-width: 820px)` fires
correctly at zoom 2 and the sidebar does collapse 206 -> 58 CSS px. What remains is the
INSPECTOR: `aside.mc-video-inspector` is a fixed 288 CSS px wide and 452 CSS px tall at every
size, so across the pair the probe compares (default 540x315 CSS, chrome 45.1%) against
(maximized 632x355 CSS, chrome 49.9%) — its width share falls 53% -> 46% as the box grows, but
its CLIPPED HEIGHT grows with the box faster, and chrome's AREA share is what the bar measures.
Both boxes are under `@container mc (max-width: 640px)`, which does not touch the inspector.

Exact next slice: read what `(max-width: 640px)` already does to `.mc-video-layout`, and give the
inspector the same treatment the drawer gets in `mediaLibrary.css` at 1240px — an overlay or a
collapse, not a third fixed column — then re-run `cat4 --surface Video --zoom 2.0`, whose only
remaining bar this is. Do NOT re-derive the container-query question; it is settled above.

## L11 bullet 2 — the last two blockers close: Video's stage, and Settings text scaling (2026-09-01, primary)

Opened by RECOVERING an interrupted turn. `mediaCenter.css` was ` M` with an mtime of
08:30:00, six seconds before the worker died on a usage limit; the previous handoff said
"UNCOMMITTED OF MINE: NONE", so an unmentioned dirty file would normally read as another
track's. It was not — it was a half-landed slice, re-derived and finished here.

**`4d6a7ce7` — Video's stage collapsed to 30px whenever the layout stacked.**
`.mc-video-empty` was `position: absolute; inset: 0`, so it contributed no height and
`.mc-video-stage` was sized by the only thing left in flow, the 30px status line, under
`overflow: hidden`. Invisible in two columns (the outer row is sized by the 452px inspector
beside it); fatal when `@container mc (max-width: 820px)` stacks, which is where 200% zoom puts
an ordinary window. Stage becomes a one-cell grid stack.

| Video fwin 560x400 (`.mc-root` 522, one 426px column) | stage | "Open in the media workspace" |
| --- | --- | --- |
| after | 426x271, rows `241px 28px` | 59px INSIDE the bottom edge |
| mutation control | 426x**30**, `overflow: hidden` | **158px PAST** it |
| control still applied, widened to 1080 | 426x452 | 135px inside |

The third row is what makes it a control rather than a reproduction: same reverted CSS, two
sizes, opposite outcomes.

**It also closed the bar the last handoff named as the exact next slice**, and that slice's
diagnosis was wrong. `contentGrowsNotChrome` at zoom 2 was attributed to `aside.mc-video-inspector`
being a fixed 288x452 box. It was not the inspector: with the stage collapsed, chrome's AREA share
was inflated at every size. Same probe, same route:

| cat4 Video zoom 2.0 | default | maximized | verdict |
| --- | --- | --- | --- |
| before / mutation control | chrome 45.1% | chrome 49.9% | FAIL `contentGrowsNotChrome` |
| after | chrome **30.4%** | chrome **27.2%** | **PASS 10/10** |

Regression legs: Video zoom 1 PASS 10/10, Media zoom 2.0 PASS 10/10. Condition guards green.

**`7e0d16be` + `ff977f9f` — Settings ignored "bigger text" on 69 of its 70 text elements.**
The standing blocker was recorded as "Settings' own CSS hardcodes px — 2,408 font-size
declarations, only 550 tokenised, a whole-surface typography pass, not this slice". The 2,408 is
real; it is not this surface's lever, and the estimate it produced was ~180x too large.

Measured from the CSSOM, not grepped: of 16,839 style rules, 2,374 set a font-size, and **13**
of them govern all 70 Settings text elements — 7 matching the elements themselves, 6 more on the
ancestors the remaining 49 inherit from (49 of 49 resolved, 0 unresolved). All 13 are in
`styles.css`. Every replacement is default-identical at a 16px root and keeps its old value as
the `var()` fallback; verified after HMR as 13/11/21.6/13/12/13/11 then 13/13/13/12/12/12.5px.

| through `interpretUiRequest("bigger text")` -> `applyUiCustomization(doc, preview)` | reach |
| --- | --- |
| before | 1.4% — one element, and it was `.ui-btn`, the ONE token rule in the set |
| after 7 rules (`7e0d16be`) | 30% element-wise / 21.4% harness floor |
| after 13 rules (`ff977f9f`) | **100% element-wise (70/70) / 91.4% harness floor** |

cat4 Settings PASS 10/10 **under** bigger text at 960x681, 260x170 and 1264x765 — clipped 0,
overlaps 0, horizontal 0, dead 4.8 / 0.6 / 6.4 pct. So the larger text does not clip.

**FOUND, NOT FIXED, and it is the exact next slice.** The product's OTHER text-scaling control is
dead on this surface. Settings > Display base font moves `body` 14px -> 18px and the entire
ancestor chain with it (`.fwin`, `.os-desktop`, `.desktop-root` all 14 -> 18) — and **0 of 70**
text elements follow, before or after this change, because every one resolves through an authored
rule instead of inheriting. `displayPrefs.ts:173` writes `--display-font-px` unconditionally, so
`body`'s `var(--display-font-px, 14px)` fallback can never fire either. The two affordances need
to compose; that is a precedence decision plus roughly one declaration, and it is NOT folded in
here.

**Instrument trap, which produced a false zero and then a false "no authoring rule".** Chrome
supports CSS nesting, so **every** `CSSStyleRule` now has a truthy but EMPTY `.cssRules`. A walker
shaped `if (r.cssRules) { recurse; return }` descends into nothing and reports **0 rules across 64
readable stylesheets** — it looks exactly like a permissions failure. Count the rule first, then
recurse only on `r.cssRules.length`. Second, self-inflicted, same turn: the collected rule objects
stored the selector as `sel`, and the matcher called `el.matches(r.selectorText)` — `undefined`
throws, the `catch` skipped every rule, and the ancestor walk reported that even `body` had no
font-size rule. Both were caught by asking the instrument a question with a known answer.

## 2026-09-01 (primary, later) — the second text-scaling affordance, and cat7 gets the bullet's own question

**`69026f5d` — Settings > Display base font reached 0 of 70 text elements.** This is the defect
L11 bullet 2's own tag named as the exact next slice while closing. Re-derived on my own
instrument before touching code, both readings on the same 70 elements of the same window:

| condition, through the product's own non-persisting route | moved | reach |
| --- | --- | --- |
| Settings > Display base font 14 -> 18 (a sibling-window `storage` event) | 0 of 70 | 0.0% |
| UI customization "bigger text" (`interpretUiRequest` -> preview) | 70 of 70 | 100% |

The second row is the INSTRUMENT'S POSITIVE CONTROL. It can see movement, so the first row is a
product defect and not a dead sampler — the shape that has produced three false passes here.

Cause: `--display-font-px` has exactly one consumer, `body`. After `ff977f9f` all 70 elements
resolve through authored `--font-size-*` rules, so none of them inherit and none of them moved.
Fix: the preference also lands as `--display-font-scale` = `baseFontPx / 14` and `tokens.css`
writes all 11 ladder steps as `calc(<step> * var(--display-font-scale, 1))`. Computed in JS
because `calc()` refuses length/length, so a unitless ratio cannot be derived from a px value.
`profileToCss` emits `font-size-*` as `calc(<value> * var(...))` too: its declarations are
`!important` and replace the whole ladder value, so without that a profile pinning one step would
silently switch the base font off for exactly that step.

| after, Settings 960x681 | moved | note |
| --- | --- | --- |
| default (scale 1) | — | 70 elements, sizes 11/12/12.5/13/21.6, byte-identical to before |
| base font 18 alone | **70 of 70** | 13px -> 16.71px |
| bigger text ON TOP of it | 70 of 70 | 13px -> **19.29px** = 13 * 1.15 * (18/14) |
| MUTATION CONTROL — ladder reverted to the pre-fix literals, base font still 18 | **0 of 70** | the exact before-number |
| control removed | 70 of 70 | same code, control on and off, opposite outcomes |
| round trip | 0 moved | scale 1, body 14px, `jp-os-display-prefs-v1` unchanged, no style left |

The composition row is what proves the `profileToCss` half: 19.29 is only reachable if the pinned
15px still rides the scale. Pinned, it would have read 15. `.fwin-title` reads 15.93 not 16.07
because it is `calc(var(--font-size-xs) + 0.5px)` and the 0.5px offset correctly does not scale.

**FOUND, NOT FIXED — the mirror of the same defect.** `body { font-size: var(--display-font-px,
14px) }` does not read the ladder, so under "bigger text" ALONE `--font-size-md` moves 14 -> 16
while `body` stays 14px. Measured this turn. Invisible on Settings (0 of its 70 inherit from
body) so it does not touch the numbers above; closing it means changing which property `body`
reads, and `aeroDisplayModeSync.test.ts` — which asserts `--display-font-px` literally — is an
UNTRACKED file belonging to another track, so it is theirs to move, not mine.

**`aac9a9c1` — cat7 gains `--under-load`, which is L11 bullet 3's actual question.** The bullet
is "drag/resize at target frame rate WHILE media, dictionaries, and large lists are ACTIVE", and
no leg asked that: gestures 2-4 run on an IDLE surface and `heavy` is measured BESIDE them as
main availability, never under them. A surface can drag at the ceiling with nothing happening and
drop frames the moment its own list scrolls. A MODE on the existing runner (RULE 1), same shape
as cat4's `--zoom` / `--ui-request`; it adds two legs and leaves 2-4 as the in-session control.

Three refusals, and **two of them fired on the first two runs, which is the point of having them**:

| run | outcome | why |
| --- | --- | --- |
| `--surface video --under-load` | VOID | refusal 2: `0 cycles, 2 refusals, "REFUSE: the Up Next shelf has no scrollable overflow to sweep"`. Environmental and MINE — an HMR reload earlier in the turn reset Media Center to its empty state (0 tiles, both `.mc-video-empty` at overflow 0), the `hmr-resets-media-center-tab` trap. The surface's PRE-EXISTING `heavy` leg refuses identically, so nothing here is caused by the new code. |
| `--surface dictionary --under-load` | VOID | both legs `0 cycles, 0 refusals, last: null`. This one was an instrument bug of my own, below. |

**`FINDING, pre-existing and NOT this turn's` — dictionary `heavy` blocked main 9,093.3 ms against
a 500 ms bar.** Not new and not a regression: `L7_PERF_DICTIONARY.md:49` already banks this exact
load at **8,081.5 ms**, recorded 2026-08-26 and used there deliberately AS a sensitivity control.
Line 1453 of the same file records a repaired path at **6.0 ms** for "126 cold headword lookups"
with `keys=126, withGloss=126`, so the two routes differ and reconciling them is its own slice.
Reported as a number with its nearest banked comparator, and claimed as neither a regression nor
a pass.

**`<next commit>` — the instrument bug the VOIDs exposed, and it was mine.** `cycle()` read
`if (generation mismatch || past deadline) { window.__lqLoad = null; }`. Stopping bumps the
generation; the previous generation's timer then fires up to 2 s later and cleared the record the
NEXT leg had just armed — across runs too, since the page had not reloaded between them. That is
why all four legs read `0 cycles, 0 refusals, last: null` rather than a real number. A dead
generation may stop itself and nothing else. Proven live, same sequence, one line different:

| arm, stop, arm again, then let the superseded tick fire | record afterwards |
| --- | --- |
| old line | **null** — exactly the four voided legs |
| fixed line | `{ gen 15, cycles 1 }` — survives |

The legs now also record `armed` and `after` raw, because a `cyclesDuring` void could not
distinguish "the load stopped early" from "the record was never there". Same family as the banked
`deleting-probe-state-is-not-a-stop`. **The guards did their job: four legs VOIDed rather than
reporting frame numbers taken under no load at all.**

**`e9710c83` — the exact-next-slice was unrunnable, and the reason was one character.**
The handoff opened on `cat7-perf.cjs --surface dictionary --under-load`. It does not run at
HEAD, and it did not run at the two HEADs before it either: `98c78aa5` added a two-line note
INSIDE the `LOAD_ARM` template literal (opened line 154) explaining the superseded-tick bug it
had just fixed, and quoted the offending code in backticks. Inside a template literal a backtick
is not a comment character — it CLOSES the template, so `if (gen mismatch ...` parsed as real JS:

```
SyntaxError: Unexpected token 'if'    at cat7-perf.cjs:163
```

So the file could not be LOADED, let alone run. **That, not the tick bug, is what voided both
`--under-load` runs.** `git show HEAD:<path>` reproduces it, so it was committed breakage rather
than local tree state. CONTROL: `node --check` over all 52 probes in the directory — one failure
before (`cat7-perf.cjs`), zero after. The trap is now written down in the region itself, because
the next author of a comment there will hit it too.

**`<instrument commit>` — the reconciliation the last handoff asked for, and it went against the
instrument.** The carried note said "the dictionary heavy leg blocks main 9,093.3 ms against a
500 ms bar; L7 banks the same load at 8,081.5 ms and a repaired route at 6.0 ms; the two routes
differ and reconciling them is its own slice." Reconciled, from the sources rather than from the
note:

- `L7_PERF_DICTIONARY.md:49` does not bank that row as a load. It labels it **`SENSITIVITY
  CONTROL — 126 cold unseen lookups`** — the row that MUST breach so the instrument is proven
  able to see a breach — and the paragraph under it says the burst "caps whatever surface owns
  `lookupTermsBatch`, not this one." The Dictionary window's two REAL operations are in the rows
  above it: one real search **319.2 ms**, `Find example sentences` **224.5 ms**, both under the
  500 ms bar. **L7's verdict was already "both pass".**
- `cat7-perf.cjs` line 65 says `heavy` is "the surface's **HEAVIEST REAL** operation — the
  rubric's words". The dictionary spec had L0's sensitivity control in that slot, with a comment
  claiming it was "L0's own reference load, kept verbatim". It is verbatim; it is the wrong row.
  Scoring a deliberately-failing control as the surface's own work made this cell unable to reach
  10 by construction, in every run anyone will ever do.
- Source settles which route is real. All five product call sites of `window.api.lookupTerm`
  (`agentToolRegistry.ts:128`, `BlancReadyToolPanels.tsx:1074` and `:1337`,
  `DictionaryResults.tsx:352`, `LensReaderPanel.tsx:228`) issue ONE awaited lookup per user
  action. The bulk path is `lookupTermsBatch`, reached only from `main/mining.ts:1657` — and that
  is the 6.0 ms route, measured at `keys=126, withGloss=126`. **Nothing in the product fires 126
  concurrent single-term IPCs.** The 9,093 ms is real arithmetic about a load nothing generates.

So the 9,093 ms was never a Dictionary finding, and it was never a regression either. `heavy` is
now the surface's real heaviest operation: a search driven through the window's own `form.dict-search`
every 700 ms for the declared 20 s span — which is also exactly what L11 bullet 3 means by "while
dictionaries are ACTIVE". 28 distinct headwords, so a 20 s span never repeats one and never
measures the cache instead of the lookup.

**This is a correction that makes MORE things VOID, not fewer.** Two guards came with it:

1. The queries are emitted as `\uXXXX` escapes. They reach the renderer as a PowerShell argument,
   and a transport that mangled them would still produce a perfectly clean main-availability
   reading, because every mangled query is a cold miss.
2. **`No proof, no claim` is now enforced as written.** That sentence sat directly above the check
   and the check applied it only to specs that had opted IN — a spec declaring no `proof` got the
   free pass and a spec that wrote one got audited, which is the rule inverted. 18 of the 21 specs
   with a heavy leg already declare `proof`; the three that do not (`captures`, `manga`,
   `dictionary`) now VOID until theirs is written. `dictionary`'s is written. **`captures` and
   `manga` will VOID on their next run — named here rather than silently exempted.**

Exercised live against the shipped spec strings, pulled out of `cat7-perf.cjs` rather than
retyped: `ARM -> searching 28 words`, and 21 s later `PROOF -> 28 searches, 28 distinct, entries
2-8, last "続ける"`. The Japanese round-tripped, which is what `sawResults` exists to prove.
**Not yet re-scored** — a full `--under-load` run is ~20 minutes and did not fit this turn; see
the trap below for why the first attempt produced nothing at all.

**TRAP, and it cost this turn a run: the Bash tool's timeout is capped at 600000 ms.** A cat7
`--under-load` run takes longer than that. Passing `timeout: 1200000` does not raise the cap — it
is silently clamped, the pipeline is killed mid-run at ten minutes, and because the command ends
in `| tail`, the output file is left **completely empty** and the exit status reads 0. Nothing is
written to `baselines/`, so the only symptom is a run that appears never to have happened. Launch
it detached (`Start-Process`) and poll the baseline file's mtime.

## 2026-09-01 — L11 bullet 3: the under-load instrument finally scores, the bullet does NOT close

`bc88587a`. **Correction 33.** The `--under-load` mode has never produced a scoreable number.
It did not parse (fixed `e9710c83`), then it measured L0's sensitivity control instead of a real
load (fixed `583c7815`), and it still returned VOID three ways. **All three had one cause:**
`LOAD_ARM` re-armed a load that was still running.

- The re-arm interval was `Math.min(deadlineMs, 2000)` = **2000 ms** for every surface, against a
  gesture of **~1800 ms**. "At least 2 cycles across the gesture" was **unsatisfiable by
  construction** — no surface could ever have passed it. Same shape as the SENSITIVITY CONTROL
  trap the previous turn found, one layer up.
- A `heavy.js` is not a pulse. The dictionary's schedules 28 searches over 20 s and returns at
  once, so re-arming **stacked** a second interval on the first and, because it opens with
  `delete window.__lqDictLoad`, **wiped its own receipt**. That is the whole of
  `REFUSE: only 2 searches ran` — the counter had been reset 2 s earlier. The load never failed.
- Scene stability used the **idle** test. Under load the surface must change; the dictionary
  rewrites its results list on every search. Unsatisfiable by construction again.

Repairs, all in the direction of a HARDER test: interval = the load's own `durationMs`; the
dictionary stores its interval handle so a re-arm clears the previous one (**leg 2 was measuring
twice the load leg 1 did**); the receipt counts REAL WORK via a new `progress` expression rather
than arms; under-load scene stability keeps only what makes frames incomparable (window count,
gesture closed-loop) and records content drift as data; `loadProof` re-scales the DURATION
threshold and keeps every correctness check verbatim, the mojibake guard included.

**THE NUMBER, first ever produced for this bullet.** Session ceiling p50 16.7 / p95 16.8.
drag under load p50 **16.7** / p95 **33.4** / max 50.1 / over100 **0** / mainMax 186.5;
resize p50 **16.7** / p95 **33.4** / max 50.2 / over100 **0** / mainMax 234.5. Idle counterparts
16.7/16.8 and 16.7/17.0. **Zero findings from either under-load leg** — drag and resize hold the
ceiling while the dictionary is actively searching. Receipt: `4 searches this leg, 4 distinct,
entries 6-8`. Scene fwins 4 -> 4, closedLoop true, elements 1032 -> 1283.
**The diagnosis is settled by the run itself: `workDuring` 4 on both legs where `cyclesDuring`
is 0** — the old counter would still have voided a load that demonstrably ran.

**MUTATION CONTROL** (`progress` frozen to `0`, everything else identical): both legs VOID,
`the load completed only 0 unit(s) of real work across the gesture`, while `last` still reads
`"searching 28 words"` — i.e. the load armed and the OLD arm counter would have been satisfied.
The new receipt catches what the old one could not. Probe restored sha256-identical
(`e2ec30ca…`), clean against HEAD. `node --check` over all 52 probes: 0 failures.

**BULLET 3 STAYS OPEN, said plainly.** The cell is still **VOID** on two things that are not the
under-load legs: the **idle** `resize` leg came back UNSTABLE (2 of 5 repeats breached, idle max
343.3 ms this session against 11.4 ms in the 15:41 run — the machine is noisier, so re-run before
treating it as a surface defect), and the heavy leg reports **main blocked 1182 ms**, over the
500 ms bar. That 1182 ms is the real remaining product question and the next turn's opening slice:
the earlier 5114.8 ms reading was inflated by the stacked intervals this commit removed, so the
honest figure is 1182 ms — still 2.4x the bar, on a surface whose search is supposed to be off
the main event loop (CLAUDE.md, Performance).

## 2026-09-01 (primary, evening) — L11 bullet 3: the 1182 ms was the disk, and it now belongs to another process

`02932db7`. **Re-derived before touching code, on the receipt's own instrument** — `/health`
round-trips, which run on main (`tools/liquid-perf-probe.ps1`), sampled at 15 ms across a real
`form.dict-search` submit or a direct `window.api` call, old binary, warm session (uptime 18.8 h):

| call | main held |
| --- | --- |
| first search of this session, 勉強, through the form | **11,525 ms** |
| second search, 走る | **3,798 ms**; third, 泳ぐ, 152 ms |
| `dict:examples` first call, 登る (direct) | **7,796 ms**; 107–133 ms on the next three words |
| `dict:frequency` first call | **6,836 ms**; 45–56 ms after |
| `dict:etymology` first call | **3,742 ms**; 61–73 ms after |
| `lookupTerm` alone, 8 fresh words, everything warm | 62–167 ms; the two "outlier" words re-timed warm at 66–127 ms |
| six form searches, everything warm | 141–263 ms |

So the queries were never the cost: warm they are indexed probes at 45–260 ms, which is what
`L7_PERF_DICTIONARY.md` banks as passing. **The cost is where the page lives.** This machine had
1.2 GB of 30 GB free, standby list 1.1 GB, page file 5.9 GB in use (peak 17 GB); main's private
bytes were 659 MB against a **190 MB** working set — most of its heap paged out — and `dict.db`
is 537 MB under a 256 MB `mmap_size`. An evicted page is a fault taken INSIDE the synchronous
`better-sqlite3` call, on main. `warmup.ts` had already found exactly this ("`lookup()`'s first
touch of the `headwords` pages, one unbroken synchronous block") and pays it once per boot; memory
pressure takes it straight back, and the bullet's 20 s / 28-word load is precisely a walk across
pages nobody warmed. The `1182 ms` was the mild case of the same thing.

**The fix is the one CLAUDE.md names: the reads leave main.** A utility process on its own handle
— the SAME bundle the import worker already builds, so `forge.config.ts` is untouched; a process
is a reader or an importer by what it is sent. `dictionary/readProtocol.ts` is the contract and
the one dispatch table both ends share (the worker calls it on its handle, main calls it on its
own when the worker cannot be used, so the two routes answer identically by construction);
`readClient.ts` is the main-side state machine with three invariants — a read is a QUESTION, not
a process (a crash re-runs it in-process rather than answering "nothing matched"); a worker that
cannot be used is given up on once, out loud, never in a retry loop (a spawn that throws, or two
exits inside 5 s of spawning); nothing waits forever (60 s, then the wedged process is replaced
and its other reads answered here). Seven reads moved: the lookup itself and the six expansions.
Three stay on main on purpose and say so: collocations (it WRITES), the batch frequency read (a
`Map`), the interlinear read (a synchronous legacy-store callback). 12 unit cases across
`dictionaryReadClient.test.ts` (fake process: id routing, error reply, mid-read death, respawn
storm, spawn failure, timeout, dispose) and `dictionaryReadWorker.test.ts` (real SQLite file:
own handle, arrival order, error-as-answer, deaf to `start`/`cancel`). Product 489 lines, tests
343, this doc's lines are the only evidence written into the repo.

**After — same instrument, fresh process (restart 16:29 EDT), then the cache evicted on purpose
with `tools/evict-file-cache.ps1 -TargetGb 4` (standby 1,094 → 3,060 MB):**

| call | work took | main held |
| --- | --- | --- |
| first search of the new process, 勉強 | entries painted at 338 ms | **8.7 ms** worst over 498 samples |
| `dict:examples` 答える after eviction | **1,225 ms** in the worker | **9.6 ms** worst |
| form search 選ぶ after eviction | entries at 168 ms | 782.8 ms — ONE sample, 8.9 s after the submit |
| idle control, 20 s, after a fresh eviction, no search | — | 8.2 ms |
| form search 続ける after a fresh eviction, 20 s | entries at 385 ms | **10.8 ms** |

The work is as slow as it ever was — 1.2 s for a cold examples read — and main no longer knows.
The one 782.8 ms sample did not reproduce on the idle control or the repeat, so it is reported,
not scored (`one-gesture-reading-is-noise`). `/mem`'s process metrics list the new
`jp-dictionary-read` utility at 141 MB working set; the import worker's role is untouched.

**cat7 `--under-load --surface dictionary`, strict OFF, fresh process (uptime 480 s at start):
PASS 10/10, no findings, no voids, ceiling clean.** Same runner, same spec, same 28 headwords as
`bc88587a`'s VOID:

| leg | `bc88587a` (before) | this run |
| --- | --- | --- |
| heavy: 28 real searches over 20 s, main availability | max **1182** / p95 126.5 ms, 20,195 ms span | max **9.0** / p95 3.1 ms, 667 samples over 20,011 ms |
| heavy proof | 25 searches | `28 searches, 28 distinct, entries 0-8, last "続ける"` |
| idle resize | max 343.3 ms, UNSTABLE (2 of 5 breached) | max 8.9 ms, stable |
| drag under load | p50 16.7 / p95 33.4 / max 50.1, mainMax 186.5 | p50 16.7 / p95 **16.8** / max 17.4, over100 0, mainMax **12.0** |
| resize under load | p50 16.7 / p95 33.4 / max 50.2, mainMax 234.5 | p50 16.7 / p95 **16.8** / max 17.1, over100 0, mainMax **12.1** |
| work across each gesture | 4 searches | 3 searches, 3 distinct, `entries 6-8` |
| sensitivity control (`-Jank`) | — | 12 frames over 100 ms, p95 100.3 — the recorder sees what it reports |

The bullet's words are "media, dictionaries, and large lists". Dictionaries is the cell above.
**Large lists:** `--surface flashcards --under-load` — the deck is a VirtualList carrying
**331,582 px** of overflow, the largest list on this profile — VOIDed on its first run for an
INSTRUMENT reason: `flashcards` had no `progress` receipt, so the leg keyed on `cyclesDuring`,
and a scroll load's own span (91 x 20 ms ≈ 1.8 s) against its 3 s re-arm interval can never show
a whole cycle inside a ~1.8 s gesture — `0 cycle(s)` on both legs while `last` read `scrolling
flash-group-body-vlist over=331582`. That is correction 33's shape, one spec over. Fixed once for
all six `scrollAll` specs (flashcards, library, immersion, novels, notebook, statistics) with a
shared `scrollProgress` = the load's own tick counter; 17 probe lines. The idle half of that first
run was already clean: heavy max 10.5 ms, drag/resize/theme mainMax 10–12.3 ms, over100 0. Its
ceiling leg carried one 952.7 ms machine stall, stamped as environment by the runner itself.
**Media:** the `video` heavy leg can no longer arm at 1080x679 — both `.mc-video-empty` shelves
read 0 px of overflow where every banked run swept 637–639 px — because bullet 2's own repair
`4d6a7ce7` turned the stage into a grid stack that no longer clips the shelf. Right fix, dead
fixture; the spec needs a different load, and that is instrument work named here, not done. The
banked media surface that still arms is `music` (its own window, `cat7-l8-music.json`); see the
lines below for what it and the flashcards re-run produced.

**All three clauses, measured under load, same session, strict OFF, ceiling clean on every run:**

| `--surface … --under-load` | drag under load | resize under load | work across the gesture | heavy leg (main) | control |
| --- | --- | --- | --- | --- | --- |
| dictionary (search every 700 ms) | p50 16.7 / p95 16.8 / max 17.4, over100 0, mainMax 12.0 | p50 16.7 / p95 16.8 / max 17.1, over100 0, mainMax 12.1 | 3 searches / 3 searches | max 9.0 ms | 12 over 100, p95 100.3 |
| flashcards (VirtualList, 331,582 px) | p50 16.7 / p95 16.8 / max 17.7, over100 0, mainMax 12.6 | p50 16.7 / p95 33.0 / max 33.5, over100 0, mainMax 12.1 | 91 ticks / 91 ticks | max 8.2 ms | 13 over 100, p95 117 |
| music (four sort modes cycled, own window) | p50 16.7 / p95 33.5 / max 50.2, over100 0, mainMax 10.7 | p50 16.7 / p95 18.2 / max 50.1, over100 0, mainMax 12.0 | 48 sorts / 48 sorts | max 7.8 ms | 12 over 100, p95 116.9 |

**PASS 10/10, PASS 10/10, PASS 10/10** — no findings, no voids, `closedLoop` true on every leg,
every load restored what it touched (`restored recent`, `restored to 0`, entries painted). The
first flashcards and music runs VOIDed on the receipt gap above and their idle/heavy halves were
already clean; the re-runs are the numbers in the table. The p95 33 ms readings are one dropped
frame per two at a 16.7 ms ceiling, under the runner's 2x bar and matching what the same
surfaces read IDLE in `cat7-flashcards-perf.json` (resize p95 33.4) — the load did not move them.
Windows opened for the runs (Library, Flashcards, Music) were closed through their own `×`; the
Media window was navigated Library → Music → Library and back; `jp-lq-strict` removed and the
shell reloaded. The banked JSONs live outside the repo this time
(`%LOCALAPPDATA%\Temp\claude\…\scratchpad\cat7-*-underload*.json`, `cat7-dictionary-readworker.json`):
the receipt is this section plus the re-runnable commands, not another 500 lines of evidence.

**L11 bullet 3 CLOSES.** Left open and named: (1) `initYomitan → loadAllIndices` still parses
162 MB of legacy JSON synchronously on main at BOOT (plain node: 3.5 s read + 1.7 s parse before
the merge), a startup block that is not this bullet's question; (2) the `video` heavy leg needs
a load that exists post-`4d6a7ce7`; (3) every non-scroll, non-dictionary, non-music spec still
lacks a `progress` receipt and will VOID under load exactly as flashcards and music did first —
the fix is one line per spec, naming the load's own tick counter.

## 2026-09-01 (night) — L11 bullet 4, clauses 1-2: blur fallback and GPU-loss recovery

Bullet 4 is `Blur fallback, GPU-loss recovery, multi-monitor, restart persistence, and
long-session memory checks` — five clauses. Two are closed here with live evidence and
controls; three are untouched and the bullet stays **open**. Saying which is the point.

**Clause 1, blur fallback — `24f7dfc4`.** Two defects, one root. (a) The OS preference
`prefers-reduced-transparency` (Windows' Colors > "Transparency effects") had exactly ONE
reader in the app, `views/mediaCenter.css:6792`. Measured through the bridge's `/emulate`
(CDP `Emulation.setEmulatedMedia`, so `matchMedia` genuinely flips): turning it on took
Media Center's blurs 24/18/22px → `none` — the positive control that the query re-evaluates
at all — while `--lq-liquid-blur` 8px, `--lq-ambient-blur` 6px, `--glass-blur` 8px,
`--blur-md` 6px, `--lq-liquid-saturate` 1.25 and the painted `.os-taskbar`
`blur(8px) saturate(1.25)` over `color(srgb … / 0.72)` were byte-identical. This is the
transparency half of the pair `liquid-tokens.css:215` already fixed for MOTION.
(b) The in-app `off` removed only the BLUR — `styles.css:1321` drops it with `!important`
while `--glass-tint` stayed at 72%, i.e. a *sharply* see-through taskbar, which
`mediaCenter.css:6812` calls the worst of both. AFTER: 0px/0px/0px/0px, saturate 1, tint
`#1a1823`, taskbar `blur(0px) saturate(1)` over opaque `rgb(26, 24, 35)`; clearing the
emulation returns every value.
**SPECIFICITY WAS LOAD-BEARING and the first version was wrong**: a bare `:root` is (0,1,0)
and loses to `[data-perf='performance']` (0,2,0), which sets this very ladder — `--glass-blur`
stayed 8px. Qualified on `[data-display-transparency='full']` it is (0,2,0) and last.
MUTATION CONTROL, in the live renderer via CSSOM: deleting exactly the 2 rules (scoped by
token name so Media Center's is not taken) returns 8px/6px/72%/1.25/8px/6px; re-inserting
restores them identically.

**Clause 2, GPU-loss recovery — `df9d9a71`.** `theme/perf.ts` is a saved user preference with
NO hardware detection (default `performance`), so a machine on a software rasteriser still
asked for 8px of blur everywhere and a GPU-process death changed nothing. The only
GPU-adjacent code in main was `main.ts:708`'s `render-process-gone` log — a different process.
`theme/gpuFallback.ts` writes `data-gpu` = `software` (SwiftShader / WARP / Basic Render
Driver, matched on the unmasked renderer string) or `lost` (`webglcontextlost`); perf.css and
liquid-tokens.css flatten the same tokens with the same opaque values — the 4th and 5th
triggers to reuse them. LIVE, on the real `WEBGL_lose_context` against the real shipped
detector, on a machine reporting a healthy `ANGLE (AMD, AMD Radeon 780M …, D3D11)`:
HEALTHY `data-gpu` null / 8px / 6px / 8px / 72% tint → LOST (`isContextLost()` true) all three
blurs **0px**, tints `#1a1823`, taskbar painted opaque `rgb(26, 24, 35)` → RECOVERED
(`restoreContext()`) every value back, `roundTripClean: true`. Reversibility only works
because the handler `preventDefault()`s the loss event; without it `webglcontextrestored`
never fires and the app degrades permanently on the first blip.

**THE INSTRUMENT WAS BLIND, which is why both went unnoticed.** `liquidTokens.test.ts` derives
degradation triggers from `[attr]`/`.class` qualifiers on the ROOT, so a trigger the PLATFORM
owns has no qualifier and cannot be seen. The new block parses `@media` conditions by brace
matching. TEST CONTROL: rewriting only the condition to a name nothing answers fails 3 of the
new cases; both sheets restored sha256-identical.

**A NUMBER THAT GOES AGAINST THE FIX, measured not estimated.** Every trigger in this app —
all five now — grades TOKENS. Across all 15 CSS files that paint glass: **66 backdrop-filter
declarations are token-driven and therefore reached; 88 are hardcoded pixels and are reached
by NOTHING** (31 more are an explicit `none`). So 57% of the app's painted glass still ignores
transparency-off, battery, high-contrast, Aero safe mode, the OS preference and GPU loss alike.
By file: `styles.css` 38, `aero-shell.css` 14, `readingGarden.css` 6, `aero-apps.css` 5,
`mediaWorkspace.css` 4, `mediaCenter.css` 4, `readingLens.css` 3, `scraper.css` 3,
`wired-shell.css` 3, `shell.css` 2, `multiMonitor.css` 2, and 1 each in
`lensClipboardPassage.css`, `mediaLibrary.css`, `blanc.css`, `readingGardenPhaseGallery.css`.
perf.css's own comment called this "a known remainder, not a claim"; this is the count it never had.
**Deliberately NOT fixed with a `:root[state] * { backdrop-filter: none !important }` catch-all**,
even though `perf.css` battery already uses that shape for animations: those 88 surfaces carry
hardcoded `rgba()` backgrounds too, so removing only their blur would manufacture the exact
"unblurred but see-through" state clause 1 exists to prevent, on 88 surfaces at once. It needs
the tint converted per surface, which is a slice of its own, not a tail-of-turn edit.

**NOT DONE, and bullet 4 stays open on them:** multi-monitor (needs a second display this
machine does not have; `f5b664ff` and L4's 2026-08-22 detach/reopen run are prior art to
re-derive against, not inherit), restart persistence, long-session memory. RULE C: 0 of 16
cells banked for this bullet — no rubric surface was scored, and none is claimed.

## 2026-09-01, late night — L11 bullet 4, clause 1: the hardcoded half of the blur fallback

`b3b1cc07`. The previous entry ended by naming its own biggest finding: every one of the six
"stop painting translucent material" triggers grades TOKENS, so a rule that writes literal
pixels answers none of them. That number is now re-derived mechanically rather than by grep
(`debug/_bf-count.cjs`, RULES not declarations, `-webkit-` twins not double-counted): **35
token-driven, 61 hardcoded, 17 `none` resets — 64%**, not the 66/88/57% the last entry
estimated from a declaration grep. The correction goes against nobody; it is the same defect,
counted properly.

`theme/flatten.ts` ORs the six states into one derived `data-lq-flat` attribute. A
MutationObserver on the six root attributes, not six change events: they are written by
`theme.ts`, `perf.ts`, `displayPrefs.ts`, `gpuFallback.ts` and the Aero safe-mode settings,
several during their own boot, and no two share an event. `theme/flatten.css` carries the 60
product conversions (the 61st is a dev-only harness sheet, named and exempted in the test).

**Four treatments, because the wrong one manufactures the defect clause 1 exists to prevent.**
MATERIAL composites the authored tint over an opaque base; SCRIM drops only the blur where
seeing through is the point; OPAQUE TINT takes the surface's own colours to alpha 1 where the
backdrop is app-drawn imagery (a poster, a video frame, the garden canvas) and no theme colour
exists to composite against; BLUR-ONLY where the stack already ends opaque or the tint is the
token ladder.

**Why not the catch-all, measured rather than argued.** `perf.css:46` already IS
`{ backdrop-filter: none !important }` over 18 enumerated selectors, touching no tint. With
`data-perf='battery'` set and flatten.css disabled, `.widget-frame` paints `none` over
`color(srgb …/0.72)` — blur gone, transparency kept: the sharply see-through panel
`mediaCenter.css:6812` names, shipped, in the tree. It was the mutation control that found it.

LIVE, running renderer, 16 probe surfaces built with their real ancestor chains (`--mini-surface`
on `.mini-shell`, `--lock-surface` on `.lockscreen`, `--lens-bg` on `.lens-root` are inherited —
a flat probe measures `rgba(0,0,0,0)` and lies). `data-perf` performance -> battery flipped
`data-lq-flat` false -> true; all 14 glass surfaces went blur(4..22px) over a translucent tint
-> `none` over an OPAQUE base (`--panel` rgb(26,24,35) / `--bg` rgb(13,12,18)) with the authored
tint intact as a gradient layer. The 2 SCRIMs kept their authored alpha byte-identical and lost
only the blur. Both negative controls (`.fwin`, which has no hardcoded blur; a class with no
rules) unchanged. MUTATION CONTROL: disabling exactly the one sheet carrying `[data-lq-flat]`
rules, attribute still set, returned 12 of 14 to byte-identical pre-flatten values — the 2 that
did not are the two `perf.css` half-handles, which is how the above was found. Re-enable +
restore `data-perf`: **16/16 byte-identical**, probe host removed, nothing persisted.

`flattenCoverage.test.ts` (17 cases) re-derives the census FROM the sheets every run, so a new
hardcoded rule fails the suite. Positive control (>40 rules, `.dict-popup` present) and mutation
control (deleting one conversion is detected, and only that one).

TRAP for the next worker: `stripComments(css)` inside a `while (re.exec(...))` condition
re-allocates the whole sheet per rule — 6 GB across styles.css, and vitest dies with a V8 heap
OOM that reads like a runner fault, not a test bug.

**Bullet 4 still OPEN.** Clause 1 (blur fallback) and clause 2 (GPU-loss recovery) are closed
with controls. Clauses 3-5 untouched: multi-monitor, restart persistence, long-session memory.

## 2026-09-01, late night — L11 bullet 4, clause 4: restart persistence, measured across a real kill

No product defect found, and that is the result: the clause PASSES. Recorded because an
unmeasured clause and a measured-clean one are not the same thing, and this bullet has three
clauses left that nobody should re-measure by accident.

METHOD, through the product's own paths only — no probe wrote to the store. Opened a Liquid-
capable window with `os:open`, then ran `os:window`/`togglePresentation`, which is exactly what
`keyboardShortcuts.ts:1541` reduces the palette command to. Then **SIGKILL, not a graceful
quit** (`Stop-Process -Force` on the Electron main and its forge parents), so the test cannot
pass on state flushed during shutdown; then `npm start` again, new pid 51880.

  standard    on disk: {"id":"dictionary","section":"dictionary",x:60,y:24,w:820,h:580,z:12,
                        visible:true,maximized:false,pinned:false}
  liquid      on disk: + presentation {v:1, mode:"liquid",
                        standardRect:{x:60,y:24,w:820,h:580}, standardMaximized:false}
  after kill+restart:  rendered `data-presentation="liquid"`, and the persisted window
                       **byte-identical** to the pre-restart JSON.

DISCRIMINATING CONTROL: the same comparison against the PRE-toggle blob returns **false**, so
the reader can tell the two states apart and "identical" is not what it says about everything.
REVERSE TRANSITION: `togglePresentation` again returned the persisted window byte-identical to
the pre-toggle standard blob — reversibility survives the restart, which is the half a
persistence test usually skips.

The OTHER host was measured by the same kill without being set up for it: `lq.reader.presentation`
in renderer localStorage came back holding `book` and `manga` at `mode:"liquid"` with
`standardRect {x:320,y:86,w:1280,h:860}` — the real OS rect, i.e. NOT the `{x:0,y:0,w:1,h:1}`
that `liquidWindowPresentation.ts:80` records as having once reached the store. Pre-existing
user state, left exactly as found.

NOT measured, named rather than implied: the pop-out host (`popoutPresentation.ts`) — its key
was absent because no pop-out was open, and opening one to create state would have measured my
own fixture rather than a restart.

TREE RESTORED: `desktop-layout.json` is byte-identical to the 4,824-byte copy taken before the
slice (`debug/_layout-BACKUP-20260901.json`), globalZTop included. The window was closed through
`os:window`/`closeAll`; nothing of mine persisted.

TRAP: the restarted app took **60 s** to write `debug/bridge.json` and reused **the same port**
(39273) with a new token, so a restart-wait keyed on the port never fires. Key on the pid.
