// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AgentConversation } from '../../shared/agentWorkspace';
import {
  DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
} from '../../shared/agentContextSuggestions';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { AgentContextSuggestions } from '../components/agent/AgentContextSuggestions';
import { AgentContextSuggestionSettings } from '../components/agent/AgentContextSuggestionSettings';

const conversation: AgentConversation = {
  id: 'chat',
  title: 'Chat',
  mode: 'ask',
  createdAt: 1,
  updatedAt: 1,
  pinned: false,
  archived: false,
  context: [{
    id: 'dictionary:猫',
    kind: 'dictionary-entry',
    label: '猫',
    preview: 'ねこ',
    source: { app: 'Dictionary' },
    sensitivity: 'ordinary',
    retained: true,
    createdAt: 1,
  }],
  messages: [],
};

describe('AgentContextSuggestions', () => {
  it('renders an accessible inert button from attached context', () => {
    const html = renderToStaticMarkup(createElement(AgentContextSuggestions, {
      conversation,
      preferences: DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
      onUse: () => undefined,
    }));
    expect(html).toContain('aria-labelledby="agent-context-suggestions-title"');
    expect(html).toContain('Explain nuance');
    expect(html).toContain('Explanation language');
    expect(html).toContain('<option value="ru" lang="ru">Русский</option>');
    expect(html).toContain('猫');
    expect(html).not.toContain('agent.suggestions.');
  });

  it('renders nothing when the global preference is off', () => {
    const html = renderToStaticMarkup(createElement(AgentContextSuggestions, {
      conversation,
      preferences: { ...DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES, enabled: false },
      onUse: () => undefined,
    }));
    expect(html).toBe('');
  });

  it('ships component and settings strings in all UI languages', () => {
    const keys = [
      'agent.suggestions.title',
      'agent.suggestions.explanationLanguage',
      'agent.suggestions.prompt.dictionary',
      'agent.suggestions.action.readingLens',
      'blanc.agent.suggestions.description',
      'blanc.agent.suggestions.source.reading-lens',
      'blanc.agent.suggestions.source.settings',
    ];
    for (const [language, catalog] of Object.entries(CATALOGS)) {
      for (const key of keys) expect(catalog[key], `${language}: ${key}`).toBeTruthy();
    }
  });

  it('renders the global switch and all per-surface settings accessibly', () => {
    const html = renderToStaticMarkup(createElement(AgentContextSuggestionSettings, {
      preferences: { ...DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES, enabled: false },
    }));
    expect(html).toContain('aria-labelledby="agent-context-suggestion-settings-title"');
    expect((html.match(/type="checkbox"/g) ?? [])).toHaveLength(7);
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(6);
    expect(html).toContain('Dictionary');
    expect(html).toContain('Reading Lens');
    expect(html).toContain('Settings');
  });
});
