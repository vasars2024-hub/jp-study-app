// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
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
    // The strip reports the language it will explain in; it no longer OFFERS a
    // choice, which is a preference and lives in the settings panel below.
    expect(html).toContain('Explained in English');
    expect(html).not.toContain('<select');
    expect(html).toContain('猫');
    expect(html).not.toContain('agent.suggestions.');
  });

  /**
   * The preference is what the prompt is actually built from, so an override
   * that the strip merely DISPLAYS while still generating English would read
   * exactly like a working setting. Assert the generated prompt, not the label.
   */
  it('builds the prompt in the preferred explanation language, not the interface one', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let used: string | null = null;
    act(() => {
      root.render(createElement(AgentContextSuggestions, {
        conversation,
        preferences: {
          ...DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
          explanationLanguage: 'ja',
        },
        onUse: (text: string) => { used = text; },
      }));
    });
    expect(host.querySelector('.agent-context-suggestion-language')?.textContent)
      .toContain('日本語');
    expect(host.querySelector('.agent-context-suggestion-language')?.getAttribute('lang'))
      .toBe('ja');

    const button = host.querySelector('button.agent-context-suggestion') as HTMLButtonElement;
    act(() => { button.click(); });
    // Asserted on the CONTRACT SENTENCE, not on the word: the dictionary
    // contract this prompt always carries names Japanese, Chinese and Russian in
    // its own text, so a bare `toContain('Japanese')` would pass with the
    // preference ignored entirely. The interface language here is English, so
    // the English form of the same sentence is the negative half.
    expect(used).not.toBeNull();
    expect(used!).toContain('Write the complete explanation in 日本語');
    expect(used!).not.toContain('Write the complete explanation in English');

    act(() => root.unmount());
    host.remove();
  });

  it('renders nothing when the global preference is off', () => {
    const html = renderToStaticMarkup(createElement(AgentContextSuggestions, {
      conversation,
      preferences: { ...DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES, enabled: false },
      onUse: () => undefined,
    }));
    expect(html).toBe('');
  });

  it('renders a batch action only when multiple dictionary entries are attached', () => {
    const html = renderToStaticMarkup(createElement(AgentContextSuggestions, {
      conversation: {
        ...conversation,
        context: [
          conversation.context[0],
          { ...conversation.context[0], id: 'dictionary:犬', label: '犬', createdAt: 2 },
        ],
      },
      preferences: DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
      onUse: () => undefined,
    }));
    expect(html).toContain('Explain 2 entries');
    expect(html).toContain('犬, 猫');
  });

  /**
   * The strip is N instances of one kind of thing and N grows with the context
   * the conversation carries, so it is a LIST. Two things ride on the markup
   * saying so: a screen reader announces the group and its size, and category 5
   * question 4's clutter census reads repeated instances of one kind as a group
   * rather than as N separate things to scan — which is what keeps the default
   * view under its bar as context accumulates instead of only at two.
   *
   * Asserted over the parsed DOM and by COUNT, not by a substring: a `<ul>` whose
   * buttons sat beside the `<li>`s rather than inside them would contain every
   * tag name this test could name.
   */
  it('marks the suggestions up as a real list, one li per action', () => {
    const html = renderToStaticMarkup(createElement(AgentContextSuggestions, {
      conversation: {
        ...conversation,
        context: [
          conversation.context[0],
          { ...conversation.context[0], id: 'dictionary:犬', label: '犬', createdAt: 2 },
        ],
      },
      preferences: DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
      onUse: () => undefined,
    }));
    const host = document.createElement('div');
    host.innerHTML = html;
    const list = host.querySelector('ul.agent-context-suggestion-list');
    expect(list).toBeTruthy();
    const actions = Array.from(host.querySelectorAll('button.agent-context-suggestion'));
    expect(actions.length).toBeGreaterThan(1);
    expect(list!.querySelectorAll(':scope > li').length).toBe(actions.length);
    expect(actions.every((button) => button.parentElement?.tagName === 'LI')).toBe(true);
  });

  it('ships component and settings strings in all UI languages', () => {
    const keys = [
      'agent.suggestions.title',
      'agent.suggestions.explanationLanguageValue',
      'blanc.agent.suggestions.explanationLanguage',
      'blanc.agent.suggestions.explanationLanguage.ui',
      'agent.suggestions.action.dictionaryBatch',
      'agent.suggestions.prompt.dictionaryBatch',
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
    // Seven now: the six sources plus the explanation-language select, which the
    // global switch disables for the same reason the sources are disabled.
    expect((html.match(/disabled=""/g) ?? [])).toHaveLength(7);
    expect(html).toContain('Dictionary');
    expect(html).toContain('Reading Lens');
    expect(html).toContain('Settings');
    expect(html).toContain('Follow the interface language');
    expect((html.match(/<option /g) ?? [])).toHaveLength(5);
  });
});
