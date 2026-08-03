# Slice 71 — YouTube discovery (Phase 8, item 3)

Phase 8's order is *Authenticated MAL sync → secure browser/overlay host → **YouTube &
Avant-Garde discovery** → Chrome-extension parity* (`SEANIME_MIGRATION_PLAN.md:633-636`).
Item 1 landed as slice 69; item 2 is running concurrently as slice 70. This is item 3.

Written as build work, over an injected transport, following slice 69's discipline.

---

## 0. Instrument availability — READ THIS BEFORE BELIEVING ANY NUMBER BELOW

Measured by attempting each command, not assumed. This is the fifth agent on this track to be
blocked this way.

| Command | Result |
|---|---|
| `npx vitest run` | **REFUSED** — "This command requires approval" |
| `npx vitest run <one file>` | **REFUSED** |
| `node node_modules/vitest/vitest.mjs run <one file>` | **REFUSED** |
| `npm test` | **REFUSED** |
| `node tools/i18n-check.cjs` | **REFUSED** (both Bash and PowerShell) |
| `node docs/migration/tools/audit-carried-items.mjs` | **REFUSED** (both shells) |
| `node -e "…"` | **REFUSED** |
| `curl https://www.youtube.com/` | **REFUSED** |
| `yt-dlp --version` | **REFUSED** |
| `Get-Command yt-dlp` | **REFUSED** |
| `Invoke-WebRequest` (Jikan probe) | **REFUSED** |
| `git -C …seanime-upstream rev-parse HEAD` | **REFUSED** (Bash and PowerShell) |
| Read/Grep/Glob under `C:\Users\Arseniy\Projects\seanime-upstream` | **REFUSED** — "Claude requested permissions to read from … but you haven't granted it yet" |
| `npx tsc --noEmit` | **RUNS** (allow-listed) |

Consequences, stated plainly:

1. **I have not run the test suite.** I did not observe the new tests fail before the change and
   I have not observed them pass after it. The tests below are written, not witnessed.
2. **I do not quote the brief's baselines** (370 files / 4706 tests, i18n exit 0, audit exit 0,
   architecture audit "Nothing new") **as my own.** They are the coordinator's numbers.
3. **I could not re-measure network reachability.** Every probe command was refused. Jikan /
   AniList / YouTube connectivity is therefore **unmeasured tonight**; the brief's 504/403
   readings are hours old and I neither confirm nor contradict them. This is exactly why every
   HTTP/subprocess call in this slice goes through an injected transport.
4. **I could not read the pinned upstream checkout.** See §1 — the Avant-Garde verdict is
   therefore reached from repository evidence only, and its limits are stated there.
5. **The upstream pin was not moved.** I could not run `git rev-parse` to verify the SHA, but I
   also never ran a single command that writes to that directory — no fetch, no checkout, no
   config. `docs/migration/upstream-seanime.json:7` still records
   `9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9` and I did not edit that file.

### The one instrument I do have, and its calibration

`npx tsc --noEmit` runs. The root `tsconfig.json` covers files the vitest/vite configs don't, so
the repo has a large pre-existing error population; it is not a pass/fail gate. Used as a
**differential** only:

```
BEFORE (tree as found, nothing written by me):   326 errors
```

(Slice 69 recorded 320 on the same instrument. The tree has moved since — slice 69's own
landing plus slice 70's concurrent edits — so 326, not 320, is this slice's baseline.)

The `AFTER` run and the diff are in §7.

---

## 1. "Avant-Garde" — the verdict

**It is undefined. It should be struck from the plan line or replaced with a definition by the
user. I did not build anything for it.**

### What I could and could not check

The brief said to look in the pinned upstream checkout at
`C:\Users\Arseniy\Projects\seanime-upstream`. **Every read of that directory was refused by the
permission layer** — `Read`, `Grep` and `Glob` all returned "Claude requested permissions to read
from … but you haven't granted it yet", and `git -C` was refused in both shells. So the one
check the brief specifically asked for is the one I could not perform. Everything below is
repository-side evidence.

### Evidence 1 — the term appears five times in the repo, and four are the same sentence

`grep -ri 'avant.?garde'` over the whole working tree returns exactly five hits:

