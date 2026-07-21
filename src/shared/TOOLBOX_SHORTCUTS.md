# Toolbox Shortcuts

Generated source of truth: `src/shared/toolboxShortcuts.ts`.

This document is intentionally stored under `src/` so it follows the project rule that this work stays inside the source tree. Regenerate the table with `generateToolboxShortcutMarkdown()` after editing `TOOLBOX_SHORTCUT_COMMANDS`.

| Command ID | Name | Description | Feature | Default shortcut | Scope | Configurable |
|---|---|---|---|---|---|---|
| `toolbox.open` | Open Toolbox | Open the compact Blanc Toolbox beside the main Study OS. | toolbox | Ctrl+Alt+B | global-app | Yes |
| `toolbox.search` | Search Toolbox | Focus the Toolbox search field. | toolbox | Ctrl+F | toolbox | Yes |
| `toolbox.commandPalette` | Open Toolbox Commands | Open the command palette filtered to Toolbox commands. | toolbox | Ctrl+Shift+P | toolbox | Yes |
| `toolbox.focusSidebar` | Focus Tool Launcher | Move keyboard focus to the Toolbox launcher sidebar. | toolbox | Ctrl+L | toolbox | Yes |
| `toolbox.openRecent` | Focus Recent Tools | Move focus to the recent tools strip. | toolbox | Ctrl+R | toolbox | Yes |
| `toolbox.openFavorites` | Focus Favorite Tools | Move focus to the favorite tools strip. | toolbox | Ctrl+Alt+Shift+F | toolbox | Yes |
| `toolbox.nextTool` | Next Open Tool | Switch to the next open Toolbox tab. | toolbox | Ctrl+PageDown | toolbox | Yes |
| `toolbox.previousTool` | Previous Open Tool | Switch to the previous open Toolbox tab. | toolbox | Ctrl+PageUp | toolbox | Yes |
| `toolbox.closeActiveTool` | Close Active Tool Tab | Close the current Toolbox tab. | toolbox | Ctrl+Alt+W | toolbox | Yes |
| `toolbox.reopenLastTool` | Reopen Last Tool | Reopen the last selected Toolbox tool. | toolbox | Ctrl+Shift+T | toolbox | Yes |
| `toolbox.toggleCompactMode` | Toggle Compact Launcher | Collapse or expand the Toolbox launcher. | toolbox | Ctrl+B | toolbox | Yes |
| `toolbox.openSettings` | Open Toolbox Settings | Open the Blanc Settings tab. | toolbox | Ctrl+Alt+, | toolbox | Yes |
| `toolbox.openCalculator` | Open Calculator | Open the Toolbox calculator. | calculator | Alt+1 | toolbox | Yes |
| `toolbox.openUnitConverter` | Open Unit Converter | Open static offline unit conversion. | unit-converter | Alt+2 | toolbox | Yes |
| `toolbox.openHashChecker` | Open Hash Checker | Open the file hash checker. | hash-checker | Alt+3 | toolbox | Yes |
| `toolbox.openImageConverter` | Open Image Converter | Open the canvas-backed image converter. | image-converter | Alt+4 | toolbox | Yes |
| `toolbox.openBatchConverter` | Open Batch Converter | Convert a queue of images through the canvas pipeline. | batch-converter | Unbound | toolbox | Yes |
| `toolbox.openFocusTimer` | Open Focus Timer | Open the countdown and stopwatch workspace. | focus-timer | Alt+5 | toolbox | Yes |
| `toolbox.openQuickNotes` | Open Quick Notes | Open the Blanc-local quick notes surface. | quick-notes | Alt+6 | toolbox | Yes |
| `toolbox.openClipboard` | Open Clipboard | Open the shared clipboard history tool. | clipboard | Alt+7 | toolbox | Yes |
| `toolbox.openConjugationDrill` | Open Conjugation Drill | Open the verb and adjective conjugation drill. | conjugation-drill | Unbound | toolbox | Yes |
| `toolbox.openCounterReader` | Open Counter Reader | Open the counter and number reader. | counter-reader | Unbound | toolbox | Yes |
| `toolbox.openFurigana` | Open Furigana Generator | Open the furigana generator for annotating pasted text. | furigana | Unbound | toolbox | Yes |
| `toolbox.openCalendar` | Open Calendar | Open the shared Study OS calendar. | calendar | Unbound | toolbox | Yes |
| `toolbox.openMedia` | Open Media | Open the full practical media workspace. | media | Unbound | toolbox | Yes |
| `toolbox.openFlashcards` | Open Flashcards | Open the shared flashcard workspace. | flashcards | Unbound | toolbox | Yes |
| `toolbox.openStatistics` | Open Statistics | Open study and Toolbox statistics. | statistics | Unbound | toolbox | Yes |
| `toolbox.openEpubMining` | Open EPUB Mining | Open simple or advanced EPUB mining. | epub-mining | Unbound | toolbox | Yes |
| `toolbox.openAnkiDeck` | Open Anki Deck | Open local deck and Anki export tools. | anki-deck | Unbound | toolbox | Yes |
| `toolbox.openMonoBlocks` | Open Mono Blocks | Open the single Blanc monochrome blocks game. | mono-blocks | Unbound | toolbox | Yes |
| `toolbox.openSystemMonitor` | Open System Monitor | Open the compact system metrics surface. | system-monitor | Alt+8 | toolbox | Yes |
| `toolbox.openFileSearch` | Open File Search | Open capped local filename search. | file-search | Alt+9 | toolbox | Yes |
| `toolbox.openAutomationBuilder` | Open Automation Builder | Launch the existing PowerShell automation builder. | automation-builder | Unbound | toolbox | Yes |
| `toolbox.openWorkspaceLauncher` | Open Workspace Launcher | Open saved workspaces and launch their targets in order. | workspace-launcher | Unbound | toolbox | Yes |
| `toolbox.openDictionary` | Open Dictionary | Open shared dictionary lookup. | dictionary | Unbound | toolbox | Yes |
| `toolbox.openGrammar` | Open Grammar | Open grammar reference tools. | grammar | Unbound | toolbox | Yes |
| `toolbox.openResources` | Open Resources | Open shared language learning resources. | resources | Unbound | toolbox | Yes |
| `toolbox.openReadingFinder` | Open Reading Finder | Open reading discovery and analysis. | reading-finder | Unbound | toolbox | Yes |
| `toolbox.openNotificationCenter` | Open Task Center | Open the shared notification / task list. | notification-center | Unbound | toolbox | Yes |
| `toolbox.openDifficultyAnalyzer` | Open Level & Difficulty Checker | Score pasted text for level and unknown lemmas. | difficulty-analyzer | Unbound | toolbox | Yes |
| `toolbox.openImmersionTracker` | Open Immersion Tracker | Open per-site immersion totals. | immersion-tracker | Unbound | toolbox | Yes |
| `toolbox.openFrequencyExplorer` | Open Frequency Explorer | Look up word frequency ranks from installed dictionaries. | frequency-explorer | Unbound | toolbox | Yes |
| `toolbox.openSubtitleImporter` | Open Subtitle Importer | Parse subtitle files and send cues to the flashcard deck. | subtitle-importer | Unbound | toolbox | Yes |
| `toolbox.openContextSearch` | Open Personal Context Search | Fuzzy-search commands, saved words, deck cards, and grammar. | context-search | Unbound | toolbox | Yes |
| `toolbox.openKanjiInspector` | Open Kanji Inspector | Inspect a single character with radical membership and dictionary gloss. | kanji-inspector | Unbound | toolbox | Yes |
| `toolbox.openYoutubeLibrary` | Open YouTube Library | Track playlists, download videos, and plan to watch. | youtube-library | Unbound | toolbox | Yes |
| `focusTimer.startPause` | Start or Pause Focus Timer | Toggle the active focus timer. | focus-timer | Ctrl+Shift+Space | active-tool | Yes |
| `focusTimer.reset` | Reset Focus Timer | Reset the active focus timer. | focus-timer | Ctrl+Shift+Backspace | active-tool | Yes |
| `quickNotes.newNote` | New Quick Note | Clear the Blanc quick note editor for a new note. | quick-notes | Ctrl+N | active-tool | Yes |
| `automation.runSelected` | Run Selected Automation | Run the selected automation after the tool-specific safety prompts. | automation-builder | Ctrl+Shift+Enter | active-tool | Yes |

