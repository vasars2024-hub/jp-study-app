// @vitest-environment node
/**
 * The Agent shell's decisions, tested where they live.
 *
 * The component is a thin renderer over these functions on purpose: ordering,
 * phase selection and every state transform are assertable here without mounting
 * a tree, which is what makes them worth pinning.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_WORKSPACE_SCHEMA_VERSION,
  type AgentConversation,
  type AgentWorkspaceState,
} from '../../shared/agentWorkspace';
import {
  agentContextDisclosure,
  agentConversationSummaries,
  agentRailFocusTarget,
  agentSelectedConversation,
  agentShellPhase,
  agentWorkspaceWithNewConversation,
  agentWorkspaceWithPinToggled,
  agentWorkspaceWithSelection,
} from '../agentShellModel';

function conversation(overrides: Partial<AgentConversation> & { id: string }): AgentConversation {
  return {
    title: overrides.id,
    mode: 'ask',
    createdAt: 0,
    updatedAt: 0,
    pinned: false,
    archived: false,
    context: [],
    messages: [],
    ...overrides,
  };
}

function workspace(conversations: AgentConversation[], activeConversationId: string | null = null): AgentWorkspaceState {
  return { version: AGENT_WORKSPACE_SCHEMA_VERSION, activeConversationId, conversations };
}

describe('Agent conversation summaries', () => {
  it('puts pinned first, then the most recently touched, then a stable tiebreak', () => {
    const state = workspace([
      conversation({ id: 'b', updatedAt: 30 }),
      conversation({ id: 'a', updatedAt: 30 }),
      conversation({ id: 'old', updatedAt: 10 }),
      conversation({ id: 'kept', updatedAt: 5, pinned: true }),
    ]);
    expect(agentConversationSummaries(state).map((item) => item.id))
      .toEqual(['kept', 'a', 'b', 'old']);
  });

  it('leaves archived conversations out of the rail', () => {
    const state = workspace([
      conversation({ id: 'live' }),
      conversation({ id: 'filed', archived: true }),
    ]);
    expect(agentConversationSummaries(state).map((item) => item.id)).toEqual(['live']);
  });

  it('carries the retention and cloud facts the rail has to disclose', () => {
    const state = workspace([conversation({
      id: 'chat',
      context: [
        {
          id: 'kept', kind: 'reading-passage', label: 'Kept', preview: 'x',
          source: { app: 'reading' }, sensitivity: 'ordinary', retained: true, createdAt: 1,
        },
        {
          id: 'session', kind: 'selected-text', label: 'Session', preview: 'y',
          source: { app: 'reading' }, sensitivity: 'sensitive', retained: false, createdAt: 1,
        },
      ],
      messages: [{
        id: 'm1', conversationId: 'chat', role: 'assistant', status: 'complete',
        text: 'answer', createdAt: 1, updatedAt: 1, contextIds: [], attachments: [], cards: [],
        provider: {
          target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
          cloud: true, contextIds: [], attachmentIds: [], inputChars: 3, startedAt: 1,
        },
      }],
    })]);
    const [summary] = agentConversationSummaries(state);
    expect(summary.messageCount).toBe(1);
    expect(summary.usedCloud).toBe(true);
    expect(summary.context).toEqual({ retained: 1, sessionOnly: 1, sensitive: 1 });
  });

  it('reports an empty shelf as three zeros rather than nothing', () => {
    expect(agentContextDisclosure([])).toEqual({ retained: 0, sessionOnly: 0, sensitive: 0 });
  });
});

describe('Agent shell phase', () => {
  const state = workspace([conversation({ id: 'chat' })], 'chat');

  it('shows loading before anything else', () => {
    expect(agentShellPhase({ loading: true, failure: 'read-failed', state })).toBe('loading');
  });

  it('separates "no conversations" from "we could not find out"', () => {
    expect(agentShellPhase({ loading: false, failure: null, state: null })).toBe('empty');
    expect(agentShellPhase({ loading: false, failure: 'read-failed', state: null })).toBe('error');
    expect(agentShellPhase({ loading: false, failure: null, state: workspace([]) })).toBe('empty');
  });

  it('keeps showing a workspace it already has when a write fails', () => {
    // The file did not change, so the content on screen is still true; the
    // failure belongs in a banner, not in place of the conversation.
    expect(agentShellPhase({ loading: false, failure: 'write-failed', state })).toBe('ready');
  });

  it('resolves the active conversation, or nothing when the id is stale', () => {
    expect(agentSelectedConversation(state)?.id).toBe('chat');
    expect(agentSelectedConversation(workspace([conversation({ id: 'chat' })], 'gone'))).toBeNull();
    expect(agentSelectedConversation(workspace([conversation({ id: 'chat' })]))).toBeNull();
  });
});

describe('Agent workspace transforms', () => {
  it('returns null rather than an identical state, so no pointless save happens', () => {
    const state = workspace([conversation({ id: 'chat' })], 'chat');
    expect(agentWorkspaceWithSelection(state, 'chat')).toBeNull();
    expect(agentWorkspaceWithSelection(state, 'missing')).toBeNull();
    expect(agentWorkspaceWithSelection(state, 'other')).toBeNull();
  });

  it('selects an existing conversation', () => {
    const state = workspace([conversation({ id: 'a' }), conversation({ id: 'b' })], 'a');
    expect(agentWorkspaceWithSelection(state, 'b')?.activeConversationId).toBe('b');
  });

  it('appends a new conversation, activates it and refuses a duplicate or blank id', () => {
    const state = workspace([conversation({ id: 'a' })], 'a');
    const next = agentWorkspaceWithNewConversation(state, { id: 'b', title: 'New', now: 500 });
    expect(next?.activeConversationId).toBe('b');
    expect(next?.conversations.map((item) => item.id)).toEqual(['a', 'b']);
    expect(next?.conversations[1]).toMatchObject({
      title: 'New', mode: 'ask', createdAt: 500, updatedAt: 500, pinned: false, archived: false,
    });
    expect(agentWorkspaceWithNewConversation(state, { id: 'a', title: 'Dup', now: 500 })).toBeNull();
    expect(agentWorkspaceWithNewConversation(state, { id: '  ', title: 'Blank', now: 500 })).toBeNull();
  });

  it('toggles a pin and marks the conversation as touched', () => {
    const state = workspace([conversation({ id: 'a', updatedAt: 1 })], 'a');
    const pinned = agentWorkspaceWithPinToggled(state, 'a', 900);
    expect(pinned).not.toBeNull();
    expect(pinned?.conversations[0]).toMatchObject({ pinned: true, updatedAt: 900 });

    const unpinned = pinned ? agentWorkspaceWithPinToggled(pinned, 'a', 901) : null;
    expect(unpinned?.conversations[0]).toMatchObject({ pinned: false, updatedAt: 901 });
    expect(agentWorkspaceWithPinToggled(state, 'missing', 900)).toBeNull();
  });
});

describe('Agent rail keyboard movement', () => {
  const ids = ['a', 'b', 'c'];

  it('wraps in both directions', () => {
    expect(agentRailFocusTarget(ids, 'c', 1)).toBe('a');
    expect(agentRailFocusTarget(ids, 'a', -1)).toBe('c');
    expect(agentRailFocusTarget(ids, 'a', 1)).toBe('b');
  });

  it('enters the list from either end when focus is not on an entry yet', () => {
    expect(agentRailFocusTarget(ids, null, 1)).toBe('a');
    expect(agentRailFocusTarget(ids, 'unknown', -1)).toBe('c');
  });

  it('has nothing to move to in an empty rail', () => {
    expect(agentRailFocusTarget([], 'a', 1)).toBeNull();
  });
});
