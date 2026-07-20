import { TOOLBOX_MODULES, type ToolboxModuleId } from './toolboxRegistry';

export type ToolboxSettingsCategory =
  | 'general'
  | 'layout'
  | 'tool-visibility'
  | 'keyboard-shortcuts'
  | 'search';

export type ToolboxDensity = 'compact' | 'comfortable' | 'spacious';
export type ToolboxLauncherStyle = 'list' | 'compact-list' | 'grid' | 'categorized-grid';
export type ToolboxTabPosition = 'top' | 'bottom';

// Every key here must have a real consumer (behavior it changes). Settings with
// no backing implementation are removed rather than persisted as dead toggles.
export interface ToolboxSettings {
  version: 1;
  enabled: boolean;
  defaultTool: ToolboxModuleId;
  restoreLastTool: boolean;
  restoreTabs: boolean;
  rememberSidebarState: boolean;
  rememberWindowBounds: boolean;
  showTooltips: boolean;
  sidebarExpanded: boolean;
  sidebarWidth: number;
  density: ToolboxDensity;
  launcherStyle: ToolboxLauncherStyle;
  showToolDescriptions: boolean;
  showCategoryHeaders: boolean;
  showFavoritesSection: boolean;
  showRecentToolsSection: boolean;
  maxRecentTools: number;
  openToolsInTabs: boolean;
  tabPosition: ToolboxTabPosition;
  showTabIcons: boolean;
  enabledTools: ToolboxModuleId[];
  hiddenTools: ToolboxModuleId[];
  favoriteTools: ToolboxModuleId[];
  searchToolsByTitle: boolean;
  searchToolDescriptions: boolean;
  searchCommands: boolean;
  fuzzySearch: boolean;
  maxSearchResults: number;
  showHiddenToolsInSearch: boolean;
  showCommandShortcutLabels: boolean;
  showCommandDescriptions: boolean;
}

export interface ToolboxSettingDefinition<T extends keyof ToolboxSettings = keyof ToolboxSettings> {
  id: T;
  category: ToolboxSettingsCategory;
  type: 'boolean' | 'number' | 'select' | 'module-list';
  defaultValue: ToolboxSettings[T];
  description: string;
  keywords: string[];
  restartRequired: boolean;
  inherited: boolean;
  migrationVersion: number;
  min?: number;
  max?: number;
  options?: readonly string[];
}

export interface ToolboxSettingsImport {
  version: 1;
  exportedAt: string;
  settings: Partial<ToolboxSettings>;
}

const READY_MODULE_IDS = TOOLBOX_MODULES
  .filter((module) => module.status === 'ready' && module.appearsInBlanc)
  .map((module) => module.id);

export const DEFAULT_TOOLBOX_SETTINGS: ToolboxSettings = {
  version: 1,
  enabled: true,
  defaultTool: 'calculator',
  restoreLastTool: true,
  restoreTabs: true,
  rememberSidebarState: true,
  rememberWindowBounds: true,
  showTooltips: true,
  sidebarExpanded: true,
  sidebarWidth: 224,
  density: 'compact',
  launcherStyle: 'categorized-grid',
  showToolDescriptions: true,
  showCategoryHeaders: true,
  showFavoritesSection: true,
  showRecentToolsSection: true,
  maxRecentTools: 5,
  openToolsInTabs: true,
  tabPosition: 'top',
  showTabIcons: true,
  enabledTools: READY_MODULE_IDS,
  hiddenTools: [],
  favoriteTools: [],
  searchToolsByTitle: true,
  searchToolDescriptions: true,
  searchCommands: true,
  fuzzySearch: true,
  maxSearchResults: 25,
  showHiddenToolsInSearch: false,
  showCommandShortcutLabels: true,
  showCommandDescriptions: true,
};

