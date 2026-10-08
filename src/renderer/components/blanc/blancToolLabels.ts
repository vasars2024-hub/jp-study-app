/**
 * Translated names for Blanc's tools.
 *
 * `TOOLBOX_MODULES` (shared/toolboxRegistry.ts) carries an English `label` per
 * module because main-process and settings code read it as an identifier-ish
 * display name, and the Blanc-only tools have no registry entry at all. Neither
 * is translatable at module level, so — per the i18n rule for module-level
 * tables — this maps every id to a catalog KEY, and callers resolve it with
 * `t()` at render time.
 *
 * An id with no key (a registry module added later) falls back to the
 * registry's English label rather than rendering a dotted key.
 */
import { getToolboxModule, type ToolboxModuleId } from '../../../shared/toolboxRegistry';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const TOOL_LABEL_KEYS: Record<string, string> = {
  // Registry-governed modules.
  'automation-builder': 'blanc.tool.automationBuilder',
  clipboard: 'blanc.tool.clipboard',
  dictionary: 'blanc.tool.dictionary',
  grammar: 'blanc.tool.grammar',
  'reading-finder': 'blanc.tool.readingFinder',
  resources: 'blanc.tool.resources',
  calendar: 'blanc.tool.calendar',
  media: 'blanc.tool.media',
  flashcards: 'blanc.tool.flashcards',
  statistics: 'blanc.tool.statistics',
  'epub-mining': 'blanc.tool.epubMining',
  'anki-deck': 'blanc.tool.ankiDeck',
  'mono-blocks': 'blanc.tool.monoBlocks',
  calculator: 'blanc.tool.calculator',
  'unit-converter': 'blanc.tool.unitConverter',
  'focus-timer': 'blanc.tool.focusTimer',
  'system-monitor': 'blanc.tool.systemMonitor',
  'file-search': 'blanc.tool.fileSearch',
  furigana: 'blanc.tool.furigana',
  'dev-console': 'blanc.tool.devConsole',
  'audio-mine': 'blanc.tool.audioMine',
  'pitch-accent': 'blanc.tool.pitchAccent',
  'review-forecast': 'blanc.tool.reviewForecast',
  'conjugation-drill': 'blanc.tool.conjugationDrill',
  'counter-reader': 'blanc.tool.counterReader',
  'quick-notes': 'blanc.tool.quickNotes',
  'hash-checker': 'blanc.tool.hashChecker',
  'image-converter': 'blanc.tool.imageConverter',
  'batch-converter': 'blanc.tool.batchConverter',
  'app-drawer': 'blanc.tool.appDrawer',
  'notification-center': 'blanc.tool.notificationCenter',
  'difficulty-analyzer': 'blanc.tool.difficultyAnalyzer',
  'immersion-tracker': 'blanc.tool.immersionTracker',
  'frequency-explorer': 'blanc.tool.frequencyExplorer',
  'subtitle-importer': 'blanc.tool.subtitleImporter',
  'context-search': 'blanc.tool.contextSearch',
  'kanji-inspector': 'blanc.tool.kanjiInspector',
  'youtube-library': 'blanc.tool.youtubeLibrary',
  'screen-recorder': 'recorder.tool',
  // Blanc-only tools (no registry entry).
  coverage: 'blanc.tool.coverage',
  agent: 'blanc.tool.agent',
  files: 'blanc.tool.files',
  notebook: 'blanc.tool.notebook',
  translate: 'blanc.tool.translate',
  music: 'blanc.tool.music',
  novels: 'blanc.tool.novels',
  discover: 'blanc.tool.discover',
  games: 'blanc.tool.games',
  immersion: 'blanc.tool.immersion',
  visualizer: 'blanc.tool.visualizer',
  'local-agent': 'blanc.tool.localAgent',
  'visual-novels': 'blanc.tool.visualNovels',
};

/** The catalog key for a tool's name, or undefined for an id this table does not know. */
export function blancToolLabelKey(id: string): string | undefined {
  return TOOL_LABEL_KEYS[id];
}

/** A tool's display name in the active UI language. */
export function blancToolLabel(t: TFn, id: string): string {
  const key = TOOL_LABEL_KEYS[id];
  if (key) return t(key);
  return getToolboxModule(id as ToolboxModuleId)?.label ?? id;
}

/** Every id with a translated name — for the catalog completeness test. */
export const BLANC_TOOL_LABEL_IDS: readonly string[] = Object.keys(TOOL_LABEL_KEYS);
