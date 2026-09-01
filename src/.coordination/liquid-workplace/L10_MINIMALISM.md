# L10 — System-wide smart minimalism pass

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §L10. Gate: *one coherent workplace
language with individual app character preserved.* Opened 2026-08-31 by `primary`, the turn
L9 bullet 4 closed at RULE C 16/16 (`f729d88e`).

## Instrument order — corrected 2026-09-01

RULE C applies verbatim: **2 representative surfaces × all 8 categories = 16 cells per bullet**.
The earlier version of this note narrowed each L10 bullet to only the categories named below;
that contradicted the relay pin's explicit “cutting categories is forbidden” rule and is
retracted. The table now controls measurement order only. No bullet closes below 16/16, and a
failed category still expands across the sampled-out surfaces as RULE C requires.

| bullet | the claim | categories to run first | instrument |
| --- | --- | --- | --- |
| 1 | no redundant chrome / card nesting | cat3 Liquid utilization, cat4 use of space | `cat3-liquid-utilization.cjs`, `cat4-use-of-space.cjs` |
| 2 | labels, icons, spacing, motion, empty states, breakpoints reconciled | cat1 accessibility (motion, targets), cat5 UI clarity, cat8 honest states | `cat1-accessibility.cjs`, `cat5-ui-clarity.cjs`, `cat8-honest-states.cjs` |
| 3 | palette and search expose moved secondary/expert actions | cat5 UI clarity, cat6 feature parity | `cat5-ui-clarity.cjs`, `settingsSearchReachability.test.ts`, `CommandPalette.tsx` registry |
| 4 | no feature duplicated into competing control systems | cat6 feature parity | `cat6-feature-parity.cjs`, `parity-ledger.json`, `tools/blanc-drift.cjs` |

Surface sample, and why these: **Settings** (1,307 controls / 83 commands / 67 settings — by far
the densest row in `CENSUS.md`, and the surface that L8's dead-control and search work already
touched) and **Media Center** (`player`/`video`/`music`, one 816-control root that three
sections share, so a duplicated feature has three places to hide). A third is added only where a
bullet's own words demand a surface neither of those has — bullet 3's command palette is
shell-level, so it also scores the Wired shell, already instrumented in `L9_SHELL_IDENTITIES.md`.

## Progress

### Bullet 3 — CLOSED 2026-08-31. `9c117226` (palette), `74628bbc` (landing).

The open half was real and worse than "not yet widened": the palette exposed **0 of 160**
registry entries. Its own header comment had claimed since it was written that it searches
"…and settings"; the `items` memo had no settings source at all. So every action L8 moved
behind a disclosure was reachable from the Settings search box and from nowhere else.