export const TOOLBOX_SETTING_DEFINITIONS: ToolboxSettingDefinition[] = [
  setting('enabled', 'general', 'boolean', 'Enable or disable the Toolbox shell.', ['enable', 'disable', 'toolbox']),
  setting('defaultTool', 'general', 'select', 'Tool opened when Toolbox does not restore the previous tool.', ['default', 'startup', 'tool'], READY_MODULE_IDS),
  setting('restoreLastTool', 'general', 'boolean', 'Restore the last active tool on launch.', ['restore', 'last', 'startup']),
  setting('restoreTabs', 'general', 'boolean', 'Restore open Toolbox tabs between sessions.', ['tabs', 'restore']),
  setting('rememberSidebarState', 'general', 'boolean', 'Remember whether the tool launcher was collapsed.', ['sidebar', 'launcher']),
  setting('rememberWindowBounds', 'general', 'boolean', 'Remember the Blanc Toolbox window size between sessions.', ['window', 'size', 'position']),
  setting('showTooltips', 'general', 'boolean', 'Show hover tooltips for compact controls.', ['tooltip', 'hover']),
  setting('sidebarExpanded', 'layout', 'boolean', 'Default launcher sidebar state.', ['sidebar', 'collapsed']),
  setting('sidebarWidth', 'layout', 'number', 'Launcher width in pixels.', ['sidebar', 'width'], undefined, 160, 320),
  setting('density', 'layout', 'select', 'Control vertical spacing in the Toolbox.', ['density', 'spacing'], ['compact', 'comfortable', 'spacious']),
  setting('launcherStyle', 'layout', 'select', 'Choose how tools appear in the launcher.', ['launcher', 'list', 'grid'], ['list', 'compact-list', 'grid', 'categorized-grid']),
  setting('showToolDescriptions', 'layout', 'boolean', 'Show one-line descriptions under tool labels.', ['description', 'launcher']),
  setting('showCategoryHeaders', 'layout', 'boolean', 'Show category headers in the launcher.', ['category', 'headers']),
  setting('showFavoritesSection', 'layout', 'boolean', 'Show favorite tools at the top of the launcher.', ['favorite', 'pin']),
  setting('showRecentToolsSection', 'layout', 'boolean', 'Show recently used tools.', ['recent', 'history']),
  setting('maxRecentTools', 'layout', 'number', 'Maximum number of recent tools to retain.', ['recent', 'limit'], undefined, 0, 12),
  setting('openToolsInTabs', 'layout', 'boolean', 'Keep opened tools in a tab strip.', ['tabs', 'workspace']),
  setting('tabPosition', 'layout', 'select', 'Where active tool tabs appear.', ['tabs', 'position'], ['top', 'bottom']),
  setting('showTabIcons', 'layout', 'boolean', 'Show icons in active tool tabs.', ['tabs', 'icons']),
  setting('enabledTools', 'tool-visibility', 'module-list', 'Tools visible and runnable in the launcher.', ['tools', 'enable']),
  setting('hiddenTools', 'tool-visibility', 'module-list', 'Tools hidden from the launcher but kept searchable if enabled.', ['tools', 'hide']),
  setting('favoriteTools', 'tool-visibility', 'module-list', 'Tools pinned to the favorites strip.', ['favorites', 'pin']),
  setting('searchToolsByTitle', 'search', 'boolean', 'Match tool names during Toolbox search.', ['search', 'title']),
  setting('searchToolDescriptions', 'search', 'boolean', 'Match tool descriptions during Toolbox search.', ['search', 'description']),
  setting('searchCommands', 'search', 'boolean', 'Include registered Toolbox commands in search.', ['search', 'command']),
  setting('fuzzySearch', 'search', 'boolean', 'Allow forgiving search matching.', ['search', 'fuzzy']),
  setting('maxSearchResults', 'search', 'number', 'Maximum search results to display.', ['search', 'limit'], undefined, 5, 100),
  setting('showHiddenToolsInSearch', 'search', 'boolean', 'Include hidden tools in search results.', ['hidden', 'search']),
  setting('showCommandShortcutLabels', 'keyboard-shortcuts', 'boolean', 'Show current shortcut labels beside commands in search results.', ['shortcut', 'label']),
  setting('showCommandDescriptions', 'keyboard-shortcuts', 'boolean', 'Show command descriptions in command search results.', ['shortcut', 'description']),
];

function setting<T extends keyof ToolboxSettings>(
  id: T,
  category: ToolboxSettingsCategory,
  type: ToolboxSettingDefinition<T>['type'],
  description: string,
  keywords: string[],
  options?: readonly string[],
  min?: number,
  max?: number,
): ToolboxSettingDefinition<T> {
  return {
    id,
    category,
    type,
    defaultValue: DEFAULT_TOOLBOX_SETTINGS[id],
    description,
    keywords,
    restartRequired: false,
    inherited: false,
    migrationVersion: 1,
    options,
    min,
    max,
  };
}

