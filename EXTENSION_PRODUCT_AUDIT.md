# GrammarX Extension — Product Audit (v2.4.7 → v3.0.0 rebuild)

Audited 2026-07: every file in `extension/` read end-to-end; every `/v1/*`
endpoint verified against `src/main/extensionServer.ts`; the bundled mirror
`src/main/chrome-extension/` confirmed byte-identical and re-synced after the
rebuild.

## What the audit found (v2.4.7)

### Architecture facts (verified)
- `extension/` is the source of truth; `src/main/chrome-extension/` is a
  Vite-bundled fallback imported file-by-file in `src/main/extensionInstall.ts`.
  Any new file requires an `extensionInstall.ts` change → the rebuild kept the
  exact same file set.
- The bridge (`extensionServer.ts`) really implements: health, page-kind,
  page-context, ocr(+status), mine-info, inbox, mine, capture, manga-import,
  download(+status), audio/save, clipboard (GET/POST), ui/open, known-levels,
  known-level, comprehensibility, grammar-match, immersion/visit, translate,
  level-estimate, lookup, examples, playlists/status, playlist, video.
- `/v1/lookup` does exact + de-inflected lookup but **no prefix scanning** —
  a hover scanner must trim the scan window client-side.
- `/v1/mine` **always** keeps a GrammarX copy; `preferAnki`/`forceAnki` only
  control the Anki attempt. There is no third destination. The old three-way
  destination UI implied choices that did not exist.
- `/v1/mine` accepts no sentence-context or field data — card fields are built
  app-side. Any client-side "edit definitions" preview would have been fake.
- `/v1/grammar-match` returns `{id, title, level, meaning}` — pattern-level
  matches, no character spans. Span display must be computed (and labeled)
  client-side.

### Product problems (verified in code, not from screenshots alone)
1. **No hover lookup existed.** Lookup was Shift+*click* / Shift+select only
   (`content.js onClick/onMouseUp`). The single most important feature of a
   reading companion was missing.
2. The dictionary popup was a flat list (up to 6 entries) with no tabs, no
   sentence view, no kanji view, no keyboard navigation, no pinning, no
   nested lookup, and it closed when you Shift-clicked elsewhere.
3. "Mine" terminology dominated every surface: context menus
   ("Mine word → Anki / GrammarX" ×3), popup buttons ("Mine → Anki"), FAB
   badge ("Mine → Anki"), wheel labels ("Mine→Anki" appearing in both a
   sector *and* the center preview).
4. The wheel mixed actions, destinations, and media types (`Save / YT`,
   `YT DL`, `Mine`, `OCR`), had 4-or-6 generic "Slot N" settings, hold-release
   selection only, no keyboard fallback, no Escape, no outside-click cancel,
   dark red/blue conic slices, and its center mirrored the hovered action.
5. The toolbar popup led with internal state (PAGE/LEVEL/MINE TO/ANKI PROFILE
   cards, pairing token, "Clipboard in app", "Anki in app") instead of
   answering "what can I do on this page?". A giant red button opened settings.
6. The bulk-tab "Mine" action mined `samplePageText()` — the first sentence of
   the page body — a junk save nobody asked for. Removed.
7. `sendClipboard` (page selection → clipboard) duplicated `clipboardText`
   with a second formatting path. Removed; one path remains.
8. "Scan strip" was actually long-strip **manga import** — a misleading name.
9. The connected chip conflated app reachability with pairing validity and
   Anki availability.
10. Highlight mode broke on selections crossing element boundaries
    (`surroundContents` throws; `extractContents` fallback mangled DOM).
11. Settings were a single narrow accordion column: no search, generic wheel
    slots, pairing duplicated between popup and options.

## What the rebuild did

See `EXTENSION_UX_REBUILD_SPEC.md`, `EXTENSION_COMMAND_MODEL.md`,
`EXTENSION_READER_POPUP_SPEC.md`, `EXTENSION_RADIAL_WHEEL_DECISION.md`,
`EXTENSION_SETTINGS_ARCHITECTURE.md`, `EXTENSION_MIGRATION_REPORT.md`,
`EXTENSION_FINAL_VERIFICATION.md`. Summary:

- Real hover lookup (configurable key/delay/scan length, client-side
  longest-prefix matching against the de-inflecting bridge, ruby-aware block
  text, LRU cache, no-flicker on misses).
- Tabbed reader popup: Meaning / Grammar / Sentence / Kanji / Examples / More,
  known-status control, pin + drag, nested lookup with history, keyboard
  shortcuts, viewport-aware placement.
- One command registry (`shared.js COMMANDS`) used by wheel, context menu,
  toolbar popup, More menu, and keyboard commands; old ids alias-mapped.
- Honest destination model: "GrammarX only" vs "GrammarX + Anki card";
  "Create card" always previews (opt-out) and shows exactly what is sent.
- Wheel rebuilt: 6 fixed positions, one command each, center = Cancel, click
  or 1–6/arrow/Enter selection, Esc/outside cancel, page-aware disabling,
  ~236 px, reduced-motion support. Settings use a positional editor with live
  preview and swap-on-duplicate.
- Toolbar popup: expandable per-subsystem status, page card with difficulty +
  known %, four context-aware actions, recent activity, pending-sync bar.
- Settings app: left nav, search (with legacy-term aliases: "mine" finds
  Saving & cards), export/import/reset, connection page owns pairing.
- Highlighter rewritten to wrap per-text-node — works across links, ruby,
  and multi-paragraph selections.
- Queue badge changed from red to amber (red now reserved for errors).
