import {
  AGENT_TOOL_OPERATIONS,
  type AgentToolHandlers,
  type AgentToolOperationDefinition,
  type AgentToolOperationId,
} from '../shared/localAgent';
import type { TVars } from '../shared/i18n/core';
import { searchAgentKnowledge } from '../shared/localAgentKnowledge';
import { DEFAULT_LOCAL_AGENT_SETTINGS, type LocalAgentSettings } from '../shared/localAgentSettings';
import { presetById, sanitizeThemeOverrides } from '../shared/blancTheme';
import { sanitizeCustomCss } from '../shared/blancCustomCss';
import { loadLocalAgentMemory } from './localAgentMemoryStore';
import { loadLocalAgentSettings, saveLocalAgentSettings } from './localAgentSettingsStore';
import {
  addDeckCards,
  createDeckFolder,
  deleteDeckFolder,
  loadDeck,
  loadDeckFolders,
  updateDeckCard,
  type DeckFlashcard,
} from './flashcardDeck';
import { addEvent, deleteEvent, loadEvents, type CalendarEvent } from './calendar';
import { buildLocalAgentKnowledgeSnapshot } from './localAgentKnowledge';
import { applyBlancTheme } from './blancThemeApply';
import { applyBlancCustomCss } from './blancCustomCssApply';
import { loadToolboxSettings, saveToolboxSettings } from './toolboxSettings';
import { recordBlancThemeHistory, undoBlancThemeHistory } from './blancThemeHistoryStore';
import { createStudyAgentHandlers } from './studyAgentHandlers';
import { createVisualNovelAgentHandlers } from './visualNovelAgentHandlers';
import { createMediaAgentHandlers } from './mediaAgentHandlers';
import { createAnimeAgentHandlers } from './animeAgentHandlers';

export type AgentToolRegistryTranslate = (key: string, vars?: TVars) => string;

export type AgentToolUnavailableReason =
  | 'adapter-not-implemented'
  | 'dedicated-analysis-required'
  | 'false-success-stub-removed';

export type AgentToolCapability =
  | { definition: AgentToolOperationDefinition; available: true }
  | {
      definition: AgentToolOperationDefinition;
      available: false;
      reason: AgentToolUnavailableReason;
    };

const UNAVAILABLE: Readonly<Partial<Record<AgentToolOperationId, AgentToolUnavailableReason>>> = {
  'flashcard.schedule-reviews': 'false-success-stub-removed',
  'dictionary.explain-grammar': 'dedicated-analysis-required',
  'dictionary.analyze-sentence': 'dedicated-analysis-required',
};

function textArgument(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = arguments_[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(t('blanc.agent.error.needsArgument', { name }));
  }
  return value.trim().slice(0, 500);
}

function safeCardPatch(t: AgentToolRegistryTranslate, value: unknown): Partial<DeckFlashcard> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(t('blanc.agent.error.cardPatchObject'));
  }
  const raw = value as Record<string, unknown>;
  const patch: Partial<DeckFlashcard> = {};
  for (const key of [
    'word',
    'reading',
    'meaning',
    'sentence',
    'front',
    'back',
    'folder',
    'jlptLevel',
    'sceneReference',
  ]) {
    if (typeof raw[key] === 'string') patch[key as keyof DeckFlashcard] = raw[key] as never;
  }
  return patch;
}

function safeCalendarEntry(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
): Omit<CalendarEvent, 'id' | 'createdAt'> {
  const date = textArgument(t, arguments_, 'date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(t('blanc.agent.error.calendarDate'));
  }
  return {
    title: textArgument(t, arguments_, 'title'),
    description: typeof arguments_.description === 'string'
      ? arguments_.description.slice(0, 500)
      : undefined,
    date,
    startTime: typeof arguments_.startTime === 'string' ? arguments_.startTime.slice(0, 5) : undefined,
    endTime: typeof arguments_.endTime === 'string' ? arguments_.endTime.slice(0, 5) : undefined,
    allDay: arguments_.allDay === true,
    color: typeof arguments_.color === 'string' ? arguments_.color.slice(0, 20) : '#6c7bff',
    category: arguments_.category === 'reminder' ? 'reminder' : 'study',
    reminder: 'none',
    recurrence: 'none',
  };
}

/**
 * The one installed adapter map for both Blanc and the first-class Agent.
 * Authorization remains in `runAgentTaskStep`; this module only answers the
 * separate question "does a real adapter exist?".
 */
