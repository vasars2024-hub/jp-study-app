# L7 — review and learning loop

Log for `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §11 / L7. Order: Flashcards → Anki → Notebook →
Statistics → Calendar → Games. Gate: timing-sensitive input and study state do not shift.

## 2026-08-26 23:13 EDT — Flashcards opens; contextual mode chrome, fixed review geometry

**Both L7 bullets remain OPEN; Flashcards is 1 of 6 apps.** The existing body is shared by Study
OS and Blanc, so shell branching inside it was rejected. Four mode launch rows and the two mode
navigation rows now use `ContextualSurface`: inert in conventional/Blanc hosts, painted only under
the sanctioned Liquid presentation seam. Dense deck import, CSV editor, virtualized rows, review
card, and grading buttons stay outside it.

Live overview, Liquid, real data: **2 contextual regions**, both on the shared primitive; header
background alpha **0.72**; active EPUB deck count **3,218**; import panel outside contextual
material. Standard mode uses the same DOM and the primitive paints nothing there.

**Active-review round trip, no grade written:** started the real 3,218-card queue and toggled
Liquid → Standard → Liquid. All three snapshots: word `攻撃`, progress **0 / 3,218**, card rect
**x137 y360 724×360**, actions rect **x137 y740 724×49**, and **0** contextual descendants in the
review. That is L7's fixed-task invariant measured rather than inferred. `Exit` is the reverse path.

Guard `flashcardsLiquidRegions.test.ts`: **3/3** — all six contextual wrappers present, review owns
none, and dense import/editor/list regions stay outside. Checkpoint containing this entry.

## 2026-08-26 23:26 EDT — Flashcards categories 1 and 3 score 20/20

**Flashcards remains 1 of 6 apps; both L7 bullets remain OPEN.** The two reusable category
harnesses found one product defect and two instrument defects; no surface-specific probe was added.

- Category 1: **PASS 10/10**. **342** text owners, minimum **5.01:1**, **99** controls,
  **0** effective hit areas below 32px, **0** WCAG 2.5.8 failures, **0** unreachable controls,
  and reduced motion **57 → 0 → 57**. The control moved all five signals and restored them.
- Category 3: **PASS 10/10**. **15** Work regions, **0** on translucent material; **2/2**
  contextual regions treated and **2/2** use a shared primitive. Controls made **1/15** and then
  **15/15** Work regions translucent, then restored **0/15**.

Product repair: Flashcards compact controls now own 32px pointer footprints; the nested folder
delete pseudo-button became two sibling native buttons. The live count fell **77 → 0** undersized
effective targets and the adjacent remove failure fell **1 → 0**. Review geometry remains unchanged.

Harness repairs, each one attempt: category 1 now preserves alpha while compositing translucent
ancestor stacks (the old code stopped before the opaque card); category 3 treats `style=null` and
React's equivalent empty style attribute as the same restored state. Focused guard: **4/4**.

## 2026-08-26 23:29 EDT — Flashcards category 2 passes; category 4 stays open

Category 2 is **PASS 10/10**: EPUB → Dictionary cost **1 click** in both Standard and Liquid,
**0** dead ends, modal traps, scroll traps, or acknowledgements over 100ms; worst renderer latency
**12.1ms**. Undo restored state hash `1hrek7n`; the control moved **0,0,0 → 1,1,22 → 0,0,0**.

Category 4 is **FAIL / 0**, after the one repair pass allowed this turn. Reflowing the 24-card
preview as a grid removed the horizontal scroller at default and maximized sizes; container-query
layout changed compact clipping **3 → 0** and hidden-overflow owners **19 → 1**. Exact remainder:
compact `.flash-group` is **180 > 174px**, and dominant content falls **13.0% → 6.8%** when maximized.
The negative clip control moved **0 → 1 → 0** and all three size legs restored geometry. Next turn
opens by resolving those two measured residuals with this same category-4 harness, not a new probe.

## 2026-08-26 23:53 EDT — Flashcards category 4 passes 10/10

Category 4 is **PASS 10/10**, taking Flashcards to **40/80**; both L7 bullets remain OPEN. At
820×580 / 260×170 / 1264×765 the shared harness measured **0/0/0** clipped elements, overlaps,
horizontal scrollers, and hidden-overflow owners. Dead region was **8.4 / 0.7 / 11.0%**; chrome
fell **5.7 → 4.3%** while the visible work viewport grew **93.7 → 95.3%**. All size legs restored.

Product repair: the compact group header now wraps its fixed count badges; `.flash-group` fell
**180>174 → 174=174**. Instrument correction 17 replaces a false deepest-leaf comparison: it had
called the default contextual action row (13.0%) and maximized import row (6.8%) the same
"dominant content". The rubric asks for content-to-chrome, so the parameterised harness now uses
the clipped work viewport beside its independent chrome measure. Negative controls held: injected
clip **0 → 1 → 0**; 200×140 produced **2** clips, **2** scrollers, **10** hidden owners, then restored.
Focused guard: **4/4**. Baseline: `cat4-l7-flashcards.json`.

## 2026-08-27 00:40 EDT — Flashcards category 6 passes 10/10

Category 6 is **PASS 10/10**, taking Flashcards to **50/80**; both L7 bullets remain OPEN.
This was a RUN of `cat6-feature-parity.cjs`, not a new probe — what was missing was the spec,
which is data. `flashcards` is now the eleventh app in `l6-parity.js`: **8 feature rows**,
5 steps, 8 mutations.

Numbers: parity **8/8 standard = 8/8 liquid**, `na` 0, rows agree by id. Round trip
standard → liquid → standard on a live 3,218-card deck held **byte-for-byte**, 0 diffs,
fields and shell both, at 820×580 in both presentations. Control: **8 of 8 mutations flipped
exactly their own row and restored**, verdict `CONTROL FAILED AS REQUIRED`. Drive:
`EPUB decks (3,218)` → search `の` (2 groups) → clear → scroll 240 of a 331,582px range.

**The driver's `dirtyField` empties this surface.** It takes the first visible text field,
which here is `.flash-search-input`, and writes `lqp-roundtrip-食` — matching nothing, so
`filteredDeck` goes to 0 and every group unmounts. A spec scored after it reads six rows false
on a healthy deck. `clearSearch` in the drive is the sanctioned answer; scroll then carries the
round trip's real user state.

**Three authoring passes on one row, all the same defect wearing different clothes — the plant
must attack the term the row scores.** `virtualizedList` first asked `span > clientHeight`,
which a 24px spacer still satisfies at 1,728 over a 420px pane. Then it asked the right
arithmetic but picked `sort(scrollHeight)[0]`, so shrinking the 3,074-card body dropped it
below the untouched 144-card one and the row measured *that* instead — `ratio=1.001`, reachable
true, control VOID a second time. It now scores **every** expanded body, so nothing can be moved
out from under it. Third pass: reading `.flash-group-count` made it share an element with
`bookGroups`, whose mutation then failed both rows and proved neither; size now comes from
`aria-setsize`, which `VirtualList` publishes independently on every item.

Row evidence at PASS: All **3,218** = Unfiled 3,218 + folders 0; group badges **144 + 3,074 =
3,218**; both bodies render **16** rows at pitch **108** over scroll ranges **15,562** and
**332,012** against expected 15,552 / 331,992 (ratio 1.001 / 1.000). Baseline:
`cat6-l7-flashcards.json`.

## 2026-08-27 01:05 EDT — Flashcards category 5 passes 10/10, after a product fix

Category 5 is **PASS 10/10** — all ten questions YES — taking Flashcards to **60/80**; both L7
bullets remain OPEN. Only categories 7 and 8 are left. Control: `CONTROL FAILED AS REQUIRED on
Q2, Q3, Q5, Q10`, plant residue **0**, disclosure store byte-identical before and after.

**First score was 9/10 and the failing question was real.** Q4 asks for at least one collapsed
disclosure and no more than 12 controls to scan; the overview had **0 disclosures and 10 scanned
controls**, seven of them launchers competing in one row — Simple EPUB mining, Advanced EPUB,
Jiten vocab, CSV tool, AI card studio, Ask the Agent, Review dictionary. The first thing the
window asked of a user was to read seven buttons and work out which one meant "start".

Fix: the two the overview is actually for stay out; the five specialist entries move behind one
`<details className="flash-more-tools">`. Nothing removed, disabled or renamed; `<details>`
carries the keyboard and screen-reader semantics natively so nothing re-implements them, and
the summary keeps the 32px pointer footprint the rest of the surface owns (measured live at
**35px**). Q4 re-measures **1 collapsed disclosure / 5 scanned controls**. `Jiten vocab` was a
raw JSX literal and is now `flash.jitenVocab` in all four catalogs, with `flash.moreTools`.

**Instrument correction — Q10 could not be falsified on this surface, and the reason was a real
blind spot.** The card-host scan kept only the most uniform host, ties going to document order.
`div.flash-strip` carries 24 identical cards at uniformity 1.00 with one signature, so it held
the slot; the control's six-signature plant tied rather than beat it and the run went
CONTROL-VOID. As an instrument that is worse than a control artefact: a real dashboard beside a
legitimate gallery is invisible, because the gallery earns the exemption on its behalf. Every
qualifying host is now reported and the worst one decides. Flashcards reads two hosts —
`div.flash-view` 0.20/5 and `div.flash-strip` 1.00/1 — **dashboardHosts 0**, so the YES is now
earned by both rather than granted by one.

Q5 swept **338** text runs per theme, 0 failing, min ratio **5.02** (forest-night) and **5.71**
(classic-light) against a 4.5 bar. Baselines: `cat5-l7-flashcards.json` and `-control.json`.

## 2026-08-27 01:35 EDT — category 8 is UNMEASURED, and the reason is a product gap

Category 8 ran and returned `UNMEASURED - statesNamed`, which is **not** a score and is counted
in units-left, never dropped. Flashcards is **60/80**; only categories 7 and 8 are open.

What the run did establish, all as numbers: raw i18n keys **0**, placeholders **0**, worst mute
pair count **0**, and the drive leg passed its own `surfaceChanged` and `restored` gates — so
typing into `.flash-search-input` genuinely does filter this surface. What it could not
establish is `statesNamed`, because **0 of the four states are observable**: empty, loading,
error and offline all report `hosts: 0`.

The cause is product, not instrument. `cat8-honest-states.cjs:310` finds an empty state by
`[class*="empty"],[class*="placeholder"],[class*="no-results"]`, and this surface's deck-list
empty state is `FlashcardsContent.tsx` `<p className="muted">{t('flash.search.noMatches')}</p>`
— an unmarked muted paragraph. The surface already has the right pattern and does not use it
here: `.flash-empty` (with `.flash-empty-emoji`) is what review mode renders. So the deck list's
two empty states — no search matches, and no cards in view — are the odd ones out.

**Exact next slice**: give both deck-list empty states the surface's own `.flash-empty`
treatment (and drop the decorative emoji per the repo's chrome rule while touching it), then
re-run `cat8-honest-states.cjs --surface "Flashcards" --label l7-flashcards --drive-input
".flash-search-input" --drive-value "zzqqxx"`, which should then observe `empty` and score
`statesNamed`. Add `--langs` and `--control` for the required legs. Category 7 is the other open
cell; carry `l0-ms-are-a-different-display` and the environment-ceiling correction into it.

Regression checks after the category-5 product change, both re-run and both still clean:
category 4 **PASS 10/10** and category 1 **PASS 10/10**.

## 2026-08-27 02:20 EDT — Flashcards category 8 passes 10/10, on a product fix and a harness repair

Flashcards is **70/80**; only category 7 is open.

**Product.** Both deck-list empty states were a bare `<p className="muted">` — invisible to any
`[class*="empty"]` sweep, and, more to the point, a dead end: the list told the reader which
filter had emptied it and gave them nothing to press. They now render the surface's own
`.flash-empty` treatment (`flash-empty-inline`, because the base rule's `margin-top: 10vh`
pushes a message out of a list slot) with the undo for the filter that emptied them — `Clear
search` when a search is active, `Show all cards` when a folder filter is. One new key,
`flash.deck.showAllCards`, in all four catalogs.

**Score, `baselines/cat8-l7-flashcards.json`, PASS 10/10 with the control and the four-language
leg both run** — the first cat8 run in this repo to include `--langs`. Raw i18n keys **0** as
the max across all four languages (not just English, which is what `--langs` upgrades),
placeholders **0**, worst mute pairs **0**, `statesNamed` **1 of 1 observable** — `empty` is now
observable at `hosts: 1` where it was 0, and its message is real text. Four distinct text hashes
over 338 text runs, so the surface genuinely re-renders per language. Control moved all three
counted bars 0→1 and restored 0.

**Trap 1 — a title-named surface cannot be found in any language but English.** `--surface
"Flashcards"` matches on `.fwin-title-text`, which is translated, so the language leg VOIDs on
the second tag. Run a translated-chrome surface by the `@` selector form instead:
`--surface "@.fwin:has(.flash-view)"` names the window by the thing that makes it that window.
Same element, same scope, no harness change.

**Trap 2, and it is the expensive one — that VOID used to strand the whole app in Japanese.**
`langLeg()` returned on refuse *before* its restore, and nothing about the result reads as probe
residue: the next run captured `ja` as `before.stored`, restored to it faithfully, and printed
`restored: true` on a language the user never chose. The restore is now in a `finally`
(correction 15). Proven by re-running the exact VOID that caused it: same
`VOID - language leg: ja: surface not found: Flashcards`, and `localStorage.ui-lang` afterwards
is **`en`**, where an hour earlier it was `ja`.

Next: category 7 on Flashcards, the last cell. Carry `l0-ms-are-a-different-display` and the
environment-ceiling correction into it.

## 2026-08-27 03:05 EDT — Flashcards category 7 passes 10/10. The surface is 80/80.

`baselines/cat7-flashcards-perf.json`, scene **2 desk windows / 557 elements in the matched
`.fwin`**, uptime **26,286 s** (the rubric's settled-process requirement), ceiling **p50 16.7 /
p95 16.8, 0 frames over 100 across all three readings** — a clean environment, so nothing here
is scored against a stalling machine.

| leg | p50 | p95 | max | >100 ms | main max |
| --- | --- | --- | --- | --- | --- |
| drag | 16.7 | 16.9 | 17.0 | 0 | 9.9 |
| resize | 16.7 | 33.5 | 66.8 | 0 | 12.5 |
| theme swap | 16.7 | 16.8 | 16.9 | 0 | 19.4 |

Heaviest real operation, **scroll the whole deck**: main p50 **2.3 ms**, p95 **3.2**, max **9.8**
over a **3,029 ms** span against a declared 3,000 — so the leg covered its own load — versus an
idle p50 of 2.4 / max 7.3 taken after it. The virtualised deck body churns without touching main.
Control: `-Jank` produced **12 frames over 100 ms** against the clean run's **0**.

The spec is ~10 lines of data, per RULE 1. No new probe.

**The trap, and it VOIDed a correct leg before it caught anything real.** `scrollAll` chooses its
scroller by LARGEST OVERFLOW; `document.querySelector` returns DOM ORDER. On Flashcards those are
different nodes — two `.flash-group-body-vlist` bodies, the 15,142 px one first in the document
and the 331,582 px one second. A proof written as a re-query read the untouched scroller, answered
`scrollTop 0`, and VOIDed a leg that had scrolled the right element to 21,600 px. The receipt now
comes from the load itself (`window.__lqScrollLoad`, cleared before any refuse so a stale record
cannot vouch for a load that never armed) and the bar is the furthest point REACHED, not the
resting position — a virtualised body's `scrollHeight` shrinks as rows unmount, so the browser
clamps the final `scrollTop` well below where it was driven. This run's receipt: *scrolled
flash-group-body flash-group-body-vlist to 21600 px over 91 ticks (overflow 331582)*.

**Owed to the next worker, stated rather than buried:** `library`, `immersion` and `novels` all
use `scrollAll` and NONE of their committed baselines carries a receipt, because `proof` did not
exist for them. All four now declare `scrollProof`. Their heavy legs are very likely fine — the
mechanism was proven correct here, on the surface where the two selectors disagree — but "likely"
is not this rubric's currency, and re-running those three legs is cheap the next time each surface
is open.

## 2026-08-27 03:35 EDT — Anki opens, second of L7's six. And its connected half is unscorable here.

Migration, per L7's own two bullets: **context and preview take Liquid, the work does not.**
`AnkiView`'s head — intro line plus the one Recheck transport action — is now
`<ContextualSurface className="view-head">`, matching the four Flashcards heads. `AnkiCardPreview`
is a *preview*, which L7 names explicitly, so both of its branches (populated and empty) are
`ContextualSurface as="aside"`; the `<aside>` landmark is kept, because it is how the preview is
reachable without sight. Everything dense stays on its opaque anchor: the deck/note-type binding,
the field-mapping editor, the note CSS editor, the manual-card form and the deck workbench.
`AnkiContent` is shared with Blanc and gained nothing — no shell branch, no `lq-liquid`.
`ankiLiquidRegions.test.ts`, 4 cases, guards all of that including the two negative halves.

**Live, through the bridge, on a third window opened from Start:** `.anki-view .view-head` carries
`lq-contextual` and `data-lq-role="contextual"`. Verified as landed, not assumed.

**And the honest half. The preview region was NOT verified live, and Anki's rubric cells cannot be
scored on this machine.** The surface reports *"Not connected to Anki."*, so the entire connected
branch — deck/note-type, field mapping, note CSS, manual card, and the preview pane, which returns
`null` at `fields.length === 0` — never mounts. `anki-card` count on screen: **2**,
`.anki-workspace`: **0**, `aside.card-preview`: **0**. AnkiConnect does not answer on 8765, and
**Anki desktop is not installed** at any standard path (checked `%LOCALAPPDATA%\Programs\Anki`,
`%ProgramFiles%\Anki`, `%ProgramFiles(x86)%\Anki`; no `anki` process). No agent can install a
third-party desktop app and point it at the user's real collection.

So the preview's two branches rest on the test and the source this turn, and say so. Recorded in
`needs-user.md`. What IS scorable without Anki, and is the next slice: the disconnected branch plus
`DeckWorkbench`, which `AnkiView` mounts *outside* the connected branch precisely because three of
its four sources need no Anki running.

## 2026-08-27 04:55 EDT — Anki category 1 PASS 10/10, and the harness had been measuring 11 of 83 controls

**The harness repair came first, because without it the score was a lie by omission.**
`l1-hit-area.js` opens every `<details>` before it walks — a control inside a closed one still
reports a rect, fails every hit test and is filed `occluded`, unscored. But `<details>` is not how
this app ships disclosure. `CollapsibleSection.tsx` is a `button[aria-expanded][aria-controls]`
whose body is **unmounted** while closed, and `AnkiView` mounts the whole `DeckWorkbench` inside
one. First run: `disclosedForRun: 0`, **25** text nodes, **11** controls, and a clean sheet on a
population missing an entire application.

Why the fix is in the DRIVER, not the probe: **React does not flush the click synchronously here.**
Measured on this surface — `b.click()` then re-counting inside ONE `/eval` returned 11 → 11 → 11.
The body only exists on a later task, so opening and measuring cannot share an expression. Recovery
caught the first fixed 250 ms settle reading **24** controls while the later hit leg found 76; the
repaired driver waits for a generic DOM plateau and now reads **161** text / **83** controls / **76**
walked on two fresh runs. It restores only disclosures it opened, leaving pre-opened ones intact.

The restore runs on the way out of *every* branch (`bail()`), because `refusing-leg-strands-app-state`
already happened here once: cat8's language leg refused before its restore, left the app in
Japanese, and the next run captured that as the user's own setting. `ariaRestored` is written into
the scorecard: `{clicked:1}` open, `{clicked:1}` closed.

**The one real defect the widened population did not hide — it was there at 11 controls too.**
`.anki-setup-actions .btn` measured rect **52x26**, pointer region **26.5**, the surface's only
below-floor control. It is the recovery action on the screen that says Anki is unreachable: the
retry that re-runs the check, and the Back that returns to the reader popup. Fixed with
`min-height: 32px` scoped to that row — `.btn.small` elsewhere is a secondary control beside a
full-size one and is untouched, which the test asserts as its negative half. hitMin **26.5 → 32.5**.

**Score, all four numbers and the control.** contrast min **4.94** (`p.anki-setup-msg`), **0**
failing of 161; targets `belowFloorByHit` **0**, stolen 0, occluded 0, smallest hit 32.0
(`button.fwin-b.lq-hit`); WCAG 2.5.8 fails **0**; keyboard unreachable **0** of 83; reduced motion
**74 → 0** over threshold, emulation took and released. Two hit-area runs agreed. **PASS 10/10.**
Control (`--control`): all five terms moved — contrast 0→1, rect under-32 5→7, 2.5.8 0→2, keyboard
0→1, `belowFloorByHit` **0→2** — and all five returned to baseline, rectDrift 0. Not a self-passing
probe. `baselines/cat1-l7-anki{,-control}.json`.

## 2026-08-27 08:40 EDT — Anki category 2 PASS 10/10 on the workbench entry path

Dominant task: open Deck Workbench from the disconnected Anki surface. It is the one action that
reveals the entire agent-reachable half without requiring AnkiConnect; the end-state inventory
therefore covers the workbench's loaded source rail and saved sessions, not an empty launcher.

Standard: **1 click**, worst renderer-received acknowledgement **12.7 ms**, dead ends **0**, modal
traps **0**, scroll traps **0**. Liquid: the same **1 click**, **10.2 ms**, no dead end. The window
returned byte-for-byte to Standard geometry **820x580**, and closing the disclosure restored the
surface-state hash. Cost parity is **1 <= 1**. Control moved all three terms exactly: dead end,
modal trap and scroll trap **0/0/0 -> 1/1/1 -> 0/0/0**. **PASS 10/10.** Evidence:
`baselines/cat2-l7-anki.json`.

Recovery caught the first control run leaving the workbench open: its injected dead-end task had
incorrectly inherited the dominant task's disclosure-closing undo. The reusable harness now gives
that sub-run no unrelated undo, then proves the real task+undo again. Live receipt after the rerun:
`expanded:false`, workbench absent, presentation Standard. This is the one category-2 repair.

One refused attempt is not hidden: selecting the fourth source after opening resolved below the
viewport and correctly refused as occluded. The scored task stops at the fully-loaded workbench;
the category's scroll-trap inventory measures that state, while source import belongs to its own
functional gates and is not manufactured through an off-screen synthetic click.

## 2026-08-27 08:45 EDT — Anki category 3 PASS 10/10, selective Liquid over the whole workbench

Measured with Deck Workbench open and its saved sessions settled: **91** classified regions and
**78** controls skipped as controls, not misclassified as surfaces. Role census: Work **5**,
Liquid-eligible **1**, Anchor **75**, Anchor(holds work) **10**, Ambient **0**.

Dense Work on translucent backing: **0/5**. The one eligible contextual region is treated **1/1**
and backed by the shared primitive **1/1**. The dense workbench, source rail, session list and
settings remain stable anchors; only the contextual head takes Liquid. Control blurred one runtime
Work region (**0 -> 1** failure), then all five (**0 -> 5**); all material signatures and counts
returned exactly to **0/1/1/1/5**. **PASS 10/10.** The harness drove Standard → Liquid and restored
Standard at **820x580**; the setup then closed only the workbench disclosure it found open.
Evidence: `baselines/cat3-l7-anki.json`. No product or harness change was needed.

## 2026-08-27 08:50 EDT — Anki category 4 FAIL 108 clips → PASS 10/10

First compact run at **260x170**: clipped **108**, hidden-overflow containers **2**. The workbench
owned 134px inside the frame, but its viewport media query still saw 1264px and retained the
two-column `200px + 2fr` grid. Long saved-session names then gave the off-screen detail column a
526px scroll width. Product fix: `.deck-workbench` is an inline-size container, the existing narrow
composition also runs as a container query, grid children keep `min-width:0`, and session names
wrap anywhere. Result: clips **108 -> 0**, workbench overflow **540>162 -> 0**.

The re-run retained one honest failure: `.set-profile-picker` was 170px wide while its shared
`.set-select` held a 200px floor beside an 18px gap; `.fwin-body` read **257>248**. Shared compact
fix: `.set-row` wraps and `.set-select` clamps its 200px preferred floor to 100%. It changes no
wide row and makes narrow settings stack instead of disappear behind `overflow-x:hidden`.

Final default / compact / maximized: clips **0/0/0**, overlaps **0/0/0**, horizontal scrollers
**0/0/0**, hidden overflow **0/0/0**, dead region **6.9/1.3/9.7%**. Chrome **5.7 -> 4.3%** and
content **93.7 -> 95.3%** as the window grows. Every size restored; injected clip fired
**0 -> 1 -> 0**. **PASS 10/10.** Sub-minimum 200x140 remains a reported negative (**2** hidden
overflow containers), outside the scored compact floor. Evidence: `baselines/cat4-l7-anki.json`;
`ankiLiquidRegions.test.ts` **6/6**.

## 2026-08-27 08:54 EDT — Anki reachable branch hardened; eight whole-surface cells remain PARKED

Categories 1–4 above are controlled measurements of the disconnected screen plus the complete
Deck Workbench, not certification of the unmounted connected branch. Anki desktop and AnkiConnect
are absent, so the connected deck/card/browser features cannot be inventoried or exercised. The
dashboard blocker remains the existing Anki + AnkiConnect install/run request; no duplicate was
added.

Therefore Anki remains **0 of 8 closed / 8 PARKED**. Category 5 is not run around category 6:
feature parity cannot honestly score until the connected feature inventory exists. Per the
human-blocked ladder exception, L7 advances to Notebook while retaining all eight Anki cells in
units-left. Reachable product work is checkpointed through category 4; no user data or setting was
changed.

## 2026-08-27 13:31 EDT — interrupted Notebook slice recovered; categories 1–6 are 60/80

HEAD had already banked category 6, while the crash left category 5's score/control untracked at
**8/10**: Q1 had **0** entry points and Q4 exposed **36** controls. Recovery kept Review Notebook
ahead of navigation and put stream/folder filtering behind one native disclosure. Final Q1 has
**2** entry points; Q4 has **1** collapsed disclosure and **10** controls to scan. The control
failed exactly Q2/Q3/Q5/Q10, then restored Standard, `forest-night`, and **0** plant residue.

The DOM change invalidated the earlier measurements, so categories 1–4 and 6 were re-run rather
than inherited. Expanding the disclosure first squeezed the timeline to 11px; its open height is
now capped at 220px. Compact **260×170** then exposed one real horizontal scroller
(`.gx-notebook-timeline` **286>202**), repaired by wrapping Live Captions actions/record metadata
and clamping lineage controls. Final category 4: clips/overlaps/scrollers/hidden overflow
**0/0/0/0** at default, compact, and maximized; dead region **3.4/0.4/10.1%**.

Controlled results: category 1 **10/10** (0 hit-floor failures, contrast min **5.30**, control all
five terms moved/restored); category 2 **10/10** (one click in Standard and Liquid, 0 dead/modal/
scroll traps); category 3 **10/10** (0 dense Work on glass, 3/3 contextual/shared); category 4
**10/10**; category 5 **10/10**; category 6 **8/8 = 8/8**, 0 round-trip diffs, all eight mutation
rows fell alone and restored. Notebook is **60/80**; categories 7 and 8 remain.

## 2026-08-27 13:40 EDT — Notebook category 8 PASS 10/10 after one clean restart

The pre-restart title-based language run was invalid: the shell title translated while a stale
hot-reload module graph left the body in English. After restarting only this worker's Forge tree,
the title form correctly refused at Japanese because `Notebook` itself had translated; the stable
surface selector `@.gx-notebook` is the parameter the shared harness already accepts.

Fresh-process score: raw keys **0**, placeholders **0**, unexplained disabled pairs **0**; the one
observable empty state is named **1/1**. English/Japanese/Chinese/Russian produced **4 distinct**
text hashes across **2,056** text runs each, with max raw keys **0**. Language restored exactly
`en → en`. Control moved raw keys/placeholders/mute pairs **0/0/0 → 1/1/1 → 0/0/0**. Notebook is
**70/80**; category 7 remains. Evidence: `baselines/cat8-l7-notebook.json`.

## 2026-08-27 21:36 EDT — recovered category 7 passes; category 1 is retracted, so Notebook stays 70/80

The interrupted tree held a complete category-7 RUN plus its product repair. Without row deferral,
two clean resize repeats failed at p50/p95 **33.4/50.2 ms** against the session's **16.7/16.8**
ceiling. `content-visibility:auto` on the 400 timeline records restored resize to **16.7/16.9**;
drag **16.7/16.8**, theme **16.7/17.5**, and heavy-scroll main max **14.4 ms**. The load scrolled
to **21,600 px**, restored to 0, and the jank control produced **13** >100 ms frames. Category 7
is controlled **10/10** in `cat7-notebook-perf.json`.

The repair changes the category-1 population, so its earlier 10 cannot be inherited. A fresh run
saw only **38** controls before deferred rows painted; the interrupted one-shot harness repair
revealed every row at once and then falsely reported **484/38 occluded**. Removing the repair and
restarting proved the old product at **459 controls / 0 unreachable / 0 pointer-floor failures**;
restoring row deferral is therefore an instrument boundary, not an accessibility score. Per the
one-repair rule, category 1 is **UNMEASURED**, not passed or failed. Next turn opens by teaching
the shared harness to reveal and restore one deferred record at a time, then re-runs category 1.
Notebook remains **70/80**: categories 2–8 pass; category 1 is the one open cell.

## 2026-08-27 21:56 EDT — one category-1 harness repair attempted and rejected

The property-driven repair revealed only the current `content-visibility:auto` ancestor and
restored its exact inline declaration. Its pointer leg improved from the interrupted **38 scored /
484 occluded** failure to **452 measured / 27 occluded of 479**, with **381** unique deferred
owners restored. The core leg still counted only **33/479 controls** and **117** text owners versus
the pre-deferral population of **459 controls / 2,062 text owners**. Its reported PASS was void.

The failed harness edit and overwritten baseline were restored; no score or product change was
banked. Per RULE 1, there is no second repair this turn. The next turn opens by falsifying the
core leg's assumption that `checkVisibility({contentVisibilityAuto:true})` becomes true after an
inline `content-visibility:visible`; it must retain one-record-at-a-time reveal and restoration.
Notebook remains **70/80**, category 1 UNMEASURED. Product source was impossible this turn because
the only open Notebook gate exhausted its one permitted harness repair and Statistics may not open
before Notebook closes.

## 2026-08-27 22:18 EDT — full population reached, but exact restoration failed

Live falsification isolated the boundary: an AUTO owner's own `checkVisibility` is true while its
descendants are false; inline `content-visibility:visible` makes those descendants measurable and
restoring the original attribute hides them again. A generic one-record-at-a-time repair then read
**2,056 text owners / 454 core controls** and **472/479 pointer controls**, with zero contrast,
keyboard, 2.5.8, pointer-floor, or theft failures. The control moved all five scored terms from
**0 → 1/2/2/1/2 → 0**.

The verdict is still VOID: the core receipt reported **0/381 owners restored** and inspection found
**382** empty `style` attributes. Those were removed live; final residue is **0** style attributes,
**0** inline content-visibility declarations, and timeline scroll **0**. The harness, delegated
probe, and overwritten baseline were restored byte-identical to HEAD under RULE 1. Notebook stays
**70/80**, category 1 UNMEASURED. Next attempt must remove the temporary property before removing
an originally-absent attribute, then assert the attribute remains absent after forced layout.

## 2026-08-28 09:10 EDT — interrupted restoration repair recovered and rejected

The crash left the shared core and pointer harnesses mid-edit. Completing that exact attempt again
reached **2,056 text / 454 core / 472 pointer-measured controls**, with all five control terms moving
**0 → 1/2/2/1/2 → 0**. Immediate receipts claimed **380/380** pointer owners restored.

The independent post-run check caught the false pass: **381** empty `style` attributes remained.
They were removed from a proven zero-style baseline; after 250 ms the live surface held **0** style
attributes, **0** inline content-visibility, scroll **0**, and its disclosure closed. Failed harness
and baseline files hash byte-identical to HEAD. Notebook remains **70/80**, category 1 UNMEASURED.
The next repair must assert restoration on a later renderer task, not in the same synchronous eval.

## 2026-08-28 09:28 EDT — Notebook category 1 PASS 10/10; Notebook closes at 80/80

The reusable harness now reveals one `content-visibility:auto` record at a time and preserves the
exact original `style` attribute. Delayed CSSOM drift was real (**381** core and **380** pointer
owners), repaired on the next renderer task, then remained exact at 30 ms and 250 ms. An independent
750 ms receipt found **0** style attributes, inline declarations, control residue, scroll, or globals.

Score: **1,260** text owners, minimum **5.30:1**, failures **0**; core controls **439**, WCAG 2.5.8
failures **0**, unreachable **0**; pointer controls **464**, measured **437**, below-floor/theft
**0/0**; reduced motion **11→0→11**. The control moved all five terms **0→1/2/2/1/2→0**.
Categories 1–8 are now controlled **80/80**. Next surface: Statistics.

## 2026-08-28 09:31 EDT — Statistics opens on the selective Liquid seam

The live **772×1,931** content surface has 13 metric cards, one chart, 19 per-title rows, and four
dense sections. Those remain stable opaque work. Only the intro/reset strip is contextual through
the shared primitive; it is transparent at Standard and owns one declared contextual region.
Container-scoped reflow follows the 820×580 floating window rather than the 1,264px desktop.

Live HMR receipt: contextual regions **1**, dense contextual regions **0**, header **772×35**,
Standard background transparent, container `inline-size`. Focused suites **15/15**. Next: categories
1–3 through the existing surface-parameterised harnesses; no Statistics-only probe was added.

## 2026-08-28 09:35 EDT — Statistics categories 1 and 3 PASS; score 20/80

Category 1 first found the only Statistics-owned target below floor: Anki sync **26.5px**. A scoped
minimum moved it to **32px**. Final: 99 text owners, minimum **5.30:1**; core/pointer controls
**10/10**, contrast/WCAG/keyboard/pointer-floor/theft failures **0**; motion **20→0→20**. The
five-term control moved **0→1/2/2/1/2→0**. **PASS 10/10.**

Category 3 classified **91** regions: Work **3**, Liquid-eligible **1**, Anchor **84**, Anchor holding
work **3**. Dense Work on translucent **0/3**; contextual/shared primitive **1/1**. Controls forced
one then all Work regions onto glass (**0→1→3→0**) and restored the material. **PASS 10/10.**
Evidence: `cat{1,3}-l7-statistics.json`. Category 2 remains open rather than scoring a fake task.

## 2026-08-28 09:40 EDT — Statistics compact reflow repaired; category 4 remains 0/10

The first reusable category-4 run found **12** clipped elements and one hidden horizontal overflow
at **260×170**. A container-scoped single-column repair reduced all four defect counts to **0** at
default, compact, and maximized sizes; the injected clip moved **0→1→0**, and the deliberately
subminimum **200×140** control still failed with **13** clips and one hidden overflow.

The category remains **FAIL 0/10** because the maximized window's measured dead region is **17.0%**
(bar ≤15%); default is **8.9%**, compact **0.5%**. The one harness repair allowance is exhausted.
Evidence: `cat4-l7-statistics.json`. Next category-4 pass starts on that exact maximized-width gap.

## 2026-08-28 09:48 EDT — Statistics category 8 remains UNMEASURED; unsafe drive retired

Passive evidence was clean but incomplete: **99** text runs; raw keys/placeholders/mute pairs
**0/0/0**; four languages produced four hashes and restored English; the negative control moved
all three defects **0/0/0→1/1/1→0/0/0**. No adverse state was observable, so the score stays 0.

One product repair now renders Anki sync busy/success as status, failures as an alert, and gives
every message a localized Close recovery. The attempted state drive was invalid: sync succeeded,
changed the surface, and its close did not restore the hash. It also imported **41,535** Anki-only
entries (**36,215/2,327/2,993**, manual **0**) into a pre-proven zero-count store. That exact key
was removed and verified absent; live counts returned **0/0/0/0**. Do not drive real sync again.
No baseline is banked. The next category-8 pass needs an isolated deterministic error state.

## 2026-08-28 09:55 EDT — Statistics category 6 PASS 10/10; score 30/80

The existing parity engine gained one Statistics spec, not a new probe. Eight rows cover knowledge,
level estimate, summary metrics, 14-day chart, books, show resume, reset recovery, and window
lifecycle. Standard and Liquid each reached **8/8**; a driven **320px** scroll and the **820×580**
shell survived Standard→Liquid→Standard with zero diffs.

All eight controls independently moved **8/8→7/8→8/8**, each dropping only its declared row;
restoration returned every detached node/attribute and the original scroll. **PASS 10/10.**
Evidence: `cat6-l7-statistics.json`. Statistics is now **30/80**.

## 2026-08-28 09:58 EDT — Statistics category 5 PASS 10/10; score 40/80

The first clarity run scored **7/10**: no dominant task (Q1/Q3) and no compact disclosure (Q4).
One product repair added a safe **Last 14 days** jump and placed destructive Reset in a collapsed,
opaque anchor popup. Final Q1 has **1** entry point, Q3's primary is visible, and Q4 has **1**
collapsed disclosure with **2** default controls.

All ten questions now answer YES in forest-night and classic-light. Contrast sampled **100** runs
per theme at minima **5.30/5.71** with zero failures; one Liquid region carries a transition and no
loop. The control still forces Q2/Q3/Q5/Q10 NO and restores theme/presentation/store/residue exactly.
Parity was refreshed after the product change: jump scroll **0→814**, Standard/Liquid **9/9 / 9/9**,
nine controls **9→8→9**, zero round-trip diffs. Evidence: `cat5-l7-statistics{,-control}.json` and
`cat6-l7-statistics.json`. **PASS 10/10; Statistics 40/80.**

## 2026-08-28 10:20 EDT — Statistics category 4 PASS 10/10; score 50/80

Recovered `codexA`'s interrupted turn first: it committed every slice through `697e0d3f` and left
NOTHING uncommitted — the loss was bookkeeping only (no burn-down line, no handoff). The open
defect it named was exact and reproduced on a fresh RUN of the existing harness: maximized dead
region **17.0%** against the 15% bar, a **284x621** empty column at grid 31,6.

Cause, measured: the harness marks TEXT RANGE rects, so a 397px card holding a four-glyph number
covers ~30px and the rest is dead by construction; the whole view was one 1,216px column of
stacked full-width sections in a 1,264px body.

Repair is CSS-only and container-scoped: at `min-width: 1040px` the view becomes a two-column grid
(knowledge | recent activity, books | shows, cards spanning) and a metric card reads as one line.
An element cannot query itself, so the container sits on the view's PARENT behind
`:where(.fwin-body, .ui-app-chrome__body):has(> .stats-view)` — a floating Statistics window has no
`AppChrome` at all, and `:has` keeps the container off every other window body. `row dense` is what
lets recent activity rise beside knowledge without reordering the DOM; nothing in either is
focusable, so focus order is untouched. Placement is by class, not `nth-child`: books and shows are
both conditional.

Final: maximized **13.3%**, default **8.9%**, compact **0.5%**; clipped/overlaps/scrollers/hidden
overflow **0** at all three sizes; chrome **11.4 -> 8.7%** as the window grows; all three sizes
restored byte-identically. Controls: injected clip **0 -> 1 -> 0** with removal proven, and the
sub-minimum **200x140** leg still fails with **13** clips and one hidden overflow. **PASS 10/10.**
Parity re-checked after the product change: driven jump **0 -> 814**, `check('statistics')`
**9/9**, scroll restored to 0. Focused suite **6/6**. Evidence: `cat4-l7-statistics.json`.
Statistics is **50/80**; category 2 and 7 are unrun, category 8 is UNMEASURED.

## 2026-08-28 10:35 EDT — Statistics category 2 PASS 10/10; score 60/80

The run refused twice before it scored, and the refusals were the harness being right. Statistics'
dominant task ends 814 px down the scroll, and the presentation leg drives every task twice, so on
the second pass every earlier target sat above the fold and `POINT` reported it occluded. This is
correction 13's shape for scroll instead of text, so it got correction 13's answer: `scroll:` is
now the second UNCOUNTED restore primitive in the shared DSL — one repair, generic, no
Statistics-only probe. A stranded 814 px scroll from the first refusal then made the third run
refuse at step 0; a refused run leaves the surface where it stopped.

Task driven: disclose the data tools, jump to Last 14 days, restore. Input cost **2 clicks /
0 keystrokes**, dead ends **0** of 2 counted steps, modal traps **0**, scroll traps **0**, worst
renderer-side acknowledgement **4.9 ms** against the 100 ms bar (the unscored main-hop stamp was
73.5 ms — correction 2's reason for not scoring it). Cost parity is a real second leg, not an
assumption: the same window and geometry in Liquid cost **2** against Standard's **2**, and the
presentation restored to standard/`aria-pressed=false`/820x580. Undo closed the disclosure and
returned the exact base state hash.

Control moved all three terms **0,0,0 → 1,1,1 → 0,0,0** with the inert-button click acknowledged in
**0.3 ms**. **PASS 10/10.** Evidence: `cat2-l7-statistics.json`. Statistics is **60/80**; category
7 is unrun and category 8 is UNMEASURED.

## 2026-08-28 10:52 EDT — Statistics category 7 PASS 10/10; score 70/80

Adding the surface was ten lines of DATA in the existing runner's `SPECS`, exactly as its header
says. One trap is worth the line: `scrollAll('.stats-view')` correctly finds nothing, because the
view is exactly as tall as its content and the scroller is the WINDOW BODY above it — the spec uses
`.fwin:has(.stats-view) .fwin-body` so it scopes to this window rather than to whichever `.fwin`
is first in the document. Statistics also has no destructive-free recompute: Reset wipes the store
and Anki sync writes 41k entries, so scrolling the whole view is the heaviest repeatable work.

Session ceiling **16.7 ms p50** across three runs (this display is 60 Hz, not L0's ~100 Hz), noise
floor over-100 **0**. Drag **16.7 / 17.1 / 83.5**, resize **16.7 / 17.0 / 67.0**, theme
**16.7 / 16.9 / 66.9** — over-100 **0** on all three, scene stable, geometry closed-loop, theme
restored to forest-night. Theme paint **83.2 ms** apply / **122.8 ms** restore. Main loop under the
heavy leg **p50 2.1 / max 7.9 ms** against idle **2.2 / 8.3** and a 500 ms bar; the load's own
receipt: 1,438 px over 91 ticks, restored to 0. Main RSS **99.4 -> 109.6 MB**, renderer heap
**254 MB**, uptime **3,553 s** at start.

Sensitivity control (`--jank`) is what makes the zeros mean anything: the same drag with injected
120 ms blocks moved p95 **17.1 -> 100.3**, max **83.5 -> 133.8** and over-100 **0 -> 11**. The
recorder sees the frames it claims to. **PASS 10/10.** Evidence: `cat7-statistics-perf.json`.
Statistics is **70/80**; only category 8 remains, still UNMEASURED.

## 2026-08-28 11:50 EDT — Statistics category 8 stays UNMEASURED, and the reason is a real defect

Statistics is **70/80**. Category 8 needs one adverse state driven; on a populated profile the only
one it has is the Anki sync failing. Two routes were tried and BOTH are now closed with evidence,
so nobody re-derives them:

1. **Stubbing the bridge is impossible.** `window.api` is frozen — `Object.isFrozen` true, and
   `ankiGetIntervals`'s descriptor is `writable:false, configurable:false`. The assignment fails
   silently, which is worse than throwing.
2. **Repointing `ankiUrl` does not produce a failure.** Following the recorded precedent in
   `dictionaryUnreachableAnkiHooks.test.tsx`, `userData/profiles.json`'s `ankiUrl` was repointed to
   `http://127.0.0.1:1` (refused, not hanging) and the app was RESTARTED onto it, because main does
   not hot-reload. The sync then reported **"Synced 87,260 words from Anki — 0 updated"** with
   `role="status"` and class `wk-message success`.

