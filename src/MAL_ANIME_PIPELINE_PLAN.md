# Plan — the MyAnimeList study pipeline, end to end

**Status:** required Main V1 slice, added 2026-08-15 on a direct user request. This plan is
authoritative for everything between a MyAnimeList page and a flashcard deck. Re-derive every
status below from source and live behaviour before acting on it.

## The user's own words, because the acceptance test is theirs

> "the mal downloader which allows the user to download anime/manga from their respective page
> in myanimelist, which allows the user to configure what episodes to do so etc, as well as
> getting their respective subtitles and transferring them into flashcards (example click page
> naruto → configure what episodes to download (100-200) or just download all japanese vocab
> from subtitles for all the episodes and transfer into flashcard deck / the mining pipeline)
> … i also want the mal sync to completely work and list every anime completed etc and all
> derivatives in the anime/manga library. i need these features to actually work."

And: *"i need everything fixed and battle tested"*, *"make sure the new user gets the
walkthrough as well when they want to do it in the app"*, *"the sync also needs testing"*.

**"Actually work" is the bar.** Unit tests and a green registry are not this plan's currency.
Every gate below names an observable outcome on real data.

## Why this plan exists rather than more Track 7 slices

Most of this is already built and none of it has ever been proven end to end. That combination
is exactly what produced the nyaa embarrassment: the provider shipped 2026-08-07 in `477380be`
with 40 unit tests, a live provider-registry check and four proven refusal messages, and had
**never once completed an acquisition**. Treat every "exists" below as unproven.

## What already exists — verified from source 2026-08-15, not assumed

| Capability | Where | State |
|---|---|---|
| MAL page → download dialog | `renderer/components/discover/DiscoverContent.tsx` → `MalDownloadDialog.tsx` | built |
| Episode selection `all\|range\|latest\|custom` | `shared/malDownload.ts:84` | built — "100–200" is `range` |
| Release matching per episode | `planMalReleases`, `rankMalReleases`, `filterMalReleases`, `coveredByBatchRange` | built |
| Episode lists | `main/scraper/malUnits.ts` via **Jikan** + AniList | built, **unauthenticated** |
| Subtitle mode toggle | `MalDownloadDialog.tsx:154`, UI at `:831` | built |
| Subtitle harvest panel | `discover/SubtitleHarvestPanel.tsx`, shipped 2026-08-06 in `95a54661` | built |
| Harvest IPC | `subtitleHarvest:list` / `:fetch` — `main/subtitleHarvest.ts:205,207` | handlers verified present |
| Cue → vocab → cards | `analyzeMediaStudyCues` + `addMediaStudyFlashcards`, `renderer/mediaStudyWorkflow.ts:208` | built |
| Known-word filtering | `canMineHarvestItem`, `harvestContextSentence`, `shared/lexiconHarvestMining.ts` | built |
| nyaa subtitle provider | `shared/subtitleNyaa.ts`, `main/subtitleNyaaSource.ts`, shipped `477380be` | built, **0 acquisitions ever** |
| qBittorrent client | `main/scraper/qbittorrent.ts` | built, login→SID only |
| MAL OAuth (PKCE) | `main/malSync.ts`, `settings/pages/MalSyncPanel.tsx` | built **and live** |
| MAL full-list paging | `main/malSync.ts:846-874` | built, guards a non-MAL `paging.next` |

**Live account state, 2026-08-15:** connected as `Asmilov`, `tokensEncrypted: true`,
`defaultProfile: true`, token to ~2026-09-14. Proven to survive a full app restart. The user's
MAL app `GrammarX` is published with exactly one redirect, `http://localhost/oauth/callback`,
so leaving the app's `redirectUri` blank is correct — `buildMalAuthorizeUrl` omits
`redirect_uri` and MAL falls back to the registered one. **Never write the client id into the
repo, a doc, or a commit.**

## What is missing — measured, and none of it is a setting

1. **The MAL list goes nowhere.** `fetchList` does `setListCount(data.entries.length)` and
   discards the entries. `malFetchList` has exactly **one** caller in the codebase (the
   settings panel). No library module references `malId`.
