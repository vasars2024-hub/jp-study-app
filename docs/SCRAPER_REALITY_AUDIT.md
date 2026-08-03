# Scraper reality audit

**Date:** 2026-08-02 · **Method:** static read of `src/renderer/components/scraper/**` and
`src/main/scraper/**`. The app was not run (another agent is mid-edit).

## Executive summary

The registry is **much more honest than expected in one half and misleading in the other.**

The port layer is genuinely wired. `src/main/scraper/index.ts:84-110` declares 25 capabilities;
`src/shared/scraperIpc.ts:47-74` lists 26 methods. The only absentee is `testSelector`, and that
is correct by design — it runs in the renderer against a real `DOMParser`
(`data/mockScraperPort.ts:411-431`). **There is a real backend and almost every page reaches it.**

So the failure mode is *not* "the port is fake". It is three narrower patterns:

1. **The Dashboard bypasses the port entirely** for everything except three hero numbers. It is
   the single worst offender and it is the page the user named. Details in §3.
2. **Write-side controls that only call `setState`.** Pause/resume/recheck/remove a torrent,
   pause/retry/cancel a download, enable/update/install a plugin, "Queue selected". Each prints a
   success sentence. None reaches main — the IPC methods do not exist (verified against
   `src/preload.ts`: only `scraperQbitTest`/`Transfers`/`Send`, only `scraperListPlugins`, only
   `scraperListDownloads`). Registry calls four of these pages `ready`.
3. **Invented statistics inside otherwise-live pages** — fabricated per-stage timings, a
   hard-coded free-disk figure, fixture starter schedules pointing at a non-existent domain.

Discover has already been fixed: `pages/DiscoverPage.tsx:125-178` now renders `state.shortlist`
from the live discovery hook, not `SERIES`. The pattern the user described has been removed from
Discover and **still exists verbatim on the Dashboard** (`pages/DashboardPage.tsx:278-293`).

The **settings half of the registry is accurate.** I tested its "inert field" claims against main
and they hold — `maxParallelDownloads`, `memoryBudgetMb`, `cpuThrottlePercent`,
`reuseBrowserContext`, `prefetchNextPage` and `mergeStrategy` have **zero** references anywhere in
`src/main/`, exactly as the comments at `featureStatus.ts:186-200` claim. That half of the file
was written by someone who checked.

---

## 1. Feature table

Verdicts: `LIVE` / `FIXTURE` / `MIXED` / `DEAD` / `BROKEN`.

