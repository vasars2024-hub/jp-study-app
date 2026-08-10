import { useEffect, useMemo, useState } from 'react';
import {
  deriveAgentContextSuggestions,
  type AgentContextSuggestionPreferences,
  type AgentContextSuggestionSource,
} from '../../../shared/agentContextSuggestions';
import type { AgentConversation } from '../../../shared/agentWorkspace';
import {
  loadAgentContextSuggestionPreferences,
  onAgentContextSuggestionPreferencesChanged,
} from '../../agentContextSuggestionPreferencesStore';
import { useT } from '../../i18n';
import './agentContextSuggestions.css';

const ACTION_KEYS: Record<AgentContextSuggestionSource, string> = {
  dictionary: 'agent.suggestions.action.dictionary',
  reading: 'agent.suggestions.action.reading',
  'reading-lens': 'agent.suggestions.action.readingLens',
  media: 'agent.suggestions.action.media',
  flashcards: 'agent.suggestions.action.flashcards',
  settings: 'agent.suggestions.action.settings',
};

const PROMPT_KEYS: Record<AgentContextSuggestionSource, string> = {
  dictionary: 'agent.suggestions.prompt.dictionary',
  reading: 'agent.suggestions.prompt.reading',
  'reading-lens': 'agent.suggestions.prompt.readingLens',
  media: 'agent.suggestions.prompt.media',
  flashcards: 'agent.suggestions.prompt.flashcards',
  settings: 'agent.suggestions.prompt.settings',
};

export interface AgentContextSuggestionsProps {
  conversation: AgentConversation | null;
  onUse(text: string): void;
  /** Optional snapshot for tests or an embedding that already owns preferences. */
  preferences?: AgentContextSuggestionPreferences;
}

export function AgentContextSuggestions({
  conversation,
  onUse,
  preferences,
}: AgentContextSuggestionsProps) {
  const { t } = useT();
  const [livePreferences, setLivePreferences] = useState(
    loadAgentContextSuggestionPreferences,
  );

  useEffect(() => {
    if (preferences) return undefined;
    setLivePreferences(loadAgentContextSuggestionPreferences());
    return onAgentContextSuggestionPreferencesChanged(setLivePreferences);
  }, [preferences]);

  const suggestions = useMemo(() => (
    conversation
      ? deriveAgentContextSuggestions(conversation, preferences ?? livePreferences)
      : []
  ), [conversation, livePreferences, preferences]);

  if (suggestions.length === 0) return null;

  return (
    <section className="agent-context-suggestions" aria-labelledby="agent-context-suggestions-title">
      <div className="agent-context-suggestions-heading">
        <span id="agent-context-suggestions-title">{t('agent.suggestions.title')}</span>
        <span>{t('agent.suggestions.hint')}</span>
      </div>
      <div className="agent-context-suggestion-list">
        {suggestions.map((suggestion) => {
          const action = t(ACTION_KEYS[suggestion.source]);
          return (
            <button
              key={suggestion.id}
              type="button"
              className="agent-context-suggestion"
              title={t('agent.suggestions.useTitle', { action, context: suggestion.contextLabel })}
              onClick={() => onUse(t(PROMPT_KEYS[suggestion.source], {
                context: suggestion.contextLabel,
              }))}
            >
              <span>{action}</span>
              <small>{suggestion.contextLabel}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
