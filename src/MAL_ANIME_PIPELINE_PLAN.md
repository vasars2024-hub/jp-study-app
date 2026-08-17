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

**Progress 2026-08-16 02:05 (`primary`). P5 CLOSES — gates 18–21 pass live.** `79e6bba6`,
`0f432f7a`. One Piece episodes 100–104 through the real Jimaku API, on the user's own
3,221-card deck, restored byte-identical afterwards (1,320,982 bytes, folders `["Extension"]`).

- **Gate 18.** 2,885 files listed, 5 planned / 0 missing, **1,667 cues** (360/337/391/255/324),
  22,715 characters, **1,352 unique vocabulary items over 3,514 occurrences**, not truncated.
  Byte-identical on a second run after a reload, and identical to P4 gate 15's cue counts.
- **Gate 19.** そう set to level 2 → mineable **1,352 → 1,351**, absent from the mined output,
  and present in the control run immediately before. **Read this one carefully:** the filter
  removed **0 of 1,352** on the user's real knowledge state, so a mining run alone proves
  nothing about it — the negative control is the only evidence it executes at all.
- **Gate 20.** 30 cards: **30/30 carry an episode, a sentence and the title**, 0 outside
  100–104, 0 with a cue second past an episode's own length. Histogram 100:23, 101:6, 102:1.
- **Gate 21.** Mining the same episodes twice → **60 cards, 60 distinct words, 0 repeats**. It
  does not duplicate; it continues down the frequency list. That is the honest reading of the
  gate, not a workaround for a broken dedup — `existing` is scoped to `bookId`.

**Two defects, both live, both fixed.**

1. **The combined timeline made provenance meaningless.** `combineSeasonCues` offsets each
   episode past the last, so `firstSeenAt` on a 94-episode range is measured from the first
   episode and corresponds to no file on disk. Cards recorded the title and nothing else. New
   `locateInSeason` undoes the offset; `addMediaStudyFlashcards` writes episode +
   episode-relative second into `sourceRef`. Study Mode, with no season index, still writes no
   `sourceRef` rather than inventing an episode. Mutation control: `withinSec: seconds` →
   `expected { episode: 21, withinSec: 85 } to deeply equal { … withinSec: 10 }`, 2 failures.
2. **The Flashcards explorer never listed a single mined media card.** `epubCards`
   (`FlashcardsContent.tsx:335`) was an allow-list of five sources; `'media'` and `'extension'`
   are not in it. Measured histogram on the real deck: **media 1, dictionary 3, epub 3,218** —
   and the media card was in no tab, no count, no group, while the sidebar's own "Media" folder
   chip read `Media 0` holding a Media card. So every card this whole plan produces was
   invisible in the surface that exists to show the deck. Now "everything except `dictionary`".
   Control: the surface's own search for the card's word returned **0 matches** before and
   **1 row** after, same card, same window.

**Traps for whoever is next.**

- **`addDeckCards` auto-creates the card's folder and no removal path drops it again.** A probe
  that mines and then deletes its cards leaves `,"Media"` — exactly 8 bytes — in
  `jp-flashcard-deck`, and a byte-identical restore check fails on it. `deleteDeckFolder` is the
  reverse; it is safe only once 0 cards reference the folder.
- **The deck has no restore point and localStorage is mirrored to IndexedDB.** Restore by
  removing the probe's own cards through `removeDeckCards`, not by rewriting the blob.
- `mineableVocabulary` (`mediaStudyWorkflow.ts`) now owns the `getLevel(w) < 2` filter that was
  written inline in the VN miner and again in the harvest panel. Do not re-inline it.
- P5's gates are the last unblocked ones below P6: **gate 29 is half-open and gates 31/33 are
  attended-only**, so the next unblocked slice is **P7 gate 32**, the whole flow driven through
  the real UI rather than through the modules as these gates were.

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

## 2026-08-16 — P7 gate 32, first leg driven live; both catalogues are down

Worker `backup`. Gate 32 is **partially measured and then externally blocked**, and the two
defects the attempt exposed are fixed and committed.

**External block, measured not assumed.** `curl` direct: Jikan `HTTP 504` *"Jikan failed to
connect to MyAnimeList. MyAnimeList may be down/unavailable"*; AniList GraphQL `403`
*"The AniList API has been temporarily disabled due to severe stability issues."* Through the
app's own handler: `searchDiscovery('One Piece')` → **0 candidates, failures `['jikan','anilist']`,
servedBy `null`**. So gate 32's "pick a title from a search" leg cannot run today. The **feed**
leg does: `browseDiscovery('this-season')` → **25 candidates, servedBy `anilist`, failures
`['jikan']`** (disk cache), and 26 rows render.

**Defect 1 — a total outage reached the user as "Nothing matched." (`5020872`, recovered from
the interrupted turn).** Both provider clients collapsed a transport failure into `[]`.
`jikanSearch`/`anilistSearch` now answer `null` for "did not answer"; `searchDiscovery` returns
the `DiscoveryFeedResult` shape the feed already used. Live: the placeholder now reads
*"MyAnimeList · AniList did not answer, so this is not a result — nothing was searched."* with
class `disc-placeholder disc-placeholder-error`. **Control:** same build, same session, one
provider down and rows served — 26 rows, placeholder `null`, no outage text. The message is
gated on `loadState==='empty'`, set from the raw count, so a filtered-to-zero list can never be
blamed on a provider. 5 unit tests, including "both answered with nothing ⇒ zero failures".

**Defect 2 — the download dialog showed the channel name (`d5d1375f`).** Driving
row → inspector → `Download…` on an AniList-sourced title rendered *"Could not list anything to
download — Error invoking remote method 'scraper:malUnits': Error: The catalogue has no anilist
entry 185874."* New `shared/ipcErrorText.ts` strips Electron's wrapper; both discover surfaces
now share it. Live after a reload: *"— The catalogue has no anilist entry 185874."* 6 tests,
including the control that it never returns an empty string (an empty status line reads as
success).

**Traps for the next worker.** (1) The dialog's error is captured in state at fetch time — HMR
re-renders but does **not** re-run it, and `/key Escape` did not close the modal either. Only
`/reload` + a rows poll re-drove it; `debug/p7-drive.cjs` is that driver. (2) Discover's own
filters (level select, hide-owned) cannot empty a non-empty feed, so the filtered-to-zero
control has no live path — it rests on the `loadState` gate and the unit tests.

**Gate 32 remains OPEN** on the harvest→mine→deck legs: they need a title with jimaku coverage,
which needs a working search. Re-check the two catalogues at the start of the next MAL turn.

## 2026-08-16 — P7 gate 32 CLOSES: the whole flow driven through the real UI

Worker `primary`. AniList recovered (`HTTP 200`, One Piece id 21); **Jikan is still `504`**, so
the app ran one provider down throughout — which is also the honest control for the outage
message: rows served, no outage text. Commits `a0a0010`, `69b5084`.

**Gate 32, every leg through the real UI**, One Piece 100–104 on the user's own 3,221-card deck,
restored to **3,221 cards / 1,320,982 bytes / folders `["Extension"]`** afterwards.

| Leg | Measured |
| --- | --- |
| Search "One Piece" | **12 rows** (AniList; Jikan down) |
| Pick → inspector | `ONE PIECE · TV · 1999 · Toei Animation`, buttons Download…/Shortlist/Open source page |
| Download… | **301 units listed, 1,147 total** — the `no anilist entry` defect is gone |
| Subtitles only → Range 100–104 | **"5 episodes selected"**, 5 checkboxes checked |
| Find subtitles | **5 of 5 covered, 2,885 files filed** |
| Harvest | **1,667 lines, 22,715 chars, 1,352 unique words, 675 kanji, 0 failures** |
| Mine | **30 cards**, toast visible, histogram **100:23 101:6 102:1** |
| Verify | 30/30 carry episode + sentence + title, `bookId harvest:anilist:21` |

Cue and vocabulary counts are byte-identical to P4 gate 15 and P5 gate 18 across two independent
runs plus a reload. Mining twice → **60 cards, 60 distinct, 0 repeats** (P5 gate 21 through the UI).

**Two defects found by driving it, both fixed.**

1. **`showToast` had no viewport mounted anywhere (`a0a0010`).** `components/ui/Toast.tsx` says
   "mount `<ToastViewport/>` once"; nothing did — not `App.tsx`'s 10 shell branches, not
   `blancMain.tsx`. So the harvest's "mined N words" and the download dialog's finished/failed
   announcement both dispatched into no listener: **clicking Mine added 30 cards and produced
   zero `.ui-toast-host` nodes.** `ToastHost` — the one component already mounted once per shell
   — now mounts it, and no longer early-returns `null` on an empty `os:toast` list, which would
   unmount the `ui:toast` listener whenever no `os:toast` is on screen. **Negative control:**
   remove the `<ToastViewport />` and 3 of the 4 new tests fail, the `os:toast` one still passes.
   Live after: 0 hosts before dispatch, **1** after, correct `ui-toast--success` class.
