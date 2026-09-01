# Mining unification — plan

Opened 2026-08-16 on a direct user request. Everything in "Current state" below was
re-derived from source that day, with file and line evidence. Nothing here is copied
from another plan's summary.

## Why this exists

The user asked, in their words: download a Japanese **dub** from YouTube, transcribe it,
and mine flashcards from the transcription; download **audio only** for those videos; put
a button in the Chrome extension that transcribes whatever dub is playing right now and
turns it into cards; and stop having "epub mining" be its own thing — rebrand it to plain
**Mining**, with a categorical source picker (video / anime / YouTube / epub / …).

They also asked the question this plan answers first, because it was not answerable from
the UI: *where does mining actually go, for each pipeline?*

## What the user actually asked for — a catalogue, not a rebrand

Clarified 2026-08-16, after a first draft of this plan got it wrong. The rename is a
consequence; **the feature is a finder**.

Mining today is **context-bound**. To mine a YouTube transcript you must navigate back to
that particular video and open its transcript there, then press the button. Nothing anywhere
answers "what have I already transcribed?" or "what do I have that could become cards?" The
epub picker is the only surface that is **catalogue-bound** — you browse the epubs you have
and pick one — which is precisely why it feels like the one that works, and why the user
asked for "the same capabilities as Anki mining and epub analyze" over *everything*.

The target, in the user's framing: something like a notebook's source list, or a file finder
for mineable material — every asset that can produce flashcards, **stored, listed and
automatically sorted**, with one-click mine from the list itself. Media type and provenance
are the sort axes; the user never has to remember where a thing came from to mine it again.

**Why this is cheaper than it looks: the assets already exist on disk, only the index is
missing.**

- YouTube transcripts are already durable files: `main/ytPlaylists.ts:44` defines a
  `yt-transcripts` directory and `:60` writes one `<youtubeId>.json` per video.
- A "has this been transcribed" flag is **already computed** —
  `ytPlaylists.ts:254` sets `v.transcribed = true` when that file exists. It is attached to a
  video row inside a playlist, so it can only be seen by going to the video: exactly the
  context-bound trap above.
- Subtitle sidecars are already enumerated by directory scan for
  `.vtt/.srt/.ass/.ssa` (`ytPlaylists.ts:376`, `:547`).
- Anime harvest subtitles land as their own records via the MAL pipeline; epubs are already
  in the library.

So no new storage is required for the first cut. What is missing is (a) one index that spans
those stores and states each asset's provenance, and (b) a surface over it. Build the index
first and prove it enumerates real assets with real counts; the picker is worthless over an
index that silently misses half the library.

## Current state — four miners, TWO destinations

This is the finding that matters, and it is the opposite of what the surfaces suggest.
It is not "epub mining plus three others that feed it". Three miners already share one
contract, and **epub is the outlier**.

| Module | Source | Builds | Destination |
|---|---|---|---|
| `shared/videoCoreMining.ts` | player cues | `MineNoteRequest` (`buildVideoCoreMineRequest`) | AnkiConnect |
| `shared/lexiconHarvestMining.ts` | anime subtitle harvest | `MineNoteRequest` | AnkiConnect |
| `shared/analysisMining.ts` | extension / sentence analysis | `MineNoteRequest` | AnkiConnect |
| `shared/simpleEpubMining.ts` | epub | `TraditionalMiningConfig` (`buildSimpleEpubConfig`) | deck rows → CSV (`epubDeck.ts`) |

- `MineNoteRequest` is defined in `shared/anki.ts:37` and consumed by `main/anki/index.ts`.
  Its destination is **real Anki desktop over AnkiConnect** — the failure string at
  `shared/anki.ts:9` is "Can't reach Anki. Open Anki desktop and make sure the AnkiConnect
  add-on is installed." So those three push one note at a time into a running Anki.
- The epub path never touches that contract. `simpleEpubMining.ts` builds a
  `'book' | 'dictionary'` filter config and `epubDeck.ts` turns rows into a table
  (`deckRowsToCsv`, `DeckCsvOptions`, `EPUB_CARD_LAYOUT_PRESETS`). That is a **batch export**,
  not a live push. Surface: `renderer/components/EpubMiningSimplePanel.tsx`.
