# Decisions

## ADR-SM-001 — Main process owns durable Study orchestration state

Status: Accepted

The current renderer-local document cannot safely drive restart recovery,
background work, or typed agent operations. A versioned main-process document is
the authority; renderer storage is used only for one-time migration and caching.

## ADR-SM-002 — Reuse existing domain sources of truth

Status: Accepted

Study Mode reads media state, subtitle records, transcription jobs, known-word
levels, imported level lists, local flashcards, and Anki through their existing
services. It does not create Study-only copies of those systems.

## ADR-SM-003 — Deterministic readiness and filtering

Status: Accepted

Readiness categories and vocabulary filters are pure application logic. AI may
select typed operations and explain results but cannot calculate or mutate them
through free-form text.

## ADR-SM-004 — First release is one vertical slice

Status: Accepted

The first release completes queue/favorite → readiness → filters → cards/Anki →
media return. Additional ideas are catalogued but do not become dead UI.

## ADR-SM-005 — Production motion represents persisted state

Status: Accepted

The production line uses only `StudyPipelineJob` statuses. CSS supplies subtle
transforms and pulses, while reduced motion preserves every status label,
failure detail, and next action.

## ADR-SM-006 — AI uses the normal Study services

Status: Accepted

Study commands are typed operations in the existing permission and confirmation
registry. They call the same APIs as visible controls; no chat-only mutation
path exists.

## ADR-SM-007 — Japanese readiness requires a Japanese source track

Status: Accepted

Study does not fall back to the first available subtitle when no Japanese track
exists. English or other-language subtitles must never produce a Japanese
readiness score. AI and visible preparation use the same selector and queue the
shared Japanese transcription workflow when no valid track exists.

## ADR-SM-008 — Transcription progress is observed in the main process

Status: Accepted

The shared transcription queue remains authoritative. It publishes phase
changes to an isolated main-process observer, and Study persists only a
reference plus normalized production-stage state. The renderer displays and
controls that state but does not invent or advance it.

## ADR-SM-009 — Opportunity sync distinguishes full snapshots from point writes

Status: Accepted

The renderer owns current queue/favorite signal derivation while the main
document owns status history. A full snapshot may retire stale active generated
signals. A point write used before dismiss/snooze/undo only upserts the supplied
opportunity and cannot remove unrelated recommendations.

## ADR-SM-010 — Attached subtitle and analyzed readiness are separate states

Status: Accepted

A real Japanese subtitle record is sufficient to offer deterministic analysis,
but not to fabricate a readiness score. Study shows “analysis pending” with the
record identity, while “subtitle missing” is reserved for media with no valid
Japanese record.

## ADR-SM-011 — Exact player context crosses component instances explicitly

Status: Accepted

Opening a separate Video workspace cannot rely on the Study component's local
player state. Study writes a typed one-shot session handoff and emits a live
context event. The player consumes either path, loads the record, and seeks to
the candidate cue before falling back to the session return timestamp.

## ADR-SM-012 — Large imported level lists are IndexedDB-authoritative

Status: Accepted

N1–N5 APKG imports can exceed localStorage quota, and silent quota failures made
configured lists disappear on exit. IndexedDB owns the versioned payload.
localStorage remains a best-effort synchronous cache, imports explicitly flush
before reporting success, and boot reconciles the newest valid copy before the
renderer mounts.

## ADR-SM-013 — Frequency fallback reuses user dictionaries

Status: Accepted

Study does not create a second frequency source. Candidate ranks come from the
same enabled, user-configurable frequency dictionaries used by mining. Users
choose whether frequency reorders the complete filtered list or only the slots
whose candidates are missing a configured JLPT classification. Dictionary
metadata participates in cache invalidation.

## ADR-SM-014 — Repeated lookups evolve the existing history store

Status: Accepted

Repeated lookup evidence is folded into the existing bounded recent-lookup
records. A successful canonical result records once per submitted lookup.
Study derives a 30-day, two-lookup opportunity locally and does not introduce a
parallel behavior tracker.

## ADR-SM-015 — A portable recipe is a snapshot, not a library

Status: Accepted

Rank 24 exports the workspace's nine vocabulary filter fields as byte-stable text
and imports them back through the one existing `study:applyFilters` operation. It
adds no saved-recipe document, no file dialog, and no second filter store, so a
pasted recipe is one existing `Undo filter` away from gone.

The text carries no media id, workspace id, candidate, selection or timestamp.
Its only non-filter field is a display-only label taken from the media title,
which is never applied and — being study content, not chrome — is never
translated.

## ADR-SM-016 — An incomplete recipe is completed from defaults, never from the target

Status: Accepted

A trimmed or partly damaged recipe fills its missing fields from
`DEFAULT_STUDY_FILTERS`, not from the workspace it is being pasted into.
Inheriting from the target would make identical text mean different things in
different places, which would defeat the point of a portable snapshot. Unknown
fields, unreadable values and omitted fields are counted and reported in the
panel, and the preview shows every resulting field before anything is applied, so
a default that arrived this way is always visible first.

Rejections are explicit codes rather than a silent no-op: empty, oversized,
unreadable JSON, valid JSON that is not an object, not one of our recipes, an
unsupported version, and no readable filter.

## ADR-SM-017 — The recipe preview is derived, not remembered

Status: Accepted

The import preview is recomputed from the live workspace on every keystroke rather
than stored when the recipe is pasted. Rank 19 needed a staleness guard because
its preview was held across an action; deriving instead removes that class of bug
entirely, and it is why applying twice is a no-op the panel can disable itself for.