2. **The Mine button promised 1,352 words and added 30 (`69b5084`).**
   `addMediaStudyFlashcards` defaults to `limit: 30` — right for `MediaStudyMode`, where one
   video is one sitting — and the panel passed no limit, silently inheriting it while its label
   read *"Mine 1,352 words"*. `VISIBLE_VOCAB`'s comment claimed "the rest are still mined",
   false for the same reason. The batch is now an explicit `MINE_BATCH` the panel owns and the
   label names both numbers: live it reads **"Mine 30 of 1,352 words"** and adds 30. New key
   `subHarvest.action.mineBatch` ×4; i18n exit 0 at **9,992** (+1).

**Traps.** (1) The `0% you know` / `mineable 1,352 of 1,352` reading is **not** a broken filter —
P5 gate 19 already proved it with そう→level 2 giving 1,351. Do not re-open it as a finding.
(2) The four catalogs carry ~1,200 lines of another track's work: stage them with
`debug/stage-head-insert.cjs`, never `git add`. (3) `debug/g32.cjs <step>` drives the whole flow
one step per invocation and is the cheapest way back to any leg.

**P7 gate 32 is CLOSED.** Remaining in this plan: gate 29 (half-open) and the attended-only
gates 31/33, which need the user in the moment.

## 2026-08-16 — gate 33 driven live on the user's authorised title; two defects fixed, send still refused

Worker `primary`. Gates 31/33 authorised in chat (`needs-user.md`, "1. go"), so this turn ran
them. Commits `1e757977`, `2804e7d3`.

**The title, named before any transfer, as promised.** From `malFetchList('completed')` — 1,426
rows, 321 with `totalEpisodes === 1`. Surveyed 110 of those 321 through the app's own
`scraperSearchTorrents`: **Date A Live II: Kurumi Star Festival** (MAL 22961), release
`[project-gxs] Date a Live II - Kurumi Star Festival OVA [10bit BD 720p] [5ACBBFF2].mkv`,
**104.8 MB, 5 seeders** — smallest exact-title match with a live swarm in the sample.

**Gate 33, leg by leg through the real UI.** Search "Date A Live II" → **3 rows**; inspector
`OVA · 2014 · AIC Plus+`; Download… → Episodes shelf active; Everything → **1 episode selected,
1 unit**; Find releases → **2 releases found**.

| | before | after |
| --- | --- | --- |
| plan summary | `0 of 1 covered · 0 torrents` | `1 of 1 covered · 1 torrent` |
| send button | `Send 0 torrents` **disabled** | `Send 1 torrent` **enabled** |

**Defect 1 — no one-episode title could ever be downloaded (`1e757977`).** `planMalReleases`
bound a release only via `releaseCoversEpisode`. An OVA/movie/special numbers nothing because
there is nothing to number, so all 321 planned to zero. New `namesAnyEpisode` separates
"unnumbered" from "names a *different* episode", which is still refused; gated on a new
`singleUnitTitle` option, not `units.length === 1`, because hand-picking episode 7 of 26 also
selects one unit and there an unnumbered release is a season pack. **Trap:** `namesAnyEpisode`
needs `(?![\dA-Za-z])` on the trailing edge or the CRC32 tag `[E9ED99BE]` reads as "episode 9"
and every checksummed release looks numbered. 55 tests; mutation control (widened match made
unconditional) fails **4**.

**Defect 2 — a refusal said only "answered 409" (`2804e7d3`).** The send reached qBittorrent and
came back `accepted 0, skipped 0, rejected 1`; the per-row reason was `qBittorrent answered 409.`
`qbitSend` had `response.body` in hand and dropped it. `addFailureReason` now appends the
daemon's own text, capped at 200 chars, unmapped. The stand-in server only ever answered
`200 Ok.` — the same stale-stub shape that hid gates 24 and 28 — and now answers a configurable
status *and body*. 41 tests; mutation control fails **2**.

**GATE 33 IS NOT CLOSED.** Every leg up to and including the send works; the daemon refuses the
add. Most likely cause, from the live config: `autoTmm: true` + `category: 'jp-study'` +
`savePath: ''`, and **nothing in the app ever creates that category**, so automatic management
has no path to resolve. Next slice: read the real 409 body (needs a full app restart — `2804e7d3`
is a main-process change and the running app predates it), then create the category via
`/api/v2/torrents/createCategory` before adding, or fall back. Gate 31 (Route A/B) is untouched.

**Traps.** (1) The dialog's send result renders in `.mal-dl-message`, which carries **no**
`role=alert|status` — a poll on those selectors reads empty and looks like a silent failure.
(2) `listNyaaSubtitles` on The Big O returns **0 candidates** honestly: nyaa has only single-file
MKVs for it and both routes correctly refuse those. Not a defect. (3) Sub-pack (Route A)
releases with ≥3 seeders are genuinely rare on nyaa today — `Koe no Katachi subtitle pack`,
the Grendizer U `.ass` files and the Kitsunekko archives all sit at **0 seeders**.
(4) `debug/g33.cjs` drives this flow one step per invocation; the Scraper window must be opened
from Start first or every step returns `no Scraper window`.

## 2026-08-16 — the 409 is a duplicate, and the reason never reached the user

Worker `primary`. Commits `4df53cbc`, `5b8cbb24`. **The category theory in the section
above is FALSIFIED — do not spend another turn on it.** Measured against the user's own
daemon (**v5.2.3**, `categories.json` is `{}`): a fresh magnet sent with that same
nonexistent `jp-study` category and `autoTMM=true` returns **200**. The category is not
the cause and `createCategory` is not needed.

**The real `torrents/add` contract, measured, five probes.** Empty `urls` → **409
`Conflict`**. New magnet → **200** `{"added_torrent_ids":["…"],"failure_count":0,
"pending_count":0,"success_count":1}`. The *same* magnet again → **409 `Conflict`**.
Malformed magnet → **409 `Conflict`**. One duplicate + one new in a single batch →
**200 with `failure_count:1, success_count:1`**.

Two defects follow, and neither is error handling.

**Defect 1 — a 200 was read as "every row sent" (`4df53cbc`).** On the mixed batch above
the app reported the refused episode as delivered. `parseAddOutcome` reads the 5.2 JSON
and returns `null` for 4.x's plain `Ok.` (that contract genuinely has no per-row
information, so whole-batch behaviour is kept there). Rows are attributed by infohash;
when they cannot be, the **whole batch is failed rather than guessed** — a false failure
is visible in qBittorrent, a false success silently loses an episode. 50 tests; mutation
control (`settleAddedRows` made unconditional) fails **2**, disabling the duplicate
lookup fails **1**.

**Defect 2 — the reason never left the main process (`5b8cbb24`).** `report.details`
already carried a per-row reason; `MalDownloadDialog` read only the three counts, so a
refused send showed `0 accepted, 0 skipped, 1 rejected` and nothing else. The
`.mal-dl-failures` disclosure existed but was fed only by the batch-acquisition path.
Both producers feed it now. 33 tests; mutation control fails **2**.

**GATE 33's 409 IS EXPLAINED: the torrent was already in the transfer list.** The magnet
is sound — read live out of the running app, `magnet:?xt=urn:btih:944969c7…`, 342 chars,
**4 seeders, 104.8 MB**, `[project-gxs] Date a Live II - Kurumi Star Festival OVA`. Since
409 means *nothing in the batch was added* and the link is well formed, a duplicate is
the only remaining cause. **Gate 30 ("same episode twice") now has its distinct honest
state**: `Already in qBittorrent.`, established by consulting the transfer list, because
v5.2.3's 409 body is the literal word `Conflict` and names no cause at all.

**Still open, and it needs an app restart the relay did not take.** The live re-run of
gate 33 requires the running Electron (pid 41504, started 09:10, predates both commits)
to be restarted — main-process changes do not hot-reload, and that process was not
started by this relay, so it was left alone. Next worker: restart the app, then
`node debug/g33.cjs` through `send`.

**Traps.** (1) `torrents/info` truncated at 500 chars parses as `[]` and reads as "the
client is empty" — it was not; five real torrents were there. (2) Probe torrents land in
the user's real client; `debug/qbit409b.cjs clean <hash…>` removes them, and two were
removed this turn.

## 2026-08-16 — GATE 33 CLOSES: the 409 was chunked encoding, not a duplicate

Worker `backup`. Commit `5127c0a6`. **The duplicate explanation in the section above is
FALSIFIED** — the infohash `944969c7…` was not in the transfer list before the send, after the
send, or at any point I looked. Do not spend another turn on it.

**The real cause, measured on a tap in front of the real daemon.** `scraperRequest` wrote its
POST body with `request.write()` and no `content-length`, so Node framed it as
`transfer-encoding: chunked`. qBittorrent 5.2.3's WebUI parses **no** form field out of a
chunked request: `torrents/add` saw an empty `urls` and answered its empty-`urls` 409. Bisecting
the *form* found nothing — all 16 variants (full app form, urls-only, each field alone, each
field removed) returned **200** with a fake magnet, and the real 342-char magnet returned 200
too. The tap settled it: same handler, same magnet, same form, only the framing changed →
`sent 1`. `resolveRequestOptions` now sets `content-length` from `Buffer.byteLength` for any
non-GET/HEAD body a caller did not already declare. 18 tests; mutation control (the guard made
unreachable) fails **1**.

