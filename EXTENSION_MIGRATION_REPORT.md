# Extension Migration Report (v2.4.7 → v3.0.0)

Migration is versioned (`jpStudySettings.version: 2`), idempotent, and runs
in `jpMigrateSettings` (called from every `normalize`) plus a one-time
re-save in `background.js onInstalled`.

## Preserved

| v1 data | v2 result |
|---|---|
| `token`, `port` (incl. legacy `jpStudyToken`/`jpStudyPort` keys) | kept verbatim; mirror keys still written |
| `preferAnki: true` | `saveDestination: 'both'` |
| `preferAnki: false` | `saveDestination: 'app'` |
| `localFolderLabel` | `folderLabel` |
| `wheelSlots` (old ids, 4 or 6) | alias-mapped to command ids, de-duplicated, padded with defaults to 6 positions |
| `youtubeMode`, `youtubeAudioOnly` | kept |
| `fabVisible/StartCollapsed/Corner`, `fabShowLevel/Comprehensibility/Theme/Highlight/Learn/Ocr` | kept |
| `fabHiddenOrigins` (per-site panel hiding) | kept |
| `logImmersion`, `notes` | kept |
| Retry queue `jpStudyRetryQueue` | kept; all v1 kinds map to the same endpoints; unknown kinds are dropped (never re-sent blindly) |
| Per-origin theme/highlight/tint keys (`jpTheme:*`, `jpHlMode:*`, `jpLearn:*`) | kept, untouched |
| Browser command bindings (`save-page`, `dictionary-popup`, `mine-selection`, `action-wheel`, `bulk-tabs`) | ids unchanged, so user-assigned shortcuts survive; descriptions renamed |

## Dropped (feature removed, keys deleted on save)

- `wheelSlotCount` — the wheel is always six positions.
- `fabShowDest` — the "Mine → Anki" destination badge no longer exists.
- `fabShowContext` — the "Category · profile" badge no longer exists.

## Compatibility shims

- `COMMAND_ALIASES` accepts every old action id anywhere a command id is
  read (wheel layouts, `run-command` messages).
- Content script still answers the old `jp-get-mine-payload` message
  (alias of `jp-get-save-payload`).
- No user data is deleted: the migration only renames/reshapes settings; the
  library, Anki, and app-side data are untouched (they live in the app).
