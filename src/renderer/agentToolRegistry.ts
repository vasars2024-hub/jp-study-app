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
import { mineAgentCards } from './studyMiningRoutes';
import {
  createDeckFolder,
  deleteDeckFolder,
  dueDeckCards,
  knowledgeLemma,
  loadDeck,
  loadDeckFolders,
  removeDeckCards,
  updateDeckCard,
  type DeckFlashcard,
} from './flashcardDeck';
import {
  addEvent,
  deleteEvent,
  loadEvents,
  REMINDER_OFFSETS,
  type CalendarEvent,
  type ReminderOffset,
} from './calendar';
import { getSummary } from './stats';
import { getLevel, knowledgeCounts, WK_LEVELS } from './knownWords';
import { buildLocalAgentKnowledgeSnapshot } from './localAgentKnowledge';
import { applyBlancTheme } from './blancThemeApply';
import { applyBlancCustomCss } from './blancCustomCssApply';
import { loadToolboxSettings, saveToolboxSettings } from './toolboxSettings';
import { recordBlancThemeHistory, undoBlancThemeHistory } from './blancThemeHistoryStore';
import { createStudyAgentHandlers } from './studyAgentHandlers';
import { createVisualNovelAgentHandlers } from './visualNovelAgentHandlers';
import { createMediaAgentHandlers } from './mediaAgentHandlers';
import { createAnimeAgentHandlers } from './animeAgentHandlers';
import { createCardStudioAgentHandlers } from './cardStudioAgentHandlers';

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

/**
 * The reminder offset an agent asked for. A reminder that never notifies is
 * not a reminder, so `calendar.create-reminder` defaults to "at the time";
 * a study session defaults to no notification, as the Calendar's own form does.
 */
export function agentReminderOffset(value: unknown, fallback: ReminderOffset): ReminderOffset {
  return typeof value === 'string' && (REMINDER_OFFSETS as readonly string[]).includes(value)
    ? (value as ReminderOffset)
    : fallback;
}

function safeCalendarEntry(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  defaultReminder: ReminderOffset = 'none',
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
    reminder: agentReminderOffset(arguments_.reminder, defaultReminder),
    recurrence: 'none',
  };
}

/** Compact, read-only study statistics for the agent (no per-book titles beyond the top five). */
function agentStatsSummary(): Record<string, unknown> {
  const summary = getSummary();
  const counts = knowledgeCounts();
  return {
    streak: summary.streak,
    daysActive: summary.daysActive,
    today: {
      readingMinutes: Math.round(summary.todaySeconds / 60),
      charactersRead: summary.todayChars,
      watchMinutes: Math.round(summary.todayWatchSeconds / 60),
      studyMinutes: Math.round(summary.todayStudySeconds / 60),
      reviews: summary.todayReviews,
    },
    total: {
      readingMinutes: Math.round(summary.totalSeconds / 60),
      charactersRead: summary.totalChars,
      watchMinutes: Math.round(summary.totalWatchSeconds / 60),
      studyMinutes: Math.round(summary.totalStudySeconds / 60),
      reviews: summary.totalReviews,
      retention: summary.totalReviews > 0 ? Math.round((summary.totalReviewsPassed / summary.totalReviews) * 100) / 100 : null,
    },
    knownWords: { learning: counts[1], familiar: counts[2], known: counts[3] },
    cardsDue: dueDeckCards(loadDeck()).length,
    lastTwoWeeks: summary.recent.map((day) => ({
      date: day.date,
      readingMinutes: Math.round(day.seconds / 60),
      reviews: day.reviews,
    })),
    recentBooks: summary.books.slice(0, 5).map((book) => ({ title: book.title, charactersRead: book.chars })),
  };
}

/** Known-word counts, or one word's level (looked up by lemma, as the reader does). */
function agentKnownWords(arguments_: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const counts = knowledgeCounts();
  const base = { counts: { learning: counts[1], familiar: counts[2], known: counts[3] } };
  const raw = typeof arguments_.word === 'string' ? arguments_.word.trim().slice(0, 40) : '';
  if (!raw) return base;
  const lemma = knowledgeLemma(raw);
  const level = Math.max(getLevel(raw), getLevel(lemma));
  return { ...base, word: raw, lemma, level, levelName: WK_LEVELS[level] };
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
    ...createCardStudioAgentHandlers(t),
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
    'flashcard.create-deck': (arguments_) => {
      const name = textArgument(t, arguments_, 'name');
      const existed = loadDeckFolders().includes(name);
      const folders = createDeckFolder(name);
      return {
        folders,
        ...(!existed && folders.includes(name) ? { createdName: name } : {}),
      };
    },
    'flashcard.add-cards': async (arguments_) => {
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
          folder: typeof card.folder === 'string' ? card.folder.slice(0, 120) : undefined,
        };
      });
      // Through mineToStudy: a card the deck already holds is found, not doubled,
      // and only the rows this call actually made are reported as created.
      const mined = await mineAgentCards(cards);
      return {
        cards: loadDeck().length,
        createdIds: mined.filter((result) => result.created).map((result) => result.card.id),
      };
    },
    'flashcard.delete-cards': (arguments_) => {
      if (!Array.isArray(arguments_.ids)) {
        throw new Error(t('blanc.agent.error.needsArgument', { name: 'ids' }));
      }
      const ids = [...new Set(arguments_.ids
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map((value) => value.trim()))].slice(0, 50);
      if (!ids.length) throw new Error(t('blanc.agent.error.needsArgument', { name: 'ids' }));
      const before = loadDeck();
      const existing = new Set(before.map((card) => card.id));
      if (ids.some((id) => !existing.has(id))) {
        throw new Error(t('blanc.agent.error.cardNotFound'));
      }
      return { cards: removeDeckCards(ids).length, removed: ids.length };
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
      ...safeCalendarEntry(t, arguments_, 'at'),
      category: 'reminder',
    }),
    'study.stats-summary': () => agentStatsSummary(),
    'study.known-words': (arguments_) => agentKnownWords(arguments_),
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
