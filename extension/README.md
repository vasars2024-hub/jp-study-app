# GrammarX Chrome extension (Reader Companion)

A Japanese browser-reading companion for the GrammarX desktop app: hover lookup
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
| **Save** | Store a word or sentence in your GrammarX library (and Anki, if enabled) |
| **Create card** | Explicitly make a flashcard — previews text, type, and destination first |
| **Capture** | Save a page, OCR a region, import manga pages, record audio |
| **Open GrammarX** | Jump into the app (inbox, grammar practice, Anki mapping, …) |

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

## Permissions

- `activeTab` / `scripting` / `tabs` — read and theme the active page
- `storage` — settings, token, retry queue, per-origin marks
- Host access to `http://127.0.0.1:18765/*` (app bridge) and page URLs for content scripts

## Notes

- The app must be running for dictionary/grammar data. Offline saves queue locally
  and flush automatically (badge shows the count).
- OCR: manga pages use manga-ocr; everything else uses Web OCR (PaddleOCR) with
  automatic Japanese / Chinese / Russian selection. Models download on first use
  under **Settings → Models & dictionaries** (Web OCR JA/ZH/RU + Manga OCR).
  Double-click a word in the OCR result to open the dictionary popup.
- `src/main/chrome-extension/` is a bundled mirror of this folder used as an
  install fallback — keep the two in sync (copy files after editing here).
