# Media Center revamp — integration and gap audit

Date: 2026-07-26

## Outcome

Music, video, discovery, study tooling, and the local media library now share one
persistent Media Center shell. The former desktop entries still open at their expected
destination, but they no longer present themselves as unrelated applications:

- Media Player opens the Library tab.
- Video Player opens the Video tab.
- Music opens the Music tab.
- The persistent navigation, global player, search, status, and settings surfaces remain
  available while moving between them.

No media capability was intentionally removed. The redesigned surfaces compose the
existing playback, library, metadata, discovery, subtitle, transcription, lyrics,
tracking, and study components rather than duplicating their business logic.

## Phase 1 — feature audit

| Area | Completed and integrated | Partial / planned dependencies |
| --- | --- | --- |
| Local library | File and folder import, watch folders, grid/list views, virtualized lists, search, sort, categories, collections, favourites, study queue, progress, removal, detail inspector, local artwork | Persist parsed resolution/codec evidence; expose version resolution; subtitle-text/vocabulary index |
| Metadata and discovery | Jikan/MAL and AniList search/browse, poster artwork, ranking, JLPT fit, shortlist, detail inspector, tracking/settings entry points | Provider identity execution during ingestion; clearer offline/cache age states |
| Video | Native file picker, queue, subtitles, dual subtitles, lookup, furigana, auto-pause, loop, dictation, shadowing, Whisper generation, YouTube, PiP/fullscreen, frame step, A–B loop, audio track selection, normalization, diagnostics | Probe and persist audio/subtitle track inventories; richer file-open history |
| Music | Shared queue/player bus, cross-window sync, virtualized library, folder view, search, sort, favourites, LRCLIB/live lyrics, LRC import, word lookup, YouTube audio, persistent player | Queue editing and saved named queues; embedded artwork/metadata editor |
| Detachable playback | Full music window, mini-player widget, detached video window, synchronized transport | User-resizable compact layouts and remembered per-window placement presets |
| Study Mode | Media handoff, subtitle sentence review, seek, difficulty analysis, vocabulary mining, flashcards, assistant, profiles, dictation and shadowing controls | Cross-title subtitle/vocabulary search; session plans and review-history visualizations |
| Tracking | MAL/AniList identities, rating/progress surfaces, calendar/dashboard and source managers | Conflict-resolution inbox and clearer last-sync/error telemetry |
| Organization/storage | File identity parsing, duplicate/version grouping, canonical organization preview/apply, missing episode detection, relationships, diagnostics and backup | Version-selection UI; ingest-time persistence of parsed technical fields |

## Dependencies and implementation order

1. Preserve the shared data and playback contracts (`MediaItem`, `useMedia`,
   `playerBus`, tracking and study events).
2. Introduce the persistent shell and route the three legacy launch points into it.
3. Compose the existing Library, Video, Music, Discover, and Study surfaces in that
   shell before changing their workflows.
4. Add cross-surface handoffs: Library/Home to video or audio playback, media to Study
   Mode, Discover to shortlist/tracking, and persistent playback across every tab.
5. Add complete planned-feature affordances and deep links into advanced settings.
6. Add responsive layouts and detached-window sizing.
7. Validate live provider results, local artwork, navigation, settings, and player state;
   only then classify the remaining non-functional capabilities as gaps.

This order prevents a visual redesign from forking playback state or bypassing the
existing media database.

## Phase 2–6 — implemented UI architecture

### Persistent application shell

- A labelled primary sidebar establishes obvious homes for Home, Library, Video, Music,
  Study Mode, Discover, and Media Settings.
- A contextual top bar provides breadcrumbs, search, add-media, and settings access.
- A single bottom player exposes artwork, title, transport, seek, volume, queue access,
  and mini-player detachment from every section.
- Legacy desktop shortcuts retain familiar entry behavior through tab-specific initial
  routes.

### Home and Library

- Home combines a real-artwork hero, library/runtime/study metrics, continue and recent
  shelves, a study queue, and metadata/tracking status.
- Library retains its full sub-navigation, import actions, categories, collections,
  grid/list toggle, search/sort, poster artwork, progress, and item inspector.
- Audio items start the shared music player; video items start the video surface.

### Video

- A focused file-selection state clearly offers file, folder, subtitles,
  transcription, and YouTube entry paths.
- The existing language-learning player remains the playback authority.
- Learning controls, subtitle/transcription management, metadata/tracking context, and
  an Up Next shelf are organized around the stage.

### Music

- The library, karaoke/lyrics player, and real playback queue form a three-pane
  listening room.
- Sort, liked-only, album-aware search, folder organization, YouTube audio, transport,
  repeat/shuffle, lookup, and lyric import remain accessible.
- Full-player and mini-player detach actions are first-class controls.