| File:line | What it is |
|---|---|
| `docs/migration/SEANIME_MIGRATION_PLAN.md:634` | the plan line itself |
| `docs/migration/NEXT_SESSION.md:53` | the same line, quoted |
| `docs/migration/SLICE_69_MAL_SYNC.md:4` | the same line, quoted |
| `docs/migration/progress.json:3142` | the same line, quoted |
| `src/shared/mediaDiscovery.ts:164` | **`'avant garde': 3.2,`** |

Four of the five are one sentence quoting itself. The fifth is not a feature — it is an entry in
`GENRE_DIFFICULTY`, the genre → JLPT-difficulty table. **"Avant Garde" is a MyAnimeList genre**
(MAL's 2022 rename of "Dementia"), and this repo already scores it at 3.2 on the 0–4 difficulty
ordinal. It arrives on candidates as a `genres[]` string from Jikan and votes in
`estimateDifficulty`. It is data, not a deferred feature.

### Evidence 2 — the authoritative deferred list does not contain it

`FEATURE_PARITY_LEDGER.md:106-110` is the retirement gate for this migration, and it enumerates
the deferred set verbatim:

> 31 Study-Mode opportunities · §12 YouTube · authenticated MAL sync · secure browser/overlay ·
> Chrome-extension parity · mpv-prism native player.

Phase 8's line is that list minus "31 Study-Mode opportunities", **plus "Avant-Garde"**. Every
other Phase-8 item traces to a ledger row. Avant-Garde traces to nothing.

### Evidence 3 — the YouTube item's requirement source has no such subsection

`FEATURE_PARITY_LEDGER.md:66` pins the YouTube item to MASTER_PLAN §12:

> `| 12 YouTube Content Manager | 15 | add/download exist; search incomplete | Retain Study OS,
> deferred | 8 | No Seanime equivalent. |`

`docs/MASTER_PLAN.md:1348-1459` is §12. It has exactly the 15 subsections the ledger counts
(YouTube Connector System, Content Tracking, Video Metadata System, Transcription Pipeline,
Japanese Learning Analysis, Subtitle System, Playlist Organization, Download Management, Media
Library Integration, **Smart Recommendations**, AI Assistant Integration, **Search**, Japanese
Study OS Connection, Architecture, Content Pipeline). **None of them is "Avant-Garde."**

The ledger also says the whole YouTube row has **"No Seanime equivalent"** — which cuts against
the brief's own hypothesis that Avant-Garde is a Seanime upstream concept riding along with it.

### The verdict, and its limit

Three independent repository sources — the plan's own parity ledger, the requirement document the
ledger points at, and a full-tree grep — agree that nothing in this project defines
"Avant-Garde" as a feature. The only substantive occurrence is a MAL genre string in a
difficulty table.

**Limit, stated honestly:** I could not read the upstream checkout, so I cannot exclude that
Seanime uses the phrase for something. What I *can* say is that even if it does, this repo has
never recorded a requirement for it, the ledger that governs what may not be dropped does not
list it, and the plan line is the only place it has ever been asserted. That is enough to say
it should not be built from the name alone.

**Recommendation:** strike "& Avant-Garde" from `SEANIME_MIGRATION_PLAN.md:634`, or have the user
say what was meant. If the intent was "surface the experimental/art-house end of the catalogue
that the seasonal/top/airing feeds never reach", that is a real and small feature — the four
`DISCOVERY_FEEDS` (`seasonal`, `airing`, `top`, `upcoming`) genuinely cannot reach a genre today,
and `'avant garde'` is already in the difficulty table waiting for it — but that is a *guess at
intent*, and this slice does not act on a guess.

(I have not edited `SEANIME_MIGRATION_PLAN.md`. The coordinator owns the plan documents.)

---

## 2. What the real deliverable actually is

With Avant-Garde struck, item 3 reduces to MASTER_PLAN §12's two unimplemented subsections, which
are exactly the ledger's "search incomplete":

- **§12 Search** — "Universal search across YouTube videos … Search by: Title, Transcript text,
  Vocabulary, Channel, Topic."
- **§12 Smart Recommendations** — "Recommend content based on: Learning level, Watched videos,
  Saved vocabulary, Interests, Study goals."

The app today can *manage playlists you already know about* (`src/main/ytPlaylists.ts`) and
cannot *find* anything. That is the gap this slice closes.

---

## 3. No API key — and why yt-dlp is the better answer, not just the cheaper one

**No key is required, and none is committed, because the feature never asks for one.**

The obvious route is the YouTube Data API. It was rejected on a technical ground, not a
convenience one:

| What discovery needs | Data API v3 | yt-dlp |
|---|---|---|
| Search results | `search.list`, key + 100 quota units per call | `ytsearchN:` — no key |
| Channel uploads | `playlistItems.list`, key | `<channel>/videos` — no key |
| **Does a caption track exist and is it author-written or ASR?** | `captions.list` — requires **OAuth as the video's owner**. A third party cannot read it at all. | `subtitles` vs `automatic_captions` in one `-J` extraction — no auth |
| Declared audio language | `videos.list` `defaultAudioLanguage` | `language` + per-format `language` |

The caption row is decisive. The single most valuable signal in this whole feature — real
captions versus auto-generated — **is not obtainable through the Data API by anyone except the
uploader.** A key would cost a billing account and a quota and still not answer the question.
yt-dlp answers it unauthenticated, and this app already depends on yt-dlp for downloading, so
discovery adds a code path, not a dependency.

### The not-configured state

Because there is no key, "not configured" means "yt-dlp is not on PATH", and it is a first-class
state rather than an error string:

- `YoutubeFetchState = 'ready' | 'empty' | 'tool-missing' | 'error'`
  (`src/shared/youtubeDiscovery.ts`).
- `tool-missing` is decided by `locateYtDlp()` **before the transport is touched**, so it never
  depends on pattern-matching an error message and costs no process spawn.
- The console renders `ytDiscovery.state.toolMissing`, which names the tool, says it is the same
  one the downloader already uses, and states explicitly that no API key is required.

The distinction matters because "install yt-dlp" and "check your connection" are different
instructions, and a renderer sniffing an error string cannot reliably tell them apart.

---

## 4. The study signals — what is obtainable, and what was rejected

### Obtainable, and implemented

| Signal | Where it comes from | Cost |
|---|---|---|
| **Author-written captions vs ASR** | `subtitles` vs `automatic_captions` — two separate top-level keys in one `yt-dlp -J` | 1 extraction per video (explicit) |
| Author-caption **languages** | keys of `subtitles`, reduced to their primary subtag | free with the above |
| **Audio language** | `language`, plus per-audio-format `language` for multi-audio uploads | free with the above |
| **Duration band** | `duration` from the flat search payload | free — one call for the whole page |
| **Live / upcoming** | `live_status` | free |
| **Japanese script share of title+description** | pure function over strings already in hand | free, no request |
| **Channel consistency** | computed *across the result set* — how many of a channel's probed videos carry real target captions | free, no request |
| **Speech pace** | characters of target script per minute of captioned time, from a fetched caption file | 1 subtitle fetch, via the existing `yt:fetchSubsOnly` |

Three of these have a subtlety that is the difference between a signal and a lie:

1. **`subtitles.live_chat`.** Every past livestream carries one. The obvious check — "does
   `subtitles` have any keys?" — therefore reports *author-written captions* for a three-hour
   unsubtitled stream. It is excluded by name and pinned by a test.
2. **Human vs auto is decided by the container, never by the language key.** yt-dlp's
   auto-caption keys have changed shape more than once (`ja`, `ja-en`, `-orig` suffixes); any
   rule that parses the key rots on the next release. Which of the two objects the track sits
   under is stable and is the actual fact.
3. **Pace divides by captioned time, not video length,** and merges overlapping cues first.
   Rolling auto-captions overlap, so a naive sum of cue durations can exceed the video's own
   length; and a 20-minute video with four minutes of talking is a fast talker with long
   silences, not slow speech. Getting either wrong recommends unfollowable material to a
   beginner.

### Rejected as unavailable — an honest short list

| Signal | Why not |
|---|---|
| **Vocabulary / kanji / JLPT level of the actual dialogue** | Needs the transcript text, which needs a caption *download* per video. Discovery must not download; this belongs after the hand-off, where the app's existing tokenizer and readiness engine already do it properly. |
| **Speech pace at search time** | Same reason — the `-J` payload carries caption *URLs*, not caption *content*. Pace is therefore `unknown` on every search row and only becomes real after the user explicitly adds a video and fetches its captions. The console says "Not measured", never "slow". |
| **Whether auto-captions are accurate** | YouTube publishes no confidence score. A comparison against a real transcript would need both, which by definition does not exist when only ASR is present. |
| **Caption *quality* for author-written tracks** | An uploaded track can still be a machine translation someone pasted in. Nothing in the metadata distinguishes that. Not claimed. |
| **Speaker count / dialogue vs monologue** | Would need the caption content and speaker tags YouTube does not emit. |
| **"Is this graded/learner-directed content?"** | No metadata field expresses it. Genre-style `categories` are far too coarse (`Education` covers a physics lecture and a JLPT N5 drill). Deliberately not guessed at from the title. |
| **Regional / age availability** | `yt-dlp` reports it inconsistently without a full extraction per video and it does not affect study value. |

The calibration of the pace bands (`< 240` slow, `> 420` fast, in target-script characters per
minute) is **reasoned from mora rate, not fitted to a labelled corpus.** That is stated in the
module, in the test file, and in the UI note. It is the weakest number in this slice.

---

## 5. Nothing downloads — enforced, not merely intended

Every yt-dlp invocation this feature builds passes through `assertMetadataOnly()`
(`src/main/youtubeDiscovery.ts`), which **throws** if the argument list contains `-o`,
`--output`, `--paths`, `-P`, `--write-subs`, `--write-auto-subs`, `--all-subs`, or if it carries
neither `--skip-download` nor `--flat-playlist`.

It throws rather than stripping the flag: a caller that asked for a download here has a bug, and
silently fixing it would make the bug harder to find, not less real. "Discovery must not
download" is exactly the kind of invariant that survives review and then dies to a one-line
argument change six months later, so it is checked at the call site instead of trusted.

`--no-playlist` on the probe is load-bearing for the same reason: a watch URL carrying a `list=`
parameter expands into the whole playlist without it, turning a one-video probe into a
two-hundred-video extraction. The shortlist store also **rebuilds** a stored watch URL from the
video id on read, so a stale `list=` parameter from an older build cannot ride into the hand-off.

The one thing that does reach out per video — the probe — is user-initiated, one video per
click, and there is deliberately no "probe everything" button: that would be N sequential
extractions from one keypress.

---

## 6. What was built, and what imports it

**Every new module has a non-test importer.** Slice 69 shipped a fully-tested `MalSyncPanel.tsx`
that nothing imported, so this is checked explicitly.

| New module | Imported by |
|---|---|
| `src/shared/youtubeDiscovery.ts` | `src/main/youtubeDiscovery.ts`, `src/renderer/discoveryShortlistStore.ts`, `src/renderer/components/discover/YoutubeDiscoveryPanel.tsx`, `src/preload.ts` (type), `src/renderer/window.d.ts` (type) |
| `src/main/youtubeDiscovery.ts` | `src/main/ytPlaylists.ts:41` → `registerYoutubeDiscoveryIpc()` called from `registerYtPlaylistsIpc()` |
| `src/renderer/components/discover/YoutubeDiscoveryPanel.tsx` | `src/renderer/components/discover/DiscoverContent.tsx:49` |

**Reachability, end to end:**

- Main: `src/main.ts:1372` `registerYtPlaylistsIpc()` → `registerYoutubeDiscoveryIpc()`. `main.ts`
  was **not edited** — slice 70 owns it this hour — so the discovery IPC is registered from
  inside the module that already owns the yt-dlp plumbing. One wiring point, not two.
- Renderer: the YouTube console is a **third tab** on the existing discovery panels rather than a
  new page. All three hosts — `scraper/pages/DiscoverPage.tsx`, `blanc/BlancLibraryPanels.tsx`
  and `views/MediaCenterView.tsx` — compose exactly `<DiscoveryControls>`, `<DiscoveryTabs>`,
  `<DiscoveryResults>`, `<DiscoveryInspector>`, so **all three get the feature with zero edits to
  any of them.**

### Files changed

| File | Change |
|---|---|
| `src/shared/youtubeDiscovery.ts` | **new** — model, signals, scoring, yt-dlp payload parsing, IPC wire types |
| `src/main/youtubeDiscovery.ts` | **new** — injected transport, argument construction, metadata-only guard, IPC |
| `src/renderer/components/discover/YoutubeDiscoveryPanel.tsx` | **new** — hook + three panels |
| `src/shared/__tests__/youtubeDiscovery.test.ts` | **new** — 40 assertions over the pure model |
| `src/main/__tests__/youtubeDiscovery.test.ts` | **new** — the transport, over spies |
| `src/renderer/__tests__/youtubeDiscoveryShortlist.test.ts` | **new** — the widened shortlist |
| `src/main/ytPlaylists.ts` | registers discovery IPC; adds `yt:addVideoByUrl` and `yt:cachedCaptionText` |
| `src/renderer/discoveryShortlistStore.ts` | accepts `youtube` alongside `jikan`/`anilist`; narrowing readers |
| `src/renderer/components/discover/DiscoverContent.tsx` | third tab; delegates to the YouTube panel |
| `src/preload.ts`, `src/renderer/window.d.ts` | five new IPC surfaces |
| `src/shared/i18n/catalogs/{en,ja,zh,ru}.ts` | 73 `ytDiscovery.*` keys + `scraper.tab.youtube`, in all four |

`src/preload.ts` and `src/renderer/window.d.ts` are outside the brief's stated ownership list but
are not on its do-not-touch list, and a renderer feature cannot be wired without them. Both edits
are purely additive and adjacent, to keep the conflict surface with slice 70 minimal.

### The shortlist widening, and why it did not break three view files

`DiscoveryShortlistEntry.candidate` is now a discriminated union
(`DiscoveryCandidate | YoutubeDiscoveryCandidate`) over **one** storage key — to the user it is
one shortlist. But `DiscoverPage.tsx` reads `.episodeCount`, `.posterUrl` and `.chapterCount` off
those entries, so widening the type naively would have broken three files this slice does not
own. Instead the store exposes narrowing readers — `loadMediaShortlist()` and
`loadYoutubeShortlist()` — and `useDiscovery`'s `shortlist` field keeps its old narrow type. No
consumer has to type-test a candidate it was never going to render.

---

## 7. Gates — what was run, and what was refused

### Refused (see §0)

`npx vitest run` (whole suite and single file), `npm test`, `node tools/i18n-check.cjs`,
`node docs/migration/tools/audit-carried-items.mjs`, **`node tools/architecture-audit.cjs`**,
and `npx eslint`. All refused by the permission layer in both Bash and PowerShell.

**Therefore: I have not observed a single test run, red or green. There is no before/after test
count in this document that I measured.** The brief's baselines (370 files / 4706 tests, i18n
exit 0, audit exit 0, architecture audit "Nothing new") are the coordinator's and are not
restated as mine.

