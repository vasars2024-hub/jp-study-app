# L8 — Discovery, operations, and configuration

Order per the plan: Resources → Scraper → Settings → YouTube → Music.
Surface argument for every category harness: `--surface "@.fwin:has(.res-view)"`.

## 2026-08-28 — Resources, categories 1/3/4 closed, 5 partial

Opened on codexA's `8cb935f2` (the ContextualSurface seam). That commit verifies clean:
6/6 in a detached worktree at its own SHA, with the tree's foreign dirt excluded. codexA
died 61 s later on a mangled worktree path (`jp-liquid-resources-8cb935f2` created INSIDE
the repo); removed, nothing was stranded.

| cat | verdict | numbers | control |
| --- | --- | --- | --- |
| 1 accessibility | **PASS 10/10** | 303 measured, minRatio 5.30, failing 0, under32 5 (all `fwin-b` chrome), 2.5.8 fails 0, unreachable 0, motion 0 | moved all 5 legs, back to baseline |
| 3 liquid utilization | **PASS 10/10** | 246 regions, denseWorkOnTranslucent 0, eligible 1 treated 1 shared 1 | 0→1→10→0, "FAILED AS REQUIRED" |
| 4 use of space | **PASS 10/10** | clipped 0 / overlaps 0 / hscroll 0 at 820x580, 260x170, 1264x765; dead 5.6 / 0.6 / 9.3 % | injected clip 0→1→0 |
| 5 ui clarity | **VOID** | Q1,2,3,5,6,10 YES · Q4 NO · Q7,8,9 VOID | Q2,Q3,Q5,Q10 failed as required |
| 2, 6, 7, 8 | not yet scored | — | — |

Fixes, each re-scored in its own commit: `ef22e31e` `b6148a82` `219b1762` `301119b5`.

### Three traps, all of which produced a wrong number here first

**1. A stale search box silently halves the surface.** The first cat1/cat3/cat4 runs scored
62 text nodes and 56 regions and I called cat1 10/10. An earlier session had left `"dict"` in
the catalogue field, so `showLanding` was false and the heat map, bundles, My-tools and New
sections never rendered. The honest surface is **303 text nodes / 246 regions**. Clear the
field and confirm `showLanding` before any Resources run — cat4's maximized dead region read
15.9 % filtered and 9.3 % unfiltered, i.e. the FAIL was the state, not the layout.

**2. `dataset.theme = 'classic-light'` does not repaint enough to measure.** A probe that
flipped it read `.res-card` as compositing to 12,25,18 — dark — and concluded the light themes
were already at 9.59 and needed nothing. `ef22e31e`'s message says so and is **wrong**.
The cat5 harness switches themes properly: classic-light was the WORST cell on the page,
`.res-cost` at **1.37** with 47–54 failing runs. Never score a second theme by writing the
dataset; use the category-5 harness, which reports both cells and asserts the axis moved.

**3. Category 3's control cannot prove itself against a dirty baseline.** It read
`movedOne: false` → VOID before the fix, because the baseline already held 1 dense-Work-on-
translucent region, so injecting one more could not move the count. That is not a broken
probe. Run this control **after** the fix.

### Two decisions worth not re-litigating

Colour that must stay legible across themes **mixes its hue into `--text`**, it does not name a
value and it does not use a `light-dark()` pair. `.bundle-card-gem` at 45 % hue and the three
`.res-cost` variants at 32 % clear both cells at once (forest-night 5.30, classic-light 5.17)
and cost nothing when a new theme lands. The chip fills and borders keep the raw accent —
they are identity, not text.

`.res-controls-right` is **Work**, not contextual tooling: it holds the catalogue text field,
so it sits back down on `--lq-anchor-bg` while the category chips beside it keep the seam.
That is what "selective" means here, and it is the whole of category 3's failure.

### Next slice, in order

`cat6-feature-parity.cjs` first — it is a hard dependency, not a preference: cat5's Q7, Q8 and
Q9 are `MEASURE` and read `baselines/cat6-l8-resources.json`, so **cat5 cannot leave VOID
until cat6 has run**. Then cat2 (needs a `--task`; the natural one is a category chip then a
bundle card, undo back to All), cat7, cat8. Then re-run cat5 whole.

Category 5's one standing finding is **Q4**: `collapsedDisclosures 0`, `scannedControls 10`
(All + 7 category chips + Refresh + Search). The bar wants ≥1 collapsed disclosure and ≤12
scanned. It is at 10 of 12 with no disclosure at all, so adding categories pushes it over;
the fix is a disclosure, not a trim.

## 2026-08-29 — Resources category 7 closes; surface reaches 70/80

Recovered from `72fe0890`, whose last reliable state was a measured theme finding, not an
uncommitted patch. Scored on fresh main PID **45964**, uptime **447 s**, with the same seven-window
desk and the landing state restored to All / empty search.

| leg | measured result |
| --- | --- |
| drag / resize | p50 **16.7 / 16.7 ms**, p95 **16.9 / 33.5 ms**, **0 / 0** frames over 100 ms |
| theme | target **0** frames over 100 ms, max **83.6 ms**; hidden-target control **1 / 0**, max **116.9 / 83.6 ms** |
| heaviest work | **44** filter cycles (**22 category / 22 landing**), exact chip restore; main max **36.6 ms** vs 500 ms bar |
| sensitivity | injected jank produced **12** frames over 100 ms |

The product defect was 256 simultaneous `fill` transitions on the interactive SVG countries.
Each path now keeps its country hover/tooltip and opts out of that theme-wide transition. Two
larger alternatives were measured and discarded: canvas made resize p50 **33.4 ms**; concatenated
SVG groups made the real category-cycle load block main **2,055.6 ms**. Neither ships.

The reusable category-7 harness now measures theme's multi-window background cost with only the
requested surface root hidden, then restores the root's exact inline style. This is surface-
parameterised and fixes the attribution error the live hidden-map control exposed: a bare
compositor can be clean while six other app windows still spend one frame repainting.

Resources is **70/80**: categories 1, 2, 3, 4, 6, 7 and 8 are controlled 10/10. Category 5 is
the only open cell; Q4 still requires one collapsed disclosure, followed by the whole cat5 run.
Evidence: `baselines/cat7-l8-resources.json`; guard: `resourcesBundleSetup.test.ts` **7/7**.

