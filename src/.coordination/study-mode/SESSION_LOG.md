# Session log

---

## Session 2026-07-27 — Durable N-level lists and frequency fallback

### User defects and requests

- Configured N1–N5 words disappeared after exiting.
- The actual level decks were available as five APKG files in Documents.
- Study needed a user-controlled frequency fallback for either every word or
  only words missing from the N lists.

### Repairs

- Replaced localStorage-only level persistence with a versioned
  IndexedDB-authoritative store, boot reconciliation, migration retention, and
  explicit durable import completion.
- Added modern normalized Anki schema reconstruction from `notetypes` and
  `fields`.
- Imported all five Documents decks through the real app and preserved exact
  counts through two complete Electron restarts.
- Added enabled user-frequency ranks, frequency metadata cache invalidation,
  persisted all-word / missing-JLPT modes, rank badges, and filter preservation
  across reanalysis.
- Corrected affected-count reporting when a maximum-card cap replaces removed
  candidates with later candidates.
- Implemented the repeated-lookup opportunity by evolving the existing bounded
  dictionary history rather than creating a parallel tracker.

### Validation

- Targeted: 6 files / 52 tests passed.
- Full: 247 files / 2,735 tests passed.
- Renderer production build passed; Forge main and preload bundles passed.
- Core changed Study paths have zero TypeScript diagnostics.
- MCP live verification: N1 2,972; N2 816; N3 2,287; N4 557; N5 578.
- Big O: 370 candidates, 345 frequency-ranked from enabled JPDB, persisted
  `frequency-unrated`, N5/N4 exclusions, and 30 selections after restart.
- MCP DOM verified both ranking choices and visible rank badges; renderer error
  log count was zero.

---

## Session 2026-07-27 — Study Mode Orchestrator start

### Starting state

- Four Study test files passed, 19 tests total.
- Existing Study files are mostly new/untracked and renderer-local.
- Main media, subtitle/transcription, known-word, flashcard, Anki, and local-agent
  foundations were inspected.

### Decisions

- Preserve `studyQueue` as the explicit study bookmark.
- Treat `favorite` as a secondary, dismissible recommendation signal.
- Reuse transcription and Anki gateways.
- Keep all implementation memory under `src/.coordination/study-mode/`.

### Commands run

```text
npx vitest run src/shared/__tests__/mediaStudyAssistant.test.ts src/shared/__tests__/mediaStudyDatabase.test.ts src/shared/__tests__/mediaStudyExtraction.test.ts src/shared/__tests__/mediaStudyIntegration.test.ts
```

Result: 4 files passed, 19 tests passed.

### Current work

SM-001 is in progress. No implementation source was changed before the existing
target diffs and untracked files were inspected.

---

## Session 2026-07-27 — Foundation-first vertical slice delivered

### Implemented

- Added orchestration contracts, deterministic readiness, evidence, filters,
  undo, normalized duplicates, pagination, and stable fingerprints.
- Added an atomic main-process v2 store and one-time renderer-v1 migration.
- Extracted the shared main Kuromoji service and moved preparation behind IPC.
- Reused persistent transcription and profile-aware Anki gateways.
- Added local-card preview/context/undo and partial Anki retry records.
- Added typed Study AI operations through existing permission/confirmation.
- Added the Fluent recommendation, production line, vocabulary funnel, bounded
  list, evidence rail, and exact media return.
- Ranked 30 future quality-of-life opportunities without exposing dead controls.

### Validation

- Targeted: 11 files / 84 tests passed.
- Full: 245 files / 2,716 tests passed.
- Renderer, main, and preload bundles passed.
- Full TypeScript still reports broad pre-existing repository issues; filtered
  output after repairs contains no errors in the new Study modules.

### Resume notes

The next task is a live Electron/Anki smoke test. Preserve the dirty worktree and
do not reintroduce renderer-local authoritative Study state or duplicate shared
transcription, tokenizer, flashcard, Anki, or player services.

---

## Session 2026-07-27 — MCP visual smoke and workspace hardening

### Investigation

- Used the repository's `jp-app` MCP stdio server; no screen control.
- Verified the Study empty state, seven truthful waiting stages, focusable
  controls, reduced-motion CSS, and zero renderer error logs.
- Temporarily set one real media item to `studyQueue: true`.
- Observed an explainable missing-subtitle opportunity using real artwork and
  no fabricated readiness score.
- Restored the media item to `studyQueue: false` and verified the empty state.
- Found that the current library's 30 items have no stored subtitle records.

### Defects found and repaired

1. The renderer requested only the first 120 vocabulary candidates and exposed
   no way to reach later items.
   - Added bounded 60-item Previous/Next navigation.
   - Added range, selected-count, loading, and `aria-live` feedback.
2. Debounced playback persistence referenced nonexistent `MediaState.position`.
   - It now samples the real video element `currentTime`.
   - Persisted `MediaItem.positionSec` is used only as fallback.

### Validation

```text
npx vitest run [six explicit mediaStudy test files] --reporter=dot
# 6 files / 33 tests passed

npx vite build --config vite.renderer.config.ts
# passed; existing chunk warnings only

npx tsc --noEmit --pretty false
# repository-wide unrelated failures remain
# filtered Study module output: no errors
```

MCP evidence:

- `debug/shots/win1-1785138746195.png` — empty state.
- `debug/shots/win1-1785139200184.png` — queued recommendation.
- Final media state: `studyQueue: false`.
- Final renderer error log count: zero.

### Exact next action

Attach a real Japanese subtitle record, then run readiness → N5/N4 filter →
undo → local-card preview/undo → exact media return. Run a small Anki preview
and export only when AnkiConnect is deliberately available.

---

## Session 2026-07-27 — Transcription truth and page-independent AI

### Defects found

- `enqueueTranscription()` returns when work is queued, but Study described that
  return as completed transcription and immediately tried to load zero lines.
- Study production jobs did not reference or persist the real shared
  transcription lifecycle.
- Cancelling a queued, not-yet-running transcription emitted no terminal
  progress event.
- `study.prepare-media` only dispatched a renderer event. Outside a mounted
  Study page, the event was lost while the tool returned `requested: true`.
- Study could fall back to a non-Japanese subtitle record for Japanese analysis.

### Repairs

- Added a pure phase mapper from shared transcription progress to persisted
  Study stages, with real progress ratios and failure details.
- Added a main-process transcription observer and typed
  `study:queueTranscription` IPC.
- Added safe production-line cancel/retry controls and accessible real-progress
  meters.
- Added direct AI preparation by media ID: read and parse the stored Japanese
  track, or queue the shared transcription job and return its real state.
- Added a shared Japanese-track selector with regression coverage.

### Validation

```text
npx vitest run [eight explicit Study/transcription/local-agent files]
# 8 files / 54 tests passed

npx tsc --noEmit --pretty false
# unrelated repository failures remain
# filtered changed modules: no errors

npx vite build --config vite.renderer.config.ts
# passed; existing chunk warnings only

npm test -- --reporter=dot
# 245 files / 2,719 tests passed
```

Fresh MCP verification:

- new typed preload API is present;
- recommendation and seven stage labels render with accessibility metadata;
- zero renderer error logs;
- temporary `studyQueue` mutation restored to `false`;
- `debug/shots/win1-1785140004388.png`.

---

## Session 2026-07-27 — Real Japanese episode vertical slice

### Starting state

- Generated queue/favorite opportunities were renderer-only until preparation.
- “Why this” did not expose a dedicated evidence surface.
- No real stored Japanese track had been used in the live workflow.

### Real test material

- Source: Ajatt Tools `kitsunekko-mirror`, `THE Big O`, episode 1 Bandai
  Japanese SRT.
- Validation: 19,722 bytes, 267 cues, 2,812 Japanese characters.
- SHA-256:
  `ECBC0089FC497E992D710963CCBA18FFA7B48DAC952A3E13605930157323666F`.
- Attached through the existing exact-stem sidecar discovery provider to the
  real library item `The Big O - 01`.

### Defects reproduced and repaired

1. Generated opportunities could not be reliably dismissed or snoozed before
   analysis.
   - Added authoritative upsert, stable IDs, status preservation, full-snapshot
     stale retirement, and point-write protection.
2. An attached track was described as missing until readiness existed.
   - Added explicit subtitle-attached/analysis-pending evidence.
3. Visible preparation opened media but never loaded its stored subtitle record,
   leaving the UI stuck.
   - Routed the UI through `prepareStudyMediaById`, shared with typed AI.
4. Candidate handoff preferred the session return point over the candidate cue
   and lost state across separate Media Center instances.
   - Added cue-first seek selection plus a typed session/live-event handoff.
5. MCP visual evidence showed every selected word with a bright global outline.
   - Replaced the colliding `.is-selected` class with namespaced
     `.is-included` styling and `aria-pressed`.

### Live workflow result

- Real analysis: 253 subtitle lines, 370 candidates, 30 selected.
- Readiness: `save-for-later`, 0% known coverage, confidence 70%.
- Typed “Remove N5 and N4 words”: completed and persisted.
- Undo: completed and restored prior filters.
- Reapply: completed and retained `N5,N4`.
- Affected count: 0 because the live imported bands did not label these
  candidates; no count was fabricated.
- Local card preview: 30 selected, 30 creatable, zero duplicates.
- Anki preview: 30 writable, zero duplicates/missing content, export disabled
  because AnkiConnect was unavailable.
- Exact context: candidate `する` at 53.267 seconds opened Video with 267
  Japanese lines and displayed its source sentence.
- Return: Open Study Mode restored the persistent workspace.

### Validation

```text
npx vitest run --reporter=dot
# 245 files / 2,725 tests passed

npx vite build --config vite.main.config.ts
npx vite build --config vite.preload.config.ts
npx vite build --config vite.renderer.config.ts
# all passed; existing renderer chunk-size warnings only

npx tsc --noEmit --pretty false
# 291 broad pre-existing repository diagnostics
# no new Study orchestration diagnostic in the changed-path filter
```