### The architecture audit, done by hand

The audit was refused, so its nine checks were performed manually against
`tools/architecture-audit.cjs`'s own documented rules:

| Check | Result |
|---|---|
| `orphan-module` | **clean** — all three new modules have non-test importers (table above) |
| `test-only-module` | **clean** — none |
| `layer-violation` | **clean** — `shared/youtubeDiscovery.ts` imports only `shared/mediaDiscovery`; `main/youtubeDiscovery.ts` imports only electron, `main/media`, `shared/`. **This was a real finding and was fixed:** `preload.ts` and `renderer/window.d.ts` originally named types from `main/youtubeDiscovery`, i.e. a renderer→main reach. `YoutubeFetchState`, `YoutubeSearchResult` and `YoutubeProbeResult` were moved into `shared/` and both sites repointed. |
| `shared-cycle` | **clean** — `shared/youtubeDiscovery` → `shared/mediaDiscovery` is one-way |
| `dead-ipc` | **clean** — all five new handlers have a preload caller |
| `phantom-ipc` | **clean** — all five preload invokes have a handler |
| `duplicate-ipc` | **clean** — `ytDiscovery:search|channel|probe`, `yt:addVideoByUrl`, `yt:cachedCaptionText` each registered exactly once (grepped) |
| `duplicate-storage` | **clean** — `jp-youtube-discovery-prefs-v1` written by one module; the shortlist key keeps its single writer |
| `duplicate-export` | **clean.** **This was a real finding and was fixed:** `YoutubeDiscoveryState` was exported from both `main/youtubeDiscovery.ts` (a load-state union) and the renderer panel (a hook interface). The main one was renamed `YoutubeFetchState` and moved to `shared/`. Every other new export name was grepped across `src/` and is unique. |