export function createCentralAgentToolRegistry(t: AgentToolRegistryTranslate): AgentToolHandlers {
  const handlers: AgentToolHandlers = {
    ...createStudyAgentHandlers(),
    ...createVisualNovelAgentHandlers(t),
    ...createMediaAgentHandlers(t),
    ...createAnimeAgentHandlers(t),
    'dictionary.lookup': async (arguments_) => (
      window.api.lookupTerm(textArgument(t, arguments_, 'term'))
    ),
    'dictionary.search-knowledge': async (arguments_) => {
      const query = textArgument(t, arguments_, 'query');
      const [deck, media, library] = await Promise.all([
        Promise.resolve(loadDeck()),
        window.api.listMedia(),
        window.api.listLibrary(),
      ]);
      const snapshot = buildLocalAgentKnowledgeSnapshot({
        deck,
        media,
        library,
        calendar: loadEvents(),
        memory: loadLocalAgentMemory(),
      });
      return searchAgentKnowledge(snapshot, query, {
        limit: typeof arguments_.limit === 'number' ? arguments_.limit : 20,
      });
    },
    'flashcard.list-decks': () => ({ folders: loadDeckFolders(), cards: loadDeck().length }),
    'flashcard.create-deck': (arguments_) => ({
      folders: createDeckFolder(textArgument(t, arguments_, 'name')),
    }),
    'flashcard.add-cards': (arguments_) => {
      if (!Array.isArray(arguments_.cards) || arguments_.cards.length < 1) {
        throw new Error(t('blanc.agent.error.needsCards'));
      }
      const cards = arguments_.cards.slice(0, 50).map((raw) => {
        if (!raw || typeof raw !== 'object') throw new Error(t('blanc.agent.error.cardObject'));
        const card = raw as Record<string, unknown>;
        return {
          word: textArgument(t, card, 'word'),
          reading: typeof card.reading === 'string' ? card.reading.slice(0, 200) : '',
          meaning: typeof card.meaning === 'string' ? card.meaning.slice(0, 500) : '',
          sentence: typeof card.sentence === 'string' ? card.sentence.slice(0, 500) : undefined,
          source: 'import' as const,
          folder: typeof card.folder === 'string' ? card.folder.slice(0, 120) : undefined,
        };
      });
      return { cards: addDeckCards(cards).length };
    },
    'flashcard.modify-cards': (arguments_) => ({
      cards: updateDeckCard(
        textArgument(t, arguments_, 'id'),
        safeCardPatch(t, arguments_.patch),
      ).length,
    }),
    'flashcard.delete-deck': (arguments_) => (
      deleteDeckFolder(textArgument(t, arguments_, 'name'))
    ),
    'calendar.list': () => ({ events: loadEvents().slice(0, 100) }),
    'calendar.schedule-session': (arguments_) => addEvent(safeCalendarEntry(t, arguments_)),
    'calendar.create-reminder': (arguments_) => addEvent({
      ...safeCalendarEntry(t, arguments_),
      category: 'reminder',
    }),
    'calendar.delete-event': (arguments_) => ({
      events: deleteEvent(textArgument(t, arguments_, 'id')),
    }),
    'settings.read': () => loadLocalAgentSettings(),
    'settings.change-preference': (arguments_) => {
      const key = textArgument(t, arguments_, 'key') as keyof LocalAgentSettings;
      const allowed: Array<keyof LocalAgentSettings> = [
        'enabled',
        'modelFileName',
        'modelMode',
        'contextSize',
        'memoryLimitMb',
        'resourceMode',
        'cpuLimitPct',
        'gpuLimitPct',
        'maxConcurrentTasks',
        'backgroundProcessing',
        'permission',
        'memoryEnabled',
        'privacyMode',
        'debugMode',
      ];
      if (!allowed.includes(key)) throw new Error(t('blanc.agent.error.preferenceLocked'));
      return saveLocalAgentSettings({ [key]: arguments_.value } as Partial<LocalAgentSettings>);
    },
    'settings.configure-module': (arguments_) => {
      const key = textArgument(t, arguments_, 'key') as keyof LocalAgentSettings;
      if (!['enabled', 'memoryEnabled', 'privacyMode', 'debugMode'].includes(key)) {
        throw new Error(t('blanc.agent.error.moduleLocked'));
      }
      return saveLocalAgentSettings({ [key]: arguments_.value } as Partial<LocalAgentSettings>);
    },
    'settings.reset': () => saveLocalAgentSettings(DEFAULT_LOCAL_AGENT_SETTINGS),
    'settings.preview-theme': (arguments_) => {
      const current = loadToolboxSettings();
      const preset = typeof arguments_.preset === 'string' && presetById(arguments_.preset)
        ? arguments_.preset
        : current.themePreset;
      const overrides = sanitizeThemeOverrides(arguments_.overrides);
      applyBlancTheme(preset, overrides);
      return { preview: true, preset, overrides };
    },
    'settings.apply-theme': (arguments_) => {
      const current = loadToolboxSettings();
      const preset = typeof arguments_.preset === 'string' && presetById(arguments_.preset)
        ? arguments_.preset
        : current.themePreset;
      const overrides = sanitizeThemeOverrides(arguments_.overrides);
      recordBlancThemeHistory(current);
      const next = saveToolboxSettings({ themePreset: preset, themeOverrides: overrides });
      applyBlancTheme(next.themePreset, next.themeOverrides);
      return { applied: true, preset: next.themePreset, overrides: next.themeOverrides };
    },
    'settings.reset-theme': () => {
      recordBlancThemeHistory(loadToolboxSettings());
      const next = saveToolboxSettings({ themePreset: 'default', themeOverrides: {} });
      applyBlancTheme(next.themePreset, next.themeOverrides);
      return { reset: true };
    },
    'settings.undo-theme': () => {
      const previous = undoBlancThemeHistory();
      if (!previous) throw new Error(t('blanc.agent.error.noThemeHistory'));
      const next = saveToolboxSettings({
        themePreset: previous.preset,
        themeOverrides: previous.overrides,
      });
      applyBlancTheme(next.themePreset, next.themeOverrides);
      return { restored: true, preset: next.themePreset, overrides: next.themeOverrides };
    },
    'settings.preview-css': (arguments_) => {
      const css = sanitizeCustomCss(arguments_.css);
      applyBlancCustomCss(css);
      return { preview: true, characters: css.length };
    },
    'settings.apply-css': (arguments_) => {
      const css = sanitizeCustomCss(arguments_.css);
      const next = saveToolboxSettings({ customCss: css });
      applyBlancCustomCss(next.customCss);
      return { applied: true, characters: next.customCss.length };
    },
    'settings.reset-css': () => {
      const next = saveToolboxSettings({ customCss: '' });
      applyBlancCustomCss(next.customCss);
      return { reset: true };
    },
    'media.search': async (arguments_) => {
      const query = typeof arguments_.query === 'string'
        ? arguments_.query.toLocaleLowerCase().trim()
        : '';
      const items = await window.api.listMedia();
      return items.filter((item) => (
        !query || `${item.title} ${item.path}`.toLocaleLowerCase().includes(query)
      )).slice(0, 100);
    },
    'media.add-item': async (arguments_) => {
      if (!Array.isArray(arguments_.paths) || !arguments_.paths.length) {
        throw new Error(t('blanc.agent.error.needsPaths'));
      }
      const paths = arguments_.paths
        .filter((value): value is string => typeof value === 'string')
        .slice(0, 20);
      if (!paths.length) throw new Error(t('blanc.agent.error.noValidPaths'));
      return window.api.importPaths(paths);
    },
    'media.delete-item': (arguments_) => (
      window.api.removeMedia(textArgument(t, arguments_, 'id'))
    ),
  };
  return handlers;
}

export function agentToolCapabilityMatrix(
  handlers: AgentToolHandlers,
): AgentToolCapability[] {
  return AGENT_TOOL_OPERATIONS.map((definition) => {
    if (handlers[definition.id]) return { definition, available: true };
    const reason = UNAVAILABLE[definition.id];
    if (!reason) {
      throw new Error(`Agent operation ${definition.id} is neither installed nor classified.`);
    }
    return { definition, available: false, reason };
  });
}

export function availableAgentToolOperationIds(
  handlers: AgentToolHandlers,
): AgentToolOperationId[] {
  return agentToolCapabilityMatrix(handlers)
    .filter((entry): entry is Extract<AgentToolCapability, { available: true }> => entry.available)
    .map((entry) => entry.definition.id);
}