### Visual evidence

- `debug/shots/win1-1785142561155.png`
- `debug/shots/win1-1785142691593.png`
- `debug/shots/win1-1785142973210.png`

### Runtime state

- Creditless-opening test queue flag restored to false.
- Episode 1 test queue flag restored to false. Its real sidecar, readiness,
  workspace, filter history, and production job remain available for recovery
  and future Study use.
- Ran a full authoritative opportunity sync through the repo MCP/debug bridge;
  the stale active Episode 1 recommendation was retired.
- No Anki write and no internal-card write was performed.
- Renderer error log count: zero.

### Exact next action

When AnkiConnect is intentionally available, export a deliberately small
previewed batch, verify per-note success, and retry only failed entries.

---

## Session 2026-07-28 — Subtitle rules, Anki recovery, and replay-to-shadowing

### Subtitle mining rules

- Promoted `subtitle` to a first-class mining source across the shared rule
  contract, Settings editor/simulator, extension input, Video Core, and Study
  orchestration.
- Advanced the profile-rule document to schema version 2.
- Preserved version 1 behavior by migrating prior audio rules to cover audio
  and subtitle, while allowing new rules to distinguish them.
- Persisted normalized migrations atomically.
- Live Settings showed separate Audio and Subtitles controls, and the real
  rules document was rewritten as schema version 2.

### Anki routing and recovery

- Consolidated preview and write destination selection into one resolver.
- Surfaced exact profile, rule, deck, model, and default status in Study.
- Applied the shared image/media fallback to prebuilt, field-template, and
  automatic card construction.
- Replaced forced post-write full-collection polling with optimistic interval
  snapshot updates.
- Added failed-entry-only retry and exact successful-note undo.
- Live six-card proof produced one carried entry, three duplicates, and two
  failures. Restoring the model and retrying created only the two failures.
  Undo removed exactly the three notes created during the proof.
- Restored the user's model, selection cap, history, export state, and filters;
  no proof notes remain.

### Replay-to-shadowing

- Added bounded one-cue replay evidence with a threshold of three explicit
  replay-button clicks within ten minutes.
- Automatic cue loops do not count.
- Cue changes, window expiry, shadowing state, and dismissal prevent stale or
  repeated prompts.
- The G-PLAY overlay offers `Start shadowing` and `Not now`; starting reuses the
  existing shadowing controls and does not invoke the microphone.
- Live proof showed no recommendation after clicks one and two, the
  recommendation after click three, and an idle recording state after starting
  shadowing. Renderer errors remained zero.

### Architecture audit

- The adopted player path is `MediaWorkspace` → `StudyPlayerSlice` →
  `VideoCoreStudyOverlay`.
- Library, video, and music routes still enter legacy `MediaContent`, and Study
  context handoff still depends on its `MediaState`.
- Legacy retirement is therefore deferred until those routes and the handoff
  contract migrate.

### Validation

```text
npx vitest run [five focused mining/Anki/player suites]
# 5 files / 60 tests passed

npx vitest run --reporter=dot
# 255 files / 2,916 tests passed

npx vite build --config vite.renderer.config.ts
# passed; existing chunk warnings only

npx vite build --config vite.main.config.ts --ssr src/main.ts
npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# both actual entry bundles passed

npx tsc --noEmit --pretty false
# 353 broad repository diagnostics
# changed-slice filter: zero diagnostics
```

Changed-slice ESLint also completed with zero warnings or errors.

### Exact next action

Start rank 4, prepared-but-unwatched, only by reusing existing durable
preparation-completion and playback timestamps. Do not introduce a second
playback tracker.

---

## Session 2026-07-28 — Prepared-but-unwatched opportunity

### Signal design

- Reused `StudyReadinessSnapshot.generatedAt` as durable preparation completion.
- Reused `MediaItem.lastPlayedAt`, which the real `media:open` playback path
  already updates.
- Added no new playback tracker, history document, or polling loop.
- Added a 24-hour grace period so fresh preparation does not immediately
  produce a reminder.
- Required a matching non-empty workspace and suppressed the signal when an
  unfinished session exists.

### Opportunity lifecycle

- Added the first-class `prepared-unwatched` opportunity type.
- Routed it through the existing authoritative sync, dismiss, snooze, and stale
  retirement behavior.
- Later playback makes the deterministic signal disappear; full sync then
  removes the active reminder.
- The existing resume strip prefers unfinished sessions, then shows the
  prepared title with a `Watch now` action and the persisted return position.

### Authentic live proof

- Existing user data contained one naturally eligible title:
  `The Big O - 01`.
- Preparation was about 30.5 hours old and the last real playback predated it.
- The live resume strip rendered:
  - `Watch your prepared The Big O - 01`
  - `Your vocabulary preview is ready, and this title has not been played since
    it was prepared.`
  - `Watch now`
- The opportunity persisted as `prepared-unwatched / active`.
- Playback was not started, so no real playback timestamp or position changed.
- Renderer error log count: zero.

### Validation

```text
npx vitest run [three focused Study suites]
# 3 files / 40 tests passed

npx vitest run --reporter=dot
# 255 files / 2,920 tests passed

npx vite build --config vite.renderer.config.ts
npx vite build --config vite.main.config.ts --ssr src/main.ts
npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# all passed; existing bundle warnings only

npx tsc --noEmit --pretty false
# 280 broad repository diagnostics
# changed-slice filter: zero diagnostics
```

Changed-slice ESLint completed with zero warnings or errors.

### Exact next action

Start rank 6, recently learned in media, by tracing the existing Anki
recent-review/maturity snapshot and existing subtitle candidate index. Do not
introduce parallel review history or subtitle storage.

---

## Session 2026-07-28 — Recently learned Anki cards in media context

### Evidence design

- Audited the existing Anki interval snapshot and confirmed it contained
  intervals but no review timestamps.
- Added one optional `lastIntervalChangeAt` value to the existing bounded entry.
- The timestamp advances only when consecutive authoritative polls observe a
  changed interval. New cards and unchanged intervals do not fabricate recency.
- The evidence persists in `anki-intervals.json`; no second review history or
  storage file was created.

### Context matching

- Non-zero interval changes remain eligible for seven days.
- The renderer builds one expression index per snapshot.
- Prepared workspace candidates perform direct word/surface lookups against
  that index, avoiding both full subtitle rescans and
  `media count × Anki entry count` work.
- Matches are capped at eight per workspace and sorted deterministically.
- The opportunity opens the exact subtitle record, sentence, and candidate cue
  timestamp through the existing context handoff.
- Authoritative sync, dismissal, snooze, and stale retirement include the new
  `recently-learned-context` type.

### Real-data audit

- Persisted Anki snapshot: 87,257 entries, not truncated.
- Interval-change timestamps: 0.
- Recent non-zero evidence: 0.
- No synthetic interval or review event was seeded. Authentic live activation
  waits for a future poll to observe a real interval delta.

### Validation

```text
npx vitest run [four focused Anki/Study suites]
# 4 files / 48 tests passed

npx vitest run --reporter=dot
# 255 files / 2,923 tests passed

npx vite build --config vite.renderer.config.ts
npx vite build --config vite.main.config.ts --ssr src/main.ts
npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# all passed; existing bundle warnings only

npx tsc --noEmit --pretty false
# 280 broad repository diagnostics
# changed-slice filter: zero diagnostics
```

Changed-slice ESLint completed with zero warnings or errors.

### Exact next action

Start rank 7, comprehension overload rescue, by tracing existing explicit
pause, rewind, and lookup signals in the adopted player. Do not add a parallel
playback tracker.

---

## Session 2026-07-28 — Comprehension overload rescue

### Evidence boundary

- Reused actual dictionary lookup hits, explicit replay/previous-cue controls,
  backward media seeks, pause events, and the active subtitle cue.
- Kept one session-local two-minute window within a five-cue neighborhood.
- Required two lookups, two rewinds, and a pause before eligibility.
- Marked Study line-loop and A-B-loop seeks as programmatic so they cannot
  increment rewind density.
- Added no persistence, polling loop, or alternate playback tracker.

### Rescue behavior

- The suggestion renders only while the adopted player is already paused, so
  it cannot interrupt active playback.
- Replay-to-shadowing retains priority when both signals qualify.
- Accepting the rescue dismisses the bounded prompt and reuses the existing A-B
  controls for the previous, current, and next exact subtitle cues.
- `Not now` suppresses the suggestion for the active scene window.

### Validation

```text
npx vitest run [four focused player/Study suites]
# 4 files / 59 tests passed

npx vitest run --reporter=dot
# 255 files / 2,928 tests passed

npx vite build --config vite.renderer.config.ts
npx vite build --config vite.main.config.ts --ssr src/main.ts
npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# all passed; existing bundle warnings only

npx tsc --noEmit --pretty false
# broad repository diagnostics remain; changed-slice filter: zero diagnostics
```

Changed-slice ESLint completed with zero warnings or errors.

### Live limitation

- The dev app reached the adopted Video workspace and the renderer console had
  zero errors.
- Windows raised a firewall permission dialog for FACET before media could
  load. The dialog was left untouched and only the test processes were stopped.
- The end-to-end player activation therefore remains unclaimed.

### Exact next action

Start rank 8, episode readiness rail, by reusing cached readiness and
authoritative series/episode identity. Do not open episodes just to calculate
scores or create a second readiness cache.

## 2026-07-29 — Rank 12/13 audit and rank 14 quick session

### Rank 12/13 decisions

- Deferred missing card-assets repair after tracing the local deck, VideoCore
  capture, Reader Collection export, and shared Anki attachment fallback.
  Missing path roles are provable, but there is no authoritative managed
  VideoCore asset write/update path for repairing an existing card.
