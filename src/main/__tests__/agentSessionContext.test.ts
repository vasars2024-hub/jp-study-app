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
  type AgentContextItem,
  type AgentProviderPolicy,
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

function workspace(conversations: { id: string; context: AgentContextItem[] }[]): AgentWorkspaceState {
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
      messages: [],
    })),
  });
}

/** The persisted half: the same document with every non-retained item removed. */
function persistedHalf(state: AgentWorkspaceState): AgentWorkspaceState {
  return {
    ...state,
    conversations: state.conversations.map((conversation) => ({
      ...conversation,
      context: conversation.context.filter((entry) => entry.retained),
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

  it('leaves the cloud privacy boundary in charge of sensitive session context', () => {
    // This slice is what makes `sensitive` context reachable by a request at all:
    // retention is refused above `ordinary`, so before the session transport the
    // only context that could reach a provider was reference data. The gate is
    // therefore load-bearing now rather than theoretical.
    const policy = (allowSensitiveContext: boolean): AgentProviderPolicy => ({
      target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
      allowCloud: true,
      allowSensitiveContext,
      maxInputChars: 10_000,
      maxOutputTokens: 500,
    });
    const sensitive = [item('secret', false, { sensitivity: 'sensitive' })];

    expect(evaluateAgentProviderPrivacy(policy(false), 'explain', sensitive, []))
      .toMatchObject({ allowed: false, reason: 'sensitive-context', context: [] });
    expect(evaluateAgentProviderPrivacy(policy(true), 'explain', sensitive, []))
      .toMatchObject({ allowed: true });

    // A local target never consults the flag.
    expect(evaluateAgentProviderPrivacy(
      { ...policy(false), target: { kind: 'local', backend: 'local-qwen' } },
      'explain',
      sensitive,
      [],
    )).toMatchObject({ allowed: true });
  });
});