| Feature id | Registry | Reality | Evidence |
|---|---|---|---|
| `shell.nav` | ready | LIVE | `ScraperNav.tsx:5,27` static page registry; stats from `ScraperApp.tsx:124` `port.systemStats()` |
| `shell.search` | ready | LIVE | `ScraperSearch.tsx:15,36` searches `scraperPages.ts` — static config, not fake data |
| `shell.statusbar` | ready | LIVE | `ScraperApp.tsx:142-151,168-172,461-466` |
| `shell.persistence` | ready | LIVE | `ScraperApp.tsx:90,199,204` → `renderer/scraperShellStore` |
| `page.dashboard` | untested | **MIXED — 3 live numbers, 7 fixture panels** | live: `DashboardPage.tsx:148-171`; fixture: `:26-38,176-182,249-250,278-299,362-363,381,408,451-461,474-480` |
| `page.discover` | ready | LIVE | `DiscoverPage.tsx:33,125-178` — reads `useDiscovery()` state |
| `page.new-scrape` | ready | LIVE | `NewScrapePage.tsx:115,126,153,165` |
| `page.history` | ready | **MIXED** | list live `DataPages.tsx:837-839`; **fabricated stage timings** `:1003-1017` |
| `page.sources` | ready | LIVE | `SourceManagerPage.tsx:97-99,188-199` |
| `page.sources.providers` | ready | LIVE | `SourceManagerPage.tsx:98,270-311` |
| `page.torrents` | ready | **MIXED** | search/mirror live `TorrentManagerPage.tsx:96-111`; **actions DEAD** `:176-201` |
| `page.torrents.acquisition` | untested | LIVE | `TorrentManagerPage.tsx:113-130` → real IPC; unpopulated on this machine. Claim correct. |
| `page.profiles` | untested | LIVE | `ManagementPages.tsx:62-86` — **under-claims**, see §5 |
| `page.scheduled` | ready | **MIXED** | scheduler live `ManagementPages.tsx:364-383,421-436`; **fixture seed** `:212-233,327` |
| `page.site-rules` | ready | LIVE | `ManagementPages.tsx:687-728` — real `fetchHttp` + real extraction |
| `page.plugins` | ready | **MIXED — list live, every write DEAD** | live `ManagementPages.tsx:900-902`; dead `:927-954,1006-1016`; hard-coded `:1043` |
| `page.results` | ready | LIVE (fixture fallback only when empty) | `DataPages.tsx:96-126`; fallback `:121` |
| `page.downloads` | untested | **MIXED** | list live `DataPages.tsx:392-394`; **actions DEAD** `:413-444`; hard-coded disk `:410` |
| `page.exports` | untested | LIVE | `DataPages.tsx:596-625,656-676` |
| `page.selector-tester` | ready | LIVE | `mockScraperPort.ts:411-431` — genuine `querySelectorAll` / `doc.evaluate` |
| `page.regex-tester` | ready | LIVE | `ToolPages.tsx:116-129` — real `RegExp` in renderer |
| `page.http-inspector` | ready | LIVE (one cosmetic lie) | live `ToolPages.tsx:193-211`; static header card `:243-249` |
| `page.script-console` | untested | LIVE | `ToolPages.tsx:362-399` — **under-claims**, see §5 |
| `result.episodes` | ready | LIVE | `result/EpisodeTable.tsx`, fed from `NewScrapePage.tsx:153` |
| `result.details` | ready | LIVE (poster hard-coded) | `ResultPanels.tsx:42-113`; poster `:63` |
| `result.metadata` | ready | LIVE | `ResultPanels.tsx:610-679` |
| `result.logs` | ready | LIVE | `ResultPanels.tsx:683-755` |
| `result.torrents` | ready | **MIXED** | table live `ResultPanels.tsx:315-392`; **"Queue selected" DEAD** `:423-427` |
| `result.streams` | ready | LIVE | `ResultPanels.tsx:242-271` — real media-workspace handoff |
| `result.images` | untested | LIVE | `ResultPanels.tsx:471-606` — **under-claims**, see §5 |
| `set.*` (20 groups) | mixed | LIVE (persist) — consumption as documented | `settings/ScraperSettingsDrawer.tsx`, `settings/fields.ts`; inert-field claims verified, see §5 |

---

## 2. Where the registry over-claims

Ranked by how visible the lie is to a user actually using the app.

### 2.1 `page.dashboard` — registry `untested`, reality mostly FIXTURE

Ranked first even though `untested` is not `ready`, because the registry's *comment* is the
over-claim. `featureStatus.ts:75` says only "storage, learning, the activity strip" are not live.
In fact **seven** panels are fixture, including the three most prominent. Full detail in §3.

### 2.2 `page.plugins` — registry `ready`, every write is DEAD

The list is real (`ManagementPages.tsx:900-902` → `scraperListPlugins`). Everything you can *do*
on the page is not:

- **"Update all"** (`:927-937`) rewrites `version` in local React state and announces
  `Updated N adapters.` Nothing is downloaded. Reload the page and the "update" is gone.
- **The enable/disable toggle** (`:1006-1016`) calls `setPlugins` only. It never writes
  `developer.pluginIds`, which is what `data/ipcScraperPort.ts:142` actually passes to main.
  Toggling a plugin off has no effect on any scrape.
- **"Install from file"** (`:939-954`) parses the manifest and prepends it to local state. No file
  is copied, nothing is persisted.
