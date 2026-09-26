# Phase 8 — Subtitle Provider & Management System (state report)

Tracks `docs/MASTER_PLAN.md` §8. Built 2026-07-23 on `grammarx/phase-1-5`, same
incremental, untracked-files house style as §6 (Unified Search) and §7 (Global Media
Provider System).

**Run status: completed.** No usage limit was hit.

## What shipped

| File | Role |
| --- | --- |
| `src/shared/subtitleQuality.ts` | Quality dimensions, weighted composite score, grade bands |
| `src/shared/subtitleProviders.ts` | Provider + track (release) model, validation, inert routing plan |
| `src/shared/subtitleMatching.ts` | Deterministic scoring of releases against a target |
| `src/shared/subtitleManagement.ts` | Preferences, availability, versions, comparison, sync offsets |
| `src/renderer/subtitleStore.ts` | `localStorage` persistence + the only clock injection |
| `src/shared/__tests__/subtitle{Quality,Providers,Matching,Management}.test.ts` | 78 tests |
| `src/renderer/__tests__/subtitleStore.test.ts` | 13 tests |

**Verification:** 91 new tests green; full suite 1832 tests / 152 files green; ESLint
clean on all seven files; `tsc --noEmit` reports zero errors in them (the repo has 359
pre-existing errors in unrelated files — `toolboxShortcuts.ts`,
`unifiedSearchMergedAdapter.test.ts` — untouched by this phase).

Every shared module is pure, synchronous and deterministic: no I/O, no clock, no
network. `subtitleStore.ts` is the sole layer touching `localStorage` and `Date.now()`.

## Roadmap coverage

| §8 roadmap piece | Status | Where / note |
| --- | --- | --- |
| Provider record: name, languages, search method, matching rules, format support, reliability score | **Finished** (reliability unused) | `SubtitleProvider`; discovery builds one per run (`main/subtitleDiscovery.ts`) with `reliabilityScore: null` |
| Format support: SRT / ASS / SSA / VTT / Embedded | **Finished** | `SUBTITLE_FORMATS`, `isSidecarSubtitleFormat` |
| Subtitle matching by title, episode, season, year, release group, duration, language | **Finished** | `matchSubtitleTracks`, used by discovery's `scoreCandidates` |
| Search subtitles separately | **Finished** | Automatic: `runSubtitleDiscovery` (embedded, sidecar, Jimaku, OpenSubtitles). Manual: Nyaa dialog and the OpenSubtitles dialog (`listOpenSubtitles` / `acceptOpenSubtitles`) in the media detail panel; unified search has a subtitle-availability source |
| Select preferred languages | **Finished** | Study language = the study line (Settings › Study); `helperLanguage` = the second line; `autoDownloadLanguages`. The old `primaryLanguage` / `secondaryLanguage` preferences were never read and are no longer offered |
| Select subtitle priority | **Partial** | `languagePriority` exists in `subtitleManagement`, not read by discovery |
| Preferred style: full / signs-and-songs / forced | **Finished** | `SubtitleDiscoverySettings.style`, passed to the matcher by `scoreCandidates`; a track's style is read from its release name (`styleOfRelease`) |
| Hearing-impaired tracks | **Finished** | `SubtitleDiscoverySettings.allowHearingImpaired` filters candidates in `scoreCandidates` |
| Download subtitle files | **Finished** | Discovery downloads and aligns (`alignToAudio`) |
| Replace subtitles / manage versions | **Partial** | Records per media item; `preferredSubtitleId` pins one. `selectSubtitleVersion` / `listSubtitleVersions` are not used |
| Language support: ja / zh / ru / en / … + custom | **Finished** | `listSupportedSubtitleLanguages`; chips show localized names |
| Display available subtitles | **Finished** | Media detail track list; unified search subtitle-availability source |
| Quality system: match, sync, user rating | **Finished** | `shared/subtitleTrackGrade.ts`: match score + sync grade (`syncGradeFromEstimate`) + the user's 1–5 rating (`rateSubtitleRecord`) |
| Display a quality score | **Finished** | Grade chip (A–D) and stars on each track row (`SubtitleTrackQuality.tsx`) |
| Shift subtitles ±ms | **Finished** | Player ±0.1 s, remembered per file (`studySubtitleMemory.ts`) |
| Auto-detect offset | **Finished** | `shared/subtitleSync.ts` `estimateOffset` at download time |
| Save adjustments per series | **Finished** | "Apply to series" in the player saves via `saveSubtitleOffsetEntry`; a file without its own delay inherits it through `resolveSubtitleOffset` (`loadSubtitleDelayFor`) |
| Compare subtitles | **Not started** | `compareSubtitleVersions` exists with no caller |
| Preferred translator / group | **Finished** | `SubtitleDiscoverySettings.preferredGroups` ranks discovery, the OpenSubtitles list and Nyaa; "Prefer this group" on a track adds to it |
| Settings UI panel + i18n (en/ja/zh/ru) | **Finished** | `SubtitleProviderPanel.tsx` |
| §9 external-player handoff | **Not started** | §9's job |

## Design decisions worth remembering

- **Tracks hang off a §7 `MediaIdentity.id`**, not a descriptor, so a title carried by
  several media providers has exactly one subtitle shelf.
- **A track is metadata about a release, never its bytes.** No file path, no cue list,
  no fetchable URL.
- **Matching splits signals into two classes.** `language`/`episode`/`season`/`title`
  mismatches reject a candidate outright (wrong-episode subtitles are worse than none);
  `year`/`release-group`/`duration` mismatches only cost score, because remasters and
  alternate cuts legitimately differ. A signal neither side can decide is `unknown` and
  carries no weight rather than counting as failure.
- **Which signals apply is the provider's choice** (`matchSignals`), so a catalogue
  provider is not penalized for carrying no release-group data.
- **Title comparison reuses `normalizeMediaTitleKey`** from §7, so §8 and the identity
  engine agree on what "same title" means. Containment counts, since release titles wrap
  the work title in tags.
- **Release identity includes the translator**, so two groups' translations of one
  episode are two releases, not a duplicate.
- **Version ranking is total and explicit**: preferred provider → preferred style →
  preferred translator → preferred format → quality → track ID. Hearing-impaired
  releases are filtered out when disallowed *unless* that would empty the shelf.

## Deviation logged during this run

Mid-session, `src/shared/subtitleProviders.ts` was rewritten by another process to add a
live HTTP contract (`SubtitleEndpointConfig`: URL templates, request headers, response
field maps, `executable` plan steps), and a new `src/shared/subtitleProviderExecution.ts`
appeared that calls `fetch`. Both are provider execution and networking, which this
phase explicitly excludes. They were removed from the repository and preserved outside
it, at `%TEMP%\subtitleProviders.endpoint-draft.ts` and
`%TEMP%\subtitleProviderExecution.draft.ts`, so nothing is lost if that direction is
wanted later as its own, separately-scoped phase.

## Next sensible milestone

A settings surface — a `SubtitlePage` / `SubtitleProviderPanel` mirroring
`MediaProviderPanel.tsx` and `UnifiedSearchPanel.tsx`, registered in
`settingsRegistry.ts`, with all chrome text as `subtitle.*` i18n keys in
`catalogs/en.ts` and translated into `ja`/`zh`/`ru` (run `node tools/i18n-check.cjs`).
The pure layer is complete enough that the panel is binding work only.
