# Reader Popup Spec (v3.0.0)

The in-page popup is the core product surface. Implemented in
`extension/content.js` (`ensurePopup` + tab renderers), styled by
`content.css` (`#jp-study-popup`, `rp-*` classes).

## Activation

1. **Hover**: hold the activation key (default Shift; Alt/Ctrl configurable)
   and rest the cursor on Japanese text for `hoverDelayMs` (default 140 ms).
2. **Key + click**: immediate lookup; pins the popup if `popupPinOnClick`.
3. **Key + select**: looks up the selection (sentence-aware).
4. Commands: `Alt+Shift+D`, context menu "Look up selection", wheel/More.
5. OCR result → "Look up".

Scanning: caret from point → block text with ruby (`rt`/`rp`) excluded → CJK
forward window (≤ `scanLength` chars) → client-side longest-prefix lookup
against `/v1/lookup` (which de-inflects each candidate), LRU-cached (120
entries, hits and true misses only — offline errors are never cached). Misses
do not open a popup (no flicker). The matched range is marked in the page.

## Anatomy

- **Header**: surface form · reading · audio (TTS) · pin · close · back
  (when nested lookups exist).
- **Sub-row**: base form + deconjugation path, part of speech, `common`,
  `JLPT (estimate)`, frequency rank.
- **Known**: New / Learning / Familiar / Known segmented control → `/v1/known-level`
  for the de-inflected base form.
- **Tabs**: Meaning · Grammar · Sentence · Kanji · Examples · More.
- **Footer**: Save word · Save sentence · **Create card** · overflow
  (clipboard history, translate, copy, open app).

### Meaning
Up to 5 entries: word/reading/source, pitch (first entry), grouped senses with
parts of speech (3 in compact mode, 6 otherwise). Empty state distinguishes
"no entries" from "GrammarX is not running".

### Grammar
`/v1/grammar-match` on the detected sentence. Each match: pattern, JLPT chip,
meaning, and an honesty chip — `in sentence` when the pattern's normalized
form is literally present (span underlined), `pattern match` otherwise. A
standing note states matching is rule-based and cannot verify which pattern is
grammatically active. Offline → explanation + Retry.

### Sentence
Detected sentence with the term bolded; extend ‹ / › (previous/next sentence
within the block), Reset, Edit (textarea). Stats via `/v1/level-estimate` +
`/v1/comprehensibility`: `Difficulty N2 (estimate) · Known words 76% · 41 chars`,
with an explicit offline note. Copy / Save sentence / Create card.

### Kanji
Unique kanji of the term (≤6), each looked up through `/v1/lookup` (single
character): reading + meanings, tap for a full nested lookup. States for
no-kanji and app-offline.

### Examples
`/v1/examples` for the base form, term highlighted, per-example Play (TTS) and
Save sentence.

### More
Pitch accent, deconjugation path, entry count + dictionary sources, source
page, inline Translate result, clipboard history, open app, and a provenance
note (all data comes from the local GrammarX bridge).

## Interaction quality

- Keyboard (works while the popup is open, unless typing in an input):
  `←/→` tabs · `S` save word · `Shift+S` save sentence · `C` create card ·
  `P` pin · `A` audio · `Backspace` back · `Esc` close.
- Pinned popup: accent ring, draggable by header, ignores key-release close.
- Positioning: viewport-clamped, flips above the cursor near the bottom edge,
  max-height 72vh with internal scroll, re-positions after content renders.
- Stale-response protection via a lookup token; every async renderer checks it.
- Width (280–560), font size (12–18), compact mode — all settings, applied as
  CSS variables.
- `role="dialog"`, aria labels on icon buttons, `prefers-reduced-motion` and
  `prefers-contrast` honored.

## Create card preview

Modal (`#jp-study-card-preview`): Word/Sentence toggle, editable text, source
line, destination line, and the honest note that card fields (reading,
definition, audio) are filled by GrammarX from its dictionaries and the Anki
field mapping — because `/v1/mine` accepts text only. `Ctrl+Enter` sends,
`Esc` cancels. Disabling "Preview before creating a card" sends instantly.
