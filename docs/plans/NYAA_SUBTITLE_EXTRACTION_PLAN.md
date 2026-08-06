# Plan — subtitles from nyaa entries, surgically extracted

**Status: PLAN ONLY. Nothing here is implemented.**
Author: claude-backup · Drafted 2026-08-06 · Verified against the tree at this date.

Every path and symbol below was checked to exist before being written down. Re-verify
before acting: this repo has four concurrent tracks and ~1,000 uncommitted paths.

---

## 1. The problem this solves

Jimaku covers a lot of anime and not all of it. When it misses, the subtitle a learner
needs usually *does* exist — inside a release on nyaa, either as a soft-subbed MKV track
or as a subtitle-only pack. Today the app cannot reach either.

**The whole difficulty is the word "surgically".** A naive implementation downloads a
1.4 GB episode to obtain a 60 KB `.ass` file. That is unacceptable as a default: it is
slow, it is a wildly disproportionate use of someone's bandwidth, and it makes a
subtitle fetch indistinguishable from piracy of the video itself.

## 2. What already exists (verified)

The pieces are further along than they look. This is an integration job, not a green field.

| Piece | Where | What it already does |
|---|---|---|
| nyaa RSS parsing | `src/main/scraper/torrents.ts` | `parseTorrentFeed` reads `nyaa:infoHash`, `nyaa:seeders`, `nyaa:size`; `buildIndexUrl` builds queries; `magnetFor` builds magnets |
| Release-name intelligence | same file | `parseSubtitleLanguages(name)`, `parseReleaseGroup`, `parseResolution`, `looksLikeBatch` |
| Host rate limiting | `src/main/scraper/safetyPolicy.ts` | per-host policy; `.nyaa.si` suffix matching already covers `sukebei.nyaa.si` |
| **Subtitle extraction from a container** | `src/main/subtitleLocalSources.ts` | `listEmbeddedSubtitleStreams(file)` and `extractEmbeddedSubtitle(file, index)` — ffmpeg, text codecs only, bitmap deliberately excluded |
| Provider registry + priority | `src/shared/subtitleDiscoveryIpc.ts` | `SUBTITLE_PROVIDER_IDS = ['embedded','sidecar','jimaku','opensubtitles']`, `orderedSubtitleProviders`, per-provider enable/priority |
| Provider settings UI | `src/renderer/components/settings/pages/SubtitleProviderPanel.tsx` | reorder, enable, API key, "Test" button |

`extractEmbeddedSubtitle` is the surgical primitive. The gap is only *getting the bytes
to extract from* without fetching the whole file.

## 3. Three acquisition routes, cheapest first

The design principle: **never fetch video bytes to obtain a subtitle.** Each route is a
strictly better deal than the one below it, and the provider tries them in order.

### Route A — subtitle-only torrents (preferred, ~50–500 KB)

Nyaa carries a large number of subtitle-only releases (fansub packs, Kitsunekko mirrors,
group sub packs). These are small enough that a normal torrent fetch is proportionate.

- Filter to entries whose category is a subtitles category **and** whose
  `sizeBytes` is under a hard ceiling (propose 50 MB — a season pack of `.ass` with fonts).
- `parseSubtitleLanguages(name)` already extracts language tags from release names;
  reuse it rather than re-parsing.
- Reject anything over the ceiling here rather than falling through, so a mislabelled
  1 GB entry can never be pulled by this route.

### Route B — selective download from a soft-subbed release

BitTorrent can download a *subset of files* in a multi-file torrent. For a batch release
with sidecar subtitle files, request only those pieces.

- **Feasibility gate before any code:** the app's torrent layer must actually support
  file-selective download. `src/main/scraper/torrents.ts` currently *builds* magnets —
  it does not appear to run a torrent client. **Confirm what performs the download
  before committing to this route.** If nothing does, Route B is a much bigger project
  (embedding a torrent client) and should be dropped from v1.
- Does not help for a single-file MKV with embedded tracks: the subtitle track is
  interleaved across the whole file, so there is no contiguous subset to fetch.

### Route C — the file the user already has (free, and already built)

