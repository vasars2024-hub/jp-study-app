# HANDOFF P1 — Scraper, probed live

Written incrementally during the run (`jp-dispatch` §7). Findings table:
`docs/audit/FINDINGS_P1_SCRAPER.md`.

## 1. Scope and ownership

| | |
|---|---|
| Branch | `audit/a-evidence` — **not** cut from; dispatch §2 forbids branching/committing |
| Base commit | `dbb74f7` |
| Owned | `docs/audit/HANDOFF_P1_SCRAPER.md`, `docs/audit/FINDINGS_P1_SCRAPER.md` — **these two files only** |
| Foreign | everything else, read-only |

`git status --porcelain` at the end of the run is **identical to its state at the start**, plus my
two files. No `src/` edit, no `git add`, no branch, no commit, no stash, no `.gitignore` or
`styles.css` touch. The nine pre-existing `M`/`??` entries under `docs/migration/**` and
`src/renderer/styles.css` are another run's and were left alone (`jp-dispatch` §2).

**Dispatch overrides, recorded because `jp-dispatch` requires it:**

- §2 of that skill says "branch first before your first write". The dispatch says **do not branch
  or commit**. Dispatch wins.
- §3 says "do not start, restart or kill the app". The dispatch explicitly instructs this run to
  start it on a scratch profile. Dispatch wins.

## 2. How the app was run

```
npx electron-forge start -- --user-data-dir=%TEMP%\jp-p1-scratch
```

launched from the repo root via `cmd.exe`, output to a scratchpad log outside the repo.
`%TEMP%\jp-p1-scratch` was **deleted before launch** — Probe B is only meaningful on an empty
profile (`honesty-probe` §3 B).

Bridge came up at port **39273**, pid **56308**. `%APPDATA%\jp-study-app` was **never opened**;
see §9 for the before/after.

### First-run states, all as the dispatch predicted

| Predicted | Observed |
|---|---|
| Full-viewport consent gate | present — *"Put your country on the map?"*. Declined via `button.consent-no` at (632, 586). **No telemetry sent.** |
| Zero floating windows | `document.querySelectorAll('.fwin').length` → **0** |
| Zero desktop icons | whole desktop was 92 characters of text |

### How the Scraper was opened — and the near-miss worth recording

**Start menu → Scraper.** The first click was **refused by `click.ps1`'s hit-test guard**:

```
HIT-TEST MISMATCH — target: button[data-p1="start-scraper"]
point: (66, 768)   actually: <div> class='os-start-backdrop'
```

The refusal was correct. The tile sat at `y = 723–813` while its scroll container
`.os-start-groups` occupies `y = 254–704` with `overflow:auto` and `scrollHeight 934 >
clientHeight 450` — the element was **clipped out of the painted area**, so its
`getBoundingClientRect()` was honest and the pixel was not there. After
`scrollIntoView({block:'center'})` the same click hit-tested `match` at (66, 479) and opened the
window. **A run that had reached for `-Force` here would have clicked the backdrop and filed
"the Start-menu entry for the Scraper is dead."** The guard earned its place a second time; the
dispatch's instruction to believe it is right.

Window opened at 820×580, maximised to **1264×773** for the drive.

## 3. Denominator — re-derived live, never quoted

Every figure below was measured against the running app, then checked against source.

| Set | Source of truth | Live count | Agrees? |
|---|---|---|---|
| Rail pages | `SCRAPER_PAGE_IDS`, `shared/scraperShell.ts:34-52` | `.scr-rail-item` → **17** | yes |
| Drawer categories | `SCRAPER_SETTINGS_GROUPS`, `settings/fields.ts:123-144` | `.scr-drawer-rail button` → **19** | yes |
| Result tabs | `SCRAPER_RESULT_TABS`, `shared/scraperShell.ts:63-71` | `.scr-tab` → **6** default, **7** with torrents on | yes, conditionally — see `P1-F2` |
| Exposed setting paths | `settings/fields.ts` | `rg "\bpath: '"` → **164** entries / **163** distinct, + **3** `toPath` = **166** | `CENSUS_SETTINGS.md` §2 **CONFIRMED** |
| Advanced-gated fields | `settings/fields.ts` | `rg 'advanced:\s*true'` → **12** | confirmed live, per category |
| Build-status entries | `featureStatus.ts:66-237` | UI roll-up `All 49 · shell 0 · untested 21 · ready 28` | hand-recount matches all four |

**26 / 26 depth-3 surfaces reached** — the exact figure `CENSUS_SURFACES.md` §4 attributes to this
app (19 drawer + 7 result tabs). **17 / 17 rail pages reached.**