## 2026-08-29 — Resources closes at 80/80; the "at rest" trap that nearly buried it

Recovered codexA's interrupted Q4 slice (it died 9 min after `0fa65fbe` with the edit on disk,
uncommitted). The New-resources block is now a **collapsed `<details>`/`<summary>`** rather than
a `<section>`/`<div>`: the cards are still one keystroke away, `Tab` reaches the summary, and
nothing was deleted — Q4's bar wants a disclosure, not a trim, and this is the disclosure.

| leg | measured result |
| --- | --- |
| cat5 score | **PASS 10/10** — all ten YES, `findings []`, `voided []` |
| Q4 specifically | `collapsedDisclosures` **1** (was 0), `scannedControls` **10** of 12, `behindDisclosure` 0 |
| Q5 theme axis | forest-night min **5.30** / classic-light min **5.17**, 246 runs each, 0 failing |
| Q7/Q8/Q9 | read from `baselines/cat6-l8-resources.json`: parity 8/8 = 8/8, roundTrip diffs 0 |
| negative control | **FAILED AS REQUIRED on Q2, Q3, Q5, Q10** — 4 of 4 moved, residue 0, `storeIdentical` true |

**The trap, and it published a false FINDING first.** The first post-disclosure run scored
**9/10** with `Q3 primaryAction: input.gram-search, insideBodyViewport: false`, which reads
exactly like the disclosure having pushed the search field out of view. It had not. An earlier
probe left `.fwin-body` at **`scrollTop: 1563`**, so the field sat at `top: -1364` — a screen
and a half above its own window. The layout never changed; **the leftover scroll was the whole
finding**. Same family as the stale-`"dict"`-in-the-search-box trap above: leftover UI state
manufactures false failures as readily as false passes.

So the harness is repaired once, surface-parameterised as RULE 1 requires: **`bodyScrollTop` is
reported in every cat5 snapshot, and a non-zero one REFUSES** — "at rest" (Q3) and "the default
state" (Q4) are undefined on a body somebody else scrolled. Verified by running it against the
still-scrolled window: `REFUSE - body is scrolled 1563px off its resting position`. `--allow-scroll`
scores anyway for a surface that genuinely restores an offset on mount, and the recorded number
is what then makes that score arguable rather than asserted.

**Resources is 80/80** — categories 1–8 all controlled 10/10. Evidence:
`baselines/cat5-l8-resources.json` + `-control.json`; guard `resourcesBundleSetup.test.ts` **8/8**.
Next surface in L8's order: **Scraper**, then Settings, YouTube, Music. Every category harness
now exists, so each is a RUN, not a BUILD.

## 2026-08-30 — Scraper category 1 closes at 10/10

The handoff selector `.scraper-app` does not exist; the live product root is
`@.fwin:has(.scr-shell)`. The first controlled run exposed **69** pointer footprints below
32px, one WCAG 2.5.8 spacing failure, and an unfocused search popover occluding **18** controls.
The repair keeps dense passive rows while giving buttons, fields and selects a 32px floor;
search now stays open within its composite and closes when focus leaves it.

| leg | controlled result |
| --- | --- |
| contrast | 73 measured, minimum **5.28**, failures **0** |
| targets | 72 controls, below-floor-by-hit **0**, WCAG 2.5.8 failures **0** |
| keyboard / motion | unreachable **0**; reduced-motion overruns **0** |
| negative control | all five legs moved; scored counts restored **0 / 0 / 0 / 0** |

Evidence: `baselines/cat1-l8-scraper.json`; regression `scraperSearchFocus.test.tsx`
**1/1**. Scraper is **10/80**; next run is the existing category-2 harness.

## 2026-08-30 — Scraper category 2 closes at 10/10

Dominant task: qBittorrent → Network → qBittorrent, one click each way. First run found
receive-to-paint **218.0 / 171.5 ms** in Standard/Liquid (inert control **0.5 ms**). Marking
the shared-shell category swap as a React transition makes the re-render interruptible;
the controlled re-run is **3.0 / 1.2 ms**, cost **1:1**, dead ends/modal traps/scroll traps
**0/0/0**, idle churn **0**, and the state hash restores exactly. The negative control moved
each defect **0→1→0**. Evidence: `baselines/cat2-l8-scraper.json`; focused tests **4/4**.
Scraper is **20/80**; next run is the existing category-3 harness.

## 2026-08-30 — Scraper category 6 closes; categories 3 and 4 remain measured findings

The existing surface-parameterised category-6 harness now carries Scraper as its eighteenth
spec: **7/7 Standard = 7/7 Liquid**, zero drive refusals, exact field/shell round trip, and
seven mutations each flipped exactly its own row and restored to 7/7. It changes only local
drawer/rail/search state; it never starts a scrape or network request. The first run's search
row was void because the instrument required a closed combobox's unmounted popup node; the
one allowed harness repair now measures its retained `aria-controls` contract instead.

| leg | measured result |
| --- | --- |
| cat6 parity | **PASS 10/10**, 7/7 both presentations, round-trip diffs **0** |
| cat3 initial | contextual treatment **0/8**, dense Work on translucency **1** (`.scr-tags`) |
| cat3 repair | treatment **8/8**, but dense Work regressed to **23** and control did not move |
| cat4 initial | default overlap **7**; compact clipped/overlap **180/10**; maximized hscroll **3** |
| cat4 repair | default/maximized geometry cleared, but compact remained **119/5/1** and growth regressed |

The category-3 and category-4 repair attempts were fully reverted: the one-repair-per-harness
limit prevents tuning their instruments or product twice in this turn. Next category-3 slice
must use nested opaque anchors inside contextual parents; next category-4 slice needs a true
compact drawer composition without widening the chrome ratio. Evidence:
`baselines/cat6-l8-scraper.json`. Scraper is **30/80** with categories 3, 4, 5, 7 and 8 open.

## 2026-08-30 — Scraper category 5 contrast repair; cell remains open

The first category-5 run found the active drawer label at **2.19:1** and the stored-credential
status at **2.71:1** in classic-light. Selection and credential state remain encoded by their
accent/status fills and borders; their readable copy now uses the theme text foreground.
The one allowed post-repair run measured forest-night **5.56** minimum and classic-light
**5.86**, 73 runs per theme and **0** failures.

