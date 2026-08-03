import { describe, expect, it } from 'vitest';
import { buildLocalAgentSystemPrompt, parseLocalAgentModelPlan } from '../localAgentPrompt';

describe('local agent model boundary', () => {
  it('exposes only operations allowed by the configured permission', () => {
    const prompt = buildLocalAgentSystemPrompt({
      permission: 'read-only',
      profile: {
        id: 'research', name: 'Research', description: '', role: 'research', preferredModelFileName: '', permission: 'read-only',
        enabledOperations: ['dictionary.lookup'], responseLength: 'brief', explanationDepth: 'standard', language: 'english',
        teachingStyle: 'academic', correctionStyle: 'gentle', enabled: true,
      },
      memories: [{
        id: 'goal',
        category: 'learning',
        key: 'Goal',
        value: 'N3',
        createdAt: 1,
        updatedAt: 1,
      }],
    });
    expect(prompt).toContain('dictionary.lookup');
    expect(prompt).toContain('"value": "N3"');
    expect(prompt).not.toContain('flashcard.create-deck');
    expect(prompt).not.toContain('media.delete-item');
    expect(prompt).toContain('Assistant profile: Research');
  });

  it('turns valid structured model output into a controller task', () => {
    const parsed = parseLocalAgentModelPlan(JSON.stringify({
      summary: 'Look up the requested word.',
      steps: [{
        label: 'Look up 日本語',
        operation: 'dictionary.lookup',
        arguments: { term: '日本語' },
      }],
    }), 'task-1', 'What does 日本語 mean?', 'read-only', 10);
    expect(parsed.task).toMatchObject({
      id: 'task-1',
      status: 'queued',
      createdAt: 10,
      steps: [{
        status: 'pending',
        request: { operation: 'dictionary.lookup', arguments: { term: '日本語' } },
      }],
    });
  });

  it('supports a safe no-action response', () => {
    expect(parseLocalAgentModelPlan(
      '```json\n{"summary":"No approved tool can do that.","steps":[]}\n```',
      'task-1',
      'Open an arbitrary program',
      'read-only',
    )).toEqual({
      summary: 'No approved tool can do that.',
      task: null,
    });
  });

  it('accepts a step that omits arguments for an operation that takes none', () => {
    // Slice 53 drove Qwen3-1.7B live and got 6 rejections out of 6 across
    // `flashcard.list-decks` and `calendar.list` — both zero-argument operations whose
    // handlers read nothing. The model omits `arguments` precisely when the operation needs
    // none, which is exactly when the parser used to insist on it, and the failure was total:
    // the whole plan thrown away over a field the operation does not use.
    const parsed = parseLocalAgentModelPlan(JSON.stringify({
      summary: 'List the deck folders.',
      steps: [{
        label: 'List every flashcard deck folder',
        operation: 'flashcard.list-decks',
      }],
    }), 'task-1', 'List every flashcard deck folder I have', 'read-only', 10);
    expect(parsed.task).toMatchObject({
      steps: [{
        status: 'pending',
        request: { operation: 'flashcard.list-decks', arguments: {} },
      }],
    });
    expect(parseLocalAgentModelPlan(JSON.stringify({
      summary: 'List the calendar.',
      steps: [{ label: 'List calendar entries', operation: 'calendar.list' }],
    }), 'task-2', 'What is on my calendar?', 'read-only', 10).task?.steps[0].request.arguments)
      .toEqual({});
  });

  it('still refuses a step that omits an argument the operation requires', () => {
    // The other half of the same rule. Defaulting `arguments` to `{}` unconditionally would
    // turn "the model forgot the query" into a plan that parses and then dies one layer down
    // in the handler — which slice 53 also observed live (`The operation needs query.`).
    expect(() => parseLocalAgentModelPlan(JSON.stringify({
      summary: 'Search local knowledge.',
      steps: [{ label: 'Search', operation: 'dictionary.search-knowledge' }],
    }), 'task-1', 'Find neko', 'read-only')).toThrow('needs a query argument');
    expect(() => parseLocalAgentModelPlan(JSON.stringify({
      summary: 'Search local knowledge.',
      steps: [{ label: 'Search', operation: 'dictionary.search-knowledge', arguments: {} }],
    }), 'task-1', 'Find neko', 'read-only')).toThrow('needs a query argument');
    expect(() => parseLocalAgentModelPlan(JSON.stringify({
      summary: 'Search local knowledge.',
      steps: [{ label: 'Search', operation: 'dictionary.search-knowledge', arguments: { query: '  ' } }],
    }), 'task-1', 'Find neko', 'read-only')).toThrow('needs a query argument');
  });

  it('still rejects a wrongly typed arguments field', () => {
    // `null` is treated as "not supplied" — a model that writes it is in the same position as
    // one that omits the key. A string, a number or an ARRAY is a structurally different plan,
    // and silently discarding it would hide arguments the model did intend to pass.
    for (const bad of ['{"query":"neko"}', 42, ['query']] as const) {
      expect(() => parseLocalAgentModelPlan(JSON.stringify({
        summary: 'List the deck folders.',
        steps: [{ label: 'List', operation: 'flashcard.list-decks', arguments: bad }],
      }), 'task-1', 'List decks', 'read-only')).toThrow('needs an arguments object');
    }
    expect(parseLocalAgentModelPlan(JSON.stringify({
      summary: 'List the deck folders.',
      steps: [{ label: 'List', operation: 'flashcard.list-decks', arguments: null }],
    }), 'task-1', 'List decks', 'read-only').task?.steps[0].request.arguments).toEqual({});
  });

  it('rejects unknown or permission-elevating operations', () => {
    expect(() => parseLocalAgentModelPlan(JSON.stringify({
      summary: 'Change settings.',
      steps: [{
        label: 'Change settings',
        operation: 'settings.change-preference',
        arguments: {},
      }],
    }), 'task-1', 'Change settings', 'limited-actions')).toThrow('unavailable operation');
    expect(() => parseLocalAgentModelPlan(JSON.stringify({
      summary: 'Run arbitrary code.',
      steps: [{
        label: 'Run code',
        operation: 'system.shell',
        arguments: {},
      }],
    }), 'task-1', 'Run code', 'full-automation')).toThrow('unavailable operation');
  });
});