**GATE 33 IS CLOSED — a real acquisition, through the real UI, on the authorised title.** Named
before the transfer, as promised: **Date A Live II: Kurumi Star Festival**,
`[project-gxs] … OVA [10bit BD 720p] [5ACBBFF2].mkv`, **109,890,765 B (104.8 MB), 5 seeders**.
Legs: search → **3 rows** · pick → `OVA · 2014 · AIC Plus+` · Download… → Episodes shelf ·
**1 episode selected** · Find releases → **2 releases found**, `1 of 1 covered · 1 torrent` ·
Send → **`qBittorrent accepted 1, skipped 0, rejected 0.`** and the infohash appears in the
user's own client under category `jp-study`.

**GATE 30 has its live negative control in the same run.** Pressing Send a second time with the
torrent now present: **`accepted 0, skipped 0, rejected 1`** and the row reads
**`Already in qBittorrent.`** — the distinct honest state, not a generic 409.

**Traps.** (1) A tap that forwards with Node `fetch` must strip `transfer-encoding` and
`content-length` from the forwarded headers, or undici throws `invalid transfer-encoding header`
and the app reports `read ECONNRESET` — which reads exactly like the daemon being down.
(2) After a full restart the shell restores **no** windows; open Scraper from Start (`.os-start-btn`
then the `Scraper` item) before any `debug/g33.cjs` step, or every step answers `no Scraper window`.
(3) `debug/g33.cjs all` answers `no All mode` on a one-episode title; the single unit is already
ticked, so that refusal is not a defect.

## 2026-08-16 — gate 31 Route A: one candidate exists in 99 titles, and it has 1 seeder

Worker `backup`, same turn as `5127c0a6`. Not a slice — a measurement, so the next turn does not
re-survey. `debug/g31-routes.cjs` (now takes a **minSeeders** 5th arg) applied the app's own
`looksLikeSubtitleOnly` / batch predicates to the app's own nyaa results across the user's
completed list, indices **0–98** of the ≥2-episode pool, at **minSeeders 1**:

- **Route A (subs-only ≤ 50 MB): exactly 1 hit in 99 titles.** `Cyber City Oedo 808` (MAL 1352) →
  `[GB] Cyber City Oedo 808 Bluray 1080p x264 TriAudio (2021) SUBS ONLY-By request`,
  **36,175,872 B, 1 seeder**. Everything else: **0**.
- **Route B (batch that could carry sidecars): 60 of 99 titles have at least one**, so Route B is
  not swarm-blocked; the open question there is whether a chosen batch really contains separate
  `.ass`/`.srt` files, which only the file list after metadata answers.

So the earlier "sub-packs are rare" trap is now a number: rare means **1 %**, at one seeder. That
is the Route A the gate has to use unless the user's library grows.

**Gate 33's transfer, since the send is not the whole story.** The accepted torrent is really
acquiring: `downloading`, **2.5 % (2,719,744 / 109,855,988 B)** at **14 KB/s from 1 connected
seed**, writing to `C:\Users\Arseniy\Downloads\jp-study\[project-gxs] … [5ACBBFF2].mkv`. At that
rate it needs about two hours; the *product* path is proven either way, and a later worker can
read completion straight off `torrents/info`.

## 2026-08-16 — gate 31: the nyaa fetch could never have worked, and now the routes are measurable

Worker `primary`. Commits `279edba1`, `84ac73d7`. **Gate 31 does not pass and is not being
called a pass** — but its two blockers are now numbers rather than guesses, and the mechanism
underneath it works for the first time.

**Defect 1 — the whole provider was a false negative (`279edba1`).** `qbitAddStopped` sent
`paused=true&stopped=true`. A stopped magnet never contacts the swarm, so its metadata never
arrives and `/api/v2/torrents/files` answers `200 []` forever; `nyaaFetch` read that list one
request later and returned **"This release contains no subtitle files."** Measured on the real
daemon with `[NanaOne-Yamayurikai] The Big O 01-26`, 6,442,450,944 B, 3 seeders: added stopped →
`total_size: -1`, **0 files**, 1 s. Re-added with `stopCondition=MetadataReceived` → **26 files
in 4 s**, back to `stoppedDL` by itself, `downloaded: 0`. New `qbitAwaitMetadata` polls for the
list then stops the torrent (`stopWhenReady` is false for a torrent the user already had — never
pause theirs). A silent swarm gets its own sentence. 4 tests; mutation control fails both new
ones, the timeout case at the defect's own string.

**Defect 2 — the listing offered other people's shows (`84ac73d7`).** The live listing for
*The Big O* returned 4 rows at minSeeders 1 and **two were "[HYSUB]The Legend of Heroes - Sen no
Kiseki - Northern War"** (3.97 GB, 1.83 GB), ranked usable. `looksLikeSameTitle` now needs half a
title's significant words as whole words in the release name; "the/a/an/of/and/or" are stopwords
and Japanese particles are not. Live control after the fix: **4 → 2**, both genuinely The Big O.

**Route B's open question is answered: 0 of 6.** `debug/g31b.cjs` added each batch candidate with
`stopCondition=MetadataReceived`, read the real file list, and deleted it (`downloaded: 0` every
time). Across The Big O, Kishibe Rohan and Nanatsu no Taizai: **0 of 6 batch releases carry a
single sidecar subtitle file** — every `[Multiple Subtitle]`/`[Erai-raws]` release is muxed MKVs
(4 files, 0 subs). 2 of the 6 never sent metadata within 60 s at 1 seeder.

**Route A's one candidate is bitmap English.** The `[GB] Cyber City Oedo 808 … SUBS ONLY` release
— the *only* Route A hit in the 99-title survey — holds **9 files, all `.sup`, all `[eng]`**.
PGS bitmaps, not text. The product's `bitmap-only` refusal is correct for it, so there is no
acquirable Route A in this library today.

**Live acceptance through the fixed app**, `The Big O - 01` → the NanaOne batch: **59 s**, state
`metaDL`, 4 seeds listed / 0 connected, message *"qBittorrent could not read what is inside this
release: no peer sent its file list in time."* — a distinct honest state where the old code said
"contains no subtitle files" in 1 s from an empty list. Still 0 files after 2.5 further minutes,
so that was the swarm, not the timeout.

**Traps.** (1) `acquisitionConfigFrom` reads indexers from `sources.entries`, **not**
`torrents.indexers` — the latter does not exist and a probe that uses it gets `no-indexer`.
(2) The profile's `minSeeders` is **3**, which alone hides every 1-seeder candidate; pass an
override to see them. (3) The dev app does **not** hot-restart main — every main-process change
needs a full `npm start` before a live check means anything.

## 2026-08-16 — GATE 2 CLOSES, and the dialog that named no destination

Worker `primary`. Gate 2 ("`MalDownloadDialog` lists `qbittorrent` in `availableTargets`") was
the last P0 remainder — the settings precondition was written through on 2026-08-15 but nobody had
read the rendered dialog. Driven live on bridge pid 25856, Discover → row download button →
*Saga of Tanya the Evil Season 2* (12 episodes) → **Find releases** → a real plan, **"Send 7
torrents"**.

**Gate 2 PASSES, by deduction with the controls built in** — `availableTargets` is module-scoped
state with no console reach, so it is read off four independent DOM facts:

| observation | what it forces |
| --- | --- |
| `scraperGetAcquisitionSnapshot()` → `torrentClient 'offline'`, `debrid 'offline'` | neither of those two was pushed |
| Send button **enabled** (`disabled={… \|\| !availableTargets.length}`) | length ≥ 1 |
| **no `<select>`** (renders at `length > 1`) | length ≤ 1 → exactly **1** |
| **no `.mal-dl-destination`** (renders when `sendTarget !== 'qbittorrent'`) | `sendTarget === 'qbittorrent'`, set by `setSendTarget(targets[0])` |

The last row is the discriminator, not decoration: an empty `targets` leaves `sendTarget` at its
initial `'torrent-client'`, which renders the input **and** disables the button — a state distinct
from the observed one in both fields. So `availableTargets === ['qbittorrent']`.

**The observation found a defect, which is the point of observing.** Those same two guards mean
that with **one** reachable target the dialog names its destination **nowhere**: the picker needs
`> 1`, and the destination input is hidden precisely when the target is qBittorrent. The user was
shown "Send 7 torrents" with no answer to "send where?" — the plan's "a new user must not need a
human" constraint, in miniature. Fixed: a `length === 1` line reusing the picker's **existing**
keys (`malDownload.sendTo` + `malDownload.target.*`, all four locales already present, so
i18n-check is unmoved). Live after HMR: **"Send to qBittorrent"**, 103×16 px, contrast **5.93**
(label, 11 px) and **13.68** (value, 12 px), 0 raw i18n keys.

**3 tests, both mutations caught by the right test and only that test.** `=== 1` → `false`: only
"names the destination…" fails. `=== 1` → `>= 1`: only "keeps the picker…" fails. File restored
**byte-identical** (sha256 `d3e0ca47…`) and 36/36 green after. Third test holds the zero-target
state so the new line cannot leak into it.