Category 5 does not close: Q4 counted **50** controls because the live persisted settings
drawer is open, and Q6 is correctly NO-SUBJECT until category 3 provides Liquid regions.
Evidence: `baselines/cat5-l8-scraper.json` (VOID, with Q5 repaired and the two blockers named).

## 2026-08-30 — Scraper category 3 closes at 10/10

The previous turn's attempt was reverted after contextual treatment reached 8/8 but dense
Work regressed to **23**: glass on the chrome puts every field inside it on glass. This slice
takes the ledger's own prescription — nested opaque anchors inside contextual parents.

`.scr-topbar`, `.scr-rail`, `.scr-statusbar` and `.scr-drawer` adopt `ContextualSurface`; the
drawer's head, category rail, pane head and footer need no class of their own because they
read the drawer's material through transparent boxes. `.scr-search`, `.scr-drawer-search` and
`.scr-fields` become `AnchorSurface bare` — the fill is `--lq-anchor-bg` = `--panel`, which is
exactly what each already sat on, so conventional pixels are unchanged.

| leg | measured result |
| --- | --- |
| base | dense work on translucent **0**, treated **13/13**, shared primitive **13/13** |
| control A | one Work region blurred: **0 → 1**, restored to 0, material returned |
| control B | all-glass: **22 of 22** Work regions failed, then restored |
| presentation | standard↔liquid geometry diffs **0** on 10 regions; round trip diffs **0** |

**The trap.** Marking only `ul.scr-rail-list` did not remove the misclassification, it moved
it up one wrapper: `div.scr-rail-group` then read as dense work for the same reason — three or
more `<li>` descendants and no landmark tag — because the instrument demotes a container to
`Anchor(holds work)` only while a DESCENDANT is still Work. The rail therefore declares the
navigation role at all three levels (`-scroll`, `-group`, `-list`), each painting nothing.

Second product defect, independent of Liquid: `.scr-tags` painted `--surface-input`, measured
`rgba(0, 0, 0, 0.28)`. Every other consumer of that token is a lone `input` on an opaque panel;
this one is a region, and it was the surface's only pre-existing dense-work-on-translucent
finding. The tint moved to the image layer over an opaque `--panel` base — same composited
colour, real anchor. Regression: `scraperLiquidRegions.test.tsx` **5/5**; the flush-edge
exceptions are pinned by `liquidWindowPresentation.test.ts` **38/38** (a two-line selector
failed its `anchoredOn` check — every exception must start with the interior host on one line).
Evidence: `baselines/cat3-l8-scraper.json`. Scraper is **40/80**; open: 4, 5, 7, 8.

## 2026-08-30 — Scraper category 4: the default size is clean, two sizes are not

Category 4 is a RUN of the existing harness, no new probe. First run FAILED all three
geometry bars at all three sizes. One product defect accounted for the whole DEFAULT leg:
`.scr-rail` is 52px collapsed but `.scr-rail-scroll` and `.scr-rail-status` measured **70px**.
The rail is a single-column grid, a column's automatic minimum is the largest min-content of
its items, and the running/idle LABEL is the only item still rendering text when collapsed —
so it floored the track at 70, `overflow: hidden` hid the 18px spill, and both rail rows
overlapped the drawer beside them (`18x352`, `18x71`) at every size. The label goes
`sr-only`, not `display: none`: the state is the one thing that block exists to say. The
harness already excludes a 1x1 absolutely-positioned node from `hiddenOverflowX`, so this
does not trade one finding for another.

| leg | before | after |
| --- | --- | --- |
| default 820x580 | overlaps **6**, hiddenOverflowX **1** | **0 / 0 / 0 / 0** |
| compact 400x248 | clipped 6, overlaps 6, hscroll 1, hiddenX 2 | clipped **6**, overlaps **5**, hscroll **1**, hiddenX **1** |
| maximized | overlaps 2, hscroll 3, hiddenX 2 | overlaps **1**, hscroll **3**, hiddenX **1** |

Category 4 does NOT close and is not parked — two measured findings remain, both real and
neither caused by this slice. (a) At 400x248 the shell does not reflow: `div.fwin-body`
hides 400px of content in 248, `.scr-topbar-actions` clips six controls, and the drawer,
rail and footer stack on top of each other. (b) Maximized with the drawer open, the
dashboard's tables force `main.scr-main` to **1611>664** and `.scr-page` runs 41px under the
status bar. Evidence: `baselines/cat4-l8-scraper.json`; regression
`scraperRailCollapse.test.tsx` **2/2**. Next category-4 slice: the compact reflow, because
it is the larger of the two and the drawer/rail/footer stacking is its root cause.

## 2026-08-30 — Scraper category 4 closes at 10/10; the harness was scoring a phantom

Recovery turn. `backup` died holding a complete, tested, staged category-4 slice; it was
re-derived and banked unchanged as `50c9b2c2`, not rebuilt. It closes the compact leg
outright — 400x248 goes from clipped 6 / overlaps 5 / hscroll 1 / hiddenX 1 to **0/0/0/0**.

Two findings remained, and only one was product.

**The overlaps bar was measuring a box nobody paints.** `div.scr-page x footer.lq-contextual
(632x41)` is `.scr-page` at 4182px tall inside a 598px `main.scr-main` (`overflow: auto`):
the harness paired regions by their RAW `getBoundingClientRect()`, so the page's rect ran
straight through the status bar. This is not a Scraper quirk — uncorrected it fires on every
surface whose scrolling pane holds more than one screen, which is most of them. Correction 18
clips each region to its non-visible-overflow ancestors first (`0ccb762c`). Its own negative
control, because `--control` only ever planted a *clipped* box: a translucent unclipped
469x462 div planted in `.scr-shell` produced **6 overlaps at all three sizes**, verdict FAIL;
removed, and the shell's inline style asserted back to empty; without it the same legs read
**0**.

**The real defect was one shape in two tables** (`cf698db0`). `main.scr-main` measured
**1611>664**: the mirror's 15 columns have a 1582px min-content and the indexer's 9 have 909,
both inside a 606px card, and nothing between the row and `.scr-main` scrolls — so the whole
page scrolled sideways. No tier could ever have reached them: the track lists were inline
`gridTemplateColumns`, which outranks a container query. They now come from `--scr-cols` set
in CSS, queried against `.scr-main` rather than the shell, because the pane is what a table
actually gets once the rail and an open drawer are paid off the shell.

