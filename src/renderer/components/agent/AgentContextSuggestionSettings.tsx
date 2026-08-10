import { useEffect, useState } from 'react';
import {
  AGENT_CONTEXT_SUGGESTION_SOURCES,
  type AgentContextSuggestionPreferences,
  type AgentContextSuggestionSource,
} from '../../../shared/agentContextSuggestions';
import {
  loadAgentContextSuggestionPreferences,
  onAgentContextSuggestionPreferencesChanged,
  saveAgentContextSuggestionPreferences,
} from '../../agentContextSuggestionPreferencesStore';
import { useT } from '../../i18n';
import './agentContextSuggestions.css';

export interface AgentContextSuggestionSettingsProps {
  preferences?: AgentContextSuggestionPreferences;
  onChange?(preferences: AgentContextSuggestionPreferences): void;
}

export function AgentContextSuggestionSettings({
  preferences,
  onChange,
}: AgentContextSuggestionSettingsProps) {
  const { t } = useT();
  const [live, setLive] = useState(loadAgentContextSuggestionPreferences);
  const current = preferences ?? live;

  useEffect(() => {
    if (preferences) return undefined;
    setLive(loadAgentContextSuggestionPreferences());
    return onAgentContextSuggestionPreferencesChanged(setLive);
  }, [preferences]);

  const commit = (patch: Partial<AgentContextSuggestionPreferences>): void => {
    const next = saveAgentContextSuggestionPreferences({
      ...patch,
      ...(patch.sources ? { sources: { ...current.sources, ...patch.sources } } : {}),
    });
    setLive(next);
    onChange?.(next);
  };

  const updateSource = (source: AgentContextSuggestionSource, enabled: boolean): void => {
    commit({ sources: { ...current.sources, [source]: enabled } });
  };

  return (
    <section
      className="agent-context-suggestion-settings"
      aria-labelledby="agent-context-suggestion-settings-title"
    >
      <div className="agent-context-suggestion-settings-copy">
        <span id="agent-context-suggestion-settings-title">
          {t('blanc.agent.suggestions.groupLabel')}
        </span>
        <small>{t('blanc.agent.suggestions.description')}</small>
      </div>
      <div className="agent-context-suggestion-settings-grid">
        <label>
          <span>{t('blanc.agent.suggestions.enabled')}</span>
          <input
            type="checkbox"
            checked={current.enabled}
            onChange={(event) => commit({ enabled: event.currentTarget.checked })}
          />
        </label>
        {AGENT_CONTEXT_SUGGESTION_SOURCES.map((source) => (
          <label key={source}>
            <span>{t(`blanc.agent.suggestions.source.${source}`)}</span>
            <input
              type="checkbox"
              checked={current.sources[source]}
              disabled={!current.enabled}
              onChange={(event) => updateSource(source, event.currentTarget.checked)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