2. **Derivatives are never requested.** The list call asks MAL for
   `fields: 'list_status,num_episodes'` (`malSync.ts:856`). `related_anime` is absent, so
   sequels/OVAs/side stories cannot appear.
3. **No status filter is reachable.** The IPC accepts one (`malFetchList(status)`); the panel
   always calls it with no argument, so there is no "completed" view.
4. **The qBittorrent send target is unreachable.** `MalDownloadDialog.tsx:604-609` only offers
   it when `settings.qbittorrent.enabled && host.trim()`, and the defaults are
   `enabled:false, username:'', passwordRef:''` (`shared/scraperSourceSettings.ts:513`).
5. **The app cannot use a qBittorrent API key.** `qbittorrent.ts` implements only
   `login()` → SID cookie. See Track 9 in `MAIN_V1_COMPLETION_PLAN.md`.
6. **MAL Sync is unfindable.** `MalSyncPanel` renders only at `ScraperPage.tsx:146`, but the
   registry entry carrying keywords `myanimelist`/`mal` (`settingsRegistry.ts:791-792`) has
   `pageId: 'api-keys'` — a page that does not render it. `searchSettings`
   (`settingsRegistry.ts:1357-1380`) tokenises correctly, so the match is right and the
   **routing** is wrong. The user hit this live and could not find the panel.
7. **The OAuth flow has no up-front explanation.** `MalSyncPanel.tsx:218` renders
   `malSync.callbackDesc` only *after* Connect — by then the user has already watched the
   browser fail to load `http://localhost/oauth/callback` and concluded it is broken.

## Phases

Each phase ends with its gates demonstrated on real data and a dated ledger entry in
`src/MAIN_V1_EVIDENCE_LEDGER.md`.

### P0 — make the pipeline reachable

- Set the app-side qBittorrent connection: `enabled=true, scheme=http, host=127.0.0.1,
  port=8080, basePath='', username=admin`, a `savePath` the app can actually read, and a
  `passwordRef` handle. **`passwordRef` cannot be written into settings** —
  `scraperSourceSettings.ts:487` calls it "a handle into OS-protected storage, never the secret
  itself" and `validateScraperQbittorrentSettings` actively **drops** a `password` key. Route it
  through `main/credentials/ipc.ts` or the Settings UI.
- Fix defect 6: give the scraper page a registry entry carrying `mal` / `myanimelist` /
  `anime list` keywords, and a label/description that names MyAnimeList. "Scraper" (group
  `Media`, `advanced: true`) names nothing a user would search for.

**Gates.** 1. `qbitTest()` reports connected. 2. `MalDownloadDialog` lists `qbittorrent` in
`availableTargets`. 3. Searching "mal sync" in Settings offers the page that actually contains
the panel, and following the result lands on a rendered `MalSyncPanel`.

**Progress 2026-08-15 21:00 (`backup`).**
- Gate 3 **PASSES** — `a110411f`, verified live on pid 37360.
- Gate 2 **precondition satisfied, dialog observation still open.** The guard is exactly
  `settings.qbittorrent.enabled && settings.qbittorrent.host.trim()`
  (`MalDownloadDialog.tsx:607`). Measured live before: `enabled:false, host:'localhost',
  username:'', passwordRef:''` — plan defect 4 confirmed, not assumed. Written through to
  `enabled:true, host:'127.0.0.1', port:8080, username:'admin', passwordRef:'qbit/webui',
  category:'jp-study'` on the active profile `relay-probe`; the doc went 50,755 → 50,825 B,
  +70 being exactly the two new keys plus the changed values. Restore point:
  `debug/qbit-settings-restore.json` (56,846 B, gitignored). What remains is opening the
  dialog through the Discover route and reading `availableTargets` off the rendered DOM —
  the settings store is module-scoped, so there is no console shortcut for it.
- Gate 1 **BLOCKED on the user**, recorded in `~\.claude-runs\needs-user.md` 20:55. The
  daemon runs with `WebUI\LocalHostAuth=true`, `Username=admin`, `CSRFProtection=true`, so a
  real secret is required and only a PBKDF2 hash exists on disk. Do not harvest it from
  `qBittorrent.ini` — that is the escalation category the standing authorization excludes.
