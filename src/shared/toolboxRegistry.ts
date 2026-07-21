export type ToolboxModuleStatus = 'ready' | 'existing' | 'planned' | 'adapter-needed' | 'experimental';

export type ToolboxLaunchContext =
  | 'blanc'
  | 'normal-os'
  | 'side-agent'
  | 'command-palette'
  | 'global-shortcut'
  | 'automation';

export type ToolboxCapability =
  | 'anki'
  | 'automation'
  | 'background-task'
  | 'capture'
  | 'clipboard'
  | 'conversion'
  | 'dictionary'
  | 'file-system'
  | 'flashcards'
  | 'game'
  | 'hotkey'
  | 'japanese-analysis'
  | 'media'
  | 'notifications'
  | 'ocr'
  | 'reading'
  | 'recording'
  | 'statistics'
  | 'timer'
  | 'utility';

export type ToolboxPermission =
  | 'anki-connect'
  | 'audio-capture'
  | 'automation-control'
  | 'clipboard-read'
  | 'clipboard-write'
  | 'file-read'
  | 'file-write'
  | 'global-shortcut'
  | 'microphone'
  | 'screen-capture'
  | 'window-control';

export type ToolboxModuleId =
  | 'clipboard'
  | 'automation-builder'
  | 'dictionary'
  | 'grammar'
  | 'reading-finder'
  | 'resources'
  | 'calendar'
  | 'media'
  | 'flashcards'
  | 'statistics'
  | 'epub-mining'
  | 'anki-deck'
  | 'mono-blocks'
  | 'screen-recorder'
  | 'screenshot-studio'
  | 'global-ocr'
  | 'universal-capture'
  | 'macro-recorder'
  | 'script-builder'
  | 'text-expander'
  | 'bulk-renamer'
  | 'pdf-toolkit'
  | 'image-converter'
  | 'qr-barcode'
  | 'color-picker'
  | 'always-on-top'
  | 'window-layouts'
  | 'hotkey-manager'
  | 'system-monitor'
  | 'file-search'
  | 'hash-checker'
  | 'audio-recorder'
  | 'focus-timer'
  | 'quick-notes'
  | 'workspace-launcher'
  | 'download-organizer'
  | 'batch-converter'
  | 'clipboard-ocr'
  | 'calculator'
  | 'unit-converter'
  | 'file-watcher'
  | 'notification-center'
  | 'difficulty-analyzer'
  | 'subtitle-importer'
  | 'screenshot-dictionary'
  | 'frequency-explorer'
  | 'kanji-inspector'
  | 'shadowing-player'
  | 'immersion-tracker'
  | 'context-search'
  | 'youtube-library'
  | 'furigana'
  | 'counter-reader'
  | 'conjugation-drill'
  | 'review-forecast';

export type ToolboxModuleCategory =
  | 'study'
  | 'capture'
  | 'media'
  | 'automation'
  | 'files'
  | 'desktop'
  | 'system'
  | 'utility'
  | 'game';

export interface ToolboxExternalAdapter {
  strategy: 'built-in' | 'existing-service' | 'github-preferred' | 'manual-integration';
  notes: string;
}

export interface ToolboxModule {
  id: ToolboxModuleId;
  label: string;
  category: ToolboxModuleCategory;
  status: ToolboxModuleStatus;
  capabilities: ToolboxCapability[];
  permissions: ToolboxPermission[];
  launchContexts: ToolboxLaunchContext[];
  supportsBackground: boolean;
  appearsInBlanc: boolean;
  appearsInNormalOs: boolean;
  supportsGlobalShortcut: boolean;
  supportsAutomation: boolean;
  acceptsExternalInput: boolean;
  aiRequired: boolean;
  localOnlyCapable: boolean;
  implementation: string;
  externalAdapter: ToolboxExternalAdapter;
  migrationNotes: string;
}

const BLANC_READY_CONTEXTS: ToolboxLaunchContext[] = ['blanc', 'normal-os', 'command-palette'];
const PLANNED_CONTEXTS: ToolboxLaunchContext[] = ['blanc', 'normal-os', 'side-agent', 'command-palette'];