A hand audit is weaker than the tool. Run `node tools/architecture-audit.cjs` before trusting it.

### i18n — verified by inspection, since the checker was refused

- 73 `ytDiscovery.*` keys plus `scraper.tab.youtube` added to **all four** catalogs.
- The sorted, deduplicated key lists extracted from `en.ts`, `ja.ts`, `zh.ts` and `ru.ts` are
  **identical** (verified by `grep -o … | sort -u` on each and comparing).
- Every static key the panel calls exists in `en.ts` (verified the same way); the dynamically
  built keys (`ytDiscovery.mode.*`, `.audio.*`, `.pace.*`, `.notice.*`) are all present too.
- **Plurals are the object form, never a raw ICU string.** Two plural keys —
  `ytDiscovery.channel.consistent` and `.mixed` — carry `{one, other}` in en, `{other}` in ja/zh,
  and `{one, few, many, other}` in ru. The plural selector is `vars.count`, so the *probed sample*
  is passed as `count` (not the caption hits), or Russian would inflect on the wrong number.
- No study content is translated: video titles, channel names and caption language tags (`ja`,
  `en`) are rendered verbatim.
- No `useMemo`/`useCallback` in the new panel builds strings with `t()`; the one memo present
  sorts only, and every label is resolved through `t()` in JSX, mirroring the existing
  `DiscoveryInspector`. No dependency array contains `t`.