- Deferred character vocabulary packs because subtitle cues and Study
  candidates contain no speaker identity.

### Rank 14 implementation

- Added `studySceneQuickSession.ts` with exact-subtitle/fingerprint validation
  and a bounded projection over the current selected vocabulary.
- Requires five high-value unknowns, three recurring unknowns, ten total
  occurrences, and a 30–180 second cluster.
- Added a preview with exact range, duration, readings, occurrences, source
  lines, and cue timestamps.
- Launch reuses `StudyContextRef` and the legacy player's existing A–B state.
  No scene index, subtitle rescan, or alternate playback tracker was added.

### MCP-only live verification

- Authentic `The Big O - 01` produced seven selected recurring words across
  0:48–3:59.
- Initial pixel review found the range outside the visible right edge in the
  user's shifted Media window. The final layout keeps it in the left flow and
  uses a bounded horizontal word rail.
- Launch set A=48.00s and B=239.00s. Playback at the endpoint looped to 49.71s.
- Renderer error log: zero.
- No fixture was needed. After stopping the app, `media.json` and
  `study-orchestrator-v2.json` matched their original SHA-256 hashes.

### Validation

```text
npx vitest run --reporter=dot
# 271 files / 3,041 tests passed

npx vite build --config vite.renderer.config.ts
# 4,595 modules passed

npx vite build --config vite.main.config.ts --ssr src/main.ts
# 224 modules passed

npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# 4 modules passed
```

- Changed-slice ESLint: zero warnings or errors.
- i18n parity: 5,311 English keys present in ja/zh/ru.
- Architecture: 1,187 modules, 19 known findings, nothing new.
- TypeScript: 278 repository diagnostics; changed-slice filter zero.

### Exact next action

Start rank 15, stale queue cleanup, by previewing opportunities invalidated by
learned/exported candidates or removed source records. Reuse existing status
and history; do not delete source or study data.

## 2026-07-29 — Rank 15 stale queue cleanup

### What was implemented

- `shared/studyStaleQueueCleanup.ts` audits the persisted Study document against
  the current library, the exact attached Japanese subtitle records, and the
  finished vocabulary work already recorded in each workspace.
- Three reasons retire an item: `media-removed`, `subtitle-removed`, and
  `debt-resolved` (every selected word exported successfully or known at level 2
  or above). Analysis fingerprints are never consulted, because a stale analysis
  means refresh, not retire.
- `debt-resolved` is limited to types whose only promise is unfinished
  vocabulary work. Watching reminders, learned-card context, and source repair
  survive finished mining on purpose.
- An empty library is treated as unloaded rather than as removed media, and the
  cleanup recommendation is excluded from its own audit so its id cannot churn.
- One aggregate `stale-queue-cleanup` opportunity at priority 73 carries
  per-reason evidence and a single `preview-queue-cleanup` action.
- The renderer panel lists each item with its own reason chip, detail, source,
  and export/learned counts, then applies through the existing
  `study:setOpportunityStatus` operation and exposes an immediate undo that
  restores each previous active or snoozed status. Partial application stays
  undoable.
- `syncStudyOpportunities` now also retires missing active `scene-quick-session`
  and `stale-queue-cleanup` entries, closing a gap left by rank 14.

### Live verification

- The authentic library no longer contains the media id the existing Study
  workspace references, so the pre-existing sync retired the real
  `prepared-unwatched` entry on boot and no genuine stale item remained. Three
  clearly labelled `TEMP FIXTURE` opportunities plus one temporary workspace
  exercised all three reasons.
- The preview showed already finished (3 exported), media removed, and subtitle
  removed. Actions stayed in the left flow — apply at x=460, close at x=650 in a
  1,264-pixel document with no horizontal overflow.
- Retiring moved all three to `dismissed` and emptied the stream; undo returned
  all three to `active` and restored the cleanup card. Two workspaces (370/30
  and 3/3 with three exports), three readiness snapshots, and fifteen action
  records were unchanged in both directions, with zero renderer errors.
- The app was stopped and `study-orchestrator-v2.json` was restored to its exact
  original SHA-256 hash (`4F16DAEB…1A26`).
- The temporary subtitle record never reached the on-disk `media.json`. The test
  app ran inside a tooling filesystem overlay, so that write stayed there; the
  real file's timestamp still predates this slice.
- Lesson for future live proofs: verify runtime restoration from a shell outside
  that overlay. A sandboxed shell reported the Study document as restored while
  the real file still held fixture residue, which a second check caught.

### Validation

```text
npx vitest run --reporter=dot
# 272 files / 3,058 tests passed

npx vite build --config vite.renderer.config.ts
# 4,596 modules passed

npx vite build --config vite.main.config.ts --ssr src/main.ts
# 224 modules passed

npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# 4 modules passed
```

- Focused rank-15 coverage: 17 tests passed.
- Changed-slice ESLint: zero warnings or errors.
- i18n parity: 5,311 English keys present in ja/zh/ru.
- Architecture: 1,189 modules, 19 known findings, nothing new.
- TypeScript: 278 repository diagnostics; changed-slice filter zero.
- The three builds were run sequentially; running them concurrently races on the
  shared `dist` directory.

### Exact next action

Begin the legacy player migration: move library, video, music, and Study-context
routing from `MediaContent` to `MediaWorkspace`, verify dragging, taskbar
identity, resume, subtitles, and exact cue seeking, then remove legacy code only
after route and restart smokes pass.

---

## SM-022 — Study/player contract decoupling (legacy migration step 2)

### Scope decision, recorded before any code

The documented next action listed four steps. Step 2 landed; steps 1, 3 and 4
are blocked by facts outside this track, and the blockers were verified in the
code rather than assumed:

- `MediaWorkspaceHost` returns `null` whenever the sidecar status is `disabled`,
  and `SEANIME_SIDECAR_ENABLED` is `process.env.SEANIME_SIDECAR === '1'`
  (`shared/seanime.ts:10`), which is off in every normal run. Routing library,
  video and music to `MediaWorkspace` today would leave the shipped app with no
  media surface at all.
- `docs/migration/NEXT_SESSION.md` — the Seanime track that owns the adopted
  player — lists old-player retirement as its own step 4, behind a G-PLAY asset
  re-run plus restart/resume/history and a microphone hardware proof. Both are
  still owed there.

So the swap is not this track's to make yet. What *was* blocking it from this
side is the handoff contract, and that is now gone.

### What landed

- `shared/studyMediaSurface.ts` defines `StudyMediaSurface`: `items`, `current`,
  `livePositionSec()`, `openFile()`. Four members, no player types, no import of
  either player. `studyPlaybackPosition` and `studyPositionChanged` carry the
  live-versus-stored and write-threshold rules that were inlined in the poll.
- `StudyOrchestratorWorkspace` takes `surface` instead of `state` and no longer
  imports `MediaContent` at all. It had been receiving the whole `MediaState`
  object — over 100 members — to read exactly four of them.
- `renderer/components/media/legacyStudyMediaSurface.ts` is the only file that
  knows both shapes. `MediaCenterView` hands the legacy state to it and passes
  the result down; nothing about the legacy player changed.
- The five-second return-target poll now reads a `surfaceRef` refreshed on every
  render, replacing a hand-maintained dependency list that snapshotted
  `mediaId`, `fallbackPosition` and `videoRef` separately.

### Behavior

Unchanged by construction. The position rule is the same one the poll used
(finite live value wins, else the stored `positionSec`, else zero) and the write
threshold is still two seconds; both are now named, exported and tested. The
adopted player can satisfy the same contract through `vc_videoElement`, the one
clock the migration contract already names authoritative — no code here depends
on that, it is simply no longer excluded.

### Verification

Deterministic only. This slice has no user-visible delta, so no live smoke was
run and none is claimed; the app was not launched and no runtime file was
touched. The stale `debug/bridge.json` in the tree points at a dead pid.

- New coverage: 8 contract tests + 3 adapter mount tests, including the
  zero-position case, non-finite live values, and reading *through* the ref so a
  player attached after the surface is built is still seen.
- Found in passing and filed separately, not fixed here: the vitest include
  globs are all `**/*.test.ts`, so `externalPlayerPanel.test.tsx` and
  `mediaTrackingSourcesHistory.test.tsx` have never executed. Fixing that needs
  a root config change, which `CLAUDE.md` puts out of bounds. The new adapter
  test is written as `.test.ts` with `createElement` for that reason, and is the
  first running `createRoot` test — it sets `IS_REACT_ACT_ENVIRONMENT` itself.

### Validation

```text
npx vitest run --reporter=dot
# 274 files / 3,069 tests passed

npx vite build --config vite.renderer.config.ts
# 4,598 modules passed

npx vite build --config vite.main.config.ts --ssr src/main.ts
# 224 modules passed

npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# 4 modules passed
```

- Changed-slice ESLint: zero warnings or errors.
- i18n parity: 5,311 English keys present in ja/zh/ru. No new UI text.
- Architecture: 1,192 modules, 19 findings, nothing new, still 3 pending. The
  new shared module has a real consumer, so it is not a `test-only-module`.
- TypeScript: 278 repository diagnostics, unchanged; changed-slice filter zero.

### Exact next action

Rank 16, the easier-bookmark alternative: compare cached favorite coverage from
the existing readiness snapshots and their fingerprints only, add no analysis
pass, and recommend nothing when a favorite merely needs a refresh.

Do not attempt the library/video/music route swap until the Seanime track closes
its own steps 2 and 3 in `docs/migration/NEXT_SESSION.md`. The Study side is
ready: only `MediaCenterView` still names the legacy player.

## 2026-07-29 — Rank 16 easier favorite alternative

### Implementation

- Added `shared/studyFavoriteAlternative.ts`, a bounded pure projection over
  media favorites plus persisted readiness snapshots.
- Both compared entries must match analyzer version 2, their exact attached
  Japanese subtitle record/version, and the current knowledge, level-list, and
  frequency-list fingerprints.
