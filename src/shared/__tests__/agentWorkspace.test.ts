// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  AGENT_WORKSPACE_SCHEMA_VERSION,
  emptyAgentWorkspaceState,
  evaluateAgentProviderPrivacy,
  normalizeAgentWorkspaceState,
  type AgentAttachment,
  type AgentContextItem,
  type AgentProviderPolicy,
} from '../agentWorkspace';

const now = 1_700_000_000_000;

const context = (sensitivity: AgentContextItem['sensitivity'] = 'ordinary'): AgentContextItem => ({
  id: 'ctx-1',
  kind: 'selected-text',
  label: 'Selected text',
  preview: '短い文',
  source: { app: 'reading', route: 'reader' },
  sensitivity,
  retained: false,
  createdAt: now,
});

const attachment = (sensitivity: AgentAttachment['sensitivity'] = 'ordinary'): AgentAttachment => ({
  id: 'file-1',
  kind: 'document',
  name: 'notes.txt',
  sensitivity,
  retained: false,
});

const policy = (over: Partial<AgentProviderPolicy> = {}): AgentProviderPolicy => ({
  target: { kind: 'local', backend: 'local-qwen' },
  allowCloud: false,
  allowSensitiveContext: false,
  maxInputChars: 10_000,
  maxOutputTokens: 2_000,
  cache: 'session',
  retryAttempts: 1,
  timeoutMs: 60_000,
  streaming: true,
  ...over,
});

const rawAction = (id: string, label = id) => ({
  id,
  label,
  effect: { type: 'navigate', section: 'dictionary' },
});

const rawCard = (id: string, actions = [rawAction(`action-${id}`)], title = id) => ({
  id,
  kind: 'navigation',
  title,
  sourceContextIds: [],
  actions,
});

const rawMessage = (id: string, cards = [rawCard(`card-${id}`)], text = id) => ({
  id,
  role: 'assistant',
  status: 'complete',
  text,
  createdAt: now,
  contextIds: [],
  attachments: [],
  cards,
});

