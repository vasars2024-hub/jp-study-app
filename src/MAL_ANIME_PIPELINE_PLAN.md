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

## 2026-08-17 — the pack Route A acquired was ENGLISH, and every gate above called it a success

Worker `primary`. Commit `2627e201`, instrument `debug/g19n-nyaa-mine.cjs`. The previous entry's
named next slice — "P5 on this real pack" — ran, and the pack did not survive it.

**THE FINDING. 11,136 cues in, 0 words out.** The nyaa arm through its own modules, live: LIST
`ok`, searched as `After War Gundam X`, the same 20.10 MB / 6-seeder `sub-pack`; FETCH **47 files,
39 parsed, 8 nulls, episodes 1..39, 0 empty**; `combineSeasonCues` → **11,136 cues**; then
`analyzeMediaStudyCues` → **0 chars, 0 unique vocabulary, 0 occurrences, 0 mineable**. Measured on
the files on disk, independent of the app: **47 files, 11,285 dialogue lines, 0 kana, 292,568 Latin
letters.** `After War Gundam X … Official Subtitles` is the official **English** subtitles. The
entry above recorded "47 files, 21,079,165 chars, 39 episodes" and was true in every number it
reported — none of them was the language.

**CONTROL, because 0 words is either the miner or the data.** Same session, same
`combineSeasonCues` → `analyzeMediaStudyCues`, Japanese input from the jimaku arm: One Piece
100–101, **740 cues → 11,849 chars, 650 unique vocabulary over 1,528 occurrences, 7,330 kana**.
Fifteen times fewer cues, 650 words. The pipeline is sound; the pack was English.

**`2627e201` — the fix, at the only place that can answer.** `selectSubtitleFiles` filters on the
file *name*, and its documented policy is that a name stating nothing is kept. All 47 names state
only an episode number, so the hole was the entire release. `looksJapaneseSubtitle` reads the text
in `acquireAll`'s read loop. **Kana, not kanji** — kanji is the script Japanese and Chinese releases
share and nyaa is full of the latter, so counting it would accept `[GM-Team][国漫]` packs. **Dialogue
lines only, override blocks stripped** — a real file here is 501,684 bytes with 262 dialogue lines,
the rest styles and embedded fonts, and the style block is exactly where an English release
legitimately carries a Japanese *font name*. Floor 20 kana; the tests pin that a single 18-kana cue
does not clear it. Refusal is its own state: *"This release's subtitles are not Japanese — 47
file(s) downloaded and none carry Japanese text."*
**Scoped deliberately:** only unlabelled names are read, because `selectSubtitleFiles` already
trusts a stated label to *exclude* and two functions disagreeing about a name is worse than the
hole. Discovery is untouched — it downloads whatever `autoDownloadLanguages` says.

**Gates.** Three nyaa suites **121/121** (107 before). **Mutation control:** guard disabled → 2
failures, the intended ones (`expected true to be false` on the English pack; `[1,2]` vs `[1]` on
the mixed pack). Two of the four new tests pass both ways **by design** and are said so here: the
`languages: ['en']` inverse control and the stated-label case exist to prove the guard is *scoped*.
**LIVE after a restart** (main does not hot-reload; the app that measured the finding predated the
commit): the identical call now returns the refusal above instead of 47 English files.
**Gate 19 re-run on the control's real data:** 海賊 (28 occurrences) → level 2, mineable **650 →
649**, present before, absent after; restored to 0. Deck untouched, **3,221 cards / 1,320,982 bytes
before and after**, `knownAtLeast2` 0 both times.

**Gate 31's Route A leg REOPENS. It acquired, and what it acquired was unusable.** The leg needs a
pack that is actually Japanese. Of the 3 Route A titles that survive the profile's `minSeeders` 3,
Gundam X is now known-English; **Les Misérables (4 seeders) and Ashita no Joe (3) are untested** and
are the next candidates.

**Observation, not a finding: jimaku's One Piece listing moved from 2,885 files to 1,802**, and
episode 101 came back 380 cues where P5 gate 18 recorded 337. Episode 100 is unchanged at 360. An
external catalogue changed; nothing here did. Do not read the 337/380 difference as a regression.

**Next slice:** run `debug/g19n-nyaa-mine.cjs` against Les Misérables, then Ashita no Joe, for a
Route A pack that survives the language guard.

## 2026-08-17 — the second Route A candidate declared `[Eng]` in all 47 names and was taken anyway

Worker `primary`. Commit `dacf22c1`. Found by pointing the previous entry's own next slice at the
next candidate, which is what that slice was for.

**Named before the transfer, as required, and the smaller of the two taken:** MAL 2402
`Ashita no Joe` → `Ashita no Joe 2 (Tomorrow's Joe 2) [CR] (Subtitles only)`, **1,468,006 B =
1.40 MB, 3 seeders**. The alternative was Les Misérables: Shoujo Cosette at **18.10 MB, 4 seeders**,
left untouched.

**THE DEFECT. 47 files, every name `[CR] Tomorrow's Joe 2 - E19 [Eng].ass`, every header
`Title: English (US)`, 0 kana — fetched whole for a `ja` harvest.** `selectSubtitleFiles` excluded
all 47 correctly, found the pool empty, and then restored **every one of them**, including the ones
it had just excluded: the fallback was written `pool = text`. It exists because single-language
packs routinely label nothing, which is most of nyaa — but as written it also undid a correct
exclusion, so the one kind of release that *answers* the language question was the one kind
guaranteed to be accepted.

Now the fallback restores only files that stated nothing, and an all-wrong-language release gets
its own reason, **`wrong-language`** → *"This release only has subtitles in another language."*
This is **upstream of `2627e201`** and catches exactly the case that one skips by design: Gundam X
stated nothing and needed its text read after downloading; this one stated `[Eng]` and never needed
downloading at all. Selection runs after metadata and **before** `qbitSetFilePriorities`/`qbitStart`,
so the refusal now costs metadata only, not the 1.40 MB.

**Gates.** Three nyaa suites **123/123** (121 before). **Mutation control:** fallback restored to
`pool = text` → 1 failure, `expected 'ok' to be 'wrong-language'`. **LIVE after a restart**, both
guards firing on their own case and neither on the other's: Ashita no Joe → *"only has subtitles in
another language"*; Gundam X, same session → *"not Japanese — 47 file(s) downloaded"*. That pair is
the inverse control — a single over-broad refusal would have produced one message for both.

**One existing test asserted the defect** and is replaced, not deleted: it fed an `eng` file to a
`ja` request and expected `ok`. Now the refusal, plus a control that a release labelling *both*
languages still yields the Japanese file.

**Recorded, not fixed — two separate things this run exposed.**
1. **A sequel matched its predecessor.** `looksLikeSameTitle` accepted *Ashita no Joe **2*** for a
   search for *Ashita no Joe* (MAL 2402, 79 eps; Joe 2 is 47 eps and a different work). Every token
   of the shorter title is in the longer one. Harmless here because the release was refused for
   language, but the next numbered sequel may not be.
2. **The 404 is intermittent, not gone.** The first Ashita no Joe attempt returned
   `qBittorrent answered 404 to torrents/files.`; an immediate retry with no change reached the
   files. Ordering was checked and is not the cause — `inFlight.add(hash)` precedes
   `qbitReapSubtitleOrphans`, so the sweep cannot take the torrent it is fetching.

**Gate 31 Route A: still open, and now 2 of the 3 seed-healthy candidates are eliminated on
language.** Remaining: **Les Misérables: Shoujo Cosette, 18.10 MB, 4 seeders** — the last one.
**Next slice:** `node debug/g19n-nyaa-mine.cjs run "Les Misérables: Shoujo Cosette" 1695`.

## 2026-08-17 — the pool was not exhausted: a 60 s cap was calling live swarms dead

Worker `primary`. Commits `815542f5`, `430c99b6`. The previous entry's named next slice ran —
`node debug/g19n-nyaa-mine.cjs run "Les Misérables: Shoujo Cosette" 1695` — and what it exposed was
upstream of the candidate it was pointed at.

**Les Misérables never reached vocabulary: 3 x 60 s, all `no peer sent its file list in time`,**
with the torrent left resident in the client for 12 minutes between attempts. Read as a dead swarm
it would have retired Route A's last seed-healthy candidate.