Removed 2026-07-17: `clipboard.copySelectedEntry`, `readingFinder.search` — they had no registered handler anywhere, so binding them did nothing. Re-add only together with a real `registerCommandHandler` in the owning view.

Removed 2026-07-19: `unknown-word-detector` — merged into `difficulty-analyzer`, same underlying computation.

## Registering A New Toolbox Shortcut

1. Add the practical module to `src/shared/toolboxRegistry.ts`.
2. Add its commands to `TOOLBOX_SHORTCUT_COMMANDS` with stable IDs, descriptions, scopes, and sensible defaults.
3. Prefer unbound defaults when a shortcut is not genuinely memorable.
4. Register behavior through `registerCommandHandler` or a Toolbox event listener.
5. Run `validateToolboxShortcutRegistry()` and the Toolbox shortcut tests.
6. Regenerate this document from `generateToolboxShortcutMarkdown()`.

## Example

```ts
TOOLBOX_SHORTCUT_COMMANDS.push({
  id: 'toolbox.openExample',
  name: 'Open Example Tool',
  description: 'Open the reusable Example Tool module.',
  category: 'Quick Tools',
  feature: 'example-tool',
  defaultShortcut: '',
  scope: 'toolbox',
  global: false,
  worksWhileTyping: false,
  editable: true,
});
```