- Defect 5 is **CLOSED**: `a9b797aa` gives the client API-key auth, `83cb233f` gives the user
  a way to select it. See the ledger entry of the same date for the measured contract.

**Progress 2026-08-15 23:40 (`primary`). Gate 1 PASSES, live, with all four negative
controls re-asserted.** The user entered the API key into the OS keychain at ~22:30.

- **Precondition first, because it fails identically to an absent key:** active profile
  `relay-probe` reads `authMode:'apiKey'`, `apiKeyRef:'qbit/apikey'` — already correct, no
  UI defect to raise. **Validity control:** an unauthenticated `curl` to
  `127.0.0.1:8080/api/v2/app/version` returns **403**, so the daemon is genuinely refusing.
- **Gate 1:** `window.api.scraperQbitTest` on the real daemon → `connected`, version
  **5.2.3**, **30 ms**, message `Connected to 127.0.0.1:8080.`
- **Counting the wire.** Two of the four controls are claims about request *count* and header
  *name*, and neither is readable off a real daemon without the user's secret. So they ran
  against `debug/qbit-count-proxy.cjs` (127.0.0.1:8099, mode-switchable 403/404/200, logs
  every request) through the same main-process client, with a **decoy** key I supplied.
  1. Wrong key → `unauthorized`, "qBittorrent rejected the API key.", **exactly 1 request**.
  2. Key with a control char → **0 requests**, `latencyMs 0`; absent `apiKeyRef` → **0
     requests**, `latencyMs 0`. Proxy count unchanged across both.
  3. The only auth header on the wire was `authorization: Bearer <decoy>`; `x-api-key` was
     **absent from `Object.keys(req.headers)`**. The daemon-side half (real key as
     `X-Api-Key` → 403) was measured 2026-08-15 20:xx and **cannot be re-run from a relay
     turn** without extracting the user's secret — do not try.
  4. Non-200 version → refused: `unreachable`, "qBittorrent answered 404 to the version
     request." **Discriminating positive:** the same proxy switched to 200 returns
     `connected`, version `9.9.9` — so the refusal is about the status, not about the proxy.
- Trap: the proxy holds its log array **in memory** and rewrites the file per request, so
  deleting `qbit-proxy-log.json` does not reset the count. Diff counts, or restart it.

### P1 — the in-app walkthrough (a first-run user must not need a human)

State **before** the Connect button, not after, that the browser **will** fail to load
`http://localhost/oauth/callback`, that this is expected, and that the user copies the `code=`
value out of the address bar and pastes it back. Keep the panel's existing honesty properties:
no token reaches the renderer, nothing happens without a click, and the client id is asked for
rather than shipped. The reason the paste box exists is in the panel header (`:17-21`) — no
loopback listener, and an in-app browser would ask for a MAL password in a window this app
controls; Phase 8's secure browser host is what earns that.

**Gates.** 4. A user who has never seen MAL sync can complete a connection using only on-screen
text — verified by walking the panel from a clean profile and reading only what it renders.
5. New strings exist in all four catalogs (`shared/i18n/catalogs/{en,ja,zh,ru}.ts`) and
`node tools/i18n-check.cjs` exits 0. Baseline before this plan: **9,636** keys.

**Progress 2026-08-15 23:12 (`primary`). P1 CLOSES — gates 4 and 5 pass.** `6a1be82`.

- **Gate 4 PASSES.** The four walkthrough steps now render **before** the Connect button, and
  step 2 promises in advance that `http://localhost/oauth/callback` will not load. Every word
  already existed in `malSync.callbackDesc`, which lives inside `{pendingState && …}` — i.e. it
  only ever appeared *after* the failure it explains. **The fix was ordering, not text.**