**The control killed that reading.** Re-fetched **Gundam X (MAL 92)**, the pack that delivered 47
files on 2026-08-17 — **it timed out too**. So the failures were not properties of those releases.
Also measured in the same session: `[DeadFish] Ghost Hound - Batch` (7,782.40 MB, 6 seeders, the
Route B leg's first-ever attempt) — timed out at 61,293 ms.

**`815542f5` — `connected` was answering a different question.** `scraperQbitTest` read
`connected, 1 ms, v5.2.3` throughout, because it proves the **WebUI** is reachable. `transfer/info`
carries qBittorrent's own `connection_status`; `qbitTest` now reports it as
`QbitStatusReport.connection`, and the metadata timeout consults it once on the way out and blames
the client rather than the release when it reads `disconnected`. Scoped with three tests:
`firewalled` is **not** an outage (this machine logs `no router found` and reaches swarms fine), a
build that 404s the route keeps the old wording, and a successful fetch never issues the request.
qbit suites **98/98** (91 before); mutation control, branch disabled → 1 failure, the intended one.
**LIVE after restart: `connection: "connected"`** — so it did not explain today. Said plainly.

**`430c99b6` — the actual defect, found by polling instead of inferring.** `debug/qbit-meta-window.cjs`
watched the transfer list: Ghost Hound sat at `size: 0` for **six consecutive 30 s samples**, then
**8,153,820,936 bytes at t+6.1 min**, then `paused` at `progress: 0`. The swarm was never silent.
`METADATA_TIMEOUT_MS` was **60 s** on the stated premise "a swarm silent for a minute has nothing to
send", generalised from one release that answered in 4 s. Now **480 s**. Waiting is free —
`stopCondition=MetadataReceived` stopped that 8.15 GB batch itself at zero progress — and the
existing `Math.min` means the suite's 5 s budgets are untouched (file still 25 s). The refusal now
names the minutes waited.

**Gate 31 Route A is NOT exhausted, and the previous entry's closing line is retracted.** Gundam X
and Ashita no Joe stay eliminated — those were **language**, measured on file text, and unaffected.
Les Misérables is **untested**, not dead: it was only ever refused by the 60 s cap. Gate count
unchanged at **32 of 34** (open: 31, 34), counted from this file's own gate tables.

**Trap: `require()` caches `debug/bridge.json`.** A poll loop that re-`require`s it to wait for a
restart reads the dead bridge forever. Use `JSON.parse(readFileSync(...))`.

**Next slice: re-run Les Misérables and Ghost Hound on the 8-minute wait** —
`node debug/g19n-nyaa-mine.cjs run "Les Misérables: Shoujo Cosette" 1695`, then
`node debug/g31b-routeb.cjs fetch "Shinreigari" 2596`. Both need a restart first (main does not
hot-reload) and both were refused only by the old cap.

## 2026-08-17 — addendum, same turn: Route B gets past metadata for the first time

Both re-runs on the 480 s wait, after a restart (main pid 29960). No product change; evidence only.

**Route A on Les Misérables did not run, and the reason is itself a finding: the candidate pool is
LIVE, not static.** The 18.10 MB / 4-seeder `sub-pack` this plan named — the one three fetches
chased this morning — is **no longer above the profile's `minSeeders` 3**. The title now lists
**2 candidates, both `batch-sidecar`**: `[F-R] Les Miserables Shoujo Cosette 01-52 BATCH (WEB 1080p)`
33,894.40 MB / 13 seeders, and `[Aoi-WSRN-Licca]…(Batch)_[HD]` 12,083.20 MB / 5 seeders. So a
survey's Route A hit expires; re-list before treating one as a candidate.

**ROUTE B REACHED SELECTION FOR THE FIRST TIME.** Named before the transfer and the smaller of the
two taken, per the standing condition: `[Aoi-WSRN-Licca]Les_Miserables_Shoujo_Cosette_(Batch)_[HD]`,
**12,083.20 MB, 5 seeders**. **Metadata in 11,542 ms** — on the same machine that timed out at 60 s
four times this morning, which is the swarm variance the 480 s wait exists for. Refusal:
**"This release contains no subtitle files."** Correct and honest — a muxed/hardsubbed batch has no
`.ass`/`.srt` sidecars — and it cost **zero content bytes**, because selection runs after metadata
and before `qbitSetFilePriorities`/`qbitStart`.

**That is the Route B survey method, now proven rather than assumed: a Route B miss is free.** A
batch is classified `batch-sidecar` from its NAME, and only metadata can say whether real sidecars
exist, so candidates can be walked at the cost of a metadata handshake each. Gate 31's Route B leg
is **not** passed — it needs a batch that actually carries sidecars.

**Next slice:** walk Route B candidates for sidecars with `debug/g31b-routeb.cjs fetch <title> <malId>`,
starting with `Shinreigari` 2596 (7,782.40 MB, 6 seeders, refused only by the old 60 s cap). Each
miss is free; the first hit is gate 31's Route B leg.

## 2026-08-17 — the 404 that retired candidates was never a verdict, and a sequel is a different work

Worker `primary`. Commits `6cdd874d`, `99c20548`. The previous entry's named next slice ran and
died on its first candidate; the cause was upstream of Route B entirely.

**`6cdd874d` — the intermittent 404, diagnosed and closed.** `walk "Shinreigari" 2596` refused in
**84 ms**: *"qBittorrent answered 404 to torrents/files."* The transfer list, read straight after
through `scraperQbitTransfers`, showed that exact release resident — `50b34db5`, category
`jp-study-subtitles`, **8,153,820,936 B** of metadata already learned. So `qbitAddStopped` had
found and adopted it and the very next `torrents/files` 404'd on a torrent the client was listing.
**The control that settled it: the identical walk minutes later, nothing changed, read the file
list and reached its selection verdict in 14 ms.** `qbitFiles` now marks a 404 as `notFound`, and
both waits ask `torrents/info` what it means — still listed means keep waiting, actually absent
means the client-facing "no longer in qBittorrent" that gate 29 depends on, now one shared
constant. The metadata timeout gained its own state: a client that will not open the list is not
a swarm that never answers. 3 tests + a scope control that a **non**-404 stays fatal on the first
read; the pre-existing test asserting the old behaviour was rewritten onto a 500, not deleted.
Mutation control: tolerance disabled → 3 failures, the 3 intended. Suites **218/218**.

**`99c20548` — the sequel defect the last entry recorded and left open.** `looksLikeSameTitle`
scored *Ashita no Joe 2* a perfect match for *Ashita no Joe*: every token of the shorter title is
inside the longer one and the rule only wants half. `sequelOrdinal` reads the ordinal a name
claims and the gate compares **both sides**, because the failure is symmetric. The hard part is
that release names are full of numbers that are not sequels, so three rules keep them out, each
measured against fixtures already in the file: zero-padded is an episode, inside a range is an
episode, after a separator rather than a word is an episode. `S1`/`1st Season` score 1.
**All 62 pre-existing cases unchanged**; 2 new, one of them six false-negative controls.
Mutation control: gate disabled → 1 failure.

**LIVE after restart (pid 40236), and it is an inverse control pair.** `Ashita no Joe` (2402) now
lists **3** candidates, all genuine — two `01 ~ 79` Erai-raws batches and a 4K remux `(1-79)` —
and the 1.40 MB `Ashita no Joe 2 (Tomorrow's Joe 2) [CR] (Subtitles only)` is **gone**. Searching
`Ashita no Joe 2` still returns that same pack, plus two `01-47` Joe 2 batches. Same release,
offered for its own title and refused for its predecessor's.

**Route B walk, live, 3 candidates across 2 titles, all honest misses at zero content bytes.**
`debug/g31b-routeb.cjs` gained a `walk` step because `fetch` took only the FIRST batch-sidecar, so
one refusal retired a whole title. Ghost Hound (7,782.40 MB, 6 seeders) → *"contains no subtitle
files"*; Les Misérables `[Aoi-WSRN-Licca]` 12,083.20 MB / 4 seeders → same, metadata **10,128 ms**;
`[F-R] … 01-52 BATCH` 33,894.40 MB / 14 seeders → same, **6,051 ms**. Both Les Misérables rows are
new — the 18.10 MB sub-pack this plan chased is below `minSeeders` now. **Gate 31 stays open at
32 of 34**, counted from this file's gate tables; Route B needs a batch that carries sidecars and
3 of 3 muxed batches do not.

**Trap: a probe that reads `qbittorrent.apiKey` off the renderer profile gets 403 on every route,
control included** — the key is resolved main-side from the encrypted store, so `cfg.apiKey` is
empty and the probe sends no `Authorization` at all. `debug/qbit-files-404.cjs` records this;
drive qBittorrent through the app's own IPC instead.

**Next slice:** `debug/g31n-routeb.cjs survey 80 54` was running as this turn closed (`debug/
g31n-survey3.log`, `g31n-routeb-54.json`). Indices 54–117 produced **zero** `sub-pack` rows and a
handful of sidecars. Read that file, then `walk` the smallest sidecar candidates it names.

## 2026-08-17 — addendum, same turn: the survey the fix enabled, and what it found in the fix

Commit `0acdfe11`. `debug/g31n-routeb.cjs survey 80 54` completed over MAL completed-list indices
**54–133** (`debug/g31n-survey3.log`, `debug/g31n-routeb-54.json`).

**The number: 33 batch-sidecar candidates, and ZERO `sub-pack` rows in 80 titles.** Route A has no
new candidate anywhere in this tranche — its pool is genuinely thin, not merely unlucky. Smallest
sidecars: `Fate/strange Fake: Whispers of Dawn` 1,002.10 MB / 3 seeders, then four
`Kaguya-sama … First Kiss wa Owaranai` rows from 1,331.20 MB.

**The survey found a defect in the gate that had just shipped.** `Jujutsu Kaisen 0 Movie`, a
1-episode movie, was offered `[Judas] Jujutsu Kaisen (Season 03)` — 4,300.80 MB, 392 seeders.
`sequelOrdinal` read only `untaggedPart`, which strips parenthesised tags along with the codec
ones, so a release stating its season plainly was left claiming nothing. Explicit season forms now
read the **whole** name; bare numbers and roman numerals stay on the untagged claim, where
brackets full of resolutions and years cannot reach them. Two controls (`(Batch) S01` still
matches; `[SubsPlease]` is not a season marker). Mutation control: scope reverted → 1 failure.

**Not fixed, recorded with its evidence.** The same survey shows title matches that are not sequel
errors: `Hal` was offered `[Trix] Agents of the Four Seasons S01 … Shunkashuutou Daikousha: Haru no
Mai`, and `Juubee Ninpuuchou` a `NINJA SCROLL (1993-2003) - Complete Movie and Anime TV Series`.
Both are short titles reached through the **alias** walk, so the false match is in alias selection
rather than in `looksLikeSameTitle` — `searchedAs` is the field to read when chasing it.

**GATES, SHARED TREE, re-run at final HEAD after the last slice.** `npx vitest run` **729 files /
10,065 passed / 0 failed / 6 skipped** at `0acdfe11`. (An earlier green run at `99c20548` read
10,064; the season fix adds one test. The gate is the later run, not the earlier one.) The first run showed 2 failed suites (`mediaSurfaceImportGraph`, a
dictionary suite) — both timeouts, neither touched by this turn, both green on a clean re-run with
no live survey competing for CPU. That is the recorded full-run flake, verified twice before being
called anything. i18n exit 0 at **10,554** (no new strings this turn). architecture exit 0,
"Nothing new", 6 pending. eslint **0 errors** on all 4 touched paths.

**Next slice:** `walk` the smallest sidecars the survey named, in size order, starting with
`Fate/strange Fake: Whispers of Dawn` (1,002.10 MB, 3 seeders) — a Route B miss costs only the
metadata handshake, so the pool is walkable. The first release that carries real `.ass`/`.srt`
sidecars is gate 31's Route B leg. Gate 31 remains **32 of 34**.

## 2026-08-17 — the alias walk was offering other people's shows, and Route B's refusal now proves itself

Worker `primary`. Commits `f0936a7e`, `b1c495c6`. App restarted for both (main pid **29564**);
the pre-restart numbers below are labelled as such.

**`f0936a7e` — the false match the last entry recorded and left open, diagnosed and closed.**
`looksLikeSameTitle` asks whether half a title's words appear in the release name. For a
**one-word** title that is one hit out of one — a perfect score for a single incidental token.
Measured live: MAL 16528 `Hal` is ハル, so the alias walk searched **`Haru`**, and the listing
returned 4 rows of *Shunkashuutou Daikousha: Haru no Mai*. A one- or two-word title is now also
asked the opposite question — does the release's own untagged claim carry any **other** work's
words? — with `RELEASE_VOCABULARY`/`RELEASE_MARKER` forgiving what a release says about itself.
The vocabulary is derived from the 32 real names in `debug/g31n-routeb-54.json`, not imagined:
`complete`, `season`, `s01`, `x264`, `1080p`, `v2` are the only ones escaping the brackets there.

**LIVE, after restart. 3 titles cleared, 8 rows and 57,344 MB of someone else's show.** `Hal`
4→**0**, `Heya` 3→**0**, `Jumping` 1→**0**, each now honestly *"No release on the index looks like
it carries subtitles for this title."* The rows that went: 4 *Haru no Mai* batches to 5,529.60 MB;
for `Heya`, `[Erai-raws] Heya Camp` 2,457.60 MB and two **Yuru Camp** batches at 12,083.20 and
**15,872 MB**. **Control that must not move: `Kaguya-sama … First Kiss` 7 rows → 7 rows.**
All 74 pre-existing matcher cases unchanged; mutation control → 1 failure, the intended one.
**One arguable loss, recorded rather than hidden:** `Jumping`'s single row was a 10,240 MB *Osamu
Tezuka Experimental Films* BDRip that really does contain a short called Jumping — in a
parenthesised list `untaggedPart` strips. A 10 GB collection is a poor Route B answer, so the
refusal stands, but it is a judgement and not a clean win.

**`b1c495c6` — eleven Route B refusals in a row reported no number, so nothing could audit them.**
"This release contains no subtitle files." is honest and unfalsifiable: it cannot distinguish a
real muxed batch from a file list this app read wrong. It now carries the counts, the way
`notJapaneseReason` beside it already did. **Verified rather than assumed, and it changed the
design:** the empty-list branch I started with is unreachable — `qbitAwaitMetadata` refuses an
empty list first, with its own *"no peer sent its file list"* — so the branch is gone and the test
that found it stayed, rewritten as the control asserting that upstream state. Mutation control → 2
failures, the 2 intended.

**GATE 31 ROUTE B: DATA-BLOCKED, and now that is a measurement.** The live walk over all 7
Kaguya candidates (each named with size and seeders first; zero content bytes, metadata only,
6.0–46.8 s each): **79 files across 7 torrents, 79 of them video, 0 subtitle files** — 4/4, 6/6,
4/4, 4/4, 4/4, 4/4, 53/53. **Across 4 titles, 10 distinct batch-sidecar candidates have now
reached a subtitle verdict and none carries sidecars.** Kill the standing assumption that
`[Erai-raws] … [Multiple Subtitle]` ships a `Subs/` folder: candidate 4, 2,662.40 MB, is **4 files,
4 video**. Erai-raws muxes. Gate 31 stays **32 of 34**.

**Open, pre-restart, not chased:** `Fate/strange Fake` refused in **49 ms** with *"no longer in
qBittorrent"* — that is `6cdd874d`'s notFound path answering instantly, i.e. the add never took.
A candidate retired in 49 ms has not been asked the question. Re-run it first next turn.

**Next slice:** the batch-sidecar route classifier is 0-for-10 on real data, so it is ranking on a
name signal that does not predict sidecars. Either find the name signal that does (survey indices
134+ for releases whose names state a subs folder) or make the route's own listing honest about
its hit rate — do not walk more Kaguya-shaped batches expecting a different answer.

## 2026-08-17 — the sidecar route had no name signal at all, and its refusal now counts

Worker `primary`. Commit pending. App restarted 4× (final main pid **17628**); every number below
is post-restart, because `shared/subtitleNyaa.ts` is consumed by main and main does not hot-reload.

**The finding.** `couldCarrySidecarSubtitles` was `row.isBatch === true` — the route the last entry
called "0 for 10 on real data" was not ranking on a weak signal, it was ranking on **no** signal.
Every batch on the index qualified, which is why 10 distinct candidates each spent a 6–47 s metadata
handshake to be told what their own names already said.

**`declaresMuxedSubtitles`** reads the three phrasings that state *where* the subtitles are —
`multi(ple) sub(title)s`, `softsub`, `hardsub` — and refuses the sidecar route on them. Deliberately
**narrower** than the neighbouring `VIDEO_WITH_SUBS_RE`: `dual audio` is a claim about audio and
`English subbed` says a release is subtitled without saying how, so neither may retire a candidate.
Scored against the 33 real sidecar names in `debug/g31n-routeb-54.json`: **14 of 33** declare it,
every one an mkv-era muxing group (`[Erai-raws]`, `[Judas]`, `[Trix]`, `[DKB]`, `[Anime Time]`).

**LIVE, and it is an inverse control pair.** `Kaguya-sama … First Kiss` **7 → 3 rows**: the 4 that
went all declare `[Multiple Subtitle]`/`[Multi Sub]`/`[Multi Subs]`; the 3 that stayed
(`[SubsPlease]` ×2, `[DB]`) say nothing about placement and still need their file list. **Control
that must not move, and did not: `Ghost Hound` still lists its 1 row** — `[DeadFish] … Batch [BD]
[1080p][MP4][AAC]`, 7,782.40 MB, 6 seeders. `Fate/strange Fake: Whispers of Dawn` — the 1,002.10 MB
`[Anime Time] … [Multi Sub]` the last entry queued as the next walk — is now retired **by name in
1,005 ms** instead of a metadata handshake.

**The refusal counts, because eleven in a row that reported no number could not be audited.**
`rankSubtitleCandidatesDetailed` returns `NyaaRankDrops` (`titleMatched`/`seeders`/`title`/`muxed`/
`shape`/`language`) and `describeEmptyNyaaListing` speaks it; `nyaaSearchDetailed` carries it to
both listing surfaces. The alias walk keeps the drops of the alias that **saw the most of the work**,
so a Japanese title the index does not carry cannot overwrite the one alias that found the show.

**Two defects the live pass found in my own fix, both fixed and re-measured, not reported.**
(1) `Fate/strange Fake` first read **"11 of 38"** — the counter credited muxing for single-file rows
that were unusable regardless. Narrowed to batches: **1 of 39**, a threefold overstatement removed.
(2) `Heya Camp` read *"1 of 1 matching release **declare their** subtitles"*, then after a naive fix
*"1 of 38 matching **release** declares"* — one noun phrase cannot agree with two counts. Restructured
to `Of N releases matching it, M declare(s)`; both live strings now read correctly.

Tests: 12 new across the two suites, 3 of them negative controls (`dual audio` and `English subbed`
are not muxing claims; a group tag named `[Multi-Subs]` is not one either). Mutation control: gate
disabled → **3 failures, the 3 intended**. Suites: shared+harvest+fetch+panel **159/159**.

**Gate 31 stays 32 of 34** — this makes the route honest and cheap, it does not find a sidecar.

**Next slice:** survey MAL completed indices **134+** for names that state a subs folder (`+ Subs`,
`Subs/`, a separate `[Subs]` bracket) — the positive signal is still unfound, and the pool above 133
has never been walked. `debug/mux-live.cjs <json>` lists any title live in ~1–5 s.

## 2026-08-17 — addendum: the positive signal is 1 in 2,685, and the panel said nothing about route

Worker `primary`. Commit pending, same turn as the entry above.

**The signal hunt, answered with a number.** Every release name this repo has ever recorded across
all `debug/g31*.json` corpora — **2,685 distinct strings** — scanned for the six ways a release
could advertise external subtitles (`+ Subs`, a `Subs/` path, a standalone `[Subs]` bracket,
`w/ subs`, "external/sidecar/separate subtitle", a bare `ASS`/`SRT` token in a batch). **Exactly 1
name matched**, `[Yousei-raws] Gintama 銀魂 (2006-2010) ep001-201 … + Subs`. Every other form scored
**0**. So the fork the last entry set — find the positive name signal, or make the listing honest —
resolves to the second: there is no positive signal to rank on, and a route that cannot be predicted
from a name must say so instead of pretending.

**The dishonest states, both fixed.** (1) `media.subtitles.nyaa.route.batch-sidecar` read
**"Subtitle files from a batch"** — a flat assertion of the one thing the app cannot know until it
reads the file list, and which has been false 10 times out of 10. Now "Video batch · subtitles
unconfirmed", in all four languages. (2) Worse, and on this plan's own primary surface:
`SubtitleHarvestPanel` **never rendered the route at all**. `route` has been on the contract at
`subtitleDiscoveryIpc.ts:197` throughout, and the panel showed name + size + seeders — so a 34 MB
subtitle pack and a 7,782 MB video batch were offered identically, with nothing on screen to tell a
user which one costs a metadata handshake and may carry nothing. The route now leads the meta line,
and a `sidecarNote` appears **only when a batch is actually in the list**.

**LIVE, after the panel change, through the renderer's own module graph** (`debug/route-keys-live.cjs`
imports the catalogs Vite is serving, not the files on disk): all 4 new/changed keys resolve in
**en/ja/zh/ru**, 16 of 16 non-MISSING, and the old asserting label is gone from the served copy.
`node tools/i18n-check.cjs` exit 0 at **10,560** keys (+3).

