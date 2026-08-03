# Phase 10 — Media Hub: identity matching + smart organization (state report)

Tracks `docs/MASTER_PLAN.md` §10. Built 2026-07-24 on `grammarx/phase-1-5`, same
incremental, untracked-files house style as §6 (Unified Search), §7 (Global Media
Provider System) and §8 (Subtitle Provider System).

**Run status: completed.** No usage limit was hit.

## Why this slice

§10 was already substantially built — `MediaHubDashboard`, `MediaHubStoragePanel`, and
20+ `media:*` IPC handlers (ingestion, folder watching, organize/apply, backup,
relationships, storage scan). The hole was one layer down and easy to miss by reading
`shared/mediaHub.ts` alone:

- **"Media Identity Matching — detect Title, Season, Episode, Year, Language,
  Resolution"** had no implementation. Nothing read a local file *name*. §7's
  `mediaIdentity` engine matches provider `MediaDescriptor`s, which local files are not.
- **"Smart Organization"** emitted a flat `${root}/${category}/${title}${ext}`, not
  §10's documented tree (`/Anime/Frieren/Season 1/`, `/Movies/Title (Year)`,
  `/Music/Artist/Album/`).
- `mediaCategory()` was a keyword guess that structurally *cannot* see a movie — a bare
  `Your Name (2016) 1080p.mkv` matched no keyword and fell through to `inbox`.

## What shipped

| File | Role |
| --- | --- |
| `src/shared/mediaFileIdentity.ts` | Release-name parser, local identity resolution, category inference, canonical target paths |
| `src/shared/mediaCategories.ts` | The category taxonomy, extracted to a leaf module to break a cycle |
| `src/shared/__tests__/mediaFileIdentity.test.ts` | 26 tests |
| `src/shared/mediaHub.ts` | `previewMediaOrganization` now delegates to `mediaLibraryTarget`; re-exports the taxonomy |
| `src/shared/types.ts` | `MediaItem.album?` — the middle level of the `/Music/Artist/Album/` tree |
| `src/renderer/components/media/MediaContent.tsx` | `MediaHubSeriesPanel`, mounted inside `MediaHubDashboard` |
| `src/shared/i18n/catalogs/{en,ja,zh,ru}.ts` | 5 new `mediaHub.series.*` keys, all four languages |

**Verification:** 34 tests green across the two media-hub files (26 new); full suite
2052/2053. `node tools/i18n-check.cjs` exit 0 (4303 keys). ESLint clean on all touched
files. `tsc --noEmit` reports zero errors in them (the repo carries ~306 pre-existing
errors in unrelated files, untouched by this phase).

`mediaFileIdentity.ts` and `mediaCategories.ts` are pure, synchronous and deterministic:
no I/O, no clock, no `Math.random`. Callers apply plans; this module never moves a file.

## Roadmap coverage

| §10 roadmap piece | Status | Where / note |
| --- | --- | --- |
| Media Core: universal database, 10 content types | **Finished (pre-existing)** | `MEDIA_CATEGORIES`, `media:*` IPC |
| Ingestion: detect file type | **Finished (pre-existing)** | `classifyMediaKind` |
| Ingestion: identify content | **Finished** | `parseMediaFileName` + `inferMediaCategory` |
| Ingestion: match existing entries, prevent duplicates | **Finished** | `resolveLocalMediaIdentities` — same-slot files become competing `versions`, not silent overwrites |
| Ingestion: rename files, move into folders | **Finished** | `mediaLibraryTarget` computes the canonical leaf; `media:organize` applies |
| Ingestion: manual import, folder watching, auto scan | **Finished (pre-existing)** | `media:addPaths` / `media:setWatchFolder` |
| Identity: Title, Season, Episode, Year, Resolution, Language | **Finished** | `ParsedMediaFile`; also codecs, source tier, release group |
| Identity: match against metadata providers | **Not started** | Needs provider execution — §7's boundary, not §10's |
| Smart Organization tree (`/Anime/…/Season 1/`, `/Movies/Title (Year)`, `/Music/Artist/Album/`) | **Finished** | `mediaLibraryTarget` |
| Media Database — Video: resolution | **Finished** | parsed; not yet persisted onto `MediaItem` |
| Media Database — Video: codec, audio tracks, subtitle tracks | **Partial** | Codecs parsed from the name; track lists need probing (no I/O here) |
| Media Database — Learning: JLPT, vocab, kanji counts | **Finished (pre-existing)** | `MediaItem` fields + §14 |
| Media Search: title, artist, actor, genre, language | **Finished (pre-existing)** | `searchMediaHub` |
| Media Search: vocabulary, subtitle text | **Not started** | Needs a subtitle-text index — §8/§14 territory |
| Media Dashboard shelves | **Finished (pre-existing)** | `buildMediaHubSections` |
| Report missing episodes | **Finished** | `missingBySeason` + `MediaHubSeriesPanel` |
| Media Relationships | **Finished (pre-existing)** | `media:addRelationship` |
| Storage: duplicates, usage, cleanup, missing, backup | **Finished (pre-existing)** | `diagnoseMediaPaths`, `media:scanStorage`, `media:backup` |
| Study OS integration actions | **Finished (pre-existing)** | §13 `mediaStudyIntegration` |

