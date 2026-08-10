import type {
  AgentContextItem,
  AgentConversation,
} from './agentWorkspace';

export const AGENT_CONTEXT_SUGGESTION_PREFERENCES_VERSION = 1 as const;

export const AGENT_CONTEXT_SUGGESTION_SOURCES = [
  'dictionary',
  'reading',
  'reading-lens',
  'media',
  'flashcards',
  'settings',
] as const;

export type AgentContextSuggestionSource =
  (typeof AGENT_CONTEXT_SUGGESTION_SOURCES)[number];

export interface AgentContextSuggestionPreferences {
  version: typeof AGENT_CONTEXT_SUGGESTION_PREFERENCES_VERSION;
  enabled: boolean;
  sources: Record<AgentContextSuggestionSource, boolean>;
}

export const DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES: AgentContextSuggestionPreferences = {
  version: AGENT_CONTEXT_SUGGESTION_PREFERENCES_VERSION,
  enabled: true,
  sources: {
    dictionary: true,
    reading: true,
    'reading-lens': true,
    media: true,
    flashcards: true,
    settings: true,
  },
};

export function normalizeAgentContextSuggestionPreferences(
  input: unknown,
): AgentContextSuggestionPreferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ...DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
      sources: { ...DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES.sources },
    };
  }
  const raw = input as {
    enabled?: unknown;
    sources?: unknown;
  };
  const sourceInput = raw.sources && typeof raw.sources === 'object' && !Array.isArray(raw.sources)
    ? raw.sources as Record<string, unknown>
    : {};
  const sources = Object.fromEntries(AGENT_CONTEXT_SUGGESTION_SOURCES.map((source) => [
    source,
    sourceInput[source] !== false,
  ])) as Record<AgentContextSuggestionSource, boolean>;
  return {
    version: AGENT_CONTEXT_SUGGESTION_PREFERENCES_VERSION,
    enabled: raw.enabled !== false,
    sources,
  };
}

function sourceText(item: AgentContextItem): string {
  return `${item.source.app} ${item.source.route ?? ''}`.toLocaleLowerCase();
}

/** Maps only context already attached to the conversation; no ambient app state is read. */
export function agentContextSuggestionSource(
  item: AgentContextItem,
): AgentContextSuggestionSource | null {
  const source = sourceText(item);
  if (source.includes('reading-lens') || source.includes('reading lens') || source.includes('lens')) {
    return 'reading-lens';
  }
  if (source.includes('settings') || source.includes('setting')) return 'settings';
  if (item.kind === 'dictionary-entry' || source.includes('dictionary')) return 'dictionary';
  if (item.kind === 'media-cue' || source.includes('media') || source.includes('anime')) return 'media';
  if (
    item.kind === 'study-session'
    || item.kind === 'saved-words'
    || source.includes('flashcard')
    || source.includes('deck')
  ) return 'flashcards';
  if (
    item.kind === 'reading-passage'
    || item.kind === 'selected-text'
    || source.includes('reader')
    || source.includes('reading')
  ) return 'reading';
  return null;
}

export interface AgentContextSuggestion {
  id: string;
  contextId: string;
  source: AgentContextSuggestionSource;
  contextLabel: string;
}

export const AGENT_CONTEXT_SUGGESTION_LIMIT = 3;

/**
 * Returns at most one suggestion per source, in shelf order. Suggestions are
 * inert composer text: deriving them never calls a tool or changes state.
 */
export function deriveAgentContextSuggestions(
  conversation: AgentConversation,
  preferences: AgentContextSuggestionPreferences,
): AgentContextSuggestion[] {
  const normalized = normalizeAgentContextSuggestionPreferences(preferences);
  if (!normalized.enabled) return [];
  const seen = new Set<AgentContextSuggestionSource>();
  const suggestions: AgentContextSuggestion[] = [];
  for (const item of conversation.context) {
    const source = agentContextSuggestionSource(item);
    if (!source || seen.has(source) || !normalized.sources[source]) continue;
    seen.add(source);
    suggestions.push({
      id: `context-suggestion:${source}:${item.id}`,
      contextId: item.id,
      source,
      contextLabel: item.label,
    });
    if (suggestions.length === AGENT_CONTEXT_SUGGESTION_LIMIT) break;
  }
  return suggestions;
}