**NOT driven in-UI, stated rather than implied.** The Start-menu → Scraper → Discover walk reached
the catalogue (`scr-page--discover`, 44 rows) but the MAL download dialog opens from a per-row
control this probe did not find, so the panel's rendered DOM was not read live this turn. What was
verified live is the served i18n and the `route` values the IPC returns (`Ghost Hound` → 1
`batch-sidecar` row). The render itself is covered by 2 panel tests including a negative control
(a pack-only listing must NOT show the batch note); mutation control → **1 failure, the intended one**.

**Trap for the next worker: the four i18n catalogs carry another track's uncommitted work** —
`ja`/`zh` are **+728/-560** against HEAD, `en` +176/-10. A plain `git add` on any of them commits
theirs. `debug/stage-route-keys.cjs` rebuilds HEAD + exactly two edits per file and writes the blob
with `hash-object -w --no-filters` (note: `--path` and `--no-filters` are mutually exclusive).
Staged result read back: **+4/-1 per catalog, nothing foreign**.

**Gate 31 stays 32 of 34.** A survey of MAL completed indices 134–213 was running as this turn
closed (`debug/g31n-survey4.log`, `g31n-routeb-134.json`); through index 171 it had found **0**
sub-packs. An earlier attempt died at 156 because a `&`-backgrounded job does not outlive the shell.

## 2026-08-17 — addendum 2: the survey finished, and it found a single .mkv offered as a batch

Worker `primary`. Commit pending. App restarted (main pid **33184**, then a clean boot after the
one below).

**The survey, complete.** MAL completed indices **134–213, 80 titles: 17 batch-sidecar candidates,
0 sub-packs.** With the 54–133 tranche that is **160 titles, 50 sidecar candidates, 0 sub-packs**.
**0 of the 17 names state an external subs signal**, consistent with the 1-in-2,685 corpus scan.

**A third defect, found by reading the survey's own output rather than its totals.** Three of the 17
were `[Vivid] / [Vivid-RMX] Mushishi Zoku Shou - 23-24 - Suzu no Shizuku … .mkv` at 620 / 2,048 /
2,867 MB — a two-episode special in **one container**, flagged `isBatch` because the feed infers a
batch from the `23-24` **range**. Offered on this route, picking one downloads the whole file, which
is the single outcome `couldCarrySidecarSubtitles`'s own contract says nothing may reach.
`VIDEO_CONTAINER_RE` already existed for `looksLikeSubtitleOnly`; the sidecar gate now consults it.

**LIVE, and the control is the sharp one.** `Mushishi Zoku Shou: Suzu no Shizuku` **3 → 0 rows**
(base refusal, not the muxed one — correctly attributed to `shape`). **`Ghost Hound` still lists its
1 row: `[DeadFish] Ghost Hound - Batch [BD][1080p][MP4][AAC]`, 7,782.40 MB, 6 seeders.** That name
contains `[MP4]` and passes, because the regex is anchored on a literal `.` — *mentioning* a
container is not *being* one. Mutation control: gate removed → 1 failure, the intended one.

