// Centralized, user-configurable shortcut manager.
//
// Every shortcut is a Command in COMMAND_CATALOG (plus optional Custom commands).
// Views attach behavior with registerCommandHandler(id, fn). Users rebind in
// Settings → Shortcuts: multi-key chords (Ctrl/Alt/Shift/Meta), mouse buttons,
// alternatives (Space|Enter), profiles, import/export. One global keydown +
// mousedown listener dispatches everything.

import { toggleWordHighlight } from './readerSettings';
import { next as musicNext, prev as musicPrev, toggle as musicToggle, setVolume, getState } from './playerBus';
import { performUndo, canUndo, peekUndo } from './actionHistory';
import { bumpZoom, setZoom, ZOOM_DEFAULT, ZOOM_STEP } from './appZoom';
import { TOOLBOX_SHORTCUT_COMMANDS } from '../shared/toolboxShortcuts';
import { loadToolboxSettings } from './toolboxSettings';
import { resumeMostRecentWatched } from './continueWatchingStore';
import { reachMediaWorkspace } from './mediaWorkspaceBridge';
import { t } from './i18n';
import { CAPTIONS_GLOBAL_COMMANDS } from '../shared/captionsOverlay';

export type CommandCategory =
  | 'Navigation'
  | 'Window'
  | 'Reader'
  | 'Manga'
  | 'Dictionary'
  | 'Flashcards'
  | 'Immersion'
  | 'Music'
  | 'Video'
  | 'Utility'
  | 'Toolbox'
  | 'Custom';

export interface AppCommand {
  /** Stable id, e.g. "reader.copySentence". */
  id: string;
  label: string;
  category: CommandCategory;
  /**
   * Default chord(s). Use `|` for alternatives that all trigger the same command
   * (e.g. "Space|Enter"). "" = unbound by default.
   */
  defaultKeys: string;
  /** Note shown in the settings UI. */
  note?: string;
  feature?: string;
  scope?: string;
  global?: boolean;
  worksWhileTyping?: boolean;
  editable?: boolean;
  /** When true, command was created by the user (not in the built-in catalog). */
  custom?: boolean;
}

/** What a custom shortcut does when fired. */
export type CustomAction =
  | { type: 'openApp'; appId: string }
  | { type: 'runCommand'; commandId: string }
  /** Run several built-in / custom commands in order (stacked macro). */
  | { type: 'runCommands'; commandIds: string[] }
  | { type: 'dispatch'; event: string; detail?: string };

export interface CustomCommandDef {
  id: string;
  label: string;
  defaultKeys: string;
  action: CustomAction;
}