- `:1043` hard-codes *"Legacy AniX remains disabled because it requests wildcard network and
  direct filesystem access."* — a sentence about a fixture plugin, rendered unconditionally
  regardless of what main actually returned.

A user enables a provider, sees the toggle move, runs a scrape, and gets the old provider set.

### 2.3 `page.torrents` — registry `ready`, transfer controls are DEAD

`TorrentManagerPage.tsx:182-201`. "Pause transfer", "Force recheck" and "Remove from mirror" call
`patchTransfer`/`setTransfers` — local state — then print e.g.
`${transfer.name} paused.` / `removed from the local mirror. Downloaded files were kept.`

There is no IPC to carry them: `src/preload.ts` exposes only `scraperQbitTest` (:2007),
`scraperQbitTransfers` (:2011) and `scraperQbitSend` (:2015). qBittorrent never hears about any of
it. The message about kept files is a specific factual claim the code cannot support.

This is the most *dangerous* entry: the page mirrors a real client, so the user has every reason
to believe the buttons drive it.

### 2.4 `page.downloads` — registry `untested`, controls DEAD + invented disk figure

`DataPages.tsx:413-444` — `togglePause`, `retry`, `cancel` are `setRows` only, each with a
confirming notice (`Download queue state updated.`, `Episode returned to the queue.`). No
download-control IPC exists (`preload.ts:1935` is `scraperListDownloads`, read-only).

`DataPages.tsx:410`: `const freeBytes = 412 * 1024 ** 3;` — rendered at `:477-483` as
"free 412 GB" next to a storage-pressure warning whose threshold (`:411`) is computed from that
invented number. The warning can therefore never be right except by coincidence.

### 2.5 `page.history` — registry `ready`, fabricated per-stage timings

`DataPages.tsx:1003-1017`, `stageBreakdown()`. Its own docstring says *"A plausible split of a
job's runtime across its stages."* It multiplies the real total by fixed weights
(Search 0.08, Fetch 0.34, Extract 0.31, Mirrors 0.16, Validate 0.11) and renders them as a
per-stage bar chart at `:983-993`.

The JSX comment directly above (`:981-982`) makes the claim explicit: *"Per-stage timings are what
turn 'it was slow' into 'the mirror checks were slow'"*. The chart cannot support that — every job
ever run shows the identical 8/34/31/16/11 shape. This is invented statistics presented as
diagnosis, and it is the same species of defect as the "1,122 episodes · 2,234 mirrors" block.

### 2.6 `page.scheduled` — registry `ready`, fixture starter schedules

`ManagementPages.tsx:212-233` `STARTER_SCHEDULES`, used at `:327` whenever the active profile has
no entries — i.e. **on every fresh install**. Two schedules appear pre-populated, with
`lastRunAt: '2026-07-19T19:00:00.000Z'` / `nextRunAt: '2026-07-26T19:00:00.000Z'` — dates in the
past that read as run history the app never had — and `targetUrl:
'https://example-anime-site.com/anime/one-piece'`, a domain that does not exist.

Worse, they are not read-only samples: any edit runs `persist()` (`:385-392`), which writes them
into the real profile. Pressing "Run now" starts a real job against a fake domain.

### 2.7 `result.torrents` — registry `ready`, "Queue selected" is DEAD

`ResultPanels.tsx:423-427`. `queueSelected` sets a notice —
`Queued N releases for qBittorrent handoff.` — and clears the selection. No port call. Adjacent
"Export magnets" (`:415-422`) is genuine, which makes the dead one harder to spot.

### 2.8 `page.http-inspector` — registry `ready`, cosmetic only

`ToolPages.tsx:243-249` renders a static "Request headers" card listing `accept`, `user-agent` and
`referer: same-origin`. The actual request (`:196`) sends only `accept` and `user-agent`. The
`referer` row describes a header that is never sent. Cosmetic, listed for completeness.

---

## 3. The Dashboard, in detail

