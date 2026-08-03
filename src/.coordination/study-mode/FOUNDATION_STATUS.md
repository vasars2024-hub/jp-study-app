# Foundation status

| Foundation | Final status | Evidence |
|---|---|---|
| Media favorite/study queue | Verified and reused | `MediaItem.studyQueue` remains explicit; favorites only suggest |
| Subtitle records | Verified and reused | Record ID is carried through `StudyContextRef` and reopened exactly |
| Transcription queue | Repaired and reused | Study persists the shared queue's real phase/progress, exposes safe cancel/retry, and queued cancellation broadcasts truthfully |
| Japanese tokenization | Repaired | Cached `main/japaneseTokenizer.ts` is shared with mining and Study |
| Known vocabulary | Verified and reused | Bounded level snapshot plus fingerprint |
| Imported JLPT lists | Repaired and restart-verified | IndexedDB authority, boot reconciliation, explicit flush, migration retention, and five real Documents decks |
| User frequency dictionaries | Verified and reused | Enabled dictionary ranks enrich candidates; fingerprinted all-word or JLPT-missing-only ordering |
| Study persistence | Repaired | Main-process v2 document, atomic replace, legacy one-time migration |
| Flashcard pipeline | Repaired for slice | Preview, normalized duplicates, typed source context, action batch undo |
| Anki pipeline | Repaired for slice | Read-only preview, shared `mineNote`, partial retry state |
| AI operations | Repaired for slice | Typed registry, permissions, confirmations, truthful structured results, and page-independent media preparation |
| Player handoff | Verified with real episode | Typed session handoff plus live event restores the exact media, Japanese track, and cue across separate Media Center instances |
| Production status | Verified | UI stages derive only from persisted `StudyPipelineJob` state |
| Candidate pagination | Verified | Main API returns bounded pages; UI exposes 60-item Previous/Next navigation |
| Japanese subtitle selection | Repaired | Study never analyzes a non-Japanese fallback track |
| Opportunity persistence | Repaired and live-verified | Generated recommendations preserve status, retire stale active signals on full sync, and do not delete unrelated signals on single-item writes |
| Stored-track preparation | Repaired and live-verified | Visible UI and AI use the same direct record reader; 267 real cues produced a durable workspace |
| Dictionary lookup evidence | Repaired and reused | Existing bounded history stores canonical successful lookups and derives the repeated-lookup pack |

No Study-only replacement was introduced for bookmarks, subtitles,
transcription, known words, JLPT lists, local cards, Anki profiles, or playback.
