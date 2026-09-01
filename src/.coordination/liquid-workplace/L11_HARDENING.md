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
