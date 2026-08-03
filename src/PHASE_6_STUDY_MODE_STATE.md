# Phase 6 — Unified Study Mode

Status: **active**

Last updated: 2026-07-29

## Completed slice: episode readiness rail

- Added a pure shared episode-readiness projection over the existing media
  library and versioned Study orchestration document.
- Restricted comparisons to the anchor item's authoritative `seriesKey`,
  finite normal-episode identity, and exact cached analysis inputs.
- Trusted scores require the current analyzer version, Japanese subtitle
  record/source fingerprint, vocabulary fingerprint, level-list fingerprint,
  frequency-list fingerprint, and matching workspace context.
- Kept `stale`, `unanalyzed`, and `missing-subtitles` distinct.
- Reused the existing preparation/transcription action for incomplete episodes
  and the existing exact-context handoff for ready episodes.
- Added no cache, subtitle catalogue, playback tracker, or episode-opening
  analysis pass.

## Live Electron proof

Testing used only the app's own MCP/debug bridge.

- Authentic `The Big O` library state rendered 26 ordered episodes.
- Episode 1 displayed its trusted cached 0% readiness and N1 recommendation.
- Episodes 2–26 displayed `Japanese subtitles missing` and the existing
  preparation action.
- The strip scrolls inside the Study panel without widening the document.
- Selecting episode 1 handed Video its exact media ID, episode number,
  Japanese subtitle record, and saved 53.267-second position.
- The Video surface opened `The Big O - 01`; renderer error count remained
  zero.
- The smoke's normal autoplay was paused, and the user's original
  `lastPlayedAt` and `positionSec` were restored exactly afterward.

## Completed slice: subtitle-track upgrade

- Reused attached local subtitle records, the existing rated subtitle
  catalogue, and exact Study preparation; no alternate catalogue or cache was
  added.
- Required exact provider/item identity, Japanese language, a newer local
  record, at least two rated quality dimensions on both tracks, and a
  ten-point score improvement.
- Rejected catalogue-only, older, weakly rated, marginal, and cross-series
  candidates deterministically.
- Added an explicit comparison card and `Use for Study and refresh` action.
  Acceptance refreshes the existing Study workspace using the candidate's
  exact subtitle record without silently changing playback subtitles.
- The authentic catalogue had zero providers and zero rated tracks, so the
  live smoke correctly withheld the recommendation. No synthetic evidence was
  seeded, and renderer error count remained zero.

## Completed slice: cross-title reinforcement

- Projects only the user's selected candidates from current, fingerprint-valid
  prepared workspaces; subtitle bytes are never reread.
- Requires one normalized lemma/reading across at least three canonical titles.
  Episodes of one series collapse to one title and ungrouped episodic filenames
  cannot satisfy the gate.
- Shows a bounded comparison session with one exact Japanese line per title,
  title/episode provenance, occurrence and frequency evidence, and direct
  timestamp actions.
- Pixel review found the first fluid layout clipped cards when a draggable
  desktop window was wider than the visible viewport. The final version keeps
  evidence in the left reading flow and uses stable-width, internally bounded
  context cards.
- Authentic data currently has one prepared title, so it correctly produces no
  recommendation. A temporary three-title visual fixture exercised the positive
  journey through the app MCP bridge, then both runtime files were restored to
  their original SHA-256 hashes.
- The exact context action opened `The Big O - 01` and a controlled bridge
  replay of the same handoff landed at exactly 42.000 seconds with the player
  paused and zero renderer errors.

## Completed slice: abandoned-set resizing

- Reuses the existing bounded media-study session history; no new behavior log
  or abandonment tracker was introduced.
- Requires two vocabulary/card sessions within 30 days, after the current
  workspace was prepared, each lasting 30 seconds to 12 minutes, surfacing at
  least the current selected-set size, and ending with no sentence review or
  cards.
- Applies only when the current prepared set exceeds 20 words. The proposed
  next size is bounded to 10–20 words and preserves the existing ranked order.
- Presents retained and deferred vocabulary before acting. Applying changes
  only the existing `maximumCards` filter through the reversible filter
  operation; no candidate is deleted.
- MCP visual QA found the initial far-right close/apply controls unreachable in
  a partially off-screen draggable window. Both actions now stay in the left
  reading flow and preview columns have bounded widths.
- A temporary two-session fixture produced the real 30 → 18 preview. Apply
  changed the workspace to 18/370 selected, the in-panel undo restored 30/370,
  the recommendation retired after evidence removal, and renderer errors
  remained zero.
- The original null local session-history value was restored, the backup key
  was removed, the app was stopped, and the Study document was restored to its
  original SHA-256 hash.

### Rank 12/13 audit and rank 14 scene session