// ---------------------------------------------------------------------------
// Built-in catalog — ids are the contract; views register handlers against them.
// ---------------------------------------------------------------------------
export const COMMAND_CATALOG: AppCommand[] = [
  // Navigation
  // Not Ctrl+Space: that is the Chinese (and Korean) IME's own on/off toggle, so a
  // Pinyin user reaching for the IME opened the palette instead. Ctrl+K has no
  // meaning in a text field and no Windows or IME owner.
  {
    id: 'nav.palette',
    label: 'Open command palette',
    category: 'Navigation',
    defaultKeys: 'Ctrl+K',
    note: 'Ctrl+P opens the same palette in search mode.',
  },
  { id: 'nav.search', label: 'Global search', category: 'Navigation', defaultKeys: 'Ctrl+P' },
  { id: 'nav.settings', label: 'Open settings', category: 'Navigation', defaultKeys: 'Ctrl+,' },
  { id: 'nav.home', label: 'Return home (close reader)', category: 'Navigation', defaultKeys: 'Ctrl+H' },
  {
    id: 'nav.undo',
    label: 'Undo last action',
    category: 'Navigation',
    // Was Ctrl+Shift+Z, which is Redo in every text field — pressing it while typing
    // reopened a closed window instead of redoing an edit.
    defaultKeys: 'Ctrl+Alt+Z',
    note:
      'Reverses the last recorded action (e.g. reopening a closed desktop window, removing a just-added Anki note). Not a full text-editor undo.',
  },
  { id: 'nav.widgets', label: 'Open widget gallery', category: 'Navigation', defaultKeys: '' },
  {
    id: 'settings.focusSearch',
    label: 'Focus settings search',
    category: 'Utility',
    defaultKeys: 'Ctrl+Alt+S',
    note: 'Works while the Settings window is open. Ctrl+F is reserved for Toolbox search.',
  },
  { id: 'nav.open.dictionary', label: 'Open Dictionary', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.library', label: 'Open Library', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.novels', label: 'Open Novels', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.reading', label: 'Open Reading Finder', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.flashcards', label: 'Open Flashcards', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.grammar', label: 'Open Grammar', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.translate', label: 'Open Translate', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.music', label: 'Open Music', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.player', label: 'Open Media player', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.immersion', label: 'Open Immersion', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.anki', label: 'Open Anki', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.stats', label: 'Open Statistics', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.calendar', label: 'Open Calendar', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.resources', label: 'Open Resources', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.games', label: 'Open Game Arena', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.city', label: 'Open Mooncap', category: 'Navigation', defaultKeys: '' },

  // Window management — the desktop's own windows, not the Electron frame.
  //
  // Defaults deliberately avoid the Meta (Win) key: Windows reserves Win+Arrow
  // for its own snap layouts and Win+D for show-desktop, and the OS wins those
  // races before Electron ever sees the keydown. Ctrl+Alt+* is the safe band.
  {
    id: 'nav.closeWindow',
    label: 'Close window',
    category: 'Window',
    defaultKeys: 'Ctrl+W',
    note: 'Closes the window in front. A sticky note asks before it is deleted.',
  },
  {
    id: 'nav.nextWindow',
    label: 'Next window',
    category: 'Window',
    defaultKeys: 'Ctrl+Tab',
    note: 'Raises the window at the back of the stack, restoring it if it was minimized. Needs at least two windows.',
  },
  {
    id: 'nav.prevWindow',
    label: 'Previous window',
    category: 'Window',
    defaultKeys: 'Ctrl+Shift+Tab',
    note: 'Sends the window in front to the back of the stack so the one beneath it surfaces.',
  },
  {
    id: 'nav.nextAppFullscreen',
    label: 'Next app (full screen)',
    category: 'Window',
    defaultKeys: 'F11',
    note: 'Cycles through open apps and switches to full screen.',
  },
  {
    id: 'window.moveToNextMonitor',
    label: 'Move window to next monitor',
    category: 'Window',
    // Snap (Ctrl+Alt+Arrow) plus Shift, the way Windows adds Shift to Win+Arrow for the
    // same move. Was Ctrl+Shift+ArrowRight, which selects a word in every text field.
    defaultKeys: 'Ctrl+Alt+Shift+ArrowRight',
    note: 'Sends the focused window to the desktop on the next configured display.',
  },
  {
    id: 'window.moveToPrevMonitor',
    label: 'Move window to previous monitor',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+Shift+ArrowLeft',
    note: 'Sends the focused window to the desktop on the previous configured display.',
  },
  {
    id: 'window.focusNextMonitor',
    label: 'Focus next monitor',
    category: 'Window',
    // Not Ctrl+Alt+ArrowRight — that is already `window.snapRight`.
    defaultKeys: 'Ctrl+Alt+M',
    note: 'Raises the desktop window on the next display without moving anything.',
  },
  {
    id: 'window.maximize',
    label: 'Maximize / restore window',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+ArrowUp',
    note: 'Toggles the focused window between maximized and its previous size.',
  },
  {
    id: 'window.minimize',
    label: 'Minimize window',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+ArrowDown',
    note: 'Sends the focused window to the taskbar.',
  },
  {
    id: 'window.snapLeft',
    label: 'Snap window left',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+ArrowLeft',
    note: 'Fills the left half of the desktop. Press again to take the left quarter.',
  },
  {
    id: 'window.snapRight',
    label: 'Snap window right',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+ArrowRight',
    note: 'Fills the right half of the desktop. Press again to take the right quarter.',
  },
  {
    // Liquid Workplace L9 bullet 1: "finish taskbar/context/command entry
    // points without forcing Liquid". The title-bar button and the taskbar
    // context menu both offered this; the COMMAND entry point did not exist at
    // all, so the palette — the one entry point a keyboard user reaches without
    // pointing at a specific window — could not present anything as Liquid.
    // No default chord: Liquid stays explicit and opt-in, never something a
    // stray key produces.
    id: 'window.togglePresentation',
    label: 'Make Liquid / Return to standard',
    category: 'Window',
    defaultKeys: '',
    note: 'Switches the focused window between conventional and Liquid presentation. Geometry, focus and state are preserved both ways.',
  },
  {
    id: 'window.center',
    label: 'Center window',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+C',
    note: 'Restores a comfortable reading size and centers the focused window.',
  },
  {
    id: 'window.tileAll',
    label: 'Tile all windows',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+T',
    note: 'Lays every open window out in a grid so nothing overlaps.',
  },
  {
    id: 'window.cascade',
    label: 'Cascade windows',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+K',
    note: 'Stacks windows in a diagonal fan with every title bar reachable.',
  },
  {
    id: 'window.showDesktop',
    label: 'Show desktop (minimize all)',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+D',
    // One-way on purpose, and the note says so: pressing it again does not put
    // the desk back. Restore all windows is the return trip.
    note: 'Sends every visible window to the taskbar. Ctrl+Alt+Shift+D brings them back.',
  },
  {
    id: 'window.restoreAll',
    label: 'Restore all windows',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+Shift+D',
    note: 'Brings everything back from the taskbar.',
  },
  {
    id: 'window.pinTop',
    label: 'Pin window on top',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+O',
    note: 'Keeps the focused window above the others until unpinned. Survives restart.',
  },
  {
    id: 'window.closeAll',
    label: 'Close all windows',
    category: 'Window',
    // Ctrl+Shift+W is the reader's copy-word and Ctrl+Alt+W is the Toolbox's
    // close-active-tool, so this escalates Ctrl+W by one modifier — the same
    // shape as Ctrl+Alt+Shift+D (restore all). osShortcutDefaults.test.ts
    // guards the whole chord space against collisions.
    defaultKeys: 'Ctrl+Alt+Shift+W',
    note: 'Clears the desk and empties the taskbar. Ctrl+W closes just the focused app.',
  },
  {
    id: 'window.closeOthers',
    label: 'Close all but focused window',
    category: 'Window',
    defaultKeys: '',
    note: 'Unbound by default. Keeps the app in front and clears everything else off the taskbar.',
  },
  {
    id: 'nav.nextDesktop',
    label: 'Switch to next desktop',
    category: 'Window',
    // Not Win+Ctrl+Arrow: that is Windows' own virtual-desktop switch, and the OS takes
    // it before Electron sees the keydown, so the old default could never fire. Page
    // keys are the "next page of windows" and have no Windows owner with Ctrl+Alt+Shift.
    defaultKeys: 'Ctrl+Alt+Shift+PageDown',
    note: 'Cycles Desktop 1 → Desktop 2. Saves the current layout before switching.',
  },
  {
    id: 'nav.prevDesktop',
    label: 'Switch to previous desktop',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+Shift+PageUp',
    note: 'Cycles Desktop 2 → Desktop 1. Saves the current layout before switching.',
  },
  {
    id: 'window.zoomIn',
    label: 'Zoom in',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+=',
    note: 'Scales the whole interface. Plain Ctrl+= is the reader font size, which is scoped to a book.',
  },
  {
    id: 'window.zoomOut',
    label: 'Zoom out',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+-',
    note: 'Scales the whole interface. Plain Ctrl+- is the reader font size, which is scoped to a book.',
  },
  {
    id: 'window.zoomReset',
    label: 'Reset zoom to 100%',
    category: 'Window',
    defaultKeys: 'Ctrl+Alt+0',
    note: 'Returns the interface scale to 100%. A reader keeps its own font size.',
  },

  // Reader (handlers attach while a book is open)
  {
    id: 'reader.highlightWord',
    label: 'Highlight current word',
    category: 'Reader',
    defaultKeys: 'H',
    note: 'Personal color mark (annotations) — independent of New/Learning/Known vocabulary levels.',
  },
  {
    id: 'reader.toggleWordHighlight',
    label: 'Toggle vocabulary highlighting',
    category: 'Reader',
    defaultKeys: 'Ctrl+Alt+H',
    note: 'LingQ-style New/Learning/Familiar/Known colors.',
  },
  { id: 'reader.dictLookup', label: 'Dictionary lookup (selection)', category: 'Reader', defaultKeys: 'Ctrl+D' },
  { id: 'reader.translateSel', label: 'Translate selection', category: 'Reader', defaultKeys: 'Ctrl+T' },
  {
    id: 'reader.toggleTranslation',
    label: 'Show / hide book translation',
    category: 'Reader',
    defaultKeys: 'Ctrl+Alt+Shift+T',
    note: 'Toggles original-only vs bilingual/translation overlay in EPUB and manga readers. Ctrl+Shift+T belongs to the Toolbox (Reopen Last Tool).',
  },
  { id: 'reader.fontUp', label: 'Increase font size', category: 'Reader', defaultKeys: 'Ctrl+=' },
  { id: 'reader.fontDown', label: 'Decrease font size', category: 'Reader', defaultKeys: 'Ctrl+-' },
  { id: 'reader.zoomReset', label: 'Reset font size', category: 'Reader', defaultKeys: 'Ctrl+0' },
  { id: 'reader.highlightSentence', label: 'Highlight current sentence', category: 'Reader', defaultKeys: 'Ctrl+Shift+S' },
  { id: 'reader.copySentence', label: 'Copy current sentence', category: 'Reader', defaultKeys: 'Ctrl+Shift+C' },
  { id: 'reader.copyWord', label: 'Copy current word', category: 'Reader', defaultKeys: 'Ctrl+Shift+W' },
  { id: 'reader.saveToCollection', label: 'Save selection as flashcard', category: 'Reader', defaultKeys: 'Ctrl+Shift+F' },
  {
    id: 'reader.selectSentence',
    label: 'Select sentence at click',
    category: 'Reader',
    defaultKeys: 'Alt+MouseLeft',
    note:
      'Hold the chord and click a word to select the full sentence (ends at 。！？ etc., not commas). ' +
      'Does not open the dictionary popup. Rebind freely — mouse buttons and modifiers supported.',
  },
  {
    id: 'reader.pageNext',
    label: 'Next page / scroll forward',
    category: 'Reader',
    defaultKeys: 'PageDown',
    note: 'Active in novel / EPUB readers. Space is reserved for flashcard flip.',
  },
  {
    id: 'reader.pagePrev',
    label: 'Previous page / scroll back',
    category: 'Reader',
    defaultKeys: 'PageUp',
    note: 'Active in novel / EPUB readers.',
  },

  // Manga
  {
    id: 'manga.nextPage',
    label: 'Next manga page',
    category: 'Manga',
    defaultKeys: 'ArrowRight|ArrowDown',
    note: 'Active while the manga reader is open.',
  },
  {
    id: 'manga.prevPage',
    label: 'Previous manga page',
    category: 'Manga',
    defaultKeys: 'ArrowLeft|ArrowUp',
    note: 'Active while the manga reader is open.',
  },
  {
    id: 'manga.zoomIn',
    label: 'Manga zoom in',
    category: 'Manga',
    defaultKeys: '',
    note: 'Unbound by default — manga also listens to reader font-up (Ctrl+=).',
  },
  {
    id: 'manga.zoomOut',
    label: 'Manga zoom out',
    category: 'Manga',
    defaultKeys: '',
    note: 'Unbound by default — manga also listens to reader font-down (Ctrl+-).',
  },
  {
    id: 'manga.zoomReset',
    label: 'Manga zoom reset',
    category: 'Manga',
    defaultKeys: '',
    note: 'Unbound by default — manga also listens to reader zoom-reset (Ctrl+0).',
  },

  // Dictionary
  {
    id: 'dictionary.playPronunciation',
    label: 'Play pronunciation',
    category: 'Dictionary',
    defaultKeys: 'Ctrl+Alt+P',
    note: 'Works while a dictionary popup is open. Ctrl+Shift+P opens the Toolbox command palette.',
  },
  {
    id: 'dictionary.lookupSelection',
    label: 'Look up selected text',
    category: 'Dictionary',
    defaultKeys: 'Ctrl+Alt+L',
    note: 'Works anywhere in the app. Long selections open the sentence translator instead.',
  },
  {
    id: 'dictionary.lookupClipboard',
    label: 'Look up clipboard text',
    category: 'Dictionary',
    defaultKeys: 'Ctrl+Alt+V',
    note: 'Reads the clipboard and opens the dictionary on it — handy for text copied from other apps.',
  },
  {
    id: 'dictionary.toggleGlobalLookup',
    label: 'Toggle app-wide click lookup',
    category: 'Dictionary',
    defaultKeys: '',
    note: 'Turns the Shift+click dictionary gesture on or off without opening settings.',
  },

  // Flashcards — review session
  {
    id: 'flashcards.flip',
    label: 'Reveal / flip card',
    category: 'Flashcards',
    defaultKeys: 'Space|Enter',
    note: 'Active during a flashcard review session.',
  },
  {
    id: 'flashcards.again',
    label: 'Rate Again',
    category: 'Flashcards',
    defaultKeys: '1',
    // The video player's own keymap (`vc_defaultKeybindings`) seeks with bare A / D,
    // which is why the ratings sit on the digit row and not on letters.
    note: 'After the card is flipped. Bare A and D seek the video player back and forward.',
  },
  {
    id: 'flashcards.hard',
    label: 'Rate Hard',
    category: 'Flashcards',
    defaultKeys: '2',
    note: 'After the card is flipped.',
  },
  {
    id: 'flashcards.gotIt',
    label: 'Rate Good',
    category: 'Flashcards',
    defaultKeys: '3|G',
    // Was '2|G' until the Hard/Easy ratings existed. 1/2/3/4 is the Anki order the
    // on-screen buttons already read left to right, so the digit row now matches them.
    note: 'After the card is flipped.',
  },
  {
    id: 'flashcards.easy',
    label: 'Rate Easy',
    category: 'Flashcards',
    defaultKeys: '4',
    note: 'After the card is flipped.',
  },
  {
    id: 'flashcards.undo',
    label: 'Undo last rating',
    category: 'Flashcards',
    defaultKeys: 'Ctrl+Z',
    note: 'Active during review. Puts the last rated card back with its old schedule.',
  },
  {
    id: 'flashcards.replayAudio',
    label: 'Replay card audio',
    category: 'Flashcards',
    defaultKeys: 'P',
    note: 'The only way to repeat the prompt in audio-only review. Bare R is reserved for video subtitle replay.',
  },
  {
    id: 'flashcards.prev',
    label: 'Previous card',
    category: 'Flashcards',
    defaultKeys: ',',
    note: 'Active during review. Arrows are reserved for the manga reader.',
  },
  {
    id: 'flashcards.next',
    label: 'Next card',
    category: 'Flashcards',
    defaultKeys: '.',
    note: 'Active during review. Arrows are reserved for the manga reader.',
  },
  {
    id: 'flashcards.end',
    label: 'End review session',
    category: 'Flashcards',
    defaultKeys: 'Escape',
    note: 'Active during review.',
  },

  // Immersion browser
  {
    id: 'immersion.focusUrl',
    label: 'Focus URL bar',
    category: 'Immersion',
    defaultKeys: 'Ctrl+Shift+L',
    note: 'Immersion view only. Ctrl+L is reserved for Toolbox sidebar focus.',
  },
  {
    id: 'immersion.reload',
    label: 'Reload page',
    category: 'Immersion',
    defaultKeys: 'F5',
    note: 'Immersion view only. Ctrl+R is reserved for Toolbox recent tools.',
  },
  {
    id: 'immersion.bookmark',
    label: 'Save current site',
    category: 'Immersion',
    defaultKeys: 'Ctrl+Shift+D',
    note: 'Immersion view only. Ctrl+D stays on reader dictionary lookup.',
  },
  {
    id: 'immersion.focusMode',
    label: 'Toggle focus mode',
    category: 'Immersion',
    defaultKeys: 'F6',
    note: 'Immersion view only.',
  },
  {
    id: 'immersion.cycleMode',
    label: 'Cycle immersion chrome mode',
    category: 'Immersion',
    defaultKeys: 'F8',
    note: 'Immersion view only.',
  },

  // Utility
  // Not Ctrl+Shift+V: that is paste-as-plain-text in every text field.
  { id: 'clipboard.open', label: 'Open clipboard history', category: 'Utility', defaultKeys: 'Ctrl+Alt+Shift+V' },
  { id: 'calendar.open', label: 'Open calendar', category: 'Utility', defaultKeys: '' },
  {
    id: 'app.toggle',
    label: 'Hide / show Gum',
    category: 'Utility',
    defaultKeys: 'Ctrl+Alt+Shift+G',
    global: true,
    note:
      'System-wide. With the Windows Startup helper enabled (Settings → Shortcuts), this works even when Gum is fully quit — press to start, press again to hide. Without the helper, it only works while the app is running. Rebind anytime in Shortcuts; the helper picks up the new chord automatically.',
  },
  {
    id: 'app.restart',
    label: 'Fully restart Gum',
    category: 'Utility',
    defaultKeys: 'Ctrl+Alt+Shift+R',
    global: true,
    note:
      'Quits and relaunches so main-process / helper / code changes apply. Not the same as Hide / show. With the Startup helper installed, the chord stays OS-level and syncs when you rebind it here.',
  },
  {
    id: 'study.focusMode',
    label: 'Toggle focus mode',
    category: 'Utility',
    defaultKeys: 'Ctrl+Shift+E',
    note: 'Library, reader, dictionary, Anki, and mini music — no desktop.',
  },
  {
    id: 'perf.toggleOverlay',
    label: 'Toggle performance HUD',
    category: 'Utility',
    defaultKeys: 'Ctrl+Alt+F',
    note: 'FPS / heap / particle budget overlay. Ctrl+Shift+F stays on save-to-collection.',
  },

  // Music
  {
    id: 'music.playPause',
    label: 'Play / pause',
    category: 'Music',
    defaultKeys: '',
    note: 'Unbound by default — Space is used by the reader / flashcards.',
  },
  // Not Ctrl+ArrowLeft/Right: those move the caret by a word in every text field.
  { id: 'music.next', label: 'Next track', category: 'Music', defaultKeys: 'Ctrl+Alt+PageDown' },
  { id: 'music.prev', label: 'Previous track', category: 'Music', defaultKeys: 'Ctrl+Alt+PageUp' },
  { id: 'music.volumeUp', label: 'Volume up', category: 'Music', defaultKeys: 'Ctrl+ArrowUp' },
  { id: 'music.volumeDown', label: 'Volume down', category: 'Music', defaultKeys: 'Ctrl+ArrowDown' },
  // The lyric-line transport (slice 20's buttons, pressed live in slice 21). These are
  // MUSIC ids, not the `video.*` ones the same three gestures carry in the player, and the
  // reason is mechanical rather than tidy: `registerCommandHandler` is a last-registrant-wins
  // STACK, and `MediaWorkspaceHost` mounts at App level, so the lyrics pane and the video
  // overlay can be mounted at the same time. Sharing an id would silently give one of them
  // both gestures depending on mount order.
  //
  // Unbound by default, for the same reason `music.playPause` above is: every free single
  // letter belongs to the adopted player's own keymap, and the Music block already spends
  // Ctrl+Alt+PageUp/PageDown and Ctrl+ArrowUp/Down on track/volume while `Ctrl+Alt+Arrow*`
  // is window snapping. A row the user binds beats a default chosen to fill a column — and
  // bind-then-press is proven (phase I of `retirement-step3-harness.mjs`).
  //
  // Unlike their neighbours these three are NOT built-ins: stepping needs the cue sheet of
  // the track on screen, which lives in the lyrics pane, not in `playerBus`. So they work
  // while Music is open, which is the only place a lyric line means anything.
  {
    id: 'music.prevLine',
    label: 'Previous lyric line',
    category: 'Music',
    defaultKeys: '',
    note: 'Synced lyrics only. Unbound by default — bind it in this list.',
  },
  {
    id: 'music.replayLine',
    label: 'Replay lyric line',
    category: 'Music',
    defaultKeys: '',
    note: 'Synced lyrics only. Unbound by default — bind it in this list.',
  },
  {
    id: 'music.nextLine',
    label: 'Next lyric line',
    category: 'Music',
    defaultKeys: '',
    note: 'Synced lyrics only. Unbound by default — bind it in this list.',
  },

  // Video player (Phase 5b)
  { id: 'nav.open.video', label: 'Open Video player', category: 'Navigation', defaultKeys: '' },
  { id: 'nav.open.youtube', label: 'Open YouTube', category: 'Navigation', defaultKeys: '' },
  // These ten were the LEGACY player's, registered by `useMedia` against its own
  // `videoRef`. Slice 16 deleted the component that rendered `<video ref={videoRef}>`, so
  // every one of them became a handler acting on a ref nothing attaches. Slice 19 moved
  // them onto `VideoCoreStudyOverlay`, which owns the same six capabilities against the
  // adopted player — so the rows are true again rather than merely present.
  //
  // The defaults moved with them, and the rule is the adopted keymap
  // (`vc_defaultKeybindings`), read from source rather than from memory. It takes
  // KeyA/KeyD (seek ±30s), KeyF (fullscreen), KeyP (picture-in-picture) and both brackets
  // (speed) — which is four of the six old defaults, including the only two that ever
  // dispatched. R/W/S/Semicolon/Quote are the codes the overlay itself already chose from
  // what that map leaves free.
  { id: 'video.replayLine', label: 'Replay subtitle line', category: 'Video', defaultKeys: 'R' },
  { id: 'video.prevLine', label: 'Previous subtitle line', category: 'Video', defaultKeys: 'W' },
  { id: 'video.nextLine', label: 'Next subtitle line', category: 'Video', defaultKeys: 'S' },
  { id: 'video.subEarlier', label: 'Subtitle earlier (−100 ms)', category: 'Video', defaultKeys: ';' },
  { id: 'video.subLater', label: 'Subtitle later (+100 ms)', category: 'Video', defaultKeys: "'" },
  // Unbound rather than re-homed: `Shift+[` was unreachable for a second reason — Shift
  // already changed the symbol, so `chordFromEvent` never records it and no keypress can
  // produce that string. There is no obvious free chord for a ±500 ms nudge, and an
  // unbound row a user binds beats a default chosen to fill a column.
  { id: 'video.subEarlierLarge', label: 'Subtitle earlier (−500 ms)', category: 'Video', defaultKeys: '' },
  { id: 'video.subLaterLarge', label: 'Subtitle later (+500 ms)', category: 'Video', defaultKeys: '' },
  { id: 'video.toggleAutoPause', label: 'Toggle auto-pause', category: 'Video', defaultKeys: '' },
  { id: 'video.toggleLoop', label: 'Toggle line loop', category: 'Video', defaultKeys: '' },
  // Subtitle display, on Shift chords. The adopted player ignores every modified key
  // (`handleKeyboardShortcuts` returns on any of Ctrl/Shift/Alt/Meta), so Shift+letter and
  // Shift+Arrow are free of its keymap by construction, and no other catalog row uses them.
  // `Shift+F` / `Shift+D` read as Furigana / Dual; the arrows move the line the way they point.
  { id: 'video.toggleFurigana', label: 'Toggle furigana', category: 'Video', defaultKeys: 'Shift+F' },
  { id: 'video.toggleDualSubs', label: 'Toggle dual subtitles', category: 'Video', defaultKeys: 'Shift+D' },
  { id: 'video.toggleSubtitles', label: 'Hide / show subtitles', category: 'Video', defaultKeys: 'V' },
  { id: 'video.cycleVideoFit', label: 'Picture: fit / fill / stretch', category: 'Video', defaultKeys: 'Shift+Z' },
  { id: 'video.subPositionUp', label: 'Move subtitles up', category: 'Video', defaultKeys: 'Shift+ArrowUp' },
  { id: 'video.subPositionDown', label: 'Move subtitles down', category: 'Video', defaultKeys: 'Shift+ArrowDown' },
  { id: 'video.subDelayReset', label: 'Reset subtitle delay', category: 'Video', defaultKeys: '' },
  // Mining and seeking. Unbound by default for the same reason as the rows above:
  // every free single letter belongs to the adopted player's own keymap, and a
  // default that collides is worse than one the user binds deliberately.
  {
    id: 'video.mineCurrentLine',
    label: 'Mine the current subtitle line',
    category: 'Video',
    defaultKeys: '',
    note: 'Sends the line playing right now to Anki, with whatever the mining panel has armed.',
  },
  // System audio and live captions (main/systemAudioCapture.ts). System-wide on
  // purpose: the audio being mined plays in another app — a browser, a game, a
  // stream — so these have to fire while Gum is in the background. Pushed to
  // main by `syncCaptionsGlobalShortcuts` below; Ctrl+Alt+Shift+letter is the
  // band the other system-wide rows use, and none of these letters is taken.
  {
    id: 'captions.mineRecent',
    label: 'Mine the last seconds of system audio',
    category: 'Immersion',
    defaultKeys: 'Ctrl+Alt+Shift+M',
    global: true,
    note: 'System-wide. Cuts the last few seconds from system-audio capture, transcribes them, and shows the card to check before it is added. Capture must be on.',
  },
  {
    id: 'captions.toggleRecording',
    label: 'Start / stop a system-audio recording',
    category: 'Immersion',
    defaultKeys: 'Ctrl+Alt+Shift+K',
    global: true,
    note: 'System-wide. Records up to 60 seconds of system audio into a card. If capture was off it is on only for the recording.',
  },
  {
    id: 'captions.toggleOverlay',
    label: 'Show / hide the live captions bar',
    category: 'Immersion',
    defaultKeys: 'Ctrl+Alt+Shift+C',
    global: true,
    note: 'System-wide. An always-on-top caption bar: click a word to look it up, mine a line with its audio.',
  },
  {
    id: 'captions.mineLine',
    label: 'Mine the current caption line',
    category: 'Immersion',
    defaultKeys: 'Ctrl+Alt+Shift+L',
    global: true,
    note: 'System-wide. Adds the newest caption line as a sentence card, with its audio when capture is on.',
  },
  {
    id: 'captions.toggleCapture',
    label: 'Turn system-audio capture on / off',
    category: 'Immersion',
    defaultKeys: '',
    global: true,
    note: 'System-wide. Unbound by default so capture is never switched on by a stray key; bind it here if you want one.',
  },
  {
    id: 'video.seekBack',
    label: 'Rewind',
    category: 'Video',
    defaultKeys: '',
    note: 'Step size is set in the player’s Playback controls, from 1 to 60 seconds.',
  },
  {
    id: 'video.seekForward',
    label: 'Fast-forward',
    category: 'Video',
    defaultKeys: '',
    note: 'Step size is set in the player’s Playback controls, from 1 to 60 seconds.',
  },
  // Phase 6 slice 11. Unlike its neighbours this one is a BUILT-IN, not a command
  // a view registers: the point is that it works from anywhere, including from
  // inside the full-screen media workspace, where the palette's Continue-watching
  // group is out of reach because that group is search-mode only.
  // Unbound by default — every free single letter here belongs to the adopted
  // player's own keymap, and a chord that collides is worse than one you bind
  // yourself in Settings.
  {
    id: 'video.resumeLast',
    label: 'Resume last episode',
    category: 'Video',
    defaultKeys: '',
    note: 'Reopens the most recently watched file at the second you stopped. Needs the media server enabled.',
  },
  /*
    Liquid Study Workspace. All unbound by default, for the reason the rows above give:
    every free single letter belongs to the adopted player's own keymap, and a default
    that collides is worse than one the user binds deliberately.

    They are registered by `VideoCoreStudyOverlay` while a video is open, so they are
    live exactly when they mean something — the same ownership rule the `video.*` rows
    follow, and the one that stopped the catalog pointing at a retired player's handlers.
  */
  {
    id: 'workspace.customize',
    label: 'Customize workspace',
    category: 'Video',
    defaultKeys: '',
    note: 'Shows block outlines, drag handles and the block library. Escape leaves it.',
  },
  {
    id: 'workspace.reset',
    label: 'Reset the current workspace',
    category: 'Video',
    defaultKeys: '',
    note: 'Restores the preset this workspace was built from. Custom workspaces are untouched.',
  },
  {
    id: 'workspace.nextMode',
    label: 'Next workspace',
    category: 'Video',
    defaultKeys: '',
    note: 'Cycles Watch → Transcript → Mining → Practice → Review → Listening → Immersion.',
  },
  {
    id: 'workspace.toggleTranscript',
    label: 'Toggle the transcript block',
    category: 'Video',
    defaultKeys: '',
  },
  {
    id: 'workspace.toggleAi',
    label: 'Toggle the AI workspace block',
    category: 'Video',
    defaultKeys: '',
  },
  {
    id: 'workspace.focusVideo',
    label: 'Focus the video',
    category: 'Video',
    defaultKeys: '',
    note: 'Closes every temporary panel and returns the picture to full attention.',
  },
  ...TOOLBOX_SHORTCUT_COMMANDS.map((command): AppCommand => ({
    id: command.id,
    label: command.name,
    category: 'Toolbox',
    defaultKeys: command.defaultShortcut,
    note: `${command.description} Scope: ${command.scope}.`,
    feature: command.feature,
    scope: command.scope,
    global: command.global,
    worksWhileTyping: command.worksWhileTyping,
    editable: command.editable,
  })),
];

/** App ids users can bind “Open …” shortcuts to. */
export const SHORTCUT_OPEN_APPS: { id: string; label: string }[] = [
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'library', label: 'Library' },
  { id: 'novels', label: 'Novels' },
  { id: 'reading', label: 'Reading Finder' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'translate', label: 'Translate' },
  { id: 'music', label: 'Music' },
  { id: 'player', label: 'Media library' },
  { id: 'video', label: 'Video player' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'immersion', label: 'Immersion' },
  { id: 'anki', label: 'Anki' },
  { id: 'stats', label: 'Statistics' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'resources', label: 'Resources' },
  { id: 'games', label: 'Game Arena' },
  { id: 'settings', label: 'Settings' },
  { id: 'city', label: 'Mooncap' },
];

