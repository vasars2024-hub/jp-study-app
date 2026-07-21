import { TOOLBOX_MODULES, type ToolboxModuleId } from './toolboxRegistry';

export type ToolboxShortcutCategory =
  | 'Toolbox'
  | 'Quick Tools'
  | 'Productivity'
  | 'System'
  | 'Language'
  | 'Active Tool';

export type ToolboxShortcutScope =
  | 'global-app'
  | 'toolbox'
  | 'active-tool'
  | 'modal-dialog'
  | 'text-editor';

export interface ToolboxShortcutCommand {
  id: string;
  name: string;
  description: string;
  category: ToolboxShortcutCategory;
  feature: ToolboxModuleId | 'toolbox';
  defaultShortcut: string;
  scope: ToolboxShortcutScope;
  global: boolean;
  worksWhileTyping: boolean;
  editable: boolean;
  platformAlternatives?: Partial<Record<'win32' | 'darwin' | 'linux', string>>;
}

export interface ToolboxShortcutConflict {
  shortcut: string;
  scope: ToolboxShortcutScope;
  commandIds: string[];
}

export interface ToolboxShortcutValidation {
  ok: boolean;
  duplicateCommandIds: string[];
  conflicts: ToolboxShortcutConflict[];
  missingReadyFeatureCommands: ToolboxModuleId[];
  documentedMissingCommands: string[];
  undocumentedCommands: string[];
}

export interface ToolboxShortcutExport {
  version: 1;
  generatedAt: string;
  mappings: Record<string, string>;
}

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const DANGEROUS_SHORTCUTS = new Set(['Alt+F4', 'Ctrl+Alt+Delete', 'Meta+L', 'Meta+D']);
const SHORTCUT_ID_MIGRATIONS: Record<string, string> = {
  'toolbox.openStats': 'toolbox.openStatistics',
  'toolbox.openEpubMiner': 'toolbox.openEpubMining',
  'toolbox.openAnki': 'toolbox.openAnkiDeck',
  'toolbox.openBlocks': 'toolbox.openMonoBlocks',
  'toolbox.openNotes': 'toolbox.openQuickNotes',
  'toolbox.openSearch': 'toolbox.openFileSearch',
  'toolbox.openAutomation': 'toolbox.openAutomationBuilder',
};

