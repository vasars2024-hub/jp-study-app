import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES,
  deriveAgentContextSuggestions,
  normalizeAgentContextSuggestionPreferences,
} from '../agentContextSuggestions';
import {
  adoptLegacyAgentOperationalState,
  normalizeAgentOperationalState,
} from '../agentOperationalState';
import type { AgentContextItem, AgentConversation } from '../agentWorkspace';
import type { AgentTask } from '../localAgent';

const context = (
  id: string,
  kind: AgentContextItem['kind'],
  app: string,
): AgentContextItem => ({
  id,
  kind,
  label: id,
  preview: '',
  source: { app },
  sensitivity: kind === 'dictionary-entry' ? 'ordinary' : 'personal',
  retained: false,
  createdAt: 1,
});

const conversation = (items: AgentContextItem[]): AgentConversation => ({
  id: 'chat',
  title: 'Chat',
  mode: 'ask',
  createdAt: 1,
  updatedAt: 1,
  pinned: false,
  archived: false,
  context: items,
  messages: [],
});

describe('Agent context suggestions', () => {
  it('normalizes legacy and malformed preferences to bounded source defaults', () => {
    expect(normalizeAgentContextSuggestionPreferences(undefined))
      .toEqual(DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES);
    expect(normalizeAgentContextSuggestionPreferences({
      enabled: false,
      sources: { dictionary: false, media: 'false', unknown: false },
    })).toMatchObject({
      version: 1,
      enabled: false,
      sources: { dictionary: false, media: true, reading: true },
    });
  });

  it('uses attached context only, honors source preferences, deduplicates, and caps chips', () => {
    const preferences = normalizeAgentContextSuggestionPreferences({
      sources: { media: false },
    });
    const result = deriveAgentContextSuggestions(conversation([
      context('lens', 'selected-text', 'Reading Lens'),
      context('dictionary-new', 'dictionary-entry', 'Dictionary'),
      context('dictionary-old', 'dictionary-entry', 'Dictionary'),
      context('media', 'media-cue', 'Media'),
      context('deck', 'saved-words', 'Flashcards'),
      context('settings', 'route', 'Settings'),
    ]), preferences);

    expect(result.map(({ source, contextId }) => [source, contextId])).toEqual([
      ['reading-lens', 'lens'],
      ['dictionary', 'dictionary-new'],
      ['flashcards', 'deck'],
    ]);
  });

  it('preserves both an active execution claim and suggestions through operational normalization', () => {
    const task: AgentTask = {
      id: 'task', objective: 'test', status: 'running', createdAt: 1, updatedAt: 1, steps: [],
    };
    const state = normalizeAgentOperationalState({
      version: 1,
      queue: {
        version: 1,
        items: [{
          id: 'task',
          task,
          status: 'paused',
          priority: 0,
          createdAt: 1,
          updatedAt: 2,
          execution: {
            version: 1,
            stepId: 'step',
            callId: 'call',
            action: 'run-next',
            previousStatus: 'queued',
            startedAt: 2,
            expiresAt: 20,
          },
        }],
      },
      memory: { version: 1, entries: [] },
      automations: [],
      suggestions: { version: 1, enabled: false, sources: { dictionary: false } },
      legacyMigratedAt: null,
    });

    expect(state.queue.items[0].execution).toMatchObject({ stepId: 'step', callId: 'call' });
    expect(state.suggestions).toMatchObject({
      enabled: false,
      sources: { dictionary: false, media: true },
    });

    const migrated = adoptLegacyAgentOperationalState(state, {}, 50);
    expect(migrated.suggestions).toEqual(state.suggestions);
    expect(migrated.queue.items[0].execution).toEqual(state.queue.items[0].execution);
  });
});