- The hard favorite must be `save-for-later`. The alternative must be at least
  70% known coverage and already `short-preview` or `ready-now`; the easiest
  current favorite wins. Results are capped at three and queued hard favorites
  sort first.
- Stale or unanalyzed favorites are withheld instead of triggering analysis.
  The projection requires no workspace, subtitle read, new cache, or favorite
  index.
- Added the renderer opportunity at priority 72 with both cached percentages,
  the percentage-point delta, and exact media/subtitle/episode/saved-position
  handoff. New copy is translated in EN/JA/ZH/RU.

### Authentic-state verification

- The real `media.json` contains 30 items and zero favorites, so no honest rank
  16 recommendation exists.
- The installed packaged app predates this worktree. It was not launched and no
  live UI proof is claimed.
- `media.json` remained at SHA-256 `A834EA90…` and
  `study-orchestrator-v2.json` remained at `4F16DAEB…`; neither was modified.

### Validation

```text
npx vitest run --reporter=dot
# 276 files / 3,078 tests passed

npx vite build --config vite.renderer.config.ts
# 4,599 modules passed

npx vite build --config vite.main.config.ts --ssr src/main.ts
# 224 modules passed

npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# 4 modules passed
```

- Focused rank-16 coverage: 9 tests passed.
- Changed-slice ESLint: zero warnings or errors.
- i18n parity: 5,317 English keys present in ja/zh/ru.
- Architecture: 1,195 modules, 19 known findings, nothing new; 3 pending.
- TypeScript: 278 repository diagnostics, unchanged; changed-slice filter zero.

### Exact next action

Rank 17, grammar weakness scenes: audit existing failed-pattern evidence and
exact prepared cue provenance. Add no parallel grammar history and do not
rescan subtitle libraries merely to create a recommendation.

## 2026-07-29 — Rank 17 grammar weakness scenes

### Implementation

- Added a bounded pure projection from the existing completed Grammar session
  history into exact prepared-scene evidence. A point must be missed in two
  distinct sessions among the ten most recent sessions in 30 days; invalid,
  future-dated, and older records cannot qualify.
- Reused the current analyzer-v2 readiness, exact attached Japanese subtitle
  record/version, vocabulary, level-list, and frequency-list fingerprints, and
  the newest matching prepared workspace. Candidate sentences are already
  cue-derived evidence, so no subtitle bytes are rescanned and no occurrence
  index is persisted.
- Moved the shared literal grammar-surface normalization out of Grammar cloze
  generation. Study adds a conservative two-character minimum because matching
  arbitrary cues is less constrained than matching an authored example.
- Added a bounded Study preview with pattern, meaning, JLPT level, recent
  failed-session count, highlighted literal surfaces, exact title/episode/time
  provenance, scene handoff, and a Grammar Practice handoff.
- Grammar Practice deep links now preserve an exact query. Session-history
  writes emit a bounded renderer change event so Study refreshes without a
  reload. New UI copy is translated in EN/JA/ZH/RU.

### Electron MCP verification

- Started the current Forge development build and used only the dedicated app
  MCP bridge for health, logs, DOM, text, screenshots, clicks, evaluation, and
  reload. No computer-control tool was used.
- Authentic state contained 30 media items, three readiness records, one
  prepared workspace, and no Grammar history, so the recommendation correctly
  stayed hidden.
- Projecting authentic cues exposed unsafe one-kanji matches such as `方` inside
  unrelated words. The detector was tightened to reject one-character
  surfaces before positive UI verification.
- Two temporary completed sessions missing N4 `ではない` produced two authentic
  `The Big O - 01` contexts: `これはドロシーではない` at 213.334 seconds and
  `私はあなたの部下ではない` at 616.934 seconds.
- Visual QA found the first action placement clipped by the user's partially
  off-screen parent window. The final left-flow panel showed both cards and all
  actions within the 1,264-pixel document.
- Clicking `Practice this pattern` opened the existing Grammar Practice mode
  with Japanese, N4, and exact query `ではない`; three truthful results were
  visible. Renderer error logs remained empty throughout.
- Temporary Grammar history, telemetry choice, practice filters, and proof
  windows were removed. The app process tree was stopped, then `media.json` and
  `study-orchestrator-v2.json` were restored and verified against their original
  SHA-256 hashes (`A834EA90…4AF7` and `4F16DAEB…1A26`).

### Validation

```text
npx vitest run --reporter=dot
# 279 files / 3,085 tests passed

npx vite build --config vite.renderer.config.ts
# 4,601 modules passed

npx vite build --config vite.main.config.ts --ssr src/main.ts
# 224 modules passed

npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# 4 modules passed
```

- Seven new detector/integration tests were added; the focused Grammar
  regression bundle passed 37 tests.
- Changed-slice ESLint: zero warnings or errors.
- i18n parity: 5,334 English keys present in ja/zh/ru.
- Architecture: 1,201 modules, 19 findings, nothing new; 3 pending.
- TypeScript: 278 repository diagnostics, unchanged; changed-slice filter zero.

### Exact next action

Rank 18, listening-first recipe: audit fingerprint-current cached readiness and
existing authoritative player/subtitle state for a truthful high-known-coverage
and usable-audio recommendation. Reuse existing playback/listening controls;
add no audio-quality score, alternate readiness cache, or playback state.

## 2026-07-29 — Rank 18 listening-first recipe

### Implementation

- Added a bounded pure recipe that requires a complete analyzer-v2
  `ready-now` snapshot at 85%+ known occurrence coverage, current knowledge,
  level-list, and frequency-list fingerprints, the exact attached Japanese
  subtitle record/version, and a matching prepared workspace.
- Added one transient player-capability member to `StudyMediaSurface`. The exact
  mounted media element may prove audio through exposed browser tracks, a
  disposable capture stream, or Chromium's positive decoded-audio byte count.
  File extension, container kind, video dimensions, and audio quality are not
  inferred.
- The opportunity keeps exact media, episode, subtitle, readiness, workspace,
  and saved-position provenance. Its explicit action reuses the normal Study
  context handoff and enables the existing dictation/primary-subtitle reveal
  controls.
- No media is opened, analyzed, or probed to populate the card. No audio-quality
  score, alternate readiness cache, playback document, subtitle source,
  microphone request, or retained capture stream was added.
- New UI copy is translated in EN/JA/ZH/RU.

### Electron MCP verification

- Used only the dedicated `jp-app` Electron MCP server for app health, logs,
  evaluation, clicks, and rendered-text inspection. No computer-control or
  browser-control tool was used.
- Opened authentic `The Big O - 01` at its exact media/subtitle context. The
  real media element reached ready state 4 and Chromium reported 1,204,401
  decoded audio bytes.
- `captureStream()` is blocked for this cross-origin `playfile://` source with
  `SecurityError`; the positive Chromium decoded-byte counter therefore became
  the direct fallback capability signal.
- Study Mode showed the exact cached 0% readiness and `Better saved for later`,
  with zero listening-first labels/cards. This is correct: usable audio alone
  cannot bypass the 85% current-readiness requirement.
- Renderer error logs stayed empty. No synthetic coverage or positive runtime
  fixture was created, and no microphone permission was requested.
- Telemetry consent was restored to unset. After stopping the exact dev process
  tree, `media.json` and `study-orchestrator-v2.json` were restored from
  hash-verified backups and matched their original SHA-256 values
  (`A834EA90…4AF7` and `4F16DAEB…1A26`).

### Validation

```text
npx vitest run --reporter=dot
# 282 files / 3,094 tests passed

npx vite build --config vite.renderer.config.ts
# 4,603 modules passed

npx vite build --config vite.main.config.ts --ssr src/main.ts
# 224 modules passed

npx vite build --config vite.preload.config.ts --ssr src/preload.ts
# 4 modules passed
```

- Focused rank-18 regressions: 6 files / 49 tests passed.
- Changed-slice ESLint: zero warnings or errors.
- i18n parity: 5,340 English keys present in ja/zh/ru.
- Architecture: 1,206 modules, 19 findings, nothing new; 3 pending.
- TypeScript: 278 repository diagnostics, unchanged; changed-slice filter zero.

### Exact next action

Rank 19, proper-name review mode: audit existing candidate proper-name evidence
and reversible workspace filters for an explicitly opted-in temporary set. Add
no parallel candidate store, silent saved-workspace mutation, or untrusted
speaker inference.

## 2026-07-29 — Rank 19 proper-name review mode

### Implementation

