# Extension Redundancy Map

Duplications found in v2.4.7 and how each was resolved in v3.0.0.

| Redundancy | Where it lived | Resolution |
|---|---|---|
| Four "Mine …" context-menu entries + popup Mine + wheel Mine + FAB dest badge | background.js, popup.html, content.js | One `save.word` / `save.sentence` / `card.create` command trio in the shared registry; every surface dispatches the same ids |
| `sendClipboard` (selection) vs `clipboardText` (text) | background.js | Single `clipboardText`; selection resolved once via `selectionFromTab` |
| Mine result formatting in three styles | shared.js `formatMineResultMessage`, popup.js `formatMineStatus`, content.js `formatMineToast` | One `formatSaveResultMessage` in shared.js; popup keeps only a 4-line local fallback |
| Wheel labels defined twice (settings actions list + content WHEEL_LABELS) | settings.js, content.js | Registry `label`/`shortLabel` is the only source |
| Pairing UI in toolbar popup *and* options | popup.html, options.html | Options → Connection only |
| `mine` / `mine-text` messages (tab-selection vs explicit text) | background.js | `save-selection` + `save-text`; both share `saveText()` |
| "Save / YT" + "YT DL" + youtubeMode setting overlapping | wheel + settings | `capture.page` is page-aware (respects youtubeMode); `media.download` is the only explicit download command |
| Level badge element duplicated logic (`ensureLevelBadge`/`ensureContextBadge`) | content.js | Context badge removed; level/comp live in one FAB pill |
| Old slot-fill lists in two places | settings.js normalize + content.js loadWheelSettings | One normalize path in settings.js; content reads normalized settings only |
| Duplicate event formatting for capture toasts | content.js `formatYtToast` + shared | shared `formatCaptureResultMessage` only |

Dead code removed outright: `mineFolderLabel`, `getPreferAnki`,
`samplePageText`-based bulk mining, `minePrimaryDestination`,
`mineDestinationChipLabel`, `mineWorkingMessage` (replaced by
`saveWorkingMessage`), the `wheel-action` message, the conic-gradient wheel
renderer, `Slot 1..N` settings UI, `dict-*` popup CSS, the FAB dest/context
badges, and the popup's YouTube-playlist tracking card (playlist status still
exists via `playlist-status` for future use, but no longer occupies the
default popup).