- Rank 12 was deferred after tracing both authoritative paths. Local
  media-context cards can prove that `audioPath` or `imagePath` is absent, but
  VideoCore capture bytes are transient and the shared Anki attachment
  resolver only writes during note creation. There is no managed VideoCore
  asset write or existing-note update path to repair in place without creating
  a second inventory/policy.
- Rank 13 was deferred because prepared subtitle cues and Study vocabulary
  candidates do not carry speaker identity. Recurrence alone cannot truthfully
  create a character pack.
- Rank 14 derives one bounded quick session per current exact-subtitle
  workspace from the existing selected candidates only. It requires five
  useful unknowns, three recurring unknowns, ten total occurrences, and a
  30–180 second cluster.
- The preview exposes the exact A/B range, duration, strongest words, readings,
  occurrences, source lines, and timestamps before launch. It stores no scene
  index and rescans no subtitle bytes.
- Authentic `The Big O - 01` state produced a 0:48–3:59 preview with seven
  selected recurring unknowns. MCP visual QA found the initial range pushed
  beyond the right edge and moved it into the left reading flow.
- Launch reused the existing Study context handoff and legacy player A–B
  controls. The live player showed A=48.00s/B=239.00s; playback at B looped to
  49.71s, with zero renderer error logs.
- No positive fixture was required. After shutdown, `media.json` and the Study
  document were restored to their original SHA-256 hashes.

### Rank 15 stale queue cleanup

- Outdated Study debt is now detected from the persisted opportunity document,
  the current media library, the exact attached Japanese subtitle records, and
  the export/knowledge state that already exists. No cleanup ledger was added.
- An item retires only when its media left the library, its exact Japanese
  subtitle record is no longer attached, or every selected word in its workspace
  is already exported or known at level 2 or above. Analysis fingerprints are
  deliberately excluded: a stale analysis means refresh, not retire.
- Resolved debt applies only to types whose promise is unfinished vocabulary
  work. Watching reminders, learned-card context, and source repair survive
  finished mining. An empty library counts as unloaded, not as removed media,
  and the cleanup never audits itself.
- Retirement reuses `study:setOpportunityStatus` only, previews each item with
  its own reason and evidence, and exposes an immediate undo that restores the
  previous active or snoozed status. Partial application remains undoable.
- The renderer sync now also retires spent `scene-quick-session` and
  `stale-queue-cleanup` entries, closing a gap left by the previous slice.
- The authentic queue had no genuinely stale item, so three labelled temporary
  fixtures proved the positive path. Apply moved all three to dismissed and
  emptied the stream; undo restored all three and the cleanup card. Workspaces,
  candidates, exports, readiness, and action history were unchanged, with zero
  renderer errors. The Study document was restored to its exact original hash,
  verified outside the tooling filesystem overlay the test app ran in; the real
  `media.json` was never modified.

### SM-022 Study/player contract decoupling

- `StudyOrchestratorWorkspace` had been receiving the legacy `MediaState` object
  whole — over 100 members — to read four of them. That import was the only
  thing tying Study to `MediaContent`, and it is gone.
- `shared/studyMediaSurface.ts` defines `StudyMediaSurface`: the media library,
  the loaded item, a live position reader, and one add-media action. It names
  neither player. `studyPlaybackPosition` and `studyPositionChanged` carry the
  live-versus-stored rule and the two-second write threshold that had been
  inlined in the return-target poll.
- `renderer/components/media/legacyStudyMediaSurface.ts` is the only file that
  knows both shapes. `MediaCenterView` builds the surface from the legacy player
  and passes it down, so no player behavior changed. The adopted VideoCore can
  satisfy the same contract through `vc_videoElement`.
- Behavior is unchanged by construction; the extracted rules are now exported
  and tested rather than inline. Deterministic verification only — this slice
  has no user-visible delta, so no live smoke was run and none is claimed. The
  app was not launched and no runtime file was touched.
- The wider migration remains blocked outside this track. `MediaWorkspaceHost`
  renders nothing unless `SEANIME_SIDECAR=1`, which is off in a normal run, and
  `docs/migration/NEXT_SESSION.md` puts old-player retirement behind its own
  unfinished G-PLAY and microphone proofs.

### Rank 16 easier favorite alternative

- Compares only favorited media with cached readiness that still matches the
  current analyzer, exact attached Japanese subtitle record/version, knowledge
  fingerprint, level-list fingerprint, and frequency-list fingerprint.
- The overwhelming side must be `save-for-later`; the alternative must already
  be at least 70% known coverage and categorized `short-preview` or `ready-now`.
  It chooses the easiest current favorite and keeps results bounded to three,
  with queued hard favorites first.
- Stale, unanalyzed, non-favorite, detached-track, non-finite, and merely
  refreshable entries cannot participate. No analysis pass, subtitle read,
  workspace requirement, or second favorite/readiness index was introduced.