If the episode is in the library, the subtitle may already be inside it. This route costs
nothing and is pure reuse:

```
listEmbeddedSubtitleStreams(localFilePath) → pick by language → extractEmbeddedSubtitle()
```

This is arguably the highest-value part of the whole plan and the cheapest to ship.
**Check first whether the existing `embedded` provider already covers it** — if it does,
this route is documentation rather than work, and that is a good outcome.

## 4. Proposed shape

Add `'nyaa'` to `SUBTITLE_PROVIDER_IDS`, defaulting **disabled**, at the lowest priority.

```
src/main/subtitleNyaaSource.ts     // search → rank → acquire → hand off
src/shared/subtitleNyaa.ts         // pure: query building, candidate ranking, size gates
src/shared/__tests__/subtitleNyaa.test.ts
```

The pure/impure split matters: ranking candidates is the part with real logic and it must
be testable without network. Follow `videoClip.ts` / `videoClipExtract.ts`, split for
exactly this reason.

**Ranking inputs** (all already parseable from a release name): language match, sub-only
vs batch, seeders, release group against a user preference list, size.

**Output contract:** whatever the provider returns must be indistinguishable downstream
from a Jimaku result — a `SubtitleRecordFormat` payload entering the existing pipeline. If
the nyaa provider needs a special case anywhere downstream, the integration is wrong.

## 5. Dependencies to reconcile (the part that bites)

The dispatch says "integrate with **all** subtitle dependencies". Enumerate before coding:

1. **Discovery/auto-attach** — `SubtitleDiscoverySettings.autoDownloadLanguages` and the
   confidence threshold that decides attach-without-asking. A torrent-sourced subtitle
   should probably never auto-attach at first; it is lower-trust than Jimaku.
2. **The provider panel** — `isNetworkSubtitleProvider()` gates the API-key UI. nyaa needs
   no key, so it must not render a key field. Check that function's shape before adding.
3. **Subtitle records / format** — `SubtitleRecordFormat` accepts `srt|ass|ssa|vtt|lrc`.
   Packs frequently ship fonts and `.idx/.sub` bitmaps: reject bitmaps loudly rather than
   storing something no renderer can read.
4. **The player** — cues reach the study overlay through the same track path Whisper and
   Jimaku use; if Route C or A lands a real file, nothing in the player should change.
5. **Safety policy** — `safetyPolicy.ts` already rate-limits `.nyaa.si`. Verify the
   *search* path routes through it; an unthrottled search loop is how an IP gets banned.
6. **Licence/audit gate** — `docs/migration/tools/license-audit-gate.mjs` is a gate. Any
   new dependency (a torrent client, above all) must clear it.

## 6. Risks, stated plainly

- **Route B may be infeasible** in this codebase without a torrent client. Establish this
  in the first hour, not the third day.
- **Legal/ethical framing.** Fetching a subtitle-only pack is materially different from
  fetching a video, and the design deliberately keeps it that way. This should be
  disabled by default and clearly labelled as fetching from a torrent index.
- **Quality is unverified.** Jimaku is curated; a nyaa pack may be mistimed, machine
  translated, or for a different release's cut. The player already ships subtitle-delay
  controls and drift tracking, which mitigates timing but not translation quality.
- **Naming is chaos.** Release naming is not a standard. The ranker will be wrong
  sometimes; it must degrade to "show the user the candidates" rather than silently
  attaching the wrong file.

## 7. Suggested order

1. Verify Route C is not already covered by the `embedded` provider. *(cheapest, may be free)*
2. Pure module + tests: query building, candidate ranking, size gates. *(no network)*
3. Feasibility spike on Route B. **Decide go/no-go before building anything on it.**
4. Route A behind a disabled-by-default provider entry.
5. Reconcile the six dependencies in §5, each with its own check.
6. Gates: `vitest`, `i18n-check`, `architecture-audit`, `license-audit-gate`.

**Do not start at step 4.** The provider entry is the visible part and the least of the
work; shipping it before §5 produces a feature that looks wired and quietly bypasses the
discovery settings.
