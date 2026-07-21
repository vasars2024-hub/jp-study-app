# Extension UX Rebuild Spec (v3.0.0)

## Product language (user-facing verbs)

- **Look up** — show information about hovered/selected/OCR'd text.
- **Save word / Save sentence** — store in the GrammarX library (destination
  setting may also create an Anki card).
- **Create card** — explicitly make a flashcard; previews first by default.
- **Capture** — Save page, OCR capture, Import manga pages, Record/Save audio.
- **Open GrammarX** — jump into the app.
- **Queue** — automatic when the app is offline; surfaced as "N waiting to
  sync" with a Retry action, never silent.

"Mine", "App clipboard", "Mine → Anki", "Capture → App", "Save / YT", "YT DL"
no longer appear anywhere in default UI. "mine" remains: as the legacy
`mine-selection` browser-command id (so user key bindings survive), in the
`/v1/mine` wire protocol, and as a settings-search alias.

## Ownership boundaries

- **Extension**: page text detection, hover scanning, sentence bounds, on-page
  UI, browser commands, temporary retry queue, sending structured data to the
  app.
- **GrammarX app**: dictionaries, de-inflection, grammar patterns, difficulty
  bands, known-word store, permanent library, Anki field mapping and profiles,
  clipboard history, OCR models, statistics.
- **Anki**: note storage and scheduling, reached only through the app's
  AnkiConnect integration (extension never talks to Anki directly).

## Toolbar popup

Header: `GrammarX` + one status chip (`Connected` / `Connected · N queued` /
`Pairing needed` / `App not running`). Clicking expands per-subsystem rows
(app, pairing, Anki profile→deck, pending) plus a link to Connection settings.

Page card: title + pills (`Article/News/Web novel/Manga/Video/Webpage`,
`Difficulty N2 (estimate)`, `Known words 78%`), or explicit empty states
("No Japanese text detected…", "This page is browser-restricted").

Primary actions (max 4, context-aware):
- default: Look up selection · Save selection · Save page · OCR capture
- YouTube: Save video/playlist · Download video · Look up · Save selection
- Manga: OCR capture · Import manga pages · Look up · Save page

Then: Recent (≤3 items from real background activity log) · pending-sync bar
with Retry · footer nav (Reading list / Open GrammarX / Settings). No red
mega-button; the accent appears only on the single primary action.

## Visual language

One accent (#9c2b3d, used sparingly), #14161c/#1b1e26 neutrals, 12 px radii,
pill badges, no gradients-as-decoration, no status badges without meaning,
amber for queue/pending, red only for errors. Reduced-motion and
prefers-contrast media queries on content UI.
