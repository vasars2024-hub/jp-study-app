# Ranked opportunity catalogue

Score is a relative `value × frequency × confidence ÷ cost` estimate from 1–10.
Only the completed vertical slice is exposed in the UI; the rest are deferred.

| Rank | Opportunity | User friction removed | Signals and deterministic rule | Destination | Score | State |
|---:|---|---|---|---|---:|---|
| 1 | Repeated lookup pack | Repeatedly searching the same word | 2+ lookups, not known/mined | Vocabulary workspace | 9.5 | Implemented |
| 2 | Replay-to-shadowing | Manually finding hard lines | 3+ explicit replays in one cue | Player shadowing | 9.2 | Implemented |
| 3 | Newly unlocked favorite | Rechecking old difficult titles | Coverage crosses 85% | Exact media context | 9.0 | Implemented |
| 4 | Prepared-but-unwatched | Forgetting completed preparation | Prepared workspace, no later playback | Resume strip | 8.9 | Implemented |
| 5 | Failed export recovery | Rebuilding partial Anki batches | Failed items with successful IDs retained | Anki preview | 8.8 | Implemented |
| 6 | Recently learned in media | Abstract card review | Mature/recent card appears in library subtitles | Context session | 8.6 | Implemented |
| 7 | Comprehension overload rescue | Excess pausing/rewinding | Lookup + rewind density threshold | Small scene preview | 8.4 | Implemented |
| 8 | Episode readiness rail | Opening episodes to compare | Cached readiness per episode | Player/Study | 8.2 | Implemented |
| 9 | Subtitle-track upgrade | Using weak or mistimed subtitles | Higher quality track arrives | Analysis refresh | 8.0 | Implemented |
| 10 | Cross-title reinforcement | Seeing only one usage | Lemma appears across 3+ titles | Comparison session | 7.9 | Implemented |
| 11 | Abandoned-set resizing | Oversized sessions | Repeated abandonment above set size | Smaller workspace | 7.8 | Implemented |
| 12 | Missing card assets repair | Manual card auditing | Media-context card lacks audio/image | Card preview | 7.7 | Deferred |
| 13 | Character vocabulary pack | Unfocused series preparation | Speaker metadata + recurring unknowns | Vocabulary workspace | 7.5 | Deferred |
| 14 | Scene-based quick session | Planning short study | Dense high-value segment fits duration | Player session | 7.4 | Implemented |
| 15 | Stale queue cleanup | Outdated Study debt | Learned/exported/removed source invalidates item | Cleanup preview | 7.3 | Implemented |
| 16 | Easier bookmark alternative | Choosing overwhelming media | Compare cached favorite coverage | Recommendation | 7.2 | Implemented |
| 17 | Grammar weakness scenes | Disconnected grammar review | Failed pattern + matching cues | Grammar/context | 7.0 | Implemented |
| 18 | Listening-first recipe | Reconfiguring controls | High known coverage + clear audio | Player listening | 6.9 | Implemented |
| 19 | Proper-name review mode | Names polluting decks | Proper-name cluster + opt-in | Temporary set | 6.7 | Implemented |
| 20 | Speech-rate challenge | Unexpected listening difficulty | Words/second above preference | Assisted playback | 6.6 | Implemented |
| 21 | Anki leech in context | Repeated card failure | Leech/suspended note has source | Exact scene | 6.5 | Implemented |
| 22 | Series recurrence forecast | Mining one-off words | Lemma recurs in upcoming episodes | Ranked preview | 6.4 | Implemented |
| 23 | Subtitle timing repair cue | Fighting offset manually | Repeated offset changes | Subtitle tools | 6.2 | Implemented |
| 24 | Portable Study recipe | Recreating filters | Saved deterministic filter snapshot | Import/export | 5.9 | Implemented |
| 25 | Offline preparation bundle | Losing optional services | Upcoming title + local assets | Cache queue | 5.8 | Deferred |
| 26 | Review-to-media handoff | Review ends without immersion | Reviewed cards have media links | Player context | 5.7 | Deferred |
| 27 | Low-confidence audit | Trusting weak estimates | Confidence below threshold | Evidence rail | 5.6 | Deferred |
| 28 | Dictionary-quality cleanup | Bad candidate definitions | Missing/ambiguous matches | Card preview | 5.4 | Deferred |
| 29 | Goal-aware ordering | Manual prioritization | Goal, duration, readiness, recency | Study queue | 5.2 | Deferred |
| 30 | Completion digest | Hunting finished jobs | Jobs completed since last visit | Opportunity stream | 5.0 | Deferred |

Privacy/performance rule: derive locally from existing events where possible,
store only bounded evidence, fingerprint expensive analysis, and never send
complete subtitle libraries to AI.

Rank 15 retires an item for exactly three reasons: its media left the library,
its exact Japanese subtitle record is no longer attached, or every selected word
in its workspace is already exported or known. A stale analysis is never a
reason — refreshing it is the truthful action — and retirement only changes
opportunity status, so cards, candidates, workspaces, media, and subtitle
records are preserved and the change is undoable.

Rank 23 fires only on *progressive* drift — repeated corrections, all one way,
at strictly advancing playback positions, across a real span, at a rate no fixed
offset can hold, with every correction on the same line. Converging on one
constant offset is deliberately not a signal: the user has already solved that
by hand, and the app has nothing better to offer them.

Rank 24 is a *snapshot*, not a library. It exports the nine filter fields as
byte-stable text and imports them back through the existing reversible filter
operation; there is no saved-recipe document, because that would be a second
source of truth for filters. An incomplete recipe is completed from the app's
defaults, never from the workspace it is pasted into — otherwise the same text
would mean different things in different places, and "portable" would be a lie.

Rank 12 remains deferred because missing local asset roles are detectable but
there is no authoritative managed VideoCore asset write/update path for an
in-place repair. Rank 13 remains deferred because subtitle/Study records do not
carry trustworthy speaker identity.