**FINDING — a false success, which is category 8's own defect.** `anki:getIntervals`
(`src/main/anki/index.ts:942`) is a data-preferring channel: on a failed refresh it returns
`getCachedSnapshot() ?? emptySnapshot()` and never rejects. So `syncKnowledgeFromAnki`
(`src/renderer/ankiSync.ts:56`) cannot return `{ok:false}` for an unreachable Anki, and Statistics
announces a successful sync against a provably unreachable AnkiConnect. The honest seam already
exists — main reports link state separately on `anki:linkState`, named in that handler's own
comment. The fix is to consult it (or snapshot staleness) and say "showing the last synced N words,
Anki is unreachable" rather than "Synced N". Its **"0 updated" is also wrong**: the store went from
0 entries to **41,535** on that same click, and the rendered counts kept saying 0 until a reload,
because `knownWords`' in-memory cache is not invalidated by the write.

Everything driven here is restored and verified: `profiles.json` is byte-identical by SHA-256
(`bae2e124…`), the app was restarted onto the real `ankiUrl`, `jp-word-knowledge-ja` (41,535
entries, `manual` 0) was removed and the live cards read **0/0/0/0** after a reload, four windows
standing, 0 probe residue.

Two harness facts the next run needs: `--surface "Statistics"` VOIDs the `--langs` leg at ja
(`surface not found`) because the window TITLE translates — use `@.stats-view`; and `--langs`
refuses unless Settings is already open on Appearance.

