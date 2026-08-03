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
| Provider record: name, languages, search method, matching rules, format support, reliability score | **Finished** | `SubtitleProvider` + `normalizeSubtitleProvidersDocument` |
| Format support: SRT / ASS / SSA / VTT / Embedded | **Finished** | `SUBTITLE_FORMATS`, `isSidecarSubtitleFormat`, `subtitleFormatSupportsStyling` |
| Subtitle matching by title, episode, season, year, release group, duration, language | **Finished** | `matchSubtitleTracks`; per-provider rules, discriminating vs advisory signals |
| Search subtitles separately | **Partial** | `planSubtitleProviders` routes and `matchSubtitleTracks` searches the *local* catalogue; provider-side search execution is out of scope |
| Select preferred languages | **Finished** | `SubtitlePreferences.primaryLanguage` / `secondaryLanguage` |
| Select subtitle priority | **Finished** | `languagePriority` + `resolveSubtitleLanguagePriority` |
| Preferred style: full / signs-and-songs / forced | **Finished** | `SubtitleStyle`, honoured in ranking and matching |
| Download subtitle files | **Not started** | Deliberately excluded — no downloads in this phase |
| Replace subtitles | **Finished** | `selectSubtitleVersion` / `clearSubtitleVersionSelection` (pin per identity+language) |
| Manage subtitle versions | **Finished** | `listSubtitleVersions`, `pickSubtitleVersion`, `planSubtitleSlots` |
| Language support: ja / zh / ko / en / es / fr / de + custom | **Finished** | `BUILT_IN_SUBTITLE_LANGUAGES`, `customLanguages`, `listSupportedSubtitleLanguages` |
| Display available subtitles ("English ✓ Japanese ✓") | **Partial** | `summarizeAvailableSubtitles` produces the data; no UI surface yet |
| Quality system: accuracy, sync, translation, completeness, user rating | **Finished** | `scoreSubtitleQuality`; unrated scores `null`, never a misleading 0 |
| Display a quality score | **Partial** | Score + grade computed; rendering not started |
| Shift subtitles ±ms | **Finished** | `shiftSubtitleOffset` (relative to the inherited effective offset) |
| Auto-detect offset | **Finished** | `detectSubtitleOffset` — median over caller-supplied timing anchors, with spread + confidence. Offline: it reads no files |
| Save adjustments per series | **Finished** | Series → season → episode scope resolution (`resolveSubtitleOffset`) |
| Multiple subtitle versions | **Finished** | Ranked version list per shelf |
| Compare subtitles | **Partial** | `compareSubtitleVersions` diffs *release metadata*; cue-text diff needs file reading, which this phase does not do |
| Preferred translator / group | **Finished** | `preferredTranslators`, ranked ahead of quality |
| Persistence + clock injection | **Finished** | `subtitleStore.ts`, two keys, newer-version refusal, garbage fallback |
| Settings UI panel + i18n (en/ja/zh/ru) | **Not started** | Next milestone — mirror `MediaProviderPanel` / `UnifiedSearchPanel` |
| Provider execution / networking / auth / scraping | **Not started** | Out of scope by instruction and by §8's own boundary |
| §9 external-player handoff (pass subtitle file to VLC/mpv) | **Not started** | §9's job; §8 only decides *which* release |

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