describe('Agent workspace persistence contract', () => {
  it('starts empty and versioned', () => {
    expect(emptyAgentWorkspaceState()).toEqual({
      version: AGENT_WORKSPACE_SCHEMA_VERSION,
      revision: 0,
      activeConversationId: null,
      conversations: [],
    });
  });

  it('normalizes a bounded reusable prompt library without breaking old schema-v1 documents', () => {
    const legacy = normalizeAgentWorkspaceState({
      version: AGENT_WORKSPACE_SCHEMA_VERSION,
      conversations: [],
    });
    expect(legacy.prompts).toBeUndefined();

    const normalized = normalizeAgentWorkspaceState({
      version: AGENT_WORKSPACE_SCHEMA_VERSION,
      conversations: [],
      prompts: [{
        id: ' prompt-1 ',
        title: ` ${'N'.repeat(140)} `,
        text: ` ${'P'.repeat(12_020)} `,
        createdAt: now,
        updatedAt: now + 1,
      }, {
        id: 'prompt-1',
        title: 'Collision',
        text: 'Must not win by array order',
        createdAt: now,
      }, {
        id: 'invalid',
        title: '',
        text: '',
      }],
    });

    expect(normalized.prompts).toEqual([]);
  });

  it('rejects unknown future or malformed schemas', () => {
    expect(normalizeAgentWorkspaceState({ version: 99, conversations: [{ id: 'future' }] }))
      .toEqual(emptyAgentWorkspaceState());
    expect(normalizeAgentWorkspaceState('not an object')).toEqual(emptyAgentWorkspaceState());
  });

  it('normalizes bounded conversations, context, and messages', () => {
    const normalized = normalizeAgentWorkspaceState({
      version: 1,
      revision: 7.9,
      activeConversationId: 'chat-1',
      conversations: [{
        id: 'chat-1',
        title: '  Study this  ',
        mode: 'study',
        createdAt: now,
        pinned: true,
        context: [context()],
        messages: [{
          id: 'message-1',
          role: 'user',
          status: 'complete',
          text: ' Explain this ',
          createdAt: now,
          contextIds: ['ctx-1', 'ctx-1'],
          attachments: [attachment()],
          provider: {
            target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
            cloud: false,
            contextIds: ['ctx-1'],
            historyMessageIds: ['message-0', 'message-0'],
            inputChars: 50,
            startedAt: now,
          },
          cards: [{
            id: 'card-1',
            kind: 'navigation',
            title: 'Open Dictionary',
            sourceContextIds: ['ctx-1'],
            actions: [{
              id: 'open',
              label: 'Open',
              effect: { type: 'navigate', section: 'dictionary', highlight: true },
            }, {
              id: 'unsafe',
              label: 'Unsafe',
              effect: { type: 'run-arbitrary-code', command: 'no' },
            }],
          }],
        }],
      }],
    });

    expect(normalized.activeConversationId).toBe('chat-1');
    expect(normalized.revision).toBe(7);
    expect(normalized.conversations[0]).toMatchObject({ title: 'Study this', mode: 'study', pinned: true });
    expect(normalized.conversations[0].messages[0]).toMatchObject({
      conversationId: 'chat-1',
      text: 'Explain this',
      contextIds: ['ctx-1'],
      cards: [{
        id: 'card-1',
        actions: [{ effect: { type: 'navigate', section: 'dictionary', highlight: true } }],
      }],
      provider: {
        cloud: true,
        contextIds: ['ctx-1'],
        historyMessageIds: ['message-0'],
      },
    });
    expect(normalized.conversations[0].messages[0].cards[0].actions).toHaveLength(1);
  });

  it('keeps a navigation query and caps its length', () => {
    const long = 'x'.repeat(600);
    const normalized = normalizeAgentWorkspaceState({
      version: 1,
      activeConversationId: 'chat-1',
      conversations: [{
        id: 'chat-1',
        createdAt: now,
        messages: [{
          id: 'message-1',
          role: 'assistant',
          createdAt: now,
          cards: [{
            id: 'card-1',
            kind: 'navigation',
            title: 'Question',
            sourceContextIds: [],
            actions: [{
              id: 'kept',
              label: 'Kept',
              effect: {
                type: 'navigate',
                section: 'settings',
                page: 'appearance',
                controlId: 'ui-language',
                highlight: true,
                query: long,
              },
            }, {
              id: 'no-query',
              label: 'No query',
              effect: { type: 'navigate', section: 'dictionary', query: '   ' },
            }],
          }],
        }],
      }],
    });

    const [kept, bare] = normalized.conversations[0].messages[0].cards[0].actions;
    expect(kept.effect).toEqual({
      type: 'navigate',
      section: 'settings',
      page: 'appearance',
      controlId: 'ui-language',
      highlight: true,
      query: 'x'.repeat(400),
    });
    // A blank query is no query at all, and must not leave the field behind for
    // the resolver to treat as index provenance.
    expect(bare.effect).toEqual({ type: 'navigate', section: 'dictionary' });
  });

  it('drops a stale active id and malformed nested records', () => {
    const normalized = normalizeAgentWorkspaceState({
      version: 1,
      activeConversationId: 'missing',
      conversations: [{ id: 'chat-1', context: [{ id: '', label: '' }], messages: [{ id: '' }] }],
    });
    expect(normalized.activeConversationId).toBeNull();
    expect(normalized.conversations[0].context).toEqual([]);
    expect(normalized.conversations[0].messages).toEqual([]);
  });

  it('removes every normalized-id collision while retaining unique scoped coordinates', () => {
    const longMessageId = 'm'.repeat(240);
    const longCardId = 'c'.repeat(240);
    const longActionId = 'a'.repeat(240);
    const normalized = normalizeAgentWorkspaceState({
      version: 1,
      activeConversationId: 'chat-1',
      conversations: [{
        id: 'chat-1',
        messages: [
          rawMessage('message-trim', [], 'MESSAGE_TRIM_A'),
          rawMessage(' message-trim ', [], 'MESSAGE_TRIM_B'),
          rawMessage(`${longMessageId}A`, [], 'MESSAGE_LONG_A'),
          rawMessage(`${longMessageId}B`, [], 'MESSAGE_LONG_B'),
          rawMessage('message-unique', [
            rawCard('card-trim', [], 'CARD_TRIM_A'),
            rawCard(' card-trim ', [], 'CARD_TRIM_B'),
            rawCard(`${longCardId}A`, [], 'CARD_LONG_A'),
            rawCard(`${longCardId}B`, [], 'CARD_LONG_B'),
            rawCard('card-actions', [
              rawAction('action-trim', 'ACTION_TRIM_A'),
              rawAction(' action-trim ', 'ACTION_TRIM_B'),
              rawAction(`${longActionId}A`, 'ACTION_LONG_A'),
              rawAction(`${longActionId}B`, 'ACTION_LONG_B'),
              rawAction('action-unique', 'ACTION_UNIQUE'),
              rawAction('action-shared', 'ACTION_SHARED_FIRST_CARD'),
            ]),
            rawCard('card-other', [
              rawAction('action-shared', 'ACTION_SHARED_SECOND_CARD'),
            ]),
          ]),
          rawMessage('message-scope-a', [rawCard('card-shared', [rawAction('open')])]),
          rawMessage('message-scope-b', [rawCard('card-shared', [rawAction('open')])]),
        ],
      }],
    });

    const messages = normalized.conversations[0].messages;
    expect(messages.map((message) => message.id)).toEqual([
      'message-unique',
      'message-scope-a',
      'message-scope-b',
    ]);
    expect(messages[0].cards.map((card) => card.id)).toEqual(['card-actions', 'card-other']);
    expect(messages[0].cards[0].actions.map((action) => action.id)).toEqual([
      'action-unique',
      'action-shared',
    ]);
    expect(messages[0].cards[1].actions.map((action) => action.id)).toEqual(['action-shared']);
    expect(messages.slice(1).map((message) => message.cards[0].id))
      .toEqual(['card-shared', 'card-shared']);
    expect(messages.slice(1).map((message) => message.cards[0].actions[0].id))
      .toEqual(['open', 'open']);

    const serialized = JSON.stringify(normalized);
    for (const removedSentinel of [
      'MESSAGE_TRIM_A',
      'MESSAGE_TRIM_B',
      'MESSAGE_LONG_A',
      'MESSAGE_LONG_B',
      'CARD_TRIM_A',
      'CARD_TRIM_B',
      'CARD_LONG_A',
      'CARD_LONG_B',
      'ACTION_TRIM_A',
      'ACTION_TRIM_B',
      'ACTION_LONG_A',
      'ACTION_LONG_B',
    ]) {
      expect(serialized).not.toContain(removedSentinel);
    }
  });
});

