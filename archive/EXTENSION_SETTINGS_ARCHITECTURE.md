# Extension Settings Architecture

## Storage model (`extension/settings.js`)

Single key `jpStudySettings`, `version: 2`, normalized on every load through
`jpNormalizeSettings` (clamping, enum checks, wheel de-duplication). Legacy
mirror keys `jpStudyToken` / `jpStudyPort` are still written for the
background's fast path. `shared.js` + `settings.js` load in every context
(content script, options, background via `importScripts`).

Schema (v2): pairing (`token`, `port`); hover lookup (`hoverLookup`,
`hoverKey`, `hoverDelayMs`, `closeOnRelease`, `clickLookup`, `scanLength`,
`lookupInEditable`); reader popup (`popupWidth`, `popupFontSize`,
`popupCompact`, `popupPinOnClick`); saving (`saveDestination: 'app'|'both'`,
`folderLabel`, `confirmBeforeCard`); media (`youtubeMode`,
`youtubeAudioOnly`); wheel (`wheelEnabled`, `wheelSlots[6]` of command ids);
page panel (`fabVisible`, `fabStartCollapsed`, `fabCorner`, `fabShow*`,
`fabHiddenOrigins`); misc (`logImmersion`, `notes`).

## Options page (`options.html` / `options.js`)

- Left navigation (sticky; wraps on narrow screens), hash-routed panes:
  Hover lookup · Reader popup · Saving & cards · Radial wheel · Page panel ·
  Video & media · Connection · Shortcuts · Advanced.
- **Search** filters panes by label + keyword lists and by legacy-term
  aliases: `mine`/`mining` → Saving & cards; `yt` → Video & media; `wheel`/
  `slot` → Radial wheel; `token`/`pairing`/`clipboard` → Connection; etc.
  First match auto-activates; empty state shown when nothing matches.
- Every control has a name and description; ranges show live values;
  destination is a two-option radio-card matching what the bridge actually
  does. All controls **auto-save** (debounced) with a corner "Saved." status;
  pairing also has explicit Save/Test/Pull.
- **Wheel editor**: six position-labeled selects + live circular preview;
  choosing an already-used command swaps positions (no duplicates possible).
- **Shortcuts**: real bindings from `chrome.commands.getAll()` with friendly
  names, "not set" states, a link to `chrome://extensions/shortcuts`, and the
  in-page key reference.
- **Advanced**: immersion logging, notes, export (token excluded) / import /
  reset-to-defaults (pairing kept), and the migration note explaining that
  "mine" is now "save".

## Migration

See `EXTENSION_MIGRATION_REPORT.md`. `jpMigrateSettings` runs inside every
normalize, and the background re-saves once on `onInstalled` so all surfaces
see v2 immediately after update.
