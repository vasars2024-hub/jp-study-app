# Phase 5 — Reading convergence (Manga/EPUB/PDF)

Opened 2026-07-29, immediately after Phase 4 closed.

Status: **BOTH GATE SLICES PROVEN (2026-07-30).** The canonical model landed and
was then corrected; both retained readers are on it; the Seanime manga
catalogue/provider/chapter path downloads into and opens the retained Study OS
reader; a provider chapter has been OCR'd and mined into a real Anki note end to
end (live proof #6); and the retained novel/EPUB reader has been taken from a
real EPUB through a real dictionary lookup to a real Anki note, bound to the same
model (live proof #7). **Remaining open items are all outside the gate:** a run
against a real third-party provider extension, volumes (modelled but unmapped),
and PDF (no reader exists).

Phase 3 remains active on its own G-PLAY and microphone gates. Phase 5 advances
additively, the same way Phase 4 did.

## Scope, from the plan

> Canonical `ReadingWork` / `ReadingEdition` / volume / chapter /
> page-or-location model; Study OS readers kept, Seanime manga
> catalogue/sources/chapters adopted; both vertical slices from your brief as
> the gate. — `SEANIME_MIGRATION_PLAN.md:620`

The disposition table (line 498) is the specific instruction for the manga
reader: **Merge** — Seanime catalogue/sources/chapters, Study OS reader. EPUB
and novels are **Retain Study OS** (line 499), untouched.

**Open question — RESOLVED by the user, 2026-07-30.** "Both vertical slices from
your brief" was not defined in any document in `docs/migration/`. The reading
proposed here was confirmed as correct: the two slices are **(a) manga** —
Seanime catalogue → chapter → pages → the Study OS reader with OCR → mine a card,
and **(b) novel/EPUB** — the retained Study OS reader → mine a card, bound to the
same canonical model. **PDF is explicitly not part of the gate**: it shares the
page locator but no PDF reader exists to exercise it, and building one is not a
Phase 5 obligation. Both slices are now proven — (a) in live proof #6, (b) in
live proof #7.

## Implemented in this slice

- `shared/readingModel.ts` — the canonical contracts. `ReadingWork` (identity
  independent of how it is read), `ReadingEdition` (one concrete way to read it:
  local EPUB, local image series, provider chapter feed), `ReadingVolume`,
  `ReadingChapter`, `ReadingPage`, `ReadingProgress`.
- **The locator union is the load-bearing piece.** The retained readers address
  content in two incompatible ways — manga/PDF by page index and EPUB/text by
  part plus fraction — and `ReadingLocator` is what lets one progress type serve
  all of them. `locatorKindFor` / `isLocatorValidFor` make the format→locator
  binding explicit, so a page index stored against an EPUB is caught rather than
  silently reopening the reader somewhere meaningless.
- `stripReadingPageSecrets` applies the Phase 4 history rule to pages: a stored
  page keeps its index and dimensions, loses its URL and every header, and is
  marked `refreshRequired`.
- `shared/readingLibraryAdapter.ts` — projects `LibraryItem` + `Progress` onto
  the model in both directions, so a reader moved onto the model can still write
  back the shape the existing library, badges and sync already read. Nothing
  about `LibraryItem` or the on-disk layout changes.
- `main/reading/seanimeManga.ts` — reads an entry, its chapters and a chapter's
  pages from the sidecar and projects them onto the same contracts. Chapter
  pages keep their request headers for exactly the reason stream URLs do: many
  provider CDNs 403 a request without their Referer/User-Agent pair.
- `shared/readingIpc.ts` + `main/reading/index.ts` + preload — the boundary,
  registered in `main.ts`. Catalogue/provider/chapter/page reads and the one
  explicit chapter-download command answer with a `ReadingResult` state instead
  of rejecting, so a reader can tell "sidecar offline" from "this chapter is
  empty". Progress and Seanime preferences remain under their existing owners.

Chapter ordering is by provider `index`, not by printed number: providers
commonly list newest-first, and "7.5" and "Extra" both occur as chapter numbers.

## Correction — the locator union was modelled on a stale comment

The first version of `ReadingLocator` had three arms: `page`, `cfi` and
`offset`. Two of them were wrong, and the load-bearing claim in this document
("EPUB by CFI") was false for this codebase.

Evidence, all of it in Study OS's own source:

- `types.ts` documented `Progress.location` as an "EPUB CFI location string".
  That comment is what the model was written against.
- **No reader has ever produced a CFI.** `NovelReader.tsx` `saveNow` and the
  close-handler write `p:<partIndex>:<fractionWithinPart>`, and `parseLoc`
  reads exactly that back. They are the only two writers of the field in the
  app.
- `bookmarks.ts` names its field `cfi` for the same historical reason and
  stores the same part/fraction string.
- `charOffset` appeared **only** inside `readingModel.ts`. Nothing produced or
  consumed an offset, and `readingLocatorFromProgress` returned `null` for
  every `text` item — so an imported article's position could never round-trip,
  even though the reader was saving one all along.

So the union now describes what the readers actually address:

```ts
type ReadingLocator =
  | { kind: 'page'; index: number }                      // image-series, pdf
  | { kind: 'part'; part: number; fraction: number }      // epub, text
```

`locatorKindFor('epub')` and `locatorKindFor('text')` both return `'part'`,
because both go through the one novel reader, which addresses them identically.
Splitting them would have invented a distinction no reader makes. A `cfi` arm
belongs here only once a reader emits a real one.

This mattered beyond tidiness: a `p:0:0.5` string labelled `{ kind: 'cfi' }`
type-checks and passes `isLocatorValidFor`, so the guard this model exists to
provide was passing on a value it had mis-identified.

`types.ts` now describes the real format, so the stale comment cannot seed the
same error again.

## Both readers are on the model

`readingLibraryAdapter.ts` is no longer test-only, and its **pending entry in
`tools/architecture-baseline.json` is removed** — that entry's own note said to
remove it once a reader imported it.

- `MangaReader.tsx` reads its start page through `readingLocatorFromProgress`
  (via a local `savedPageIndex`) and writes through `progressFromReadingLocator`.
- `NovelReader.tsx` does the same in `saveNow`, in the close-handler, and on
  restore. The adapter declines a legacy bare-number save, which hands that case
  back to the reader's existing legacy branch — the only code that can map one,
  since it needs chapter weights.

**No stored value changes shape.** `progressFromReadingLocator` emits
`p:${part}:${fraction.toFixed(4)}`, byte-for-byte what `saveNow` already wrote;
a test asserts that exact string. What the move adds is a format check on the
way out and a validated projection on the way in.

## Renderer surface and page bytes

- `readingMangaProviders` — installed manga provider extensions
  (`/api/v1/extensions/list/manga-provider`), sorted by display name.
- `readingMangaPageImage` — **the piece that makes a chapter readable.** The
  renderer cannot fetch a provider page: an `<img src>` sends no custom headers
  and `ReadingPage.headers` carries the Referer/User-Agent pair the CDN checks.
  `main/reading/pageImage.ts` fetches it in main and returns a `data:` URL, so
  provider credentials never cross into the renderer.
  - Deliberately **not** routed through Seanime's `/api/v1/image-proxy`: that
    route sits behind `OptionalAuthMiddleware`, so with a server password set it
    needs either the token header (which an `<img>` cannot send) or an HMAC
    query token bound to the path. A direct fetch needs neither.
  - Page URLs come from third-party extension code, so they are untrusted
    input: only `http:`/`https:` are fetchable (`file:`/`data:` would make this
    channel an arbitrary-read primitive), non-image content types are refused
    rather than handed to an `<img>` as a broken data URL, and there is a
    32 MB cap.
- `components/reading/MangaProviderBrowser.tsx`, mounted in `ReadingFinderView`
  — provider → AniList media id → chapters → one page at a time. Read-only, and
  it renders `ReadingBackendState` honestly, so "sidecar offline" and "this
  provider has no chapters for this title" read differently. Pages are fetched
  one at a time with a 6-page cache rather than a chapter at a time: a base64
  chapter held in renderer memory is how a reader becomes the thing that makes
  window dragging lag.

## Live proof #3, and the design reversal it triggered — 2026-07-29

Evidence:
`docs/migration/proof/phase5-reading-ui-20260729/provider-browser-live-ui.json`.

The browser **was** driven end to end in the real app (`npm start`,
`SEANIME_DATADIR` on the isolated profile, `fixture-manga-cdn.mjs` on 18846).
This is the path the harness bypasses — renderer → preload → `ipcMain` → main.
Observed: the provider dropdown, `Berserk ベルセルク` from media id 30002,
`1 Chapter 1 - 第一話` / `2 Chapter 2 - 第二話` in corrected order, and
`Page 1 of 2`. The decisive evidence is the CDN log, since the fixture page is a
1×1 GIF that cannot be seen in a screenshot:

```text
200 /manga/phase5-local-manga$chapter-1$ja/page-1.jpg (42 bytes)
200 /manga/phase5-local-manga$chapter-1$ja/page-2.jpg (42 bytes)
```

The CDN 403s any request without the provider header, so `200` proves the header
survived renderer → preload → main → CDN; a renderer `<img src>` would have
logged 403. `Previous page` issued no new request — the bounded cache served it.

**Then the surface was reviewed and unmounted.** It is removed from
`ReadingFinderView` and recorded as pending debt in
`tools/architecture-baseline.json`. Four things were wrong with it:

1. "AniList manga ID" is a developer input. Nobody knows Berserk is 30002.
2. It contradicted its host view: Reading Finder is level-and-comprehension
   discovery, and the panel had neither.
3. It rendered pages with its own pager, which is **backwards from the plan** —
   line 498 says *Merge: Seanime chapters, **Study OS reader***. With its own
   pager, OCR, dictionary popups, mining and progress do not apply.
4. Nothing led to it and nothing led out of it.

**The blocker behind (3), found while costing the fix.** Feeding provider pages
into `MangaReader` is not a component refactor. The reader treats a page as an
opaque URL (`media://…`) and that part would accept a `data:` URL — but OCR
calls `window.api.mangaOcrScanPage({ itemId, mediaUrl })`, and **main resolves
that to a file inside the library item's directory**. A provider page has no
`itemId` and no file on disk. So the real coupling is a *main-side OCR contract*,
not the 1,933-line component.

That means a provider chapter must become a **real library item on disk** before
the Study OS reader can treat it like anything else — which requires a write
path the Phase 5 boundary deliberately does not have ("no channel writes
progress, downloads a chapter").

**Agreed replacement design (user, 2026-07-29).** Not a standalone panel: an
**aggregation-of-sources popup hung off a manga entry**, ideally the
MyAnimeList/AniList manga page, with a **download** action from the popup. The
host that already exists is Discover (`components/discover/DiscoverContent.tsx`,
Jikan + AniList, with a `DiscoveryInspector` detail surface) — but Discover has
no manga media type today, so that is the first thing to add.

Useful precedent for the popup's shape: `VisualNovelSourcePanel.tsx` already
does source aggregation for visual novels.

`POST /api/v1/manga/anilist/list` (`{ search, page, perPage }`) is the route that
replaces the ID box with a real title search.

## Live proof #2 — provider list and page bytes, 2026-07-29 (later session)

`docs/migration/tools/reading-boundary-harness.mjs` (reusable; `--keep` leaves
the sidecar up). Evidence:
`docs/migration/proof/phase5-reading-live-20260729/provider-and-page-image-live.json`.

It runs the **shipped** modules — `seanimeManga.ts`, `pageImage.ts`,
`seanime/client.ts` — against a real supervised sidecar. Only
`seanime/supervisor.ts` is stubbed, because it imports `electron`; everything
below it is unmodified production code. No Electron, no Anki, no Study OS
userData.

Results:

- `fetchMangaProviders` against the real
  `GET /api/v1/extensions/list/manga-provider`: 2 providers (`local-manga`,
  `phase5-local-manga-proof`), returned in display-name order.
- Chapter feed re-confirmed through the same path: the provider lists chapter 2
  first, the model returns `1@index0, 2@index1`; pages come back `1` then `0`
  and the model returns `0, 1` with `X-Phase5-Proof` intact.
- **`fetchReadingPageImage` fetched a real image over real HTTP** — 42 bytes,
  `image/gif`, and the returned data URL base64-decodes to byte-identical
  content.

**The negative control is the part that matters.** The harness's fake CDN 403s
any request that arrives without the provider header. The same page URL fetched
with `headers: {}` — which is exactly what an `<img src>` in the renderer would
have produced — fails with `HTTP 403`. That is the empirical justification for
putting the fetch in main, rather than an argument for it.

Both guards fired against the real server too: an HTML body was refused
("which is not an image") instead of being handed to an `<img>` as a broken data
URL, and a `file:` URL was refused before any request was issued.

Cleanup was verified: sidecar killed, CDN closed, temp build removed, port
released, Study OS userData untouched.

One incidental fix: port 18846 (hardcoded by the fixture extension) was still
held by a stray `python -m http.server` left running by the 2026-07-28 session.
It served nothing useful — 404 on the fixture paths — and was killed.

## Live proof #1 — the three original channels, 2026-07-29

All three channels were driven through the real preload bridge against a
running sidecar. Evidence:
`docs/migration/proof/phase5-reading-20260729/reading-boundary-live.json`.

- `readingMangaEntry` returned a **real AniList round-trip**, not fixture data:
  mediaId 30002 → Berserk / ベルセルク, MAL id 2, real cover URL.
- `readingMangaChapters` — the provider returned chapter 2 first; the model
  returned 1 then 2. The newest-first reordering is proven live, not only in a
  fixture test.
- `readingMangaChapterPages` — the provider returned page 1 before page 0; the
  model returned 0 then 1, with the request header intact.
- The error path answers with a state and a message rather than rejecting, and
  the sidecar-offline state propagates cleanly.

**A defect was found by this proof and fixed.** `seanime/client.ts` threw on a
non-OK response *before* reading the body, discarding Seanime's `{ error }`
envelope — so "this provider has no chapters" and "this provider does not
exist" both reduced to a bare `HTTP 500`. `errorDetail()` now reads the
envelope, capped, and falls back to the status when the body is not the
envelope. The two cases now read as `HTTP 500: no results found for this media`
and `HTTP 500: manga: Provider not found`. This also improves every Phase 4
acquisition and inventory message, which use the same client.

## Verification — re-run 2026-07-29 after the correction

| Gate | Result |
|---|---|
| full test suite | **264 files / 3,002 tests pass** |
| new/changed reading tests | 18 model+adapter, 16 Seanime manga, 11 page-image |
| i18n check | **exit 0** — 5,279 English keys all present in ja/zh/ru |
| architecture audit | **exit 0**, "nothing new"; pending findings **4 → 3** |
| targeted ESLint | **0 errors** (readers: 0 errors, 9 pre-existing warnings) |
| TypeScript | **278 diagnostics repo-wide — identical to the pre-existing baseline**, so none were added; 0 originate in the new paths |
| Electron main SSR build | **exit 0** |
| preload build | **exit 0** |
| renderer build | **exit 0** |
| media CSS containment | **6,924/6,924 scoped; 0 unscoped; 0 shell `--tw-` tokens** |

Note on the two build commands: Forge injects the entry, so a standalone run
needs it explicitly — `vite build --ssr src/main.ts --config vite.main.config.ts`
and the same shape for preload. Without `--ssr <entry>` the main build fails with
"rollupOptions.input should not be an html file", which is an invocation error,
not a code error. Do not run either while `npm start` is up.

## Live proof #4 — Discover to the retained reader, 2026-07-29

The stalled acceptance run was resumed through the Electron app's own MCP
server, not Windows computer control. The real UI path was:

`Media → Discover → Manga → Berserk → Find sources → Phase 5 Local Manga
Proof → Chapter 1 → Download and read`.

- The popup aggregated both installed providers. One honestly reported
  Seanime's `no results found for this media`; the fixture provider returned two
  chapters in reading order.
- The download crossed renderer → preload → IPC → main → Seanime → the
  header-gated fixture CDN. It committed one normal `manga` `LibraryItem` with
  two pages, `folder: "Manga"` and the canonical work/edition/provider/chapter
  identity.
- The retained `MangaReader` opened at `1 / 2`; its image source was the normal
  local `media://<item>/pages/0001.gif` path. Both page files and the cover were
  present on disk at 42 bytes each.
- The app MCP error log was empty throughout. OCR reported that it could not
  decode the page, which is expected for the fixture's deliberately minimal
  1×1 GIF and is not evidence for the OCR/mining gate.
- The exact fixture library record and directory were removed through
  `window.api.removeItem` after the proof; both were confirmed absent.

One UX defect surfaced: providers can put `Chapter 1` in both the numeric field
and title. The imported reader title repeated it. The download label now
reuses a title that already begins with the number label, with a regression
test.

Post-proof verification:

| Gate | Result |
|---|---|
| focused reading/library suite | **5 files / 64 tests pass** |
| full test suite | **265 files / 3,011 tests pass** |
| i18n check | **exit 0** — 5,298 English keys all present in ja/zh/ru |
| architecture audit | **exit 0**, nothing new; 3 known pending findings |
| targeted ESLint | **0 errors**; 8 pre-existing warnings |
| TypeScript | **278 accepted diagnostics**, 0 in changed integration paths |
| Electron main SSR build | **exit 0; 224 modules transformed** |
| preload build | **exit 0; 4 modules transformed** |
| renderer production build | **exit 0; 4,589 modules transformed** |

## Live proof #5 — library-aware source popup and offline reopen, 2026-07-29

The source popup was reviewed as a user surface, not only as a transport gate.
The first live rendering exposed several scale and recovery problems: every
chapter rendered at once, there was no chapter search or order control, a
provider's raw technical error occupied the card, and a chapter already in the
Library still looked like a download.

The popup now:

- searches chapter number, title, scanlator and language;
- orders newest-first or earliest-first and initially renders at most 60 rows,
  with an explicit 100-row `Show more` step;
- distinguishes an honest empty provider from a technical failure, while
  keeping technical details available in a disclosure;
- counts downloaded chapters and marks them `In Library`;
- opens an existing `LibraryItem` directly with `Read`, without asking Seanime
  for the chapter or downloading its pages again;
- strips a repeated provider title prefix, so number `1` plus title
  `Chapter 1 - 第一話` displays as `Chapter 1 / 第一話`, while the stored reader
  title remains the unambiguous `Berserk — Chapter 1 - 第一話`.

The decisive live check used the same MCP-only Electron path as proof #4.
After the chapter had been imported, the popup reported
`2 providers / 2 chapters / 1 downloaded`, `In Library`, and `Read`. The
Seanime sidecar was then explicitly stopped **before** pressing `Read`.
The retained reader still opened:

```text
Berserk — Chapter 1 - 第一話
media://d1beeb81-9c66-4244-9a38-63dc0d82f12b/pages/0001.gif
natural size: 1 × 1
```

That proves the downloaded-state action is a local-library path, not an
idempotent-looking network retry. The fixture record
`d1beeb81-9c66-4244-9a38-63dc0d82f12b` was then removed through the application
API; its JSON record and item directory were both confirmed absent. The app,
sidecar and fixture CDN process trees were stopped.

The visual review was at 1280×860 in the real app. The dialog remained usable
at that size and the only defect found in the new controls was a doubled focus
ring on the search field. Focus is now drawn once around the composite search
control while still honoring the user's normal/strong/off focus preference.

Final verification after the nullable-result closure found by TypeScript was
fixed:

| Gate | Result |
|---|---|
| full test suite | **266 files / 3,016 tests pass** |
| new presentation/download tests | **2 files / 9 tests pass** |
| i18n check | **exit 0 — 5,311 English keys all present in ja/zh/ru** |
| architecture audit | **exit 0, nothing new; 3 known pending findings** |
| targeted ESLint | **0 errors** |
| TypeScript | **278 accepted diagnostics; 0 in changed paths** |
| Electron main SSR build | **exit 0; 224 modules transformed** |
| preload build | **exit 0; 4 modules transformed** |
| renderer production build | **exit 0; 4,590 modules transformed** |

## Live proof #6 — OCR to a mined card on a readable page, 2026-07-30

This closes the item that was open item 2 below. Evidence:
`docs/migration/proof/phase5-manga-ocr-20260730/` —
`manga-ocr-mine-live.json`, `manga-ocr-fixture-readability.json` and
`reader-ocr-dictionary-mine.png`.

**The blocker was the fixture, not the code.** Proofs #4 and #5 ran on a 1×1
GIF, which is the right fixture for "did the bytes cross the boundary with their
provider header intact" and useless for anything downstream — manga OCR cannot
read one pixel, so "OCR could not decode the page" was an expected non-result
rather than evidence. Two new tools remove that limit:

- `docs/migration/tools/make-manga-fixture-pages.mjs` renders deterministic
  1200×1700 pages with real vertical Japanese dialogue in speech bubbles, using
  an installed Japanese font, and records the drawn lines in a `manifest.json`
  so a proof asserts what OCR read against what was drawn.
- `docs/migration/tools/fixture-manga-cdn.mjs` serves those pages for any
  `page-<n>.<ext>` path while keeping the `X-Phase5-Proof` gate and the 1×1 GIF
  fallback, so the older transport proofs still reproduce unchanged.

**Three fixture properties decide whether the shipped pipeline reads a bubble or
shreds it**, and all three were found offline with
`docs/migration/tools/manga-ocr-harness.mjs` before the app was started:

1. **Column gap must be under 14px of ink separation.** `mergeNearbyRegions`
   merges fragments within 14px, and that merge is what turns a bubble's columns
   into one region. A comfortable gap looked fine to the eye and produced one
   region *per column*, each then classified `sfx` on its aspect ratio and read
   back as a sentence fragment.
2. **Columns must be top-aligned**, not each centred on its own length. A
   staggered pair split into two fragments.
3. **Columns should be equal length.** When the last column overhangs, its
   trailing `。` sits alone past the end of the block and the mask misses it.

A single-column bubble is the pathological case for both 1 and 3, so the fixture
uses two balanced columns per bubble.

The harness itself is worth keeping: it bundles the **shipped**
`src/main/mangaOcr.ts` with only `electron` (`nativeImage` → `sharp`),
`./downloads` (→ the real installed ONNX models), `./library` (→ a temp item
dir) and `./translate` stubbed, so detection and recognition are production code
and the real models with no Electron and no Study OS userData. It turns a
fixture-calibration loop that would have cost a full app start each time into a
few seconds.

**The live run.** Real app, sidecar on the isolated profile, driven through the
app's own debug bridge with real clicks at measured coordinates:

`Media → Discover → Manga → Berserk → Find sources → Phase 5 Local Manga Proof
→ Chapter 1 → Download and read → 猫 → + Add to Anki`.

- The CDN served the two real pages (89,752 and 76,562 bytes) with the provider
  header, having refused the same URL without it moments earlier.
- The retained `MangaReader` opened at `1 / 2` on
  `media://…/pages/0001.png`, natural size **1200×1700** — a normal local
  library item on the normal `media://` path, which is what manga OCR needs
  since it resolves `itemId` + `mediaUrl` to a file inside the item directory.
- **OCR read all five drawn bubbles exactly, across both pages**, every region
  classified `text`, confidences 0.9997–0.9999, no junk regions.
- The dictionary popup returned real JMdict senses for 猫 and the export landed
  note `1785380207727` with `Term 猫 / Reading ねこ /
  Sentence 猫が窓辺で寝ている。` The **Sentence field is the OCR text**, which is
  the single value that ties the whole chain together.
- Two further Adds on the same term were refused and reported `Already in Anki`;
  the deck still held one note.
- Cleanup: note deleted, probe deck removed, deck count 83 → 83, library item
  removed through `window.api.removeItem` with directory and record both
  confirmed absent, and `profiles.json` / `profile-rules.json` / `library.json`
  hash-matched their pre-run backup **checked from PowerShell**, not the Bash
  tool.

**One piece of residue was left behind and could not be removed.** The first
version of `phase5-anki-probe.mjs` armed the probe by adding a temporary
*custom* profile. A custom profile's note type is always derived from its label
(`shared/profiles.ts` `makeCustomProfile` → `JP Study App::Custom::<label>`, and
`main/profiles.ts` `mergeAnkiBinding` resets any stored `modelName` that differs
from it, treating it as a legacy migration), so the run provisioned a new note
type — and **AnkiConnect has no `deleteModel` action**. `JP Study
App::Custom::Phase 5 manga probe (temporary)` therefore remains in the
collection with 0 notes; it needs one manual delete in Anki's *Manage Note
Types*. The tool now redirects `seed-ja-immersion`'s `deckName` instead, leaving
the shipped note type untouched; its arm/disarm round trip was re-verified.

**The run also exposed three translation defects, since fixed.** The reader's
Auto-translate wrote `_ocr/*.tr.en.json` files whose lines were the untouched
Japanese and counted the pages as translated. The first diagnosis of that —
"`translateRun` echoes the source" — was itself wrong and worth recording as a
lesson: the probe passed `from`/`to` where the API takes `source`/`target`, so
`undefined === undefined` hit a same-language short-circuit. The local Qwen3
model translates the fixture sentence correctly in ~800 ms when loaded directly.
What was genuinely broken:

1. `translateText` compared the language pair without validating it, so a
   missing or unknown code returned the source text as a successful translation.
2. The sentence path never applied `isValidCrossLangTranslation`, which the batch
   path always had — a model echo would have passed as a translation.
3. **The one that produced the bogus caches:** `translateMokuroPage` returned the
   page unchanged when no region translated, and `analyzeMangaVolume` cached it
   anyway, so `refreshMangaOcrMeta` counted it as translated. Nothing surfaced
   because `runTranslationBatch` signals a failed item with an empty string.

All three are fixed with tests (`src/main/__tests__/translateGuards.test.ts`,
`src/main/__tests__/mangaOcrTranslateCache.test.ts`), and a partly-failed analyze
now returns a `warning` the reader displays.

## Live proof #7 — the novel/EPUB slice, 2026-07-30

This closes slice (b) and therefore the phase gate. Evidence:
`docs/migration/proof/phase5-novel-20260730/` —
`novel-epub-mine-live.json` and `novel-reader-dictionary-popup.png`.

Run on a **real book from the user's own library**, not a fixture:
`02 クビシメロマンチスト 人間失格・零崎人識`, stored at `p:12:0.6207`. The
sidecar was deliberately **not running** — this slice is entirely Study OS code
and must not depend on Seanime. Driven through the app's own debug bridge.

Path: `Start → Library → the book card → the retained NovelReader → click 無防備
→ dictionary popup → + Add to Anki`.

- The reader opened the real EPUB in vertical-rl Japanese layout and restored its
  position through `readingLocatorFromProgress`, **part 12 preserved**.
- The click-lookup returned real JMdict senses in two languages —
  `defenseless; defenceless; unprotected; vulnerable` (Japanese–English) and the
  Japanese–Russian entry — with reading `むぼうび` and COMMON/PITCH metadata.
- `+ Add to Anki` produced note **1785399659697** on
  `JP Study App::JA Immersion`: `Term 無防備 / Reading むぼうび / Sentence` =
  the exact sentence the word was clicked in
  (`と、言おうと思っていたのだが、しかし、そんな無防備に近い、…毒気を抜かれる。`).
  **The sentence field is what ties the reader to the card**, the same way the OCR
  text did in slice (a).
- A second Add was refused: `Already in Anki`, one note in the deck.
- The write path was confirmed too: after two page turns, closing the reader
  persisted `p:14:0.0000` / `percent 0.03777751998857796` through
  `progressFromReadingLocator` — the exact four-decimal `p:<part>:<frac>` shape,
  part advanced by the two turns.
- Cleanup: note deleted, probe deck removed, 83 → 84 → 83 decks, zero note types
  minted, and `library.json` restored from its pre-run backup so the book's real
  position is back at `p:12:0.6207` — hash-verified from PowerShell.

### The defect this slice found: opening a book destroyed its position

`NovelReader`'s load effect restores `p:<part>:<frac>` asynchronously and its
cleanup wrote the position back **unconditionally**. Torn down before the load
resolved, the cleanup persisted the *initial* refs — `part 0, fraction 0` —
because `part` starts at `0` and `localFracRef` at `0`.

What made it invisible: `curGlobalRef` is seeded from `item.progress.percent`, so
`percent` survived. The reader then reopened at the right *percentage* through its
coarse fallback mapping while the precise locator was gone. Observed live: a book
stored at `p:12:0.6207` read back `p:0:0.0000` with `percent` untouched.

**React.StrictMode tears the first mount down on every mount in development**, so
this fired on *every* open of *every* book. In a production build it needs a real
early close — a large EPUB closed before it finishes loading.

Fixed with a `positionRestoredRef` guard: the cleanup writes nothing until the
stored position has actually been restored into the refs, and the flag resets at
the top of the effect so a book change cannot persist the previous book's part.
`src/renderer/__tests__/novelReaderProgressGuard.test.ts` pins it, and was
verified to fail on the unguarded code.

**A secondary observation, deliberately not filed as a defect.** The restored
within-part fraction is snapped by the paged layout: `applyLocal` computes the
page as `round(lf * (pages - 1))` and rewrites `localFracRef` as
`page / (pages - 1)`, which is exactly `0` when the part occupies a single page at
the current font and viewport. A single-page part genuinely has no sub-position,
so `0.0000` is the only representable value. It is recorded because it explains
why a reopened position can shift slightly (`percent 0.0311 → 0.0282` here), and
so a later session does not read a zeroed fraction as corruption.

**A tooling gap found on the way.** `vitest.config.ts` includes only
`src/renderer/__tests__/**/*.test.ts`, but that directory contains
`externalPlayerPanel.test.tsx` and `mediaTrackingSourcesHistory.test.tsx`.
**Both have never run** — `vitest run` on either path reports "No test files
found". The include glob is root config, which is out of scope here, so the new
regression test uses `createElement` in a `.test.ts` file. Any renderer component
test added as `.test.tsx` in that directory is dead on arrival.

## Verification after live proof #7

| Gate | Result |
|---|---|
| full test suite | **3,200 / 3,200 pass; 294 / 294 files** |
| i18n check | **exit 0** — 5,993 English keys present in ja/zh/ru |
| architecture audit | **exit 0**, nothing new; 3 known pending |
| TypeScript | **288** — identical to the baseline, none added |
| targeted ESLint | **exit 0**; 9 pre-existing warnings in `NovelReader.tsx` |
| Electron main SSR build | exit 0 |
| preload build | exit 0 |
| renderer build | exit 0 |
| media CSS containment | **6,924 / 6,924 scoped; 0 unscoped; 0 shell `--tw-` tokens** |

Run the renderer build **last** — main and preload write into `dist/` and remove
`dist/assets`, which is where the containment check reads the CSS chunks.

## Still open — all outside the phase gate

1. **Still no real third-party provider extension.** The complete UI/IPC/disk
   mechanism is live-proven with the deterministic extension and header-gated
   CDN, but no public provider's quirks have been exercised.
2. Volumes are modelled but unmapped: Seanime's chapter feed is flat, so
   `ReadingChapter.volumeId` is always null today. Local manga volumes are where
   it becomes real.
3. PDF is in `ReadingFormat` and shares the page locator, but no PDF reader
   exists to exercise it. **Confirmed out of gate scope** by the user on
   2026-07-30.
4. The two `.test.tsx` files above still never run; fixing the include glob needs
   the owner of the root config.

The live run recorded above used a **deterministic local fixture** manga
provider (`phase5-local-manga-proof`, installed into the isolated test profile),
the same technique as the Phase 4 stream proof. The sidecar, AniList lookup,
IPC, preload and projections were all real; the chapter/page feed was not.