**Trap for the next worker.** `/click` on this bridge takes `{x, y}`, **not** a selector, and a
coordinate click on the Discover row button did nothing (window offset). `el.click()` through
`/eval` drives React's synthetic handler correctly — use that. `/eval`'s body key is **`js`**,
not `expression`.

Commit `70d48c47` — `MalDownloadDialog.tsx`, `styles.css` (spliced HEAD+4 lines; that file
carries another track's hunks), `malDownloadDialog.test.ts`.

## 2026-08-16 — gate 29's other half: the category written three times and read never

Worker `primary`. Gate 29 ("the app quits mid-acquisition and restarts: no half-registered
`SubtitleRecord`, no orphaned torrent in `jp-study-subtitles`") was left HALF OPEN on 2026-08-15
with the note that its remainder "needs a real acquisition to interrupt, which is gate 31,
attended only". **That was wrong, and it cost this gate a day.** The half that was open is not a
*successful* acquisition, it is an *interrupted* one — and the interruption is the cheap part.

**Half (a), `SubtitleRecord`: PASSES, structurally, and needed no live run.**
`subtitleDiscovery.ts:818` awaits `nyaaFetch` and only then calls `writeSubtitleFile` (`:824`) and
`patchItems` (`:848`). Both are strictly after the `if (!outcome.ok) return`. A process death
anywhere in the acquisition therefore writes no file and no record. There is no window to be
half-registered in.

**Half (b): FAILED, and the proof needed no swarm at all.** `QBIT_SUBTITLE_CATEGORY` occurred in
**exactly 3 places, all inside `qbitAddStopped`** — `:786` declaring it, `:881` `category=`,
`:882` `tags=`. **Written three times, read zero times.** Nothing reaped it, resumed it, listed
it or mentioned it. A torrent added a moment before the process died kept downloading on the
user's connection, forever, for a subtitle no record could ever point at.

**Live baseline, measured before writing anything** (`scraperQbitTransfers` on the real daemon,
profile `Relay Probe MOUSE`): **6 torrents — 5 category `""`, 1 `jp-study`, 0 in
`jp-study-subtitles`.** The five uncategorised ones are the user's own (added 2025-12-25 through
2026-07-27, long before this relay); the `jp-study` one is gate 33's transfer at **79.4 %**. So
there is no pre-existing orphan to clean — earlier probes deleted theirs by hand — but nothing
would have cleaned one either.

**Fix: `qbitReapSubtitleOrphans`, swept at the head of `nyaaFetch`, not at app startup.** The
tradeoff, recorded because it is not obvious: this provider is *told* its qBittorrent config per
request (renderer-owned, per profile — the file header says so), so main holds no config at
launch and a startup hook would have nothing to authenticate with; sweeping at acquisition also
keeps the app from phoning someone's torrent client on every boot, which the same header calls
out as deliberately not-unattended. Deleting is consistent with "the app does not delete from
someone else's torrent client" precisely because **only `qbitAddStopped` ever writes this
category** — it is the app's own. `deleteFiles=true` goes with it: a part-fetched sub-pack is
worth nothing and its bytes are the leak. A module `inFlight` set holds back hashes this process
is acquiring, so a concurrent fetch is never swept from under itself; it is empty on a fresh
start, which is exactly right, because after a crash everything in that category *is* abandoned.

**4 tests, 2 mutation controls, each caught by exactly one test.** The stand-in answers the
category query with the **whole** transfer list — the way a build ignoring the parameter would —
so only the sweep's own re-filter keeps it off the user's torrents. Drop
`category === QBIT_SUBTITLE_CATEGORY`: only "does not touch a torrent outside its own category"
fails. Drop `!keep.has(hash)`: only "holds back the hash it is about to acquire" fails.
`qbittorrent.ts` restored **byte-identical** (sha256 `ac011651…`); **79/79** green across
`subtitleNyaaFetch` + `scraperQbittorrent`.

**NOT DONE, stated rather than implied: the live leg.** The reaper is main-process code and the
dev app is running the old main, so it has *not* been exercised against the real daemon. Gate 29
is therefore **still not a pass** — half (a) is proven, half (b) has a fix with a stand-in and
controls behind it and no live measurement. Next turn: restart the app, start a nyaa acquisition,
kill the app once the torrent appears in `jp-study-subtitles`, restart, run a second acquisition
and read that the orphan is gone while the 5 uncategorised user torrents and `jp-study` are
untouched — that last clause is the live negative control and is the point of the whole slice.

## 2026-08-16 — GATE 29 CLOSES: the live leg, and the five torrents that stayed put

Worker `backup`. No product code changed — this is the live measurement the previous turn
named as the only thing standing between `qbitReapSubtitleOrphans` (`81526f18`) and a real
pass. Driver `debug/g29-live.cjs` (gitignored, like every gate driver here).

**The app was restarted first, because main does not hot-reload** — the previous turn's app
predated nothing, but the rebuild is what makes the measurement mean anything: Forge reported
`target built src/main.ts` at 22:32:23, new pid 40416.

**Baseline, real daemon, profile `Relay Probe MOUSE`: 6 torrents — 5 category `""` (the user's
own, added 2025-12-25 → 2026-07-27), 1 `jp-study` (gate 33's, now 100 %), 0 in
`jp-study-subtitles`.**

**The interruption.** `acceptNyaaSubtitle` on `The Big O - 01` → the NanaOne batch
(`e953e84b…`, 3 seeders). The torrent appeared in `jp-study-subtitles` within the first poll —
**7 torrents, `state: downloading`**. Electron main (pid 29848) was then killed with
`Stop-Process -Force`: 6 electron processes → **0**. That is the crash, taken mid-acquisition.

**The orphan outlived the process, measured not assumed.** After the restart, before any sweep
could run: **7 torrents, 1 in `jp-study-subtitles`**, `e953e84bf2ef`, paused, 0 %. No
`SubtitleRecord` points at it and — before `81526f18` — nothing in the app would ever have
named it again.

**The sweep, and its negative control.** A second acquisition on the *other* candidate
(`247d9777…`, SFEO-Raws) ran the reaper at the head of `nyaaFetch`:

| assertion | result |
| --- | --- |
| `e953e84bf2ef` still present | **gone** — `ORPHAN_CLEARED: true` |
| all 6 baseline torrents present, category unchanged | **true**, `missingFromBaseline: []` |
| added since baseline | exactly 1 — the second acquisition's own `247d977772eb` |
| final categories | `(none): 5, jp-study: 1, jp-study-subtitles: 1` |

The second row is the control and is the whole point: a sweep that ignored its category query
would have deleted the user's five, `deleteFiles=true` and all. It did not touch one of them.

**Two traps for the next worker.** (1) **Candidate ids are session-scoped in main.** A
`nyaa:<hash>` id read back from a saved JSON refuses with *"That release is no longer in this
session's listing."* — from the discovery layer, **before** `nyaaFetch`, so it does not even
reap. Re-run `listNyaaSubtitles` after every restart. (2) **Do not score this gate by
`inCategory === 0`.** The sweep runs at the head of the acquisition that clears it, so that
same acquisition adds its own torrent a moment later; assert on the orphan's **hash**.

**End state, stated rather than left implied:** `247d977772eb` is still in
`jp-study-subtitles` fetching metadata at 1 seeder (0 bytes down). That is the same residue
the reaper now exists to clear, and the next acquisition clears it.

## 2026-08-16 — the nyaa offer pointed at a tab that does not carry the button

Worker `backup`. Defect found while scoping the plan's own open item ("wiring the MAL harvest
entry point to nyaa"). Not that wiring — this is the honesty defect sitting in front of it.

**What was wrong.** When Jimaku files nothing, `SubtitleHarvestPanel` does not run nyaa; it
names it as the next step in prose (`subHarvest.nyaa.offered`, rendered at
`SubtitleHarvestPanel.tsx:337`). All four catalogs said *"Nyaa can be searched instead from the
**Episodes** tab"*. The nyaa button is rendered under `{tab === 'subtitles' && (`
(`MediaDetailPanel.tsx:357`, button at `:363`); `episodes` is a different tab declared at
`:170`. The sentence also implied any MAL title works, while `listNyaaCandidates`
(`subtitleDiscovery.ts:761`) refuses anything `host.listItems()` does not hold — *"That media
item is no longer in the library."* A title the user has not downloaded has **no route at all**.

This is the settings-search defect's exact shape, which the user hit personally: a pointer to a
surface that does not hold what it promises. Neither the suite nor `i18n-check` can see it —
both keys exist, all four locales are present, and only the *relationship* between them is wrong.

**Fixed in all four locales**, naming the Subtitles tab and stating the library precondition.
i18n-check unmoved at **10,351** keys (an existing key was rewritten, not added).

**The guard, and why a source scan.** `subtitleHarvestNyaaRoute.test.ts` reads
`MediaDetailPanel.tsx`, finds which `{tab === '…'}` block encloses `media.subtitles.nyaa.open`,
resolves that tab's own English label, and asserts the offer contains it, contains no other
tab's label, and states the precondition. The guarded tab is a JSX condition and the label goes
through `t()` at render, so there is no runtime value to assert on.

**Mutation control: the original sentence put back → 3 of 4 red, each for a different reason** —
`to contain 'Subtitles'`, `not to contain 'Episodes'`, `to match /librar/i`. The fourth test is
the parse-sanity guard and correctly stayed green; without it a regex that matched nothing would
make the other three vacuously pass. `en.ts` restored **byte-identical** (sha256 `270ddb87…`).

**Live**, through the running renderer's own module (`fetch('/src/shared/i18n/catalogs/en.ts')`,
so it is the app's graph and not the file re-read): `namesSubtitlesTab: true`,
`namesEpisodesTab: false`, `statesLibraryPrecondition: true`. `debug/nyaa-offer-live.cjs`.

**Still open, unchanged and now scoped:** the harvest panel has no nyaa *fetch* path. The design
is already derived — `nyaaSearch` takes title/season/episode and uses `mediaId` only to look
them up (`subtitleDiscovery.ts:769`), and `nyaaFetch` returns `{text, format, fileName}` with no
media item involved; only the *attach* step (`writeSubtitleFile` + `patchItems`, `:826`/`:848`)
needs one, and harvest mining wants the text, not a record. So a title-keyed list handler plus a
text-returning fetch handler closes it. That is cross-surface (contract, main, preload,
`window.d.ts`, panel, i18n ×4, tests) and is a turn of its own — do not half-land it.

## 2026-08-17 — P4's nyaa half is real: the offer now has a door behind it

Worker `primary`. Commits `91987dbb`, `b8b30f1b`, `9771641e`, `4d589e98`. This closes the item
the previous turn scoped and left open ("the harvest panel has no nyaa *fetch* path").

**The gap was structural, not missing wiring.** `subtitleDiscovery`'s nyaa pair refuses anything
`host.listItems()` does not hold, because its job ends in a `SubtitleRecord` attached to a file on
disk. A MAL title the user has not downloaded therefore had **no nyaa route at all** — the offer
sentence has been in front of users for as long as the panel has, and never had a destination.

**Three slices.**
1. `91987dbb` — `nyaaFetchAll`. `nyaaFetch` already downloads **every** subtitle file a release
   holds (`selectSubtitleFiles` does not filter when the token names no episode, and
   `qbitAwaitFiles` waits for all of them) and then returns after the **first** that reads. Correct
   for discovery, useless for a range. `nyaaFetch` is now the single-file view over it, so the
   discovery contract did not move. **25 tests** (was 21).
2. `b8b30f1b` — `subtitleHarvest:nyaaList` / `:nyaaFetch`, title-keyed, no media item. Searched
   with `episode: null` because a harvest asks for a range and the releases that serve a range
   carry it whole. Session catalogue is `subtitleNyaaSource`'s own, shared with discovery.
   **10 tests**; 38 green across both harvest suites.
3. `9771641e` — the panel. Two clicks, never one: listing must not be able to start a transfer.
   The range check **refuses rather than filters** — a release whose episodes miss the range names
   what it holds and studies nothing. **5 renderer tests** + the route test rewritten (4).

**Mutation controls, each landing on exactly one test.** `break` after the first push → "returns
every episode in the pack". `episode: null` → `1` → "searches the whole title". Deleting the
unlisted-id guard → "refuses an id it never listed". `if (!inRange.length)` → `if (false)` →
"refuses a release whose episodes miss the range". All restored byte-identical (`-ceq` by sha256).

**Gate status unchanged.** This is P4 infrastructure, not a new gate pass: nothing here has been
run against the live index. **Gate 31 remains open** and its two blockers are still the measured
ones from 2026-08-16 — 1 Route A candidate in 99 titles and it is bitmap-only, 0 of 6 Route B
batches carry sidecars. What is new is that a *harvest* can now reach nyaa at all, which is a
third route those surveys never covered. **The next slice is to run it live**: `listNyaaHarvest`
on a title Jimaku misses, then `fetchNyaaHarvest` on a real candidate, reporting cue counts.

**Traps.** (1) `window.d.ts` declares `subtitleHarvestList/Fetch` **twice** (overload copies at
HEAD:918 and HEAD:1681) and the file has **mixed line endings** — a single-line anchor names two
places, and a multi-line anchor joined with the file's "dominant" EOL matches zero. See
`debug/stage-harvest-nyaa.cjs`. (2) A test asserting `` `ipcMain.handle('${channel}'` `` registers
*itself* as the handler in `tools/architecture-audit.cjs` and turns dead-ipc 0 → 1; assemble the
string from parts. (3) Russian plurals need `one/few/many/other`, not three.

## 2026-08-17 — P4: Jimaku's silence was being reported as its answer

Worker `primary`. Commits `49ca928c`, `10f216a8`. Not a new gate pass — this is P4 gate 16's
honesty property failing in the field, found while surveying the harvest→nyaa route the previous
turn built. **Both defects sent users to a torrent index for subtitles Jimaku already had.**

**Defect 1 — a rate limit read as an empty catalogue (`49ca928c`).** `requestJson`
(`subtitleProviderClients.ts:102` at HEAD) collapsed a 429, a 5xx, a timeout and a genuine `[]`
into one `null`, and `listSubtitleHarvest` turned that into the sentence *"Jimaku has no Japanese
subtitles filed for this title"* plus the nyaa offer. **Live control, the decisive one:** 8 titles
that reported 0 files back-to-back returned **125 / 57 / 168 / 36 / 95 / 48 / 60 / 47 files** when
the identical requests were spaced 6 s apart — 636 files that "did not exist". Now on
`requestJsonReply`, which keeps the status; `JimakuMatch` carries `down`/`downStatus` for **both**
requests. The file listing is the worse half: there the panel has a matched entry name vouching
for the emptiness. **Live after:** of 23 titles, 9 empty → **9 of 9** carry `jimakuDown` and
*"Jimaku did not answer (HTTP 429)…"*, and the **14** that answered carry `jimakuDown: false`
with no message. So the cause is measured, not inferred: **429**.

**Defect 2 — the fuzzy chooser guessed a different show (`10f216a8`).** `chooseJimakuEntry` ended
in `best ?? entries[0]`. Query `Shinreigari` (Ghost Hound) scored every entry NO_MATCH and fell
through to *Mahou Shoujo Madoka☆Magica: Hajimari no Monogatari*, listing **33 files** — mined into
the deck stamped with the requested title. And because `files.length` was non-zero, `nyaa: null`:
the wrong show also **suppressed** the right route. Now refuses and names the closest entry
(usually the same show under another romanisation). **Live after:** Shinreigari 33 → **0**,
`matchedBy: null`, `jimakuDown: false`, nyaa **offered**. Control same run: Dororo still **101**,
`rejectedEntry: null`, nyaa not offered.

**`b8b30f1b` did not contain what this plan says it does.** It committed `preload.ts` and
`window.d.ts` **only** — `src/main/subtitleHarvest.ts`'s nyaa handlers and its 10-test file were
never committed, so HEAD shipped a *Search Nyaa* button invoking `subtitleHarvest:nyaaList` with
**no handler registered**. Landed in `49ca928c`. The 2026-08-17 entry above overstates that slice.

**Mutation controls, each on its own suite.** `reply.value === null` → `false`: invisible to
`subtitleHarvestNyaa.test.ts` (19/19 green — the client is mocked there), **3 failures** in the
new `jimakuOutage.test.ts`, which drives the real client over a stubbed `electron.net`. That gap
is why the file exists. `match.down` → `false`: 1 failure. `return best` → `best ?? entries[0]`:
**3 failures**. All restored byte-identical (`sha256sum -c`).

**Gate 31 stays open**, unchanged. **New number for it:** Jimaku's coverage of this library is far
better than the fast scan suggested — 14 of 23 sampled titles are covered, and the 9 "misses" were
all 429s. Do **not** reuse the "26 of 40 have no Jimaku entry" figure from the first sweep; it was
the rate limit, and the spaced re-run refuted it.

**Traps.** (1) A back-to-back sweep over Jimaku 429s within ~10 requests — space probes ≥6 s or
every number is about the limiter. (2) `debug/g31c-harvest.cjs` (`config|jscan|jslow|scan|list|
fetch`) needs `import('/src/…?probe=' + Date.now())` for any module you just edited; the plain
specifier resolves to the renderer graph's pre-edit copy and reads as "not a function".
(3) `subtitleHarvestNyaa.test.ts` mocks `jimakuSearchDetailed`, so nothing in it can ever catch a
defect inside the Jimaku client.

## 2026-08-17 — P4: one title string was the wrong question, and the library only had one

Worker `primary`. Commits `58e348a5`, `462e1c37`. Not a new gate pass — a false negative in
the route P4 gate 16 offers, plus the data half that makes the fix reach real titles.

**The defect, measured live through the app's own handler, same index, same minute.** MAL 2596
is filed `Shinreigari`; nyaa carries the show only as `Ghost Hound`.
`subtitleHarvestNyaaList({title: 'Shinreigari'})` → **0 candidates** and *"No release on the
index looks like it carries subtitles for this title"*. Under `Ghost Hound` → **1 release,
4 seeders**, `[DeadFish] Ghost Hound - Batch`. The refusal read exactly like a true one.

**`58e348a5` — `listNyaaHarvest` walks aliases**, primary first, stopping at the first that
finds anything (not a union: `nyaaSearch` filters each result against the name it was asked
about, so a union ranks releases scored under different titles against each other). Live after:
n **0 → 1**, `searchedAs: "Ghost Hound"`, 2,775 ms. Negative control: alias
`Zzqq Nonexistent Show 91827` → n **0**, `searchedAs` null, the index's own empty sentence.
**The trust boundary, measured rather than assumed:** `Shinreigari` + alias `Dororo` returns
**4 Dororo releases**. That is why `searchedAs` is a result field and is rendered — a wrong
alias is visible, not silent.

**`462e1c37` — the library only ever held one name.** `fetchAnimeList` asked for
`list_status,num_episodes`. Now `+alternative_titles`, which rides the pages already walked.
Live, read-only on the user's account: **1,426** completed in 9,028 ms, `truncated:false` (P2/P3's
number, so nothing else moved), **1,373 of 1,426 carry aliases, 53 do not**. MAL 2596 →
`["Ghost Hound", "神霊狩／GHOST HOUND", "Shinreigari: Ghost Hound"]`.

**Two traps, one of which only the live run could see.**
1. `sanitizeListEntries` (`main/malLibrary.ts`) re-validates IPC rows **by copying field by
   name**, so a new field is dropped in silence. First live sync: 1,373 in, **`storedWithAltTitles:
   0`** out, with every unit test green — they call `mergeMalListEntries` directly and never cross
   that seam. After the fix: **1,373** stored. If you add a field to `MalListEntry`, add it there.
2. `MERGEABLE_FIELDS` is compared with `===`. Equal arrays are different objects, so an identity
   check reports all 1,426 rows as *updated* every re-sync — the exact count **gate 11** reads.
   `sameFieldValue` compares element-wise. Live both ways: first sync `{added 0, updated 1376,
   unchanged 50}`, second `{added 0, updated 0, unchanged 1426}`. MAL 2596 kept
   `episodesWatched 22, score 5, origin list`; total stayed **1,429**.

**Gate 31 stays open**, unchanged. Its blockers are still 2026-08-16's: 1 Route A candidate in 99
titles and it is bitmap-only, 0 of 6 Route B batches carry sidecars. New this turn: the harvest
route's first real acquisition attempt ran — `[DeadFish] Ghost Hound - Batch`, **15,261 ms**,
refused as *"This release contains no subtitle files."* That is the honest branch, not the old
1-second false negative: `no-subtitles` comes from `SELECTION_MESSAGES`, reachable only after
`qbitAwaitMetadata` returns a file list. **Next: re-run the 99-title Route A/B survey with
aliases** — it could not see alias-only titles, and 1,373 rows now carry them.

**Traps.** (1) `window.api` is undefined if the window loads before Vite finishes building
`preload.ts` — a probe then fails as "Cannot read properties of undefined"; check
`typeof window.api` before believing a probe result, and restart. (2) Jikan returned **504**
("Jikan failed to connect to MyAnimeList") all turn while MAL's own API was up (403 to an
unauthenticated read) — so `scraperMalUnits` could not be checked and the *dialog*-level
end-to-end for this title is unverified; the handler-level one is not.