export const TOOLBOX_MODULES: ToolboxModule[] = [
  {
    id: 'automation-builder',
    label: 'Automation Builder',
    category: 'automation',
    status: 'experimental',
    capabilities: ['automation', 'hotkey', 'file-system'],
    permissions: ['automation-control', 'window-control', 'global-shortcut', 'file-read', 'file-write'],
    launchContexts: ['blanc', 'normal-os'],
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing automation-builder.ps1 Windows Forms script with saved automation-configs.',
    externalAdapter: {
      strategy: 'manual-integration',
      notes: 'Use the existing PowerShell script as the Windows adapter; add only an allowlisted launcher IPC later.',
    },
    migrationNotes: 'Wrap saved JSON configs in a shared automation service before exposing playback in normal OS surfaces.',
  },
  {
    id: 'clipboard',
    label: 'Clipboard',
    category: 'capture',
    status: 'ready',
    capabilities: ['clipboard', 'capture', 'japanese-analysis', 'background-task'],
    permissions: ['clipboard-read', 'clipboard-write'],
    launchContexts: [...BLANC_READY_CONTEXTS, 'side-agent', 'global-shortcut'],
    supportsBackground: true,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: true,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing ClipboardWidget and ClipboardHistoryPanel services.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Keep using the app clipboard history first; add OS adapters only for missing global capture behavior.',
    },
    migrationNotes: 'Shared clipboard service should remain mode-agnostic and feed both Blanc and normal OS surfaces.',
  },
  {
    id: 'dictionary',
    label: 'Dictionary',
    category: 'study',
    status: 'ready',
    capabilities: ['dictionary', 'japanese-analysis', 'reading'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing DictionaryView and dictionary lookup stack.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Reuse installed dictionaries and lookup services instead of creating Blanc-only dictionary data.',
    },
    migrationNotes: 'Expose as a module action for capture, reader, clipboard, and command palette flows.',
  },
  {
    id: 'grammar',
    label: 'Grammar',
    category: 'study',
    status: 'ready',
    capabilities: ['japanese-analysis', 'reading'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing GrammarView.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Use deterministic grammar resources; keep AI explanations outside the default Blanc surface.',
    },
    migrationNotes: 'Grammar analysis should be callable from reader selections and clipboard captures.',
  },
  {
    id: 'reading-finder',
    label: 'Reading Finder',
    category: 'study',
    status: 'ready',
    capabilities: ['reading', 'japanese-analysis', 'file-system'],
    permissions: ['file-read'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing ReadingFinderView.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Use the current catalog/import analysis pipeline; future discovery integrations should stay legally sourced.',
    },
    migrationNotes: 'Keep book opening routed through shared LibraryItem rather than Blanc-specific state.',
  },
  {
    id: 'resources',
    label: 'Resources',
    category: 'study',
    status: 'ready',
    capabilities: ['reading', 'utility'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: false,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing ResourcesView.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Reuse the existing resource catalog and avoid duplicating bookmarks for Blanc.',
    },
    migrationNotes: 'Resource catalog should remain a shared study module.',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    category: 'utility',
    status: 'ready',
    capabilities: ['timer', 'statistics', 'utility'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: false,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing CalendarView.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Use local study calendar state before considering external calendar connectors.',
    },
    migrationNotes: 'Can later expose study sessions and timer events from the shared task center.',
  },
  {
    id: 'media',
    label: 'Media',
    category: 'media',
    status: 'ready',
    capabilities: ['media', 'reading', 'japanese-analysis'],
    permissions: ['file-read', 'file-write'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: true,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing MediaView in the Blanc frame.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Keep full practical media tools; only hide decorative shells and AI-first workflows.',
    },
    migrationNotes: 'Media service should stay reusable for subtitle mining, shadowing, and capture workflows.',
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    category: 'study',
    status: 'ready',
    capabilities: ['flashcards', 'anki', 'japanese-analysis'],
    permissions: ['file-read', 'file-write', 'anki-connect'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing FlashcardsView with AI Studio hidden in Blanc.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Use existing decks, import/export, review, CSV, and Anki handoff.',
    },
    migrationNotes: 'Keep card data shared with the normal OS; Blanc memory settings must not fork decks.',
  },
  {
    id: 'statistics',
    label: 'Statistics',
    category: 'system',
    status: 'ready',
    capabilities: ['statistics', 'timer'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: true,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing StatisticsView plus Blanc clock/timer surface.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Use shared statistics events; do not create a separate Blanc-only stats database.',
    },
    migrationNotes: 'Add task-center events here as toolbox modules mature.',
  },
  {
    id: 'epub-mining',
    label: 'EPUB Mining',
    category: 'study',
    status: 'ready',
    capabilities: ['reading', 'flashcards', 'anki', 'japanese-analysis', 'file-system'],
    permissions: ['file-read', 'file-write', 'anki-connect'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: true,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing EpubMiningSimplePanel and EpubMiningPanel selected by Advanced.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Keep advanced mining behind the Advanced checkbox and avoid default AI-first actions.',
    },
    migrationNotes: 'Mining adapters should remain callable from Read, Flashcards, and Toolbox workflows.',
  },
  {
    id: 'anki-deck',
    label: 'Anki Deck',
    category: 'study',
    status: 'ready',
    capabilities: ['anki', 'flashcards', 'file-system'],
    permissions: ['file-read', 'file-write', 'anki-connect'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing local deck helpers and AnkiView for advanced mapping.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Use existing AnkiConnect/local deck export code; no Blanc-only deck format.',
    },
    migrationNotes: 'Basic deck form is a Blanc surface; mappings and deck data stay shared.',
  },
  {
    id: 'mono-blocks',
    label: 'Mono Blocks',
    category: 'game',
    status: 'ready',
    capabilities: ['game'],
    permissions: [],
    launchContexts: ['blanc'],
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: false,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: false,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Blanc-only monochrome blocks game based on existing game mechanics.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'Keep this as the single Blanc game; do not surface the broader games arena in Blanc.',
    },
    migrationNotes: 'No migration needed unless the normal OS wants the same minimal mode.',
  },
  {
    id: 'calculator',
    label: 'Calculator',
    category: 'utility',
    status: 'ready',
    capabilities: ['utility'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Built-in Blanc calculator backed by shared toolboxUtilities.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'No external dependency needed for the current basic calculator.',
    },
    migrationNotes: 'Shared calculation helper can be reused by the normal OS command palette.',
  },
  {
    id: 'unit-converter',
    label: 'Unit Converter',
    category: 'utility',
    status: 'ready',
    capabilities: ['utility'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Built-in length, weight, temperature, and data conversion backed by shared toolboxUtilities.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'Static unit conversion works offline; currency remains a separate future adapter because rates expire.',
    },
    migrationNotes: 'Expose as command-palette actions and automation transforms later.',
  },
  {
    id: 'focus-timer',
    label: 'Focus Timer',
    category: 'utility',
    status: 'ready',
    capabilities: ['timer', 'statistics', 'notifications'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: false,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Built-in Blanc countdown timer and stopwatch surface.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'Current timer is renderer-local; background notifications can move to a shared task center later.',
    },
    migrationNotes: 'Future version should emit shared statistics/task-center events.',
  },
  {
    id: 'system-monitor',
    label: 'System Monitor',
    category: 'system',
    status: 'ready',
    capabilities: ['statistics', 'background-task', 'utility'],
    permissions: [],
    launchContexts: [...BLANC_READY_CONTEXTS, 'side-agent'],
    supportsBackground: true,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: false,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing main-process system metrics IPC surfaced as a compact Blanc monitor.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Use the current system:getMetrics API before adding native GPU/process adapters.',
    },
    migrationNotes: 'Keep metrics mode-agnostic so Blanc, Settings, side-agent, and task center can share the same source.',
  },
  {
    id: 'file-search',
    label: 'File Search',
    category: 'files',
    status: 'ready',
    capabilities: ['file-system', 'utility'],
    permissions: ['file-read'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Built-in folder filename search using a main-process filesystem adapter.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'No dependency needed for capped filename search; future indexed/content search can use a mature OSS adapter.',
    },
    migrationNotes: 'Keep the search IPC generic so normal OS command palette and automation can reuse it later.',
  },
  {
    id: 'furigana',
    label: 'Furigana Generator',
    category: 'study',
    status: 'ready',
    capabilities: ['japanese-analysis', 'utility', 'clipboard'],
    permissions: ['clipboard-write'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: false,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation:
      'Blanc panel over the bundled kuromoji tokenizer plus shared/furigana.ts, which aligns each token reading onto its kanji runs (食べる → 食[た]べる) instead of annotating whole words. Outputs ruby HTML, Anki bracket furigana, or kana.',
    externalAdapter: {
      strategy: 'built-in',
      notes:
        'Pure composition over the tokenizer already bundled for the readers — no new dependency and no network.',
    },
    migrationNotes:
      'Study-native track item 3. Blanc-only for now: Study OS already renders furigana inline in readers and subtitles, so a second generator surface there would duplicate rather than add.',
  },
  {
    id: 'review-forecast',
    label: 'Review Forecast',
    category: 'study',
    status: 'ready',
    capabilities: ['statistics', 'flashcards', 'anki'],
    permissions: ['anki-connect'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: false,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: false,
    aiRequired: false,
    localOnlyCapable: true,
    implementation:
      'Read-only Blanc panel: local deck backlog and knowledge bands from existing stores, plus a real 7-day due forecast from Anki via read-only findCards prop:due=N queries. No write path.',
    externalAdapter: {
      strategy: 'existing-service',
      notes:
        'Anki section needs AnkiConnect; degrades to an honest empty state rather than deriving due dates from interval lengths, which cannot be done.',
    },
    migrationNotes:
      'Study-native track item 7. Blanc-only: Study OS Statistics covers historical counts, this is forward-looking load.',
  },
  {
    id: 'conjugation-drill',
    label: 'Conjugation Drill',
    category: 'study',
    status: 'ready',
    capabilities: ['japanese-analysis', 'game'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: false,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: false,
    aiRequired: false,
    localOnlyCapable: true,
    implementation:
      'Blanc panel over shared/conjugate.ts, the forward direction of deinflect.ts built on the same godan tables. Answers are checked against an engine round-trip tested against deinflect, so a verdict here agrees with dictionary lookup by construction.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'Pure logic, no dependency. Not the Game Arena: no XP, session, or streak — open, drill, close.',
    },
    migrationNotes:
      'Study-native track item 4. Blanc-only: the Game Arena covers gamified practice in Study OS, and this is deliberately the un-gamified drill.',
  },
  {
    id: 'counter-reader',
    label: 'Counter Reader',
    category: 'study',
    status: 'ready',
    capabilities: ['japanese-analysis', 'utility'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: false,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation:
      'Blanc panel over shared/japaneseNumbers.ts — numerals, counters with their sound changes (3本 → さんぼん), dates, and clock times to kana, with TTS via the shared speak().',
    externalAdapter: {
      strategy: 'built-in',
      notes:
        'Pure table-driven logic, no dependency and no network. Distinct from the Counter Quiz game, which is a static prompt set rather than a reader.',
    },
    migrationNotes:
      'Study-native track item 5. Blanc-only: Study OS has the Counter Quiz game for practice, and this is the reference reader that game is not.',
  },
  {
    id: 'quick-notes',
    label: 'Quick Notes',
    category: 'utility',
    status: 'ready',
    capabilities: ['utility', 'clipboard', 'japanese-analysis'],
    permissions: ['clipboard-read', 'clipboard-write'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Built-in Blanc quick notes saved in local Blanc storage.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'Notes intentionally stay separate from main app memory until a shared notes service exists.',
    },
    migrationNotes: 'Warn users that Blanc quick notes do not transfer to main Study OS memory yet.',
  },
  {
    id: 'hash-checker',
    label: 'Hash Checker',
    category: 'files',
    status: 'ready',
    capabilities: ['file-system', 'utility'],
    permissions: ['file-read'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Built-in Blanc SHA-256 checker using browser crypto.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'No dependency needed for SHA-256. Keep MD5/SHA-1 as future compatibility-only options if needed.',
    },
    migrationNotes: 'Can become a shared command-palette and file-context action later.',
  },
  {
    id: 'image-converter',
    label: 'Image Converter',
    category: 'files',
    status: 'ready',
    capabilities: ['conversion', 'file-system'],
    permissions: ['file-read', 'file-write'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Built-in Blanc image converter using browser canvas.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'PNG, JPEG, and WebP conversion can stay dependency-free. AVIF/TIFF batch work can use OSS adapters later.',
    },
    migrationNotes: 'Can move into shared file utilities and command-palette file actions later.',
  },
  {
    id: 'batch-converter',
    label: 'Batch Converter',
    category: 'files',
    status: 'ready',
    capabilities: ['conversion', 'file-system', 'background-task'],
    permissions: ['file-read', 'file-write'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: true,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Built-in Blanc batch image converter: queue many files through the same browser-canvas pipeline as Image Converter.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'PNG, JPEG, and WebP stay dependency-free like the single-file converter. Video/audio/document batches need OSS adapters later.',
    },
    migrationNotes: 'Shares the canvas conversion approach with image-converter; extract a shared helper if a third consumer appears.',
  },
  {
    id: 'workspace-launcher',
    label: 'Workspace Launcher',
    category: 'automation',
    status: 'ready',
    capabilities: ['automation', 'file-system'],
    permissions: ['file-read', 'window-control'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Built-in Blanc workspace groups: named sets of targets launched in order through the existing desktop:launch IPC.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'Reuses desktop:pickShortcut and desktop:launch — no new main-process surface. Window placement/sizing on launch needs a window-control adapter later.',
    },
    migrationNotes: 'Targets are added via the native picker (or typed http(s) URLs) so the desktop:launch caller invariant holds; keep that if this moves to normal OS.',
  },
  {
    id: 'notification-center',
    label: 'Task Center',
    category: 'system',
    status: 'ready',
    capabilities: ['notifications', 'background-task'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: true,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: false,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing notificationStore shared with the Study OS shell bell.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Reuse the shell notification store; no separate Blanc notification bus.',
    },
    migrationNotes: 'Keep dismiss/clear actions on the shared store so Study OS and Blanc stay in sync.',
  },
  {
    id: 'difficulty-analyzer',
    label: 'Level & Difficulty Checker',
    category: 'study',
    status: 'ready',
    capabilities: ['japanese-analysis', 'reading'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'estimateLevelFromText + scoreTextComprehensibility (absorbs retired unknown-word-detector).',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Reuse the book-level and comprehensibility engines already used by Reading Finder / Inbox.',
    },
    migrationNotes: 'Merged unknown-word-detector into this module on 2026-07-19 — same underlying computation.',
  },
  {
    id: 'immersion-tracker',
    label: 'Immersion Tracker',
    category: 'study',
    status: 'ready',
    capabilities: ['statistics', 'reading', 'media'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: false,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing immersion IPC (immersionListSites) and ImmersionView data model.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Read-only Blanc surface over the shared immersion site store.',
    },
    migrationNotes: 'Keep write paths in the main Immersion view / extension bridge.',
  },
  {
    id: 'frequency-explorer',
    label: 'Frequency Explorer',
    category: 'study',
    status: 'ready',
    capabilities: ['dictionary', 'japanese-analysis'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Dictionary lookupTerm frequency ranks from installed frequency dictionaries.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Reuse yomitan frequency ranks already exposed on DictEntry.',
    },
    migrationNotes: 'Not a second frequency corpus — just a compact lookup UI.',
  },
  {
    id: 'subtitle-importer',
    label: 'Subtitle Importer',
    category: 'media',
    status: 'ready',
    capabilities: ['media', 'japanese-analysis', 'flashcards'],
    permissions: ['file-read', 'file-write'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'parseSubtitles + addDeckCards (same as Media subtitle import path).',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'SRT/VTT/ASS/LRC parsing stays in renderer; no new native dependency.',
    },
    migrationNotes: 'Cards land in the shared flashcard deck with source import.',
  },
  {
    id: 'context-search',
    label: 'Personal Context Search',
    category: 'study',
    status: 'ready',
    capabilities: ['dictionary', 'japanese-analysis'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Shared fuzzyScore over commands, saved words, deck cards, and grammar.',
    externalAdapter: {
      strategy: 'built-in',
      notes: 'Same fuzzy helper CommandPalette uses; no separate search index.',
    },
    migrationNotes: 'Keep as a thin search surface, not a second command palette chrome.',
  },
  {
    id: 'kanji-inspector',
    label: 'Kanji Inspector',
    category: 'study',
    status: 'ready',
    capabilities: ['dictionary', 'japanese-analysis'],
    permissions: [],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: false,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: false,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'KANJI_RADICALS membership + lookupTerm single-character dictionary entry.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Reuse the dictionary stack; radical list is the existing Kangxi picker set.',
    },
    migrationNotes: 'Full radical decomposition stays out of scope until a decomposition dataset is added.',
  },
  {
    id: 'youtube-library',
    label: 'YouTube Library',
    category: 'media',
    status: 'ready',
    capabilities: ['media', 'file-system', 'background-task'],
    permissions: ['file-read', 'file-write'],
    launchContexts: BLANC_READY_CONTEXTS,
    supportsBackground: true,
    appearsInBlanc: true,
    appearsInNormalOs: true,
    supportsGlobalShortcut: false,
    supportsAutomation: true,
    acceptsExternalInput: true,
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Existing yt:* IPC (ytPlaylists) with a compact Blanc add/list/download/plan UI.',
    externalAdapter: {
      strategy: 'existing-service',
      notes: 'Reuse ytPlaylists main-process store; do not fork playlist state for Blanc.',
    },
    migrationNotes: 'Full folders/News/Surprise Me UI stays in YouTubePlaylistsView.',
  },
  ...plannedModules([
    ['screen-recorder', 'Screen Recorder', 'capture', ['recording', 'capture', 'background-task'], ['screen-capture', 'audio-capture', 'microphone', 'file-write']],
    ['screenshot-studio', 'Screenshot Studio', 'capture', ['capture', 'ocr', 'file-system'], ['screen-capture', 'clipboard-write', 'file-write']],
    ['global-ocr', 'Global OCR', 'capture', ['ocr', 'capture', 'japanese-analysis'], ['screen-capture', 'clipboard-read', 'clipboard-write']],
    ['universal-capture', 'Universal Capture', 'capture', ['capture', 'clipboard', 'ocr', 'japanese-analysis', 'hotkey'], ['global-shortcut', 'screen-capture', 'clipboard-read']],
    ['macro-recorder', 'Macro Recorder', 'automation', ['automation', 'hotkey'], ['automation-control', 'window-control', 'global-shortcut']],
    ['script-builder', 'Script Builder', 'automation', ['automation', 'file-system', 'notifications'], ['automation-control', 'file-read', 'file-write']],
    ['text-expander', 'Text Expander', 'automation', ['automation', 'clipboard', 'hotkey'], ['clipboard-read', 'clipboard-write', 'global-shortcut']],
    ['bulk-renamer', 'Bulk Renamer', 'files', ['file-system', 'utility'], ['file-read', 'file-write']],
    ['pdf-toolkit', 'PDF Toolkit', 'files', ['conversion', 'file-system', 'ocr'], ['file-read', 'file-write']],
    ['qr-barcode', 'QR and Barcode', 'utility', ['capture', 'utility'], ['screen-capture', 'file-read', 'clipboard-read']],
    ['color-picker', 'Color Picker', 'desktop', ['capture', 'utility'], ['screen-capture', 'clipboard-write']],
    ['always-on-top', 'Always on Top', 'desktop', ['utility', 'hotkey'], ['window-control', 'global-shortcut']],
    ['window-layouts', 'Window Layouts', 'desktop', ['automation', 'utility'], ['window-control']],
    ['hotkey-manager', 'Hotkey Manager', 'system', ['hotkey', 'automation'], ['global-shortcut']],
    ['audio-recorder', 'Audio Recorder', 'media', ['recording', 'media', 'background-task'], ['audio-capture', 'microphone', 'file-write']],
    ['download-organizer', 'Download Organizer', 'files', ['file-system', 'automation', 'background-task'], ['file-read', 'file-write']],
    ['clipboard-ocr', 'Clipboard OCR', 'capture', ['clipboard', 'ocr', 'japanese-analysis', 'background-task'], ['clipboard-read', 'clipboard-write']],
    ['file-watcher', 'File Watcher', 'automation', ['file-system', 'automation', 'background-task'], ['file-read', 'file-write']],
    ['screenshot-dictionary', 'Screenshot Dictionary', 'capture', ['ocr', 'dictionary', 'japanese-analysis'], ['screen-capture', 'file-write']],
    ['shadowing-player', 'Shadowing Player', 'media', ['media', 'recording', 'statistics'], ['microphone', 'file-read', 'file-write']],
  ]),
];

function plannedModules(
  rows: readonly [
    ToolboxModuleId,
    string,
    ToolboxModuleCategory,
    ToolboxCapability[],
    ToolboxPermission[],
  ][],
): ToolboxModule[] {
  return rows.map(([id, label, category, capabilities, permissions]) => ({
    id,
    label,
    category,
    status: 'adapter-needed',
    capabilities,
    permissions,
    launchContexts: PLANNED_CONTEXTS,
    supportsBackground: capabilities.includes('background-task'),
    appearsInBlanc: false,
    appearsInNormalOs: false,
    supportsGlobalShortcut: capabilities.includes('hotkey'),
    supportsAutomation: capabilities.includes('automation'),
    acceptsExternalInput: capabilities.some((capability) => ['capture', 'clipboard', 'file-system', 'media', 'ocr'].includes(capability)),
    aiRequired: false,
    localOnlyCapable: true,
    implementation: 'Planned shared toolbox module; no Blanc button until the service is real.',
    externalAdapter: {
      strategy: 'github-preferred',
      notes: 'Prefer a mature OSS library or CLI adapter when package changes are allowed and the fit is better than hand-rolling.',
    },
    // Deliberately does NOT claim "needs a native adapter" — that blanket wording
    // was wrong for most planned modules and misled a session on 2026-07-20 (the
    // OCR stack is already installed; see BLANC_REFINEMENT_PLAN.md for the
    // per-module blocker tiering). Check the real blocker before quoting this.
    migrationNotes: 'Build as shared service plus thin Blanc/normal OS launch surfaces so it can migrate without a rewrite. Blocker is per-module — see BLANC_REFINEMENT_PLAN.md, do not assume a native adapter is required.',
  }));
}

export function listToolboxModules(filter?: Partial<Pick<ToolboxModule, 'category' | 'status' | 'appearsInBlanc' | 'appearsInNormalOs'>>): ToolboxModule[] {
  if (!filter) return [...TOOLBOX_MODULES];
  return TOOLBOX_MODULES.filter((module) =>
    Object.entries(filter).every(([key, value]) => module[key as keyof typeof filter] === value),
  );
}

export function getToolboxModule(id: ToolboxModuleId): ToolboxModule | undefined {
  return TOOLBOX_MODULES.find((module) => module.id === id);
}

export function listBlancToolboxModules(): ToolboxModule[] {
  return TOOLBOX_MODULES.filter((module) => module.appearsInBlanc && module.status === 'ready');
}

export function listReadyToolboxModules(): ToolboxModule[] {
  return TOOLBOX_MODULES.filter((module) => module.status === 'ready');
}

export function isToolboxModuleReady(id: ToolboxModuleId): boolean {
  return getToolboxModule(id)?.status === 'ready';
}