## Design decisions worth remembering

- **The taxonomy moved to its own leaf module.** `mediaHub` needs `mediaLibraryTarget`
  and `mediaFileIdentity` needs `mediaCategory`. Rather than lean on ESM's tolerance for
  cycles, `MediaCategory` / `MEDIA_CATEGORIES` / `mediaCategory` now live in
  `mediaCategories.ts`, re-exported from `mediaHub` so no existing importer changed.
- **Title keys are shared with §7 on purpose.** `parseMediaFileName` folds through
  `normalizeMediaTitleKey`, so "same title" means one thing to the identity engine and
  to the Hub.
- **Episodes are capped at three digits, which makes years unambiguous.** A four-digit
  `19xx`/`20xx` token can only be a year; a guard comparing the two would be dead code,
  so there isn't one. `Show - 2020.mkv` is a year; `Show - 999.mkv` is episode 999.
- **A stored title outranks a parsed one.** `item.title` is user-editable and
  metadata-backed; the parsed key is the fallback for a file nobody has titled. This is
  what lets `SNK.S01E01.mkv` (titled "Attack on Titan") group with
  `Attack.on.Titan.S01E02.mkv`.
- **Same-slot files are versions, not duplicates to resolve.** Ranking is total and
  explicit — resolution, then source tier (Blu-ray > web > HDTV > DVD), then item ID.
  Choosing between them stays a user decision in the storage panel.
- **Anime vs live-action is not decidable from a file name**, and the code says so. The
  hints are keyword matches plus the leading-`[Group]` fansub convention; everything
  else routes to `tv`, the neutral home, rather than guessing `anime`.
- **`/Unsorted` deliberately invents no structure.** An unclassified file keeps its own
  name and sits flat, so nothing is ever filed under a guess.

## Deviations logged during this run

- **`previewMediaOrganization` changed its output layout** from
  `D:/Hub/anime/Show.mp4` to `D:/Hub/Anime/Show/Show.mp4`. This is the roadmap-correct
  tree and the function is only reached through an explicit, previewed user action, but
  it *is* a behavior change; the assertion in `mediaHub.test.ts` was updated to match
  and carries a comment saying why.
- **6 `media.inProgress.*` keys were translated into ja/zh/ru** during this run because
  they were failing the i18n hard gate. A concurrent session added its own translations
  for the same keys mid-run; those were kept and the duplicates removed.

## Known-failing, not caused by this phase

`src/shared/__tests__/osShortcutDefaults.test.ts` fails on
`ctrl+shift+t → reader.toggleTranslation, toolbox.reopenLastTool`.
`reader.toggleTranslation` is an uncommitted addition in `renderer/keyboardShortcuts.ts`
colliding with the committed `toolbox.reopenLastTool` chord. Untouched here.

## Next milestone for §10

Persist parsed evidence onto `MediaItem` (resolution, codec, season/episode) at ingest
time so the Hub stops re-parsing names on every render, and surface `versions` in
`MediaHubStoragePanel` so a duplicate slot can be resolved from the UI.
