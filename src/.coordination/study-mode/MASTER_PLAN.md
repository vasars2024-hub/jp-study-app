# Master plan

## SM-001 — Protect and characterize foundations

Status: Verified

- Preserved the unrelated dirty worktree and changed only `src/`.
- Characterized the media queue, legacy Study persistence, player handoff,
  known-word/JLPT inputs, flashcard writes, Anki gateway, tokenizer, and
  persistent transcription queue.

## SM-002 — Shared orchestration model

Status: Verified

- Added normalized opportunities, readiness snapshots, workspaces, pipeline
  jobs, context references, action records, filters, undo, pagination,
  deterministic scoring, and stable analysis fingerprints.
- Added unit coverage for readiness boundaries, evidence, filtering, undo,
  duplicate normalization, pagination, pipeline state, and invalidation.

## SM-003 — Durable persistence and IPC

Status: Implemented and bundle-verified

- Added an authoritative versioned main-process document under Electron
  `userData`, atomic replacement, one-time legacy migration, cache reuse, and
  typed preload APIs.
- Main tokenizer reuse replaces the duplicate mining tokenizer bootstrap.

## SM-004 — Connected card and Anki pipeline

Status: Implemented and bundle-verified

- Local previews check normalized lemma/reading across the complete deck.
- Created cards retain typed media context and can be removed as a batch.
- Anki preview uses the shared profile/interval gateway; execution continues
  through `mineNote`, records per-item results, and safely retries failures.

## SM-005 — Study workspace and AI tools

Status: Implemented and bundle-verified

- Replaced the passive Study dashboard with a dominant recommendation,
  resumable strip, state-driven production line, reversible vocabulary funnel,
  bounded candidate list, evidence rail, and card/Anki continuations.
- Added eight typed Study tool operations to the existing local-agent registry.
- Exact media/subtitle/timestamp context is restored and playback state is
  checkpointed every five seconds while the workspace is active.

## SM-006 — Verification and handoff

Status: Complete with one environment limitation

- Targeted: 11 files / 84 tests passed.
- Full suite: 245 files / 2,716 tests passed.
- Renderer, main, and preload Vite builds passed.
- Full TypeScript remains blocked by broad pre-existing repository errors;
  filtered output contains no errors in the new Study modules.
- A live Electron visual smoke test was not completed in this non-interactive
  pass; production bundle compilation and automated coverage are verified.

## SM-007 — MCP visual smoke and bounded workspace hardening

Status: Verified

- Verified empty and queued recommendation states through the repository-local
  `jp-app` MCP bridge and restored the temporary queue mutation.
- Added bounded 60-item vocabulary navigation and real video-position sampling.

## SM-008 — Real transcription lifecycle and headless AI preparation

Status: Implemented and verified

- Study transcription jobs now reference the shared persistent transcription
  queue and persist queued, active, complete, cancelled, and failed progress.
- Production status includes real chunk progress plus safe cancel/retry actions.
- AI preparation no longer depends on a mounted Study page. It reads a stored
  Japanese subtitle and prepares it directly, or queues shared transcription
  and reports the real pending job.
- Non-Japanese tracks can no longer be used as a fallback for Japanese
  readiness scoring.

## SM-009 — Real subtitle vertical-slice verification

Status: Verified

- Synchronized generated opportunity state into the authoritative document and
  retired stale active signals without erasing dismissed/snoozed history.
- Distinguished an attached Japanese record from missing subtitle data.
- Routed visible preparation through the same stored-record service as AI.
- Fixed candidate-level cross-window handoff to preserve subtitle identity and
  cue timestamp.
- Corrected the global `.is-selected` style collision found in MCP screenshots.
- Verified a real `The Big O - 01` flow through discovery, readiness, typed
  N5/N4 filter/undo/reapply, card/Anki previews, exact player cue, and return to
  the persisted Study workspace.

## SM-010 — Durable level lists and user frequency ranking

Status: Implemented and restart-verified

- Moved potentially large N1–N5 imports to an IndexedDB-authoritative store
  with a synchronous local cache, boot reconciliation, explicit import flush,
  legacy-array migration, and settings migration retention.
- Added normalized modern-Anki APKG support for `notetypes` / `fields` schemas.
- Imported the user's five Documents decks and verified their exact counts
  through two complete Electron restarts.
- Enriched Study candidates from the user's enabled frequency dictionaries and
  added persisted `All words` and `Only words missing JLPT` ranking modes.
- Frequency-list fingerprints now invalidate stale analysis, while reanalysis
  preserves the user's filters, ranking choice, selections, and exports.

## SM-011 — Repeated lookup opportunity

Status: Implemented and automated-verified

- Evolved the existing bounded lookup-history source to retain canonical
  lemma, reading, meaning, context, language, and recent lookup timestamps.
- Added a deterministic 2+ lookup opportunity and a real persisted vocabulary
  workspace that excludes known, saved, locally mined, and Anki duplicates.
- Dictionary success records once per submitted lookup, including repeated
  submission of the same query.

## SM-015 — Comprehension overload rescue

Status: Implemented and automated-verified

- Reused real player lookup, rewind, pause, and exact cue events in one
  session-local two-minute window.
- Required two lookups, two explicit rewinds, and a pause in a nearby cue
  neighborhood; automatic loops are excluded at the seek boundary.
- Shows no interruption during active playback. The explicit rescue action
  reuses the existing A-B loop for the surrounding three-cue scene.
- Full suite and all production bundles pass. Live media activation was blocked
  by an untouched Windows firewall permission dialog.
