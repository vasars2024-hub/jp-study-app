# Refactor & Feature Pipeline

## High Priority (Fable 5 Target)
- [ ] Task 1: Complete Anki Modifier Engine & Multi-Language Profile Data Layout
- [ ] Task 2: Programmatic Integration of Dynamic Field-Mapping & Interval Reading Logic

## Medium Priority (Sonnet Target)
- [ ] Task 3: Virtual Scroll & Search Patch for Media Component Backend
- [ ] Task 4: UI Emoji Eradication, Text Polishing, and Collapsible Settings Window

## Low Priority (Sonnet Target)
- [~] Task 5: Core Productivity Plugin & Study Widget Generation (Clock, Todo, Kanji of the Day) — largely superseded by Home Workspace phases below

## Home Workspace / Reader Productivity Pipeline (four independently shippable phases)
- [x] Phase 1: Widget framework + gallery + starter widgets (persistence schema, WidgetFrame, registry, gallery, DesktopShell integration, styles). Verified: compiles + boots.
- [x] Phase 2: Full widget catalog slice + user-defined level lists (JLPT/HSK/Vocabulary progress from Anki-synced knowledge, Familiar+) + system-metric widgets (CPU/mem/battery/network) + recent lookups + local clipboard peek. Optional backlog: more catalog widgets, recent-files widget polish.
- [x] Phase 3: Reader productivity — JP/ZH sentence bounds (`sentenceBounds`), personal color-highlight annotations, Flashcard Collection inbox (local `flashcardDeck`, explicit Anki export only, clipboard-only Ctrl+Shift+C/W), TTS "Play Pronunciation" in dictionary popup. Polish: TTS now auto-detects script (kana/Han/Cyrillic/Latin) instead of hardcoding ja; Collection inbox got edit-in-place + sort (newest/oldest/word).
- [x] Phase 4: Rewrote `keyboardShortcuts.ts` into a full command manager — every shortcut in the spec is a `Command` with a default chord, rebindable via click-to-capture, conflict detection, per-command/global reset, JSON import/export, and named profiles (fork/switch/delete). `Settings → Shortcuts` (`ShortcutSettings.tsx`) exposes all of it. `CommandPalette.tsx` (Ctrl+Space commands / Ctrl+P search) fuzzy-searches commands, pages, widgets, saved words, deck flashcards and grammar; mounted once in `App.tsx`. Reader shortcuts (highlight word/sentence, copy word/sentence, save to collection, dict/translate lookup, font zoom) migrated off the reader's local keydown handler onto `registerCommandHandler`, so they're rebindable and centrally documented. Verified: lint clean, esbuild syntax-clean, full `npm start` boot with zero renderer errors.

## Polish pass (evaluated a prior session's unfinished work, then fixed it)
- Confirmed the `ImmersionView.tsx` syntax fix below unblocked the whole build (all Phase 1–3 code was already sound once that compiled).
- Added the missing `edit` icon glyph (Icons.tsx) used by the Collection panel's new edit action.

## Productivity utilities — Clipboard History & Calendar
- [x] Clipboard History promoted from a Home Workspace widget to a global utility: `clipboardHistory.ts` store (types, search/filter, pin/favorite, dedupe, cap), global overlay panel (`ClipboardHistoryPanel.tsx`, Ctrl+Shift+V / palette / taskbar button), reader + dictionary structured capture, Send-to-Flashcards via existing deck store, multi-select bulk actions, Settings → Clipboard History. Verified: `npm test` (135 passed), `vite build` clean, lint clean on all touched files.
- [x] Calendar expanded from a static month display into a full app: `calendar.ts` store (CRUD, recurring-event expansion, reminder/overdue logic) + `CalendarView.tsx` (Month/Week/Day/Agenda, event modal, categories, reminders, recurrence). Home Workspace widget rewritten as a thin view over the same store. Verified: `npm test` (135 passed), `vite build` clean, lint clean.
- Known gaps: Week/Day views are agenda-style lists rather than an hour-by-hour grid; reminders have no OS notification/toast yet (Agenda surfaces "Overdue reminders" only); dictionary copy capture only covers `DictionaryResults.tsx` entries, not every place dictionary text could be copied.

## Parallel (not in four-phase checklist)
- [~] Immersion Browser MVP (section `immersion`: Reader Mode + live webview + sites library + stats feed). Fixed a build-blocking JSX syntax error in `ImmersionView.tsx` (extra `{}` around `createWebview(...)` at ~L556) that was breaking the whole app compile; now boots clean. v0.5+ still open (multi-tab, mine-all, shadowing).
