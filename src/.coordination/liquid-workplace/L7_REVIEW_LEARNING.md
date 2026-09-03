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

## 2026-08-28 14:10 EDT — Calendar category 4 compact reflow PASS 10/10

The first shared-harness run found one compact horizontal scroller: `.calendar-view` measured
**262>212px** because the four intrinsic mode buttons consumed **240px** and the seven `1fr` day
columns retained **211px** of min-content inside a 168px row. Default and maximized were clean.

At a 300px container the modes now form a 2-column grid and the month/week grids use explicit
`minmax(0,1fr)` tracks with compact gaps/padding. Final default / compact / maximized results:
clips **0/0/0**, overlaps **0/0/0**, horizontal scrollers **0/0/0**, hidden overflow **0/0/0**;
dead region **5.4/0.9/9.7%**. Chrome falls **17.8→13.9%** and the work viewport grows
**93.7→95.3%**. All three sizes restored.

The injected clip moved **0→1→0** with removal proven; the 200×140 leg stayed clean and restored.
Guard **6/6**. **Calendar is 40/80.** Evidence: `cat4-l7-calendar.json`. Category 5 is next.

## 2026-08-28 14:16 EDT — Calendar category 6 PASS 10/10; score 50/80

Calendar is now the fourteenth spec in the existing parity engine: **5 feature rows**, 9 drive
steps, 5 independent mutations. The drive visits Month/Week/Day/Agenda, shifts back and forward,
opens and cancels the real event composer (**6 inputs / 3 selects / 1 textarea / 2 actions**),
and carries a real **120px** scroll through the presentation trip. It never creates, edits, or
deletes an event.

Standard and Liquid each reach **5/5**; the 820×580 Standard→Liquid→Standard trip retains fields,
shell, and scroll with zero diffs. All five controls move **5/5→4/5→5/5**, each dropping only its
declared row. The first date-transport plant stripped a tooltip while the visible ‹ still proved
the control and correctly voided; the one repair removes the counted control itself.

**Calendar is 50/80.** Evidence: `cat6-l7-calendar.json`. Category 5 can now run.

## 2026-08-28 14:18 EDT — Calendar clarity 9/10 → PASS 10/10; score 60/80

The first score answered YES on nine questions and NO on Q4: the raw date input sat beside all
eight primary transport controls, with **0** collapsed disclosures. Direct date entry is secondary
to prev/today/next, so it now lives behind a native `details` labelled by the existing translated
`calendar.jumpToDate` string. Nothing was removed; keyboard and pointer activation disclose it.

Final Q4 is **1** collapsed disclosure and **8** controls to scan. All ten questions answer YES:
Q1 has **2** entry points, Q5 samples **67** text runs per theme at minima **5.30/5.71** with zero
failures, Q6 has **2/2** Liquid regions carrying transitions and zero loops, and category-6 parity
remains **5/5 / 5/5** with zero round-trip diffs. The Q2/Q3/Q5/Q10 plant moves all four to NO and
restores theme, Standard presentation, store bytes, and **0** residue.

The DOM change invalidated earlier cells, so categories 1–4 and 6 were re-run: all remain controlled
10/10. Accessibility now measures 61 text owners, 8 default controls and the disclosed input for
the pointer pass, with all five defect terms zero; compact geometry remains 0/0/0/0.

**Calendar is 60/80.** Evidence: `cat5-l7-calendar{,-control}.json` plus refreshed `cat{1,2,3,4,6}`.
Categories 7 and 8 remain.

## 2026-08-28 14:25 EDT — Calendar category 7 controlled PASS 10/10; score 70/80

The first two unchanged runs each voided on one inconsistent >100 ms gesture outlier, migrating
from theme to drag while every main-loop load result remained clean. The shared harness already
documents a ~12% bare-compositor outlier rate but voided a 2:1 clean consensus. Its one allowed
generic repair now takes two confirmations after disagreement: **4:1** is a consensus; **3:2**
remains UNSTABLE and void. Every raw reading remains in the receipt.