**No column deletes a value.** Every column a tier hides is re-rendered as `.scr-t-fold` in
its own row — load-bearing for the indexer, which has no per-row inspector at all, and for
the mirror's speeds/size/category/tags/completion, which its inspector does not carry.

| leg | box | clipped | overlaps | hscroll | hiddenX | dead |
| --- | --- | --- | --- | --- | --- | --- |
| default | 820x580 | 0 | 0 | 0 | 0 | 3.2% |
| compact | 400x248 | 0 | 0 | 0 | 0 | 1.8% |
| maximized | 1264x765 | 0 | 0 | 0 | 0 | 4.3% |

contentGrowsNotChrome holds: chrome **90 → 63.1** while the canvas rises **93.7 → 95.3**.
Control: injected clip **0 → 1 → 0**, removal proven. Every leg restored.

**Trap — the harness labels legs by ORDER, not by measured size.** Run it with the window
already maximized and `default` records 1264x765 while `maximized` records 820x580; the
surface then fails contentGrowsNotChrome on nothing but its starting state. That exact false
FAIL cost a run here. Restore the window before measuring.

Regression `scraperTableReflow.test.tsx` **5/5** + `scraperNarrowReflow.test.tsx` **3/3**.
Pre-existing, not introduced: `MIRROR_COLUMNS` labels are raw English literals, not `sx()`
keys. Evidence: `baselines/cat4-l8-scraper.json`. Scraper is **50/80**; open: 5, 7, 8.

## 2026-08-30 — Scraper categories 5 and 7 close; category 8 is the last cell (primary)

`e8bfa3ef` `1b330e8e` `3a49bdae`. Scraper **50/80 → 70/80**. Open: **8 only**.

**Category 5 — 10/10, and the first 10/10 was measured on a hidden page.** Q4 read
50 scanned against a bar of 12; 40 were the settings drawer, open as probe residue.
The product half is the defect that number found: the top bar's settings control was
`aria-pressed`, so a screen reader announced "not pressed" for a closed panel and
nothing linked the control to the region it opens. It is now `aria-expanded` +
`aria-controls` (APG disclosure), with the id in `drawerId.ts` because the drawer is
`lazy()`-loaded and a direct import would undo the split.

**Harness correction 19**, symmetric: `collapsed` already counted
`[aria-expanded="false"]`, so ARIA was already `<details>`-equivalent on the closed
side. `inDisclosure` excluded every `<details>`' contents INCLUDING OPEN ONES, but
charged an `aria-controls` region in full. Guards: a region containing its own toggle
is ignored; the toggle is never excluded. Its control lives in `--control` now — two
8-control panels, one unmarked and one self-declaring, both still counted; scanned
**12 → 34**, `CONTROL FAILED AS REQUIRED on Q2, Q3, Q4, Q5, Q10`, residue 0.

**Then the state itself was wrong.** `@container scr-shell (max-width: 1100px)` sets
`.scr-shell.is-drawer-open .scr-main { display: none }` — correct, documented. At
820px with the drawer open, `main.scr-main` is 0x0, so cat5 and cat8 were scoring the
DRAWER. Re-run in the product default (`drawerOpen: false`): 73 text runs → **576**,
and 17 classic-light runs failed at **2.71:1**. `.scr-pill--good` and every
`.scr-seed.is-high` used a `--status-*` FILL token as text — same root cause as
`2a7082f5`, one page over. Repaired with the existing `--success-text`/`--warning-text`/
`--danger-text` family; border keeps the tone. classic-light min **2.71 → 5.71**,
failing **17 → 0**, forest-night 5.30. Q4 on the true default: **12 against a bar of
12**, `ariaDisclosures: []` — with the drawer closed the 10/10 does not rest on
correction 19 at all.

**Category 7 — 10/10, a SPEC not a probe.** Load is navigation, measured not assumed:
all 17 pages swept live, largest Dashboard 551 elements / 61 rows, Results/Downloads/
Site Rules/Plugins/three testers **0 rows** (last scrape 19d ago), so
`scrollAll('.scr-shell')` would have picked `scr-drawer-pane` (1,315 px, the largest)
and measured the drawer. Ceiling p50 **16.7** (60 Hz), scene 1 fwin / 892 elements.
drag 16.7/16.9/17.0/0, resize 16.7/16.8/16.9/0, theme 16.7/16.8/66.9/0; heavy main max
**67.5 ms** vs a 500 ms bar, idle 8.7, span 4,518 of 4,500. Proof: `17 pages x2 = 34
navigations, restored to Torrent Manager`. `--jank`: p95 16.9 → **116.9**, over-100
**0 → 12**.