## 2026-08-17 — boss-audit cleanup: the ledger entry `449a49d5` never got, and findings 5 + 6

Worker `backup`. Commits `449a49d5` (by `primary`, undocumented — it hit a usage limit four
minutes after committing), `c4fc0d23`, and this one. Not a gate pass; audit debt.

**`449a49d5`, recorded here because its author could not.** Boss audit 2026-08-17 03:28
findings 1 and 3, one edit at one seam. `altTitles` was written by the whole MAL pipeline and
read by nothing: **1,373 of 1,429** library rows carry aliases and **328,747 of 806,606 bytes
(41 %)** of `mal-library.json` was a field with no reader, while the motivating case still
failed from the UI because MAL 2596's `Ghost Hound` lives only in the library and the panel
cannot see disk. Wired in **main**, not the renderer: `HarvestNyaaListInput` gains `malId` and
`listNyaaHarvest` reads the row on the side that already holds the file — the renderer's only
path to the library is `mal:libraryList`, which returns all 806 KB to read one row. Finding 3
rides along at the same seam: `harvestSearchAliases` caps at `HARVEST_ALIAS_LIMIT = 4`, caller
order first, because the walk is sequential at 400 ms pacing and breaks only on a hit — the
**miss** is the expensive case, 374 rows exceed the cap, and one carries ten synonyms that are
the titles of ten different works. Suite 19 → 24 tests.