**Next slice, and it opens the next turn:** fix the false success, then re-run
`cat8-honest-states.cjs --surface "@.stats-view" --control --langs --drive-click
".wk-head > .btn.small" --drive-undo ".wk-message-close"` with `ankiUrl` at `127.0.0.1:1`. That
drive then produces a real error state and closes Statistics at 80/80.

## 2026-08-28 10:58 EDT — Statistics closes at 80/80: category 8 PASS 10/10 (`593d6ba8`)

The false success is fixed and the category is scored. `classifyIntervalSyncOutcome`
(`shared/anki.ts`) reads the two signals `anki:getIntervals` throws away: link state, and whether
the returned snapshot's `generatedAt` is younger than the moment we asked. **`runPoll` stamps
`generatedAt` AFTER its last AnkiConnect call (`intervals.ts:485`), so any poll whose result
reaches us — including one already in flight that the single-flight gate coalesced us into — is
stamped later than `requestedAt`.** That is what makes the age test sound rather than racy, and it
is the one non-obvious fact in this fix.

Live reproduction of the defect, measured this turn and needing NO settings change at all: Anki
desktop is not running on this machine, so `anki:linkState` reads `disconnected` with **71
consecutive failures**. A forced `ankiGetIntervals({maxAgeMs:0})` still resolved with **87,260
entries / 155,384 notes**, stamped **706,659,811 ms = 8.18 days** before the request. The previous
turn had to repoint `ankiUrl` to `127.0.0.1:1` and restart to see this; that is unnecessary and
nobody should spend a restart on it again.

