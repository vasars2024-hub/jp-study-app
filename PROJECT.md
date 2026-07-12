# Current Technical Stack & Architecture Status

- **Framework**: Electron Forge + Vite + TypeScript (React-based renderer process).
- **Core State**: The visual window rendering, bottom taskbar, app icon grid launcher, and layout styling are fully functional.

## Home Workspace widgets

- **Phase 1**: Customizable widget layer on the desktop (alongside icons/notes). `WidgetSnapshot[]` persisted per-desktop in `DesktopLayout` (schema in `src/shared/desktop.ts`, sanitized in `src/main/desktop.ts`). Widgets are free-positioned/resizable/snapping/lockable/collapsible/hideable via `components/WidgetFrame.tsx` (transform-during-gesture drag). Registry + starter widgets in `src/renderer/widgets/*`. Gallery (`WidgetGallery.tsx`) has search, categories, favorites, recently-used, one-click add, reset. Opened from Start menu or taskbar tray. Reuses `playerBus`, `stats`, `knownWords`, `savedWords`.

- **Phase 2**: Extended catalog (world clock, daily goals, habit tracker, learning heatmap), **user-defined level lists** (`levelLists.ts` + JLPT/HSK Progress widget — paste Anki deck words, progress = Familiar+ via `knownWords`), **system metrics** (`main/systemMetrics.ts` IPC: CPU/memory/uptime/on-battery; widgets for CPU, memory, battery, network), **recent dictionary lookups** (`lookupHistory.ts`), optional **clipboard peek** widget (polls only while mounted).

## Reader productivity (Phase 3)

- **Sentence bounds**: pure helper `src/shared/sentenceBounds.ts`; used by `wordLookup` for Anki context and reader collection, and by the reader's copy-sentence/highlight-sentence commands (locates the sentence around the current selection, not just the clicked word).
- **Personal annotations**: `annotations.ts` — per-book color highlights independent of knowledge `.wk` spans; applied in `NovelReader`.
- **Collection inbox**: `ReaderCollectionPanel` — local `flashcardDeck` only; **Export → Anki** is explicit multi-select; clipboard copy is Ctrl+Shift+C / Ctrl+Shift+W (no auto-mine). Supports edit-in-place (`updateDeckCard` in `flashcardDeck.ts`) and sort (newest/oldest/word).
- **TTS**: `tts.ts` (Web Speech API) + `detectTtsLang()` script-based routing (kana→ja, Han→active dictionary language, Cyrillic→ru, Latin→en) + Play Pronunciation on `DictionaryPopup`, rebindable via `dictionary.playPronunciation`.

## Shortcut manager + command palette (Phase 4)

- `src/renderer/keyboardShortcuts.ts` is a full command manager, not a fixed keymap: `COMMAND_CATALOG` declares every shortcut in the spec (Navigation/Reader/Dictionary/Flashcards/Music) with a default chord. Views attach live behavior with `registerCommandHandler(id, fn)` (auto-detached on unmount, newest registration wins); a few app-wide actions (word-highlight toggle, music transport, window nav) have built-in handlers. One global `keydown` listener (`installKeyboardShortcuts`, called once from `main.tsx`) resolves the pressed chord against the active profile and dispatches.
- User rebinding: per-profile overrides in localStorage (`jp-shortcuts-v1`) — `undefined` = default, `string` = override, `null` = explicitly unbound. Supports conflict detection (`getBindings()` reports which other commands share a chord), reset one/all, JSON import/export, and named profiles (fork from the active one, switch, delete).
- `Settings → Shortcuts` (`components/ShortcutSettings.tsx`): searchable, category-grouped, click-to-capture rebinding (Backspace unbinds, Esc cancels), conflict warnings inline, import/export/profile controls.
- `components/CommandPalette.tsx`: overlay opened via `nav.palette` (Ctrl+Space, commands mode) or `nav.search` (Ctrl+P, search mode broadens to saved words / flashcards / grammar). Fuzzy subsequence match over commands, app sections, and widgets (add-to-desktop from the palette). Mounted once in `App.tsx` so it works on the desktop, in pop-outs, and while reading.
- Reader shortcuts (highlight word/sentence, copy word/sentence, save to collection, dictionary/translate lookup, font zoom in/out/reset) were migrated off `NovelReader`'s local `keydown` handler onto `registerCommandHandler`, so they're now rebindable and appear in the palette/settings instead of being hardcoded.

