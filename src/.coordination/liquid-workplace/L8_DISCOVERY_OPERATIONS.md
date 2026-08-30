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
