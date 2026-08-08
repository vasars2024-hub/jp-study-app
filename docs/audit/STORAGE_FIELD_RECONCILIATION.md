# Storage field reconciliation — audit item 6.1, tier 2

Generated 2026-08-07T17:41:19.271Z by `docs/migration/tools/storage-field-reconcile.mjs`.

For every live object-valued key: the fields the **writer's type** produces, the fields
**present** in the running profile, and whether each written field is **read** anywhere else
in `src/`.

## Summary

| Measure | Value |
|---|---|
| Live keys holding an object | 30 |
| Compared (writer type resolved) | 20 |
| Writer found but type gave no fields | 5 |
| No named writer in source | 0 |
| **Keys with field drift** | **1** |
| Fields present but not writable | 0 |
| Fields writable but absent | 17 |
| Fields written and read nowhere | 0 |

### Keys with field drift — 1

| Key | Present, not writable | Writable, absent |
|---|---|---|
| `jp-os-display-prefs-v1` | — | `animationLevel`, `baseFontPx`, `boldText`, `brightness`, `colorFilter`, `contrast`, `focusRing`, `letterSpacing`, `nightLight`, `pointerSize`, `reduceFlashes`, `saturation`, `scrollbarMode`, `smoothScroll`, `transparency`, `underlineLinks`, `windowChromeMode` |

### Fields written and mentioned nowhere in src/

_None._

### Fields read only inside their own writing module — candidates, not verdicts

A field the store round-trips but no consumer outside the store ever looks at. Some are
genuine internal bookkeeping; some are settings that persist and drive nothing. Each needs
reading before it counts as a finding.

| Key | Fields | Writing module |
|---|---|---|
| `jp-study.onboarding.v1` | `lastStepId` | src/renderer/onboardingStore.ts |
| `jp-os-achievements-v1` | `lastDailyCharsBucket`, `lastStreakCelebrated` | src/renderer/environment/achievements.ts |

### Keys whose writer type could not be resolved — 5

Listed so they are not mistaken for clean comparisons. A `Record<string, unknown>` or a
`JSON.parse` result has no declared fields, so there is nothing to compare against.

- `jp:directstream-open-generation` — non-object-payload, live fields: clientId, generation
- `jp-aero-environment-v1` — writer-type-unresolved, live fields: achievementCelebrations, activePlaylistId, ambientAudio, buddyRoutines, calendarWallsEnabled, companionActiveness, companionCelebrate, companionPauseWhenStudying, companionReactivity, companionTypes
- `jp-book-level-cache-v1` — writer-type-unresolved, live fields: 02f12ce9-283b-4f11-a67e-4e18a312ffb0, 05d06e9a-77f0-459b-b0c3-c07157ae2152, 0785616f-ee62-4cf0-b8dc-2c322ae3569c, 078d8fa0-ef33-4127-a8cf-e40089869d2a, 151a85cc-6d5e-4e16-894a-ae83435c82b4, 4b25bb16-516e-4309-8eef-5ab8ab9ceb94, 4cbd1e61-09fd-43e8-8edf-355762f8f98d, 70931740-9100-45fc-8af2-db64b52c146a, 7cc53a32-8803-45a2-93de-31722bd406af, 87258c38-1493-4326-b3bb-bb286e06e3d8
- `jp-study-stats-v1-ja` — non-object-payload, live fields: books, days, shows
- `sea-media-core-preferences` — not-in-census, live fields: autoNext, autoPlay, autoSkip, chapterMarkers, muted, playbackRate, showStats, skipPatterns, timestampMode, version
- `noctis-session-queue-v2` — not-in-census, live fields: accumulator, clientId, lastSavedCount, lastUserLevel, nextSequence, pending, seenBooks, version
- `jp-study-environment-backup-v1` — writer-type-unresolved, live fields: achievementCelebrations, activePlaylistId, ambientAudio, buddyRoutines, calendarWallsEnabled, companionActiveness, companionCelebrate, companionPauseWhenStudying, companionReactivity, companionTypes
- `noctis-pages-queue-v1` — not-in-census, live fields: clientId, nextSequence, pending, pendingPages, version
- `jp-deck-level-cache-v1` — writer-type-unresolved, live fields: 48dcfd84-7581-431e-bc1e-bcf0eb94901b::容疑者Ｘの献身, e0eed414-3840-4b1c-96d9-32baf9a51519::メインページ
- `jp-grammarx-explorer-filters-v1` — writer-type-unresolved, live fields: categories, excludeCategories, familiarity, functions, lang, levels, query, registers, requireExamples, sort