Drawer arithmetic closes exactly: 164 declarative fields − 12 advanced + 8 hand-rendered
(UI 7, Profiles 1) = **160 rows**, which is what I counted live across all 19 panes.

## 4. What was driven

### 4.1 Real jobs run

Four, against the live catalogue — the app's ordinary function, on a scratch profile:

| job | target | duration | result |
|---|---|---|---|
| `job-msdyy93h-1` | "Cowboy Bebop" | 6 s | 26 episodes, 0 failed |
| `job-msdz20o1-2` | "Monster" | 6 s | 1 episode, 1 failed |
| `job-msdz5wuz-3` | seeded schedule, `example-anime-site.com` | **53 s** | ONE PIECE, 1,147 found, 1,078 failed |
| `job-msdz7aak-4` | "Cowboy Bebop", torrents enabled | 6 s | 26 episodes + 41 nyaa.si releases |

### 4.2 All 17 rail pages

Each navigated with a hit-tested click and snapshotted (heading, character count, control
histogram, empty/loading/error state). **No page was EMPTY-SILENT** — every one rendered real
content and a real empty state on a fresh profile. `honesty-probe` §3 D's calibration warning was
worth heeding: I nearly filed History as broken (§4.4).

### 4.3 The "412 GB" claim — two sites, not one

Driven on Downloads: `Remaining: 0 MB · Free space: 412 GB`. Driven on New Scrape: the pre-flight
strip reads `Free space 412 GB`. `DataPages.tsx:410` computes it; **`NewScrapePage.tsx:404` is a
bare string literal** and the dispatch did not know about it.

Real value measured the same minute: `Get-PSDrive C` → **42.7 GB free, 908.8 GB used**. The claim
is ~10× the truth on a nearly-full disk, and the warning threshold derived from it
(`freeBytes * 0.8` = 329.6 GB) can effectively never fire.

### 4.4 `stageBreakdown()` — and an instrument error I made first

**The error, recorded because it is exactly what `claim-check` §4 is about.** My first look at
History after a completed job read `All jobs 0` and I began writing it up as a defect. It was my
instrument: `listJobs()` is async and I sampled one round-trip after navigation. Polling to
settlement showed `All jobs 1, hasCowboy=true`. **I made the same mistake twice** — the Source
Manager handoff (§4.6) also read as dead before it had settled. Both would have been fabricated
findings. Anything measured one round-trip after a navigation on this app should be re-measured.

The real finding needed three jobs of two durations:

| job | duration | stage seconds | stage percentages |
|---|---|---|---|
| Cowboy Bebop | 6 s | 0 / 2 / 2 / 1 / 1 | **8 / 34 / 31 / 16 / 11** |
| MONSTER | 6 s | 0 / 2 / 2 / 1 / 1 | **8 / 34 / 31 / 16 / 11** |
| ONE PIECE | 53 s | 4 / 18 / 16 / 8 / 6 | **8 / 34 / 31 / 16 / 11** |

Seconds scale linearly with the total; percentages never move. A 1-episode extract and a
1,147-episode extract report the same share. `percent: Math.round(weight * 100)`
(`DataPages.tsx:1005-1016`) takes no input at all.

### 4.5 The seeded schedules

Fresh profile, Scheduled Tasks: `SCHEDULES 2 / ENABLED 1`, both targets rendered as
`https://example-anime-site.com/...`. `Resolve-DnsName example-anime-site.com` →
**"DNS name does not exist."** The domain appears **3 times** in `src`
(`ManagementPages.tsx:217`, `:227`, `strings.ts:197`).

**An unintended side effect I caused, stated rather than hidden:** reaching for *Run now* I used a
`-Force` click on `.scr-page .ui-btn:not(.ui-btn--primary)`, which landed on **Duplicate** and
produced `"Schedule duplicated in a paused state."` Contained to the scratch profile, and I then
drove *Run now* properly (tagged selector, hit-test `match`). It is why the notice names *"One
Piece weekly update **Copy**"*. `-Force` is a mistake here and I should have found a unique
selector first, which is what I did on the retry.

*Run now* then produced the 53-second ONE PIECE job above. **The NXDOMAIN target was never
fetched** — the run reports `provider: AniList`, `seriesId: anilist-21` — and nothing tells the
user the configured URL was substituted.

### 4.6 The two dashboard handoffs — one works, one does not

The dispatch flagged both as hypotheses. They resolve differently, and the difference is the
interesting part.

**Source health → Source Manager: LIVE.** Five trials with a varied input, because one click
proves nothing: health row 4 → `openRow=4 handoffRow=4` on 3/3 trials; row 2 → `openRow=2`;
row 6 → `openRow=6`. Control arm — reaching the page from the rail instead — leaves every row
collapsed. The number moves with the input, which is what makes it a measurement.