### Study Mode

- Study Mode has its own hero, readiness/session/vocabulary metrics, study queue, and
  learning-tool overview.
- Existing subtitle review, difficulty analysis, mining, flashcard, assistant,
  transcription, seeking, dictation, and shadowing workflows remain functional.

### Discover and Settings

- Discover shows live poster-rich recommendations ranked for the selected JLPT level,
  alongside the existing feed controls, shortlist, results table, and inspector.
- Jikan remains the primary browse source; AniList is the fallback when a current or
  seasonal feed is unavailable.
- Global Discover search now submits to the real provider search instead of acting as a
  decorative field.
- Six Media Settings groups cover playback, subtitles/learning, files, sources/tracking,
  study workflow, and detached windows, with links to the existing advanced managers.

## Phase 7 — gap analysis (do not implement in this revamp)

| Gap | Why it is needed | UI home already established |
| --- | --- | --- |
| Subtitle and vocabulary full-text index | Learners need to find every occurrence of a word across a library without opening titles one by one. | Study Mode search/results area; Library global search scope |
| Provider-assisted identity at ingestion | Automatic matching should connect new files to canonical series, posters, episode counts, and tracking with less manual correction. | Library item inspector and Sources & tracking settings |
| Persisted technical probe data | Resolution, codecs, language, audio tracks, and subtitle tracks should be reliable even when filenames omit them. | Library inspector and Video learning inspector |
| Version-resolution UI | Multiple encodes of one episode are correctly detected but cannot yet be chosen/merged from the redesigned library. | Library item inspector and storage manager |
| Tracking conflict inbox | MAL/AniList/local progress can disagree; silent last-write behavior is not a polished sync experience. | Media Settings → Sources & tracking |
| Editable playback queue and named queues | The music queue is real but users cannot reorder it or save a listening/study sequence. | Music → Up Next pane |
| Rich offline/cache state | Provider outages should show cached age, retry timing, and source-specific status rather than a generic empty/error state. | Discover provider chips and Media Settings |
| Remembered detached-window layouts | Detachment works, but compact size/position presets would make repeated desktop use feel finished. | Media Settings → Windows & mini-player |

## Continuation refinement pass

- Added more than 230 Media Center catalogue entries in English, Japanese, Simplified
  Chinese, and Russian, covering the shell, Home, Video, Music, Study, Discover,
  Settings, player controls, empty states, summaries, and tooltips.
- Verified live language switching in the running Electron app for all four languages.
- Added deterministic title-based poster fallbacks for failed or missing MAL/AniList
  artwork.
- Preserved the complete music library and track-selection workflow at compact window
  widths; the compact page now scrolls instead of hiding the library.
- Added an automated integration contract covering legacy launch routing, all primary
  destinations, the real playback queue, compact music behavior, localization parity,
  poster fallback wiring, and the narrow production artwork CSP.

## Final reference audit

The reference is used as a quality bar for hierarchy, spacing, simplicity, persistent
navigation, poster-forward media browsing, a focused player, and a right-side queue—not
as a restriction on Study OS functionality.

| Category | Score | Concise justification |
| --- | ---: | --- |
| Application cohesion | 9.7/10 | One shell, one player, shared state, consistent navigation, and localized copy now replace three isolated app experiences. |
| Information hierarchy | 9.5/10 | Primary, contextual, and playback navigation remain clear at wide and compact sizes; Library necessarily retains a dense second-level rail. |
| Visual polish and consistency | 9.5/10 | Fluent dark surfaces, deep-red focus, resilient poster fallbacks, typography, and artwork are cohesive across all tabs. |
| Navigation and discoverability | 9.7/10 | Every major capability has an obvious localized tab, contextual action, or advanced-settings path. |
| Playback experience | 9.5/10 | Video opening, persistent audio, queue visibility, compact track selection, and three detach modes are clear; remembered pop-out layouts remain. |
| Study integration | 9.7/10 | Study Mode is first-class and composes the existing analysis/mining/review workflow rather than being a sidebar afterthought. |
| Functional completeness | 9.3/10 | Existing capabilities are retained and planned gaps have complete homes, but the indexed search, probe persistence, version resolver, and tracking-conflict engine are not implemented. |

## Concrete improvement plan before the next audit

1. Build the subtitle/vocabulary index and connect it to Study Mode and scoped global
   search.
2. Persist technical probe results and provider matches during ingestion.
3. Add the version resolver and tracking-conflict inbox to their existing inspectors.
4. Add queue reordering/saving and remembered detached-window geometry.
5. Add explicit provider cache-age/offline telemetry and screenshot-regression coverage
   at compact, default, and wide window sizes.

Those are implementation milestones, not reasons to broaden the current UI revamp.