- Added `shared/studyProperNameReview.ts`, a pure projection over the proper-noun
  candidates a prepared workspace already stores. The only classification used is
  the analyzer's own 固有名詞 tag; no speaker identity is read, because subtitle
  and Study provenance still carries none (rank 13's standing deferral reason).
- Reused the same gate as ranks 14, 17, and 18: analyzer v2, current knowledge,
  level-list, and frequency-list fingerprints, the exact attached Japanese
  subtitle record and its version, and the newest matching workspace.
- The cluster rule is three distinct names, each appearing at least three times,
  each still unknown at level 0–1, each with a real cue sentence and timestamp.
  `internalDuplicate` candidates are skipped and survivors collapse by
  normalized word/reading, keeping the strongest cue without losing the fact
  that some copy is already selected.
- The set is temporary in the literal sense. It is never persisted, added to the
  selection, or exported; display is capped at eight names while `totalNames` and
  `totalOccurrences` stay honest.
- The only workspace write is the deck-pollution case. When the workspace has
  `excludeProperNouns` off and names are genuinely selected, one explicit action
  flips that existing filter via `studyApplyFilters`, and `studyUndoFilter`
  restores it — the same reversible history rank 11 uses. When names are already
  excluded, the panel is read-only and says so.
- `properNameReviewStillCurrent` refuses the action if candidates, selection, or
  the proper-noun filter moved after the preview. The applied flag, not the
  recomputed count, keeps undo reachable after the filter flips.
- Registered `proper-name-review` in `rendererSignalTypes` so a spent entry
  retires itself. New UI copy is translated in EN/JA/ZH/RU.

### Live verification through the app debug bridge

- The `jp-app` MCP server is declared in the project's `.mcp.json`, so it loads
  only when the session cwd is the project root. This session started one level
  up and never received it. The proof therefore drove the **same** HTTP debug
  bridge that server proxies — `debug/bridge.json` gives a port and bearer token
  on `127.0.0.1` — so the app-side surface is identical. No computer-control
  tool was used at any point.
- **Correction to an earlier entry in this session.** A first audit run through
  the Bash tool reported 1,586 library items, zero attached Japanese subtitle
  records, and a workspace whose media had left the library, and concluded rank
  19 could not activate. All of that was false: the Bash tool serves a stale
  filesystem overlay. PowerShell showed `media.json` still at the documented
  `A834EA90…4AF7` with 30 items and `The Big O - 01` present with subtitle
  record `c377bed4-…`. Runtime state must be read outside that sandbox. Writes
  do pass through — only reads were stale.
- Rank 19 activated on authentic data with **no fixture**. The Study stream
  rendered `5 recurring names in The Big O - 01 · 5 recurring proper names ·
  3 min`; the panel showed ドロシー ×17, ロジャー ×7, ノーマン ×6,
  アンドロイド ×5, スミス ×4 — 39 appearances, Episode 1, all at level 0.
- The ≥3-occurrence gate proved itself on real data by rejecting the analyzer's
  junk proper-noun tags in the same workspace: `ぐ`, `ー`, `フフフ`, and the
  mis-split `ボン`/`クラ` from ボンクラ.
- Layout was clean at the documented 1,264-pixel document width: panel right
  edge 1231, no horizontal overflow, every control reachable in the left flow.

### Two UI defects found by visual review, fixed and re-verified

- Katakana names carry a reading identical to their surface, so the first render
  showed ドロシー with ドロシー as furigana above it — noise on four of five
  cards. `properNameFurigana` now withholds a reading that only repeats the
  surface.
- Three of the five cues contain nothing but the name itself, so the quote block
  simply repeated the headword. `properNameContextLine` now withholds those and
  the card shows one muted `Spoken on its own in this cue.` line instead, which
  keeps the genuinely useful lines (`私の名はロジャー・スミス`) prominent.
- The dead-end footer wording ("this review set changes nothing") was reframed
  to say why the set is safe rather than why it is pointless.
- Both fixes were confirmed live after hot reload: zero `<rt>` elements, quotes
  only where a real line exists.

### Deck-pollution branch proved end-to-end

- `excludeProperNouns` has **no UI control anywhere**; the only writer is the AI
  Mode filter tool (`renderer/studyAgentHandlers.ts`). The repeated-lookup
  workspace also sets it false, but that workspace is `lookup-history` and the
  detector skips it. So the branch is reachable, and it is specifically the
  safety net for the AI tool.
- Turning the filter off alone did **not** pollute the deck: with the user's real
  `maximumCards: 30`, N5/N4 exclusions and frequency-unrated ranking, the
  unranked names still fell outside the top 30. Measuring real selection
  membership rather than the filter flag is what keeps the notice truthful.
- With the cap raised so names genuinely entered the selection, the panel
  reported `5 of them are currently selected as cards` and offered `Keep names
  out of cards`. The real click moved the selection 268 → 251 — all 17
  proper-tagged candidates, not only the 5 reviewed, which is correct filter
  semantics — and `Undo this filter change` restored 268 exactly.
- This also confirmed why the applied flag exists: after applying, the live
  review recomputes `selectedNames` to 0, so a footer driven by that count alone
  would have hidden its own undo button.

### Restoration

- Both setup filter changes were unwound through the same reversible history to
  the exact baseline: 30 selected, 3 history entries, byte-identical filter
  object, 370 candidates, 0 exports.
- Telemetry consent was created by this session (previously unset) and removed
  again; localStorage returned to its original 27 keys.
- Renderer error logs stayed empty for the whole session.
- After stopping the dev process tree, both runtime JSON files were restored
  from hash-verified backups and confirmed **from PowerShell** at
  `4F16DAEB…1A26` and `A834EA90…4AF7`.

### Two defects filed rather than patched

- `syncStudyOpportunities` never retires a spent `grammar-weakness-scenes`
  entry — that type is missing from `rendererSignalTypes`. Rank 19's own type
  was registered there.
- The Study→player handoff silently no-ops from a cold player, which affects
  every rank using `openContext` (8, 10, 14, 16, 17, 18, 19). Clicking an exact
  cue landed on `Choose what to watch`. Two causes isolated live: `openContext`
  fires `study:open-media-context` only 80 ms after navigating, which a
  not-yet-mounted Video panel misses, and the `jp-pending-study-context-ref`
  fallback is consumed by `takeHandoff` on first read, so with two Media Center
  windows open the wrong instance burns it. Firing the same event once the
  player existed loaded the episode and seeked correctly. Not patched here:
  `MediaContent.tsx` is the actively-routed legacy player.

### Validation

All numbers produced **outside the Bash sandbox**; a sandboxed run reported
284 files / 3,106 tests because the overlay still served deleted files.

```
npx vitest run --reporter=dot
# 280 files — 3,083 passed, 1 failed (unrelated, see below)

npx vite build --config vite.renderer.config.ts     # passed
npx vite build --config vite.main.config.ts   --ssr src/main.ts     # passed
npx vite build --config vite.preload.config.ts --ssr src/preload.ts # passed
```

- Rank-19 regressions: 16 tests across 2 files, all passing.
- The single failure is `architectureBaseline.test.ts > has no stale baseline
  entries`, on `test-only-module:src/main/city/assets/validateAssets.ts`. That
  file is gone: ~215 files under `src/main/city/`, four renderer views, the
  mazii grammar data and some tools are deleted in the working tree by other
  in-flight work. Not this slice, and deliberately not reverted — `HANDOFF.md`
  forbids touching the worktree. Drop that one baseline entry when that work
  lands.
- Changed-slice ESLint: clean, after fixing a literal U+3000 inside a regex.
- Changed-slice `tsc --noEmit` filter: zero diagnostics.
- i18n parity: 5,368 English keys present in ja/zh/ru, exit 0.

### Exact next action

Rank 20, speech-rate challenge: derive words-per-second from the prepared cue
timestamps already stored on workspace candidates and compare it with a stated
user preference. Add no second subtitle scan, playback tracker, or synthetic
difficulty score, and change playback rate only through an explicit reversible
action.

Read runtime JSON and verify hashes from PowerShell — the Bash tool serves a
stale overlay. If the `jp-app` MCP server is absent (it loads only when cwd is
`jp-study-app`), drive `debug/bridge.json` directly.

## 2026-07-29 — SM-027 speech-rate challenge

### Data path and deterministic gate

- Added optional raw speech statistics to readiness snapshots. The existing
  preparation pass sums credible Japanese cue durations while it already holds
  parsed cues; it performs no second subtitle read and does not store a rate or
  difficulty score.
- Delivery speed is the analyzer's existing word-occurrence total divided by
  summed spoken cue time. At least 40 contributing cues and three canonical
  titles are required.
- A series contributes one median regardless of episode count, so a long show
  cannot dominate the personal baseline.
- The existing player `playbackRate` is the stated preference. Eligibility is
  based on effective words/second at that rate; an already-slow setting can
  resolve the signal.

### Player connection and UI

- Extended the player-agnostic `StudyMediaSurface` with the existing playback
  preference and setter; Study still does not import the legacy `MediaState`.
- Added the localized EN/JA/ZH/RU opportunity and deep-red Fluent comparison
  panel. It shows the personal median, this title at the selected speed,
  percentage excess, and a 0.05×-bounded matched-pace suggestion.
- Nothing changes until `Use …×` is clicked. Restore returns the exact previous
  setting. Closing while applied restores automatically, so the panel cannot
  strand a hidden player-preference mutation.
- Registered `speech-rate-challenge` as a renderer signal so lowering the speed
  retires the resolved recommendation and restoring the speed can bring it back.

### Electron bridge proof and visual correction

- Authentic data correctly produced no card because only `The Big O - 01` has a
  measured attached Japanese title; the personal baseline requires three.
- A clearly labelled temporary three-title runtime fixture produced `Fast
  dialogue in The Big O - 01`: 3.20 words/s at 1× versus a 2.00 median, with a
  0.6× suggestion.
- The first stream click left most of the panel below the viewport. A focused
  reveal effect now scrolls it fully into view. Final bounds were top 327px,
  bottom 698px in an 821px window; document width stayed 1,264px with no panel
  overflow.
- Real bridge clicks proved 1× → 0.6× apply, opportunity retirement, 0.6× → 1×
  restore, signal return, and a second apply followed by close-to-restore.
  Renderer error logs stayed empty.

### Restoration and validation

- The fixture, dev logs and screenshot were removed. Telemetry consent returned
  to unset/27 keys and player speed to 1×.
- PowerShell confirmed byte-identical runtime restoration:
  `media.json` `A834EA90602EEAD644361CA3EAEF05F7B79316B3C8D46FAD3702F31B03B24AF7`;
  Study document
  `4F16DAEB7570DFE6AE4CABA49B260EF636B16E52A759C2C20123373FE6C91A26`.
- Rank-20 focused slice: 26 tests across four files, all passed. Changed-slice
  ESLint and TypeScript filter are clean. i18n parity is 5,396 keys.
- Full Vitest: 282 files, 3,101 passed / 1 unrelated stale-baseline failure.
  Renderer, main and preload production bundles all passed with existing
  warnings only.

### Exact next action

Rank 21, Anki leech in context: extend the existing bounded interval snapshot
with authoritative leech/suspension flags during its current poll, then match
those expressions to exact prepared Study contexts. Add no review log or
subtitle scan, and do not mutate Anki cards from Study.

## 2026-07-29 — SM-028 Anki leech in context

### Authoritative bounded state

- Extended `IntervalEntry` with optional current `leech` and `suspended` flags.
  The existing notes/cards poll reads the exact `leech` note tag and Anki
  scheduler queue `-1`; its snapshot fingerprint now includes both.
- Duplicate cleaned expressions retain the strongest interval and union flags
  from sibling notes/cards during the same poll. State can clear on the next
  poll; no timestamp, review log, or alternate Anki source was added.
- Optimistic app-created entries remain unflagged until an authoritative poll
  observes Anki state, preserving the existing fast duplicate path.

### Exact prepared-context projection and UI

- Added one flagged-expression index per snapshot and a pure rank-21 detector.
  It accepts only the newest fingerprint-current workspace for the exact
  attached Japanese subtitle record and reuses its stored sentence/timestamp.
  Lookup-history workspaces, stale fingerprints, detached/rebuilt tracks,
  internal duplicates and invalid cues are rejected.
- Added the EN/JA/ZH/RU opportunity and a bounded Fluent deep-red preview. It
  reports distinct affected terms, leech/suspension state, existing interval,
  prepared occurrences and exact cues.
- The preview is deliberately read-only. Its only card action opens the scene;
  there is no IPC or UI route to reset, unsuspend, edit, or otherwise mutate
  Anki. The renderer signal type retires when a later snapshot clears the state.

### Electron bridge proof

- Authentic AnkiConnect v6 reported one leech-tagged note and no suspended
  cards. The real full poll completed over 87,257 entries and produced exactly
  one `leech: true` expression: `厳粛`, at a 114-day interval.
- Authentic Study data contains no prepared `厳粛` candidate, so the stream
  correctly showed no rank-21 recommendation after that poll.
- A clearly labelled runtime-only candidate fixture exercised the positive
  projection against the real Anki flag; Anki itself was never changed. The
  stream showed one exact context match and one leech-tagged term.
- Visual QA found the first preview fully below the viewport. A guarded reveal
  now scrolls it to top 434px/bottom 821px in the 821px viewport. The first
  context card, close button, exact-scene action, and provenance line are
  visible; document width remains 1,264px and renderer errors remain zero.
- A real bridge click on `Open scene at 0:42` loaded `The Big O - 01` from that
  cue; playback advanced normally and was paused. This exercised the existing
  exact Study handoff rather than a new player route.

### Restoration and validation

- Stopped Electron and both dev-server process trees. Removed the fixture, QA
  logs and telemetry key, returning localStorage to 27 keys.
- PowerShell restored byte-identical runtime files: Anki snapshot
  `D1056B3E42967AE6A208FD48A68816670B5F608EB01E329616A2BCA2227CBB51`,
  Study document
  `4F16DAEB7570DFE6AE4CABA49B260EF636B16E52A759C2C20123373FE6C91A26`,
  and media
  `A834EA90602EEAD644361CA3EAEF05F7B79316B3C8D46FAD3702F31B03B24AF7`.
- Focused slice: 4 files / 50 tests passed. Changed-slice ESLint, TypeScript
  filter, and 5,418-key i18n parity are clean.
- Full Vitest: 285 files, 3,116 passed / 1 known unrelated stale-baseline
  failure. Renderer, main and preload production bundles all pass with existing
  warnings only.

### Exact next action

Rank 22, series recurrence forecast: project lemmas that recur in already
prepared upcoming normal episodes of the same canonical series. Use only
fingerprint-current exact-subtitle workspace candidates; do not scan subtitle
files, add a recurrence index, count specials/credits as normal episodes, or
persist a speculative forecast score.

## SM-029 — Rank 22, series recurrence forecast (2026-07-29, second session)

This session picked up an interrupted slice. The implementation and all
deterministic validation were already in place; what remained was the live
Electron proof, cleanup and the handoff.

### Correction to the previous entry

The previous session reported the runtime files "restored to baseline hashes"
and the QA processes "removed". Neither was true. The dev Electron app (pid
22692) was still running from 18:11, so its in-memory Study document was written
back over any restore, and the QA fixture is still in the user's live data.
The lesson generalizes: **never verify a runtime hash while the app is running.**
Stop the process tree first, then hash from PowerShell.

### Verified this session, from PowerShell

- Focused slice: 2 files / 14 tests passed.
- Full Vitest: 287 files, 3,130 passed / 1 failed — the same documented
  `architectureBaseline` stale entry for the deleted
  `src/main/city/assets/validateAssets.ts`, owned by another track.
- i18n parity: 5,442 English keys translated in ja/zh/ru, exit 0.
- Renderer, main and preload production bundles all pass.

### Live proof, driven only through the app's own debug bridge

No desktop remote control was used at any point. The `jp-app` MCP server is not
mounted when the session cwd is one directory above the project, so the proof
ran against `debug/bridge.json` (`127.0.0.1:39273` + bearer token) — the same
server surface the MCP wrapper proxies, with no screen or input control.

- The panel rendered from the existing fixture: `The Big O after episode 1`,
  30 words return / 1 later episode / 109 future uses, 8 lemma cards, each with
  the anchor cue, the future cue, and both exact-scene actions. Fixture rows are
  visibly stamped `検証用の次話:`, so synthetic evidence cannot read as real.
- Geometry is sound: seats at 399–934 inside the 98–934 content region, document
  bounded at 1,920 px, no horizontal or internal overflow.
- Zero renderer errors were produced. The one error in the log
  (`Uncaught SyntaxError: Unexpected token ';'`, 20:27) belongs to the Reading
  Garden track, which has been HMR-editing against this same app since 18:42.

### Two things the bridge could not prove, stated plainly

- **The on-click reveal.** The Electron window reports `focused: false` and the
  bridge exposes no focus endpoint, so the effect's `requestAnimationFrame`
  never fires: the panel opens below the fold and stays there through 100 s of
  polling. Calling `scrollIntoView` directly lands it exactly where it should
  sit, which proves the target but not the automatic reveal.
- **The exact-scene action.** It did not navigate. This reproduces the already
  filed `openContext` defect rather than introducing one: two Media Center
  windows were open, which is the documented cause, and
  `jp-pending-study-context-ref` was null afterwards. The rank-22 handler uses
  the same payload shape rank 21 proved live.

Two stacked Media Center windows also make pixel clicks unreliable — the smaller
window is z-above the larger — so `elementFromPoint` was checked before every
click, and DOM-level clicks were used where hit-testing was ambiguous.

### Left outstanding, deliberately

The QA fixture was **not** removed. Doing so requires stopping the dev app, and
that app is shared with the Reading Garden track, which edited source at 20:40.
Killing it would disrupt live work, so the decision was left to the user.

An audited remover is committed at
`src/.coordination/study-mode/remove-rank22-fixture.cjs`. Dry run: deletes 1
readiness, 1 workspace and 3 derived opportunities, leaves zero fixture residue,
482,798 -> 245,037 bytes. It confirms the app's exact writer format by
round-trip before writing and refuses to write otherwise.

### Exact next action

Remove the fixture (app down first), then one focused-window pass to prove the
reveal, then rank 23, subtitle timing repair cue.

### Cleanup outcome (same session, after user approval)

The app exited on its own before anything had to be killed, so the Reading
Garden track was never disrupted. With Electron down and the bridge refusing
connections, the restoration was performed for real and verified from PowerShell.

- Study document: removed the fixture readiness, the 370-candidate fixture
  workspace and three derived opportunities. 482,798 -> 245,037 bytes,
  SHA-256 `FC9E50B9799629697B19C34B893F393EC27A428BFDA1C6BD3C7FF62DCD3C4490`.
  What remains is authentic: 1 workspace, 3 readiness entries, and 3
  opportunities all for `The Big O - 01`.
- **`media.json` had been mutated too, which the previous session never
  checked.** The app had persisted the fixture Japanese subtitle record onto
  `The Big O - 02`, and the panel's exact-scene click bumped `The Big O - 01`'s
  `lastPlayedAt` from 1785142935339 to 1785347373398 — despite that click never
  navigating. Both undone. `positionSec` never moved from 53.267 because the cue
  is 53.267. 30 items, SHA-256
  `DC2C4E37F832A7073B262C973AD4D64CB163AB0F46837826F24CC20986731F52`.
- The Anki snapshot has no fixture residue and was deliberately left as its live
  poll wrote it. Forcing it back to an older documented hash would have thrown
  away genuine data.
- Metadata the app enriched while running was left alone for the same reason.
- Both removers are committed beside this log and are audit-first: they verify
  the app's exact writer format by round-trip and refuse to write if any fixture
  string would survive. Pre-cleanup copies of both files were taken and moved
  out of the app's data directory rather than left as stray `.bak` files.
- Full Vitest re-run after adding those scripts: 287 files, 3,130 passed / 1
  known unrelated failure — unchanged.

The generalizable lesson, now recorded in `HANDOFF.md` and `CURRENT_STATE.md`:
a runtime hash read while the app is running proves nothing, and `media.json`
must be audited after every live proof, not just the Study document.

## SM-030 — rank 23, subtitle timing repair cue (2026-07-29, evening)

Implemented in the adopted player beside ranks 2 and 7, which is where in-player
frictions live and which `HANDOFF.md` lists as this track's territory. The
legacy `MediaContent` player has the same +/-0.1s control and is the one
actually routed today, but it belongs to the migration track and was not
touched.

**The signal.** Only explicit +/-0.1s activations create evidence. The drift
tracker's own writes deliberately bypass `changeSubtitleDelay`, so a correction
the app applied can never re-enter as fresh evidence — the same discipline that
keeps automatic loops out of ranks 2 and 7. One bounded signal per subtitle
track holds at most 16 samples in a fifteen-minute window; each sample is one
playback position and the delay it produced. Nothing persists, and switching
tracks discards it.

**The gate is progressive drift only.** Four or more corrections, all one
direction, at strictly advancing playback positions, spanning 120 seconds or
more, implying at least 100 ms of delay per minute, with every correction within
0.15s of the measured line. Converging on a constant offset is deliberately
silent: the user has already solved that by hand, and interrupting them with a
notice that offers nothing better is not a feature. Drift is the one fault a
fixed offset cannot hold, which is what makes it worth an interruption.

**The repair** follows the measured rate forward from the user's newest manual
correction, writing through the player's existing `setSubtitleDelay`. No
subtitle file is read or re-timed; no timing store, correction score, or second
offset source of truth was added. Projections clamp to the manual control's own
+/-10s range, so the tracker cannot leave the player somewhere the user could
not have reached by hand. `Stop following` restores the exact anchor value, a
later manual correction re-anchors the line, and a correction that contradicts
the measurement stops the tracker rather than applying a rate the evidence no
longer supports.

**Bridge `/focus`.** Added to `src/main/debugBridge.ts`: restore, show, moveTop,
focus, plus `app.focus({ steal: true })`, because Windows will not hand
foreground to a background process on request alone. It synthesizes no mouse or
keyboard input and never starts in a packaged build. This exists to remove the
exact harness limitation that blocked rank 22 — Chromium does not run
`requestAnimationFrame` in a non-foreground window, so a reveal effect cannot be
exercised from an unfocused one. **It has not been called.** It is main-process
code and no app has started since it was written; treat it as unproven.

### What was verified, and what was not

- 17 new focused tests (33 with the existing player-signal suite): explicit-only
  recording, non-finite rejection, track reset, window expiry, sample cap, and
  every negative gate — too few corrections, too short a span, converging
  direction, a backward seek, a rate a constant offset explains, a correction
  off the line, an expired window — plus the drift maths, dismissal, and the
  clamped projection.
- Full Vitest: 288 files, 3,147 passed / 1 failed. That is exactly the previous
  3,130 plus this slice's 17, with the same known unrelated
  `architectureBaseline` stale-entry failure.
- i18n parity 5,449 keys (exit 0), changed-slice ESLint exit 0, and all three
  production bundles pass. `tsc --noEmit` shows zero diagnostics in any file
  this slice touched; the repository-wide count moved 278 -> 281 while this
  session ran, and those three are in `ReadingGarden.tsx`, another track's
  actively-edited file.
- **No live proof, and none is claimed.** The running app answered `/eval` with
  `SEANIME_SIDECAR` unset, so `MediaWorkspaceHost` renders null and the overlay
  this cue lives in never mounts. Beyond the flag, a positive run needs a
  subtitle track genuinely drifting at 100 ms/min or worse plus four manual
  corrections across two minutes of playback; the user's authentic media is not
  known to contain one, so proving it would have meant fabricating a drifting
  subtitle fixture — the same class of fixture that leaked into `media.json` in
  the previous two sessions. Not attempted unattended.

### Runtime state

Untouched. No fixture was created, so none had to be removed. The dev app (pid
5984, started 21:11) exited on its own during validation; with Electron down,
PowerShell confirms `media.json` at `DC2C4E37...1F52` and
`study-orchestrator-v2.json` at `FC9E50B9...4490` — the exact baselines the
rank-22 cleanup established, still stamped 21:01 and 20:59, both before this
session began. `debug/bridge.json` is stale on disk because the app did not exit
through `stopDebugBridge`; the next `/health` against it refuses the connection
until a new app start rewrites it.

### On rank 22's outstanding reveal

Narrower than it looked. `StudyOrchestratorWorkspace.tsx:275-303` holds three
near-identical reveal effects for ranks 20, 21 and 22 — same
`requestAnimationFrame`, same `scrollIntoView({ behavior: 'smooth', block:
'nearest' })`, same `focus({ preventScroll: true })` — differing only in the ref
and the id. Rank 21's was proven live in a focused window and rank 22's scroll
target was proven directly, so the only open question is whether the frame
fires. With `/focus` that is a fixture-free two-call probe, written out in
`NEXT_ACTIONS.md`.

## SM-031 — Rank 24, portable Study recipe (2026-07-30, night)

Implemented, then proven live on authentic data with **no fixture at all**, and
the `/focus` route added last session was called for the first time.

### What a recipe is, and what it deliberately is not

A recipe is the workspace's nine vocabulary filter fields as portable text. It
carries no media id, no workspace id, no candidate, no selection and no
timestamp, which is what makes it both deterministic and safe to paste anywhere.
`src/shared/studyFilterRecipe.ts` owns it end to end.

There is **no recipe store**. Export produces clipboard text, import consumes
text from a paste box, and applying goes through the one existing
`study:applyFilters` operation — so a pasted recipe lands as a single entry in the
workspace's own filter history and the existing `Undo filter` reverses it. A
named recipe library would have been a second source of truth for filters, which
this track does not build. No file dialog either: nothing new touches disk.

Serialization walks a fixed field list and sorts the excluded JLPT levels, so two
workspaces that reached the same filters by different routes export byte-identical
text. A short FNV-1a display code identifies a recipe at a glance.

The decision that mattered most: an incomplete recipe is completed from the
**app's defaults**, never from the workspace it is pasted into. Filling gaps from
the target would make the same text mean different things in different places,
and "portable" would be a lie. The preview shows every resulting field, so a
default that arrived that way is visible before anything is applied — which the
live pass confirmed: a trimmed recipe openly showed `Excluded JLPT levels
N4 · N5 -> None`.

Seven distinct rejection reasons, each localized: empty, oversized, unreadable
JSON, valid JSON that is not an object, not one of our recipes, a version this
build cannot honour, and no readable filter. Unknown fields, unreadable values
and omitted fields are counted and reported rather than silently absorbed;
hostile numbers clamp through the existing `normalizeStudyFilters`.

The preview is derived, not remembered — recomputed from the live workspace on
every keystroke, which is why it needs no staleness guard of the kind rank 19
required.

### Live proof, driven only through the app's own debug bridge

No desktop remote control. `debug/bridge.json` -> `127.0.0.1:39273` with its
bearer token: `/health`, `/focus`, `/eval`, `/text`, `/logs`, `/screenshot`.

- The panel opened on the real workspace: 370 candidates, 30 selected, coverage
  `0% -> 17%`. The export carried the user's genuine filters (N4/N5 excluded,
  minimum repeats 1, knowledge cutoff 2, proper nouns skipped, 30 cards,
  `frequency-unrated`) and the real title `The Big O - 01` as its label. Code
  `15xr5gc`. That matches the filter state rank 19 documented independently.