export const TOOLBOX_SHORTCUT_COMMANDS: ToolboxShortcutCommand[] = [
  {
    id: 'toolbox.open',
    name: 'Open Toolbox',
    description: 'Open the compact Blanc Toolbox beside the main Study OS.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+Alt+B',
    scope: 'global-app',
    global: true,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.search',
    name: 'Search Toolbox',
    description: 'Focus the Toolbox search field.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+F',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.commandPalette',
    name: 'Open Toolbox Commands',
    description: 'Open the command palette filtered to Toolbox commands.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+Shift+P',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.focusSidebar',
    name: 'Focus Tool Launcher',
    description: 'Move keyboard focus to the Toolbox launcher sidebar.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+L',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openRecent',
    name: 'Focus Recent Tools',
    description: 'Move focus to the recent tools strip.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+R',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openFavorites',
    name: 'Focus Favorite Tools',
    description: 'Move focus to the favorite tools strip.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+Alt+Shift+F',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.nextTool',
    name: 'Next Open Tool',
    description: 'Switch to the next open Toolbox tab.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+PageDown',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.previousTool',
    name: 'Previous Open Tool',
    description: 'Switch to the previous open Toolbox tab.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+PageUp',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.closeActiveTool',
    name: 'Close Active Tool Tab',
    description: 'Close the current Toolbox tab.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+Alt+W',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.reopenLastTool',
    name: 'Reopen Last Tool',
    description: 'Reopen the last selected Toolbox tool.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+Shift+T',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.toggleCompactMode',
    name: 'Toggle Compact Launcher',
    description: 'Collapse or expand the Toolbox launcher.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+B',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openSettings',
    name: 'Open Toolbox Settings',
    description: 'Open the Blanc Settings tab.',
    category: 'Toolbox',
    feature: 'toolbox',
    defaultShortcut: 'Ctrl+Alt+,',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openCalculator',
    name: 'Open Calculator',
    description: 'Open the Toolbox calculator.',
    category: 'Quick Tools',
    feature: 'calculator',
    defaultShortcut: 'Alt+1',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openUnitConverter',
    name: 'Open Unit Converter',
    description: 'Open static offline unit conversion.',
    category: 'Quick Tools',
    feature: 'unit-converter',
    defaultShortcut: 'Alt+2',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openHashChecker',
    name: 'Open Hash Checker',
    description: 'Open the file hash checker.',
    category: 'Quick Tools',
    feature: 'hash-checker',
    defaultShortcut: 'Alt+3',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openImageConverter',
    name: 'Open Image Converter',
    description: 'Open the canvas-backed image converter.',
    category: 'Quick Tools',
    feature: 'image-converter',
    defaultShortcut: 'Alt+4',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openBatchConverter',
    name: 'Open Batch Converter',
    description: 'Convert a queue of images through the canvas pipeline.',
    category: 'Quick Tools',
    feature: 'batch-converter',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openFocusTimer',
    name: 'Open Focus Timer',
    description: 'Open the countdown and stopwatch workspace.',
    category: 'Productivity',
    feature: 'focus-timer',
    defaultShortcut: 'Alt+5',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openQuickNotes',
    name: 'Open Quick Notes',
    description: 'Open the Blanc-local quick notes surface.',
    category: 'Productivity',
    feature: 'quick-notes',
    defaultShortcut: 'Alt+6',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openClipboard',
    name: 'Open Clipboard',
    description: 'Open the shared clipboard history tool.',
    category: 'Productivity',
    feature: 'clipboard',
    defaultShortcut: 'Alt+7',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openDevConsole',
    name: 'Open Developer Console',
    description: 'Open the Blanc event log.',
    category: 'System',
    feature: 'dev-console',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openAudioMine',
    name: 'Open Audio Transcribe & Mine',
    description: 'Transcribe a local audio or video file and mine lines to your deck.',
    category: 'Language',
    feature: 'audio-mine',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openPitchAccent',
    name: 'Open Pitch Accent',
    description: 'Look up a word’s pitch-accent contour.',
    category: 'Study',
    feature: 'pitch-accent',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openReviewForecast',
    name: 'Open Review Forecast',
    description: 'Open the read-only review load forecast.',
    category: 'Study',
    feature: 'review-forecast',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openConjugationDrill',
    name: 'Open Conjugation Drill',
    description: 'Open the verb and adjective conjugation drill.',
    category: 'Study',
    feature: 'conjugation-drill',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openCounterReader',
    name: 'Open Counter Reader',
    description: 'Open the counter and number reader.',
    category: 'Study',
    feature: 'counter-reader',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openFurigana',
    name: 'Open Furigana Generator',
    description: 'Open the furigana generator for annotating pasted text.',
    category: 'Study',
    feature: 'furigana',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openCalendar',
    name: 'Open Calendar',
    description: 'Open the shared Study OS calendar.',
    category: 'Productivity',
    feature: 'calendar',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openMedia',
    name: 'Open Media',
    description: 'Open the full practical media workspace.',
    category: 'Productivity',
    feature: 'media',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openFlashcards',
    name: 'Open Flashcards',
    description: 'Open the shared flashcard workspace.',
    category: 'Language',
    feature: 'flashcards',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openStatistics',
    name: 'Open Statistics',
    description: 'Open study and Toolbox statistics.',
    category: 'System',
    feature: 'statistics',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openEpubMining',
    name: 'Open EPUB Mining',
    description: 'Open simple or advanced EPUB mining.',
    category: 'Language',
    feature: 'epub-mining',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openAnkiDeck',
    name: 'Open Anki Deck',
    description: 'Open local deck and Anki export tools.',
    category: 'Language',
    feature: 'anki-deck',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openMonoBlocks',
    name: 'Open Mono Blocks',
    description: 'Open the single Blanc monochrome blocks game.',
    category: 'Productivity',
    feature: 'mono-blocks',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openSystemMonitor',
    name: 'Open System Monitor',
    description: 'Open the compact system metrics surface.',
    category: 'System',
    feature: 'system-monitor',
    defaultShortcut: 'Alt+8',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openFileSearch',
    name: 'Open File Search',
    description: 'Open capped local filename search.',
    category: 'System',
    feature: 'file-search',
    defaultShortcut: 'Alt+9',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openAutomationBuilder',
    name: 'Open Automation Builder',
    description: 'Launch the existing PowerShell automation builder.',
    category: 'System',
    feature: 'automation-builder',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openWorkspaceLauncher',
    name: 'Open Workspace Launcher',
    description: 'Open saved workspaces and launch their targets in order.',
    category: 'System',
    feature: 'workspace-launcher',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openDictionary',
    name: 'Open Dictionary',
    description: 'Open shared dictionary lookup.',
    category: 'Language',
    feature: 'dictionary',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openGrammar',
    name: 'Open Grammar',
    description: 'Open grammar reference tools.',
    category: 'Language',
    feature: 'grammar',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openResources',
    name: 'Open Resources',
    description: 'Open shared language learning resources.',
    category: 'Language',
    feature: 'resources',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openReadingFinder',
    name: 'Open Reading Finder',
    description: 'Open reading discovery and analysis.',
    category: 'Language',
    feature: 'reading-finder',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openNotificationCenter',
    name: 'Open Task Center',
    description: 'Open the shared notification / task list.',
    category: 'System',
    feature: 'notification-center',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openDifficultyAnalyzer',
    name: 'Open Level & Difficulty Checker',
    description: 'Score pasted text for level and unknown lemmas.',
    category: 'Language',
    feature: 'difficulty-analyzer',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openImmersionTracker',
    name: 'Open Immersion Tracker',
    description: 'Open per-site immersion totals.',
    category: 'Language',
    feature: 'immersion-tracker',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openFrequencyExplorer',
    name: 'Open Frequency Explorer',
    description: 'Look up word frequency ranks from installed dictionaries.',
    category: 'Language',
    feature: 'frequency-explorer',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openSubtitleImporter',
    name: 'Open Subtitle Importer',
    description: 'Parse subtitle files and send cues to the flashcard deck.',
    category: 'Language',
    feature: 'subtitle-importer',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openContextSearch',
    name: 'Open Personal Context Search',
    description: 'Fuzzy-search commands, saved words, deck cards, and grammar.',
    category: 'Language',
    feature: 'context-search',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openKanjiInspector',
    name: 'Open Kanji Inspector',
    description: 'Inspect a single character with radical membership and dictionary gloss.',
    category: 'Language',
    feature: 'kanji-inspector',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'toolbox.openYoutubeLibrary',
    name: 'Open YouTube Library',
    description: 'Track playlists, download videos, and plan to watch.',
    category: 'Language',
    feature: 'youtube-library',
    defaultShortcut: '',
    scope: 'toolbox',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'focusTimer.startPause',
    name: 'Start or Pause Focus Timer',
    description: 'Toggle the active focus timer.',
    category: 'Active Tool',
    feature: 'focus-timer',
    defaultShortcut: 'Ctrl+Shift+Space',
    scope: 'active-tool',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'focusTimer.reset',
    name: 'Reset Focus Timer',
    description: 'Reset the active focus timer.',
    category: 'Active Tool',
    feature: 'focus-timer',
    defaultShortcut: 'Ctrl+Shift+Backspace',
    scope: 'active-tool',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  {
    id: 'quickNotes.newNote',
    name: 'New Quick Note',
    description: 'Clear the Blanc quick note editor for a new note.',
    category: 'Active Tool',
    feature: 'quick-notes',
    defaultShortcut: 'Ctrl+N',
    scope: 'active-tool',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
  // NOTE: `clipboard.copySelectedEntry` and `readingFinder.search` were removed
  // from this registry (2026-07-17 audit) because no view ever registered a
  // handler for them — they were unfulfillable bindings in Settings. Re-add them
  // here only together with a real `registerCommandHandler` in the owning view.
  {
    id: 'automation.runSelected',
    name: 'Run Selected Automation',
    description: 'Run the selected automation after the tool-specific safety prompts.',
    category: 'Active Tool',
    feature: 'automation-builder',
    defaultShortcut: 'Ctrl+Shift+Enter',
    scope: 'active-tool',
    global: false,
    worksWhileTyping: false,
    editable: true,
  },
];

export function normalizeShortcutLabel(input: string): string {
  if (!input.trim()) return '';
  return input
    .split('|')
    .map((part) => {
      const bits = part.split('+').map((bit) => bit.trim()).filter(Boolean);
      const modifiers: string[] = [];
      let key = '';
      for (const bit of bits) {
        const lower = bit.toLowerCase();
        if (lower === 'control' || lower === 'ctrl') modifiers.push('Ctrl');
        else if (lower === 'option' || lower === 'alt') modifiers.push('Alt');
        else if (lower === 'shift') modifiers.push('Shift');
        else if (lower === 'cmd' || lower === 'command' || lower === 'win' || lower === 'meta') modifiers.push('Meta');
        else key = bit.length === 1 ? bit.toUpperCase() : bit;
      }
      const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier));
      return key ? [...ordered, key].join('+') : '';
    })
    .filter(Boolean)
    .join('|');
}