`pages/DashboardPage.tsx`. It does not throw and it does not render empty — so "broken" here means
**it shows a fictional install and two of its click targets go nowhere.**

### What is live

Exactly three numbers, in the hero strip at `:224-228` — healthy sources, indexed episodes,
Japanese subtitle tracks — computed at `:148-171` from real `listSources()` / `listJobs()` /
`getResult()`. On a fresh install these correctly read `0 / 0 / 0`.

### What is fixture

Everything else on the page, from the import block at `:26-38`:

| Panel | Line | What the user sees |
|---|---|---|
| "Recent anime" cards | `:278-293` | One Piece · 1,122 episodes · **StreamSB**; Frieren · VidPlay; Jujutsu Kaisen · MegaCloud |
| Stat tiles | `:297-303` | 3 series, 1,197 episodes, 6 queued, 3 failed, cache size |
| Active job card | `:312-337` | a running One Piece job with provider, ETA and progress bar |
| Next scheduled | `:362-363` | "in 2h 48m" + hard-coded `One Piece · Thorough · daily at 03:00` |
| Recent scrapes | `:381-396` | six invented job rows with durations and ages |
| Source health | `:408-433` | streamsb.example, vidplay.example, megacloud.example… with latencies and sparklines |
| Storage | `:451-461` | page-cache / image / log byte split |
| Learning | `:474-480` | subtitle tracks, new words, card candidates |

**The "Recent anime" block at `:278-293` is the exact defect the user already found on Discover** —
same `SERIES` constant (`data/fixtures.ts:46-74`), same 1,122 episodes, same invented `StreamSB`
provider. Discover was fixed; the Dashboard copy was not.

The page does carry a "Sample data" flag at `:195-198`. It is a single small pill in the header,
above eight panels of invented content, and it does not distinguish the three live hero numbers
from the rest — so it reads as a blanket disclaimer covering the whole page, including the parts
that are real.

### What is genuinely broken (two dead click targets)

**a. Clicking a "Recent anime" card does nothing.** `:283` calls
`ctl.openResultSeries(series.id)` with a bare fixture id (`'one-piece'`). Results builds its
library with **per-job** ids — `data/resultLibrary.ts:15-17`, `librarySeriesId()` returns
`` `${jobId}:${seriesId}` `` — so the available ids look like `job-ms54dwl9-1:one-piece`. The
handoff guard `data/resultHandoff.ts:8` requires exact membership, so it returns `null`,
`DataPages.tsx:149` bails, and the user lands on Results with nothing selected and no explanation.

Note the irony: the per-job id was introduced deliberately to fix the "500% catalogue coverage"
bug recorded at `featureStatus.ts:111-115`. That fix silently broke this handoff, and the Phase 4
re-verification did not catch it.

**b. Clicking a "Source health" row does nothing.** `:414` calls `ctl.openSource(source.id)` with
fixture ids — `streamsb`, `vidplay`, `megacloud`, `filemoon`, `nyaa-mirror`
(`data/fixtures.ts:111-165`). The real backend's source ids are `jikan`, `anilist`,
`animethemes`, `nyaa`, `jimaku`, `opensubtitles` (`src/main/scraper/sources.ts:47-94`). **Zero
overlap.** `data/sourceHandoff.ts:8` returns `null` and `SourceManagerPage.tsx:131` bails.

So the Dashboard lists six sources that do not exist, at hosts that do not exist, with health
sparklines and latencies for services never contacted — and clicking one silently fails.

### What it would take to fix

The data is already reachable; this is wiring, not new backend.

1. **Recent anime** — replace `SERIES` with the same `listJobs()` → `getResult()` walk the page
   already runs at `:148-171` (reuse `seriesFromResult` + `buildResultLibrary` from
   `DataPages.tsx:71-84`). Pass the per-job id to `openResultSeries`, which fixes (a) for free.
