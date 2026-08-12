# Phase 4 — Seanime scraper shared-contract state

Updated 2026-07-29.

Status: **COMPLETE — the stated acceptance criterion is met.**

> **Acceptance** (`SEANIME_MIGRATION_PLAN.md:617): *every `ready` entry in
> `featureStatus.ts` is still `ready` on the new backend, re-verified live, and
> no entry is promoted without a recorded run.*
>
> All 28 `ready` entries were re-verified live in the running app on 2026-07-29,
> each with a recorded run in
> `docs/migration/proof/phase4-reverify-20260729/ready-entry-reverification.json`.
> One defect surfaced (`page.results`) and was fixed rather than demoted or
> ignored. Two entries added this phase were registered honestly —
> `page.sources.providers` as `ready`, `page.torrents.acquisition` as
> `untested` — and nothing was promoted without a run.
>
> Phase 4 completing does **not** close Phase 3, which remains active on its
> G-PLAY and microphone gates.

Phase 4 is advancing additively while the Phase 3 G-PLAY asset-reference and
microphone-hardware gates remain open. This slice does not change the player or
Anki seam.

## Implemented in this slice

- `shared/acquisition.ts` defines content-neutral identity, provider and
  playback contracts. `anime` and `manga` share the job boundary; an unconnected
  manga job fails explicitly instead of silently entering the anime catalogue.
- `main/seanime/client.ts` gives Electron main a typed, authenticated,
  timeout-bounded client for the supervised sidecar and unwraps Seanime's
  `{ data, error }` envelope.
- `main/scraper/seanimeSources.ts`:
  - lists installed `onlinestream-provider` extensions;
  - bridges Jikan/MAL results to the AniList identity required by Seanime;
  - reads provider episode lists and resolves episode sources with bounded
    concurrency;
  - follows providers as per-episode fallbacks;
  - honours dubbed and subtitle-required profile settings;
  - retains required request headers in `AcquisitionPlayback`;
  - projects MP4/HLS candidates onto the existing `StreamRow` result contract.
- Live playback URLs and headers remain available to the current job, but
  durable history strips both and records `refreshRequired: true`; signed URLs,
  cookies and authorization headers are never written to scraper JSON.
- `main/scraper/engine.ts` now includes resolved streams in the persisted job
  result and summary, then drops streams for episode rows removed by validation.
- `result.streams` moved from `shell` to `ready` after the live proof recorded
  below.
- Seanime torrent-client, debrid and auto-downloader state/actions now project
  onto the shared acquisition contracts without replacing the Study OS
  scheduler, Site Rules, run history or diagnostics.
- Installed provider inventory is visible on the existing Sources page; torrent,
  debrid and auto-downloader state is visible on Torrent Manager.
- Stream results hand off to the adopted VideoCore with provider headers and
  external subtitle tracks intact.
- Provider VTT cues are adapted from VideoCore's `MediaCaptionsManager` onto the
  same cue timeline used by embedded ASS/MKV subtitles, so dictionary, replay,
  translation and mining work for online streams too.

All existing Site Rules, selector/regex/HTTP tooling, torrent index parsing,
qBittorrent handoff, job history, scheduler history and diagnostics remain on
their previous paths.

## Verification

| Gate | Result |
|---|---|
| all scraper tests | **30 files / 340 tests pass** |
| focused engine + adapter rerun | **2 files / 33 tests pass** |
| provider VTT study adapter | **1 file / 3 tests pass** |
| targeted ESLint | **0 problems** |
| TypeScript | repo has **281 accepted diagnostics**; **0 in changed Phase 4 paths** |
| renderer production build | **exit 0; 4,585 modules transformed** |
| Electron-main SSR build | **exit 0; 217 modules transformed** |

The acquisition adapter tests prove MP4/HLS projection, header retention,
torrent-only short-circuiting, per-episode provider fallback and
subtitle-required filtering.

## Live provider-to-mining proof — 2026-07-28

- Installed extension: `phase4-local-proof` (`onlinestream-provider`).
- Scrape job: `job-ms54dwl9-1`, completed in 3 seconds.
- Result: 28 Frieren episodes, one MP4 stream, zero failed episodes.
- The result retained provider id/label/server, the required
  `X-Phase4-Proof` request header and a default Japanese VTT track.
- VideoCore reached `readyState = 4`, played all 6 seconds through Seanime's
  authenticated `/api/v1/proxy` endpoint, and reported no media error.
- `MediaCaptionsManager` selected the Japanese track and emitted both fixture
  cues. Cue 2 (`2500–5000 ms`) populated the sentence and term fields with
  `この字幕から言葉を採掘できる。`.
- `.study-mining-panel` reported `data-study-mining="ready"` and the Mine card
  action was enabled. The action was not submitted because AnkiConnect was
  offline; verification therefore made no external collection changes.
- No sidecar token, proxy signature, provider URL, cookie or authorization
  credential is stored in this evidence record.

## ADR-003 exit gate — closed 2026-07-29

`ADOPTED_MEDIA_I18N_ALLOWLIST` is empty, and
`shared/__tests__/mediaWorkspaceI18n.test.ts` now parses all five host-owned
adopted surfaces and fails on any raw English JSX text or untranslated
`aria-label`/`placeholder`/`title`, plus any `mediaWorkspace.*` key missing from
`ja`/`zh`/`ru`.

The static gate was not accepted as proof on its own. The four languages were
switched **through the app's own Settings › Language control**, live, with the
adopted workspace open on a real provider stream — MP4 playing through the
sidecar's authenticated `/api/v1/proxy`, Japanese VTT selected, mining draft
populated from cue 2. Every probed string repainted in every language, with no
missing strings and no unexpected English left in the subtree under `ja`, `zh`
or `ru`. Evidence:
`docs/migration/proof/i18n-20260729/adr-003-language-proof.json`.

One methodology note worth keeping: an earlier pass called `setUiLang` from a
module imported in the devtools console and read "no repaint". That was wrong —
under Vite the console import resolves to a *second* module instance with its
own `current` and its own listener set, so it moved nothing the app subscribed
to. Drive the real control, or the result is meaningless.

## Registry corrections, 2026-07-29

Two Phase 4 panels were borrowing a neighbour's maturity id, which made them
read greener than they are. Both now register honestly:

- `page.sources.providers` → `ready`. The inventory card was verified live
  through the real renderer → IPC → main → Seanime path.
- `page.torrents.acquisition` → `untested`. It had been showing
  `result.torrents`' green dot while nothing behind it had ever been seen
  populated.

The Phase 4 acquisition card also carried literal English in JSX, against the
Scraper app's own deferred-i18n rule in `strings.ts`. Its text now lives in
`strings.ts` under `acq.*` and resolves through `sx()`/`sxn()`, so the eventual
Scraper-wide catalog sweep stays mechanical.

## Acceptance run — 2026-07-29

Every `ready` entry was exercised through the app's own UI, with main's scraper
log bus tailed as the witness. That witness matters: `ipcScraperPort.route()`
falls back to sample data when a real call throws, so a rendered value alone is
not proof of a live call.

Highlights of the 28 recorded runs (full detail in the proof file):

- A fresh scrape (`job-ms55zc1k-2`) survived a live Jikan 504 by falling back to
  AniList, matched the series, produced 28 episodes and resolved a playable
  stream through the Seanime extension.
- Source probes hit the real hosts — Jikan 504 in 606 ms, AniList 404 on its
  probe path in 628 ms. Those degraded verdicts are live external conditions,
  correctly reported, not app faults.
- 75 real nyaa.si releases, 74 after filters.
- "Run now" on a schedule started `job-ms5617lk-3`, handled an unreachable host
  (ENOTFOUND) and fell back to the URL slug instead of failing the run.
- A site rule validated against a real page: 200 OK, 625 KB, 62 rows matched,
  with real Japanese episode titles in the preview.
- Settings edits round-tripped to `jp-scraper-settings-v1` with undo history.

**One defect found and fixed.** `page.results` showed *"500% catalogue coverage ·
140 / 28"* for a series scraped more than once: the library holds one entry per
job but keyed entries on `result.seriesId`, so every run's rows joined to every
entry. Fixed with `librarySeriesId()` / `buildResultLibrary()` in
`resultLibrary.ts`, covered by a regression test, and re-checked live — 8
entries, each 100%.

**One architecture finding fixed.** `AcquisitionAction` referenced the Scraper's
`TorrentRow`, closing an import cycle inside `src/shared` that
`architectureBaseline.test.ts` holds at zero. The action now carries
`AcquisitionTorrentCandidate`, declared in `acquisition.ts` itself; `TorrentRow`
satisfies it structurally, so callers are unchanged.

## Still open — carried forward, not part of this phase's gate

1. **Blocked, not skipped:** the live torrent-client gate. `set.qbittorrent`,
   `page.downloads` and `page.torrents.acquisition` stay `untested` because this
   machine has no running qBittorrent and no enabled Web UI (ports 8080/8081/9091
   closed, no process). Enabling a client's remote Web UI is a user configuration
   decision, so it was not done. To close it, start qBittorrent with its Web UI
   enabled and re-run: connection test, transfer mirror, and the Seanime
   acquisition snapshot against a configured client.
2. Debrid and auto-downloader states are read-only in the UI and have never been
   seen populated — same gate, same reason (no debrid account configured).

Neither blocks Phase 4's acceptance, which is about `ready` entries holding.
Promoting these would require a recorded run that this machine cannot produce.

The old scraper and player paths must not be retired from this record.

## Settings groups given a consumer — 2026-08-02

Twelve entries in `featureStatus.ts` read `shell` with the same reason attached:
*"Stored and validated, but no code path reads them yet."* Five of them no longer
do. Each was taken one at a time: wire it into `src/main/scraper`, prove it with
a test that observes the behaviour rather than the value, then promote it.

The ceiling here is `untested`, not `ready`. Every proof below is a vitest run
against a local server or a pure function. None of it has been driven through the
running app, and this session could not drive it — another session owns the dev
app. Promoting any of these to `ready` on a unit test would be exactly the
dishonesty the registry exists to prevent.

### The mechanism the first four share

`src/main/scraper/runtime.ts` carries the active profile through
`AsyncLocalStorage`. `startScrape` opens a scope for the job; every
`scraperRequest` beneath it — including the ones inside `catalogue.ts` and
`torrents.ts`, written long before these settings had a consumer — resolves its
behaviour from that scope. Two jobs running at once each see their own profile,
which a module-level "current settings" variable could not have promised.

Outside a scope the store is empty and every module keeps its previous defaults.
That is why the HTTP Inspector, the source probes and the qBittorrent client are
unchanged: those are the user acting directly, not a profile acting for them.

### `set.network` → `ready`

Wired in `networkPolicy.ts` (policy, concurrency gate, proxy rotation, retry
classification) and `http.ts`, which was split into `performRequest` (one
attempt) and `scraperRequest` (the policy layer). Redirect recursion goes through
`performRequest`, so a hop does not need a second concurrency slot — with
Concurrent Requests at 1 that would have been a deadlock.

Also removed: the hard-coded `timeoutMs: 20_000` at four call sites in
`catalogue.ts`. Those were the reason Request Timeout could not reach catalogue
traffic. A call site that still passes a timeout — `sources.perSourceTimeoutMs`
through `searchTorrents` — still wins, so `set.sources` is unaffected.

Proved by `src/main/__tests__/scraperNetworkPolicy.test.ts` (34 tests) against a
real local server and a real local forward proxy:

- the profile's user agent, custom headers and cookie arrive at the server;
  a call site's `content-type` layers on without displacing them
- Request Timeout ends a request to an endpoint that never answers; a shorter
  call-site timeout still wins
- Follow Redirects off stops at the 302 — the server never sees the second hop
- Retry Attempts: 2 failures then success = 3 requests; 0 = 1 request; a 404 is
  never repeated; the retry delay is actually waited
- Concurrent Requests 1 → the server's own in-flight counter never exceeds 1;
  3 → it reaches exactly 3
- Random Delay 80–80 ms paces three sequential requests ≥240 ms apart
- a plain-http request arrives at the proxy in absolute form with the origin's
  own Host; an https target arrives as `CONNECT example.test:443`
- a retry rotates to the next proxy in the list

- `socks5://` is refused with a clear error and no request is made — the
  settings validator accepts SOCKS, and connecting directly instead would tell
  the user their traffic went somewhere it did not

A later strict proxy probe found that this was not enough evidence. The test
deliberately returned 502 from CONNECT, so it proved only that a tunnel was
*opened*, not that a successful tunnel carried the request. On CONNECT 200,
Node ignored the request-level `createConnection` paired with
`agent: false` and opened a second, direct TLS connection to the origin.
`http.ts` now supplies TLS-over-CONNECT through a one-shot
`https.Agent`. Test 34 terminates that tunnel at a local TLS fixture and
uses `proxy-proof.invalid` as the requested host; the 200 response cannot
possibly have come from a direct fallback.

SSL Verification off is covered against the same self-signed TLS fixture: the
successful tunnel is rejected when verification is on and accepted only when
the profile disables it.

Fresh-main Electron acceptance then used a strict loopback CONNECT proxy that
allowed only `api.jikan.moe:443` and `graphql.anilist.co:443`. Nine
accepted tunnels delivered nine fixture requests across four real jobs, with
zero rejected or unexpected authorities. The results contained fixture-only
titles, ids and provenance, so the old failure mode — opening CONNECT and then
using a second direct socket — cannot satisfy the observation.

### `set.cache` → `untested`

`httpCache.ts`. A response store consulted before the socket opens, keyed by
method + URL + body hash, classified per URL into the three switches the panel
offers. Insertion order is the eviction order and a hit re-inserts, so the Map
*is* the LRU list.

Deliberate limits, so the panel does not over-claim:

- in memory, dropped on restart, so Cache Size Limit is a memory ceiling
- only non-truncated 200s are stored
- only GET, plus POST to a metadata endpoint (AniList's GraphQL search is the
  one repeated POST a run makes)
- never a response carrying a session cookie
- **never a syndication feed.** A torrent index's RSS would otherwise fall into
  "Cache Pages" and a user re-running a scrape to pick up new releases would get
  yesterday's seeder counts for a day. `isLiveFeedUrl` excludes it.

Proved by `src/main/__tests__/scraperHttpCache.test.ts` (37 tests) — the
end-to-end assertions all count requests the server received, because "served
from cache" means the socket was not opened and nothing else proves that:

- a repeated request hits the server once; with Cache Pages off, twice
- Cache Metadata and Cache Pages act independently on the same run
- a GraphQL POST is cached and keyed on its body
- a 500, a truncated body and a session-cookie response are never stored
- Offline mode serves what was cached without opening a socket, and fails
  clearly on a miss instead of quietly refetching
- lifetime, `metadata.cacheHours` overriding it, and LRU eviction under the size
  ceiling are asserted against the store with an explicit clock — the smallest
  lifetime the panel can express is one minute, and a test that waited for one
  would not be worth having

### `set.performance` → `untested`, partially

Two of seven fields reach real code.

- `maxParallelJobs` gates job admission in `engine.ts`. A job over the limit
  waits at stage `queued` — a stage the vocabulary already had and nothing ever
  used — instead of starting and competing for sockets. The limit is read from
  the waiting job's own profile, so a Thorough run does not inherit a Fast run's.
- `batchSize` sets the progress cadence. Rows still stream one event at a time;
  the progress bar is told once per batch, and always on the last row.

**Inert, named in the registry comment:** `maxParallelDownloads`,
`memoryBudgetMb`, `cpuThrottlePercent`, `reuseBrowserContext`,
`prefetchNextPage`. There is no download pipeline, no worker pool and no browser
engine in this backend to attach them to. Wiring them to the nearest available
number would have been worse than leaving them.

Proved by `src/main/__tests__/scraperEnginePerformance.test.ts` (6 tests) on the
site-rule path against a deliberately slow local server: with the limit at 1 no
two jobs are ever running at once and finish order matches start order; at 3 they
demonstrably overlap; batch sizes of 1, 3 and 50 produce 8, 3 and 1 progress
events for 8 rows.

### `set.extraction` → `untested`, partially

`extractionRules.ts` applies seven toggles to rows on both engine paths, before
validation. `ignoreHiddenElements` had to go into `extractWithRule` in
`shared/scraperSiteRules.ts`, since it is a decision about elements, not rows;
the Site Rules page's preview passes the same setting, so the preview cannot show
rows the run would drop.

**Inert:** `cssSelectors`, `xpathSelectors`, `regexPattern`, `regexFlags`,
`attribute`. Those configure a generic "point the scraper at any page" extractor
that does not exist — the only extraction path is a site rule, which carries its
own selectors. Wiring them means building that extractor, not reading a setting.

Proved by `src/main/__tests__/scraperExtractionRules.test.ts` (54 tests). The
assertion that matters as much as the transformations: with every toggle off,
`applyExtractionSettings` returns the rows unchanged. A group whose "off"
position also altered the data would be worse than one never wired.

One judgement recorded because it could be read as a bug later: with
`normalizeEpisodeNumbering` on, a number parsed out of a title only wins when the
row has no usable number of its own. A catalogue's numbering is evidence; a
number scraped from a title is a guess, and letting the guess overwrite the
evidence is the kind of silent corruption that surfaces three screens later.

### `set.metadata` → `ready`

- `providerOrder` now decides which catalogue `searchCatalogue` asks first, and
  whether the other is asked at all. An unknown id is skipped with a log line
  rather than failing the search — the field is free text in the drawer, and a
  typo should cost one provider, not the run. `mal` is accepted as an alias.
- `titleLanguage` and `alsoStoreNativeTitle` choose the title on rows, on the
  job summary and in the Metadata tab, each falling back through the others so
  a one-language title never renders blank.
- `fetchSynopsis`, `fetchGenres`, `fetchRatings`, `fetchAirDates` empty their
  fields when off, *and* drop them from `provenance` — provenance records where a
  value came from, and there is no value to account for.
- `cacheHours` is the metadata cache's own lifetime, overriding the shared one.

**Inert:** `mergeStrategy` (only one provider ever answers; there is nothing to
merge) and `fetchStaff`. `fetchStaff` was deliberately *not* wired to `studios`:
it says "Staff and Cast", a studio is a production credit, and gating a populated
field on an unrelated toggle to make the group look complete would have quietly
emptied the Metadata tab for every user on default settings. There is a test that
asserts the studio list survives both positions of that toggle, so a future
session does not "finish the job" by wiring it to the nearest field.

The four projection controls are labelled **Store**, not Fetch: both providers
return whole records and the switches decide which received values survive in
the result. The drawer also discloses that request scope in a non-operable note.

Proved by `src/main/__tests__/scraperMetadataSettings.test.ts` (22 tests)
and by fresh-main Electron acceptance through a strict local TLS terminator:

- Jikan-first made search, full-detail and episode-list requests and returned
  Jikan provenance.
- Turning Store Synopsis, Genres, Air Dates and Ratings off made the same three
  requests, then blanked those four values and their provenance.
- AniList-first made one GraphQL request and no Jikan request.
- A destroyed Jikan response socket logged `socket hang up`, then the same
  job asked AniList and completed with AniList provenance.

The two inert controls remain explicitly disclosed and are not included in the
ready claim.

### Two things that contradicted the registry

1. **`set.ui` is not "stored and validated".** There is no `ui` group in
   `ScraperSettings` and no field in `SCRAPER_FIELDS` carries `group: 'ui'`. It
   is a drawer category with zero controls. Its `shell` dot is right by accident
   and for the wrong reason; the honest fix is to delete the category or give it
   the window-behaviour settings its description promises. Its comment in
   `featureStatus.ts` now says so.
2. **`set.browser` cannot be wired at all.** Nine fields describing a headless
   browser — engine, viewport, JavaScript wait, scroll passes, pre-extraction
   script — and this backend has no browser automation dependency. It is not
   "no code path reads them yet", it is "there is nothing for a code path to
   drive". Left `shell` with that noted.

### `page.script-console` — recommended against building

The page offers a prompt and an allow-list of commands that return fixture data.
The obvious reading of "make it real" is to execute what is typed. That should
not be built: the Scraper renders inside the app's own renderer process, the
input is free text, and an eval there runs with the renderer's privileges over
the user's decks, settings and IPC surface. `developer.allowScriptConsole`
gating it does not change what the capability is, only how many clicks precede
it — and a settings toggle is not a security boundary.

The page's own subtitle already describes something better and honest: *"Run
allow-listed inspection commands in a restricted, read-only context."* The gap is
not that nothing executes — it is that the allow-listed commands return sample
data. Pointing them at live state through the existing IPC port (active job
count, source health, cache statistics, the log tail) would make the page true to
its own description without an evaluator. That is the proposal; it was not built
in this pass.

Left alone and still `shell`: `set.browser`, `set.antibot`, `set.images`,
`set.scheduler`, `set.notifications`, `set.ui`, `page.script-console`.

---

## The last four wireable settings groups — 2026-08-02

`set.antibot`, `set.images`, `set.scheduler` and `set.notifications`: `shell` →
**`untested`**. That takes the registry from 12 `shell` entries this morning to
**3**, and the three that remain are the three argued out rather than skipped —
`set.browser` (nine headless-browser fields, no browser-automation dependency
exists), `set.ui` (an empty drawer category with no group in the settings model
and no field carrying it) and `page.script-console` (recommended against
building; see the previous section).

### What each is now wired to

| Group | Consumer | Fields that act |
|---|---|---|
| `set.antibot` | `main/scraper/safetyPolicy.ts`, `robots.ts`, `session.ts`, all reached from `http.ts` and `runtime.ts` | crawl delay, the per-host sliding minute window, `domainRateLimits`, the failure circuit breaker, `respectRobotsTxt`, and the `session.*` pair |
| `set.images` | `main/scraper/imageSet.ts`, called from `engine.ts` | the three Download switches, `maxPerEntry`, `preferredFormat` |
| `set.scheduler` | `main/scraper/scheduler.ts` + `shared/scraperCron.ts` | quiet hours, `maxConcurrentScheduled`, `skipIfRunning`, `missedRunPolicy`, `requireExternalPower` |
| `set.notifications` | `main/scraper/notifications.ts` + `shared/scraperNotices.ts` | five observable events: complete, error, new-episode, schedule-run, study-ready |

Three findings in those modules are worth keeping, because each is a bug the
group's own labels were hiding:

- **`network.userAgent`'s "Random (Recommended)" was the option that did
  nothing.** It stores the choice as an empty string, and `http.ts` fell back to
  one hard-coded Chrome string for every request ever made. `session.ts` makes
  the recommended default mean what its hint promises, and never overrides a user
  who picked or typed a specific agent.
- **robots.txt is consulted for crawls only** — the page the user pointed the
  scraper at and the pages a site rule walks — and deliberately not for the app's
  own catalogue and index endpoints. Recorded here because the next reader is
  most likely to read that as a bug.
- **`new-episode` compares episode ids, not counts**, so a run that finds one new
  episode and drops one filler still notifies.

### Fields left inert, and why

Named rather than quietly wired to the nearest available number:

- `set.images`: `minWidth` / `minHeight` (a catalogue publishes a URL, not a pixel
  size — measuring means downloading every image on every run to apply a filter
  that would never reject anything a catalogue served), `skipDuplicatesByHash`
  (there are no bytes to hash; collapsing rows by URL is a weaker check wearing
  the same name) and `namingTemplate` (it names files nothing writes).

### Verification

| Gate | Result |
|---|---|
| `vitest run src/main/__tests__ src/shared/__tests__` | **241 files / 3488 tests pass, 0 failures** |
| whole suite incl. `src/renderer/__tests__` | 347 files / 4416 tests; **the only failure is the pre-existing `flashcardSearch.test.ts` (6)** — `searchDeckCards` lives in a parked git stash, not in the tree |
| `eslint` on every changed file | **0 errors, 0 warnings** |
| `node tools/architecture-audit.cjs` | **"Nothing new"** |

**One defect was found while closing this out, and fixed rather than
baselined.** The pass introduced `safetyPolicy.hostOf`, which the architecture
audit flagged as a duplicate export of `resources/ResourcesContent.tsx`'s
`hostOf`. They are not duplicates: the display one strips `www.` and returns the
original string on a parse failure, the throttling one lower-cases and returns
`''`. Either substitution is a bug — stripping `www.` merges two rate-limit
buckets that are two hosts, and returning the raw string invents a bucket out of
a malformed URL. Renamed to `requestHost`, with that reasoning in its doc
comment, so the audit is clean without asserting a false equivalence.

### Honest note on how this landed

The implementing pass was interrupted mid-run — after the code and tests, before
lint, the registry promotion and this record. The four promotions above were made
by a second pass that read each module's own scope comment and confirmed a real
consumer for it (`safetyPolicy`/`session` ← `http.ts`+`runtime.ts`, `robots` ←
`http.ts`, `imageSet` ← `engine.ts`, `notifications` ← `index.ts`+`scheduler.ts`)
rather than trusting the interrupted run's intent. Nothing reached `ready`: none
of it has been exercised through the running app, and a unit test cannot earn
that dot.

---

## The last three shells — 2026-08-02

The three entries argued out rather than skipped in the previous two sections.
The user read those arguments, accepted them, and asked for all three to be
resolved — "resolved" meaning the app stops carrying a red dot over something
that is not going to exist in the form the surface drew. **The registry now has
no `shell` entries: 49 entries, 21 `untested`, 28 `ready`.**

| Entry | Was | Now | How |
|---|---|---|---|
| `page.script-console` | `shell` | **`untested`** | built as its own subtitle describes it — an allow-list, not an evaluator |
| `set.browser` | `shell` | **removed** | drawer category and its nine fields deleted |
| `set.ui` | `shell` | **`untested`** | the previous note on it was wrong; the category is not empty |

### 1. `page.script-console` — built, and still executes nothing

The page's subtitle already described the honest design: *"Run allow-listed
inspection commands in a restricted, read-only context."* What was wrong was the
data — `CONSOLE_COMMANDS` was a hard-coded object returning `streamsb.example`,
`1122` episodes and `2234` streams. There is now no evaluator and no plan for
one, for the reason recorded in the previous section: this page renders in the
app's own renderer process, so an `eval` over free text runs with renderer
privileges over the user's decks, settings and the whole IPC surface.

The allow-list, the resolver and the formatter are **`src/shared/scraperConsole.ts`**,
in shared/ so the safety property is testable without a renderer. The consumer is
`ScriptConsolePage` in `renderer/components/scraper/pages/ToolPages.tsx`, which
adapts the live `ScraperPort` into the module's `ScraperConsoleSource`.

Ten commands, each answered from real state:

| Command | Read | Backend method |
|---|---|---|
| `help` | the allow-list itself | — |
| `backend.capabilities` | what main implements vs. what falls back to sample data | — |
| `system.stats` | memory, CPU, active jobs | `systemStats` |
| `jobs.active` | jobs not at a terminal stage | `listJobs` |
| `jobs.recent` | the most recent jobs, live and stored | `listJobs` |
| `sources.health` | health and latency per configured source | `listSources` |
| `plugins.installed` | manifests read off disk | `listPlugins` |
| `exports.recent` | exports this app wrote | `listExports` |
| `profile.active` | the values the active profile would run with | — (renderer settings) |
| `logs.tail` | the log tail this page is subscribed to | `tailLogs` |

One new port read was needed: **`backendCapabilities()`**, added to `ScraperPort`,
implemented in `ipcScraperPort.ts` off the capability list it already fetches
(no new IPC channel, no preload change) and answered with `[]` by
`mockScraperPort.ts`. It is what lets every console answer be tagged **live** or
**sample data** — the port falls back silently by design, and a console that
presented a fixture as a reading would be the same defect this page just had.

**A real bug fixed on the way.** The old implementation indexed a plain object
literal, so the "allow-list" also answered every member of `Object.prototype`:
typing `constructor` returned `Object` itself and `__proto__` returned a
prototype. Matching is now a `find` over a frozen array, with a regression test
that probes `constructor`, `__proto__`, `toString`, `hasOwnProperty` and
`valueOf`.

**`developer.allowScriptConsole` was retargeted, not removed.** Its hint read
*"Scripts run against live pages"*, which was never true and is now emphatically
not. It reads: *"Lets the Script Console run its allow-listed, read-only
inspection commands. Nothing you type is executed."* — and it genuinely gates the
page, which is what makes the toggle mean something. It defaults off; the locked
state links straight to Developer in the drawer. `nav.scriptConsole.desc` ("Run
page scripts in a restricted context") was corrected for the same reason.

`untested`, not `ready`: none of this has been driven through the running app.

### 2. `set.browser` — removed

Nine fields describing a headless browser, and no browser-automation dependency
in this project. The **drawer category and all nine fields are deleted** from
`settings/fields.ts`, `'browser'` is gone from `ScraperSettingsGroupId`, and the
`set.browser` entry is gone from `featureStatus.ts`. A guard test in
`scraperFields.test.ts` fails if either comes back.

**What was not removed, and why.** The task asked for the settings model too.
`ScraperSettings.browser` is still in `shared/scraperSettings.ts`, because
removing it is not a Scraper-local change:

- `shared/connectionProfiles.ts` defines `ConnectionOverrides.browser`, lists
  `'browser'` in `OVERRIDE_SECTIONS`, and two of its presets are written mostly
  in terms of these values. **`'browser-assisted'` is nothing but browser
  settings** — retiring the model group means retiring a user-visible connection
  preset, its icon and keyword maps, its `connection.preset.browser-assisted`
  key in all four catalogs, `ConnectionProfilesPanel.tsx`, and two test files.
- `renderer/components/settings/pages/ScraperPage.tsx` renders the same nine
  controls in the main Settings app.

Deleting a named preset out of a neighbouring feature is that feature's call, not
this round's, so it was left and documented instead: `ScraperBrowserSettings` now
carries a doc comment saying nothing reads it, that no field may be added to it,
and exactly what retiring it would cost. **This is the one part of the brief not
carried out as written.**

**Migration:** none was needed, and none was added. `validateScraperSettings` is
constructive — it builds its output from the keys it knows and never flags an
unknown one — so a stored document keeps round-tripping either way. Nothing in
this change alters what is written to disk, so `SCRAPER_SETTINGS_VERSION` stays
at 3; bumping it would only break reading the document on an older build for no
gain.

One live surface was reading the dead group: the Profiles page's comparison table
had a **"JavaScript wait"** row sourced from `browser.javascriptWaitMs`. It now
reads `safety.crawlDelayMs`, which `safetyPolicy.ts` actually enforces.

### 3. `set.ui` — the previous note on it was wrong

The record said *"there is nothing to read — `ui` is a drawer category with zero
fields in `SCRAPER_FIELDS` and no group in the settings model."* The first half
is true and the conclusion does not follow. `ScraperSettingsDrawer.tsx:346`
renders that category **by hand**, exactly as it does `profiles`, and its six
controls all act:

- compact scraper window, collapsed navigation rail, advanced controls,
- result density, rows per page, default result tab.

They have no `SCRAPER_FIELDS` entries because they do not write the settings
document at all — they write `ScraperShellState`, which `shared/scraperShell.ts`
validates and `shell.persistence` (`ready`) stores. "Recent destinations" in that
panel is a readout, not a setting. There is nothing inert in the category.

So it was **promoted, not deleted** — deleting it would have thrown away six
working controls on the strength of an audit that only looked at one list. Held
at `untested` rather than inheriting `shell.persistence`'s green: this panel's own
controls have not been driven end to end.

The stale exception in `scraperFields.test.ts` ("navigational categories whose
controls live on their own pages") now says what is actually true of both
`profiles` and `ui`.

### Verification

| Gate | Result |
|---|---|
| `vitest run src/main/__tests__ src/shared/__tests__ --exclude extension*` | **233 files / 3269 tests pass, 0 failures** |
| `vitest run src/renderer/__tests__` | **106 files / 929 tests pass, 0 failures** — including `flashcardSearch.test.ts`, no regression |
| `node tools/i18n-check.cjs` | **exit 0** — all 6436 English keys translated |
| `eslint` on every changed file | **0 errors**; 5 pre-existing warnings, none in new code |
| `node docs/migration/tools/audit-carried-items.mjs` | **exit 0**, "every carried reason still says what the record says it says" |
| `node tools/architecture-audit.cjs` | **"Nothing new"** |
| `tsc --noEmit` | no error in any file touched here (the root config has pre-existing errors elsewhere; it is not a gate) |

New tests: `src/shared/__tests__/scraperConsole.test.ts` (18 cases) and one case
added to `src/renderer/__tests__/scraperFields.test.ts`.

**i18n note.** New Script Console text went into
`renderer/components/scraper/strings.ts`, not `catalogs/en.ts`, following that
file's stated deferral for the whole Scraper app (~400 strings) rather than
splitting the module's text across two systems for ten of them. No literal string
was put in JSX. `i18n-check` exits 0 because no catalog key was added.

**Not verified.** Nothing here was driven through the running app: the console
has never been opened against a live backend, the retargeted toggle has never
been clicked, and the six UI-category controls were read rather than exercised.
That is why all three sit at `untested` and none at `ready`.