**Finding 5 SETTLED — `462e1c37`'s `{added 0, updated 638, unchanged 788}` is not the run it
claims to be; `4a221dbf`'s `{added 0, updated 1376, unchanged 50}` is.** Re-derived from the
user's own file rather than from either message: **1,429 rows, 1,373 carry aliases, 56 do not.**
A first sync that adds `alternative_titles` under the fixed element-wise `sameFieldValue` marks
exactly the rows whose fields changed, so 1,373 + 3 = **1,376 updated** and 1,426 − 1,376 = **50
unchanged** falls straight out of the data. `638/788` corresponds to nothing in it. Treat
`462e1c37`'s figure as superseded.

**Finding 6 fixed.** `462e1c37` inserted `parseAlternativeTitles` between
`parseMalAnimeListPage` and its JSDoc, so the block ending "*one malformed entry in a 400-title
list should cost the user that row, not the sync*" documented the alias parser. Moved back.

**Finding 4 is BLOCKED, not skipped.** `.claude/skills/jp-dispatch/SKILL.md:97` still claims
"Known-failing suites — THERE ARE NONE"; that is false against committed HEAD and the same file
tells workers to trust any red suite. Two write attempts were refused by the permission
classifier. Text is drafted in this turn's handoff; a worker with write access to `.claude/`
should land it.

**Trap for the next worker, and it is the audit's finding 2.** A full-suite number is meaningless
without its tree. At `c4fc0d23`: **HEAD = 685 files / 2 failed** (both `i18n.test.ts` catalog
hygiene, a ratchet whose baseline outran ~34 files of uncommitted foreign i18n conversion);
**shared tree = 710 files / 0 failed**. And a worktree with a junctioned `node_modules` fails
`novelReaderProgressGuard.test.ts` on `Denied ID …/pdf.worker.min.mjs?url` — an artifact, not a
defect; that is why the audit counted 9 failures where there are 8.

## 2026-08-17 — the stored-alias seam proven live, and the husk that answered `/health` for an hour

Worker `backup`. No product change — `449a49d5` was committed on unit tests plus a shared-tree
read, and its load-bearing claim (main reads the library off disk) had never been exercised by the
running app. Instrument: `debug/g31g-malid.cjs`, which passes **`malId` and no `titles` at all**,
so a hit cannot come from the caller.

**The seam is real.** `subtitleHarvestNyaaList({title:'Shinreigari', malId:2596})`, minSeeders 1 →
`ok true`, **n 1**, `searchedAs "Ghost Hound"`, **1,300 ms**, `[DeadFish] Ghost Hound - Batch
[BD][1080p][MP4][AAC]`, 7,782 MB, **4 seeders**, route `batch-sidecar`.
**Negative control, same title, same index, same minute:** `malId 99999999` (no library row) →
**n 0**, `searchedAs null`, **459 ms**, *"No release on the index looks like it carries subtitles
for this title."* Same primary title both ways, so the single candidate above came from the
library read and from nothing else. This is what `449a49d5` claimed and could not show.

**Gate 31 is unchanged and is not being called a pass.** The alias re-survey it is waiting on
(`debug/g31h-alias-routes.cjs`, every name rather than first-hit, capped at `HARVEST_ALIAS_LIMIT`
= 4, `via` recorded per hit so a wrong alias is visible) is in flight; first 10 titles: **A 0,
B 2**. See the next entry for its total.

**The trap, and it cost this turn 20 minutes — read this before you believe any live number.**
The app that was running (main pid 50272) was a **husk of the second shape**: `/health` answered
`ok:true` with `visible:true`, `/logs` answered `total 0`, and Vite was **up and serving 200 on
5173** — every check the skill tells you to run passed. The tells were `url: ""` on the window and
`/logs` holding **exactly one** entry (`debug bridge up`); every `/eval`, down to `1+1`, timed out
at the client. A husk does not fail a probe, it *hangs* one, so it reads as a slow query rather
than a dead renderer. Fix was `Stop-Process` on the electron main **and** the three forge/npm
wrappers, then `npm start`; the replacement (pid 48256) came up with `url:
"http://localhost:5173/"`, `title: "日本語 Study"`, `typeof window.api === 'object'`.
**Before trusting a live number here, eval `1+1` and read `url` — not `/health`'s `ok`.**

**Gate count, re-derived from this plan's own gate tables rather than a keyword sweep: 32 of 34
closed.** 1–3 (P0), 4–5 (P1), 6–9 (P2), 10–13 (P3), 14–17 (P4), 18–21 (P5), 22–30 (P6, table at
this file's P6 section plus gate 29's own later closing entry), 32–33 (P7). **Open: 31** (the two
route blockers) and **34** (the end-of-plan full gates).