2. **Source health** — replace `SOURCES` with the `listSources()` result already fetched at
   `:151`. `SourceStatus` carries `health`, `latencyMs` and `history`, so the sparkline survives.
   Real ids fix (b).
3. **Recent scrapes** — replace `JOBS` with `listJobs()`; `ScrapeJobSummary` has every field the
   list renders.
4. **Active job / Next scheduled** — subscribe via `port.subscribeScheduler` and the running-job
   state `ScraperApp.tsx:140-151` already computes. Delete the hard-coded
   `One Piece · Thorough · daily at 03:00` at `:363`.
5. **Storage / Learning** — *no backend exists for these.* See §4; they should be deleted rather
   than left drawing `STORAGE`/`LEARNING`, on the same reasoning `featureStatus.ts:41-61` used to
   delete `set.browser`.
6. **Stat tiles** — derive from 1–3 once those are live; drop `QUEUED_DOWNLOADS`/`FAILED_ITEMS`.

Steps 1–4 are roughly a day and remove the entire visible lie. Step 5 is a deletion.

---

## 4. Recommended work order

### Tier 0 — blockers others depend on

1. **Fix the two dead handoffs** (`DashboardPage.tsx:283`, `:414`). Small, and until they are
   fixed any Dashboard rewiring inherits the same silent failure. Worth adding a test alongside
   `scraperResultHandoff.test.ts`, which currently tests the guard but not the caller's id shape —
   that gap is why this shipped.
2. **Rewire the Dashboard to the port** (§3 steps 1–4). It is the landing page; every impression
   of the app starts here.
3. **Decide the write-path question, once.** Items 2.2/2.3/2.4/2.7 are one decision, not four:
   *does the Scraper get a mutation IPC surface?* Everything downstream depends on the answer, so
   settle it before touching those pages. Two honest options:
   - **Build it** — `qbitPause` / `qbitResume` / `qbitRecheck` / `qbitDelete` on
     `main/scraper/qbittorrent.ts` (444 lines, already authenticates and already reads the
     transfer list — this is the cheap path), plus persisting plugin enable to
     `developer.pluginIds`.
   - **Delete the controls** — the precedent set by `set.browser` at `featureStatus.ts:41-53`.
   Whichever is chosen, do not leave buttons that print success.

### Tier 1 — visible correctness

4. Delete `stageBreakdown` (`DataPages.tsx:1003-1017`) and its chart. Fabricated diagnosis is
   worse than no diagnosis. Real per-stage timings need main to emit stage timestamps on
   `ScrapeJobEvent` — a genuine feature, worth filing separately.
5. Replace the hard-coded `freeBytes` (`DataPages.tsx:410`) with a real figure. Main can answer
   this trivially (Node `fs.statfs`), but there is **no IPC for it today** — needs one method.
6. Empty `STARTER_SCHEDULES` (`ManagementPages.tsx:212-233`), or point it at a real host and mark
   it disabled with null run dates. A fresh install should show an empty scheduler.
7. Delete the hard-coded AniX sentence (`ManagementPages.tsx:1043`) or derive it from the actual
   permission set already computed at `:917-925`.

### Tier 2 — cosmetic

8. `result.details` poster (`ResultPanels.tsx:63`) — use `metadata`'s poster when published.
9. HTTP Inspector's static `referer` row (`ToolPages.tsx:245-248`).
10. `DataPages.tsx:263,323` look artwork up via `SERIES.findIndex`, which returns `-1` for every
    real series, so all real results draw the same image. Harmless, trivial.

### Unbuildable without a dependency the project does not have

- **Dashboard "Storage" panel** (`:437-464`). Needs on-disk accounting for page cache, images and
  logs. `main/scraper/httpCache.ts:1-253` is **memory-only** and does not survive a restart —
  `featureStatus.ts:183-185` says so itself. Nothing writes images: `set.images`' `namingTemplate`
  "names files nothing writes" (`featureStatus.ts:210-213`). There is no bytes-on-disk number to
  report because there are no bytes on disk. **Delete the panel.**
