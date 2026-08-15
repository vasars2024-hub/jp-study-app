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

### P2 — MAL sync completeness

- Request the richer field set including `related_anime` (defect 2).
- Expose status filters, `completed` first (defect 3).
- Walk derivatives from `related_anime` and record the relation type.

**Gates.** 6. The full list is fetched with paging followed to the end, and the count matches
the user's real MAL profile. 7. A `completed`-filtered fetch returns only completed entries.
8. For a title with known sequels, the derivatives appear with their relation types. 9. A
`paging.next` that is not a MAL API URL still ends the walk (`malSync.ts:846-874` — assert the
guard, do not merely trust it).

### P3 — the anime/manga library actually receives the list

Write fetched entries into the anime/manga library rather than counting and discarding them
(defect 1), keyed so a later re-sync updates instead of duplicating.

**Gates.** 10. After one sync the library shows the user's real completed titles. 11. A second
sync produces no duplicates. 12. An entry the user updated on MAL reflects the change after a
re-sync. 13. Nothing auto-syncs on a timer — every call still hangs off a button, because a
write to a real MAL list cannot be undone from this side.

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