## 2026-08-17 — gate 31: the alias re-survey is DONE and does not unblock it, and the pool was the 99 smallest titles

Worker `backup`. The action 2026-08-17's entry named as next ("re-run the 99-title Route A/B
survey with aliases") has run. `debug/g31h-alias-routes.cjs`: **99 titles, 320 searches, 0
errors**, 96 of 99 searched more than one name, every name rather than first-hit because the
question is what *exists*. Gate 31 stays **OPEN** and is not being called a pass.

**Route A: still one real candidate, and aliases did not find it.** Two nominal hits.
(1) index 32 `Cyber City Oedo 808`, 34.50 MB, 1 seeder — the same `[GB] … SUBS ONLY` release from
2026-08-16, already measured as **9 files, all `.sup`, all `[eng]`** and correctly refused as
bitmap-only. It was returned by the primary title *and* by the alias `Cyber City`, so the alias
added nothing. (2) index 97 `Black★Rock Shooter (TV)` is a **false positive and worth the space**:
`[IsThisYuri] Black Rock Shooter - Dawn Fall 08 subtitles (DROPPED: This is yuri!)`, **26,726 B,
1 seeder**, found only via alias `Black Rock Shooter` (75 rows, against the primary's 3). *Dawn
Fall* is the 2022 series, not the 2012 one, and it is **one episode**. Every Route A heuristic
passes it — under the 50 MB ceiling, no video container, a `subtitles` signal — so the alias walk
widened the net onto the wrong work exactly as `HARVEST_ALIAS_LIMIT`'s comment predicts. The size
floor that would catch a 26 KB "batch" does not exist.

**Route B: materially wider, and still empty.** Titles with ≥1 batch candidate **57 → 73 of 99**,
**16 gained by aliases alone** — `Fafner The Beyond` (+4), `Night World` (+4), `Bari Bari
Densetsu` (+5), `ROD OVA`, `機動戦士ガンダム サンダーボルト`, `Golden Courtyard: New Year Wishes in
Winter`, `Saint☆Onii-san`, `Alien Nine`, `xxxHOLiC OVA`. Baseline zero-row titles **9 → 6**.
Then the only question that matters, through `debug/g31b.cjs` on the daemon: 11 of the newly
visible batches added with `stopCondition=MetadataReceived`, file list read, all deleted,
**`downloaded: 0` on every one**. **0 of 11 carry a sidecar.** Read it honestly — **7 returned a
file list** (12/12/12/12/50/4/2 files, zero subs) and **4 returned none within 60 s** at low seed
counts, which is inconclusive rather than negative. With 2026-08-16's 0 of 6 (2 of which also
never sent metadata), the cumulative conclusive figure is **0 of 11 batches, 17 attempted**.
Client left as found: `debug/g31i-clientcheck.cjs` → **0** torrents in `jp-study-probe`, the
user's own 7 untouched.