export function isShortcutReserved(shortcut: string): boolean {
  return shortcut
    .split('|')
    .map(normalizeShortcutLabel)
    .some((part) => DANGEROUS_SHORTCUTS.has(part));
}

export function findToolboxShortcutConflicts(
  commands: readonly ToolboxShortcutCommand[] = TOOLBOX_SHORTCUT_COMMANDS,
): ToolboxShortcutConflict[] {
  const byScopeAndShortcut = new Map<string, string[]>();
  for (const command of commands) {
    for (const shortcut of command.defaultShortcut.split('|').map(normalizeShortcutLabel).filter(Boolean)) {
      const key = `${command.scope}\n${shortcut}`;
      byScopeAndShortcut.set(key, [...(byScopeAndShortcut.get(key) ?? []), command.id]);
    }
  }
  return [...byScopeAndShortcut.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, commandIds]) => {
      const [scope, shortcut] = key.split('\n') as [ToolboxShortcutScope, string];
      return { shortcut, scope, commandIds };
    });
}

export function exportToolboxShortcutMappings(
  mappings: Record<string, string>,
  generatedAt = new Date().toISOString(),
): string {
  const clean: Record<string, string> = {};
  const commandIds = new Set(TOOLBOX_SHORTCUT_COMMANDS.map((command) => command.id));
  for (const [id, value] of Object.entries(mappings)) {
    if (commandIds.has(id) && typeof value === 'string') clean[id] = normalizeShortcutLabel(value);
  }
  return JSON.stringify({ version: 1, generatedAt, mappings: clean } satisfies ToolboxShortcutExport, null, 2);
}

