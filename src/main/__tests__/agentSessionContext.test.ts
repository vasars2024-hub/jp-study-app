// @vitest-environment node
/**
 * The session-only half of the workspace, tested away from the filesystem.
 *
 * The store-level tests in `agentWorkspaceStore.test.ts` prove the important
 * product guarantee — session context reaches a caller and never reaches disk.
 * These cover the parts that are easy to get subtly wrong and invisible from
 * outside: replace-versus-union, the garbage collection that makes delete and
 * clear work for free, and the two bounds.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateAgentProviderPrivacy,
  normalizeAgentWorkspaceState,
  type AgentAttachment,
  type AgentContextItem,
  type AgentMessage,
  type AgentProviderPolicy,
  type AgentResultCard,
  type AgentWorkspaceState,
} from '../../shared/agentWorkspace';
import { createAgentSessionContextStore } from '../agentSessionContext';

function item(id: string, retained: boolean, extra: Partial<AgentContextItem> = {}): AgentContextItem {
  return {
    id,
    kind: 'selected-text',
    label: id,
    preview: `preview-${id}`,
    source: { app: 'reading' },
    sensitivity: 'personal',
    retained,
    createdAt: 1,
    ...extra,
  };
}

function card(
  id: string,
  sourceContextIds: string[],
  title = id,
): AgentResultCard {
  return {
    id,
    kind: 'generic',
    title,
    sourceContextIds,
    actions: [],
  };
}

function attachment(id: string, name = id): AgentAttachment {
  return {
    id,
    kind: 'document',
    name,
    mimeType: 'text/plain',
    sizeBytes: name.length,
    localPath: `C:\\private\\${id}`,
    sensitivity: 'sensitive',
    retained: false,
  };
}

function message(
  id: string,
  cards: AgentResultCard[],
  attachments: AgentAttachment[] = [],
  provider?: AgentMessage['provider'],
): AgentMessage {
  return {
    id,
    conversationId: '',
    role: 'assistant',
    status: 'complete',
    text: id,
    createdAt: 1,
    updatedAt: 1,
    contextIds: [],
    attachments,
    cards,
    ...(provider ? { provider } : {}),
  };
}

function workspace(conversations: {
  id: string;
  context: AgentContextItem[];
  messages?: AgentMessage[];
}[]): AgentWorkspaceState {
  return normalizeAgentWorkspaceState({
    version: 1,
    activeConversationId: conversations[0]?.id ?? null,
    conversations: conversations.map((entry) => ({
      id: entry.id,
      title: entry.id,
      mode: 'ask',
      createdAt: 1,
      updatedAt: 1,
      context: entry.context,
      messages: entry.messages ?? [],
    })),
  });
}

/** The persisted half: the same document with every non-retained item removed. */
function persistedHalf(state: AgentWorkspaceState): AgentWorkspaceState {
  const retainedIdsByConversation = new Map(state.conversations.map((conversation) => [
    conversation.id,
    new Set(conversation.context.filter((entry) => entry.retained).map((entry) => entry.id)),
  ]));
  const retainedAttachmentIdsByConversation = new Map(state.conversations.map((conversation) => [
    conversation.id,
    new Set(conversation.messages.flatMap((message) => (
      message.attachments.filter((attachment) => attachment.retained).map((attachment) => attachment.id)
    ))),
  ]));
  return {
    ...state,
    conversations: state.conversations.map((conversation) => ({
      ...conversation,
      context: conversation.context.filter((entry) => entry.retained),
      messages: conversation.messages.map((entry) => ({
        ...entry,
        attachments: entry.attachments.filter((attachment) => attachment.retained),
        ...(entry.provider ? {
          provider: {
            ...entry.provider,
            attachmentIds: entry.provider.attachmentIds.filter((id) => (
              retainedAttachmentIdsByConversation.get(conversation.id)?.has(id) === true
            )),
          },
        } : {}),
        cards: entry.cards.filter((result) => (
          result.sourceContextIds.length > 0
          && result.sourceContextIds.every((id) => (
            retainedIdsByConversation.get(conversation.id)?.has(id) === true
          ))
        )),
      })),
    })),
  };
}