**The finding that should change what the next turn does, and it corrects this plan.** Both
surveys — 2026-08-16's and this one — drew from `pool.sort((a, b) => a.totalEpisodes -
b.totalEpisodes).slice(0, 99)`. That is the **99 SMALLEST** multi-episode titles: **episode range
2–8**, out of a ≥2-episode pool of **1,105**. So "1 Route A hit in 99 titles, rare means 1 %" was
measured on **9 %** of the library, deliberately sorted to OVAs, specials and shorts — the
category least likely to have a fansub pack. **1,006 titles were never searched, 920 of them ≥12
episodes**, and long-running shows are where sub-packs actually live. Do not conclude Route A is
unavailable in this library; conclude it is unmeasured above 8 episodes.
**Next: run `node debug/g31h-alias-routes.cjs 99 100 2 1` and upward**, or sort the pool
descending, before treating gate 31's Route A as data-blocked.

## 2026-08-17 — gate 31 Route A produces its first usable candidate, live, and the floor that was missing

Worker `primary`. The previous entry's correction was right and it changes the gate. Both earlier
surveys drew the **99 smallest** multi-episode titles (2–8 eps, 9 % of a 1,105 pool, sorted to OVAs
and shorts). `debug/g31h-alias-routes.cjs` gained an `[asc|desc]` 6th arg — default `asc`, so every
earlier invocation still means what it meant — and the **descending** run of the 60 longest
(`0 60 2 1 desc`, ep range **500–28**) reports **60 titles, 207 searches, 0 errors**:

**Route A: 8 titles of 60, against 1 of 99 ascending.** 4 of the 8 are reachable **only** by a MAL
alias. Sizes/seeders: Gundam X 20.10 MB/7s, Eureka Seven 39.20 MB/1s, Les Misérables 18.10 MB/4s,
Romeo no Aoi Sora 16.60 MB/2s, Ashita no Joe 1.40 MB/3s, Utena 1.40 MB/1s, Dragon Ball Z + Dragon
Ball 0.51 MB/2s. **Route A is not rare in this library — it was measured on the wrong end of the
pool.** Route B: 53 of 60 carry ≥1 batch; 0 zero-row titles.

**GATE 31 ROUTE A HAS A LIVE, USABLE CANDIDATE — the first ever in this library.** Through the real
app, not the survey port: `subtitleHarvestNyaaList({title:'Kidou Shinseiki Gundam X', malId:92})` →
`ok true`, **n 1**, `searchedAs "After War Gundam X"`, route **`sub-pack`**, **20.10 MB, 7 seeders**,
`After War Gundam X / Kidou Shin Seiki Gundam X Official Subtitles`, **2,306 ms**. Text subs, above
the profile's `minSeeders`, and the primary title returns **0 rows** — so the alias did the work.
**Negative control, same title/index/minute:** `malId 99999999` (no library row) → **n 0**,
`searchedAs null`, *"No release on the index looks like it carries subtitles for this title."*
Instrument `debug/g31k-floor.cjs`. Gate 31 is still **OPEN** — nothing has been *acquired* yet —
but its Route A blocker is data, not absence.

**The floor that did not exist, now `8cfff0d8`.** `looksLikeSubtitleOnly` had a 50 MB ceiling and no
floor, so a one-episode cue file answered a whole-series request — the survey nominated
`[IsThisYuri] Black Rock Shooter - Dawn Fall 08 subtitles`, **26,726 B**, for an 8-episode show, and
a different work at that. `packCoversEpisodeCount` is **per episode asked for** (6 KB), never
absolute: a small file *is* one episode's subtitles, and count 0/1/unknown imposes nothing — MAL
writes 0 for "still airing", which is unknown, not none. `episodeCount` rides in on the library row
the alias read already opens, so a listing still parses the 806 KB file once. Scored on the survey's
own 9 nominations: **2 refused, 7 kept**; both refusals are the same wrong release (`Dragon Ball Z
Movies 01-13 French subtitles`, 0.51 MB, offered for a 291- and a 153-episode series).

**TRAP — the survey port is WIDER than the product; do not read a survey hit as a listing.**
`debug/g31h-*.cjs` searches at `minSeeders 0` with no title filter; the app applies
`looksLikeSameTitle` **and** the profile's `minSeeders`, which is **3** on this machine. Of the 8
Route A titles, **only 3 survive that** (Gundam X 7s, Les Misérables 4s, Ashita no Joe 3s). Both
26 KB/0.51 MB false positives were already invisible live — probed at HEAD, Black★Rock Shooter and
Dragon Ball Z each returned **only** `batch-sidecar` rows. The floor is defence in depth, not a
repair of an observed listing.

**SECOND DEFECT, measured and NOT fixed — the alias walk breaks on the first name that finds
*anything*, not the first that finds a *pack*.** `src/main/subtitleHarvest.ts` ("First alias that
finds anything wins"). Eureka Seven: primary returns **21 rows** — two *Hi-Evolution movie* batches,
21 GB and 43 GB, not even the TV series — so the walk stops and never reaches `Psalms of Planets
Eureka Seven`, the only name carrying the **39.20 MB 50-episode subs-only pack**. Same shape on
Utena (primary 49 rows; `Revolutionary Girl Utena` holds the pack). A Route A pack is categorically
better than a Route B multi-GB batch, so "any candidate" is the wrong break condition. Both lost
packs sit at 1 seeder here, so no *usable* pack is lost in this 60-title sample — which is why it is
recorded rather than rushed. **Next slice: continue the walk while only `batch-sidecar` has been
seen, and prefer a later alias's `sub-pack`.**

**Still unsurveyed: 946 titles** (1,105 pool − 99 asc − 60 desc). Continue with
`node debug/g31h-alias-routes.cjs 60 60 2 1 desc`.

## 2026-08-17 — the first Route A transfer is spent, and the 404 that would not say where

Worker `primary`. Two commits. The previous entry's named next slice, then the defect that slice
made reachable.

**`0b79c87c` — the alias walk no longer stops at a 43 GB batch.** It broke on the first alias that
found *anything*; a `sub-pack` and a `batch-sidecar` are not interchangeable answers to a harvest.
`Eureka Seven`'s primary name returns 21 rows, two of them *Hi-Evolution movie* batches at 21 GB and
43 GB — not even the TV series — so the walk stopped there and never asked `Psalms of Planets Eureka
Seven`, the only name carrying the 39.20 MB 50-episode pack. Now: continue while only sidecars have
been seen, break on the first pack, earliest name wins among equals so the Route B fallback is
byte-for-byte what the old condition returned. **Tradeoff, stated:** a sidecar-only hit now walks to
the cap (4) instead of stopping at 1, so a Route B title — the common case, 53 of 60 surveyed —
spends up to 3 more paced requests, ~6 s. A pack hit still costs one request. Trading 6 s for the
difference between a 39 MB and a 43 GB download is what this feature is.
Gate: 28/28 (24 before). **Negative control in a throwaway worktree at HEAD, not the shared tree:**
the new file against the old implementation fails 3 of 4 for the intended reasons. The 4th passes
both ways *by design* — it is the control proving the break is the route and not exhaustion.

**GATE 31: THE FIRST TRANSFER WAS ACTUALLY SPENT, AND IT FAILED. Gate 31 stays OPEN.**
Instrument `debug/g31m-acquire.cjs`, the first g31 probe that goes past the listing. Live, through
the running app, on the user's authorised smallest-healthy title — named before starting, as
required: **MAL 92 `Kidou Shinseiki Gundam X`**, release `After War Gundam X / Kidou Shin Seiki
Gundam X Official Subtitles`, **20.10 MB, 7 seeders**, route `sub-pack`.
- LIST: `ok true`, **n 1**, `searchedAs "After War Gundam X"`, **38,716 ms**, at the profile's own
  `minSeeders` (3) with **nothing relaxed** — the survey port's `minSeeders 0` was not used.
- FETCH: `ok false`, **0 files, 0 bytes, 21,702 ms**, message **`qBittorrent answered 404.`**

**`ac649de8` — that message is the real defect, and it is the one this plan forbids.** The client
speaks eight WebUI endpoints and the string names none, so the failure cannot be acted on. P6's
constraint is a distinct honest state, never a generic failure — this was the generic failure,
shipped. `failureReason` now takes the endpoint; all 8 sites pass theirs; `qbitStop`/`qbitStart`
track it **across their 5.x fallback**, so a refusal names the endpoint that actually answered.
Not hypothetical: 5.x renamed `pause`/`resume` to `stop`/`start`, so a 404 there means "your build
dropped the alias" while a 404 from `files` means "the torrent is gone" — opposite problems, one
string. Gates: `subtitleNyaaFetch` 27/27 (+2, driving the real stand-in server, one asserting the
*fallback* name), `scraperQbittorrent` + `subtitleHarvestNyaa` 86/86.

**TRAP — the endpoint is still unknown, and only a restart will say.** Main does not hot-reload and
the running app (pid 47592, started 05:27) predates both commits, so re-running the probe against it
reproduces the old message. **Next slice: restart the app, then
`node debug/g31m-acquire.cjs "Kidou Shinseiki Gundam X" 92`.** The 21.7 s before the 404 says the add
and the metadata wait likely succeeded and it failed later — `files`, `filePrio` or `start` — but
that is an inference from a duration, not a measurement, and must not be recorded as one.

## 2026-08-17 — ROUTE A ACQUIRES, for the first time: 47 files, 21,079,165 chars, and 39 episodes

Worker `backup`. Two commits. The previous entry's named next slice ran, and the 404 it was chasing
turned out to be gone — but a worse defect was standing behind it.

**The 404 is closed and was never re-observed.** Restarted the app onto `ac649de8` (main does not
hot-reload; the previous run's app predated it) and re-ran `debug/g31m-acquire.cjs`. The endpoint-
naming commit did its job: no 404 appeared at any of the eight endpoints. The inference the last
entry refused to record — "`files`, `filePrio` or `start`" — is left unrecorded, because the run
that would have named it never failed again. Do not chase it.

**`60ab76d3` — a fetch that failed once could never be retried, and the torrent it left was its own.**
What the retry actually met: `ok false`, **0 files, 1,160 ms**, "This torrent is already in
qBittorrent; its file priorities were left alone." Permanent, not transient. The hands-off rule was
protecting the wrong torrent: the previous run *added* this one, failed late, and left it behind —
and `qbitReapSubtitleOrphans` deliberately holds out the hash the current acquisition is using, so
the one leftover it can never sweep is exactly the one blocking the retry. Every retry of any
candidate that ever failed after its add was a dead end. `qbitAddStopped` now answers **three**
states: `adopted` when the existing transfer carries `jp-study-subtitles` — a category only that
function ever writes, so no user priorities exist to clobber — and `already-present`, unchanged, for
anything else. Adopted is driven like a fresh add. Gate: `subtitleNyaaFetch` **29/29** (27 before).
**Negative control** with the adopt branch disabled: the adoption test fails, the refusal control
still passes, so the test measures the category and not the state around it.

**GATE 31, ROUTE A LEG: ACQUIRED. LIVE.** MAL 92 `Kidou Shinseiki Gundam X`, release *After War
Gundam X / Kidou Shin Seiki Gundam X Official Subtitles*, **20.10 MB, 6 seeders**, route `sub-pack`,
searched as `After War Gundam X`. LIST `ok true`, n **1**, **2,059 ms**. FETCH `ok true`, **47 files,
21,079,165 chars, 78,775 ms** at the profile's own `minSeeders` with nothing relaxed. This pipeline
had listed candidates for three days and never once acquired one; it has now.
**Gate 31 is NOT closed** — as written it wants Route B as well, and cues rendering in the player.
Only the Route A acquisition leg passes.

**`dda019f4` — and every one of those 47 files came back `episode: null`.** The names are
`[Kidou Shin Seiki Gundam X][21][BDRIP][1440x1080][H264_FLAC].ass`; all four existing patterns want a
separator or the end of the string, and this convention gives the number a bracket of its own. An
episode **range** is the thing the user asked this pipeline for, so 20 MB of subtitles arrived
unusable. One pattern added, for a bracket that is nothing but 1–3 digits. On the 47 real names:
**OLD 0 parsed / 47 null → NEW 39 parsed, 8 null, 39 distinct, 1..39, 0 duplicates.** Re-measured
**live through the IPC path after a restart**: `files 47, parsed 39, nulls 8, distinct 39, min 1,
max 39, missing []`. The 8 nulls are exactly the pack's creditless specials (`[Vol.07][SP02][NCOP2]`)
— `Vol.07`/`SP02`/`NCOP2` are not pure-digit brackets, so they cannot collide with episodes 1–8.
Cross-check independent of the parser: each file's own header reads `Title: Gundam X Episode 21`.
Controls assert what must NOT parse — the specials, `[1440x1080]`, a `[2011]` year, an 8-digit CRC.

**Next slice: P5 on this real pack.** 39 episodes of real `.ass` cues are now on disk and parsed;
gate 19 (a word the user already knows must NOT appear in the mined output) finally has real input.

## 2026-08-17 — recovery: the two digit-title guards `backup` landed and could not record

Worker `primary`, recording commits it did not author. `backup` committed `a5f47f9c` (10:19:21) and
`b14ccb3b` (10:23:48) and hit its usage limit **five seconds** after the second, so neither reached
this plan. Both re-derived here from their diffs and re-run, not trusted from their messages:
`subtitleNyaa` + `subtitleNyaaFetch` + `subtitleHarvestNyaa` = **107/107 green** at this HEAD, and
the running app (pid 34264, started 10:22:53) postdates the source edit at 10:21:56, so the live
numbers below were measured on this code and not on a predecessor.

**`a5f47f9c` — a title made only of digits matched every batch that numbers an episode.** The user's
completed list carries a one-episode title literally named **`001`**; through the product's own call
it returned **23 releases** — Bleach 001-063, Fairy Tail 001-175, Naruto Shippuuden 001~079, a 59 GB
Saint Seiya batch — because `looksLikeSameTitle` wants half the title's tokens and the only token was
a number every batch prints. Two narrowing rules in `shared/subtitleNyaa.ts`: `titleTokens` drops
digit-only tokens **while any word remains** (so `Gundam 00` can no longer be satisfied by a
`Naruto 00 - 12` batch on the digits alone), and an all-digit title refuses any release naming
another work outside its brackets (`untaggedPart`). Mutation control: guard removed → the 2 new
cases fail, the other 48 pass both ways.

**`b14ccb3b` — its own follow-up, because a release name can be nothing *but* tags.** 23 → 1 live,
and the survivor was `[GM-Team][国漫][神印王座][Throne of Seal][2022][001-208 Fin][AVC][GB][1080P]`:
every word inside a bracket, so `untaggedPart` saw no letters and the row passed. `onlyInEpisodeRange`
answers from the number's shape instead — for an all-digit title, a token appearing only as a range
endpoint is not evidence. **Live, at the profile's own `minSeeders`: 23 → 1 → 0.** Inverse control in
the same session: Alice to Therese still lists its 1 batch-sidecar row and Gundam X still lists its
20.10 MB / 6-seeder Route A pack, so the guard narrowed the match rather than breaking the listing.

**Gate status is unchanged by these two — they are a P4 listing-precision fix, not a gate.** 32 of 34
closed; open are **31** (Route A's acquisition leg passed 2026-08-17; Route B and cues-in-the-player
remain) and **34**.