export function migrateToolboxShortcutMappings(mappings: Record<string, string>): Record<string, string> {
  const migrated: Record<string, string> = {};
  for (const [id, value] of Object.entries(mappings)) {
    const nextId = SHORTCUT_ID_MIGRATIONS[id] ?? id;
    if (migrated[nextId] == null) migrated[nextId] = value;
  }
  return migrated;
}

export function importToolboxShortcutMappings(json: string): { ok: true; mappings: Record<string, string> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json) as Partial<ToolboxShortcutExport>;
    if (!parsed || parsed.version !== 1 || !parsed.mappings || typeof parsed.mappings !== 'object') {
      return { ok: false, error: 'Not a Toolbox shortcut export.' };
    }
    const commandIds = new Set(TOOLBOX_SHORTCUT_COMMANDS.map((command) => command.id));
    const mappings: Record<string, string> = {};
    for (const [id, value] of Object.entries(migrateToolboxShortcutMappings(parsed.mappings))) {
      if (!commandIds.has(id)) continue;
      if (typeof value !== 'string') continue;
      const shortcut = normalizeShortcutLabel(value);
      if (isShortcutReserved(shortcut)) return { ok: false, error: `${shortcut} is reserved by the operating system.` };
      mappings[id] = shortcut;
    }
    return { ok: true, mappings };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
}