**Open, recorded with evidence, not chased.** The same 17 carry title-matcher false positives of a
new shape: `Mirai no Mirai` (2018 film) was offered `[EMBER] Miru: Watashi no Mirai (2025)` and
`[SubsPlease] Miru - Watashi no Mirai`; `Koukaku Kidoutai` got `The Ghost in the Shell 2026`;
`One Punch Man: Road to Hero` got `[AnimeRG] One-Punch Man (OAD and OVAs 01-06)`. These are
**different works sharing a word**, not sequels, so `sequelOrdinal` cannot see them — the year in
the release name is the unused discriminator, and `searchedAs` is the field to read.

**Trap: a stop/start cycle at speed can leave Electron with a live `/health` and no page.** Boot 5
logged *"Network service crashed or was terminated"*; `/health` answered `{"ok":true}` with
`title:"jp-study-app"`, `url:""` and every `/eval` timed out on `UND_ERR_HEADERS_TIMEOUT`. **Poll
for `5173` in the health URL, not for `ok:true`.** A full `Stop-Process` of every electron pid then
one relaunch loaded in 20 s.

**Gate 31 stays 32 of 34.** Route A has no new candidate in 160 titles and Route B has no sidecar in
50; the pool is measured thin, not unlucky.

## 2026-08-17 — the corpus's one subs-advertising release was refused by our own matcher

Worker `primary`. Commits `60d04278` (fix) and this entry. App restarted for the shared change
(main pid **10696**, `5173` in the health URL, 42 s).

**The matcher was hiding the single Route B candidate this plan has ever found.**
`[Yousei-raws] Gintama 銀魂 (2006-2010) ep001-201 [DVDrip …] + Subs` — the 1 name in 2,685 that
advertises external subtitles, per the corpus scan two entries above — was refused by
`looksLikeSameTitle` in **both** directions. Searching the romaji title, `銀魂` read as another
work's word; searching the native alias, `gintama` did. `ep001` was a second, independent refusal
on the same row: `ep001-201` splits into a bare `201`, dropped as digits, and an `ep001` that
`RELEASE_MARKER` never covered. So the survey's "0 sub-packs in 160 titles" was measuring the pool
*and* our own filter, and could not tell them apart.

**Decision:** a claim word in a script the searched title does not use is *unreadable* evidence, not
counter-evidence — romaji and native names are one work spelled two ways and no set membership can
see that. The half-the-tokens ratio is untouched and still judges a genuinely different work first.
Tradeoff: a release naming a different work **only** in the other script now passes the short-title
rule; the ratio still has to accept it, which is why the negative control below is the sharp one.
Same commit: `SHORT_TITLE_MAX_TOKENS` counts **distinct** tokens, so `Mirai no Mirai` (three tokens,
two words) stops escaping the rule that was written for it.

**LIVE, one variable — the restart.** Same call, `malId 918`, `subtitleHarvest:nyaaList`:
before **0 rows** ("No release on the index looks like it carries subtitles for this title"), after
**1 row**, `searchedAs="銀魂"` — the native-alias direction the fix restored — route `batch-sidecar`,
**109,670.40 MB, 4 seeders**. Mutation controls on the two halves, 1 failure each and the intended
one. Suites: `subtitleNyaa` 80/80, four matcher suites **119/119**.

**And the answer it unblocked is a refusal, stated as a number.** Metadata handshake
(`stopCondition=MetadataReceived`, 0 bytes of content, 11 s): **290 files, 114,997,054,438 bytes,
269 `.mkv`, 20 `.jpg`, and 1 `.rar` — `eng_subs.rar`, 2.20 MB.** **0 text subtitle files, 0 bitmap.**
The `+ Subs` is an English archive; the Japanese track is muxed into the 269 containers. Driven then
through the app's own handler, `subtitleHarvestNyaaFetch` refused in **5 s**:
*"This release contains no subtitle files. 290 file(s), 269 of them video — any subtitles it carries
are inside the video."* Nothing downloaded, no false success. That is `noSubtitlesReason` earning
its counts on the one release they were written for.

**Gate 31 stays 32 of 34, and Route B is now genuinely data-blocked rather than filter-blocked** —
which it was not, before this. The corpus holds no release that both advertises and carries
Japanese sidecars; the next Route B lead has to come from a widened survey, not from this pool.

**Cleanup, and one thing I did not do.** The `jp-study-subtitles` category is back to **0 rows**. It
held a `[DB] Kaguya-sama …` row from an earlier turn at the start of this sequence and that row was
gone by the next poll; I deleted only the Gintama hash, twice, by hash. Not chased, recorded.
**Trap:** a `bash` heredoc in this environment eats backslashes — `/^WebUI\APIKey=/` reached disk as
`/^WebUI\APIKey=/` and then as a syntax error. Write instruments with the Write tool.

## 2026-08-18 — Route B carries sidecars for the first time, found in the half of the index we could not read

Worker `primary`. Commits `862ec8eb` (signal), `7d3f6f4c` (dedupe). App restarted twice for the
shared change (final main pid **39740**); every live number is post-restart.

**THE FINDING, and it retracts this plan's own conclusion.** 2026-08-17 scanned 2,685 corpus names
for six *English* phrasings of "external subtitles", found 1, and concluded "there is no positive
signal to rank on". It was measuring our vocabulary, not the pool — the same mistake the `銀魂`
matcher made. Chinese releases state placement **and** language exactly, and never in English:
`外挂`/`外掛` external (**11 of 1,748**, 4 also Japanese), `内封` muxed (**23**), `内嵌` hardsub (**1**).
So `declaresMuxedSubtitles` was blind to 24 names paying a 6–47 s handshake to learn what their own
name said, and `declaresExternalSubtitles` is the first signal this route has had pointing *toward*
a candidate. Third defect found on the way: `字幕` was pushed as signal `jp-subtitles`, but it is
Chinese too and **11 of its 32 hits sit inside a fansub GROUP name** (`字幕社`, `字幕組`) — a multi-GB
BDRip read as a subtitle pack with only the 50 MB ceiling stopping it. Now `cjk-subtitles`.

**LIVE, and the ordering control is built in.** JoJo Part 5 (MAL 37991), 3 rows: the
`[DBD-Raws] … 外挂` row ranks **#0 at 8 seeders, above `[Some-Stuffs]` at 49** — seeders cannot be
what ordered them. Cardcaptor Sakura: 1 row, flagged. **Negative control on live data: Dragon Ball Z
returns 4 rows and none carries the flag**, so it is not sprayed on everything; the 1-episode control
title returns 0 rows with its honest refusal.

**ROUTE B REACHES SIDECARS — the first time in this plan's history.** Ten previous candidates across
4 titles: **0** subtitle files. This one: **78 subtitle files for 39 episodes**, `…[06]….sc_jp.ass`
and `…[06]….tc_jp.ass` — simplified- and traditional-Chinese pairings of the *same* Japanese.
Measured on the 16 that landed: **61,758 kana**, episode 06's two files **3,387 kana each**. Both
correctly read `ja`, so nothing dropped either and the fetch timed out at 16/78. `7d3f6f4c` keeps one
file per episode on the range path only. **Live after restart: 78 → 39**, and on disk only `tc_jp`
exists per episode — `sc_jp` is ENOENT at priority 0. 3 episodes landed, **10,405 kana**.

**A fix I did not make, recorded because it looked right for ten minutes.** The name declares `简繁`
and no `日`, so a name-level "no Japanese → refuse" rule reads as obviously correct. It would have
discarded the only Route B candidate that has ever carried Japanese cues. **The name understates the
payload; only the file names say `_jp`.** Measure the files before writing a name rule.

**GATE 31 STAYS 32 OF 34, and Route B is now swarm-blocked rather than data-blocked** — a real
distinction, and the third one this leg has had. Second run: **3 of 39 in 307,916 ms**, and at that
moment `num_seeds=0, num_leechs=0, dlspeed 0.0 KB/s`. Piece size **4.00 MB** × 39 files = up to
**156 MB** on the wire for 87.80 MB of text, `pieces_have 3/11720`. The listing advertised 7–8
seeders; the client connected to none.

**Next slice.** The message read *"Timed out with 3/39 subtitle file(s) complete."* while 0 peers
were connected — gate 28's exact lesson (a full disk was once indistinguishable from a slow swarm)
recurring one field over. Make a **dead** swarm say so, distinctly from a slow one, in
`qbitAwaitFiles`; it already re-reads torrent state each poll, so `num_seeds`/`num_leechs` are there.
Then re-run this candidate — it is a known-good Route B fixture.
Cleanup: category back to **0 rows**, torrent deleted with its files, both times, by hash.

## 2026-08-18 — the swarm gets named, and the same 3/39 means two opposite things

Worker `primary`. Commits `52c49ef6` (file wait), `414df42e` (the `-1`), `fe258d1c` (metadata wait
+ the split), `3059f33b` (lint). App restarted three times; every live number is post-restart.

**THE HEADLINE, and it is a comparison, not a claim.** The same candidate, the same count, opposite
advice — which is the whole point:
- 2026-08-17: `"Timed out with 3/39 subtitle file(s) complete."` while `num_seeds=0, num_leechs=0`.
- 2026-08-18, live: `"Timed out with 3/39 subtitle file(s) complete. Still connected to 16 peer(s)
  at 121 KB/s — this swarm is slow, not dead, so a longer wait may finish it."`

**Found only because the re-run was live.** The fetch never reached `qbitAwaitFiles` on the first
attempt — it died one function earlier in `qbitAwaitMetadata`, which had the identical blind spot
and is the wait that actually fails in practice: 8 minutes at `seedsTotal 0, peersTotal 1`, reported
as "no peer sent its file list". A unit-test-only slice would have shipped the fix into the wrong
function and called it done.

**The summed count was backwards, and the split is the fix.** 0 seeds + 1 peer sums to 1, so the
first cut read "the swarm lists 1 and we reached none of it" → *check your VPN*. Split per half,
those same numbers say **nobody is sharing a complete copy** — the release's fault. `swarmCount`
also keeps `-1` (qBittorrent for "tracker not scraped") distinct from zero. **`-1` was NOT
reproduced on this daemon** — 5.2.3 answered 0/61 fresh and 0/28 aged — so that half is guarded on
the documented contract, not on an observation. Say so; do not upgrade it to "measured".

**Gate 31 STAYS 32 OF 34** (open: 31, 34), counted from this file's gate tables. Route B did not
acquire. But the blocker moved again and this is the actionable part: **it is no longer swarm-blocked,
it is timeout-blocked.** The swarm revived to 16 peers / 9 seeds / 121 KB/s; `FETCH_TIMEOUT_MS` is
**5 minutes** (`subtitleNyaaSource.ts:77`) and 39 sidecars behind 4 MB piece alignment need ~20+ min
at that rate. The product now literally says "a longer wait may finish it" and offers no way to wait
longer. **That is the next slice.**

**Cleanup, through the product's own path and not the user's API key.** `qbitReapSubtitleOrphans`
runs before each acquisition, so a fetch aimed at another candidate swept the 46 GB transfer this
turn left running — deleted with its files, none of the user's 6 touched, verified by listing.
Watched work twice today. `debug/g31a-qbit.cjs` reads the key out of `qBittorrent.ini`; do not.