Live A/B on the same button, same surface:
- BEFORE (previous turn, recorded above): `wk-message success`, `role="status"`, "Synced 87,260
  words from Anki — 0 updated."
- AFTER (this turn): `wk-message error`, `role="alert"`, "Can't reach Anki. Open Anki desktop and
  make sure the AnkiConnect add-on is installed." Knowledge cards stayed **0/0/0/0** — the
  disconnected branch never folds, so the phantom 41,535-entry write recorded above cannot happen
  down this path either.

Third state added rather than folded into the other two: `stale` — real counts from the last good
snapshot when the refresh did not complete but the link is not reported down. Border-only tone,
like `.error` beside it, so no status hue is asked to clear a contrast bar it misses on light
panels.

**Category 8 = PASS 10/10**, `cat8-honest-states.cjs --surface "@.stats-view" --control --langs
--drive-click ".wk-head > .btn.small" --drive-undo ".wk-message-close"`. textRuns **94**, rawKeys
**0**, placeholders **0**, mute pairs **0**, disabled controls **0**; statesNamed **1 of 1
observable** (empty/loading/offline `notObservable`); four distinct language hashes with rawKeys 0
in each, `ui-lang` restored to `en` and asserted. Drive `surfaceChanged: true, restored: true`.
**Control moved all three: 0,0,0 → 1,1,1 → 0,0,0.** Evidence: `baselines/cat8-l7-statistics.json`.