export function getToolboxCommandsForFeature(feature: ToolboxModuleId | 'toolbox'): ToolboxShortcutCommand[] {
  return TOOLBOX_SHORTCUT_COMMANDS.filter((command) => command.feature === feature);
}

export function validateToolboxShortcutRegistry(documentedCommandIds: readonly string[] = []): ToolboxShortcutValidation {
  const ids = TOOLBOX_SHORTCUT_COMMANDS.map((command) => command.id);
  const duplicateCommandIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const commandFeatures = new Set(
    TOOLBOX_SHORTCUT_COMMANDS
      .filter((command) => command.feature !== 'toolbox')
      .map((command) => command.feature as ToolboxModuleId),
  );
  const missingReadyFeatureCommands = TOOLBOX_MODULES
    .filter((module) => module.status === 'ready' && module.appearsInBlanc)
    .filter((module) => !commandFeatures.has(module.id))
    .map((module) => module.id);
  const documented = new Set(documentedCommandIds);
  const documentedMissingCommands = [...documented].filter((id) => !ids.includes(id));
  const undocumentedCommands = documentedCommandIds.length ? ids.filter((id) => !documented.has(id)) : [];
  const conflicts = findToolboxShortcutConflicts();
  return {
    ok:
      duplicateCommandIds.length === 0 &&
      conflicts.length === 0 &&
      missingReadyFeatureCommands.length === 0 &&
      documentedMissingCommands.length === 0 &&
      undocumentedCommands.length === 0,
    duplicateCommandIds,
    conflicts,
    missingReadyFeatureCommands,
    documentedMissingCommands,
    undocumentedCommands,
  };
}

export function generateToolboxShortcutMarkdown(
  commands: readonly ToolboxShortcutCommand[] = TOOLBOX_SHORTCUT_COMMANDS,
): string {
  const rows = commands
    .map((command) => {
      const shortcut = command.defaultShortcut || 'Unbound';
      return `| \`${command.id}\` | ${command.name} | ${command.description} | ${command.feature} | ${shortcut} | ${command.scope} | ${command.editable ? 'Yes' : 'No'} |`;
    })
    .join('\n');
  return [
    '# Toolbox Shortcuts',
    '',
    'Generated from `src/shared/toolboxShortcuts.ts`.',
    '',
    '| Command ID | Name | Description | Feature | Default shortcut | Scope | Configurable |',
    '|---|---|---|---|---|---|---|',
    rows,
    '',
    '## Registering A New Toolbox Shortcut',
    '',
    '1. Add the Toolbox module to `src/shared/toolboxRegistry.ts`.',
    '2. Add its commands to `TOOLBOX_SHORTCUT_COMMANDS` with stable IDs and non-conflicting defaults.',
    '3. Register UI behavior through `registerCommandHandler` or a Toolbox event listener.',
    '4. Verify `validateToolboxShortcutRegistry()` and regenerate this document.',
    '',
  ].join('\n');
}