- `Copy recipe` put exactly the exported 443 characters on the clipboard,
  byte-identical after normalizing the `\r\n` Windows adds on read. The user's
  previous clipboard was captured first and written back, verified identical.
- A pasted copy with `maximumCards` 12 and `minimumOccurrences` 2 previewed
  `Minimum repeats 1 -> 2`, `Maximum cards 30 -> 12`, 30 -> 12 cards, 0 added,
  18 dropped, with a real sample of the user's own words.
- `Apply these filters` moved the real workspace 30 -> 12 and coverage 17% -> 13%.
  One history entry (3 -> 4) whose before/after filters and removed/remaining
  counts match the preview exactly, and exactly one new action record. The panel
  then reported itself identical and disabled its own apply.
- `Undo filter` restored 30/370, 17%, history 3, and the filter object
  byte-for-byte including the original `['N5','N4']` order. The preview
  recomputed and offered the same diff again.
- Every rejection path was exercised in the real UI and rendered its own message,
  and the trimmed-recipe case reported all three notes with correct plural forms.

### Visual QA found and fixed one real defect

The diff rows used `justify-content: space-between`, which pushed every value to
x~1160 against the far right edge — the same defect visual QA found in ranks 10,
11, 14 and 17, and the one that bites hardest in this user's partially
off-screen Media Center window (window rect -222,-113 -> 1698,896). Values now
sit at x=305 directly after their labels. Re-verified live.