**Recent anime → Results: DEAD.** Two trials with two real indexed series: rail moves to Results,
`2 series` listed, `.scr-results-inspector` **absent** both times. Root cause measured, not
inferred: `buildResultLibrary()` re-tags every entry as `` `${jobId}:${seriesId}` ``
(`resultLibrary.ts:15-17`, `:36-37`), so Results holds `job-msdz20o1-2:anilist-204541` while the
Dashboard passes the bare `anilist-204541` (confirmed via `scraperListJobs()` →
`["anilist-204541","anilist-1"]`). `resolveResultSeriesHandoff` requires exact membership,
returns `null`, `DataPages.tsx:149` returns early.

**The Phase-4 fix that made `page.results` correct is what broke this.** The comment at
`resultLibrary.ts:7-13` explains the id change; the Dashboard caller was never updated. Reading
`entry.seriesId` was never the problem — the *target's* id space moved underneath it.

### 4.7 The Episodes table's RESOLUTION column

All 26 rows read `2160p`. The persisted `episodeProcessing.resolutionPriority` is
`[2160,1080,720,480]`; the engine sets `resolution: preferredResolution` where that is
`resolutionPriority[0] + 'p'` (`main/scraper/engine.ts:320-322`, `:338`; the catalogue path at
`:410` falls back to it when no stream resolved, which is every row here — `Streams(0)`). The
column echoes **the user's own preference** under a header that reads as measured fact.

**Not driven, and I am not claiming it:** I did not vary `resolutionPriority` and re-scrape. The
static chain is the evidence; the live differential is unproven and the row says so.

### 4.8 Settings — probe E, with a positive control

**Channel tested: renderer `localStorage`, key `jp-scraper-settings-v1`.** Not main-process JSON;
the row names the channel as `honesty-probe` §3 E requires.

Flipped `logging.persistToDisk` (*"Write Logs to Disk"*) `true → false` via the visible
`.ui-toggle__track` — the `<input>` itself measures 0×0 and `click.ps1` correctly refused it.
Re-read the key: `false`. **Reloaded the renderer: still `false`.** So these settings persist
correctly; the failure is failure-mode 2, orphan, not failure-mode 1.

Read-site count over all of `src` excluding tests, the three schema modules, `fields.ts` and
`featureStatus.ts`:

| key | read sites |
|---|---|
| `persistToDisk` | **0** |
| `prettyPrint` | **0** |
| `memoryBudgetMb` | **0** |
| `maxParallelJobs` *(positive control)* | 4 — incl. `main/scraper/engine.ts:813`, `:870` |
| `batchSize` *(positive control)* | 4 — incl. `main/scraper/engine.ts:513` |

The controls prove the instrument can find a consumer that exists, so the zeros carry information
(`claim-check` §4). Live consequence on screen: the **Performance** pane renders 7 controls of
which **5 are inert**; `logging` is 7 of 9 and `export` 7 of 8. Nothing in the drawer
distinguishes them.

Two settings that *do* work, recorded because a probe that only files defects is not measuring:
**Advanced controls** (new key `jp-scraper-advanced-v1`, +12 fields exactly where predicted,
survives reload) and **shell persistence** (`page`/`drawerOpen`/`drawerCategory` all restored).

### 4.9 Probe F — the drawer's control histogram

All 19 panes at the shipped default, 160 rows: **77 toggles · 36 numbers · 21 selects · 20 text ·
32 buttons · 0 textareas.** Toggles are 48% of the surface and there is **no primary action** in
the whole drawer.

Read carefully: the drawer auto-persists, so "no Save button" is a design choice, not a defect —
it is recorded because it is one of `honesty-probe` §3 F's named proxies, not because it is bad.
The real F reading is `P1-E4`: **a fifth of the surface does nothing and looks identical to the
rest.** Per §7 the ranking of that is the user's call; the counts are the deliverable.

Lazy-CSS proxies were counted but are **not reported as findings**, deliberately. `inlineStyle`
was 1 per pane (a progress-bar width) and the "native control with no app class" count is just the
visually-replaced `<input type=checkbox>` inside each `.ui-toggle`. Reporting those as sloppiness
would have been a fabricated finding.

### 4.10 The 7th result tab

At the shipped default only 6 tabs render — `sources.mode` defaults to `streaming`. Switching
Source Manager to **Both** (persisted: `sources.mode = both`) and re-running produced the Torrents
tab with **41 real nyaa.si releases, 1,199 seeders, 7 batches, 7 with Japanese subtitles**. Real,
good, and invisible to a default-configuration user.

## 5. What could not be reached, and why

