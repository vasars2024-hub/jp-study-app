# Gum Chrome extension (Reader Companion)

A Japanese browser-reading companion for the Gum desktop app: hover lookup
with grammar and sentence analysis, saving words/sentences to your library,
Anki card creation, OCR, and page capture.

Load unpacked in Chrome (not the Chrome Web Store):

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the folder shown in **Settings → Study → Chrome extension** (or repo `extension/`)
4. Open the extension's **Settings → Connection** and paste (or Pull) the pairing token from the app

Reload the extension after updates (`chrome://extensions` → Reload).

## Core actions (the product language)

| Verb | Meaning |
|------|---------|
| **Look up** | Hold **Shift** (configurable) and hover/click/select Japanese text → reader popup with Meaning / Grammar / Sentence / Kanji / Examples / More tabs |
| **Save** | Store a word or sentence in your Gum library (and Anki, if enabled) |
| **Create card** | Explicitly make a flashcard — previews text, type, and destination first |
| **Capture** | Save a page, OCR a region, import manga pages, record audio |
| **Open Gum** | Jump into the app (inbox, grammar practice, Anki mapping, …) |

“Mine” from older versions is now simply **Save** — old settings and wheel
layouts migrate automatically.

## Surfaces

| Surface | What it does |
|---------|--------------|
| Hover lookup | Hold the activation key over text; deconjugates, detects the sentence, shows known-status, difficulty, pitch, examples |
| Toolbar popup | Page type + difficulty, four context-aware actions, recent activity, honest connection status |
| Radial wheel | `Alt+Shift+W` — six single-command positions, center = Cancel, keys `1`–`6`, page-aware disabling |
| Reading list | Multi-select open tabs → bulk save pages / download videos |
| OCR | Drag a box → web/manga engine auto-picks → editable text; double-click a word to look up |
| Page panel | Corner pill with difficulty + known-word %, page themes, highlight, known-word tint |

## Hover lookup (3.3)

- One request per pointer position: the app looks up every prefix of the
  scan window in one batched dictionary read (`/v1/scan`) and returns the
  longest exact / de-inflected match, so short words (私, 猫) are found and
  prefix near-misses (猫 → 猫舌) are not. The newest pointer position always
  wins; a slow answer for a word the pointer left never replaces it.
- Default hover delay 40 ms (Settings → Hover lookup). Measured in the test
  harness with a 5 ms app: ~16 ms from mousemove to popup at 0 ms delay,
  ~47 ms at the default.
- The looked-up word is marked with the CSS Custom Highlight API — the page's
  DOM is never modified.
- Popup shortcuts only act while the popup has focus or the hover key is held:
  `S` save word, `W` / `Shift+S` save sentence, `C` card, `P` pin, `A` audio,
  `J`/`K` next/previous entry, `←`/`→` tabs.
- Each entry has a play button (native audio from Gum's cache) and a `+`
  button that saves that entry with its reading, gloss and the sentence; an
  entry already in your Anki deck is marked.
- With Gum closed, recent lookups answer from a local cache (IndexedDB, up
  to 20,000 words; Settings → Reader popup).

## Tab recording

Record a tab (picture and sound) or only its sound from the toolbar popup,
the context menu, the wheel, or the `record-tab` shortcut (no default key —
assign one under chrome://extensions/shortcuts). The tab keeps playing for you
while it records. On a page with a video only the video is recorded (setting).
Recordings upload to Gum in 2 s chunks; if Gum is closed they wait in the
browser (IndexedDB) and upload when it is back — the popup lists waiting
recordings with Upload now / Discard. Chrome only allows recording a tab you
invoked the extension on, so start it from one of those places, not from a
page button.

## Permissions

- `activeTab` / `scripting` / `tabs` — read and theme the active page
- `storage` — settings, token, retry queue, per-origin marks
- `tabCapture` — the tab recorder gets a stream of the tab you invoked it on
- `offscreen` — a service worker cannot record media; an offscreen document
  (reason `USER_MEDIA`) records the captured tab and plays its sound back
- Host access to `http://127.0.0.1:18765/*` (app bridge) and page URLs for content scripts

## Notes

- The app must be running for dictionary/grammar data. Offline saves queue locally
  and flush automatically (badge shows the count).
- OCR: manga pages use manga-ocr; everything else uses Web OCR (PaddleOCR) with
  automatic Japanese / Chinese / Russian selection. Models download on first use
  under **Settings → Models & dictionaries** (Web OCR JA/ZH/RU + Manga OCR).
  Double-click a word in the OCR result to open the dictionary popup.
- `src/main/chrome-extension/` is a bundled mirror of this folder used as an
  install fallback — run `node tools/sync-extension-mirror.cjs` after editing here.
