import { describe, expect, it } from 'vitest';
import {
  agentContextSuggestionPrompt,
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

  it('prefers new substantive context over older route chrome from the same source', () => {
    const route = { ...context('dictionary-route', 'route', 'Dictionary'), createdAt: 10 };
    const oldEntry = { ...context('old-word', 'dictionary-entry', 'Dictionary'), createdAt: 20 };
    const passage = { ...context('猫が来た。', 'reading-passage', 'Dictionary'), createdAt: 30 };

    expect(deriveAgentContextSuggestions(conversation([
      route,
      oldEntry,
      passage,
    ]), DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES)[0]).toMatchObject({
      source: 'dictionary',
      contextId: '猫が来た。',
      contextLabel: '猫が来た。',
    });
  });

  it('gives dictionary explanations a bounded evidence, grammar, usage, mistakes, etymology, mnemonic, collocation, and comparison contract', () => {
    const [suggestion] = deriveAgentContextSuggestions(conversation([
      context('dictionary-new', 'dictionary-entry', 'Dictionary'),
    ]), DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES);
    const prompt = agentContextSuggestionPrompt(suggestion, '  Explain 猫.  ');

    expect(prompt).toContain('Explain 猫.\n\nAnswer with these sections:');
    expect(prompt).toContain('In Grammar');
    expect(prompt).toContain('quote each form or span you analyze');
    expect(prompt).toContain('explain its role in this exact sentence');
    expect(prompt).toContain('Separate what the attached context demonstrates from general grammar rules.');
    expect(prompt).toContain('If more than one parse is plausible');
    expect(prompt).toContain('instead of silently choosing one');
    expect(prompt).toContain('Usage and register');
    expect(prompt).toContain('formality, tone, and spoken or written fit');
    expect(prompt).toContain('In Collocations');
    expect(prompt).toContain('Do not claim that a single example proves frequency or exclusivity.');
    expect(prompt).toContain('Common learner mistakes');
    expect(prompt).toContain('distinguish an error actually visible in the attached context from a general caution');
    expect(prompt).toContain('Never say the learner made a mistake unless you can quote the exact problematic form.');
    expect(prompt).toContain('If the form is acceptable, say so');
    expect(prompt).toContain('give a correction and explain the smallest relevant difference');
    expect(prompt).toContain('In Etymology');
    expect(prompt).toContain('separate attested historical origin from a modern memory aid or folk etymology');
    expect(prompt).toContain('Do not infer origin from the current spelling alone.');
    expect(prompt).toContain('label it uncertain and say what kind of source would be needed to verify it');
    expect(prompt).toContain('In Mnemonic');
    expect(prompt).toContain('Label it explicitly as an invented learning aid, not etymology or evidence.');
    expect(prompt).toContain('Do not encode a false pronunciation, spelling, component meaning, or cultural claim');
    expect(prompt).toContain('no reliable mnemonic is available');
    expect(prompt).toContain('Compare at most two similar words.');
    expect(prompt).toContain('quote the exact word or phrase');
    expect(prompt).toContain('general language knowledge');
    expect(prompt).toContain('instead of inventing evidence');
  });

  it('does not impose the dictionary result shape on another workflow', () => {
    const [suggestion] = deriveAgentContextSuggestions(conversation([
      context('passage', 'reading-passage', 'Reading'),
    ]), DEFAULT_AGENT_CONTEXT_SUGGESTION_PREFERENCES);

    expect(agentContextSuggestionPrompt(suggestion, '  Analyze this passage.  '))
      .toBe('Analyze this passage.');
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