**Statistics is 80/80 and DONE — the second finished L7 surface after Flashcards.**

Two traps this turn, both cheap to avoid. A run VOIDed at `surfaceChanged: false, restored: false`
purely because a message left over from my own manual click was already on screen: **clear
`.wk-message` before driving, or the drive's before-state already contains the after-state.**
And `--langs` needs the ui-language card, which is reached by clicking
`button.os-set-nav-item` whose text is "Appearance" — the `LI` wrapper's `.click()` does nothing.

## 2026-08-28 11:22 EDT — Calendar opens on the selective Liquid seam (fifth L7 surface)

L7's order is Flashcards → Anki → Notebook → Statistics → Calendar → Games; the first four are
80/80, 80/80 PARKED-at-0, 80/80 and now 80/80, so Calendar is next.

§2.3 names calendars explicitly as a WORK surface, so the month/week/day grids, the agenda lists
and the event modal keep their opaque paint and were not touched. Two strips are contextual: the
intro/new-event header (`CalendarView.tsx`) and the mode + date transport (`CalendarNav`, which is
the shared component Blanc also mounts — `ContextualSurface` is pixel-inert there, so Blanc keeps
the toolbar it had).

Live receipt on a **782×513** Calendar window: contextual regions **2**
(`HEADER.lq-contextual view-head calendar-context-head`, `DIV.lq-contextual cal-toolbar
cal-context-toolbar`), `container-type: inline-size` resolved, contextual header background
`rgba(0,0,0,0)` at Standard — the seam paints nothing until the window opts in.