## Productivity utilities — Clipboard History & Calendar

- **Clipboard History** is a global utility, not a Home Workspace widget: `clipboardHistory.ts` (localStorage cache + IndexedDB mirror, same pattern as `flashcardDeck.ts`) backs a global overlay (`components/ClipboardHistoryPanel.tsx`) mounted once in `App.tsx` so it works on the desktop, in pop-outs, and inside the reader. Opens via `Ctrl+Shift+V` (rebindable, `clipboard.open` command), the command palette, or a taskbar toolbar button. Types: text/word/sentence/paragraph/dictionary/reader/manual; search + filter chips; entry cards collapse long text with an expand toggle; per-entry actions (copy again, copy as plain text, pin, favorite, delete, send to Flashcard Collection via existing `flashcardDeck.addDeckCards` — no duplicate storage); multi-select with bulk delete/copy/flashcard/clear-unpinned. Reader copies (`reader.copySentence`/`reader.copyWord` in `NovelReader.tsx`) attach book/chapter/position metadata in an expandable details section; dictionary copies (new copy button in `DictionaryResults.tsx`) preserve expression/reading/meaning as a structured entry. Background clipboard monitoring polls `window.api.clipboardReadText()`, gated by a setting. Settings (max history size, dedupe consecutive, clear on exit, monitoring toggle) live in `Settings → Clipboard History`, reusing the existing Settings section pattern. The old `ClipboardWidget` (`widgets/system.tsx`) is now a thin peek into the same store that opens the full panel — no separate clipboard logic.
- **Calendar** is a full section (`views/CalendarView.tsx`, backed by `calendar.ts`) reachable like any other app (desktop icon, pop-out, command palette). Month/Week/Day/Agenda views, Today/Jump-to-date/Prev/Next navigation, event CRUD (title/description/date/start-end time/all-day/color/category) via a modal, categories mirror study features (Study Session/Exam/Assignment/Reminder/Personal), reminders (at time through 1 day before), recurrence (daily/weekly/monthly/custom N-day interval) expanded on demand by `expandOccurrences`, and an Agenda view (today/upcoming/overdue reminders). The Home Workspace `CalendarWidget` (`widgets/productivity.tsx`) is now a lightweight month grid + upcoming-events strip that opens the full Calendar on click — it never duplicates event/recurrence logic.

## Immersion Browser (parallel MVP)

- Section `immersion`: live `<webview>` (partition `persist:immersion`) + Reader Mode (Readability), sites library under `userData/immersion/`, dictionary popup, `recordReading` into existing stats so study widgets update without widget code changes.
- Main: `src/main/immersion/`; UI: `ImmersionView.tsx`.

## Anki mining (Phases A–D)

- Profile create/delete, dictionary pop-up mines into the active profile, cloze/image aggregator, offline Yomitan import, bundled Kanjium pitch, `{pitch}`/`{frequency}`/`{audio}` variables in `gatherMiningValues`.

## Defects / debts

- Music player can stutter during window drag with large file collections.
- DeepL sentence accuracy improvements still needed.
- Some UI text still reads cluttered; emoji eradication still on the medium-priority task list.
- Global `tsc` remains broken under TS 4.5 vs modern `@types` — gate on `vitest` + runtime, not full-project `tsc`.

## Phase D gotchas

- Main/preload/shared changes need a full Electron restart.
- Bundled pitch needs internet once on first launch.
- Frequency ranks only appear after importing a Yomitan frequency dictionary.
- Audio fetch uses JapanesePod101 CDN when `{audio}` is in field templates or the Anki view checkbox is on.