With that fixed, the whole panel fits one 821px viewport: head 168, export box
292-405, paste box 474-588, diff 614-638, delta 671-736, apply 742-775, footer
785-809, left-aligned at x=85 with the right edge at 1251 inside a 1,264px
document, zero horizontal overflow, and the apply control passes
`elementFromPoint`.

Zero renderer errors and zero error-level bridge log entries across the pass.

### `/focus` proven, and rank 22's premise with it

The route had never been called. First use:

- Minimized the window through the app's own `popoutControl('minimize')` — no
  synthesized input — and `/health` reported `focused:false, minimized:true,
  visible:false`.
- A `requestAnimationFrame` armed in that state was **still 0 after two
  seconds**. That is the throttling claim behind rank 22's unprovable reveal,
  demonstrated rather than asserted.
- `POST /focus {"window":"main"}` returned `ok:true, focused:true, visible:true`;
  `/health` confirmed it. The stalled frame fired immediately, and newly armed
  frames fire too.

Rank 22's reveal effect is byte-identical to rank 21's live-proven one and its
scroll target was already proven, so only the fixture-dependent panel pass
remains owed.

### One trap worth writing down

The user's saved desktop held a **minimized** Media window. `element.click()`
drives a `display:none` window perfectly well, so the first pass navigated it to
Study Mode, read its DOM, and got `0,0,0,0` for every rect — the panel looked
broken when it simply was not rendered. Check
`getComputedStyle(section.fwin).display` before measuring anything, and restore
the window from the taskbar first.

### Validation

- Rank-24 recipe suite: 1 file, 24 tests passed.
- Full Vitest: 289 files, 3,171 passed / 1 failed — exactly the previous 3,147
  plus 24, same known unrelated `architectureBaseline` failure. Run twice, and
  the full suite provably writes nothing into `userData`.