The controlled run then measured its own noisy environment honestly: three compositor ceilings
included **2** >100 ms frames and a **1,721.6 ms** maximum. Against that session floor, drag,
resize, and theme all had p50 **16.7 ms**, p95 ≤**17.1 ms**, and no scored finding. Calendar's
read-only load cycled Month/Week/Day/Agenda **56** times (**14/14/14/14**) and restored mode 0;
heavy main p50/p95/max were **2.0/3.7/9.5 ms** versus idle **1.9/3.0/10.6 ms**. Main RSS was
**149.0→150.1 MB**. The jank control produced **11** frames over 100 ms, proving sensitivity.

**Calendar is 70/80.** Evidence: `cat7-calendar-perf.json`. Category 8 remains; no single-use
probe was added.

## 2026-08-28 14:28 EDT — Calendar category 8 repaired and PASS 10/10; score 80/80

The first controlled run was honestly **UNMEASURED**: Agenda rendered three truthful absence
messages, but all were generic `.muted` prose, so the shared state instrument found **0** semantic
state hosts. The product repair adds `cal-empty-state` to those existing messages; copy and stored
events are unchanged. Guard: `calendarLiquidRegions.test.ts` **8/8**.

Driving Month→Agenda→Month now produces **3** empty hosts, **1/1** observable state named, a changed
then exactly restored surface hash, and **0** raw keys, placeholders, or unexplained disabled
controls. EN/JA/ZH/RU produce **4** distinct text hashes with **0** raw keys and restore English.
The negative control moves raw-key/placeholder/mute counts **0/0/0→1/1/1→0/0/0**.

**Calendar is controlled 80/80.** Evidence: `cat8-l7-calendar.json`. L7 remains open: Games is
next, while Anki remains explicitly parked at 0/80 on its external runtime gate.

## 2026-08-28 14:32 EDT — Games opens on the selective Liquid seam (sixth L7 surface)

Live before the change: **942×593**, **15** game choices, **17** controls, **128** rendered elements,
and **0** contextual regions. The plan's split is now explicit: app header, game navigation,
game/difficulty header, material coverage, seen coverage, and post-round detail use the shared
`ContextualSurface`; gameplay, timer/HUD, answer input, and timing-sensitive review state stay on
the existing stable pane. The shared component remains inert in Blanc and conventional windows.

Live Standard→Liquid→Standard: **5** currently rendered contextual regions; header background alpha
**0→0.72→0**, while gameplay stage stays **0.88** throughout. Selected game remains Sentence Builder,
XP remains **0**, and the presentation action returns from “Return to standard window” to “Make
Liquid”. Guard: `gameArenaLiquidRegions.test.ts` **2/2**.

**Games is open, unscored 0/80.** Run the eight existing surface-parameterised harnesses next; no
Games-only probe was added. Do not edit dirty `ArcadeGames.tsx` or `styles.css` without isolating
foreign i18n/Aero hunks.

## 2026-08-28 14:36 EDT — Games category 1 repairs taskbar obstruction; PASS 10/10

First run: contrast/reachability/motion were clean, but the sixth cascaded window started at y=174
with the same 660px height used at y=0. Its bottom crossed the taskbar; one game choice had only
**31.5 px** of its **66.8 px** control hittable, so category 1 failed and the pointer control voided.

`fitNewWindowRect` now caps width/height against the remaining work area at the cascade's actual
origin. Unit guard **3/3**. Reopened live at **980×589**, y=174→bottom **763**; taskbar begins **765**.
Final shared-harness receipt: **47** text owners, minimum contrast **4.72:1**; **17** controls, minimum
target **32 px**, **0** pointer/spacing failures; **17/17** keyboard reachable; reduced motion owners
**19→0→19**. Control terms contrast/rect/pointer/WCAG/keyboard all move **0→nonzero→0**.

**Games is 10/80.** Evidence: `cat1-l7-games.json`. Category 2 is next.

## 2026-08-28 16:2x EDT — Games categories 6 and 5; 6 PASSES, 5 is VOID on a named defect