- Separately, the anime harvest flow also writes cards into the app's own deck tagged
  `bookId: 'harvest:…'` (visible in `debug/g32.cjs`'s `verify` step).

So "why doesn't YouTube mining go to epub mining" has a concrete answer: epub mining is a
CSV/table builder and the others are AnkiConnect senders. They were never the same mechanism.

## Gaps — the things the user asked for that DO NOT exist

1. **Choosing which dub to download.** `YouTubeDownloadOptions` (`shared/types.ts:285`) carries
   only `audioOnly`, `subtitleLang`, `subtitleLangs`, `allSubs` — there is **no audio-language
   field** — and `main/media.ts:236` hardcodes `-f ba[ext=m4a]/ba/b`, so yt-dlp takes the
   default audio track. yt-dlp supports language filtering; nothing passes it.
2. **A transcribe button in the extension.** Zero occurrences of `transcri` anywhere in
   `src/main/chrome-extension/`. The extension mines *selections* (`/v1/mine`,
   `mine-selection`, `sentence-analysis-mine`) and can trigger a download
   (`youtubeAudioOnly`, `settings.js:79`), but it cannot transcribe.
3. **Epub on the shared contract.** See the table above.
4. **One Mining surface.** Today: `EpubMiningSimplePanel` for epub, separate surfaces for the rest.

### What already exists and must NOT be rebuilt

- **Audio-only download works** (`-x --audio-format m4a`, `main/media.ts:237`). But note
  `main/media.ts:239`/`:243`: when `audioOnly` is true the subtitle args are deliberately
  **empty**, so an audio-only download carries no text at all. Transcription is therefore
  *mandatory* for that path, not an enhancement.
- **Transcription exists app-side**: `transcription:enqueue` / `:progress` /
  `:chunk-request` (main asks the **renderer** to run Whisper per slice),
  `studyQueueTranscription(mediaId)`, and `ytMarkTranscribed(youtubeId, cuesJson)` →
  `main/ytPlaylists.ts:770` writes the transcript file, called from
  `renderer/components/media/MediaContent.tsx:868`.
- **UNVERIFIED, check before building on it:** whether YouTube → transcript → a mining
  surface is wired end to end, or whether only the two halves exist. The pieces existing is
  not evidence the path works — that assumption is what produced the nyaa embarrassment.

## Design constraints the user agreed to

- **Unify the surface, not the extractors.** A Whisper transcript can be wrong about the
  words themselves, and a card minted from one must be *visibly marked* as transcript-derived.
  Mixing it silently with human subtitles repeats the fusion track's "unrefereed track claimed
  it was checked" defect (`shared/subtitleFusion*`).
- **"Movie" is not a real category.** A movie is a video file. The meaningful axis is text
  **provenance** — human subtitles / auto-captions / Whisper transcript / book text — because
  that is what determines whether a card is trustworthy. The picker should categorise on that,
  with media type as a secondary filter.

## Gates

Every gate names an observable outcome on real data, and reports the NUMBER, not an adjective.
An empty result is a FINDING: say so and stop.

1. `YouTubeDownloadOptions` carries an audio-language field, it reaches the yt-dlp format
   string, and a video with two audio tracks downloads the Japanese one — proven by the
   selected track's language, not by the flag being set.
2. Negative control for gate 1: asking for a language the video does not have fails with a
   named message, not a silent fall back to the default track.
3. An audio-only download of a video with no subtitles produces a transcript with a stated
   cue count, through the existing transcription queue.
4. A card mined from that transcript reaches its destination AND renders as
   transcript-derived; a card from human subtitles on the same surface does not carry that mark.
5. **The index enumerates real assets, with numbers.** One call returns every mineable asset
   across the stores — YouTube transcripts from `yt-transcripts/`, subtitle sidecars, harvested
   anime subtitles, epubs — each carrying its provenance and media type. Report the count per
   category against what is actually on disk. A category returning 0 while files exist for it
   is a FINDING; a category legitimately empty must say so rather than be omitted.
6. **Nothing already transcribed is invisible.** Take a video transcribed earlier, whose
   transcript file exists, and find it in the catalogue **without navigating to that video**.
   This is the whole point of the feature: `ytPlaylists.ts:254` already knows the answer and
   only tells the video row.
7. **One-click mine from the list.** Pick an asset in the catalogue and mine it end to end
   without opening its original context, for at least one asset of each category.
8. **Sorting is derived, not hand-maintained.** The categories come from the asset's own
   provenance, so a newly transcribed video appears in the right group with no extra step.
9. Epub mining produces a `MineNoteRequest` through the shared contract, with the existing
   CSV/table export still working — the batch path is not removed, it gains a second outlet.
10. One Mining surface hosts the catalogue, replacing the epub-only "simple mining" entry
   point without losing any capability it had.
11. The extension button transcribes the audio of the page being watched and returns a cue
   count, with a named refusal when no audio is resolvable. The result lands in the catalogue
   (gate 5), so it is mineable later without returning to the page.
12. Full gates: `npx vitest run`, `node tools/i18n-check.cjs`,
   `node tools/architecture-audit.cjs`, `npx eslint <touched paths>`. `tsc --noEmit` is NOT a
   gate here — 327 pre-existing errors on a clean tree; prove "no new" by set-difference.

## Progress

### 2026-09-01 — gate 5 CLOSES, measured on the real profile

The catalogue half of this plan was absorbed by `FILES_APP_PLAN.md`, so gate 5 was not built
here — it was **measured** here, against the shipped `buildFilesIndex`. The instrument is a
`--mining` mode on the existing gate-1 census (`src/.coordination/files-app/census.ts`), not a
new probe: it reuses the same one `buildFilesIndex` call and filters it with the PRODUCTION
`mineabilityOf`, so a private copy of that predicate cannot make the census agree with itself
and nothing else.

```
npx esbuild src/.coordination/files-app/census.ts --bundle --platform=node \
  --format=cjs --external:better-sqlite3 --outfile=debug/filesapp-census.cjs
node debug/filesapp-census.cjs --mining [--detail] [--dupes]
```

**ONE call, 1,985 rows, 93 mineable, 1,892 refused.** By media type: 20 book, 71 subtitle,
2 transcript. By provenance: 20 `book-text`, 61 `human-subs`, 8 `whisper-transcript`,
4 `unknown`. `auto-captions` is **STATED as empty**, not omitted — the gate asks for exactly
that. Every refusal is NAMED: 1,666 `kindHasNoText`, 143 `notFileBacked`, 83 `mediaHasNoText`;
zero unnamed.

**The control walks the directories itself**, from the gate's own words rather than from the
enumerators, because the index checking its own homework proves nothing — `dictionary` was once
spelt `dictionaries` inside an enumerator and printed a confident, wrong zero. Distinct paths
vs files on disk: yt-transcripts **2 / 2**, harvested anime subtitles **16 / 16**, epubs
**20 / 20**, downloads sidecars **48 / 48**. No category is 0 while files exist for it.

**The instrument was wrong twice before the product was, and both are worth carrying:**
(a) `mineabilityOf` returns `{ mineable }`, not `{ ok }` — reading `.ok` scored **0 of 1,985**
mineable and 93 refusals with `undefined` as their reason, which reads exactly like a dead
feature; (b) matching `\downloads\` as a substring also matched `C:\Users\<user>\Downloads\`,
so a file that exists was reported as a row pointing at a file that is gone. Anchor at the
userData root. A third, smaller one: a `filter(a !== '--mining')` argv guard let `--detail`
become the userData path, and the census walked a directory of that name and printed an
empty report next to a summary claiming a finding.

**KNOWN DEFECT, quantified and NOT fixed here — the next slice.** 54 index rows cover the 48
downloads sidecars: **6 duplicate rows, every one of them the `download` + `media-subtitle`
enumerator pair claiming the same file** (3 videos × `.ja.vtt` + `.en.vtt`, listed by
`node debug/filesapp-census.cjs --dupes`). 6 of 1,985. The Files app therefore shows those six
subtitles twice and any asset count overstates by six. Gate 5's own FAIL condition is "a
category returning 0 while files exist", which does not occur, so it closes — but the count is
recorded as 54/48 rather than rounded to 48.

Gates 6, 7, 8 look substantially built by the same absorption (`shared/filesApp/mining.ts`
carries `mineabilityOf`, `buildFilesMineDrafts`, `deckProvenanceFor` and
`buildFilesMineNoteRequest`); they are NOT claimed here, because none has been measured
against its own words yet. 1 of 12 closed.