export function sanitizeToolboxSettings(input: unknown): ToolboxSettings {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  // Rebuild from known keys only, so stale keys from older schema versions are
  // dropped on the next save instead of persisting forever.
  const next: ToolboxSettings = { ...DEFAULT_TOOLBOX_SETTINGS };
  for (const key of Object.keys(DEFAULT_TOOLBOX_SETTINGS) as (keyof ToolboxSettings)[]) {
    const value = raw[key];
    if (value !== undefined && typeof value === typeof DEFAULT_TOOLBOX_SETTINGS[key]) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  next.version = 1;
  const ready = new Set(READY_MODULE_IDS);
  next.defaultTool = ready.has(next.defaultTool) ? next.defaultTool : DEFAULT_TOOLBOX_SETTINGS.defaultTool;
  next.enabledTools = sanitizeModuleList(next.enabledTools, READY_MODULE_IDS);
  next.hiddenTools = sanitizeModuleList(next.hiddenTools, READY_MODULE_IDS).filter((id) => id !== 'calculator');
  next.favoriteTools = sanitizeModuleList(next.favoriteTools, READY_MODULE_IDS);
  next.sidebarWidth = clampNumber(next.sidebarWidth, 160, 320, DEFAULT_TOOLBOX_SETTINGS.sidebarWidth);
  next.maxRecentTools = clampNumber(next.maxRecentTools, 0, 12, DEFAULT_TOOLBOX_SETTINGS.maxRecentTools);
  next.maxSearchResults = clampNumber(next.maxSearchResults, 5, 100, DEFAULT_TOOLBOX_SETTINGS.maxSearchResults);
  if (!['compact', 'comfortable', 'spacious'].includes(next.density)) next.density = DEFAULT_TOOLBOX_SETTINGS.density;
  if (!['list', 'compact-list', 'grid', 'categorized-grid'].includes(next.launcherStyle)) next.launcherStyle = DEFAULT_TOOLBOX_SETTINGS.launcherStyle;
  if (!['top', 'bottom'].includes(next.tabPosition)) next.tabPosition = DEFAULT_TOOLBOX_SETTINGS.tabPosition;
  if (!next.enabledTools.includes('calculator')) next.enabledTools = ['calculator', ...next.enabledTools];
  return next;
}

function sanitizeModuleList(value: unknown, allowed: readonly ToolboxModuleId[]): ToolboxModuleId[] {
  if (!Array.isArray(value)) return [];
  const allowedSet = new Set(allowed);
  return value.filter((id, index): id is ToolboxModuleId =>
    typeof id === 'string' &&
    allowedSet.has(id as ToolboxModuleId) &&
    value.indexOf(id) === index,
  );
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function resetToolboxSettingsSection(
  settings: ToolboxSettings,
  category: ToolboxSettingsCategory,
): ToolboxSettings {
  const next: ToolboxSettings = { ...settings };
  for (const definition of TOOLBOX_SETTING_DEFINITIONS) {
    if (definition.category === category) {
      (next as Record<string, unknown>)[definition.id] = definition.defaultValue;
    }
  }
  return sanitizeToolboxSettings(next);
}

export function exportToolboxSettings(settings: ToolboxSettings, exportedAt = new Date().toISOString()): string {
  return JSON.stringify({ version: 1, exportedAt, settings } satisfies ToolboxSettingsImport, null, 2);
}

export function importToolboxSettings(json: string): { ok: true; settings: ToolboxSettings } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json) as Partial<ToolboxSettingsImport>;
    if (!parsed || parsed.version !== 1 || !parsed.settings || typeof parsed.settings !== 'object') {
      return { ok: false, error: 'Not a Toolbox settings export.' };
    }
    return { ok: true, settings: sanitizeToolboxSettings(parsed.settings) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
}

export function searchToolboxSettingDefinitions(query: string): ToolboxSettingDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...TOOLBOX_SETTING_DEFINITIONS];
  return TOOLBOX_SETTING_DEFINITIONS.filter((definition) =>
    [
      definition.id,
      definition.category,
      definition.description,
      ...definition.keywords,
    ].join(' ').toLowerCase().includes(q),
  );
}