**Traps.** (1) `debug/g31n-routeb.cjs acquire` **re-sorts candidates by size** and so discards the
product's own ranking — it picked a muxed release while the `外挂` row the signal promoted sat at #0.
Take row 0. (2) A refused release stays in the client by design; the *next* acquisition reaps it.
(3) `scraperQbitTransfers` returns the array directly, not `{ok, rows}`.

Gates: vitest **733 files / 10,191 passed / 0 failed** / 6 skipped (baseline 10,172; **+19 = exactly
my new cases**); i18n exit 0 (10,590); architecture exit 0 "Nothing new", 5 pending; eslint **0
errors** on all three touched paths. Mutations: 5 red, 1 red, 4 red, 3 red — each restored green.

## 2026-08-18 — ROUTE B ACQUIRES IN FULL, 39 of 39, and the char count is not what it looks like

Worker `primary`. Commit `e679199a`. App restarted for the main-process change (pid 30016, up
04:24:31); every number below is post-restart and from the running app.

**THE HEADLINE, as a comparison.** Same candidate, same code path, one constant reinterpreted:
- 2026-08-17 / 2026-08-18 morning: **3 of 39** in 307,916 ms, then "a longer wait may finish it".
- 2026-08-18 04:26 live: **39 of 39 episodes** in **1,683,403 ms (28.06 min)**, `ok:true`, episodes
  1–39 each exactly once. `FETCH_TIMEOUT_MS` was a wall clock and is now a **stall** budget renewed
  by any arrival, ceiling 30 min. The transfer took 28.1 of those 30 — under the old 5-minute clock
  it was unreachable by a factor of five, and no amount of retrying would have changed that.

**The rate is the load-bearing signal, not the bytes.** A 30 KB sidecar inside a 4.00 MB piece sits
at its starting fraction until the piece lands, so a byte-only renewal would have called this exact
transfer frozen. Both are read; `nothingArrived` is true only when neither moved.

