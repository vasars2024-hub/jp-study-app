# Extension Final Verification (v3.0.0)

Method: every rebuilt file re-read after writing; `node --check` on all seven
JS files (clean); automated cross-checks of message routing (every `type:`
sent by popup/options/tabs/content has a background handler; every `jp-*`
message sent by the background — including the `PAGE_SIDE_MESSAGES` map — has
a content-script handler); mirror `src/main/chrome-extension/` byte-compared
against `extension/` (identical). Runtime behavior against a live browser and
a running GrammarX app could not be exercised in this environment — items
needing a manual pass are listed at the end.

## Acceptance criteria — status

| Criterion | Status |
|---|---|
| Hover lookup works reliably | Implemented (key-held mousemove → debounced caret scan → prefix lookup → popup); stale-token + no-flicker guards; needs live-page pass |
| Activation key configurable | Yes (Shift/Alt/Ctrl + delay, scan length, close-on-release, click lookup, editable-field opt-in) |
| Reader popup significantly more advanced | Yes — 6 tabs, known-status, deconjugation, pin/drag, nested lookup + back, card preview |
| Popup explains words/sentences/grammar contextually | Yes, with explicit uncertainty labeling on grammar spans and estimates |
| Popup keyboard navigation | Yes (global-when-open routing that never fires while typing) |
| Toolbar popup clean and task-oriented | Yes — page card, ≤4 context actions, recent, honest status |
| Empty PAGE/LEVEL cards removed | Yes — replaced by real page card + explicit empty states |
| `Other/article` inconsistency removed | Yes — one category label set (Webpage/Article/News/Web novel/Manga/Video) |
| "Mine" removed from normal user flows | Yes (remains only as internal command id, wire protocol, and search alias) |
| Save vs capture vs create-card distinguished | Yes (registry categories + distinct verbs) |
| No duplicate destination controls | Yes — one two-option setting matching real bridge behavior |
| Clipboard treated as input source | Yes — "Add to clipboard history" action only; no fake monitoring added |
| Context menu simplified | Yes — 6 verbs + separator (was 7 with 4 "Mine…") |
| Settings searchable and categorized | Yes, incl. legacy-term aliases |
| Shortcuts use named commands, not slots | Yes (real bindings listed; wheel uses position + command names) |
| Wheel: redesigned; no repeated Mine→Anki; no `Save / YT`; no `YT DL`; no page obstruction; one command per sector; predictable center (Cancel); keyboard + reduced-motion | All yes — see decision doc |
| OCR a complete workflow | Region select → editable text → look up / save / re-select; confidence display **not** available (bridge returns text only — documented, not faked) |
| Video/subtitle tools clearly named | Yes ("Save video", "Download video"); subtitle capture not invented (no bridge support) |
| Scan strip made useful or removed | Renamed to its true function ("Import manga pages"), scoped to manga pages |
| Connection states truthful | Yes — app / pairing / Anki profile / pending reported separately |
| Failed saves visible and recoverable | Yes — amber badge, pending bar + Retry, queued toasts, per-action errors |
| Duplicate cards detected | App-side (bridge `duplicate` flag surfaced for videos; Anki duplicate policy lives in the app) |
| Existing settings migrated | Yes — versioned, idempotent; see migration report |
| Old duplicate code removed; old UI not left running | Yes — no legacy popup/wheel/settings surfaces remain; alias shims only |
| Not a Yomitan clone | Identity = grammar tab, known-status, difficulty/coverage, Study-app library + Anki pipeline, OCR/manga/media capture |

## Defects found and fixed during this verification

1. Offline lookup responses were cached → stale "app not running" after the
   app started. Fixed (cache hits/misses only).
2. Popup keyboard shortcuts only worked with focus inside the popup. Fixed
   (global routing, guarded against typing contexts).
3. Wheel/menu "Create card" could use a stale popup hit after the popup was
   closed; the preview's Word/Sentence toggle re-read the same stale state.
   Fixed (`cardSource` snapshot; popup hit trusted only while open).
4. Page-panel "Hide here" toast pointed at a removed popup control. Fixed
   (points to Settings → Page panel).
5. Highlight mode failed on cross-element selections. Fixed (per-text-node
   wrapping — works on any selection Chrome can make).
6. Toolbar-popup "Save selection" forced word mode. Fixed
   (`save-selection` message, auto classification).
7. Theme-vs-UI CSS: confirmed extension UI mounts on `<html>` outside the
   `body *` theme repaint selectors; removed a speculative and incorrect
   `revert-layer` guard.

## Known limitations (stated, not hidden)

- Hover lookup and all data need the desktop app running; the popup says so
  per-tab instead of failing silently.
- Grammar spans are text-based; the honest "pattern match" chip covers
  patterns whose surface form isn't literally present.
- OCR confidence and region-linked correction are not possible with the
  current `/v1/ocr` (returns plain text); the editable-text step is the
  correction workflow.
- PDFs, `chrome://` pages, and cross-origin iframes are outside content-
  script reach; the popup explains restricted pages.
- Shadow-DOM text depends on `caretRangeFromPoint` piercing (open roots work
  in Chromium; closed roots do not).

## Manual test pass still recommended (live browser + app)

1. Hover lookup on NHK Easy, Syosetu (ruby text), Twitter (dynamic DOM),
   vertical text, browser zoom 80–150 %.
2. Key release / pin / drag / nested lookup / Backspace history.
3. Wheel on YouTube (Download enabled) vs article (disabled), keyboard-only.
4. Save word / sentence / card with app closed (queue + badge + retry) and
   open (Anki present and absent).
5. Options: search "mine", wheel swap behavior, export → reset → import.
6. Extension update path: v2 settings present → v3 first run (migration).