**Pointer floor, with the control that makes the number mean something.** All eight transport
controls measured **26 / 26 / 26 / 26 / 28 / 26 / 28 / 24 px** — **8 of 8 below the 32px bar**,
worst the date jump at 24. With the floor: **8 of 8 at exactly 32, 0 under**. Measured by
suspending the new rule inline on the live surface, re-measuring, restoring and re-measuring;
after restore the surface holds **0** inline styles and **0** probe attributes.

Guard: `calendarLiquidRegions.test.ts`, 5/5 — including that the grids stay off
`ContextualSurface` and that the shared sheet names no hex or `rgba()` colour, because Liquid is
a composition language and a shared component with one shell's palette breaks Aero, Wired and
Blanc at once.

Trap for the next run: **the Calendar window is not open by default and there is no
`desktop:open` event.** Reach it through the shell's own Start menu — click `.os-start-btn`, then
the `[class*="os-start"] button` whose text is exactly `Calendar`. The same recipe reaches every
other app in that list.

Next: Calendar's rubric cells through the eight existing surface-parameterised harnesses. No
Calendar-only probe was added and none is needed.

## 2026-08-28 11:00 EDT — Calendar category 1 PASS 10/10 (interrupted run recovered)

The existing category-1 harness completed before the worker stopped; its untracked receipt was
the only stranded artifact. On the live **782×513** Calendar window it measured **60/60** text
owners at or above **5.30:1**, **9/9** controls keyboard reachable, **0** WCAG 2.5.8 failures,
and **0** targets below the 32px pointer floor. Reduced-motion moved over-threshold transitions
**2→0→2** and the pointer re-run was stable with **0** stolen or occluded controls.