- The recommendation reports both cached percentages and the delta, then opens
  the easier favorite with exact media, episode, Japanese subtitle record, and
  saved position through the existing Study handoff.
- New UI copy is localized in EN/JA/ZH/RU. Authentic runtime state contains 30
  media items and zero favorites, so the recommendation is correctly
  ineligible. The installed package predates this worktree, so no live UI proof
  is claimed and neither runtime JSON file was touched.

### Rank 17 grammar weakness scenes

- Reuses bounded completed Grammar history and the newest
  fingerprint-current workspace for the exact attached Japanese subtitle.
  Eligibility requires the same point to be missed in two distinct recent
  sessions.
- Literal matching rejects one-character surfaces after authentic projection
  exposed unsafe substring matches. No subtitle rescan, occurrence index, or
  second Grammar history was added.
- Electron MCP verified two authentic `The Big O - 01` contexts for temporary
  N4 `ではない` history, the bounded Study preview, and the existing Grammar
  Practice deep link. All temporary state was removed afterward.

### Rank 18 listening-first recipe

- Requires a complete fingerprint-current `ready-now` snapshot with at least
  85% known occurrence coverage, the exact attached Japanese subtitle record,
  its matching workspace, and usable audio proven by the exact mounted player.
- Audio capability comes only from exposed audio tracks, a disposable capture
  stream, or Chromium's positive decoded-audio byte counter. No container guess
  or quality score is used.
- The action opens the exact saved context and enables the existing dictation
  and subtitle-reveal controls. It adds no readiness cache, playback document,
  subtitle source, or microphone request.
- Electron MCP proved authentic `The Big O - 01` audio at ready state 4 with
  1,204,401 decoded audio bytes. Its current readiness is 0%, so the
  listening-first card correctly remained hidden with zero renderer errors.
  No positive fixture was fabricated, and both runtime JSON files were restored
  to their original hashes.

## Validation

- Vitest: **282 files, 3,094 tests passed**
- Renderer build: **passed, 4,603 modules**
- Main build: **passed, 224 modules**
- Preload build: **passed, 4 modules**
- Changed-slice ESLint: **zero findings**
- i18n parity: **5,340 English keys present in ja/zh/ru**
- Architecture audit: **1,206 modules, no new findings**
- TypeScript: **278 existing repository diagnostics; zero in this slice**

## Primary files

- `src/shared/studyEpisodeReadiness.ts`
- `src/shared/__tests__/studyEpisodeReadiness.test.ts`
- `src/shared/studySubtitleUpgrade.ts`
- `src/shared/__tests__/studySubtitleUpgrade.test.ts`
- `src/shared/studyCrossTitleReinforcement.ts`
- `src/shared/__tests__/studyCrossTitleReinforcement.test.ts`
- `src/shared/studyAbandonedSetResize.ts`
- `src/shared/__tests__/studyAbandonedSetResize.test.ts`
- `src/shared/studySceneQuickSession.ts`
- `src/shared/__tests__/studySceneQuickSession.test.ts`
- `src/shared/studyStaleQueueCleanup.ts`
- `src/shared/__tests__/studyStaleQueueCleanup.test.ts`
- `src/shared/studyMediaSurface.ts`
- `src/shared/__tests__/studyMediaSurface.test.ts`
- `src/shared/studyFavoriteAlternative.ts`
- `src/shared/__tests__/studyFavoriteAlternative.test.ts`
- `src/shared/studyListeningFirstRecipe.ts`
- `src/shared/__tests__/studyListeningFirstRecipe.test.ts`
- `src/renderer/__tests__/studyFavoriteAlternativeOpportunity.test.ts`
- `src/renderer/studyListeningAudio.ts`
- `src/renderer/__tests__/studyListeningAudio.test.ts`
- `src/renderer/__tests__/studyListeningFirstOpportunity.test.ts`
- `src/renderer/components/media/legacyStudyMediaSurface.ts`
- `src/renderer/__tests__/legacyStudyMediaSurface.test.ts`
- `src/shared/subtitleProviders.ts`
- `src/main/subtitleDiscovery.ts`
- `src/renderer/mediaStudyOrchestrator.ts`
- `src/renderer/subtitleStore.ts`
- `src/renderer/components/media/StudyOrchestratorWorkspace.tsx`
- `src/renderer/views/mediaCenter.css`

## Next slice

Rank 19, proper-name review mode: audit existing candidate proper-name evidence
and reversible workspace filters for an explicitly opted-in temporary set. Add
no parallel candidate store, silent saved-workspace mutation, or untrusted
speaker inference.

The legacy player migration is no longer next. Its Study-side step is done and
the remaining steps wait on `docs/migration/NEXT_SESSION.md` steps 2 and 3.
