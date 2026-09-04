import { useEffect, useMemo, useState } from 'react';
import {
  agentContextSuggestionPrompt,
  agentContextBatchSuggestionPrompt,
  deriveAgentContextSuggestions,
  deriveAgentContextBatchSuggestion,
  normalizeAgentContextSuggestionPreferences,
  resolveAgentContextSuggestionExplanationLanguage,
  type AgentContextSuggestionPreferences,
  type AgentContextSuggestionSource,
} from '../../../shared/agentContextSuggestions';
import type { AgentConversation } from '../../../shared/agentWorkspace';
import { LANG_LABELS, LANG_TAGS } from '../../../shared/i18n/core';
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
  const { t, lang } = useT();
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
  const batchSuggestion = useMemo(() => (
    conversation
      ? deriveAgentContextBatchSuggestion(conversation, preferences ?? livePreferences)
      : null
  ), [conversation, livePreferences, preferences]);
  const explanationLanguage = resolveAgentContextSuggestionExplanationLanguage(
    normalizeAgentContextSuggestionPreferences(preferences ?? livePreferences).explanationLanguage,
    lang,
  );

  if (suggestions.length === 0) return null;

  return (
    <section className="agent-context-suggestions" aria-labelledby="agent-context-suggestions-title">
      {/*
        The explanation language used to be a select sitting in this heading,
        seeded from the interface language and forgotten on every remount. It is
        a preference, not a per-strip control, so it lives with the rest of the
        suggestion preferences in `AgentContextSuggestionSettings` and persists.
        What the strip shows instead is the language it is CURRENTLY going to
        explain in — state, where a knob used to be.
      */}
      <div className="agent-context-suggestions-heading">
        <span id="agent-context-suggestions-title">{t('agent.suggestions.title')}</span>
        <span className="agent-context-suggestion-language" lang={LANG_TAGS[explanationLanguage]}>
          {t('agent.suggestions.explanationLanguageValue', {
            language: LANG_LABELS[explanationLanguage],
          })}
        </span>
      </div>
      {/*
        A real list, not a div of buttons. These are N instances of one kind of
        thing and N grows with how much context the conversation carries, so the
        markup that says so is both the correct semantics (a screen reader
        announces the group and its size) and what keeps the strip from reading
        as N separate things to scan as context accumulates.
      */}
      <ul className="agent-context-suggestion-list lq-hit-scope">
        {batchSuggestion ? (
          <li key={batchSuggestion.id}>
            <button
              type="button"
              className="agent-context-suggestion"
              title={t('agent.suggestions.useTitle', {
                action: t('agent.suggestions.action.dictionaryBatch', {
                  count: batchSuggestion.contextIds.length,
                }),
                context: batchSuggestion.contextLabels.join(', '),
              })}
              onClick={() => onUse(agentContextBatchSuggestionPrompt(
                batchSuggestion,
                t('agent.suggestions.prompt.dictionaryBatch', {
                  count: batchSuggestion.contextIds.length,
                }),
                explanationLanguage,
              ))}
            >
              <span>{t('agent.suggestions.action.dictionaryBatch', {
                count: batchSuggestion.contextIds.length,
              })}</span>
              <small>{batchSuggestion.contextLabels.join(', ')}</small>
            </button>
          </li>
        ) : null}
        {suggestions.map((suggestion) => {
          const action = t(ACTION_KEYS[suggestion.source]);
          return (
            <li key={suggestion.id}>
              <button
                type="button"
                className="agent-context-suggestion"
                title={t('agent.suggestions.useTitle', { action, context: suggestion.contextLabel })}
                onClick={() => onUse(agentContextSuggestionPrompt(
                  suggestion,
                  t(PROMPT_KEYS[suggestion.source], { context: suggestion.contextLabel }),
                  explanationLanguage,
                ))}
              >
                <span>{action}</span>
                <small>{suggestion.contextLabel}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