// ---------------------------------------------------------------------------
// Persistence: per-profile overrides. absent = default, string = override,
// null = explicitly unbound. Custom commands stored alongside.
// ---------------------------------------------------------------------------
type Overrides = Record<string, string | null>;
interface ShortcutStore {
  active: string;
  profiles: Record<string, Overrides>;
  customCommands: CustomCommandDef[];
  /** Which set of built-in defaults the profiles were last migrated to (see MOVED_DEFAULTS). */
  defaultsVersion?: number;
}

const KEY = 'jp-shortcuts-v1';
const EVENT = 'shortcuts-changed';
const DEFAULT_PROFILE = 'Default';

const MOUSE_NAMES = ['MouseLeft', 'MouseMiddle', 'MouseRight', 'Mouse4', 'Mouse5'] as const;

function emptyStore(): ShortcutStore {
  return {
    active: DEFAULT_PROFILE,
    profiles: { [DEFAULT_PROFILE]: {} },
    customCommands: [],
    defaultsVersion: DEFAULTS_VERSION,
  };
}

/**
 * Built-in defaults that moved, keyed by the version that moved them, as `id → old chord`
 * (the new chord is whatever the catalog says now).
 *
 * Version 2 (round-2 keyboard pass) took every default off a chord that already means
 * something to a text field or to Windows: Ctrl+Space is the Chinese IME toggle,
 * Ctrl+Shift+Z is Redo, Ctrl+Shift+V is paste-as-plain-text, Ctrl(+Shift)+Arrow moves or
 * selects by word, and Win+Ctrl+Arrow is Windows' own desktop switch.
 */