- **Dashboard "Learning" panel** (`:466-489`) — "new words" and "card candidates" require a
  morphological pass over mined subtitles feeding the Anki pipeline. That crossing does not exist
  in `src/main/scraper/`. `result.streams` reaching a mining draft
  (`featureStatus.ts:148-152`) is the nearest real thing, and it is per-episode, not an aggregate.
  **Delete the panel** or reduce it to the one number that is real — Japanese subtitle tracks,
  which the hero already shows.
- **The `set.extraction` generic extractor fields** (`cssSelectors`, `xpathSelectors`,
  `regexPattern`, `regexFlags`, `attribute`) — the registry at `featureStatus.ts:190-195` already
  calls these inert and is right. The backend extracts via per-site rules
  (`main/scraper/extractionRules.ts`), not a generic selector set. Building the generic extractor
  is a real project; until then these fields should follow `set.browser` into deletion.

---

## 5. Where the registry under-claims

Do not spend effort re-verifying these.

- **`page.profiles`** — marked `untested` with the note *"Profiles edit the settings document and
  nothing else reads them yet"* (`featureStatus.ts:99`). **That note is now false.**
  `data/ipcScraperPort.ts` reads the active profile on nearly every call —
  `:83` (sources), `:112-118` (probe), `:127` (downloads), `:142` (plugins), `:162` (startScrape),
  `:233-244` (torrents), `:271` (scheduler). The profile is the single most consumed object in the
  port. The page itself is straightforward live state (`ManagementPages.tsx:62-86`).
- **`page.script-console`** — `untested`, and the most honest surface in the app. It marks every
  answer live-or-sample from main's own capability list (`ToolPages.tsx:475-479`,
  `shared/scraperConsole.ts:174-175`), gates on `developer.allowScriptConsole`
  (`ToolPages.tsx:359-360`), and executes nothing. Covered by
  `src/shared/__tests__/scraperConsole.test.ts`.
- **`result.images`** — `untested` for "no per-image inspection"; `ResultPanels.tsx:471-606` has a
  full inspector: filters, search, dimensions, format, size, episode link, copy-source and
  download. The note describes an older version.
- **`set.ui`** — the 2026-08-02 correction at `featureStatus.ts:225-233` is right, and I confirmed
  it: `ScraperSettingsDrawer.tsx:346-386` renders six controls by hand (compact window, collapsed
  rail, result density, page size, default result tab) and each writes through the controller.
- **The `set.*` inert-field annotations generally.** I grepped every field the registry names as
  inert against `src/main/`. `maxParallelDownloads`, `memoryBudgetMb`, `cpuThrottlePercent`,
  `reuseBrowserContext`, `prefetchNextPage` and `mergeStrategy` have **zero** hits — the comments
  at `featureStatus.ts:186-200` are accurate. This half of the registry can be trusted.

---

## 6. Undetermined

- **Whether `page.torrents.acquisition`'s populated states render correctly.** The path is real
  (`TorrentManagerPage.tsx:113-130` → `getAcquisitionSnapshot`), but no torrent client or debrid
  account is configured here, so only the empty branch has ever drawn. *Settles it:* a configured
  Seanime sidecar with one active transfer, or a unit test feeding a populated
  `AcquisitionBackendSnapshot` into the component.
- **Whether `set.network`'s `verifySsl: false` works.** `featureStatus.ts:180` flags this itself.
  *Settles it:* a local HTTPS server with a self-signed certificate.
- **Whether the Phase 4 proof runs at `docs/migration/proof/phase4-reverify-20260729/` recorded
  the click-through paths.** They asserted each page reached the backend, which is consistent with
  what I found — the port *is* live. They evidently did not exercise the Dashboard's card clicks
  or any write-side button, which is where every defect above sits. *Settles it:* reading those
  logs for handoff and mutation events. I did not open them.
- **Runtime behaviour generally.** Everything here is static reading; the app was not run.