- **The test asserts document order, not presence** (`renderer/__tests__/malSyncWalkthrough.
  test.tsx`, 4 tests): a refactor that keeps all four strings and moves them back under the
  button re-breaks the gate while every presence assertion still passes. **Mutation control:**
  with the block moved below the button the suite fails (`expected false to be true`); restored,
  4/4 pass and the panel compared **byte-identical** (`-ceq`) to its pre-mutation copy.
  The control also caught a defect in the test itself first — searching for the *first* element
  containing the text finds the card wrapper, because `textContent` is inherited, so index 0 is
  trivially before everything. It now takes the deepest match and uses `compareDocumentPosition`.
- **Gate 5 PASSES.** Keys live in `shared/i18n/malSync/{en,ja,ru,zh}.ts` (the module the
  catalogs aggregate — *not* `catalogs/*.ts`, which carry another track's dirty hunks).
  `node tools/i18n-check.cjs` **exit 0 at 9,890** English keys, all translated in ja/zh/ru.
- **Correction to this document.** "What is missing" item **6** (MAL Sync unfindable —
  `settingsRegistry` pointing at `api-keys`) is **already fixed and covered**:
  `renderer/__tests__/malSyncSettingsRouting.test.ts` derives the mounting page from
  `ScraperPage.tsx` source and asserts both the search result and the API-keys Manage button
  land there, with a negative control against ranking `api-keys` first. Do not re-fix it.

### P2 — MAL sync completeness

- Request the richer field set including `related_anime` (defect 2).
- Expose status filters, `completed` first (defect 3).
- Walk derivatives from `related_anime` and record the relation type.

**Gates.** 6. The full list is fetched with paging followed to the end, and the count matches
the user's real MAL profile. 7. A `completed`-filtered fetch returns only completed entries.
8. For a title with known sequels, the derivatives appear with their relation types. 9. A
`paging.next` that is not a MAL API URL still ends the walk (`malSync.ts:846-874` — assert the
guard, do not merely trust it).

**Progress 2026-08-15 22:30 (`primary`). P2 CLOSES — all four gates pass live on the user's
own account (`Asmilov`, default profile).** Two of them failed first and were fixed here.

- **Gate 6 PASSES** — `9107e1bd`. It **failed** on first measurement: `malFetchList()` returned
  n=**2000**, pages=**20**, `truncated:true`. `MAX_PAGES` was 20 and `PAGE_SIZE` 100, so the cap
  was the terminator, not MAL running out of cursor. Cap → 200 (20,000 entries, past any real
  list); a page carrying a cursor but zero entries now also stops the walk. Re-measured after a
  full app restart: n=**2144**, uniq=**2144**, pages=**22**, `truncated:false`.
- **Gate 7 PASSES** — `066a3630`, and it hid a second defect that a status assertion alone would
  have waved through. The server-filtered walk returned **1,414** entries, every one `completed`
  — gate 7 as written passed. The **set difference** against the full walk did not: **12** ids
  only in the full walk, **0** only in the filtered one, and **all 12 had `is_rewatching:true`**
  (Bakemonogatari, Kiseijuu, Hibike! Euphonium, Byousoku 5 Centimeter …). MAL's own
  `status=completed` omits what the user is rewatching — i.e. exactly the shows they are
  actively studying. `fetchAnimeList` now filters on the parsed status client-side; re-measured
  live: **1,426** entries, all completed, **12** of them rewatching, 22 pages, `truncated:false`.
  **Tradeoff:** a filtered read now costs the whole list, 22 pages instead of 15. Seven extra
  requests against the user's MAL quota to stop losing twelve titles silently. One-line revert.
- **Gate 8 PASSES** — `626f2354` (the previous worker's, verified live here, not trusted).
  Seed 5081 Bakemonogatari, depth 2, budget 40: **11** derivatives, **11** unique, **6**
  requests, `truncated:false`, and the seed itself correctly **absent** from its own output.
  Relations recorded: sequel 3, prequel 3, summary 2, side_story 1, alternative_version 1,
  parent_story 1 — Nisemonogatari (sequel, d1), Nekomonogatari: Kuro (prequel, d1),
  Kizumonogatari III (prequel, d2), Owarimonogatari (prequel, d2), Monogatari Second Season
  (sequel, d2). Real entries, MAL's own `relation_type_formatted` labels.
- **Gate 9 PASSES** — asserted in `626f2354`: a `paging.next` at `evil.invalid` ends the walk
  with `sent.length === 1`, so no bearer token reaches that host.
- Defects **2 and 3 are CLOSED** by the above. Defect **1 remains open and is P3's whole job**.
- **Trap for P3:** do *not* reach for MAL's `status=` query for speed. It is not a filter, it is
  a filter minus your rewatches, and nothing in the response says so.

### P3 — the anime/manga library actually receives the list

Write fetched entries into the anime/manga library rather than counting and discarding them
(defect 1), keyed so a later re-sync updates instead of duplicating.

**Gates.** 10. After one sync the library shows the user's real completed titles. 11. A second
sync produces no duplicates. 12. An entry the user updated on MAL reflects the change after a
re-sync. 13. Nothing auto-syncs on a timer — every call still hangs off a button, because a
write to a real MAL list cannot be undone from this side.

**Progress 2026-08-15 23:05 (`primary`). P3 CLOSES — gates 10–13 pass live on the user's own
account (`Asmilov`), on a dev app restarted for the new handler.** `0438a293`.

- **Decision (standing auto-approval).** There was no existing store to write into — the media
  library is keyed on files on disk and a MAL title has none, and no module in the tree
  referenced `malId` as an identity. So: a new `<userData>/mal-library.json`, merge logic in
  `shared/malLibrary.ts`, file half in `main/malLibrary.ts`. **Identity is `media:malId`**, not
  a bare id: MAL numbers anime and manga separately and a bare id collides the day a manga list
  syncs. **Tradeoff:** `mal:librarySync` takes rows the *caller* already fetched rather than
  fetching them itself. Costs one extra IPC hop for a payload that already crossed once; buys
  that every MAL request stays on the one audited path that owns the token and the `paging.next`
  host guard, and makes gate 13 structural — the module has no client, so it *cannot* sync.
- **Gate 10 PASSES.** Library before: `total 0, lastSyncAt null` (handler invoked live, not
  grepped). `malFetchList('completed')` → **1,426** entries in 8,532 ms, `truncated:false` —
  the same number P2 measured. Sync → **added 1,426, updated 0, rejected 0**, stored
  `total 1,426`, `byStatus.completed 1,426`, `derivatives 0`.
- **Gate 11 PASSES.** Same list again → **added 0, updated 0, unchanged 1,426**, total still
  1,426.
- **Gate 12 PASSES, with the negative control built in.** A real MAL edit is a write the user
  must authorise, so the change was staged the other way round: the first sync carried anime
  **8481** with `score 0, episodesWatched 0` while MAL really reports `score 5, watched 3`; the
  re-sync carried MAL's untouched rows. Result **updated 1, unchanged 1,425** — the count is the
  control, because a merge that overwrote blindly would have said 1,426. Stored row afterwards:
  `score 5, episodesWatched 3, origin list`, `addedAt 1786824015225` held from the first sync
  while `syncedAt` moved to 1786824041607.
- **The derivative-never-blanks rule, proven on real data.** `malFetchDerivatives([5081])`
  returned **11**; **8** of them are already on the user's completed list carrying
  `episodesWatched` 11, 4, 12, 26, 1, 4, 12, 7. Syncing the walk: **added 3, updated 8**, and all
  eight kept those exact eight numbers, stayed `origin:"list"`, and gained their relation and
  source (`11597 sequel from 5081`, `28025 parent_story from 32268`, …). `byStatus.completed`
  stayed **1,426** — the walk invented no completed rows. Total **1,429**, `derivatives 3`.
- **Gate 13 PASSES.** Structural first: `main/malLibrary.ts` imports no MAL client and holds no
  timer, so neither channel can reach MyAnimeList. Observed too: `lastSyncAt` still read
  **1786824081331** and total still **1,429** at 1786824488100 — **406,769 ms (6.8 min)** after
  the last write, with no user action in between. The file is real —
  `%APPDATA%\jp-study-app\mal-library.json`, **641,236 bytes**.
- **Trap for P4:** the panel's status dropdown filters **client-side in main**, deliberately. Do
  not "optimise" it into MAL's `status=` query later; P2 measured that omitting twelve
  rewatched titles.

### P4 — subtitles from the MAL page (nyaa + jimaku), no video download

This is the user's "or just download all japanese vocab from subtitles for all the episodes"
path, and it must work **without** touching a torrent client.

- From a MAL title, `subtitleHarvestList({anilistId, malId, title})` returns candidates.
- Both providers are reachable from that entry point: **jimaku** and **nyaa**. nyaa is
  default-disabled and last in priority, as it ships today — do not silently promote it.
- `planSubtitleHarvest(files, episodes)` honours an episode **range**, not only `all`.

**Gates.** 14. A range (e.g. 100–200) yields exactly the episodes in that range. 15. Real cues
come back from `subtitleHarvestFetch` — a non-empty count per episode, reported per episode.
16. When jimaku does not cover a title, nyaa is offered and its availability guard's four
distinct refusal messages still fire honestly rather than returning empty. 17. The whole P4
path completes with **no torrent client configured at all** — prove it by disabling the
qBittorrent connection for one run.

**Progress 2026-08-16 01:05 (`primary`). P4 CLOSES — gates 14–17 pass live.** `48bfcddb`,
`3c4c8179`. Every number is from the running app against the real Jimaku API.

- **Gate 14.** One Piece, range **100–200**: 2,885 candidates listed, **94 episodes planned,
  7 reported missing** (160, 170, 174, 180, 190, 196, 200), **0 outside the range, 0
  duplicated**. Control: episode 99999 → 0 picks, reported missing rather than silently dropped.
- **Gate 15.** Episodes 100–104 fetched: **1,667 cues** (360 / 337 / 391 / 255 / 324), 103,185
  characters, 0 fetch errors, combined timeline monotonic, **0 empty cues**.
- **Gate 16.** Nyaa is now reachable from the harvest entry point and all four refusals fire
  distinctly on a nonexistent title — `not-configured` (both an absent and a *malformed* config),
  `no-indexer` (both an empty list and a present-but-disabled indexer), `qbit-disabled`,
  `qbit-remote` naming the unreadable path. **Positive control: a valid config returns
  `available: true`**, so the refusals are not a blanket false. When Jimaku *does* cover the
  title the fallback is not computed at all (`nyaa: null`).
- **Gate 17.** Same run with `qbittorrent.enabled: false`: listed 2,885, all 5 planned ids still
  listed, all 5 fetched, byte-identical to the run above (18492/21143/25669/17323/20558). The
  harvest path imports no torrent client.

**Two defects, both live, both fixed.**

1. **`jimakuSearch` took `entries[0]`,** and Jimaku's `?query=` search is fuzzy and unordered.
   Measured before the fix: `Naruto` → **BORUTO, 293 files**; `One Piece` → a 15th-anniversary
   special, **1 file**; `Detective Conan` → a Lupin III crossover, **3 files**. Each listed
   *successfully*, and then a 100–200 range resolved to nothing. After `chooseJimakuEntry`:
   **220 / 2,885 / 1,148**, matching the explicit-AniList-id control exactly.
2. **AniList's GraphQL API is down** — `403 "The AniList API has been temporarily disabled due
   to severe stability issues"`, confirmed both by direct curl and by `idLookupDown: true`
   through the app. So the MAL→AniList hop fails for **every** id and the fuzzy title search is
   the only path left. This is why (1) was not cosmetic. `resolveAnilistId` now separates an
   outage from "no mapping" and no longer caches a bad minute as a fact.

**Traps for whoever is next.**

- **A title search can only match the names Jimaku filed.** `Detective Conan` still lands on a
  movie, because entry 743 is filed as `Meitantei Conan` / `Case Closed`. MAL's own title for
  that id *is* `Meitantei Conan`, which returns the right 1,148 — so the product path is fine and
  the hand-typed English one is not. The panel now states `matchedBy: 'title'` for exactly this.
- **AniList being down is not permanent.** When it returns, the id path takes over silently and
  these numbers will come from `matchedBy: 'anilist'` instead. Do not read a future
  `idLookupDown: false` as a regression in the fix.
- Reusable: `debug/stage-i18n-block.cjs <anchor> <first key> <key after block>` stages catalog
  additions as HEAD + block, which is mandatory while the four catalogs carry another track's
  uncommitted conversion.

### P5 — vocab into the deck

`analyzeMediaStudyCues` → `addMediaStudyFlashcards` (`renderer/mediaStudyWorkflow.ts:208`), with
`canMineHarvestItem` filtering and provenance on each card.

**Gates.** 18. Real vocabulary count from a real episode set, reported as a number.
19. **Negative control:** a word the user already knows must **not** appear in the mined output.
A run that mines everything has a broken filter, and an empty run is a finding, not a pass.
20. Cards land in a real deck, carry their context sentence, and record which title and episode
they came from. 21. Mining the same episodes twice does not duplicate cards.

### P6 — the torrent path and its contingencies

Only now, and only with the acquisition rules already in `NYAA_SUBTITLE_EXTRACTION_PLAN.md`
respected: sub-only under the 50 MB ceiling taken whole, batch releases fetched by per-file
priority with everything else skipped, an interleaved single-file MKV refused rather than
degraded, and a torrent the user already has left alone.

**Contingency gates — each is a distinct, honest state, never a generic failure and never a
false success.** 22. qBittorrent not running. 23. running but WebUI disabled — note v5.2.3
refuses to start the WebUI at all when credentials are unset and logs
`WebUI: Credentials are not set`; that must not surface as a timeout. 24. wrong password.
25. wrong API key. 26. unreachable host/port. 27. `savePath` not writable — the guard already
refuses by design; keep it. 28. disk full mid-transfer. 29. the app quits mid-acquisition and
restarts: no half-registered `SubtitleRecord`, no orphaned torrent in the
`jp-study-subtitles` category. 30. the same episode requested twice.

**Gate 31 — ATTENDED, and only on explicit user say-so:** one real Route A and one real Route B
acquisition from a MAL page, end to end, ending in cues that render in the player through the
same path a jimaku subtitle takes. This downloads from a public swarm on the user's own
connection. **Never run it unattended, and never inside an automated suite.**

**Progress 2026-08-15 23:35 (`primary`). P6 gates 22–28 and 30 measured; two were failing.**
`98ee9c6f`. Every number below is from the running app, not a suite.

| # | state | result |
| --- | --- | --- |
| 22 | not running (port 8123, nothing listening) | `unreachable`, `connect ECONNREFUSED 127.0.0.1:8123`, **53 ms** |
| 23 | WebUI disabled | **identical at the wire to 22** — the port is simply closed. Its real requirement holds: not a timeout. Discriminator measured against a listener that accepts and never answers → `Timed out after 12000ms.` at **12,114 ms** |
| 24 | wrong password | **WAS FAILING** → now `unauthorized`, "The username or password was rejected.", **14 ms** |
| 25 | wrong API key | `unauthorized`, "qBittorrent rejected the API key.", **189 ms**, real daemon, exactly 1 request |
| 26 | unreachable host (192.0.2.1) | `unreachable`, `read ECONNRESET`, **11,140 ms** |
| 27 | savePath unreadable | `nyaaAvailability` → its own `qbit-remote` reason, with the readable path passing as control |
| 28 | disk full mid-transfer | **WAS FAILING** → now names the error state on the first poll |
| 29 | quit mid-acquisition | **HALF OPEN** — see below |
| 30 | same episode twice | the preexisting-torrent branch, proven both ways |

- **Gate 24 was the first defect.** qBittorrent 5.2.3 answers **401** to a bad login; the client
  knew only the older `200 Ok./Fails.` pair, so 401 fell through to the generic non-200 branch and
  every wrong password read `unreachable` — telling the user to check a host and port that were
  both correct. The stand-in server encoded the same stale contract, which is exactly why 37 green
  tests never saw it. Both are fixed; the new test asserts the message is *not* "answered 401".
- **Gate 28 was the second.** `qbitAwaitFiles` polled file progress and nothing else, so a disk
  that filled mid-transfer was indistinguishable from a slow swarm: `FETCH_TIMEOUT_MS` is **5
  minutes**, and at the end of it the user was told it timed out. It now reads the torrent state
  each poll. **Mutation control:** with the state check disabled the suite runs **42,146 ms with 2
  failures**; with it, **3,610 ms, 14 passed**. `stalledDL` still waits — the control that stops a
  slow swarm being called a failure.
- **Gate 29 is half open, and is not being called a pass.** "The torrent is gone from the client"
  now reports itself honestly. The other half — that an app quit mid-acquisition leaves no
  half-registered `SubtitleRecord` — needs a real acquisition to interrupt, which is **gate 31,
  attended only**. Do not claim 29 until that runs.
- **The daemon-side probes had a budget.** qBittorrent bans an IP for an hour after 5 failed
  logins (no `MaxAuthenticationFailCount` in the ini, so the default applies). Three were spent
  proving the defect; gate 24's *fix* was therefore verified by replaying the daemon's own 401
  from `debug/qbit-count-proxy.cjs`, and gate 1 was re-run afterwards — still `connected`, 5.2.3,
  **4 ms**, so nothing was banned.

### P7 — the whole flow, once, as a user

**Gate 32.** From a MAL page: pick a title, choose a range, harvest subtitles, mine vocab, land
a deck — narrated with the real number produced at every step. **Gate 33.** The same flow with
the torrent path selected instead (attended). **Gate 34.** Full gates once at the end:
`npx vitest run`, `node tools/i18n-check.cjs`, `node tools/architecture-audit.cjs`,
`npx eslint <touched paths>`. `tsc --noEmit` is **not** a gate in this repo — 327 pre-existing
errors on a clean tree; prove "no new errors" by set-difference on file+message.

## Test discipline this plan is bound by

- **A negative control or it did not happen.** The qBittorrent auth table in Track 9 was first
  "proven" with `WebUI\LocalHostAuth=false`, under which every localhost request is authorised
  and all four methods return 200. The real result came from re-running with
  `LocalHostAuth=true` and a no-credential probe that correctly returned 403. Any auth or
  filter gate needs the equivalent: something that must fail, failing.
- **Report the number, not the adjective.** "Cues fetched" is not a result; "37 cues across 4
  episodes" is.
- **An empty result is a finding.** Zero vocabulary, zero candidates, zero library rows — say so
  and stop. Do not describe an empty run as working.
- **A `window.api` binding is not proof a handler exists.** Preload reloads with the window;
  main needs a restart. Invoke the handler.
- **Never assert on a stub that was not proven to install.** `window.api` is frozen.

## Traps

- A new `ipcMain.handle` needs a **full dev-app restart**, not a Forge rebuild or a window
  reload. The preload binding appears after a reload and then rejects `No handler registered`,
  which reads exactly like a wiring bug and is not one.
- The debug bridge's **token and pid change on every app restart** — re-read
  `debug/bridge.json` or every call returns `bad token`.
- `/eval` takes **one expression**, `(() => { …; return x })()`, never awaits, and **runs the
  expression twice** if it returns something non-serialisable. End every side-effecting eval
  with a cheap serializable value, and use stash-and-poll for promises.
- Renderer storage has **no restore point**. `localStorage['jp-scraper-settings-v1']` was
  measured at 44,490 bytes in a past audit. Read it before changing it and assert the restore
  byte-for-byte. Take **no** userData backup — standing user instruction, the directory is
  8.6 GB.
- `shared/i18n/catalogs/*`, `preload.ts` and `renderer/window.d.ts` all carry other tracks'
  dirty hunks. Never `git add` them plainly; splice HEAD + exactly your lines.
- The tree carries ~430 dirty paths from four concurrent tracks. Stage path-scoped only, verify
  what landed with `git log -- <path>` and never `git status`, and **never `git stash`** in this
  repo.
- MAL writes are irreversible from this side. Reads are free; a write needs the user.