const DEFAULTS_VERSION = 2;
const MOVED_DEFAULTS: Record<number, Record<string, string>> = {
  2: {
    'nav.palette': 'Ctrl+Space',
    'nav.undo': 'Ctrl+Shift+Z',
    'clipboard.open': 'Ctrl+Shift+V',
    'music.next': 'Ctrl+ArrowRight',
    'music.prev': 'Ctrl+ArrowLeft',
    'window.moveToNextMonitor': 'Ctrl+Shift+ArrowRight',
    'window.moveToPrevMonitor': 'Ctrl+Shift+ArrowLeft',
    'nav.nextDesktop': 'Ctrl+Meta+ArrowRight',
    'nav.prevDesktop': 'Ctrl+Meta+ArrowLeft',
  },
};

/**
 * Carry profiles from an older set of defaults to the current one.
 *
 * - No override, or an override that merely spells the OLD default: the row follows the
 *   default, so it moves to the new chord (the override is dropped).
 * - An override that is anything else is the user's own choice and is kept as is.
 * - Exception: if the user already bound the NEW chord to another command in that
 *   profile, moving would hand one keypress to two commands. The row keeps its old chord
 *   as an explicit override instead, so nothing the user had working stops working.
 */
export function migrateMovedDefaults(profiles: Record<string, Overrides>, fromVersion: number): boolean {
  let changed = false;
  for (let v = fromVersion + 1; v <= DEFAULTS_VERSION; v += 1) {
    const moved = MOVED_DEFAULTS[v];
    if (!moved) continue;
    for (const prof of Object.values(profiles)) {
      if (!prof || typeof prof !== 'object') continue;
      for (const [id, oldKeys] of Object.entries(moved)) {
        const ov = prof[id];
        const old = normalizeChord(oldKeys);
        if (ov === null) continue;
        if (typeof ov === 'string' && normalizeChord(ov) !== old) continue;
        const next = splitChords(normalizeChord(COMMAND_CATALOG.find((c) => c.id === id)?.defaultKeys ?? ''));
        const taken = Object.entries(prof).some(
          ([other, keys]) =>
            other !== id &&
            typeof keys === 'string' &&
            splitChords(normalizeChord(keys)).some((k) => next.includes(k)),
        );
        if (taken) {
          if (prof[id] !== old) {
            prof[id] = old;
            changed = true;
          }
        } else if (id in prof) {
          delete prof[id];
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * H used to toggle vocabulary colors; it is now personal highlight.
 * Migrate profiles that still bind bare H to toggleWordHighlight.
 */
function migrateHighlightHKey(profiles: Record<string, Overrides>): boolean {
  let changed = false;
  for (const prof of Object.values(profiles)) {
    if (!prof || typeof prof !== 'object') continue;
    const toggle = prof['reader.toggleWordHighlight'];
    if (typeof toggle === 'string') {
      const parts = toggle
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.some((p) => p.toUpperCase() === 'H') && parts.length === 1) {
        // Bare H was the old default for vocab toggle — move to new binding.
        prof['reader.toggleWordHighlight'] = 'Ctrl+Alt+H';
        // Free H for personal highlight unless user already bound it.
        if (prof['reader.highlightWord'] === undefined) {
          delete prof['reader.highlightWord'];
        }
        changed = true;
      }
    }
    // Ensure highlightWord is not left unbound while H is free of overrides.
    // (no-op if already default)
  }
  return changed;
}

function loadStore(): ShortcutStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ShortcutStore>;
      if (p && p.profiles && typeof p.profiles === 'object') {
        const profiles = p.profiles as Record<string, Overrides>;
        if (!profiles[DEFAULT_PROFILE]) profiles[DEFAULT_PROFILE] = {};
        const active = typeof p.active === 'string' && profiles[p.active] ? p.active : DEFAULT_PROFILE;
        const customCommands = Array.isArray(p.customCommands)
          ? p.customCommands.filter(
              (c): c is CustomCommandDef =>
                !!c &&
                typeof c === 'object' &&
                typeof (c as CustomCommandDef).id === 'string' &&
                typeof (c as CustomCommandDef).label === 'string' &&
                typeof (c as CustomCommandDef).defaultKeys === 'string' &&
                !!(c as CustomCommandDef).action,
            )
          : [];
        const fromVersion = typeof p.defaultsVersion === 'number' ? p.defaultsVersion : 1;
        const movedDefaults = fromVersion < DEFAULTS_VERSION;
        if (movedDefaults) migrateMovedDefaults(profiles, fromVersion);
        const migrated = migrateHighlightHKey(profiles) || movedDefaults;
        const next: ShortcutStore = { active, profiles, customCommands, defaultsVersion: DEFAULTS_VERSION };
        if (migrated) {
          try {
            localStorage.setItem(KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }
        return next;
      }
    }
  } catch {
    /* fall through */
  }
  return emptyStore();
}

let store: ShortcutStore = loadStore();

// Keep the OS-level global shortcut for `toolbox.open` in sync with the user's
// current binding (pushed to main on boot and on every rebind). If another
// application owns the accelerator, main reports it and the in-app binding
// keeps working — the failure is surfaced once as a quiet toast.
let lastSyncedToolboxOpenKeys: string | null = null;
let lastSyncedAppToggleKeys: string | null = null;
let lastSyncedAppRestartKeys: string | null = null;
let lastSyncedCaptionsKeys: string | null = null;
let lastSyncedOsHotkeyPayload: string | null = null;
let osHotkeyInstalledCache: boolean | null = null;

const NAV_OPEN_PREFIX = 'nav.open.';

function firstOsChord(keys: string): string {
  if (!keys) return '';
  const first = keys.split('|')[0]!.trim();
  if (!first || /Mouse(Left|Middle|Right|4|5)/i.test(first)) return '';
  return first;
}

/** Collect toggle / restart / open-app chords for the Windows Startup helper. */
export function collectOsHotkeyBindings(): {
  toggle: string;
  restart: string;
  opens: { section: string; chord: string }[];
} {
  const toggle = firstOsChord(effectiveKeys('app.toggle')) || 'Ctrl+Alt+Shift+G';
  const restart = firstOsChord(effectiveKeys('app.restart'));
  const opens: { section: string; chord: string }[] = [];
  const seen = new Set<string>();

  for (const cmd of COMMAND_CATALOG) {
    if (!cmd.id.startsWith(NAV_OPEN_PREFIX)) continue;
    const section = cmd.id.slice(NAV_OPEN_PREFIX.length);
    const chord = firstOsChord(effectiveKeys(cmd.id));
    if (!chord || seen.has(section)) continue;
    seen.add(section);
    opens.push({ section, chord });
  }

  for (const custom of store.customCommands) {
    if (custom.action.type !== 'openApp') continue;
    const section = String(custom.action.appId || '').trim().toLowerCase();
    if (!section || seen.has(section)) continue;
    const chord = firstOsChord(effectiveKeys(custom.id));
    if (!chord) continue;
    // Prefer catalog nav.open.* when both exist; custom fills gaps.
    if (SHORTCUT_OPEN_APPS.some((a) => a.id === section)) {
      seen.add(section);
      opens.push({ section, chord });
    }
  }

  return { toggle, restart, opens };
}

function syncToolboxGlobalShortcut(): void {
  try {
    if (!window.api?.blancSetGlobalShortcut) return;
    // Only the main Study window owns the registration; the Blanc window doing
    // it too would double-register and could race error toasts.
    if (new URLSearchParams(window.location.search).get('blanc') === '1') return;
    const keys = getBindings().find((row) => row.id === 'toolbox.open')?.keys ?? '';
    if (keys === lastSyncedToolboxOpenKeys) return;
    lastSyncedToolboxOpenKeys = keys;
    void window.api.blancSetGlobalShortcut(keys).then((result) => {
      if (result && !result.ok && result.error) {
        window.dispatchEvent(
          new CustomEvent('os:toast', {
            detail: { message: t('shortcut.toast.toolboxGlobal', { error: result.error }), kind: 'muted' },
          }),
        );
      }
    });
  } catch {
    /* Non-Electron harness (tests, browser dev harness) — in-app binding only. */
  }
}

function syncAppToggleGlobalShortcut(): void {
  try {
    if (!window.api?.appSetToggleShortcut) return;
    if (new URLSearchParams(window.location.search).get('blanc') === '1') return;
    const keys = getBindings().find((row) => row.id === 'app.toggle')?.keys ?? '';
    if (keys === lastSyncedAppToggleKeys) return;
    lastSyncedAppToggleKeys = keys;
    void window.api.appSetToggleShortcut(keys).then((result) => {
      if (result && !result.ok && result.error) {
        window.dispatchEvent(
          new CustomEvent('os:toast', {
            detail: { message: t('shortcut.toast.appToggle', { error: result.error }), kind: 'muted' },
          }),
        );
      }
    });
  } catch {
    /* Non-Electron harness */
  }
}

function syncAppRestartGlobalShortcut(): void {
  try {
    if (!window.api?.appSetRestartShortcut) return;
    if (new URLSearchParams(window.location.search).get('blanc') === '1') return;
    const keys = getBindings().find((row) => row.id === 'app.restart')?.keys ?? '';
    if (keys === lastSyncedAppRestartKeys) return;
    lastSyncedAppRestartKeys = keys;
    void window.api.appSetRestartShortcut(keys).then((result) => {
      if (result && !result.ok && result.error) {
        window.dispatchEvent(
          new CustomEvent('os:toast', {
            detail: { message: t('shortcut.toast.appRestart', { error: result.error }), kind: 'muted' },
          }),
        );
      }
    });
  } catch {
    /* Non-Electron harness */
  }
}

/**
 * The captions / system-audio rows are system-wide: push their chords to main
 * (`main/captionsGlobalCommands.ts`) on boot and on every rebind, and say once
 * which of them another application already owns.
 */
export function collectCaptionsGlobalChords(): Record<string, string> {
  const chords: Record<string, string> = {};
  for (const id of CAPTIONS_GLOBAL_COMMANDS) chords[id] = effectiveKeys(id);
  return chords;
}

function syncCaptionsGlobalShortcuts(): void {
  try {
    if (!window.api?.captionsSetGlobalShortcuts) return;
    if (new URLSearchParams(window.location.search).get('blanc') === '1') return;
    const chords = collectCaptionsGlobalChords();
    const serialized = JSON.stringify(chords);
    if (serialized === lastSyncedCaptionsKeys) return;
    lastSyncedCaptionsKeys = serialized;
    void window.api.captionsSetGlobalShortcuts(chords).then((result) => {
      const first = result && !result.ok ? Object.values(result.errors ?? {})[0] : undefined;
      if (first) {
        window.dispatchEvent(
          new CustomEvent('os:toast', {
            detail: { message: t('shortcut.toast.captionsGlobal', { error: first }), kind: 'muted' },
          }),
        );
      }
    });
  } catch {
    /* Non-Electron harness */
  }
}

/** Push current Shortcuts chords into the Startup helper (when installed). */
export function syncOsHotkeyHelperFromShortcuts(force = false): void {
  try {
    if (!window.api?.osHotkeySync) return;
    if (new URLSearchParams(window.location.search).get('blanc') === '1') return;
    const payload = collectOsHotkeyBindings();
    const serialized = JSON.stringify(payload);
    if (!force && serialized === lastSyncedOsHotkeyPayload && osHotkeyInstalledCache === true) return;

    void window.api.osHotkeyStatus?.().then((status) => {
      osHotkeyInstalledCache = Boolean(status?.installed);
      if (!status?.installed) {
        lastSyncedOsHotkeyPayload = null;
        return;
      }
      if (!force && serialized === lastSyncedOsHotkeyPayload) return;
      lastSyncedOsHotkeyPayload = serialized;
      void window.api.osHotkeySync(payload).then((result) => {
        if (result && !result.ok && result.error) {
          window.dispatchEvent(
            new CustomEvent('os:toast', {
              detail: { message: t('shortcut.toast.startupHelper', { error: result.error }), kind: 'muted' },
            }),
          );
        }
      });
    });
  } catch {
    /* Non-Electron harness */
  }
}

/** Mark helper install state so the next persist syncs (or skips) correctly. */
export function setOsHotkeyInstalledCache(installed: boolean): void {
  osHotkeyInstalledCache = installed;
  if (!installed) lastSyncedOsHotkeyPayload = null;
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  syncToolboxGlobalShortcut();
  syncAppToggleGlobalShortcut();
  syncAppRestartGlobalShortcut();
  syncCaptionsGlobalShortcuts();
  syncOsHotkeyHelperFromShortcuts();
}

export function onShortcutsChanged(cb: () => void): () => void {
  const h = (): void => cb();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// Initial registration once the module (and the preload bridge) are up.
if (typeof window !== 'undefined') {
  window.setTimeout(() => {
    syncToolboxGlobalShortcut();
    syncAppToggleGlobalShortcut();
    syncAppRestartGlobalShortcut();
    syncCaptionsGlobalShortcuts();
    syncOsHotkeyHelperFromShortcuts(true);
  }, 0);
}

// ---------------------------------------------------------------------------
// Chord helpers. Canonical form: "Ctrl+Alt+Shift+Meta+Key" (modifiers in that
// order). Alternatives: "Space|Enter". Mouse: "Ctrl+MouseRight".
// ---------------------------------------------------------------------------

function mouseLabel(button: number): string | null {
  if (button >= 0 && button <= 4) return MOUSE_NAMES[button];
  return null;
}

function isModifierOnlyKey(k: string): boolean {
  return k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta';
}

function buildChord(mods: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }, label: string): string {
  const parts: string[] = [];
  if (mods.ctrl) parts.push('Ctrl');
  if (mods.alt) parts.push('Alt');
  if (mods.shift) parts.push('Shift');
  if (mods.meta) parts.push('Meta');
  parts.push(label);
  return parts.join('+');
}

/**
 * A keystroke that belongs to an input method mid-composition: Japanese or
 * Chinese IME conversion (`isComposing`, Chromium's keyCode 229, key
 * "Process"). Those keys are the IME's, and a shortcut firing on them eats a
 * learner's typing — "k" of "kanji" opening a panel.
 */
export function isImeCompositionEvent(e: Pick<KeyboardEvent, 'isComposing' | 'keyCode' | 'key'>): boolean {
  return e.isComposing === true || e.keyCode === 229 || e.key === 'Process';
}

/**
 * The key a shortcut is bound to, independent of the keyboard layout: under a
 * Russian (or any non-Latin) layout Ctrl+P arrives as `key` "з", which no chord
 * names, so letters and digits fall back to the physical key (`code` "KeyP").
 */
function layoutIndependentKey(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const k = e.key;
  const nonLatinChar = k.length === 1 && !/^[\x20-\x7e]$/.test(k);
  if (!nonLatinChar && k !== 'Dead' && k !== 'Unidentified') return k;
  const letter = /^Key([A-Z])$/.exec(e.code ?? '');
  if (letter) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(e.code ?? '');
  if (digit) return digit[1];
  return k;
}

/** Chord from a keyboard event, or null if modifier-only or part of an IME composition. */
export function chordFromEvent(e: KeyboardEvent): string | null {
  if (isImeCompositionEvent(e)) return null;
  const k = layoutIndependentKey(e);
  if (isModifierOnlyKey(k)) return null;
  const label = k.length === 1 ? (k === ' ' ? 'Space' : k.toUpperCase()) : k;
  // For printable symbols Shift already changed the character (e.g. "+"), so
  // only record Shift for letters/space/named keys — Ctrl+Shift+H ≠ Ctrl+H.
  const shift = e.shiftKey && (k.length !== 1 || /[a-zA-Z ]/.test(k));
  return buildChord({ ctrl: e.ctrlKey, alt: e.altKey, shift, meta: e.metaKey }, label);
}

/** Chord from a mouse button event (includes modifiers). */
export function chordFromMouseEvent(e: MouseEvent): string | null {
  const label = mouseLabel(e.button);
  if (!label) return null;
  // Bare left-click is never a global shortcut (would hijack the whole UI).
  if (label === 'MouseLeft' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return null;
  return buildChord(
    { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
    label,
  );
}

/** Normalize one alternative (no `|`). */
function normalizeOne(c: string): string {
  const bits = c.split('+').map((s) => s.trim()).filter(Boolean);
  let ctrl = false;
  let alt = false;
  let shift = false;
  let meta = false;
  let key = '';
  for (const b of bits) {
    const l = b.toLowerCase();
    if (l === 'ctrl' || l === 'control') ctrl = true;
    else if (l === 'alt') alt = true;
    else if (l === 'shift') shift = true;
    else if (l === 'meta' || l === 'win' || l === 'cmd' || l === 'super' || l === 'command') meta = true;
    else if (l === 'mouseleft' || l === 'mouse0' || l === 'lmb') key = 'MouseLeft';
    else if (l === 'mousemiddle' || l === 'mouse1' || l === 'mmb') key = 'MouseMiddle';
    else if (l === 'mouseright' || l === 'mouse2' || l === 'rmb') key = 'MouseRight';
    else if (l === 'mouse4' || l === 'x1' || l === 'browserback') key = 'Mouse4';
    else if (l === 'mouse5' || l === 'x2' || l === 'browserforward') key = 'Mouse5';
    else if (l === 'space' || b === ' ') key = 'Space';
    else key = b.length === 1 ? b.toUpperCase() : b;
  }
  if (!key) return '';
  return buildChord({ ctrl, alt, shift, meta }, key);
}

/** Normalize full chord string (supports `|` alternatives). */
export function normalizeChord(c: string): string {
  if (!c.trim()) return '';
  return c
    .split('|')
    .map((part) => normalizeOne(part))
    .filter(Boolean)
    .join('|');
}

/** Split effective binding into individual chords. */
export function splitChords(keys: string): string[] {
  if (!keys) return [];
  return keys
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pretty display: "Ctrl+Shift+H · Space". */
export function formatKeysDisplay(keys: string): string {
  return splitChords(keys).join(' · ') || '';
}

function allCommands(): AppCommand[] {
  const customs: AppCommand[] = store.customCommands.map((c) => ({
    id: c.id,
    label: c.label,
    category: 'Custom' as const,
    defaultKeys: c.defaultKeys,
    custom: true,
    note: describeCustomAction(c.action),
  }));
  return [...COMMAND_CATALOG, ...customs];
}

/** Module-level `t` resolves against the live language on every call (see resumeToast). */
function translatedOr(key: string, fallback: string): string {
  const out = t(key);
  return out === key ? fallback : out;
}

function builtinLabel(id: string): string | undefined {
  const cmd = COMMAND_CATALOG.find((c) => c.id === id);
  if (!cmd) return undefined;
  const legacy = t(`commands.${id}`);
  return legacy !== `commands.${id}` ? legacy : translatedOr(`cmd.${id}`, cmd.label);
}

function describeCustomAction(action: CustomAction): string {
  if (action.type === 'openApp') {
    const app = SHORTCUT_OPEN_APPS.find((a) => a.id === action.appId);
    const name = translatedOr(`palette.section.${action.appId}`, app?.label ?? action.appId);
    return t('shortcut.custom.opens', { name });
  }
  if (action.type === 'runCommand') {
    return t('shortcut.custom.runs', { name: builtinLabel(action.commandId) ?? action.commandId });
  }
  if (action.type === 'runCommands') {
    const labels = action.commandIds.map((id) => {
      const custom = store.customCommands.find((x) => x.id === id);
      return builtinLabel(id) ?? custom?.label ?? id;
    });
    return t('shortcut.custom.stack', { names: labels.join(' → ') });
  }
  return action.detail
    ? t('shortcut.custom.dispatchesDetail', { event: action.event, detail: action.detail })
    : t('shortcut.custom.dispatches', { event: action.event });
}

/**
 * Effective chord string for a command under the active profile ('' = unbound).
 *
 * **Normalized on the way out.** `chordMatches` compares this to the output of
 * `chordFromEvent` with `===`, and that output is always in normal form — single keys
 * upper-cased, modifiers in Ctrl+Alt+Shift+Meta order. A hand-written `defaultKeys`
 * literal in any other form therefore matched *nothing*, with no error and no warning:
 * Settings listed the row, the row looked bound, and the key did nothing. Slice 19
 * measured **8 of 101** catalog defaults in that state — six lowercase `video.*` letters
 * and both virtual-desktop chords, which spelled their modifiers `Meta+Ctrl+…`.
 *
 * Normalizing here rather than at the call sites keeps one answer to "what is this bound
 * to?" for dispatch, for the conflict list and for what the user is shown.
 */
export function effectiveKeys(id: string): string {
  const ov = store.profiles[store.active]?.[id];
  if (ov === null) return '';
  if (typeof ov === 'string') return normalizeChord(ov);
  const fromCustom = store.customCommands.find((c) => c.id === id);
  if (fromCustom) return normalizeChord(fromCustom.defaultKeys);
  return normalizeChord(COMMAND_CATALOG.find((c) => c.id === id)?.defaultKeys ?? '');
}

/** True if chord matches any alternative in the effective binding. */
export function chordMatches(id: string, chord: string): boolean {
  const keys = effectiveKeys(id);
  if (!keys || !chord) return false;
  return splitChords(keys).some((k) => k === chord);
}

export interface BindingRow extends AppCommand {
  keys: string;
  isDefault: boolean;
  conflictsWith: string[];
}

export function getBindings(): BindingRow[] {
  const cmds = allCommands();
  const byChord = new Map<string, string[]>();
  for (const c of cmds) {
    for (const k of splitChords(effectiveKeys(c.id))) {
      byChord.set(k, [...(byChord.get(k) ?? []), c.id]);
    }
  }
  return cmds.map((c) => {
    const keys = effectiveKeys(c.id);
    const alts = splitChords(keys);
    const sharing = new Set<string>();
    for (const k of alts) {
      for (const id of byChord.get(k) ?? []) {
        if (id !== c.id) sharing.add(id);
      }
    }
    return {
      ...c,
      keys,
      isDefault: keys === c.defaultKeys,
      conflictsWith: [...sharing],
    };
  });
}

/**
 * Set/override a binding. Pass '' to unbind.
 * `mode: 'replace'` (default) sets the full binding to one chord.
 * `mode: 'add'` appends a chord as an alternative (`|`).
 */
export function setBinding(id: string, chord: string, mode: 'replace' | 'add' = 'replace'): string[] {
  const def = allCommands().find((c) => c.id === id)?.defaultKeys ?? '';
  const prof = store.profiles[store.active] ?? (store.profiles[store.active] = {});

  let next = '';
  if (!chord.trim()) {
    next = '';
  } else if (mode === 'add') {
    // Add mode always appends a single alternative.
    const one = normalizeOne(chord.includes('|') ? chord.split('|')[0] : chord);
    if (!one) return [];
    const cur = effectiveKeys(id);
    const parts = new Set(splitChords(cur));
    parts.add(one);
    next = [...parts].join('|');
  } else {
    // Replace accepts full multi-chord strings (Space|Enter).
    next = normalizeChord(chord);
  }

  if (next === def) delete prof[id];
  else prof[id] = next === '' ? null : next;
  persist();
  if (!next) return [];
  const conflicts: string[] = [];
  for (const k of splitChords(next)) {
    for (const c of allCommands()) {
      if (c.id !== id && chordMatches(c.id, k)) conflicts.push(c.id);
    }
  }
  return [...new Set(conflicts)];
}

export function resetBinding(id: string): void {
  const prof = store.profiles[store.active];
  if (prof) {
    delete prof[id];
    persist();
  }
}

export function resetAllBindings(): void {
  store.profiles[store.active] = {};
  store.defaultsVersion = DEFAULTS_VERSION;
  persist();
}

// ----- custom commands -----
export function listCustomCommands(): CustomCommandDef[] {
  return [...store.customCommands];
}

export function addCustomCommand(input: {
  label: string;
  keys?: string;
  action: CustomAction;
}): { ok: true; id: string } | { ok: false; error: string } {
  const label = input.label.trim();
  if (!label) return { ok: false, error: 'Name is required.' };
  if (!input.action) return { ok: false, error: 'Pick an action.' };
  const id = `custom.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const defaultKeys = input.keys ? normalizeChord(input.keys) : '';
  store.customCommands = [
    ...store.customCommands,
    { id, label, defaultKeys, action: input.action },
  ];
  persist();
  return { ok: true, id };
}

export function updateCustomCommand(
  id: string,
  patch: Partial<Pick<CustomCommandDef, 'label' | 'defaultKeys' | 'action'>>,
): { ok: boolean; error?: string } {
  const i = store.customCommands.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, error: 'Custom shortcut not found.' };
  const prev = store.customCommands[i];
  const next: CustomCommandDef = {
    ...prev,
    label: typeof patch.label === 'string' ? patch.label.trim() || prev.label : prev.label,
    defaultKeys:
      typeof patch.defaultKeys === 'string' ? normalizeChord(patch.defaultKeys) : prev.defaultKeys,
    action: patch.action ?? prev.action,
  };
  store.customCommands = store.customCommands.map((c, idx) => (idx === i ? next : c));
  // If default keys changed and profile had no override, fine; if user had reset to default, keep.
  persist();
  return { ok: true };
}

export function removeCustomCommand(id: string): void {
  store.customCommands = store.customCommands.filter((c) => c.id !== id);
  for (const prof of Object.values(store.profiles)) {
    delete prof[id];
  }
  persist();
}

// ----- profiles -----
export function listShortcutProfiles(): { active: string; names: string[] } {
  return { active: store.active, names: Object.keys(store.profiles) };
}

export function switchShortcutProfile(name: string): void {
  if (!store.profiles[name]) return;
  store.active = name;
  persist();
}

export function addShortcutProfile(name: string): void {
  const n = name.trim();
  if (!n || store.profiles[n]) return;
  store.profiles[n] = { ...(store.profiles[store.active] ?? {}) };
  store.active = n;
  persist();
}

export function deleteShortcutProfile(name: string): void {
  if (name === DEFAULT_PROFILE || !store.profiles[name]) return;
  delete store.profiles[name];
  if (store.active === name) store.active = DEFAULT_PROFILE;
  persist();
}

// ----- import / export -----
export function exportShortcuts(): string {
  return JSON.stringify(store, null, 2);
}

export function importShortcuts(json: string): { ok: boolean; error?: string } {
  try {
    const p = JSON.parse(json) as Partial<ShortcutStore>;
    if (!p || typeof p !== 'object' || !p.profiles || typeof p.profiles !== 'object') {
      return { ok: false, error: 'Not a shortcuts export.' };
    }
    const profiles: Record<string, Overrides> = {};
    for (const [name, ov] of Object.entries(p.profiles)) {
      if (!ov || typeof ov !== 'object') continue;
      const clean: Overrides = {};
      for (const [id, v] of Object.entries(ov as Record<string, unknown>)) {
        if (v === null) clean[id] = null;
        else if (typeof v === 'string') clean[id] = normalizeChord(v);
      }
      profiles[name] = clean;
    }
    if (!profiles[DEFAULT_PROFILE]) profiles[DEFAULT_PROFILE] = {};
    const active = typeof p.active === 'string' && profiles[p.active] ? p.active : DEFAULT_PROFILE;
    const customCommands = Array.isArray(p.customCommands)
      ? (p.customCommands as CustomCommandDef[]).filter(
          (c) => c && typeof c.id === 'string' && typeof c.label === 'string' && c.action,
        )
      : store.customCommands;
    // An export from before a defaults move carries the old chords as they were then.
    migrateMovedDefaults(profiles, typeof p.defaultsVersion === 'number' ? p.defaultsVersion : 1);
    store = { active, profiles, customCommands, defaultsVersion: DEFAULTS_VERSION };
    persist();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON.' };
  }
}

// ---------------------------------------------------------------------------
// Handlers. Views push onto a per-command stack while mounted; the newest
// registration wins (the topmost view owns the shortcut).
// ---------------------------------------------------------------------------
type Handler = (e: Event) => boolean | void;

/**
 * Where a view-local handler is allowed to hear its keys.
 *
 * - an element, or a getter returning one (a React ref's `.current`) — the view's own root;
 * - a string — every element carrying `data-command-scope="<string>"`.
 *
 * A scoped handler only runs when the keyboard is on that surface, which means either
 *
 * 1. focus is inside the surface's window (the enclosing desktop `.fwin`, or the element
 *    itself when it is not in a desktop window — a pop-out or a full-screen reader), or
 * 2. nothing is focused (`document.activeElement` is `<body>`, which is where a click on
 *    plain text leaves it) and the surface's desktop window is the focused one.
 *
 * Mouse chords use the event target instead of focus. The palette's `runCommand` ignores
 * scopes: choosing a command there is an explicit request, not a stray key.
 */
export type CommandScope = Element | null | undefined | string | (() => Element | null | undefined);

export interface CommandHandlerOptions {
  scope?: CommandScope;
}

interface HandlerEntry {
  fn: Handler;
  scope?: CommandScope;
}

const handlers = new Map<string, HandlerEntry[]>();

export function registerCommandHandler(id: string, fn: Handler, opts?: CommandHandlerOptions): () => void {
  const entry: HandlerEntry = { fn, scope: opts?.scope };
  const list = handlers.get(id) ?? [];
  list.push(entry);
  handlers.set(id, list);
  return () => {
    const cur = handlers.get(id);
    if (!cur) return;
    const i = cur.indexOf(entry);
    if (i >= 0) cur.splice(i, 1);
  };
}

function scopeElements(scope: CommandScope): Element[] {
  if (typeof scope === 'string') {
    return [...document.querySelectorAll('[data-command-scope]')].filter(
      (el) => el.getAttribute('data-command-scope') === scope,
    );
  }
  const el = typeof scope === 'function' ? scope() : scope;
  return el ? [el] : [];
}

/** The region that counts as "this surface": its desktop window, or itself outside one. */
function surfaceRegion(el: Element): Element {
  return el.closest('.fwin') ?? el;
}

/** True when a handler registered with `scope` may hear this keypress / click. */
export function scopeHasKeyboard(scope: CommandScope, mouseTarget?: EventTarget | null): boolean {
  const els = scopeElements(scope).filter((el) => el.isConnected);
  if (!els.length) return false;
  if (mouseTarget instanceof Node) return els.some((el) => surfaceRegion(el).contains(mouseTarget));
  const active = document.activeElement;
  if (active && active !== document.body && active !== document.documentElement) {
    return els.some((el) => surfaceRegion(el).contains(active));
  }
  return els.some((el) => {
    const win = el.closest('.fwin');
    return win ? win.classList.contains('focused') : true;
  });
}

/** Topmost handler that may run for this event (scoped ones only on their own surface). */
function eligibleHandler(id: string, e: Event | null, fromMouse = false): Handler | null {
  const stack = handlers.get(id);
  if (!stack || !stack.length) return null;
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const entry = stack[i];
    if (!entry) continue;
    if (entry.scope === undefined || e === null) return entry.fn;
    if (scopeHasKeyboard(entry.scope, fromMouse ? e.target : undefined)) return entry.fn;
  }
  return null;
}

function openApp(appId: string): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: appId }));
}

function resumeToast(key: string): void {
  // Module-level `t` (not the hook) resolves against the live language on every call, so
  // this stays correct after a language switch without the command registry re-running —
  // same reason GlobalDictionaryOverlay uses it.
  window.dispatchEvent(new CustomEvent('os:toast', {
    detail: { message: t(key), kind: 'muted' },
  }));
}

/**
 * `video.resumeLast` — Phase 6 slices 11 and 14.
 *
 * Three ways this can decline, and slice 14 exists because two of them used to share one
 * sentence. `video.resumeLast` is a *built-in*, so it is offered in every shell that mounts
 * `CommandPalette` — and only some of those mount `MediaWorkspaceHost`:
 *
 *   App.tsx  reader (NovelReader / MangaReader)   palette YES   host NO
 *   App.tsx  pop-out (music, settings, games, …)  palette YES   host only for `video`
 *   App.tsx  desktop                              palette YES   host YES
 *
 * In the first two the old code found no `.seanime-host-launcher` in the DOM and reported
 * *"The media server is off"* — measured false with the sidecar at `ready`, and false by
 * default since the slice-12 flip. A missing host is a fact about the **window**; whether
 * the sidecar is disabled is a fact about the **machine**, and only main can answer it.
 *
 * The await is affordable here and nowhere near a render tick: this runs on Enter, once.
 * `App` registers its own handler for this id while a book is open, so the reader never
 * reaches the `no-host` branch — it closes the reader and comes back through this.
 */
export function reportMediaWorkspaceUnavailable(): void {
  // Exported for `App`'s reader handoff, which has to decline BEFORE it closes the book
  // and so cannot reach this through the built-in. Borrowing the sentence keeps one
  // situation described one way.
  resumeToast('mediaWorkspace.resumeLast.unavailable');
}

async function resumeLastEpisode(): Promise<void> {
  // The host-then-sidecar sequence moved to `reachMediaWorkspace` when slice 19 gave it a
  // second caller. The wording stays here: only this command knows the user asked to
  // *resume* rather than to open something specific.
  const reach = await reachMediaWorkspace();
  if (reach === 'no-host') {
    resumeToast('mediaWorkspace.resumeLast.noWorkspaceHere');
    return;
  }
  if (reach === 'unavailable') {
    resumeToast('mediaWorkspace.resumeLast.unavailable');
    return;
  }
  // `no-host` cannot come back here — checked above, and nothing unmounts a host across
  // one await — so the only remaining decline is an empty resume store.
  if (resumeMostRecentWatched() !== 'opened') {
    resumeToast('mediaWorkspace.resumeLast.nothing');
  }
}

function dispatchToolboxCommand(id: string): boolean {
  const command = TOOLBOX_SHORTCUT_COMMANDS.find((item) => item.id === id);
  if (!command) return false;
  if (id === 'toolbox.open') {
    // Match setBlancModeEnabled: only reuse remembered bounds when enabled.
    void window.api.blancOpen(
      loadToolboxSettings().rememberWindowBounds ? undefined : { width: 560, height: 460 },
    );
    return true;
  }
  if (command.scope === 'active-tool') return false;
  const inBlanc = Boolean(document.querySelector('.blanc-root'));
  if (command.scope === 'toolbox' && !inBlanc) return false;
  if (id === 'toolbox.commandPalette') {
    window.dispatchEvent(new CustomEvent('palette:open', { detail: 'toolbox' }));
    return true;
  }
  if (id === 'toolbox.openSettings') {
    window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: 'settings' }));
    return true;
  }
  if (command.feature !== 'toolbox' && id.startsWith('toolbox.open')) {
    window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: command.feature }));
    return true;
  }
  window.dispatchEvent(new CustomEvent('toolbox:command', { detail: id }));
  return true;
}

/** Guard against custom stacks that re-enter themselves. */
let runDepth = 0;
const MAX_RUN_DEPTH = 12;

function runCustomAction(action: CustomAction, e: Event): boolean {
  if (action.type === 'openApp') {
    openApp(action.appId);
    return true;
  }
  if (action.type === 'runCommand') {
    return runCommand(action.commandId);
  }
  if (action.type === 'runCommands') {
    let any = false;
    for (const id of action.commandIds) {
      if (!id) continue;
      if (runCommand(id)) any = true;
    }
    return any;
  }
  if (action.type === 'dispatch') {
    window.dispatchEvent(new CustomEvent(action.event, { detail: action.detail }));
    return true;
  }
  void e;
  return false;
}

// Built-in handlers (always available; views never register these).
function builtinHandler(id: string): Handler | null {
  switch (id) {
    case 'nav.palette':
      return () => void window.dispatchEvent(new CustomEvent('palette:open', { detail: 'commands' }));
    case 'nav.search':
      return () => void window.dispatchEvent(new CustomEvent('palette:open', { detail: 'search' }));
    case 'video.resumeLast':
      return () => void resumeLastEpisode();
    case 'nav.settings':
      return () => void openApp('settings');
    case 'nav.home':
      return () => void window.dispatchEvent(new CustomEvent('os:home'));
    case 'nav.closeWindow':
      return () => void window.dispatchEvent(new CustomEvent('os:close-window'));
    case 'nav.nextWindow':
      return () => void window.dispatchEvent(new CustomEvent('os:cycle-window', { detail: 1 }));
    case 'nav.prevWindow':
      return () => void window.dispatchEvent(new CustomEvent('os:cycle-window', { detail: -1 }));
    case 'nav.nextAppFullscreen':
      return () => void window.dispatchEvent(new CustomEvent('os:cycle-app-fullscreen', { detail: 1 }));
    case 'nav.nextDesktop':
      return () => void window.dispatchEvent(new CustomEvent('os:switch-desktop', { detail: 1 }));
    case 'nav.prevDesktop':
      return () => void window.dispatchEvent(new CustomEvent('os:switch-desktop', { detail: -1 }));
    // Window geometry — DesktopShell owns the window model, so these are all
    // one event with an action tag rather than fifteen bespoke events.
    case 'window.maximize':
    case 'window.minimize':
    case 'window.snapLeft':
    case 'window.snapRight':
    case 'window.center':
    case 'window.togglePresentation':
    case 'window.tileAll':
    case 'window.cascade':
    case 'window.showDesktop':
    case 'window.restoreAll':
    case 'window.pinTop':
    case 'window.closeAll':
    case 'window.closeOthers':
      return () =>
        void window.dispatchEvent(
          new CustomEvent('os:window', { detail: id.slice('window.'.length) }),
        );
    // Multi-monitor. Same one-event pattern: DesktopShell owns the window
    // model and the display it is on, so it does the work.
    case 'window.moveToNextMonitor':
      return () => void window.dispatchEvent(new CustomEvent('os:move-to-monitor', { detail: 1 }));
    case 'window.moveToPrevMonitor':
      return () => void window.dispatchEvent(new CustomEvent('os:move-to-monitor', { detail: -1 }));
    case 'window.focusNextMonitor':
      return () => void window.dispatchEvent(new CustomEvent('os:focus-monitor', { detail: 1 }));
    case 'window.zoomIn':
      return () => void bumpZoom(ZOOM_STEP);
    case 'window.zoomOut':
      return () => void bumpZoom(-ZOOM_STEP);
    case 'window.zoomReset':
      return () => void setZoom(ZOOM_DEFAULT);
    case 'nav.undo':
      return () => {
        if (!canUndo()) {
          window.dispatchEvent(
            new CustomEvent('os:toast', { detail: { message: t('shortcut.undo.nothing'), kind: 'muted' } }),
          );
          return;
        }
        const label = peekUndo()?.label;
        void performUndo().then((done) => {
          const what = done || label;
          window.dispatchEvent(
            new CustomEvent('os:toast', {
              detail: {
                message: what ? t('shortcut.undo.done', { action: what }) : t('shortcut.undo.doneGeneric'),
                kind: 'ok',
              },
            }),
          );
        });
      };
    case 'nav.widgets':
      return () => void window.dispatchEvent(new CustomEvent('os:widgets'));
    case 'nav.open.dictionary':
      return () => void openApp('dictionary');
    case 'nav.open.library':
      return () => void openApp('library');
    case 'nav.open.novels':
      return () => void openApp('novels');
    case 'nav.open.reading':
      return () => void openApp('reading');
    case 'nav.open.flashcards':
      return () => void openApp('flashcards');
    case 'nav.open.grammar':
      return () => void openApp('grammar');
    case 'nav.open.translate':
      return () => void openApp('translate');
    case 'nav.open.music':
      return () => void openApp('music');
    case 'nav.open.player':
      return () => void openApp('player');
    case 'nav.open.video':
      return () => void openApp('video');
    case 'nav.open.youtube':
      return () => void openApp('youtube');
    case 'nav.open.immersion':
      return () => void openApp('immersion');
    case 'nav.open.anki':
      return () => void openApp('anki');
    case 'nav.open.stats':
      return () => void openApp('stats');
    case 'nav.open.calendar':
      return () => void openApp('calendar');
    case 'nav.open.resources':
      return () => void openApp('resources');
    case 'nav.open.games':
      return () => void openApp('games');
    case 'nav.open.city':
      return () => void openApp('city');
    case 'reader.toggleWordHighlight':
      return () => void toggleWordHighlight();
    case 'clipboard.open':
      return () => void window.dispatchEvent(new CustomEvent('clipboard:open'));
    case 'app.toggle':
      return () => {
        void window.api?.appToggle?.();
      };
    case 'app.restart':
      return () => {
        void window.api?.relaunchApp?.();
      };
    case 'calendar.open':
      return () => void openApp('calendar');
    case 'music.playPause':
      return () => void musicToggle();
    case 'music.next':
      return () => void musicNext();
    case 'music.prev':
      return () => void musicPrev();
    case 'music.volumeUp':
      return () => void setVolume(Math.min(1, getState().volume + 0.05));
    case 'music.volumeDown':
      return () => void setVolume(Math.max(0, getState().volume - 0.05));
    default: {
      if (id.startsWith('toolbox.') || id.startsWith('focusTimer.') || id.startsWith('quickNotes.') || id.startsWith('clipboard.') || id.startsWith('readingFinder.') || id.startsWith('automation.')) {
        const command = TOOLBOX_SHORTCUT_COMMANDS.find((item) => item.id === id);
        if (command) return () => dispatchToolboxCommand(id);
      }
      const custom = store.customCommands.find((c) => c.id === id);
      if (custom) return (e) => runCustomAction(custom.action, e);
      return null;
    }
  }
}

/** Run a command by id (used by the command palette). Returns true if handled. */
export function runCommand(id: string): boolean {
  if (runDepth >= MAX_RUN_DEPTH) return false;
  runDepth++;
  try {
    const fn = eligibleHandler(id, null) ?? builtinHandler(id);
    if (!fn) return false;
    return fn(new KeyboardEvent('keydown')) !== false;
  } finally {
    runDepth--;
  }
}

/** True when a command currently has something that would respond to it. */
export function commandIsLive(id: string): boolean {
  const stack = handlers.get(id);
  if (stack != null && stack.length > 0) return true;
  if (builtinHandler(id) != null) return true;
  return store.customCommands.some((c) => c.id === id);
}

function isTypingTarget(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable;
}

function isInteractiveMouseTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(
    t.closest(
      'button, a, input, textarea, select, [contenteditable="true"], [role="button"], .os-icon, .os-taskbar, .os-start',
    ),
  );
}

function isLockscreenActive(): boolean {
  return Boolean(document.querySelector('.lockscreen[role="dialog"]'));
}

const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
const CLIPBOARD_AND_HISTORY_LETTERS = new Set(['A', 'C', 'V', 'X', 'Z', 'Y']);
const RICH_TEXT_LETTERS = new Set(['B', 'I', 'U']);

/**
 * True when a chord already means something to a text field, so it must not be taken
 * away from one: caret and selection moves (Ctrl/Shift + arrows, Home, End, Shift+Page),
 * word deletion (Ctrl+Backspace / Delete), the clipboard and history (Ctrl+A/C/V/X/Z/Y,
 * Ctrl+Shift+Z / V, Ctrl/Shift+Insert, Shift+Delete) and, in rich text, Ctrl+B/I/U.
 * Anything with Alt or Meta is not an editing chord in Chromium.
 */
export function isEditingChord(chord: string, richText = false): boolean {
  const parts = chord.split('+');
  const key = parts[parts.length - 1] ?? '';
  const mods = new Set(parts.slice(0, -1));
  if (mods.has('Alt') || mods.has('Meta')) return false;
  const ctrl = mods.has('Ctrl');
  const shift = mods.has('Shift');
  if (CARET_KEYS.has(key)) return true;
  if (key === 'PageUp' || key === 'PageDown') return !ctrl;
  if (key === 'Backspace' || key === 'Delete') return ctrl || shift;
  if (key === 'Insert') return ctrl !== shift;
  // With Shift only Redo (Z) and paste-as-plain-text (V) edit; Ctrl+Shift+C and the rest are free.
  if (ctrl && CLIPBOARD_AND_HISTORY_LETTERS.has(key)) return !shift || key === 'Z' || key === 'V';
  if (ctrl && !shift && richText && RICH_TEXT_LETTERS.has(key)) return true;
  return false;
}

/**
 * Controls whose own activation key is Space or Enter. A bare Space/Enter pressed on one
 * must press THAT control — a grade button, a link, a disclosure — not whatever command the
 * key is bound to globally (flashcards.flip is Space|Enter).
 */
const NATIVE_ACTIVATION_SELECTOR = [
  'button',
  'a[href]',
  'summary',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="option"]',
].join(', ');

function focusedControlOwnsKey(chord: string): boolean {
  if (chord !== 'Space' && chord !== 'Enter') return false;
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return false;
  return el.matches(NATIVE_ACTIVATION_SELECTOR);
}

function dispatchChord(chord: string, e: Event, opts?: { fromMouse?: boolean }): boolean {
  const fromMouse = Boolean(opts?.fromMouse);
  // While the lockscreen is up, plain keys belong to PIN entry — not global shortcuts.
  if (!fromMouse && isLockscreenActive()) {
    const ke = e as KeyboardEvent;
    if (!ke.ctrlKey && !ke.altKey && !ke.metaKey) return false;
  }
  // A focused button / link / disclosure keeps its own Space and Enter.
  if (!fromMouse && focusedControlOwnsKey(chord)) return false;
  // While typing, only keyboard chords that carry Ctrl/Alt/Meta may fire — and of those,
  // not the ones that already edit text, unless the command says it works while typing.
  const typing = !fromMouse && isTypingTarget();
  if (typing) {
    const ke = e as KeyboardEvent;
    if (!ke.ctrlKey && !ke.altKey && !ke.metaKey) return false;
  }
  const editing = typing && isEditingChord(chord, (document.activeElement as HTMLElement | null)?.isContentEditable === true);
  for (const c of allCommands()) {
    if (!chordMatches(c.id, chord)) continue;
    if (editing && !c.worksWhileTyping) continue;
    const fn = eligibleHandler(c.id, e, fromMouse) ?? builtinHandler(c.id);
    if (!fn) continue; // dead binding (view not mounted, or not the focused surface) — try the next match
    if (fn(e) !== false) {
      e.preventDefault();
      if (opts?.fromMouse) e.stopPropagation();
      return true;
    }
  }
  return false;
}

/**
 * Install global keydown + mousedown listeners. Call once from main.tsx.
 * Capture-mode in ShortcutSettings uses stopPropagation so it wins first.
 */
export function installKeyboardShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const chord = chordFromEvent(e);
    if (!chord) return;
    dispatchChord(chord, e);
  };

  const onMouse = (e: MouseEvent) => {
    // Skip pure UI chrome clicks unless they carry modifiers / non-left button.
    const chord = chordFromMouseEvent(e);
    if (!chord) return;
    if (e.button === 0 && isInteractiveMouseTarget(e.target) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      return;
    }
    dispatchChord(chord, e, { fromMouse: true });
  };

  window.addEventListener('keydown', onKey);
  // mousedown alone — auxclick would double-fire the same button after mouseup.
  window.addEventListener('mousedown', onMouse, true);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('mousedown', onMouse, true);
  };
}