**cat6 — feature parity. 10/10.** Live sweep of every registry entry whose English title can
be typed as a query (129 of 160; the 31 excluded are the generated `page-*` rows and titles
carrying `{}` placeholders). For each, the gate the registry declares was compared against
what the palette actually offered in the running app: **129 of 129 agree** — 124 present as
expected, 5 withheld as expected. Live gate state read from the app, not assumed:
advanced=true, aeroDiscovered=true, wiredDiscovered=false, theme=study-os.
Negative control, two independent axes discriminating in the same run: `Aero gadget lab` and
`Aero games` PRESENT (discovery true) while `NAVI terminal` and `WIRED games` are ABSENT
(discovery false) and `Pillarbox style` / `Leave secret OS` ABSENT (theme-gated). Each absent
run still returned 7–13 other settings rows, so no refusal is vacuous. Mode control: the same
query in `commands` mode returns 0 settings rows while still returning 19 command rows.
Gatekeeper check (the plan's own constraint): every route the palette offers already existed
inside Settings, so nothing became palette-only.

**cat5 — UI clarity. 10/10, and it FAILED first.** Picking a result named the action and did
not deliver it: the card highlighted **7,438 px below the fold**, pane `scrollTop` stayed 0 for
the whole 2.2 s the highlight lasts, and the highlight then expired offscreen — identical, from
the user's seat, to being dumped at the top of the page. This hit the Settings search box
equally; it is not a palette defect. Fixed in `74628bbc` and re-measured in that commit: pane
scrollTop 0 → 7233, card top 7462 → **183**, in view at ~2.5 s **while the highlight is still
lit**.

**The cause, because 11 other call sites share it.** `scrollIntoView({behavior:'smooth'})` is a
request and this renderer refuses it. Measured with OS `prefers-reduced-motion` reporting
**no-preference**: the settings pane moved 0 px on smooth and 7,233 px on the identical `auto`
call, `pane.scrollTo({behavior:'smooth'})` also moved 0, and a freshly created plain scroller in
the same document ignored smooth too. `grep` finds 16 `behavior: 'smooth'` sites, 11 of them
product. Only `SettingsCard` is fixed here — the rest are named, not silently absorbed.

Two instrument corrections banked. (37) A `themes:` gate may be written as a CONSTANT
(`themes: SECRET_SHELL_THEMES`), so a `/themes: \[/` expectation parser scores a correctly
withheld entry as a miss — that was this sweep's single "disagreement" and the app was right.
(38) The card's own `rect.top` cannot decide whether a scroll happened: the page was still
settling and moved the card 19 px by itself, so a first fix gated on `rect.top === before`
never fired and measured as no fix at all. Compare the SCROLLER's `scrollTop`.

### Refused-scroll recovery — CHECKPOINTED 2026-09-01, `8d0e2b13`

The interrupted follow-up is recovered rather than left as loose shared-tree edits. One
axis-aware helper now owns smooth-request measurement, an outright fallback, and cancellation;
all **12 direct smooth calls across 10 committed product files became 0**, while working-smooth,
already-visible, horizontal and cancelled negative controls remain single/no-op calls as
appropriate. Exact-commit validation: **5 files / 40 tests pass** in a detached worktree;
touched-path ESLint **0 errors** (9 pre-existing `NovelReader` warnings).

The shared working tree still has one direct call inside an older uncommitted transcript-panel
rewrite. It was deliberately not absorbed: that call does not exist in `HEAD`, so committing
its integration alone would either reference dead code or steal the foreign rewrite.

`sampled-out:` **Media Center** — it owns no settings registry, so bullet 3's claim has nothing
to bite on there. **Wired shell** — its command entry point is already certified by L9 bullet 1
at RULE C 16/16 (`b1e35170`), and the palette's data is theme-independent. **Blanc** — it is a
separate window that does not mount `CommandPalette` at all; that is pre-existing and belongs to
Blanc's own track, where L9 established that the shell owns its own controls. Named here rather
than passed over in silence.

### Bullet 1 — first 4 of 16 cells, `2ae5fa57` (superseded by the closure below)

Samples: **Settings**, the 1,307-control census maximum; **Media Center**, the structurally
different shared `player`/`video`/`music` root. Settings cat3 remains 10/10 (0 dense regions on
glass, 13/13 contextual and shared) and cat4 remains 10/10 at 960×680, 260×170 and 1264×765.

Media cat3 first FAILED at 6/7 treated/shared: `header.medialib-browser__head` was the one bare
contextual landmark. It now uses `ContextualSurface`; the rerun is 7/7 with dense-on-glass 0.
Media cat4 first FAILED at compact only: `.medialib-shell` was 126px wide with 158px hidden
content. The compact toolbar now removes repeated visible labels while keeping them accessible;
all three sizes pass with horizontal failures 1 → 0. Both harnesses' adverse controls fired and
restored. Cat3 also gained the missing 450ms all-glass restore settle after its first Settings
run falsely read a CSS transition as 2 stuck regions; the re-run moved 0 → 1/2 → 0 as required.

`sampled-out:` Agent, Library, Novels, Reading Finder, Dictionary, Grammar, Notebook, Translate,
Anki, Flashcards, Game Arena, Statistics, Resources, Sticky Note, Visualizer, Music widget,
City, Immersion, Calendar, YouTube, Scraper, Aero shell, Wired shell, and Blanc shell. Media,
Video and Music are represented by their one shared Media Center root.

### Bullet 1 — CLOSED 2026-09-01. RULE C 16 of 16. `2ae5fa57`, `12c2b10a`, `4ece2839`, `<this>`.

The remaining twelve cells, each with its own control firing in its own run. No category failed
at this point, so no expansion across the sampled-out list was owed.

| cat | Settings | Media Center (Video) | control that discriminated |
| --- | --- | --- | --- |
| 1 accessibility | 10/10 | 10/10 | 5 injected defects moved 0→2 contrast / 5→7 sub-32 / 0→2 WCAG 2.5.8 / 0→1 unreachable, all restored, rect drift 0 |
| 2 clunkiness | 10/10 | 10/10 | dead end + modal trap + scroll trap injected 0→1 each, restored 0 |
| 5 UI clarity | 10/10 | 10/10 | separate `-control` run FAILED as required on Q2, Q3, Q4, Q5, Q10 |
| 6 feature parity | 10/10 | 10/10 | per-row mutations: each fell **exactly its own row** (+ its declared cascade), 0 unexpected, all returned |
| 7 performance | 10/10 | 10/10 | `--jank` 120 ms blocks: p95 17.6→100.4 ms, over-100 frames 0→12 (Settings); 16.9→100.3 and 0→12 (Video) |
| 8 honest states | 10/10 | 10/10 | raw key + placeholder + mute-pair injected 0→1 each against a 9,784-key / 106-namespace catalog, restored 0 |

Numbers behind the two that are only ever quoted as ratios. **cat1:** Settings 70 text runs, min
contrast 6.18:1, 51 controls, 0 keyboard-unreachable, 0 WCAG-2.5.8 failures, 5 sub-32px by rect
and **0 by hit box** (`.fwin-b` carries `lq-hit`); Media 79 runs, min 4.76:1, 33 controls, same
zeros. Reduced-motion emulation took and released on both: 46→0→46 over-threshold animations on
Settings, 40→0→40 on Media. **cat8:** 0 raw keys, 0 placeholders, 0 mute pairs on either; all
four languages differ from English by 166 of 267 runs on Settings, so the surface is really
translated rather than falling back. Media declares 2 empty-state hosts and names both.

**cat7 scene and ceiling, without which the ms mean nothing.** 3 `.fwin`s / 991 window elements
/ 1,116 document elements, viewport 1264×821, dpr 1; process uptime 14,786 s, so the restart bar
is met. This session's ceiling is **16.7 ms p50** (60 Hz), not L0's 10.0 — the L0 rows are kept
as provenance only. Settings drag p50 16.7 / p95 17.6 / 0 over 100; resize 16.7 / 16.9 / 0;
theme swap painted in 48.1 ms and restored in 97.2. Video drag 16.7 / 16.9 / 0; resize 16.7 /
16.9 / 0; theme painted 44.2 ms. Main-process block under each surface's heaviest real work:
**23.6 ms** (Settings, 24 pages × 2 = 48 navigations) and **8.8 ms** (Video, 40 disclosure
cycles over 7 tiles / 639 px), both far under the 500 ms bar, both restored to their start page.

**Instrument correction 39, and the run it VOIDed first.** cat7 Settings scored **VOID** on its
first pass: `heavy` answered `REFUSE: only 38 of 48 navigations ran`. Nothing was wrong with the
app — the load reached all 48 ticks and restored the rail. The leg was written at a fixed 110 ms
tick against a **19-page** rail (38 ticks, 4.2 s, inside the 5 s window); the rail is **24 pages**
today, so 48 fixed ticks need 5.28 s and the sampling window shut first. Every gesture in that
run was already paid for when the arithmetic voided it. The tick interval is now DERIVED from a
declared 4,200 ms budget (`min(110, budget/ticks)`, floor 45 ms, REFUSE above it) and the run
records what it used — 87 ms here. A fixed interval rots on the one thing a settings rail
reliably does, which is grow a page.

`sampled-out:` unchanged from the four cells above — Agent, Library, Novels, Reading Finder,
Dictionary, Grammar, Notebook, Translate, Anki, Flashcards, Game Arena, Statistics, Resources,
Sticky Note, Visualizer, Music widget, City, Immersion, Calendar, YouTube, Scraper, Aero shell,
Wired shell, Blanc shell. Media, Video and Music share the one Media Center root that was scored.

### Bullet 2 — IN PROGRESS. First repair: the collapsed Media rail had no names.

Bullet 2's own words send you at labels and icon semantics, and no rubric category asks that
question directly — so it was asked of the source and then of the running app. The Media Center
sidebar collapses to a 58px icon rail under `@container mc (max-width: 820px)`, and that rule
carried `display: none` on the wrapper holding every destination's `<strong>` name.

Measured live at an 800px `.mc-root` (container width driven 1042 → 800 → 1042, restored):
**11 controls, 8 of them lost their own name.** Six fell back to `title` and announced their
DESCRIPTION — `Home` announced as "Your media at a glance (Ctrl+1)", `Library` as "All local
media (Ctrl+2)", and so on through `Video`, `Music`, `Study Mode`, `Discover`. Two — `Media
workspace` and `Media Settings` — carry no `title` at all and announced **nothing**. Only 3 of
11 survived. None of these buttons has an `aria-label`, so the wrapper was the only name.

Fixed by clipping rather than removing, the treatment `.medialib-view__head > span` already uses
one container query away. Re-measured in the same session: **unnamed 2 → 0, name-lost 8 → 0.**
The rail is pixel-identical — sidebar 58 px, all 11 buttons 43 px wide, icon offset 14 px (16 px
for the group chevron), 0 painted text runs, 0 horizontal overflow on any button, the rail or
the root. Wide stays 206 px with 11 painted labels.

Negative control, injected and withdrawn in the same run: a stylesheet forcing `display: none`
back onto the three wrappers moved the reading 0 → 8 name-lost / 2 unnamed and naming exactly
the same eight rows; removing it returned 0 / 0. Guard: `mediaVideoMinimalism.test.ts`, 3 tests,
proven discriminating by a byte-restored source mutation (dropping `.mc-nav button > span` from
the clip rule fails it; the file restored `-ceq` identical).

The decoration that names no control — the brand wordmark, the `Browse` / `Library status`
captions, the `em` count badge — still uses `display: none` and is asserted to keep doing so, so
this is not a licence to un-hide the rail.

### Bullet 2 — 13 of 16 cells PASS, 1 FAILS, 2 unrun. NOT closed.

Settings was asked the same compact-width question and **already answers it**: at a 400px
`.os-set-body` the rail collapses 204 → 52 px, and all 25 items keep their own name, 0 unnamed,
0 falling back to `title`, names byte-identical to the wide reading, rail restored to 204. Its
own CSS comment (`styles.css:27081`) says `display: none` "is WRONG here" for exactly the reason
Media Center was failing — so the correct treatment was already written down in this repo, one
surface away, and Media Center had the defect anyway. Six controls still paint at 52px; all six
are empty-text dots/glyphs (`.os-set-adv-dot`, `.os-set-advanced-glyph`), fully inside their
host, rail overflow 0 — the earlier "painted" count was my reader appending a separator for
empty text, not a leak.

| cat | Settings | Media Center (Video) |
| --- | --- | --- |
| 1 accessibility | 10/10 | 10/10 |
| 2 clunkiness | 10/10 | **FAIL — latency** |
| 3 Liquid utilization | 10/10 | 10/10 |
| 4 use of space | 10/10 | 10/10 |
| 5 UI clarity | 10/10 | 10/10 |
| 6 feature parity | 10/10 | 10/10 |
| 7 performance | not run | not run |
| 8 honest states | 10/10 | 10/10 |

Controls that discriminated: cat1 5 injected defects moved and restored, rect drift 0; cat2
Settings dead-end + modal-trap + scroll-trap 0 → 1 → 0; cat5 a separate `-control` run failed as
required on Q2/Q3/Q4/Q5/Q10 on both; cat6 every mutation felled exactly its own row and returned;
cat8 raw-key + placeholder + mute-pair 0 → 1 → 0 on both. cat2 presentation parity: Settings
liquid 7 ≤ standard 7, Media liquid 5 ≤ standard 5, geometry and presentation restored.

**THE FAILURE, and it repeated three times.** Media Center's global search is over the 100 ms
input-response bar on its first keystrokes. Typing `jojo` into `.mc-global-search input` with
Library already open: **129.9 / 145.9 / 134.8 ms** for the first keystroke across three
consecutive runs, and 99.2 / 112.3 / 101.4 for the second — 1, 2 and 2 samples over the bar. The
tab switch is not the cause; the task navigates to Library first, so `setTab` never fires. Bullet
1 measured 99.4 ms on the same task an hour earlier — under the bar by 0.6 ms — so this is a
marginal cost that has been sitting on the line, not a regression from this turn's CSS. Per the
banked one-reading rule it was repeated before being filed, and it repeated.
`MediaCenterView.tsx:1999` calls `media.setQuery` synchronously on every `onChange`, and the
library filter runs in the same commit.

**Instrument correction 40 — clicking into a text field is not a dead end.** cat2 Settings first
scored FAIL/`deadEnds` on step 1: the click moved no text, controls, scroll or focus, because the
field already held focus from an earlier leg. Correction 11 had already masked the focus channel
for a self-focusing click, so nothing could rescue the step. Checked against the product before
touching the instrument: with Settings raised a real OS click at the field centre focuses it, and
focusing an empty box changes nothing else — 45 controls / 903 characters before and after. The
verdict now exempts a click that leaves a TEXT-ENTRY element holding the caret, and nothing else;
proven not to blunt the bar because the same run's injected dead end still moved 0 → 1 → 0.

Two run-shape notes the next turn needs. The cat2 Settings task needs a trailing `wait:2800`:
bullet 3's landing scroll is still moving when the idle window opens and the run VOIDs on
undeclared churn. And `--both-presentations --control` are not implied — without them
`costParity` reads UNMEASURED and no control runs at all.

### Exact next: fix the Media global-search keystroke cost, then cat7 ×2

`MediaCenterView.tsx:1994-2012`. The bar is 100 ms and the measured first keystroke is 130-146.
Re-measure with the same task and require three consecutive runs under the bar, not one. Then
cat7 on both surfaces closes bullet 2 at 16/16.

---

## 2026-09-01 — bullet 2 CLOSES 16/16. The overnight FAIL was desk load; the cost under it was real

**The FAIL did not reproduce, and that is the first thing to record.** Same HEAD, same task, same
surface, same clean resting state (`base` 79 textRuns / 32 controls, box 1080x679 — byte-identical
to the FAIL's own base), next session: **93.2, 102.5, 84.7, 84.9, 98.4, 85.1** worst-keystroke
against last night's **129.9 / 145.9 / 134.8**. Bullet 1 had read 99.4 an hour before the FAIL.
Two unrelated surfaces had risen together that night — Settings 43.7 → 59.9 (+37%) on its own
unchanged task, Media 99.4 → 129.9 (+31%) — which is the desk-load signature `cat7-perf.cjs`'s
header already warns about in its refusal #1. cat2 records the SURFACE's box but no desk-wide
window or element count, so it cannot see that confound; cat7 can. **A cat2 latency FAIL should be
repeated in a fresh session before it is filed against a surface, not merely repeated in the same
one** — three consecutive runs an hour apart proved only that the desk was still loaded.

**The cost under it was real anyway and is now fixed** (`326d1cc7`). `query` lives in `useMedia`,
so committing every keystroke re-rendered the whole Media Center synchronously.
`useDebouncedValue(query, 80)` at `MediaContent.tsx:575` protected the FILTER; the JSX was
unprotected. `/type` sends its characters in a tight `for` loop with no pacing
(`debugBridge.ts:471-479`), so the ~33 ms gaps between the four `input` events were not driver
delay — they were the renderer's own synchronous work, and the four rAF callbacks all landed in
ONE frame. That is the descending `inputRecv` shape (129.9 / 99.2 / 64.5 / 26.2 share a `paintAt`);
read it as "no frame painted for 130 ms", never as "the first keystroke cost 130 ms".

`GlobalSearchField` is memoized and holds its own in-flight text, committing on a 70 ms timer —
under the 80 ms the filter already waits, so results cost nothing. Discover opts out
(`deferMs=0`): `submitQuery` is a `useCallback` over the hook's own `query`
(`DiscoverContent.tsx:324`), so an Enter arriving before a deferred commit would submit the
previous character. Music opts out too — its cost was never measured.

| leg | before | after (3 consecutive) |
| --- | --- | --- |
| inputRecv | 85.1 / 58.9 / 39.3 / 19.3 | 8.9/5.3/3.3/1.5 · 8.4/6.8/4.8/2.0 · 8.3/6.7/3.5/1.7 |
| per keystroke | ~20-26 ms | ~2-4 ms |
| overBar100 | 0 (1 of 6 readings over) | 0, 0, 0 |

`worstRecv` is now the Video→Library click (61.6 / 60.5 / 57.1), not the typing.

**Live functional check, driven through `/type`, with its negative control:** 11 cards → `jojo`
2 cards → `zzzzqq` **0 cards and the honest empty state** → cleared, 11 back. Typing from the Video
tab still lands on Library and filters to 2, so the line-2007 navigation branch survives deferral.

### The 16 cells

| cat | Settings | Media Center (Video) |
| --- | --- | --- |
| 1 accessibility | 10/10 | 10/10 |
| 2 clunkiness | 10/10 | **10/10** (was FAIL — `cat2-l10b2-media-fixed.json`) |
| 3 Liquid utilization | 10/10 | 10/10 |
| 4 use of space | 10/10 | 10/10 |
| 5 UI clarity | 10/10 | 10/10 |
| 6 feature parity | 10/10 | 10/10 |
| 7 performance | **10/10** | **10/10** |
| 8 honest states | 10/10 | 10/10 |

cat2 re-score carries its own control (dead-end + modal-trap + scroll-trap 0 → 1 → 0) and
`costParity` liquid 5 ≤ standard 5, presentation and geometry restored. cat7 both surfaces:
findings `[]`, voided `[]`, scene 3 fwins / 991 fwin elements / 1116 document elements /
1264x821 / dpr 1, **session ceiling p50 16.7 ms** — this display is 60 Hz and L0's 10.0 ms is
recorded as provenance only, never as the bar. Heavy legs proved themselves: video cycled 40
disclosures over 7 tiles and 639 px and restored; settings ran 24 pages ×2 = 48 navigations at
87 ms and restored to Home, which is correction 39's budget-derived tick holding at the real
rail size. `sampled-out:` Music, Discover, Study Mode, Readiness, Review, Home, Library — RULE C
scores two representative surfaces, and these were not measured for this bullet.

**Instrument note, and it exonerates the harness.** Three of my own runs scored the opening
`click:.mc-nav > button:nth-of-type(2)` as a dead end. That was correct and the fault was mine:
a run leaves `jojo` in the field, and with `media.query` non-empty the product's own line-2007
branch keeps the surface on Library, so clicking Library really did move nothing. **A cat2 run on
this surface must start from an EMPTY search field, not merely the right tab** — `base` reads
79/32 when it is clean and 100/41 when it is not, which is the cheapest way to spot it.

## L10 bullet 4 — no feature duplicated into competing control systems (2026-09-01)

**Instrument: `cat6-feature-parity.cjs --mode duplication`, not a new probe.** `--mode parity`
asks whether a feature is REACHABLE in both presentations; it cannot tell one route from
three. Scope is a product fact rather than a DOM heuristic: a control counts only when its
primary label appears verbatim in the EN catalogs (8,379 values, 9 files), so a shelf of
media tiles carrying the user's filenames drops out with no "is this a list" rule to go
stale. Primary label = first text segment, then `aria-label`, then `title` — that order is
what dissolved reconnaissance's one false positive, where Video's Subtitles and Generate
share a single disabled-reason tooltip and title-first collapsed them into a duplicate.

**Two real defects, both live, both fixed in `34324fb3`.**

| surface | before | after |
| --- | --- | --- |
| Video | "Media workspace" in nav-rail@157,635 **and** app-toolbar@811,204 | crossSystem `[]` |
| Settings | "Memory & storage" in nav-rail@79,1124 **and** content-body@305,734 | crossSystem `[]` |

Video's toolbar copy shared the stage CTA's handler byte-for-byte and was enabled on exactly
the condition that RENDERS that CTA, so it was never the only route — one feature, three
control systems. Settings' Home tile was a byte-for-byte copy of `settings.nav.memory` while
going somewhere else (it deep-links `backup`); nine of the ten quick actions name the ACTION
against the rail's DESTINATION, and this was the exception. It now uses `search.backup`.

**Control, both runs:** a duplicate is planted by overwriting one control's first text node
with another system's label; crossSystem must rise by exactly 1, name that pair, and return.
Both ends must be SINGLETONS — the first run planted onto the control that was already half
of the real duplicate, destroyed one group while creating another, read delta 0, and scored
VOID on a sweep that had in fact seen the plant.

**`topbarActions` was re-derived, and this is the uncomfortable half.** Deleting the
duplicate dropped cat6 Video to 9/10: the row read `acts.length === 3 && on >= 1`, and BOTH
terms were satisfied only by the control being deleted. The instrument had banked the defect
as the contract. The replacement is strictly stronger — the count is keyed to
`mc-button-primary` identity instead of a literal, exactly one of {topbar entry action, stage
entry actions} must exist, and a NEW `liveSomewhere` clause requires the page to offer at
least one enabled entry point. All ten mutations still flip exactly their own row.

### The 16 cells

| cat | Settings | Media Center (Video) | derived |
| --- | --- | --- | --- |
| 1 accessibility | 10/10 | 10/10 | this turn |
| 2 clunkiness | 10/10 | 10/10 | carried from bullet 2 (`b95b7d95`) |
| 3 Liquid utilization | 10/10 | 10/10 | this turn, `--presentation liquid` |
| 4 use of space | 10/10 | 10/10 | this turn |
| 5 UI clarity | 10/10 | 10/10 | this turn, control run banked separately |
| 6 feature parity | 10/10 | 10/10 | this turn, 10/10 rows both presentations |
| 7 performance | 10/10 | 10/10 | carried from bullet 2 (`b95b7d95`) |
| 8 honest states | 10/10 | 10/10 | this turn, `--langs` |

Twelve of sixteen re-derived at this HEAD; cat2 and cat7 are carried because removing a
control and renaming a tile can neither create a dead end in the scored tasks (Library nav +
global search; the Settings rail walk) nor raise a cost. Said plainly so it is not read as
sixteen fresh runs. `sampled-out:` Music, Discover, Study Mode, Readiness, Review, Home,
Library.

**A number that moved against me, banked rather than dropped.** cat3 on Settings first read
FAIL — because I had left the window on **Appearance** for cat8's language leg, not because
of anything this bullet touched. On Home it is `liquidTreatedEligible 13/13`,
`sharedPrimitiveEligible 13/13`. On Appearance it is **12/26 and 12/26**: fourteen
Liquid-eligible regions with no treatment and no shared primitive
(`cat3-l10b4-settings-appearance.json`, `contextualTreated` and `sharedPrimitives` both
false, control `movedOne` true / `allWorkFailed` true / `returned` true). That page is
sampled out of this bullet, so it is not scored here — it is an open finding for a later
turn, and the instrument note it carries is that **cat3's Settings score is page-scoped, so
a cell must name the page it was taken on.**

**Trap paid for again:** editing `MediaCenterView.tsx` HMR-reset BOTH Media Center windows to
the Library tab, and the next `--app video` run correctly refused with "the video surface is
not open". Click the Video nav entry back before scoring, and re-read `videoPage` to confirm.

## L11 bullet 1 — the keyboard leg opens (2026-09-01, NOT closed)

`cat1-accessibility.cjs --mode keyboard`, a MODE on the category-1 harness (RULE 1). The
default mode already answers `unreachable` — how many controls REFUSE focus — which is
focusability, not a traversal, and cannot see the four things the bullet names: the order you
arrive in, whether you can see where you are, whether you can get out, and whether a screen
reader is told anything at each stop. **It presses a real Tab** through the bridge's `/key`
route (`sendInputEvent`), because a dispatched `KeyboardEvent` does not move focus in
Chromium — a synthetic walk would report one stop and call every surface a trap.

**Media Center (Video): PASS 10/10.** 36 stops, 0 unnamed, 0 unringed, 0 unpainted, 0 traps,
3 order inversions (reported, not scored). Exits correctly to `button.os-start-btn "Start"`.
Control: a stripped focus ring on stop 3 moved `unringed` 0 -> 1 -> 0 with stops 36/36/36.

**Settings: FAIL `walkTerminates`, and this is an OBSERVATION, not yet a filed defect.** The
walk reaches **7 stops** — five chrome buttons, `Search settings`, one button named `theme` —
and then focus falls to `document.body`. It never reaches the 25-item rail or the Home cards.
Reproduced twice, identically. What is NOT yet discriminated: the Video walk proves the
instrument can cross out of a surface (it reached Start), so a fall to `body` is not the
instrument giving up — but "last tabbable in the document, wrapping through body" has not been
ruled out. **Next turn's first act:** press one more Tab from `body` and record where it
lands; if it re-enters at the top of the document, this is normal wrap and the bar needs the
wrap case; if it stays on `body`, the settings rail is keyboard-unreachable past `theme`.

**Two instrument corrections, both made before anything was scored.** The first run named six
Video toggles `"on"` — that is a checkbox's default `value`, not a name. Labels (`for=` then
a wrapping `<label>`) now resolve first and `value` is never a name for a checkbox or radio;
the six read Auto-pause / Loop line / Furigana / Dual sub / Dictation mode / Shadowing mode,
so there was no product defect there, only a false pass waiting to happen. The second: the bar
was written as `cycleClosed` and scored Video FAIL because Tab correctly handed focus to the
desktop Start button — a non-modal window is SUPPOSED to hand off, and trapping would be the
defect. It is now `walkTerminates`: back at its own start, or on a visible, named host control.
Every walk also re-seeds, because the second walk of the control run started outside the
surface and returned 0 stops, and the control compared 36 against 0 and VOIDed a working probe.