**Category 6 — PASS 10/10, a pure RUN.** `games` was registered in `l6-parity.js` as DATA (ten
rows against §11's own parity list); the runner needed no change. standard 10/10, liquid 10/10,
rowsAgree, round trip held with zero diffs. Negative control: **10 of 10 mutations fell exactly
their own row**, zero unexpected, all returned. The drive starts a real round to reach "typing
input" and "scores", then discards it through the product's own path — measured,
`jp-game-progress-v1` **ABSENT before and after**. Evidence `cat6-l7-games.json` (`58c34960`).

**Category 5 — the instrument was fabricating a total collapse, and one real defect was under
it.** `cat5-ui-clarity.cjs`'s TRAP-7 correction was written for background-COLOR and never reached
the background-IMAGE branch: every gradient stop was read as opaque and the walk then `break`.
`.game-arena`'s 4% sheen stop `color(srgb .847 .922 .878 / .04)` resolved to **rgb(216,235,224) —
exactly the h2's own colour** — so `h2 "Game Arena"` reported **1.00:1 in BOTH themes**, and the
identical fake minimum also VOIDed Q5's theme axis on a surface whose failing count really moved
**19 → 5**. Stops now keep their own alpha and only an everywhere-opaque gradient stops the walk.

Underneath it, a real one: `.game-arena-kicker` is the **tenth** `color: var(--accent-2)` rule of
the family `--accent-text` was built for. "Practice" read **1.66:1 against a 4.5 bar** on
classic-light. Moved to `var(--accent-text)`; dark palettes are untouched by construction. Q5
re-measured after the fix: forest-night **4.57, 0 failing/55**; classic-light **5.38, 0/55**. NO →
YES, axis moves. `accentTextToken.test.ts` + `arcadeGamesI18n.test.tsx` 21/21 (`8969c8a4`).
**43 rules in `styles.css` still paint `color: var(--accent-2)`** — an open finding, not swept.

**Category 5 stays VOID, counted, never dropped**, on two named defects:

1. **Q1 drifts with the palette — a real selection-visibility failure, measured.** The only entry
   point either theme finds is the *selected game item*, via the harness's palette-relative
   fallback. `.game-list-item.active` fills with `--game-accent-soft` = accent at a fixed **16%**
   over an unknown ground: composited that separates **1.30:1** from `.game-list` on forest-night
   and **1.16:1** on classic-light, against the 1.2 bar. A fixed alpha over an unknown background
   is the identical recipe error `--accent-2`-as-text was. `.game-list-item:hover` and `.active`
   are also byte-identical rules, so hover and selection are indistinguishable.
   **NOT FIXED THIS TURN AND DELIBERATELY NOT GUESSED**: a live share sweep read 1.16 → 1.42 and
   then plateaued, because `.game-list-item` carries `transition: background`, so each same-tick
   `getComputedStyle` returns a mid-transition colour. The share must be swept **settled, one
   bridge call per share**, and across the nine accent presets × six light palettes — the
   `--accent-text` note's own words: a share tuned to one hue is not a measurement.
2. **Q4 — zero collapsed disclosures.** The default ready state scans **2** controls (Settings,
   Start round) against a bar of ≥1 disclosure AND ≤12 scanned. No clutter, no progressive
   disclosure either; §11 assigns help/coverage/difficulty/post-round detail to the contextual
   seam, so the Arena's own scope and difficulty controls belong behind one, not in Settings.

Everything else answers YES: Q2, Q3, Q5, Q6, Q7, Q8, Q9, Q10. Control run moved all four planted
questions. Evidence `cat5-l7-games.json` + `cat5-l7-games-control.json`.

**Games is 50/80** (cats 1, 2, 3, 4, 6 PASS; cat 5 VOID; cats 7, 8 unmeasured). Next: cat 7, cat 8,
then Q1's settled share sweep and Q4's disclosure.

## 2026-08-28 19:14 EDT — interrupted Games slice recovered; category 7 first run is VOID

Recovery found the index empty and every path owned by `58c34960`, `8969c8a4`, and `7493a97f`
clean at HEAD. The category-6 PASS and category-5 VOID evidence is therefore checkpointed rather
than stranded; its nearest suites re-ran **28/28**. The latest boss-audit NUL/typing findings are
also already closed at HEAD (`70505beb`, `81174fac`): all four named sources contain **0** NULs.

Games is now DATA in the shared category-7 harness. Its read-only load cycles all **15** available
games **60** times, mounts each branch four times, starts no round, and restores selection **0**.
Heavy/idle main-loop p95 are **3.5/3.5 ms**, maxima **80.7/9.7 ms**; resize and theme majorities are
clean and every gesture restores geometry/theme. The run nevertheless stays **VOID**, not 10:
drag repeats read **BREACH / clean / clean / clean / BREACH** (max **150.5 / 33.5 / 50.2 / 33.5 /
601.7 ms**), so the instrument's disagreement guard fired. This is an environmental stall, not a
named product finding; no harness repair was attempted. Retry after the remaining categories.

**Games remains 50/80.** Evidence: `cat7-games-perf.json`.

## 2026-08-28 19:18 EDT — Games category 8 repaired and PASS 10/10; score 60/80

The first controlled run was **UNMEASURED**, not passed: the ready state already says “No rounds
recorded …”, but its generic `.muted` markup exposed **0** semantic state hosts. The existing copy
now also carries `game-history-empty`; no data, behavior, or layout changed. Guard **7/7**.

The same shared harness now measures **1/1** observable empty state named, **0** raw keys,
placeholders, or unexplained disabled controls. EN/JA/ZH/RU produce **4** distinct hashes with
zero raw keys and restore English. The control moves all three defects **0→1→0**. Settings was
captured on Home, opened to Appearance through its own navigation for the language leg, and
restored to Home; the game remains Sentence Builder and `jp-game-progress-v1` remains absent.

**Games is 60/80** (categories 1, 2, 3, 4, 6, 8 PASS; 5 VOID; 7 VOID on unstable environment).
Evidence: `cat8-l7-games-first.json`, `cat8-l7-games.json`.

## 2026-08-28 19:29 EDT — Games categories 5 and 6 controlled PASS after disclosure repair

Category 5's two named defects are closed without tuning an accent share. The selected game now
declares `aria-current` plus a primary state, uses a neutral text-derived **16%** fill and a
separate accent edge, while hover is **7%**. “Round options” is a native collapsed disclosure;
Settings and Kana scope sit behind it, Start remains visible. Q1 is **1** entry point in every
palette and Q4 is **1** disclosure / **1** scanned control.

The first repair exposed active-description contrast **3.86:1** on forest-night; selected
descriptions now use normal text ink. Expanding the same harness beyond classic-light then found
the Arena's generic muted token at **4.36–4.46** on five light palettes. The Arena remaps it 85%
muted / 15% text. Final Q5 minima: forest **5.87**, classic **6.23**, sepia **4.70**, ocean **4.88**,
mint **4.77**, rose **4.73**, paper **5.12**. All six runs PASS 10/10; control moves Q2/Q3/Q5/Q10
and returns with residue **0**. The nine accent presets no longer control fill separation.

Category 6 opens the disclosure through its existing Games data drive, proves **10/10** rows in
Standard and Liquid, returns zero round-trip diffs, then restores it closed. All **10/10** mutations
drop exactly their own row and return. Categories 1–4 and 8 need pure RUNs after this DOM change;
category 7 remains VOID only on its unstable drag environment.

Evidence: `cat5-l7-games{,-control,-soft-sepia,-ocean-blue,-mint-green,-rose-pine,-paper}.json`,
`cat6-l7-games.json`.

## 2026-08-28 19:42 EDT — Games is controlled 80/80

The post-disclosure category-1 RUN first caught the Settings button at **26.5 px**. The Arena now
gives disclosure buttons a **32 px** minimum; final accessibility is **55** text owners, minimum
contrast **4.72:1**, **22/22** controls reachable, and all five planted defects move and restore.
Categories 2 and 3 re-pass at **1 click / 0 keys**, **0** traps, **6/6** eligible Liquid regions,
**6/6** shared primitives, and **0** dense Work regions on translucent material.

Category 4 re-drove the required non-empty state with **12** schema-valid recent rounds. Dead region
is **6.9 / 0.8 / 11.1%** at default/compact/maximized and every clip, overlap, horizontal-scroll, and
hidden-overflow count is zero. The temporary progress key was removed back to `null`; the separately
banked never-played finding remains honest rather than being used for the score.

Category 7's environmental retry agrees: all gesture majorities are clean, all **15** games cycle
**60** times and restore selection 0, and heavy main-loop p50/p95/max are **2.1/3.4/9.0 ms** against
idle **2.4/3.9/8.4 ms**. Its injected-jank control records **11** frames over 100 ms (p95 **100.4**,
max **150.4**). Category 8 re-passes at **1/1** named state, **0** honesty defects, **4** language
hashes, and a **0→1→0** control; English, Settings Home, Standard presentation, the closed disclosure,
and absent game progress all restore.

**Games is 8 of 8 categories / 80/80.** Fix/evidence commit `b6e55253`; scorecard and receipts:
`LIQUID_SCORECARD.md`, `cat{1,2,3,4,5,6,8}-l7-games*.json`, and `cat7-games-perf{,-control}.json`.

## 2026-09-03 05:2x-05:5x EDT — bullets 997/998 measured on the ACTIVE task; 998 passes, 997 does not

The two L7 bullets had never been measured across a task's own steps. The Flashcards note of
2026-08-26 records the card and action rects byte-identical across a Liquid → Standard → Liquid
**presentation** round trip — which returns to the same state by construction. 997 is about the
surface staying put while the state ADVANCES. Instrument: `cat2 --anchors/--anchor-tol` (no new
probe), anchors scored root-relative, `present → absent` given its own verdict rather than a shift
of 0. Its control has to fire DURING a step, so the plant is armed on a button and displaces the
real anchor 37px on click.

**997 is OPEN and the number is worse than the bullet's bar, not better.** `.flash-card >>
.flash-actions`, 10 cards, reveal driven at the button's own live centre: the grading row moved on
**9 of 10** reveals, **max 431px**, `actionsY` 530 → 465/530/539/566/592/645/961. `.flash-actions`
is a plain flex row under a variable-height card, so its position is whatever the answer's length
makes it. **No sampled reveal put a grade button under the pointer** that pressed Show answer
(`landedOnGrade` false, 10 of 10) — that harm is NOT claimed; the nearest miss was 6px.

**Two product defects found and fixed on the way, both structural, both live-measured.**
`6232e0f3` — the comprehension branch renders `current.sentence` into `.flash-word`, the
single-word class, so a sentence gets `clamp(42px, 8vw, 64px)`. Discriminating pair, one card, one
build, class toggled off and back: 266 chars at 64px → prompt 1,870px, card 2,017px, **3.70
screens** of a 545px viewport; at 36px → 702px, 849px, **1.56 screens**; restored byte-identical.
Before, 4 of 8 sampled prompt cards were 1,422–1,677px; after, 8 of 8 sit at the 360px min-height.
`11df744e` — `.flash-view .flash-strip` makes the strip a reflowing grid, justified in its own
comment on "the recent-card preview", and `.flash-review-strip` was caught by it while listing all
3,235 session cards. Strip **96,806px → 86px**; window scroller 98,000 → 1,280px (**179.8 → 2.3
screens**); the review card's top **97,068px → 348px**, i.e. from 98.9% down its own table of
contents to above the fold. Restoring the flex row alone gave 326px — in a flex row every chip
stretches to the tallest, and one comprehension card's `word` IS the 266-char sentence; clamping
the chip label to 2 lines took it to 86px, honest because the button already carries
`title={card.word}`. Both guards assert numbers, not spellings, and both mutation controls fired
(1 failed / 2 failed), each file restored by sha256.

**998 PASSES on this surface, on its own term.** `cat3 --presentation liquid --control` on the live
review: **denseWorkOnTranslucent 0**, roles Work 1 / Anchor 29 / Anchor-holds-work 4 / Ambient 0.
Control A blurred the one Work region 0 → 1, control B made every Work region fail, both restored
(`oneMaterialReturned`, `allGlassReturned`) — "CONTROL FAILED AS REQUIRED".
Baseline: `cat3-l7-997-flashcards-review.json`.

**INSTRUMENT GAP, and it is the instrument rather than the surface.** That same run reports
`verdict: FAIL` on `contextualTreated` and `sharedPrimitives` — both computed as
`eligibleTotal > 0 && ...` against `eligibleTotal: 0`. A review state with zero contextual regions
is exactly what 998 ASKS FOR. cat3 already forgives this as `vacuousContextual`, but only inside
the `if (!work)` branch, where controls C/D prove the zero is a MEASURED zero. Here Work = 1, so
A/B ran and the vacuous branch is unreachable. **Do not read those two bars as a Flashcards
defect.** The fix is to run control C's eligibility plant in the A/B branch too, so the zero is
measured there as well — never to widen the bars.

## 2026-09-03 — 997 CLOSES. The grading row now survives the task's own steps.

`1bdfd7ca`. The remaining condition the previous entry named, met on its own terms.

BEFORE, re-derived this session at HEAD (not inherited): 10 cards through the strip, revealed
with a real click at the Show-answer button's own live centre — **6 of 10 moved, max 88 px**.
Card 360 → 448 px on four of them; on two the *prompt* outran the answer and it shrank
849/1011 → 501/554, taking `.fwin-body` scrollTop 687/849 → 404/457 with it. (The last entry's
9-of-10/431 px is the same defect on a different draw — the strip order is not stable across a
reload, which is banked.)

MECHANISM: the review card was sized by its own content — `min-height: 360px` with no cap — so
the row below it was wherever the answer's length put it.

FIX: a zero flex-basis inside a bounded shell column. The card's used height then has no term
for its content: it is the shell's leftover space, floored at the same 360 px that already
shipped. `.flash-view.review` gets `height: 100%` + `align-items: stretch` to make that leftover
definite; against an indefinite host it resolves to `auto` (`.gram-view--explorer`'s reasoning)
and the floor carries the property alone.

AFTER: **0 of 10 moved, max 0 px**, `actionsY` 530 on every card, `cardH` 360 → 360 on every card.

CONTROL, same instrument, same session: an injected sheet re-declaring the card
`flex: 0 0 auto; overflow-y: visible; justify-content: center` → **4 of 6 moved, max 88 px**;
removing that sheet → **0 of 6**. The instrument sees the defect when it is there.

PARITY, because capping a card is only honest if the overflow stays reachable: 10 cards
re-driven, **6 answers overflow (max 194 px), all 6 scroll, 0 clipped at the top**, and the last
child of each `.flash-answer` is fully visible AND hit-testable after scrolling to the bottom.

TRAP, worth carrying: `justify-content: safe center` is explicitly warned against elsewhere in
this sheet (`.manga-stage`, "falls back to start when zoomed/tall"). That warning is correct for
a centred *image*, where start-alignment leaves an asymmetric void. Here the fallback is the
point — a plain `center` in a scroll container puts the top of a long answer above the
scrollport, where no scroll reaches it. Different case, opposite conclusion; do not "fix" it.

GUARD: `flashcardReviewRowAnchor.test.ts`, 3 cases. It asserts the property, not the spelling —
it computes the card's used height for a 360 px and a 1011 px answer and requires them equal.
Mutation control measured: reverting the four declarations fails all 3; styles.css restored
byte-identically (sha256 `4b964fcf6aff0e3d0568` before and after). It reads a **comment-stripped**
copy of the sheet, because `.flash-review-shell .flash-card` also appears in prose there and a
raw `indexOf` finds the comment first.

**The instrument gap recorded above is CLOSED — `d84bb72a`, same day.** cat3's two eligibility
bars are `eligibleTotal > 0 && ...`, and the branch that forgives a zero denominator lived
inside `if (!work)`, where controls C and D prove the zero is measured. Controls A and B never
ask that question, so a surface with a Work region AND a correct zero — this one — could not
reach it. The plant now runs in the A/B branch as well. Re-run, same surface and flags:
**PASS 10/10, `failedBars []`, `vacuousContextual true`, exit 0**, against the FAIL it printed
before. Control on the repair, because a forgiveness that always fires is just a widened bar:
control C's `<nav>` swapped for a `<div>` — same box, same alpha, no landmark — left
`eligibleTotal` at 0 and the run returned **VOID at exit 1** with both bars still false; the
probe was restored byte-identically. `barsWhilePlanted` is now recorded in every such run, so
the low score this category must be able to produce stays visible on the passing surface.