### `npx tsc --noEmit` — the one instrument that runs

```
BEFORE (tree as found):   326 errors
AFTER  (this slice):      327 errors
DELTA:                    +1
```

The single new error is:

```
src/main/__tests__/youtubeDiscovery.test.ts(40,5): error TS1378: Top-level 'await' expressions
are only allowed when the 'module' option is set to …
```

**TS1378 is a pre-existing repo-wide artifact of the root `tsconfig.json`, which vitest does not
use.** The baseline already contains **62** instances of it, in every main-process test that uses
this repo's standard `vi.mock(...)` + `await import(...)` idiom — including
`src/main/__tests__/downloads.test.ts:33`, which has shipped for a long time. My test adds a
63rd instance of an established pattern; it is not a new class of error. No error in the AFTER
run names any of the non-test files this slice touched.

---

## 8. Known limits

1. **No test was observed to run.** Everything above about behaviour is derived from the code and
   from `tsc`, not from a green suite.
2. **Network reachability was not re-measured** — every probe command was refused. Whether Jikan,
   AniList or YouTube answer from this machine tonight is unknown to me.
3. **The upstream checkout could not be read**, so the Avant-Garde verdict rests on repository
   evidence alone (§1).
4. **Pace is `unknown` on every search row** by design, and only becomes a number after the user
   explicitly hands a video to the playlist manager and fetches its captions. The pure function
   and its tests are complete; the data path is two explicit clicks.
5. **The pace bands are not corpus-fitted** (§4).
6. **yt-dlp's exact payload shape is asserted from fixtures I wrote**, not from a captured live
   run. The tests prove the parser handles that shape; they do not prove yt-dlp emits it. The
   highest-risk assumption is the `subtitles` / `automatic_captions` split, which is
   long-standing and load-bearing enough that a change would be noticed immediately — but it is
   an assumption, and one live `yt-dlp -J --skip-download <url>` would settle it.
7. **No CSS was added** — `styles.css` and the theme files are off-limits this hour. The YouTube
   table reuses `.disc-row`'s existing fixed eight-column grid, which is why the caption verdict
   is split across a narrow language badge and a short text column rather than one wide chip.
   It is functional and accessible (the verdict is text, never colour alone) but it is laid out
   around a constraint, and deserves a proper column set when the styles open up.
