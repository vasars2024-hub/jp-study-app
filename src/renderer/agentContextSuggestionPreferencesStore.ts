import {
  DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
  normalizeAgentContextSuggestionPreferences,
  type AgentContextSuggestionPreferences,
} from '../shared/agentContextSuggestions';
import {
  AGENT_SUGGESTIONS_CHANGED_EVENT,
  getAgentContextSuggestionPreferencesSnapshot,
  setAgentContextSuggestionPreferencesSnapshot,
} from './agentOperationalClient';

export function loadAgentContextSuggestionPreferences(): AgentContextSuggestionPreferences {
  return getAgentContextSuggestionPreferencesSnapshot();
}

export function saveAgentContextSuggestionPreferences(
  patch: Partial<AgentContextSuggestionPreferences>,
): AgentContextSuggestionPreferences {
  const current = loadAgentContextSuggestionPreferences();
  return setAgentContextSuggestionPreferencesSnapshot(normalizeAgentContextSuggestionPreferences({
    ...current,
    ...patch,
    sources: patch.sources ? { ...current.sources, ...patch.sources } : current.sources,
  }));
}

export function resetAgentContextSuggestionPreferences(): AgentContextSuggestionPreferences {
  return setAgentContextSuggestionPreferencesSnapshot(
    normalizeAgentContextSuggestionPreferences(DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES),
  );
}

export function onAgentContextSuggestionPreferencesChanged(
  listener: (preferences: AgentContextSuggestionPreferences) => void,
): () => void {
  const handler = (event: Event): void => {
    listener(normalizeAgentContextSuggestionPreferences(
      (event as CustomEvent<AgentContextSuggestionPreferences>).detail,
    ));
  };
  window.addEventListener(AGENT_SUGGESTIONS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(AGENT_SUGGESTIONS_CHANGED_EVENT, handler);
}