describe('Agent session context store', () => {
  it('re-attaches only the non-retained half, without duplicating the retained one', () => {
    const store = createAgentSessionContextStore();
    const whole = workspace([{ id: 'chat-1', context: [item('keep', true), item('session', false)] }]);
    store.absorb(whole);

    const merged = store.merge(persistedHalf(whole));
    expect(merged.conversations[0].context.map((entry) => entry.id)).toEqual(['keep', 'session']);
    // Merging twice must not stack the session item up.
    expect(store.merge(merged).conversations[0].context.map((entry) => entry.id))
      .toEqual(['keep', 'session']);
  });

  it('keeps non-retained attachment metadata and disclosure ids in memory only', () => {
    const store = createAgentSessionContextStore();
    const whole = workspace([{
      id: 'chat-1',
      context: [],
      messages: [message('request', [], [attachment('file-1', 'first.txt')], {
        target: { kind: 'local', backend: 'local-qwen' },
        cloud: false,
        contextIds: [],
        attachmentIds: ['file-1'],
        inputChars: 10,
        startedAt: 1,
      })],
    }]);
    store.absorb(whole);

    const merged = store.merge(persistedHalf(whole));
    expect(merged.conversations[0].messages[0].attachments).toEqual([{
      id: 'file-1',
      kind: 'document',
      name: 'first.txt',
      mimeType: 'text/plain',
      sizeBytes: 'first.txt'.length,
      sensitivity: 'sensitive',
      retained: false,
    }]);
    expect(merged.conversations[0].messages[0].provider?.attachmentIds)
      .toEqual(['file-1']);
    expect(merged.conversations[0].messages[0].attachments[0])
      .not.toHaveProperty('localPath');

    const replacement = workspace([{
      id: 'chat-1',
      context: [],
      messages: [message('request', [], [attachment('file-1', 'replacement.txt')], {
        target: { kind: 'local', backend: 'local-qwen' },
        cloud: false,
        contextIds: [],
        attachmentIds: ['file-1'],
        inputChars: 10,
        startedAt: 1,
      })],
    }]);
    store.absorb(replacement);
    expect(store.merge(persistedHalf(replacement)).conversations[0].messages[0]
      .attachments[0].name).toBe('replacement.txt');

    store.absorb(workspace([{ id: 'chat-1', context: [], messages: [message('request', [])] }]));
    expect(store.merge(workspace([{ id: 'chat-1', context: [], messages: [message('request', [])] }]))
      .conversations[0].messages[0].attachments).toEqual([]);
  });

  it('dedupes and bounds session attachments per message without rotating replacements', () => {
    const store = createAgentSessionContextStore();
    const state = workspace([{
      id: 'chat-1',
      context: [],
      messages: [message('request', [])],
    }]);
    // Bypass the shared normalizer's same 50-item cap so this test exercises
    // the in-memory boundary and duplicate replacement policy itself.
    state.conversations[0].messages[0].attachments = [
      attachment('file-0', 'first'),
      attachment('file-0', 'duplicate'),
      ...Array.from({ length: 60 }, (_, index) => attachment(`file-${index + 1}`)),
    ];
    const persisted = persistedHalf(state);

    store.absorb(state);
    const first = store.merge(persisted).conversations[0].messages[0].attachments;
    store.absorb(state);
    expect(store.merge(persisted).conversations[0].messages[0].attachments).toEqual(first);
    expect(first).toHaveLength(50);
    expect(first[0].name).toBe('first');
  });

  it('replaces rather than unions, so a removal actually removes', () => {
    const store = createAgentSessionContextStore();
    store.absorb(workspace([{ id: 'chat-1', context: [item('a', false), item('b', false)] }]));
    store.absorb(workspace([{ id: 'chat-1', context: [item('b', false)] }]));

    const merged = store.merge(workspace([{ id: 'chat-1', context: [] }]));
    expect(merged.conversations[0].context.map((entry) => entry.id)).toEqual(['b']);
  });

  it('forgets a conversation the document no longer mentions', () => {
    const store = createAgentSessionContextStore();
    store.absorb(workspace([
      { id: 'chat-1', context: [item('a', false)] },
      { id: 'chat-2', context: [item('b', false)] },
    ]));
    expect(store.size()).toBe(2);

    store.absorb(workspace([{ id: 'chat-2', context: [item('b', false)] }]));
    expect(store.size()).toBe(1);

    // And a conversation that comes back is empty rather than restored.
    const merged = store.merge(workspace([
      { id: 'chat-1', context: [] },
      { id: 'chat-2', context: [] },
    ]));
    expect(merged.conversations[0].context).toEqual([]);
    expect(merged.conversations[1].context.map((entry) => entry.id)).toEqual(['b']);
  });

  it('attaches nothing to a conversation that does not exist in the persisted half', () => {
    const store = createAgentSessionContextStore();
    store.absorb(workspace([{ id: 'chat-1', context: [item('a', false)] }]));
    const merged = store.merge(workspace([{ id: 'chat-9', context: [] }]));
    expect(merged.conversations.map((entry) => entry.id)).toEqual(['chat-9']);
    expect(merged.conversations[0].context).toEqual([]);
  });

  it('bounds items per conversation and total conversations', () => {
    const store = createAgentSessionContextStore();
    const many = Array.from({ length: 140 }, (_, index) => item(`s-${index}`, false));
    store.absorb(workspace([{ id: 'chat-1', context: many }]));
    const merged = store.merge(workspace([{ id: 'chat-1', context: [] }]));
    // The normalizer caps a conversation's context at 100, and the session half
    // must not be able to push the merged view past what it would accept back.
    expect(merged.conversations[0].context).toHaveLength(100);

    const crowd = createAgentSessionContextStore();
    crowd.absorb(workspace(
      Array.from({ length: 260 }, (_, index) => ({
        id: `chat-${index}`,
        context: [item(`s-${index}`, false)],
      })),
    ));
    expect(crowd.size()).toBe(200);
  });

  it('never evicts the conversation the user is looking at', () => {
    // Regression: the cap used to evict by Map insertion order with no regard for
    // the active conversation, so the one on screen could be the victim. The
    // normalizer allows 500 conversations against this module's 200, so this is
    // reachable rather than theoretical.
    const store = createAgentSessionContextStore();
    const many = Array.from({ length: 260 }, (_, index) => ({
      id: `chat-${index}`,
      context: [item(`s-${index}`, false)],
    }));
    const state = workspace(many);
    // `chat-5` deliberately: the old policy inserted in document order and deleted
    // from the front, so an *early* conversation is one it would have dropped. An
    // active id near the end would have survived the bug and proved nothing.
    const active = { ...state, activeConversationId: 'chat-5' };
    store.absorb(active);
    expect(store.size()).toBe(200);

    const merged = store.merge({
      ...active,
      conversations: active.conversations.map((c) => ({ ...c, context: [] })),
    });
    const kept = merged.conversations.find((c) => c.id === 'chat-5');
    expect(kept?.context.map((entry) => entry.id)).toEqual(['s-5']);
  });

  it('keeps the same conversations across repeated saves instead of rotating them', () => {
    // Regression: absorb mutated a long-lived Map, and a re-inserted key landed at
    // the end, so past the cap the survivors became the next victims and the
    // dropped set rotated on every save. It is rebuilt from the document now, so
    // the contents are a pure function of the last document.
    const store = createAgentSessionContextStore();
    const state = workspace(Array.from({ length: 260 }, (_, index) => ({
      id: `chat-${index}`,
      context: [item(`s-${index}`, false)],
    })));

    const survivors = (): string[] => {
      const merged = store.merge({
        ...state,
        conversations: state.conversations.map((c) => ({ ...c, context: [] })),
      });
      return merged.conversations.filter((c) => c.context.length > 0).map((c) => c.id);
    };

    store.absorb(state);
    const first = survivors();
    store.absorb(state);
    store.absorb(state);
    expect(survivors()).toEqual(first);
    expect(first).toHaveLength(200);
  });

  it('re-attaches session-provenance cards to their original message only', () => {
    const store = createAgentSessionContextStore();
    const whole = workspace([
      {
        id: 'chat-1',
        context: [item('keep', true), item('session', false)],
        messages: [
          message('answer-1', [
            card('retained-card', ['keep']),
            card('session-card', ['keep', 'session']),
          ]),
          message('answer-2', []),
        ],
      },
      {
        id: 'chat-2',
        context: [item('other-session', false)],
        messages: [message('answer-1', [])],
      },
    ]);

    store.absorb(whole);
    const merged = store.merge(persistedHalf(whole));
    expect(merged.conversations[0].messages[0].cards.map((entry) => entry.id))
      .toEqual(['retained-card', 'session-card']);
    expect(merged.conversations[0].messages[1].cards).toEqual([]);
    expect(merged.conversations[1].messages[0].cards).toEqual([]);
    expect(store.merge(merged).conversations[0].messages[0].cards.map((entry) => entry.id))
      .toEqual(['retained-card', 'session-card']);
  });

  it('keeps two cards with the same session-only route provenance together', () => {
    const store = createAgentSessionContextStore();
    const routeContext = item('route-session', false, {
      kind: 'route',
      source: { app: 'dictionary', route: '/dictionary' },
      sensitivity: 'ordinary',
    });
    const routeCards = [
      card('route-primary', ['route-session'], 'Open dictionary'),
      card('route-secondary', ['route-session'], 'Review route details'),
    ];
    const whole = workspace([{
      id: 'chat-1',
      context: [routeContext],
      messages: [message('answer', routeCards)],
    }]);

    store.absorb(whole);
    const persisted = persistedHalf(whole);
    expect(persisted.conversations[0].context).toEqual([]);
    expect(persisted.conversations[0].messages[0].cards).toEqual([]);
    expect(store.merge(persisted).conversations[0].messages[0].cards.map((entry) => entry.id))
      .toEqual(['route-primary', 'route-secondary']);

    store.absorb(workspace([{
      id: 'chat-1',
      context: [],
      messages: [message('answer', routeCards)],
    }]));
    expect(store.merge(persisted).conversations[0].messages[0].cards).toEqual([]);

    store.absorb(whole);
    store.absorb(workspace([{
      id: 'chat-1',
      context: [routeContext],
      messages: [],
    }]));
    expect(store.merge(persisted).conversations[0].messages[0].cards).toEqual([]);
  });

  it('leaves retained cards file-owned and never duplicates a persisted card identity', () => {
    const store = createAgentSessionContextStore();
    const whole = workspace([{
      id: 'chat-1',
      context: [item('keep', true), item('session', false)],
      messages: [message('answer', [
        card('file-card', ['keep'], 'from-file'),
        card('shared-id', ['session'], 'from-session'),
      ])],
    }]);
    store.absorb(whole);

    const persisted = persistedHalf(whole);
    persisted.conversations[0].messages[0].cards.push(
      card('shared-id', ['keep'], 'persisted-wins'),
    );
    const merged = store.merge(persisted);
    expect(merged.conversations[0].messages[0].cards.map((entry) => entry.id))
      .toEqual(['file-card', 'shared-id']);
    expect(merged.conversations[0].messages[0].cards[1].title).toBe('persisted-wins');

    // A retained-only card was never copied into the session store.
    const withoutFileCard = {
      ...persisted,
      conversations: persisted.conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((entry) => ({ ...entry, cards: [] })),
      })),
    };
    expect(store.merge(withoutFileCard).conversations[0].messages[0].cards.map((entry) => entry.id))
      .toEqual(['shared-id']);
  });

  it('removes session cards when context, provenance, or the message disappears', () => {
    const store = createAgentSessionContextStore();
    const withCard = (sourceContextIds: string[], includeMessage = true) => workspace([{
      id: 'chat-1',
      context: [item('keep', true), item('session', false)],
      messages: includeMessage ? [message('answer', [card('result', sourceContextIds)])] : [],
    }]);
    const persisted = persistedHalf(withCard(['session']));

    store.absorb(withCard(['session']));
    expect(store.merge(persisted).conversations[0].messages[0].cards).toHaveLength(1);

    store.absorb(withCard(['keep']));
    expect(store.merge(persisted).conversations[0].messages[0].cards).toEqual([]);

    store.absorb(withCard(['session', 'missing-context']));
    expect(store.merge(persisted).conversations[0].messages[0].cards).toEqual([]);

    store.absorb(withCard(['session'], false));
    expect(store.merge(persisted).conversations[0].messages[0].cards).toEqual([]);

    const withoutSessionContext = workspace([{
      id: 'chat-1',
      context: [item('keep', true)],
      messages: [message('answer', [card('result', ['session'])])],
    }]);
    store.absorb(withoutSessionContext);
    expect(store.merge(persisted).conversations[0].messages[0].cards).toEqual([]);
  });

  it('replaces a session card snapshot instead of retaining its previous contents', () => {
    const store = createAgentSessionContextStore();
    const withTitle = (title: string) => workspace([{
      id: 'chat-1',
      context: [item('session', false)],
      messages: [message('answer', [card('result', ['session'], title)])],
    }]);
    const persisted = persistedHalf(withTitle('first'));

    store.absorb(withTitle('first'));
    store.absorb(withTitle('replacement'));
    expect(store.merge(persisted).conversations[0].messages[0].cards)
      .toMatchObject([{ id: 'result', title: 'replacement' }]);
  });

  it('bounds session cards per message without rotating survivors on repeated absorbs', () => {
    const store = createAgentSessionContextStore();
    const state = workspace([{
      id: 'chat-1',
      context: [item('session', false)],
      messages: [message('answer', [])],
    }]);
    // Bypass the shared normalizer's identical cap so this test exercises the
    // in-memory boundary itself, including duplicate-id suppression.
    state.conversations[0].messages[0].cards = [
      card('card-0', ['session']),
      card('card-0', ['session'], 'duplicate'),
      ...Array.from({ length: 139 }, (_, index) => card(`card-${index + 1}`, ['session'])),
    ];
    const persisted = persistedHalf(state);
    const ids = () => store.merge(persisted).conversations[0].messages[0].cards
      .map((entry) => entry.id);

    store.absorb(state);
    const first = ids();
    store.absorb(state);
    store.absorb(state);
    expect(ids()).toEqual(first);
    expect(first).toHaveLength(100);
  });

  it('stores cards for at most the newest 2,000 messages in a conversation', () => {
    const store = createAgentSessionContextStore();
    const state = workspace([{
      id: 'chat-1',
      context: [item('session', false)],
      messages: Array.from({ length: 2_000 }, (_, index) => message(`message-${index}`, [])),
    }]);
    state.conversations[0].messages.unshift(
      message('outside-session-cap', [card('old-card', ['session'])]),
    );
    const persisted = persistedHalf(state);

    store.absorb(state);
    expect(store.merge(persisted).conversations[0].messages[0].cards).toEqual([]);
  });

  it('leaves the cloud privacy boundary in charge of sensitive session context', () => {
    // This slice is what makes `sensitive` context reachable by a request at all:
    // retention is refused above `ordinary`, so before the session transport the
    // only context that could reach a provider was reference data. The gate is
    // therefore load-bearing now rather than theoretical.
    //
    // There are two regimes and both have to hold. `excludeSensitiveContext` is
    // a persistent privacy *floor* that outranks per-request consent: with the
    // floor up, sensitive items are dropped before the consent gate is read, so
    // the request proceeds without them rather than being refused. Only with the
    // floor explicitly lowered does the per-request consent gate decide. Either
    // way the assertion that matters is the same one — a sensitive item never
    // appears in the disclosed context unless consent was given for it.
    const policy = (
      allowSensitiveContext: boolean,
      extra: Partial<AgentProviderPolicy> = {},
    ): AgentProviderPolicy => ({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
      allowSensitiveContext,
      maxInputChars: 10_000,
      maxOutputTokens: 500,
      ...extra,
    });
    const sensitive = [item('secret', false, { sensitivity: 'sensitive' })];

    // Floor up (the default, and what an omitted field means for a caller
    // written before the setting existed): stripped, not refused.
    expect(evaluateAgentProviderPrivacy(policy(false), 'explain', sensitive, []))
      .toMatchObject({ allowed: true, context: [] });
    expect(evaluateAgentProviderPrivacy(
      policy(false, { excludeSensitiveContext: true }),
      'explain',
      sensitive,
      [],
    )).toMatchObject({ allowed: true, context: [] });

    // Floor down: the per-request consent gate is what decides.
    expect(evaluateAgentProviderPrivacy(
      policy(false, { excludeSensitiveContext: false }),
      'explain',
      sensitive,
      [],
    )).toMatchObject({ allowed: false, reason: 'sensitive-context', context: [] });
    expect(evaluateAgentProviderPrivacy(
      policy(true, { excludeSensitiveContext: false }),
      'explain',
      sensitive,
      [],
    )).toMatchObject({ allowed: true, context: sensitive });

    // Consent alone does not lift the floor — the floor is the outer gate.
    expect(evaluateAgentProviderPrivacy(policy(true), 'explain', sensitive, []))
      .toMatchObject({ allowed: true, context: [] });

    // A local target never consults the flag.
    expect(evaluateAgentProviderPrivacy(
      { ...policy(false), target: { kind: 'local', backend: 'local-qwen' } },
      'explain',
      sensitive,
      [],
    )).toMatchObject({ allowed: true });
  });
});