**Category 8 — FAIL, two named bars, and neither is a mystery.** 1,215 text runs,
rawKeys **0**, placeholders **0**, `statesNamed` **1 of 1** ("qBittorrent has no
transfers."). Failing: (a) `mutePairs` **6** — six disabled buttons on Torrent Manager
with no title/description: Send selected to Seanime, Send selected to debrid, Run
auto-downloader, Simulate enabled rules, Send 0 to qBittorrent, Clear Selection. Their
conditions are compound (`backendBusy || !selected.size || state !== 'ready'`), so the
explanation must be derived, not one fixed string. (b) `languagesDiffer` **false** —
one hash `746643145` across all four languages, `htmlLang` correctly en/ja/zh-Hans/ru,
`restored: true`. Not a defect discovered here: `strings.ts:3` documents a DELIBERATE
i18n deferral, 588 keys English-only. That is a decision to revisit, not a bug to patch.

**Trap.** Building a HEAD+edit blob for `scraper.css`, reading HEAD as `latin1` and
writing `Buffer.from(s,'latin1')` truncated the em dash in the replacement to the low
byte **0x14**. A control character was in the staged blob while the worktree file was
correct. Check the BLOB, not the file you edited.

Evidence: `baselines/cat5-l8-scraper.json`, `cat5-l8-scraper-c19-control.json`,
`cat7-l8-scraper.json`, `cat8-l8-scraper.json`.

### Decision — the Scraper's i18n deferral is LIFTED (2026-08-30, primary, standing auto-approval)

Recorded so the next turn executes rather than deliberates. `strings.ts:3` defers i18n
for this app, and its stated reason is explicit: *"~400 strings x 4 languages is not
worth paying while these surfaces are still shells."* **That precondition is now false.**
The Scraper is a 17-page application scoring **70/80**, with category 6 feature parity
at 7/7 in both presentations, live qBittorrent and MAL integration, and 1,215 rendered
text runs. It is not a shell, and CLAUDE.md's i18n policy puts application chrome in the
shared catalogs. Category 8 cannot reach 10 while `languagesDiffer` is false, and no
harness change can honestly make it true — the surface really does render identical
English in all four languages.

So: migrate. The module's own comment already names the shape and it is mechanical —
move the map into `catalogs/{en,ja,zh,ru}.ts` and swap `sx()` for `useT()`'s `t()`.
Tradeoff accepted: this is ~588 keys x 3 languages, clearly more than one turn's tail.
It is a multi-turn slice, not a blocker, and it is what the turn after the mute-pair fix
opens on.

Two things measured now so that turn does not rediscover them:
- **58 of the 588 keys are FUNCTIONS**, not strings (`sxn(key, n)`, e.g.
  `'acq.episode': (n) => \`episode ${n}\``). The shared `t()` contract has to carry these
  or they need restructuring into interpolated keys first. Settle that before the bulk
  move, because it decides the shape of all 588.
- **Adding English-only keys to `catalogs/en.ts` is not a staging step.** The
  catalog-hygiene test in `shared/__tests__/i18n.test.ts` fails on any `en` key without a
  ja/zh/ru pair, so each batch lands complete in four languages or not at all. Migrate in
  key-prefix batches (`app.*`, `nav.*`, `acq.*`, …), running `node tools/i18n-check.cjs`
  per batch, rather than in one 588-key commit.

Not deferred by this decision: study **content** stays literal — series names, episode
titles, release groups — per CLAUDE.md i18n rule 4 and `strings.ts:16`.

### 2026-08-30 — Scraper category 8: mute pairs CLOSED, and two instrument defects that hid it

**Category 8 = FAIL, one bar, measured.** `mutePairs` **6 → 0**, rawKeys 0, placeholders 0,
`statesNamed` 1 of 1 observable, negative control moved all three counts and returned to
baseline. The one failing bar is `languagesDiffer`, which is the 588-key English-only
deferral `c1f2d76c` already decided to lift. Scraper stays **70/80**; the bar that moved is
inside category 8, which does not close until the i18n migration lands.
Evidence: `baselines/cat8-l8-scraper-mutefix.json`. Fix `f8a4a80e` → amended `1a2b195f`.

**The fix.** `disabledReason.ts`: `firstReason(...checks)` returns the first failing clause
and the call site spends the same value as `disabled={!!why}` and `title={why}`, so the two
cannot drift. `engineReason` quotes the sidecar's own per-engine message. Ordering decided
here (standing auto-approval): **engine before selection** — "tick a torrent first" is true
and useless when the engine is stopped, because the user selects a row and the button stays
off. All **10** disabled controls in the page are covered, not the 6 a resting probe saw.
Live after: *"Torrent client is not ready — Seanime sidecar is stopped. Fix it in Seanime,
then Refresh."*

**Instrument defect 1 — correction 20.** `languagesDiffer: !LANGS || …` made the bar
vacuously TRUE without `--langs`, so a run that never opened Settings printed **PASS 10/10**
with a fifth of the category unmeasured. Now `'UNMEASURED'`, which the verdict already knows
how to report.

**Instrument defect 2 — correction 21.** `distinctHashes > 1` is satisfied by ONE label.
Measured here: 4 distinct hashes and the en→ja diff was **1 run of 1,186** — the `.fwin`
title, `Scraper` → `スクレイパー`, shared window chrome outside the app. The other 1,180 runs
never moved. The bar now also needs `diffShare > 0.01`; the Scraper measures **0.0008** and
correctly FAILS. The floor is low enough not to punish a Japanese-content-heavy surface for
having little chrome, high enough that no single chrome label carries it.
**Any cat8 score banked from a run without `--langs` is worth re-deriving.**

**Trap — `git commit --only <paths>` DESTROYS a HEAD+edit blob.** It re-stages those paths
from the worktree; `f8a4a80e` landed with another track's 71 `dash.*` lines (390 insertions
against the intended 319). Stage the blob, then a bare `git commit` with NO pathspec.

**Trap — a multi-line insertion anchor splits the function it aims after.** Seeking the
first `\n` from the anchor's START lands inside a 2-line anchor, and the first amend shipped
a `strings.ts` whose `sx2` was severed from its own closing brace, with a stray `}` at EOF.
Balanced braces and a clean `git diff --cached` both looked right. Only compiling the
committed tree in a detached worktree found it — that check is not optional here.

### 2026-08-30 — Scraper i18n, batch 1 of 588: the mechanism, and 0.08% → 2.87%

**Category 8 is NOT claimed closed, and the reason is worth stating plainly.** After this
batch `languagesDiffer` measures **true** — `diffRunsMax` **33 of 1,151**, `diffShare`
**0.0287**, up from 1 run / 0.0008 — and every other bar passes, so the harness prints
`PASS 10/10` with `--control` moving all three counts and returning to baseline. But
**76 of 588 keys are migrated, 12.9%**, and correction 21's 1% floor is a floor, not proof
of coverage: it exists to reject "not localised at all", which this surface no longer is.
Banking 80/80 on 12.9% would be the flattering number the pin forbids. **Scraper stays
70/80; category 8 closes when the migration does.**
Evidence: `baselines/cat8-l8-scraper-i18n-b1.json`.

**The mechanism, which is what makes the other 512 keys routine.** `sx()` now looks the key
up in the shared catalogs as `scrApp.<key>` and falls back to the local `TEXT` map when it
has not been migrated. **No call site changes** — which is the point: 522 call sites across
21 files, 16 of them carrying another track's unstaged work, is not one commit's worth of
HEAD+edit blob reconstruction, and a half-migrated map with no fallback would render bare
dotted keys at the user (`translate()` returns the key on a total miss).

Keys land in `shared/i18n/scraperUi/{en,ja,zh,ru}.ts` beside the 662 sibling
scraper-settings keys — NOT in `catalogs/en.ts`, which is foreign-dirty. All four modules
are clean, so a plain `git add` is safe there.