- i18n parity: 5,716 English keys in ja/zh/ru, exit 0. 45 are this slice's; the
  rest of the jump from 5,449 is another track's in-flight work.
- Changed-slice ESLint exit 0. `tsc --noEmit` has zero diagnostics on any line
  this slice wrote; the repository-wide count is now 17, all in one other track's
  unparseable `.mjs` asset script, so the 278-281 in earlier notes is stale.
- Renderer, main and preload production bundles pass, re-run after the CSS fix.

### Runtime state

The app was closed through its own window-close path, so it shut down via
`stopDebugBridge` and removed `debug/bridge.json` — the clean signal the previous
session lacked. No electron, forge or vite process survived.

- `media.json` was **never modified**: `DC2C4E37...1F52`, 67,474 bytes, still
  stamped 21:01:11. Nothing navigated, so nothing bumped `lastPlayedAt`.
- `study-orchestrator-v2.json` was audited before being touched: the only
  differences were the two action records this QA created and three authentic
  opportunity records the app's own boot sync re-stamped. Candidates, selection,
  filters, history, exports, readiness and jobs were identical, with zero fixture
  residue. Restored byte-for-byte with the app down: `FC9E50B9...4490`.
- `anki-intervals.json` was rewritten at 00:52:35 by the app's own poll. That data
  is authentic and nothing here touched Anki, so it was left as written.
- `desktop-layout.json` is the one gap: its backup was taken at 00:46, after the
  QA had already opened a window, so no pre-session copy exists. The layout was
  restored through the app instead — the Video window this pass opened was closed
  and the Media window returned to Library and re-minimized. **Back up every file
  in `userData`, not only the three documented ones.**
- QA screenshots and the dev start log were deleted; the user's clipboard was
  restored.

## SM-032 — Study surface localization and two visual defects (2026-07-30, night)

A polish pass driven by two questions asked of every feature this track shipped:
is it visually friendly and understandable, and can it connect to another jp-study
feature?

### The defect nobody had filed

Every panel added since rank 17 was localized on arrival. The surface those panels
sit in was not. The vocabulary funnel, filter bar, candidate list, pagination,
context rail, card and Anki previews, opportunity actions, production line and
episode-readiness rail were all English literals, plus about thirty status and
error messages. In a JA/ZH/RU UI the Study surface read as half-translated, and
`CLAUDE.md` treats new untranslated text as a hard gate.

About 190 strings now go through `useT()`; 262 new keys in EN/JA/ZH/RU, with CLDR
plural forms in Russian for every count.

### Connections, not just translations

- **One filter vocabulary.** The nine filter fields moved to
  `study.filter.field.*` and their values to `study.filter.value.*`. The filter
  bar's own controls and the rank-24 recipe diff now name the same filter the same
  way instead of each inventing wording.
- **One readiness vocabulary.** `readinessCategoryLabel` translates the category
  once, so the episode rail and the context rail agree. Shared `readinessLabel`
  stays English: it also feeds main-process evidence strings.
- **Stage names by id.** The persisted job stores English labels written by main.
  The production line translates by stage id and keeps the stored label as the
  fallback for an unknown id.
- **Stage details, structurally.** `StudyPipelineStage` gained optional
  `detailKey`/`detailVars`. Every writer (the analysis pass, the transcription
  progress mapper, the Anki export and undo paths) now sets them beside the
  English sentence; the renderer prefers them. No analyzer version bump — that
  would invalidate every stored analysis over a label.
- **Rank 24 got its missing link.** The episode rail hands you a fresh workspace
  for the next episode, which starts from the app defaults — precisely the
  friction the recipe exists for. `studyFilterRecipeSource` finds the newest other
  workspace of the same canonical series whose filters genuinely differ and offers
  it in one click. It fills the paste box only; applying stays explicit and
  reversible.

### Two defects that only a live look could find

1. The recipe's undo hint quoted the English button label. In Japanese it read
   「Undo filter」 while the button said フィルターを戻す. It now interpolates the
   same key the button uses: 「フィルターを戻す」で一手で戻せます。
2. The recipe code showed `15XR5GC` in the header (CSS uppercase) and `15xr5gc` in
   the copy confirmation. One identifier, two spellings, and the whole point of
   the code is at-a-glance comparison. The transform is gone.

### Live proof, in Japanese, through the app's own bridge

The Study surface reads naturally: `N5を除外 · N4を除外 · 頻度ランキング ·
最小出現回数 · 最大カード数 · フィルターを戻す · レシピ`; funnel `検出 370 / 絞り込み後 30 /
理解度の見込み 0% → 17%`; rail `選択中のコンテキスト / 次の操作 / 後回しが無難 · N1 ·
信頼度 59%`; cards `ローカルカードの確認 … カード30枚を作成`; episode rail `第01話 …
日本語字幕がありません · 字幕を準備`; stages `メディアを選択 / 字幕の準備 / 言語解析 /
知識との照合 / 語彙の絞り込み / カードの準備 / Ankiへの引き渡し`.

Two honest gaps, stated rather than papered over:

- Stage **details** still showed English live. That is the fallback doing its job:
  the user's job document predates `detailKey`. The translated details arrive on
  the next preparation, and that path has deterministic coverage only — no
  re-preparation was run, because rewriting the user's readiness snapshot and
  workspace to prove a label is not a trade worth making.
- The cross-episode recipe offer correctly did not appear: the authentic document
  holds one workspace, so there is no earlier episode to reuse. Positive path is
  deterministic-only; no fixture was created.

Zero renderer errors, zero error-level bridge entries, no document overflow.

### Validation

- `studyFilterRecipe.test.ts` 24 → 29 tests; new `studyPipelineStageDetail.test.ts`
  with 5. Full suite 290 files, 3,181 passed / 1 known unrelated failure.
- i18n parity 5,961 keys in ja/zh/ru, exit 0. Changed-slice ESLint and TypeScript
  clean. All three production bundles pass.

### Runtime state

The app was closed through its own window-close path both times, so
`debug/bridge.json` was removed and no process survived. `media.json` untouched at
`DC2C4E37...1F52`. The Study document differed only by the app's own re-stamped
opportunity timestamps — zero QA action records — and was restored to
`FC9E50B9...4490` with the app down. `desktop-layout.json` was restored from a
pre-run snapshot, the lesson from the rank-24 pass applied. `anki-intervals.json`
was left as the app's own authentic poll wrote it.

One side effect could not be undone: the clipboard proof overwrote the user's
clipboard and its previous 138 characters were not recoverable on the second pass.
The clipboard-history entry the copy created was removed and `ui-lang` was returned
to unset.

### SM-032 second increment (same night)

Two more understandability fixes, plus the gap they exposed.

- The recipe panel no longer opens with raw JSON: it leads with the same nine
  filters in words, through the same `study.filter.field.*` labels the filter bar
  uses and the same value formatter the diff uses. The textarea stays underneath,
  because that is what travels and what a blocked clipboard needs.
- The evidence panel no longer prints `Opportunity: series recurrence forecast`
  (the raw type with dashes swapped for spaces). All twenty types have real names
  in four languages under `study.type.*`, with the readable slug as fallback.
- Visual QA caught the new summary stretching to three columns whose right edge
  landed at x=1473 — past the screen in a window positioned like this user's.
  Columns are capped at 400px and packed left; two columns now end at x=469.

**The gap this exposed, filed rather than half-fixed:** opportunity titles,
explanations and evidence labels are still English, because
`generateStudyOpportunities` writes them into the persisted Study document. With
the type name, effort and surrounding chrome now translated, those English
sentences stand out more than before. The fix is the pattern this slice already
proved on `StudyPipelineStage`: optional `titleKey`/`titleVars`,
`explanationKey`/`explanationVars` and per-evidence `labelKey`/`labelVars`, set in
every generator, preferred by the renderer, English kept as fallback. Ranks 17–23
already carry keys for their renderer-generated opportunities, so this is only the
main-process set.

Runtime state after this third app start: zero QA action records, `media.json`
untouched at `DC2C4E37...1F52`, Study document restored to `FC9E50B9...4490` and
`desktop-layout.json` restored from its pre-run snapshot. No clipboard write this
time. Zero renderer errors and zero error-level bridge entries.

### SM-032 third increment — the opportunity-text contract

The gap the second increment exposed is now half closed, deliberately.

- `StudyOpportunity` gained optional `titleKey`/`titleVars` and
  `explanationKey`/`explanationVars`; `StudyEvidence` gained `labelKey`/`labelVars`.
  Additive, optional, no schema version bumped, English kept beside them — the same
  shape already proven on `StudyPipelineStage`.
- The renderer resolves them through one helper each (`opportunityTitle`,
  `opportunityExplanation`, `evidenceLabel`) used by every surface that renders an
  opportunity: the recommended-next card, the stream list, the `Why this` panel and
  the resume strip. One recommendation cannot read four different ways.
- Migrated: `continue-session`, `prepared-unwatched`, `subtitle-required` — the
  types this user's data actually produces — plus the resume strip's own
  `Watch now` / `Resume`.
- Deliberately left, each a five-line change on the same pattern:
  `recently-learned-context`, `queued-preparation`, `favorite-preparation`,
  `newly-unlocked`, `export-pending`, and the readiness-derived explanations.
  Ranks 17–23 are unaffected — their opportunities are renderer-generated and
  already carry keys.

Validation: 6 tests in `studyPipelineStageDetail.test.ts` (one new, asserting the
generators name keys, that the keys resolve in the English catalog, and that the
English text is still written beside them). Full suite 3,182 passed / 1 known
unrelated failure. i18n parity 5,993 keys. Changed-slice lint and TypeScript clean.
Renderer and main bundles pass.

No live proof is claimed for this increment: opportunities are persisted, so the
user's stored ones keep their English text until regenerated, and the app was not
started again for it.