The negative control moved every scored defect term: contrast **0→1**, pointer-by-hit **0→2**,
pointer-by-rect **0→2**, WCAG 2.5.8 **0→1**, keyboard **0→2**, then restored all five to zero.
The harness also proved **0** deferred owners and exact restoration on its immediate, verified,
and delayed checks. Evidence: `baselines/cat1-l7-calendar.json`.

**Calendar is 10/80.** Category 2 is next; no new probe or harness repair was needed.

## 2026-08-28 14:06 EDT — Calendar category 2 PASS 10/10; score 20/80

The dominant task is moving from the month overview to the week schedule. It costs **1 click / 0
keystrokes**, with **0** dead ends, modal traps, scroll traps, or acknowledgements over 100 ms;
the worst renderer-side acknowledgement was **57.5 ms**. The unscored cross-process stamp was
652.7 ms, which is the harness's recorded reason for measuring from renderer receipt.

Cost parity was driven, not inferred: Standard and Liquid each cost **1** input at the same
820×580 geometry. The harness restored Month, Standard presentation, `aria-pressed=false`, and
the exact base state hash. Its control moved dead-end/modal/scroll defects **0/0/0→1/1/1→0/0/0**;
the inert control was acknowledged in **2.4 ms**. Evidence: `cat2-l7-calendar.json`.

**Calendar is 20/80.** Category 3 is next; this was a pure run of the shared harness.

## 2026-08-28 14:08 EDT — Calendar category 3 repairs dense glass; PASS 10/10

The first controlled run found **1/1** Work regions translucent: `.cal-nav` contains the date
input, so the classifier correctly treats it as a dense form, but it inherited the surrounding
contextual material. The control could not move an already-failed term and voided rather than
granting a score.

`AnchorSurface bare` now gives that date-navigation subgroup the stable opaque backing §2.3
requires while the surrounding mode/transport strip remains contextual. The rerun classified
**51** regions: Work **1**, Liquid-eligible **2**, Anchor **47**, Anchor-holding-work **1**.
Dense Work on translucent fell **1→0**; both contextual regions are treated **2/2** and use a
shared primitive **2/2**. Controls moved one/all Work failures **0→1→1→0**, restored the exact
`rgb(18,28,23)` anchor material, and returned Standard presentation. Guard **6/6**.

**Calendar is 30/80.** Evidence: `cat3-l7-calendar.json`. Category 4 is next.