Argument naming, fixed now so every later batch matches: `sxn(key,n)` → `{n}` + `count`;
`sxs(key,s)` → `{value}`; `sx2(key,a,b)` → `{a}`/`{b}` + `count`=b; `sxss(key,a,b)` →
`{a}`/`{b}`. Plurals are CLDR categories, so Russian gets one/few/many.

**`ScraperApp` now subscribes to the language store** (`useT()` at the root). Without it the
catalog changes and the tree keeps its English render. Checked before relying on a root
re-render: none of the 40 `useMemo` bodies under `scraper/` calls `sx*()`, and the nav and
settings registries already store KEYS and resolve at render.

**Deferred to a later batch, named so it is not rediscovered:** `torrent.authVia` picks
between two fixed sentences rather than interpolating, so it becomes two keys and is the one
entry in this batch's range that changes a call site. `TorrentManagerPage.tsx:690-709` also
carries five raw JSX literals ("Resume transfer", "Pause transfer", "Force recheck", "Show
save location", and a `Save location: {path}` notice) that violate this file's own ONE RULE
and were never in `strings.ts` at all — they need keys, not a move.

**FINDING for the next turn — cat8's drive leg has an ordering defect.** `driveLeg` asserts
its restore against a `base` captured before the `--langs` leg, so once the language cycle
has re-rendered the surface the restore can never match and the whole run VOIDs. Hit **3
times** this turn; a replay of the same drive in isolation restored cleanly **3 of 3**
(1186 → 1177 → 1186, zero positional deltas), which is what rules the drive itself out.
Not repaired here — one harness repair per turn, and corrections 20 and 21 were spent.
Workaround used: `--langs` without `--drive-input`, which measures the language bar honestly
and leaves `mutePairs` scored on the resting probe only.

### 2026-08-30 — Scraper i18n, batch 2: the always-visible chrome, and why diffShare barely moved

**148 of 588 keys migrated (25.2%)**, +72 this batch: the left rail's 45 nav labels and
descriptions, the 11 status-bar strings, the 5 health words and the 11 job-stage names.
Chosen because they render on all 17 pages rather than on one.

**diffShare 0.0287 → 0.0310** (37 of 1,192 runs). A small rise for 72 keys, and the reason is
worth carrying rather than smoothing: **the shell's persisted state has `railCollapsed: true`**,
so 45 of the 72 keys — every nav label and description — are not painted on the measured
surface at all. The number understates the migration; it does not measure it wrongly. A later
turn scoring with the rail expanded will see a step change from keys that landed here.

**The gate caught one thing worth keeping.** `i18n-check` rejected `scrApp.nav.cpu` in ja as
byte-identical to English (`CPU: {n}%`) — a key that *presence* checks pass and that renders
English under a Japanese UI. Translated to `CPU 使用率: {n}%` rather than baselined; the tool's
own warning against bulk-baselining is the reason. zh escaped it only because it uses a
fullwidth colon. 11,239 → **11,311** English keys, all four languages complete, exit 0.

Evidence: `baselines/cat8-l8-scraper-i18n-b2.json`, `--control` moved all three counts and
returned to baseline. Category 8 still not claimed closed at 25.2%.

**Full-suite note, so the next turn does not chase it.** `npx vitest run` twice on this tree:
**13 failed / 11,886 passed**, then **6 failed / 12,007 passed**, with a largely DISJOINT
failure set (only `flashcardAudio` in both). Every suite checked passes in isolation —
`i18nSplit`, `sourceNulBytes`, `scraperSources`, `dictionaryDb` all green alone, 41/41. Nothing
under `scraper/`, `scraperUi/` or the new guard failed in either run. Two runs, two different
answers, is the shared tree's known flake and not a regression to bisect.

### 2026-08-30 — Scraper i18n, batch 3: Result workflow complete

**249 of 596 keys migrated (41.8%)**, +101 this batch. Every `result.*` entry now resolves
from the shared EN/JA/ZH/RU catalogs: tabs, filters, selection and export feedback, playback
refusals, stored-result recovery, empty states, columns, detail summaries and provenance.
Mechanical comparison reports **101 TEXT / 101 shared / 0 missing / 0 extra**.

`node tools/i18n-check.cjs` passes at **11,412** English keys; the focused i18n suite passes
**21/21**. The first check caught five byte-identical labels; they were translated rather than
bulk-baselined. Category 8 remains open because 41.8% is coverage progress, not completion.

Live acceptance was attempted with the existing parameterised category-8 harness. The inherited
Scraper was absent; reopening it through the debug bridge produced a visible 803.6×568.4 shell,
but its parent `.fwin` remained at computed `opacity: 0`, so the harness correctly VOIDed on
0 painted runs and wrote no evidence file. Per the one-repair rule, no further retry this turn.

### 2026-08-30 — Scraper i18n, batch 4: Dashboard workflow complete

**302 of 596 keys migrated (50.7%)**, +53 this batch. Every `dash.*` entry now resolves from
the shared catalogs: hero and quick actions, series/stat summaries, backend honesty, active and
cancelled jobs, source health, runtime, scheduling and the study handoff. Mechanical comparison:
**53 TEXT / 53 shared / 0 missing / 0 extra**.

`i18n-check` passes at **11,465** English keys and the focused suite passes **21/21**. No second
live harness run was made after batch 3's one allowed repair still left the parent window at
opacity 0; category 8 remains open at 50.7% coverage.

### 2026-08-30 — Scraper i18n, batch 5: app chrome and advanced settings

**357 of 596 keys migrated (59.9%)**, +55 this batch: all 22 `app.*` keys and all 33 `set.*`
keys. Search, compact/advanced mode, menus, saved/reset feedback, tracker ordering, encrypted
credential states and qBittorrent connection feedback now use the shared catalogs.
Mechanical comparison: **55 TEXT / 55 shared / 0 missing / 0 extra**.

The only byte-identical values are the two deliberate `{value}` pass-through templates for
backend connection/error detail. They were added individually to the format-string baseline in
all three locales; no user-facing English was waived. `i18n-check` passes at **11,520** keys and
the focused suite passes **21/21**. Category 8 remains open at 59.9% coverage.

### 2026-08-30 — Scraper i18n, batch 6: Source Manager complete

**399 of 596 keys migrated (66.9%)**, +42 this batch. Every `sources.*` entry now resolves from
the shared catalogs: acquisition mode and its consequences, provider inventory/state/kind and
capabilities, priority order, tests, subtitle/auth badges, and fallback honesty.
Mechanical comparison: **42 TEXT / 42 shared / 0 missing / 0 extra**.

`i18n-check` passes at **11,562** English keys and the focused suite passes **21/21**. Category 8
remains open at 66.9%; 197 catalog keys still fall back to `TEXT` and are not represented as done.

**Denominator correction, measured rather than inherited:** importing `SCRAPER_TEXT` and counting
`Object.keys()` returns **596**, while the handoff's 588 was copied forward without a runtime count.
Therefore batches 1–2 were 76/596 = 12.8% and 148/596 = 24.8%, not 12.9%/25.2%. Runtime
intersection with `SCRAPER_UI_EN` confirms **399 migrated / 197 fallback / 0 ambiguous** now.

### 2026-08-30 — Scraper i18n, batch 7: Script Console complete

**436 of 596 keys migrated (73.2%)**, +37 this batch. Every `console.*` entry now resolves from
the shared catalogs: read-only sandbox states, command execution feedback, unlock guidance, live
log states, and all ten allow-listed command descriptions. Mechanical comparison reports **37
TEXT / 37 shared / 0 missing / 0 extra**.

`i18n-check` passes at **11,599** English keys and the focused suite passes **21/21**. Category 8
remains open at 73.2%; 160 catalog keys still use the English `TEXT` fallback.

### 2026-08-30 — Scraper i18n, batch 8: Export workflow complete

**468 of 596 keys migrated (78.5%)**, +32 this batch. Every `exports.*` entry now resolves from
the shared catalogs: builder scope and format choices, destination preview, locale-aware record
counts, history tiles, and the saved export options. Mechanical comparison reports **32 TEXT /
32 shared / 0 missing / 0 extra**.

`i18n-check` passes at **11,631** English keys and the focused suite passes **21/21**. Category 8
remains open at 78.5%; 128 catalog keys still use the English `TEXT` fallback.

### 2026-08-30 — Scraper i18n, batch 9: New Scrape workflow complete

**496 of 596 keys migrated (83.2%)**, +28 this batch. Every `scrape.*` entry now resolves from
the shared catalogs: URL/title input, proxy and profile choices, reversible start options,
preflight honesty, provider state, progress, and run statistics. Mechanical comparison reports
**28 TEXT / 28 shared / 0 missing / 0 extra**.

`i18n-check` passes at **11,659** English keys and the focused suite passes **21/21**. Category 8
remains open at 83.2%; 100 catalog keys still use the English `TEXT` fallback.

### 2026-08-30 — Scraper i18n, batch 10: Page and history chrome complete

**532 of 596 keys migrated (89.3%)**, +36 this batch. All 19 `page.*` and 17 `history.*` entries
now resolve from the shared catalogs: every page title/description plus job filters, empty and
missing-detail states, reverse actions, and table columns. Mechanical comparison reports **19/19
page keys and 17/17 history keys, with 0 missing / 0 extra**.

`i18n-check` passes at **11,695** English keys and the focused suite passes **21/21**. Category 8
remains open at 89.3%; the operational-prefix tail contains 64 English `TEXT` fallbacks.

### 2026-08-30 — Scraper i18n, batch 11: Discovery and result honesty complete

**572 of 596 keys migrated (96.0%)**, +40 this batch. All 14 `discover.*`, 13 `build.*`, and 13
`results.*` entries now resolve from the shared catalogs: shortlist reversibility, pluralized
episode/chapter counts, mock-versus-working honesty, result recovery, and missing/failure counts.
Mechanical comparison reports **14/14 + 13/13 + 13/13, with 0 missing / 0 extra**.

`i18n-check` passes at **11,735** English keys and the focused suite passes **21/21**. Category 8
remains open at 96.0%; 24 fallbacks remain in downloads/schedule/export/media-type/torrent chrome.

### 2026-08-30 — Scraper i18n, batch 12: Catalog migration complete

**597 of 597 keys migrated (100%)**, +25 shared keys and a +1 denominator change. Downloads,
scheduler holds, export outcomes, and media types moved 23 keys. The conditional `torrent.authVia`
fallback became explicit API-key/password keys at both consumers, so each credential mode has a
real translation instead of interpolating the internal `apiKey` identifier.

Runtime comparison reports **597 TEXT / 597 shared / 0 missing / 0 extra**. `i18n-check` passes at
**11,760** English keys; focused i18n, Liquid-region, disclosure, and disabled-reason suites pass
**43/43**. Category 8 remains open until the parameterised live language/restore run produces
painted evidence; catalog coverage alone does not score the rubric.

### 2026-08-30 — Scraper category 8 closes; surface is 80/80

**Category 8 = PASS 10/10; Scraper = 80/80.** The existing surface-parameterised harness ran
against `@.scr-shell` with `--langs --control`: **1,190** painted text runs, raw keys **0**,
placeholders **0**, mute pairs **0**, and named states **1 of 1 observable**. EN/JA/ZH/RU produced
four distinct hashes; each non-English render changed **119 runs**, diffShare **0.1000**, with
`ui-lang` and `html.lang` restored to English exactly.

The negative control moved raw/placeholder/mute counts **0/0/0 → 1/1/1 → 0/0/0**. Evidence:
`baselines/cat8-l8-scraper-complete.json`. The first invocation correctly refused because Settings
→ Appearance was not visible; after that documented setup, the one allowed retry passed. The
opening `.fwin` briefly reported opacity 0 during `fwinIn`, then settled to 1 with no stuck
animation, so no product or harness repair was made.

## 2026-08-30 — L8 GATE, the searchable half (`6e5ebb57`, `6a951ada`)

L8's gate is "every setting and scraper action remains searchable and keyboard reachable". The
eight rubric harnesses cover the keyboard half (cat1 tab-walks and hit-tests). NOTHING covered
the searchable half, which is why the previous turn held both L8 bullets open at 40 of 40 rubric
cells rather than closing on adjacent evidence. That was the right call.

**Instrument.** `probes/l8-searchability.cjs`, parameterised by `--registry settings|scraper` and
`--page <id>`. One harness, two apps: a new surface costs a RUN. It derives the contract from
source — `pick()` → `navigate(pageId, id)` → `focusSettingId` → the page must contain something
answering to that id.

**Settings, measured then fixed.** 111 entries, **104 landed, 7 not**: `unified-search`,
`media-providers`, `subtitle-providers`, `connection-profiles`, `scraper-network` (five of them
scraper actions), plus `special-modules` and `api-keys`. Each navigated to the right page and then
highlighted nothing. Fixed by ONE shared change instead of seven call sites: `SettingsCard` already
calls `useSettings()`, so it now derives `is-highlight` from its own `id`, ORed with the explicit
prop so all ~109 existing call sites keep working. That also repairs `scraper-network` without
touching `ScraperPage.tsx`, which is mid-rewrite on another track. Result **111 of 111**, control
moves misrouted 0→1 and unanchored 0→1.

**Live acceptance**, pid 22388 / bridge 39273, Settings → scraper page, 17 cards: `unified-search`
→ `hi: ["unified-search"]`; `scraper-network` → `["scraper-network"]` (the file I never edited, so
the shared primitive is doing the work); `media-providers` → `["media-providers"]`; **control**, a
bogus id → `hi: []`. Exactly one highlight each time, never two.

**Scraper: a first number that was wrong, and is recorded as such.** The run read **1 landed of
18**. 17 of those entries carry a page's own nav labelKey — they name a whole page, so navigating
there IS the answer and no card anchor is owed. `landedByPage` now counts them separately. Both
registries corrected read **0 misrouted, 0 unanchored**.

**What that exposed instead — coverage, and it is the real gap.** Counting id'd card destinations
against the search index: Settings **130 destinations / 103 indexed / 27 unsearchable**; Scraper
**28 / 1 / 27**. 27 named Scraper destinations (`qbit-connection`, `torrent-search`,
`export-builder`, `source-health`, `profile-presets`, +22) are unreachable by search. Its registry
is a page index, not an action index. NOT fixed this turn: `scraperRegistry.ts` and `strings.ts`
are both mid-migration on the i18n track. **This is the next turn's opening slice.**

**Trap for the next worker.** `grep -o '<ScrCard[^>]*id="..."'` finds **4** id'd cards; the real
count is **28**. grep is line-based and these ids sit on the line after the tag. It cost a wrong
premise here — "only 4 cards carry an id" — before a multiline node scan corrected it. Count JSX
attributes in node with the `s` flag, never with grep.

**Guard.** `settingsSearchReachability.test.ts`, 6 cases. Its first version was VACUOUS: deleting
the self-anchor left all three source-derived tests green, because a source scan cannot see whether
`SettingsCard` still honours an id. It now mounts a real card under a stub provider; re-running that
mutation fails on `expected 'os-set-card' to contain 'is-highlight'`. The scraper leg carries a
vacuity assertion for the same reason.

Gates: vitest **12,094 passed / 6 skipped exit 0**; i18n **11,776** exit 0; architecture nothing
new exit 0; touched-path ESLint 0 errors.

## 2026-08-30 19:15 — the coverage half closes on both registries (54 → 1)

`d8ecc1bc` `3fc33fd4` `3bcbf770` `66026a46`. The previous turn measured the gap and named it:
Settings 130 destinations / 103 indexed, Scraper 28 / 1. Both are now indexed from their own
cards' keys — no new strings, no new translations, in either app.

    Scraper    28 destinations, 27 indexed, 1 conditional, 0 unsearchable, 0 misrouted/unanchored
    Settings  130 destinations, 129 indexed, 1 conditional, 0 unsearchable, 0 misrouted/unanchored

**Three instrument defects, all found by using it rather than reading it.**

1. **`ScrCard` never implemented the contract the probe assumed.** The implicit-anchor rule —
   "the card primitive derives `is-highlight` from its own id" — was made true of `SettingsCard`
   by `6e5ebb57` and *assumed* of `ScrCard`, which set `data-scr-card` and nothing else.
   `focusSettingId` had exactly one consumer in the whole app, the settings drawer's field paths.
   Measured live before the fix: click "Revision history" → `profile-history` present, `.scr-card.is-highlight` **0 of 11**.
   Fixed in the primitive (+ scroll-into-view, + a non-throwing `useScraperFocusId`), and the probe
   now **reads** `cardPrimitive` for both `is-highlight` and `focus… === id` instead of assuming.
   Control, run against HEAD's ScrCard: `implicitCardAnchor false`, landed **27 → 0**, unanchored **0 → 27**.
2. **The registry parser skipped every entry opening with a comment.** `\{\s*\n\s*id:` missed three
   *already indexed* Settings entries and reported them as gaps — one of them `mal-sync`, the entry
   the pin names as the canonical search defect and which a previous turn had already fixed.
   Entries **111 → 114**; the inherited "27 unsearchable" was inflated by three.
3. **A selection-gated card is not a destination.** `history-detail` renders only inside `{open && (`.
   Classified from the guard preceding the tag, not a hard-coded id, and reported by name under
   `cardDestinationsConditional`.

**Kept open, deliberately, and it is the next slice.** `companions-leave-secret` is indexed with
`pageId: 'companions'`, but that card renders only under Aero/Wired. The probe checks *file-closure*
reachability, not render conditions, so it reads as landed. A registry `themes?:` gate — the shape
`advanced` already has — indexes it honestly and lets `secret-os-leave` in too (currently excluded
on purpose; see its comment at `settingsRegistry.ts:1211`). Until then L8's two bullets stay open
on one named entry rather than closing on a number I would have had to look away from.

**Trap (Carry 26).** `settingsRegistry.ts` is **CRLF in the worktree while its HEAD blob is LF**.
A HEAD+region splice must normalise or it lands 194 CRLF lines in an LF file, which stops
`core.autocrlf` normalising the path and makes the next commit read as a whole-file rewrite.
Sibling files in the same tree (`types.ts`, `scraper.css`) are LF — do not assume per-tree.

Gates: vitest **12,101 passed / 6 skipped**, 1 failed — `scraperSources` "caps the stored history",
`ENOTEMPTY` rmdir on a temp dir, passes alone 13/13, touches nothing here. i18n **11,776** exit 0;
architecture nothing new exit 0; ESLint over all eight touched paths, 0 errors.