describe('provider privacy boundary', () => {
  it('keeps local execution available without cloud consent', () => {
    expect(evaluateAgentProviderPrivacy(policy(), 'Explain', [context('sensitive')], [attachment('sensitive')]))
      .toMatchObject({ allowed: true, inputChars: 10 });
  });

  it('refuses cloud execution when cloud use is disabled', () => {
    const result = evaluateAgentProviderPrivacy(policy({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
    }), 'Explain', [context()], []);
    expect(result).toMatchObject({ allowed: false, reason: 'cloud-disabled', context: [] });
  });

  it('requires explicit sensitive-context permission for cloud execution', () => {
    const result = evaluateAgentProviderPrivacy(policy({
      target: { kind: 'cloud', providerId: 'deepseek-v4-flash' },
      allowCloud: true,
    }), 'Explain', [context('sensitive')], []);
    expect(result).toMatchObject({ allowed: false, reason: 'sensitive-context' });
  });

  it('allows an explicitly disclosed cloud request', () => {
    const result = evaluateAgentProviderPrivacy(policy({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
      allowSensitiveContext: true,
    }), 'Explain', [context('sensitive')], [attachment('sensitive')]);
    expect(result).toMatchObject({ allowed: true, context: [{ id: 'ctx-1' }], attachments: [{ id: 'file-1' }] });
  });

  it('discloses a place item that has no preview, and still drops an empty one', () => {
    const place: AgentContextItem = {
      id: 'ctx-route',
      kind: 'route',
      label: 'Reader',
      preview: '',
      source: { app: 'reading', route: 'reader' },
      sensitivity: 'ordinary',
      retained: true,
      createdAt: now,
    };
    const empty: AgentContextItem = { ...context(), id: 'ctx-empty', preview: '' };

    expect(evaluateAgentProviderPrivacy(policy(), 'Explain', [place, empty], []))
      .toMatchObject({ allowed: true, context: [{ id: 'ctx-route' }] });
  });

  it('refuses over-budget input instead of silently truncating context', () => {
    const result = evaluateAgentProviderPrivacy(policy({ maxInputChars: 4 }), 'Explain', [context()], []);
    expect(result).toMatchObject({ allowed: false, reason: 'input-budget' });
  });
});