Four control families inside surfaces I did visit. All are `NOT-REACHABLE` rows in the findings
table — never silence, never a pass (`honesty-probe` §4).

| Family | Why |
|---|---|
| Downloads pause / retry / cancel | fresh profile → `listDownloads()` empty → *"The download queue is empty."* No rows to click. **The static shape is unambiguous** (`DataPages.tsx:413-444` — `setRows` + `setNotice`, no `window.api.*` in any of the three), which is why it is filed rather than dropped. |
| Plugins enable / update / install | `INSTALLED 0`; *Install from file* opens a native OS dialog the bridge cannot drive, and `jp-bridge` §11 forbids OS-level automation. |
| qBittorrent transfer controls | `not configured`, no client on this machine. |
| Seanime acquisition (send / debrid / auto-downloader) | sidecar `stopped` all run; `Torrent client Off · Debrid Off`. |

Also unmeasured: whether the schedule **Duplicate** I triggered by accident survives a reload
(§4.5), so I cannot separate `LIVE` from a React-only mutation and did not claim either.

## 6. Registry accuracy

Full table in `FINDINGS_P1_SCRAPER.md`. The short version: **`featureStatus.ts` is the most honest
thing in this app** and its Build Status roll-up is a real derived count — I recounted all four
figures by hand from `:66-237` and every one matched.

Two gaps, both of the same kind — the honest unit is the *field*, and a group-level dot cannot
express it, which the file itself says at `:172-175`:

- **`set.logging` and `set.export` carry no inert-field note at all**, and they are the two worst
  groups in the app (7 of 9, 7 of 8). `set.performance`, `set.images`, `set.extraction` and
  `set.metadata` all name theirs explicitly. These two are the omission.
- **`page.results` is correct about itself and is the cause of `P1-C1`.** No per-page registry can
  catch a break in a *different* page's handoff. Worth saying out loud, because it is the one
  failure mode this otherwise-good mechanism is structurally blind to.

## 7. Defects noticed in code I do not own

- **`main/scraper/engine.ts`** — `resolution: preferredResolution` (`:338`, `:410`) publishes a
  user preference as a per-row measured property (`P1-B5`). Recorded, not fixed.
- **`main/scraper/**`** — a run whose configured target is unreachable answers from the catalogue
  and reports `provider: AniList` with no indication of the substitution (`P1-D1`).
- **`MONSTER` search** returned `MONSTER (Music)`, 1 episode, 1 failed check, for a 74-episode
  series. Outside my scope; noted only so the next run does not read my job table as a defect in
  its own right.
- **1,078 failed checks out of 1,147** on the ONE PIECE run, reported as `done`. History labels it
  a Problem correctly. Not diagnosed — outside this dispatch.

## 8. Gates

**Not run, deliberately.** This run made no `src/` change, so no gate can be affected by it, and
running a suite during a live drive would violate `jp-bridge` §9 (no tree change under
measurement). Stating that rather than pasting a green log someone else's tree produced.

## 9. Shutdown and restoration

- App closed via `eval.ps1 -Js "(() => { setTimeout(()=>window.close(),200); return 'closing' })()"`.
- `debug/bridge.json` **gone**; `Get-Process electron` → **no processes**. Clean exit.
- `%APPDATA%\jp-study-app` — **never opened, and provably unchanged**:

| | before | after |
|---|---|---|
| top-level files | 31 | **31** |
| newest file write | 2026-08-02 09:39:20 | **2026-08-02 09:39:20** |
| directory `LastWriteTime` | 2026-08-02 09:40:18 | **2026-08-02 09:40:18** |

- `%TEMP%\jp-p1-scratch` left in place — it holds the profile behind every finding above, so a
  reviewer can re-open it. Delete it freely; nothing depends on it.
- `git status --porcelain` matches its session-start state plus my two files.

## 10. Open questions for the user

1. **`KNOWN_ISSUES.md` still does not exist** (`git ls-files | rg -i known_issues` → no output,
   re-checked this run). `honesty-probe` §6 says its location is yours to agree, not mine to
   guess, so I created nothing. These findings resolve into rows in it once it exists.
2. **`P1-B1`/`P1-B2` are the two rows I would fix first**, and they are one-line deletions. A
   storage warning whose threshold is invented is worse than no warning: on this host it would
   stay silent through a download queue ten times larger than the free disk.
3. **The starter schedules (`P1-B4`) ship enabled and point at a domain that does not exist.**
   Whether to ship seed schedules at all is a product call.
4. **`P1-C1` is the cheapest high-value fix in this set** — the expensive half is built and
   correct; the Dashboard needs to pass `librarySeriesId(jobId, seriesId)` or Results needs to
   accept a bare series id. That is a decision about which id space is canonical, which is yours.