**THE NUMBER THAT WOULD HAVE BEEN A FALSE CLAIM.** The fetch reports `chars: 90,963,972`. On disk:
**39 files, 92,069,272 bytes** — so the payload is ~1 byte per char, i.e. **ASCII, not Japanese**.
Measured per file: **667,719 `Dialogue:` lines** hold **181,790 kana** (min 3,020, max 6,364, mean
4,661 per episode — consistent with the plan's earlier "episode 06 … 3,387 kana"). Episode 31 alone
is 5,093,684 bytes with **36,692 Dialogue lines and 5,343 kana**: karaoke/typesetting effect spam,
one line per animation frame. There is no `[Fonts]` section; it is all tag markup. **Report 181,790
kana across 39 episodes. Do NOT report 90,963,972 characters** — the plan's own "number, never the
adjective" rule cuts both ways, and a number measuring the wrong thing is worse than an adjective.

**GATE 31 IS NOT CLOSED, and this does not close it.** Its wording (line 413) requires Route A *and*
Route B "ending in **cues that render in the player** through the same path a jimaku subtitle takes".
What closed is Route B's **acquisition** half, for the first time in this plan's history. Still open:
the render leg, and Route A's Japanese-cue status (its 2026-08-17 acquisition was English).

**The trap this hands the next worker.** `SubtitleHarvestPanel.tsx:330` runs `parseSubtitles` over
every file and hands the result to `analyse` — that is **667,719 cues** for 181,790 kana of study
text, in the renderer. Measure it before assuming the mining path survives this release.

**Cleanup.** The release stays in `jp-study-subtitles`; only the sidecars were downloaded (the rest
is `QBIT_PRIO_SKIP`), so the disk cost is 92 MB, not 46,899 MB. `qbitReapSubtitleOrphans` sweeps it
on the next acquisition, which is the designed path — do not reach for the user's API key.

Driver: `debug/g31n-ceiling.cjs` (untracked, like all of `debug/`). It takes **row 0 of the
product's own ranking** and does not re-sort by size the way `g31n-routeb.cjs acquire` does.

## 2026-08-18 — the 39 episodes are a Chinese release too, and a stall was all-or-nothing

Worker `primary`. Commits `b790f175`, `90d1a2d8`. Two defects, both in the shape this plan exists
to catch: a run that reports success while being wrong.

**1. The Route B pack is DUAL-LANGUAGE, and the harvest would have mined both halves.** The
release acquired on 2026-08-18 is tagged `简繁外挂字幕` and its files are named `.tc_jp.ass` — one
file per episode carrying **two whole subtitle tracks**. Episode 01: **413 `JOJO5_textjp` lines
(3,945 kana) and 413 `JOJO5_textch` lines (0 kana, 3,839 Han)**, the same lines twice. Nothing above
the parser could see it: the name passes, `looksJapaneseSubtitle` passes because the Japanese half
is right there, and it parses cleanly. Across 39 files, **26,412 Dialogue lines carry Han and no
kana**.

**The cue count in the previous entry was also measuring the wrong thing.** 667,719 was raw
`Dialogue:` lines; **parsed is 667,453**, and **97.0% of those carry no kana at all**. The real
breakdown: `JOJO5-op1-ch-2` **348,994 cues / 0 kana**, `JOJO5-op1-jp-2` **274,628 / 826** (romaji
karaoke), `JOJO5_textch` **11,602 / 38**, `JOJO5_textjp` **11,168 / 11,049**. The study text is
**11,168 cues**, not 667,453.

`keepJapaneseStyleCues` (`shared/subtitleCues.ts`) judges each ASS style by the script its own text
uses — the per-file `looksJapaneseSubtitle` policy one grain finer. **Majority-kana, not any-kana:**
any-kana keeps all 274,628 romaji-karaoke cues, because 826 of them have a stray character. **Never
by name:** `textjp`/`textch` is a lucky pair, `Style1`/`Style2` is the case a name rule fails
silently. Applied in the panel's `analyse`, which both providers share.

**MEASURED through the shipped code over all 39 real files** (`debug/g31-style-filter-real.cjs`,
esbuild over `src/`, not a reimplementation): **667,453 cues → 18,959 (2.8% kept)** while **kana
goes 178,801 → 177,807 (99.4% kept)**. A 35x reduction costing 0.6% of the study text. `JOJO5_textch`
is dropped from all 39 episodes. **LIVE in the running renderer** via `/eval` over the app's own
module graph: 144 parsed → 50 kept / 94 dropped, `JOJO5_textch` + `JOJO5-op1-ch-2` gone, only
`JOJO5_textjp` kept. Mutations: threshold 0.5 → 0.001 = 1 red; the all-styles-failed guard removed
= 1 red ("expected [] to have a length of 40").

**2. A stalled acquisition threw away the episodes that HAD landed** (`b790f175`). `acquireAll`
returned on `!done.ok` and the whole files already on disk went with it — that is what the
2026-08-17 **3 of 39** actually cost. `qbitAwaitFiles` now returns `partial` alongside the refusal;
`acquireAll` reads **only the whole files** (a half-transferred `.ass` parses fine, which is the
trap) and returns `ok` with a `notice`. Nothing complete is still an outright refusal; a language
mismatch still outranks the stall reason. The other half: `SubtitleHarvestPanel` **discarded**
`reply.message` on the ok path, so a partial season looked identical to a whole one. 3 mutations,
1–3 red each.

**GATE 31 STILL NOT CLOSED**, and this narrows what is left rather than closing it: the render leg
is untouched, and Route A's Japanese-cue status is unchanged. What this does settle is that Route
B's 39 episodes are **usable but not clean**, and the earlier "181,790 kana" figure survives
(177,807 of it is in the Japanese track).

**Trap for the next worker.** The style filter is on the MINING path only. The **player/fusion**
path (`subtitleFusionCore.ts` reads `cue.style` for songs and signs) has no language notion at all,
so the render leg will show the Chinese track unless it gets the same treatment — decide that
deliberately when gate 31's render half runs; do not assume it is covered.

## 2026-08-18 — the player would have stacked the Chinese line on the Japanese one

Worker `primary`. Commit `30c8cc24`. Gate 31's **render leg**, half of it closed and the other
half now named as a product gap rather than a measurement difficulty.

**The trap the last entry left was real, and here is its number.** The style filter had landed on
the mining path only. Measured LIVE in the running renderer over the app's own module graph
(`import('/src/shared/subtitleCues.ts')`, the acquired episode 01 served to the renderer and
parsed by the shipped parser): **856 raw cues → 413 kept, 443 dropped across 8 styles** —
`JOJO5_textch`, `stand-parameter`, `JOJO5_textpy`, `JOJO5-staff`, `JOJO5-tips`, `stand-name`,
`JOJO5-next title`, `JOJO5-title`. At t=667.59 s the raw parse puts **4 cues on screen**
(`textjp, textch, textjp, textch`); filtered, **2**, both `textjp`. And **413 of 413** Japanese
dialogue lines had at least one other cue on screen at their own midpoint — not a sampling
artefact, every single line.

`parseStudySubtitles` (`shared/subtitleCues.ts`) is `parseSubtitles` + `keepJapaneseStyleCues`
named once so the player and the miner cannot drift. Wired into `MediaContent.applySubtitleFile`
— the seam a stored record reaches the player through (`applyStudyContext` → `readSubtitleRecord`
→ here) — and deliberately **not** into `openSecondarySubs`: a translation track is asked for in
another language by definition. That is the negative control, and it is a test.

**A minimum-line floor is FORBIDDEN, and this is the evidence so nobody adds one.** A kana-free
Japanese sign (東京駅) is dropped, and the obvious fix is "keep styles with too few lines to
judge". Censused over all 39 acquired files: `JOJO5_textjp-an8` and `JOJO5_textch-an8` are **both
169 lines across 35 files, one line per file each** — any floor that saves the sign puts the
Chinese track straight back on screen. Script alone cannot separate them; the cost is bounded and
reported. Pinned as its own test.

**Mutations:** filter removed from `parseStudySubtitles` = **5 red**; the status note dropped =
**1 red** (the hidden count never reaches the user); the filter leaked into the secondary slot =
**1 red** (the negative control). Restored → 17 passed.

**WHAT IS STILL OPEN, and it is a PRODUCT gap.** `SubtitleHarvestPanel` has exactly four bridge
calls — `subtitleHarvest:list`, `:fetch`, `:nyaaList`, `:nyaaFetch` — and **no attach**. Harvested
cues go to mining and stop there. The only route from a nyaa release to a `SubtitleRecord` is
`NyaaSubtitleDialog.tsx` → `acceptNyaaSubtitle`, which starts from a **media item you already
own**. Route B's 39 episodes are subs-only and this profile has no JoJo video, so the acquired
cues cannot reach the player without either (a) a video in the library, or (b) a new attach action
on the harvest panel. Rendering them over an unrelated video would be a rig, not a proof, and is
not being done.

**Not touched, deliberately:** the workspace player's own external-subtitle attach effect
(`VideoCoreStudyOverlay.tsx:787` in the worktree) **does not exist in HEAD at all** — it is
another track's uncommitted work, so the same filter cannot land there yet. Whoever commits that
track owes it the `parseStudySubtitles` call.

**Gate 31 stays 32 of 34.**

## 2026-08-24 — the attach the harvest panel never had, built (gate 31's product half)

Worker `primary`, continuing a slice `backup` left half-written when its quota ran out mid-turn
(`src/shared/subtitleDiscoveryIpc.ts` and `src/main/subtitleDiscovery.ts` were dirty at 07:54 with
the contract and the main function, and nothing wired).

**What was missing, restated from the previous turn's own finding:** `SubtitleHarvestPanel` had
four bridge calls and no attach, so harvested cues reached mining and stopped. Every other route
into a `SubtitleRecord` starts from a media item; the harvest panel starts from a *catalogue*
entry and has no media item at all.

**Built (b), the attach action** — not (a), because (a) is "acquire a JoJo video", which is a
different gate's work and a several-GB transfer:

- `shared/subtitleDiscoveryIpc.ts` — `SubtitleAttachTextInput`, `ATTACHABLE_SUBTITLE_FORMATS`,
  `MAX_ATTACHED_SUBTITLE_BYTES` (8 MB), and the pure `normalizeSubtitleAttachText`. Shared so the
  renderer disables for the same reasons main refuses; main still validates.
- `main/subtitleDiscovery.ts` — `attachSubtitleText` + `subtitleDiscovery:attachText`. Reuses
  `writeSubtitleFile`; takes no provider config, so it cannot reach the network.
- `preload.ts` + `renderer/window.d.ts` — `attachSubtitleText`, staged HEAD+insert.
- `SubtitleHarvestPanel.tsx` — keeps each fetched file whole (`HarvestedFile`), reads the library
  once there is something attachable, and offers item + file pickers. 10 keys × 4 catalogs.

**Decisions, standing auto-approval, both reversible.** (1) `lrc` is a `SubtitleRecordFormat` and
is still refused: it is the lyrics container the transcription path writes, no subtitle index
serves one, and offering it names a format no harvest can produce. (2) The original bytes are
kept rather than re-serialised from `cues` — the combined corpus is one flattened timeline, so
re-serialising would offset every cue by the episodes before it, and an `.ass` would lose styling.

**Measured, not asserted.** New suites: `main/__tests__/subtitleAttachText.test.ts` **9 passed**,
`renderer/__tests__/subtitleHarvestNyaaPanel.test.tsx` **10 → 14 passed**. Negative controls that
each fail correctly: a refused format writes **0 files** to the cache and patches **0 items**; a
harvest of only `.txt` renders no attach heading and never calls `listMedia`; an empty library
says so instead of rendering an empty picker; `attachSubtitleText` shows main's refusal verbatim
rather than a success. Byte-cap control: 2,796,212 characters of `あ` is under the cap in UTF-16
length and over it in UTF-8 bytes, and is refused.

**Gate 31 is NOT closed by this and this does not claim to close it.** Its wording (line 413) is
an *attended* Route A + Route B acquisition ending in cues rendering in the player. This removes
the structural blocker the previous turn named — the route from harvested text to a
`SubtitleRecord` now exists — and leaves the attended run itself. **Gate 31 stays 32 of 34**
(open: 31, 34), counted from this file's gate tables.

## 2026-08-24 — the reverse transition every subtitle add was missing

Same turn, worker `primary`, following `ab4603c3`. Not a gate in this plan's tables; it is the
invariant `CLAUDE.md` states ("every enable/open/add flow needs an intentional disable/close/remove
or recovery path") and the attach above made it load-bearing.

**Measured absence, before building.** `grep` over `src/preload.ts` and `src/main/*.ts` for
`removeSubtitle|deleteSubtitle|subtitle.*remove` → **zero matches**; over `src/renderer`,
`src/main`, `src/media` for `subtitles.filter|subtitles.splice` → one hit, in
`main/scraper/episodeProcessingRules.ts`, unrelated. So **five** ways to add a track existed —
discovery, nyaa accept, transcribe, fuse, attach — and **none** to remove one. The only recovery
was removing the media item.

`detachSubtitleRecord` (`main/subtitleDiscovery.ts`) + `subtitleDiscovery:detach`, preload and
`window.d.ts` bindings, and a remove control on each row of `MediaDetailPanel`'s Subtitles tab.
Two clicks, not one: the row arms, then confirms. 4 keys × 4 catalogs.

**The control that makes it safe to ship, and it is a test:** an `external` record points at a
sidecar next to the user's own video, so the unlink runs **only** when `!record.external`. The
row is dropped either way. Pinned as `never deletes a sidecar that lives outside the app`.

**Order inside the function is deliberate:** the row is patched away *before* the unlink, so a
locked or moved file leaves an orphaned cache entry rather than a half-removed track.

`subtitleAttachText.test.ts` **9 → 14 passed**. Refusals: a track id not on the item patches
nothing; a ghost media id and an empty pair both refuse.

## 2026-08-24 — the attach path driven live, on a real acquired file, net zero

Worker `primary`, same turn. `debug/mal31-attach-roundtrip.cjs` (untracked; `debug/` is
gitignored). App restarted twice, because both new handlers live in main and main does not
hot-reload — and the restart is itself the finding below.

**The trap, measured before and after, because this repo's rule exists for exactly it.** Before
the restart: `typeof window.api.attachSubtitleText` → `"function"` (preload had rebuilt through
Vite) while the same call returned **`No handler registered for 'subtitleDiscovery:attachText'`**.
A preload binding is not evidence a main handler exists. After the restart both refusals returned
their real sentences: `"That media item is no longer in the library."` and
`"“zip” is not a subtitle format this app reads."`

**The round trip, on `[DBD-Raws][JOJO…][01]…tc_jp.ass` from the 39 Route B acquired** — a real
file, not a fixture. Reached the renderer as `/debug/jojo01.ass` over the Vite dev server.

| step | number |
| --- | --- |
| file | 63,967 chars / **82,466 bytes** |
| target | `d538c715…` "Habits 習慣…Hana #12", **3** tracks before |
| attach | `{ok:true, lang:'ja'}`, tracks **3 → 4** |
| record | `format:'ass'`, `lang:'ja'`, `providerId:'nyaa'`, `subtitles\d538c715…\harvest-ja-mt77bf7u-vlao4a.ass` |
| read back | `readSubtitleRecord` → **63,967 chars, identical:true** — the player's own seam |
| detach | `{ok:true}`, tracks **4 → 3** |
| cache dir after | `fused-ja.meta.json`, `fused-ja.srt` only — the harvested file **unlinked**, the item's own two **untouched** |

**The user's library is byte-for-byte as found**: 3 tracks before, 3 after, and the only file the
run created is gone. That is why the control could run on a real item at all.

**Gate 31 stays 32 of 34.** This proves the mechanism, not the gate: gate 31 wants an attended
Route A *and* Route B acquisition ending in cues rendering **in the player** for the acquired
title, and this profile still has no JoJo video. Attaching those cues to a podcast and calling it
rendering would be the rig the plan forbids — which is why the run above detaches.

## 2026-08-24 — a range lands on a season, and the render seam runs on a series the user owns

Worker `primary`. Commits `7778a59a`, `fa7a7e43`. Probes `debug/g31-libcensus.cjs`,
`debug/g31-attachplan-live.cjs`, `debug/g31-bigo-e2e.cjs` (untracked; `debug/` is gitignored).
No main-process change, so no restart was needed — renderer + shared only.

**The library census nobody had run, and the finding in it.** 33 items: 26 episodes of
**The Big O** plus 3 creditless extras, 3 Hana podcasts, 1 other. **The Big O is NOT on the
user's MAL completed list** — 1,426 rows, and `"Big O"` / `ビッグオー` appear **0 times** in the
whole serialised list. So the only anime series this profile owns cannot serve gate 31's
"from a MAL page" clause, and gate 31's render leg is not merely waiting on a video: it is
waiting on a video *for a title on the list*. Do not re-derive this.

**The product gap that was actually closeable.** The panel attached one file to one item, chosen
by hand. Route B fetched **39** files in one click. `planSubtitleAttach` (`shared/`, pure) pairs a
whole harvest with the library items that ARE those episodes; every rule narrows and nothing
guesses — `no-episode`, `no-match`, `ambiguous` (a tie is refused, not broken), `already-attached`,
and one item takes at most one file per plan. The gate that makes it safe is the **series** check,
not the number: an episode-number lookup alone would write JoJo's episode 1 onto The Big O's.

**Measured live on the real 33-item library, not a fixture** (`import()` over the app's own module
graph). First run: 26-file harvest as The Big O → **24 paired, 2 ambiguous**. The two lost were
episodes 1 and 2, claimed by `The Big O - Creditless Ending 1` and `… Ending 2`. Cause was one line
of the new module: `parseMediaFileName` returns **null** for all three creditless extras — correctly
— and the loose `episodeFromFileName` fallback read **1 and 2** back out of their titles. A null
from the strict parser is an answer, not a gap. Fixed, plus `hashNumbered` for the one form the
strict parser has no rule for (`… Hana #12 [id].mp4`, 4 real items). After: **26 of 26 paired, 0
skipped**; podcast **3 paired**; cross-series control **0 paired, 26 no-match**.

**THE RENDER SEAM, DRIVEN END TO END ON REAL DATA — and jimaku has this series.**
`subtitleHarvestList('The Big O')` → **13 Japanese files**, `needsKey:false`. Episodes 1–3:

| step | number |
| --- | --- |
| fetched | 14,007 / 14,432 / 15,047 chars |
| planned | 3 pairs, **0 skipped** |
| attached | 3 of 3 `ok:true`; tracks 1→2, 0→1, 0→1 |
| read back through `readSubtitleRecord` + `parseStudySubtitles` | **267 / 278 / 299 cues, 0 dropped** |
| first cue | `ん？` · `私の名前はロジャー・スミス` · `Big Big Big-O` |
| detached | tracks 2→1, 1→0, 1→0 — **library net zero** |

**Gate 31 stays 32 of 34** (open: 31, 34), counted from this file's gate tables. What is now proven
is the whole no-torrent route from a catalogue title to parsed Japanese cues on the user's own
video, at real counts. What is still missing is the last inch — cues painting in the player's own
surface (`MediaContent.applySubtitleFile`) — and an acquisition for a title that is on the MAL list.
**Next slice: open `The Big O - 01` in the player with a jimaku track attached and read the rendered
cue element**; the attach/detach harness above is the setup, and it already leaves net zero.

Gates, once, after the last slice, on the shared tree: vitest **787 passed / 1 skipped (788),
10,955 passed / 6 skipped, exit 0** — baseline 786/787 and 10,944, so **+1 file and +11 tests, all
mine**. i18n **10,789/10,789** exit 0 (+6, mine). architecture **"Nothing new", 5 pending**, exit 0.
eslint **0 errors** on all 7 touched paths. Mutation controls, each restored green: `belongsToSeries`
removed → **2 red**; the strict parser's null allowed to fall through → **exactly 1 red**, the
creditless case.

## 2026-08-24 — the render leg opened two defects: a 97.2% unrefereed track, and a dead bridge

Worker `primary`. Commits `4c342b6e`, `8cfe2ef8`. Probes `debug/g31u-dual-census.cjs`,
`debug/stage-subtitleforpath.cjs` (untracked; `debug/` is gitignored).

**Finding 1 — the study split was applied at ONE of four seams.** Censused all eleven
`parseSubtitles(` call sites in `src/`. Four read a stored `SubtitleRecord` as *study*
material and had no split; only `MediaContent.applySubtitleFile` did. Measured with the
product's own module (esbuild-bundled so node requires the TS file, not a copy) over the
**real acquired Route B pack** — all 39 `.ass` of `[DBD-Raws] JOJO 黄金之风 … 简繁外挂字幕`:

| step | number |
| --- | --- |
| files | **39**, and **39 of 39** drop something |
| cues parsed whole | **667,453** |
| cues kept by the split | **18,959** |
| dropped | **648,494 = 97.2%** |
| distinct non-Japanese styles | **22** (`JOJO5_textch` and `JOJO5-staff` and `JOJO5-title` in all 39) |
| worst file, ep 31 | **36,686 whole → 672 Japanese** |
| mildest file, ep 03 | **579 whole → 264 Japanese** |

So the agent's `analyze-subtitles` would have answered **36,686 cues** for an episode whose
Japanese dialogue is **672** — a 54× overstatement, with the level estimate computed over a
corpus that is 97% Chinese and karaoke. Fixed at three committed seams in `4c342b6e`:
`mediaAgentHandlers.analyzeSubtitles` (now also reports `cuesDroppedOtherScript`, omitted
when 0), `mediaStudyOrchestrator` prepare, and the Lexicon personal concordance. 9 tests.
Mutation controls, both restored green: the split reduced to a bare parse → **exactly 2
red**; the overlay call site reverted → **exactly 1 red**.

**Finding 2 — a committed caller, a bridge method that does not exist.**
`LexiconWorkbenchResults.tsx` is on HEAD and calls `window.api.subtitleForPath`. Counted on
`HEAD:` blobs: `src/main/media.ts` **0**, `src/preload.ts` **0**, `src/renderer/window.d.ts`
**0**. The name appeared on HEAD in exactly three places, all callers or prose. So on the
committed branch that call is `undefined`, throws, and the component's own `catch` parks the
personal concordance in its error state — forever. It looked fine because the dev app serves
the **worktree**, where the seam sits as another track's uncommitted work. `8cfe2ef8` lands
the 72 lines the committed caller needs and nothing else, staged HEAD+insert
(`remainder===HEAD` true ×3, all three files being dirty with other tracks). Live control
through the bridge: `subtitleForPath` returned `The Big O.E01.Bandai.ja.srt`, **14,007 chars**,
on 3 of 3 real library rows.

**The fourth seam is NOT fixed on the branch.** `VideoCoreStudyOverlay`'s downloaded-track
mount is the one that paints cues, and HEAD carries **no such effect at all** — the whole
`subtitleForPath` mount, `media:subtitleSyncOffset` and a transcript redesign live only as
uncommitted worktree state. The fix (`parseStudySubtitles` + a `trackNotice` on
`VideoCoreTranscriptPanel` carrying the dropped count and its styles) is applied in the
working tree and is deliberately uncommitted: there is no HEAD blob to base a clean edit on.
**Trap for the next worker: `git add src/media/VideoCoreStudyOverlay.tsx` absorbs ~430 lines
of foreign work.**

**Gate 31 stays 32 of 34** (open: 31, 34), counted from this file's gate tables. Its render
leg is now blocked on something new and concrete rather than on data alone: on the committed
branch there is no route from a stored `SubtitleRecord` to the mounted player, so "cues render
in the player" cannot be demonstrated against HEAD until that track commits.

## 2026-08-24 — a creditless opening was carrying episode 1's dialogue, in the real library

Worker `primary`. Commit `39ea4250`. Probes `debug/g31v-concordance-live.cjs`,
`debug/g31w-perpath.cjs`, `debug/g31x-records.cjs`.

**The live acceptance for `8cfe2ef8` came first, and it found this.** Ran the personal
concordance's own composition through the app — `listMedia` → `subtitleForPath` →
`parseStudySubtitles` → `findLexiconConcordance` — over the real library:

| step | number |
| --- | --- |
| media items | **33** |
| items yielding a readable Japanese track | **8** |
| cues in the corpus | **1,493** |
| `名前` | **1 citation**, `私の名前はHanaです。日本生まれ、日本育ちの日本人で` |
| control `齟齬齟齬齟齬` | **0** |

One hit for a common word looked wrong, so the corpus was censused per item. **Three
different videos claim the same subtitle file**: `The Big O - Creditless Opening`,
`… Ending 1` and `… Ending 2` each hold one jimaku record labelled
`The Big O.E01.Bandai.ja.srt`, `source: 'provider'`, added within **one second** of each
other on 2026-08-13. Episode 1's dialogue on three videos that are not episode 1.

**Mechanism, at the line.** `evaluateSignal`'s episode case returns `'unknown'` when
`target.episode` is null (`shared/subtitleMatching.ts:160`) — right, because a target with no
episode has nothing to disagree with. `parseMediaFileName` returns null for a creditless
extra — also right, and it is the same null `fa7a7e43` had to stop reading back out loosely.
Together the episode signal goes inert, language and title decide alone, every episode of the
series looks acceptable, and `autoDownloadLanguages` attaches the first. The guard is in
`scoreCandidates`, **not** in the matcher: only automatic attachment may turn "we cannot tell"
into "do not", because a manual pick must still be offered a numbered track for a file whose
name merely failed to parse. A track declaring no episode still attaches — the right track for
a film or a one-shot. Both halves pinned; the guard deleted → **exactly 1 red**, restored 31/31.

**Not cleaned up, deliberately:** the three records already written. That is a write to user
data with no restore point and it was not asked for — logged in `needs-user.md` with the ids.

**Gate 31 stays 32 of 34.** Turn gates, once, shared tree: vitest **788 passed / 1 skipped
(789), 10,965 passed / 6 skipped, exit 0** (baseline 787/788 and 10,955; +1 file, +10 tests,
all mine). i18n **10,789/10,789** exit 0. architecture **"Nothing new", 5 pending** exit 0.
eslint **0 errors** on all 11 touched paths.

## 2026-08-24 — the last inch: main resolved a track and the player threw it away

Worker `primary`. Commits `09a31e5a`, `3bc796d1`. Probe `debug/g31y-render.cjs` (adapted from
`g31-bigo-e2e.cjs`; `debug/` is gitignored). Dev app **restarted** first — both commits change main.

**Recovered work first.** The previous turn died mid-slice with a `preferredSubtitleId` leg staged
but incomplete: three HEAD+insert blobs in the index (`main/media.ts`, `preload.ts`,
`renderer/window.d.ts`) whose dependencies — the `MediaItem` field and
`pickPlaybackSubtitle`'s third argument — were unstaged. Finished and landed as `09a31e5a`.

**The defect `3bc796d1` fixes.** `media:open` resolves a stored record on every open and returns
`MediaOpen.subtitle`. Only two renderer paths ever read it: the YouTube download branch and an
explicit study-context record id. The ordinary library open runs `loadOpened`, which resets
`setCues([])` / `setSubName('')` / `setSubStatus('')` and never looks at `r.subtitle`. So the
track was discarded two lines after main handed it over — `media.ts:1258` already called its own
pipeline "write-only" and this was the reason. Now `loadOpened` applies it via the existing
`applySubtitleFile` (study split included), after the reset and before the item's stored offset
is restored. `applySubtitleFile` moved above `loadOpened` because a dependency array is evaluated
every render and a later `const` is a TDZ throw. `downloadYouTube`'s duplicate branch is gone —
it re-parsed with the bare `parseSubtitles`, undoing the split for dual-language YouTube tracks.

**Measured live on `The Big O - 01`, real library, net zero.**

| step | number |
| --- | --- |
| attached ep 1 from jimaku | 14,007 chars, tracks **1 → 2** |
| control, no choice stored | `media:open` → the sidecar, `…[BDRip 1440x1080 x265 FLAC].ja.srt`, **14,012** chars |
| with the choice stored | the jimaku track, **14,007** chars — both **267 cues, 0 dropped** |
| negative control, `preferredSubtitleId: 'not-a-real-record-id'` | **refused**, field deleted, open fell back to the ranking |
| player DOM after opening the item | **`Loaded 267 subtitle lines.`** — a status `loadOpened` could only leave empty before |
| detached | tracks **2 → 1**, preference cleared |

**Gate 31 stays 32 of 34** (open: 31, 34), counted from this file's gate tables. What is still
unshown is the painted overlay: this profile mounts **no `<video>`** in the Media Center's video
stage — it reads `workspace` and says "Video plays in the media workspace", a different player
(`src/media/`). So the remaining render work is on the workspace surface, not this one. Trap for
the next worker: `MediaContent.tsx` carries a **foreign** track's uncommitted `mergeStoredPlayerPreferences`
hunks at lines 81 and 513; `git add` on that path absorbs them — stage by filtering `git diff` to
hunks at `-700`+ and `git apply --cached --recount`.

Gates, once, after the last slice, shared tree: vitest **790 passed / 1 skipped (791), 10,978
passed / 6 skipped, exit 0** (baseline 788/789 and 10,965 — **+2 files, +13 tests, all mine**:
`subtitleChoiceDestination` 3, `mediaOpenSubtitleRoute` 6, `subtitleDiscovery` +4).
i18n **10,789/10,789** exit 0. architecture **"Nothing new", 5 pending** exit 0. eslint **0 new**
on all 12 touched paths (2 pre-existing `adjacent-overload-signatures` in `window.d.ts`, present at
HEAD). Mutation controls, both restored green: `chosenId` guard disabled → **2 red**; the
`loadOpened` apply line removed → **2 red**.

## 2026-08-24 — the workspace player never mounted the subtitle it was handed

Worker `primary`. Commit `566c6d97`. Probe `debug/g31z-workspace-sub.cjs` (adapted from
`g31y-render.cjs`; `debug/` is gitignored). Renderer-only, so no restart.

**A committed test was green only because vitest reads the working tree.** `4c342b6e` landed
`src/media/__tests__/externalStudyTrackSplit.test.ts` asserting FOUR study seams read a stored
record through `parseStudySubtitles`, and committed three. The fourth — the workspace overlay,
which is the player that is actually *mounted* — stayed in another track's uncommitted work.
Measured in a detached worktree, not the shared tree, which gives the wrong answer both times:

| commit | `externalStudyTrackSplit.test.ts` |
| --- | --- |
| `5155de41` (parent) | **3 failed, 6 passed** — all four overlay markers absent from HEAD |
| `566c6d97` | **9 passed, 0 failed** |

**The product defect under it.** VideoCore learns about subtitles from the container it streams,
so a file whose Japanese track was *fetched* — jimaku, a nyaa release, the harvest panel's attach
— had no track at all in the only surface this profile mounts a `<video>` in. `media:subtitleForPath`
has resolved the right record by path since `09a31e5a` (it routes through `pickPlaybackSubtitle`,
so it honours the library's `preferredSubtitleId`); nothing in the renderer ever asked it. Now the
overlay asks once per file, after an 800 ms grace, and **only when the container found nothing** —
an embedded track outranks a sidecar, re-checked after the awaits because the file's own tracks can
land while this is in flight. Track carries the record's own label; the split's dropped count reaches
the transcript as `media.subStatus.otherScript`, keyed by track number so it cannot be shown against
a track it does not describe.

**LIVE, real library, read-only** (`The Big O - 01`, its real path, the app's own module graph):

| step | number |
| --- | --- |
| `media:subtitleForPath` on the item's path | `…[BDRip 1440x1080 x265 FLAC].ja.srt`, **14,012 chars** |
| `parseStudySubtitles` | **267 cues, 0 dropped**, 0 styles removed — same as the whole parse |
| `whisperCuesToVideoCoreEvents` | **267 events on track 1**, first `ん？` at 38,133 ms for 534 ms |
| negative control, a path the library has never seen | **`null`** — no track fabricated |

**Staging trap, still live.** All three worktree copies are foreign (`VideoCoreStudyOverlay.tsx`
alone is +430 lines: a `media:subtitleSyncOffset` leg and a transcript redesign). Staged as
HEAD+edit blobs by `debug/stage-workspace-external-sub.cjs`, `remainder===HEAD true` on each. That
track's version is a superset of this one; when it lands, resolve in its favour.

**Gate 31 stays 32 of 34** (open: 31, 34), counted from this file's gate tables. What is left is
**not** the render seam any more — it is an acquisition for a title that is on the user's MAL
completed list and whose video they own. That is data-blocked, not effort-blocked.

## 2026-08-24 — the guard that was right exactly once

Worker `primary`. Commit `d16547cc`, continuing `566c6d97` in the same turn.

**The defect the first commit created.** `566c6d97` guards the mount with
`manager.getTracks().length > 0` so a muxed release keeps its own tracks. After this player
mounts *its* track that check is permanently true, and choosing a different record in the
library reopens the SAME file path — so the player kept showing the superseded choice.
`3bc796d1`'s defect, arriving on the mounted player by another route.

`decideExternalSubtitleMount` (`shared/`, pure, 6 tests) holds the rule both guards share:
`container` when a track that is **not ours** exists, `unchanged` when the library resolves
nothing or resolves what is mounted, `mount` otherwise. The effect re-asks on the library's own
`media:changed` broadcast; selection moves only when nothing is selected or the selected track is
the one being replaced, so upstream still outranks a first mount. The superseded track stays in
the picker — it is a real record, and `SubtitleManager` has no removal that would not renumber
what is playing. **Mutation control:** the guard restored to `length > 0` turns exactly **2 red**.

**Two measurements that only a detached worktree can make, and both matter to gate 34.**

1. **This branch is red at HEAD and the shared tree hides it.** Full `npx vitest run` at
   `b1f4e8e6` in a clean worktree: **2 files / 3 tests failed**, 763 files / 10,631 passed —
   `i18n.test.ts` hygiene ×2 and `novelReaderProgressGuard` ×1. The same three fail at the
   parent `5155de41`, so they are **not** this turn's. Cause, checked rather than guessed: the
   33 files the i18n hygiene test lists are dirty in the shared tree (`App.tsx`,
   `NovelsContent.tsx`, `VisualNovelPanel.tsx`, `ReaderCollectionPanel.tsx` all ` M`) — another
   track's uncommitted i18n work. Not CRLF: `App.tsx` is CRLF in *both* trees. Gate 34 must say
   which tree it ran in or the number is meaningless.
2. **The shared tree's one red is the mirror image, and is an artefact of HEAD+edit staging.**
   `architectureBaseline.test.ts` reports `test-only-module: src/shared/externalSubtitleMount.ts`
   because the *working-tree* overlay is the other track's copy and does not carry my import. At
   `d16547cc` the audit reads **"Nothing new", 5 pending, exit 0**, and the test passes 6/6.

**Turn gates.** shared tree: vitest **790 passed / 1 failed (792 files), 10,983 passed**
(the one red is the artefact above); i18n **10,789/10,789** exit 0. detached at `d16547cc`:
architecture **"Nothing new"** exit 0, i18n **10,618/10,618** exit 0, eslint **exit 0** on all
four touched paths, `tsc --noEmit` **0 errors naming any touched file**.

**Gate 31 stays 32 of 34** (open: 31, 34).

## 2026-08-24 — the video for a MAL title was on disk all along, and an OVA files under its season

Worker `primary`. Commit `9dc2b8ca`. Opened on the previous turn's stated next slice (extend the
Route A/B survey) and found that slice was searching the wrong end of the pool.

**The survey's pool ordering is why 213 titles found nothing.** `debug/g31n-routeb.cjs` sorts the
completed list by `totalEpisodes` ascending, and **indices 0–320 are all 1-episode rows** — movies,
OVAs, specials. `sub-pack` and `batch-sidecar` are *series* release shapes, so the walk over 0–213
was structurally incapable of a hit. Re-pointed at the 12-episode block (`from 506`, where eps=12
starts): **19 titles walked, 13 carried a `batch-sidecar`**, first hit on the first title. Not a
data drought — a sampling defect. Reused the existing probe; no new one written.

**The blocker the last four turns called data-blocked is discharged.** Gate 33's own transfer left a
real, complete, MAL-listed video on disk:
`C:\Users\Arseniy\Downloads\jp-study\[project-gxs] Date a Live II - Kurumi Star Festival OVA
[10bit BD 720p] [5ACBBFF2].mkv`, **109,855,988 B**, and **"Date A Live II: Kurumi Star Festival"
(MAL 22961) is row-for-row on the completed list**. Verified independently: The Big O really is
absent from all 1,426 rows (0 hits), and the library really does own only that one anime series
(33 items, 29 of them The Big O). The pairing gate 31 needs is **JoJo Part 5 — MAL 37991 is on the
completed list, and Route B's acquired cues on disk are `[DBD-Raws][JOJO的奇妙冒险 黄金之风][01-39
全集…]`, 88 MB of `.tc_jp.ass`, episodes 01–39.** Same work, so no rig.

**What still stops the attended run, and it is not effort:** qBittorrent is **not running**.
Measured through the product, negative control included: `scraperQbitTest` → `unreachable`,
`connect ECONNREFUSED 127.0.0.1:8080`, **11 ms**, `authMode: apiKey`; `scraperQbitTransfers` → **0
rows**. That is gate 22's contract firing correctly, re-confirmed live.

**A near-miss recorded so nobody re-files it as a defect.** `scraperQbitTest({ qbittorrent: … })`
answers `not-configured`, *"Sending to qBittorrent is turned off."* on a profile whose `enabled` is
`true`. That is **not** a product defect: `ScraperQbitInput`'s field is **`config`**, not
`qbittorrent` (`shared/scraperIpc.ts:196`), so `normalizeQbitInput` validated `undefined` against
`DEFAULT_SCRAPER_QBITTORRENT_SETTINGS` and answered truthfully about a disabled default. Pass
`{ config }` or the probe lies to you.

**The product defect this did find (`9dc2b8ca`).** Both sides measured live: MAL 22961 →
*"Jimaku has no Japanese subtitles filed for this title"*; parent MAL 19163 → **10** Japanese
Netflix CC `.srt` files under Jimaku entry **2823**, `matchedBy: anilist`. An OVA/special/recap is
catalogued under its season, so the derivative dead-ends on a catalogue that covers it.
`harvestParentTitle` (shared, pure) + a retry in `listSubtitleHarvest` that fires only when the
primary found nothing **and** Jimaku answered. The retry passes no id, so the existing
`basis: 'title'` warning names the parent — **no new i18n string**. 36 tests; two mutation controls,
one red each (`': '`→`':'`; `head.length < 4`→`< 1`).

**nyaa has no subtitle route for this title, said honestly with counts**: MAL 19163 → *"Of 5
releases matching it, 2 declare their subtitles muxed into the video … and 3 are neither subtitle
packs nor batches with separately-fetchable files"*; MAL 22961 → 2 matched, 2 neither. So the OVA
cannot serve gate 31's *nyaa* clause; JoJo Part 5 can, and needs one episode's video.

**Gate 31 stays 32 of 34** (open: 31, 34), counted from this file's gate tables. Its remaining leg
is now **one named, sized transfer** — a JoJo Part 5 episode — behind a daemon that is switched off.

## 2026-08-24 — the pipeline downloaded episodes it could never open

Worker `backup`. Commit `45442f2f`. **Gate 31 stays 32 of 34** (open: 31, 34), counted from this
file's gate tables. Product code landed; the render clause did not close, and the reason is new.

**qBittorrent's "blocker" was that nobody had started it.** Started it (`C:\Program Files\
qBittorrent\qbittorrent.exe`), then measured *through the product*, not the daemon:
`scraperQbitTest` → `connected`, version **5.2.3**, **3 ms**, `authMode apiKey`;
`scraperQbitTransfers` → **7 rows**. Previous turn's `unreachable` / ECONNREFUSED was machine state
and is cleared. Do not re-park it: if it reads unreachable again, start the process first.

**THE DEFECT, and it is why the render clause could never have closed.**
`MalDownloadDialog.sendReleases` (`:685-711`) hands the release to `scraperQbitSend` and stops.
Nothing afterwards puts the finished file in the media library. `media:addPaths` — the only
dialog-free entry — ignores anything that is not itself a media file, i.e. every multi-file
torrent. Measured, not reasoned: the gate-33 video completed **2026-08-16** and today the library
held **33 items and not that one**. Four turns treated gate 31 as a *data* problem; it was a
missing product step at the end of the pipeline.

`media:addAcquired` (`main/media.ts`) takes the save path a transfer already reports, walks it with
the existing `collectMediaFilesInDir` so a directory works as well as a file, and reports `found`
and `added` separately — "0 added" means *already there* or *no media at all*, and one number
cannot say which. It cannot start, resume or query a transfer. Surfaced as **Add to library** on
the Torrent Manager transfer inspector, disabled below 100%, strings in `scraper/strings.ts` per
that file's deferred-i18n policy (so `i18n-check` stays 10,789/10,789).

Live, one process, every branch with its negative control:

| input | outcome | found/added |
| --- | --- | --- |
| non-existent path | `missing` | 0 / 0 |
| empty string | `invalid-path` | 0 / 0 |
| `package.json` (real file, not media) | `no-media` | 0 / 0 |
| the OVA, 109,855,988 B | `ok` | **1 / 1** |
| the OVA again | `ok` | 1 / **0** — idempotent |

Library **33 → 34**, titled *"Date a Live II - Kurumi Star Festival OVA"*.

**FINDING — this OVA cannot be gate 31's render pair, and that is measured, not assumed.** MAL
22961's own `altTitles` are **"Date A Live II Episode 11"** / "Date A Live 2 Episode 11". The
parent-title fallback from `9dc2b8ca` works live — jimaku entry **2823**, **10 files** — but they
are **S02E01–E10** only. There is no episode-11 track, so attaching E01 to it would put unrelated
cues on screen. Not done. **Next turn opens on JoJo Part 5**: MAL 37991, 39 `.tc_jp.ass` already on
disk, needing one episode's video named and sized before the transfer.
