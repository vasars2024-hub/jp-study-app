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
  AGENT_WORKSPACE_MODES,
  AGENT_WORKSPACE_SCHEMA_VERSION,
  normalizeAgentWorkspaceState,
  type AgentConversation,
  type AgentMessage,
  type AgentWorkspaceState,
} from '../../shared/agentWorkspace';
import {
  agentContextDisclosure,
  agentConversationSummaries,
  agentHistorySearch,
  agentRailFocusTarget,
  agentSelectedConversation,
  agentShellPhase,
  agentWorkspaceWithContextAttached,
  agentWorkspaceWithContextDetached,
  agentWorkspaceWithMode,
  agentWorkspaceWithNewConversation,
  agentWorkspaceWithPinToggled,
  agentWorkspaceWithSelection,
} from '../agentShellModel';
import { createAgentContextItem } from '../../shared/agentContext';

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
  return {
    version: AGENT_WORKSPACE_SCHEMA_VERSION,
    revision: 0,
    activeConversationId,
    conversations,
  };
}

function message(conversationId: string, id: string, text: string): AgentMessage {
  return {
    id,
    conversationId,
    role: 'assistant',
    status: 'complete',
    text,
    createdAt: 1,
    updatedAt: 1,
    contextIds: [],
    attachments: [],
    cards: [],
  };
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

  it('switches the workflow preset, and reports no change when it is already set', () => {
    // The mode was display-only for four slices: the type carried all six, the
    // normalizer validated them and the shell drew the chip, but nothing ever
    // wrote one, so every conversation was `ask` forever. This is the write.
    const state = workspace([conversation({ id: 'a' }), conversation({ id: 'b' })]);

    const switched = agentWorkspaceWithMode(state, 'a', 'analyze', 900);
    expect(switched?.conversations[0]).toMatchObject({ mode: 'analyze', updatedAt: 900 });
    // Only the named conversation moves — a mode is per-conversation, not a
    // workspace-wide setting.
    expect(switched?.conversations[1]).toMatchObject({ mode: 'ask', updatedAt: 0 });

    // Re-selecting the same mode is not an edit, so the shell can skip the save
    // rather than rewriting the workspace file on every change event a `select`
    // fires.
    expect(switched ? agentWorkspaceWithMode(switched, 'a', 'analyze', 901) : null).toBeNull();
    expect(agentWorkspaceWithMode(state, 'missing', 'study', 900)).toBeNull();
  });

  it('finds stored history by substring, folding width and case on both sides', () => {
    // Japanese has no required word spaces, so a token split would fail exactly
    // the queries this app exists to serve. NFKC folding is what makes a
    // half-width katakana query find text stored full-width, and vice versa.
    const state = workspace([
      conversation({
        id: 'a',
        title: 'Ramen notes',
        updatedAt: 100,
        messages: [message('a', 'm1', 'ラーメンが好きです'), message('a', 'm2', 'Second line')],
      }),
      conversation({ id: 'b', title: 'ＲＡＭＥＮ shop', updatedAt: 200, messages: [] }),
    ]);

    expect(agentHistorySearch(state, 'ﾗｰﾒﾝ').map((m) => m.conversationId)).toEqual(['a']);
    expect(agentHistorySearch(state, 'ラーメン')[0].snippet).toContain('ラーメン');
    // Full-width title found by a plain ASCII query, and case-folded.
    expect(agentHistorySearch(state, 'ramen').map((m) => m.conversationId)).toEqual(['b', 'a']);
    expect(agentHistorySearch(state, 'ramen')[0]).toMatchObject({ titleMatched: true, messageMatches: 0 });
  });

  it('returns one row per conversation, counting the rest', () => {
    // A single long chat would otherwise flood the list and bury every other
    // conversation that matched once.
    const state = workspace([
      conversation({
        id: 'a',
        updatedAt: 100,
        messages: [
          message('a', 'm1', 'first hit here'),
          message('a', 'm2', 'nothing'),
          message('a', 'm3', 'second hit here'),
        ],
      }),
    ]);
    const [hit] = agentHistorySearch(state, 'hit');
    expect(hit.messageMatches).toBe(2);
    // The snippet comes from the NEWEST match, which is the one worth showing.
    expect(hit.snippet).toContain('second hit here');
  });

  it('finds archived conversations, and says that is what they are', () => {
    // Searching history is precisely when someone wants the conversation they
    // put away, so the rail's archived filter must not apply here — but the flag
    // travels so the surface can mark it rather than implying it is on the rail.
    const state = workspace([
      conversation({ id: 'a', archived: true, updatedAt: 100, messages: [message('a', 'm1', 'buried treasure')] }),
    ]);
    expect(agentConversationSummaries(state)).toEqual([]);
    expect(agentHistorySearch(state, 'treasure')).toMatchObject([{ conversationId: 'a', archived: true }]);
  });

  it('does not search the context shelf, which is not history', () => {
    // The shelf is what the Agent can see now, and a session-only item does not
    // survive a restart — a result pointing at one would vanish between launches.
    const item = createAgentContextItem({
      kind: 'selected-text',
      label: 'unmistakable-shelf-text',
      preview: 'unmistakable-shelf-text',
      source: { app: 'reading' },
      identity: 'unmistakable-shelf-text',
      now: 10,
    });
    const state = workspace([conversation({ id: 'a', context: item ? [item] : [] })]);
    expect(agentHistorySearch(state, 'unmistakable-shelf-text')).toEqual([]);
  });

  it('bounds the snippet instead of returning the whole message', () => {
    const long = `${'あ'.repeat(400)}目印${'い'.repeat(400)}`;
    const state = workspace([conversation({ id: 'a', messages: [message('a', 'm1', long)] })]);
    const [hit] = agentHistorySearch(state, '目印');
    expect(hit.snippet.length).toBeLessThan(120);
    expect(hit.snippet).toContain('目印');
    // Cut on both sides, so both ellipses are present and neither is invented.
    expect(hit.snippet.startsWith('…')).toBe(true);
    expect(hit.snippet.endsWith('…')).toBe(true);
  });

  it('treats a blank query as "no search" rather than "everything"', () => {
    const state = workspace([conversation({ id: 'a', messages: [message('a', 'm1', 'anything')] })]);
    expect(agentHistorySearch(state, '')).toEqual([]);
    expect(agentHistorySearch(state, '   ')).toEqual([]);
  });

  it('offers every mode the normalizer accepts, in a stable order with ask first', () => {
    // The picker renders from this list, the router keys its presets off it and
    // the normalizer validates against it. A second hand-written list anywhere
    // would be the thing that drifts, so the shared one is asserted here.
    expect(AGENT_WORKSPACE_MODES[0]).toBe('ask');
    expect([...AGENT_WORKSPACE_MODES].sort()).toEqual(
      ['analyze', 'ask', 'automate', 'create', 'navigate', 'study'],
    );
    // Every one of them survives a round trip through the store's normalizer,
    // or the picker would offer a mode that silently reverts to `ask` on save.
    for (const mode of AGENT_WORKSPACE_MODES) {
      const state = workspace([conversation({ id: 'a', mode })]);
      expect(normalizeAgentWorkspaceState(state).conversations[0].mode).toBe(mode);
    }
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

/**
 * Attaching context is the hand-off path: a user asking the Agent about a word
 * from the Dictionary has no conversation open yet, so "attach" has to mean the
 * same thing from an empty workspace as from a busy one. These pin that, and the
 * `null`-when-nothing-changes convention the shell relies on to avoid rewriting
 * the main-owned file on every click.
 */
describe('Agent context attachment', () => {
  const NOW = 1_800_000_000_000;
  const item = (identity = 'taberu') => {
    const built = createAgentContextItem({
      kind: 'dictionary-entry',
      label: identity,
      preview: 'to eat',
      source: { app: 'dictionary' },
      identity,
      now: NOW,
    });
    if (!built) throw new Error('expected an item');
    return built;
  };
  const handoff = { newConversation: { id: 'chat-new', title: 'From Dictionary' }, now: NOW };

  it('creates and selects a conversation when the workspace is empty', () => {
    const next = agentWorkspaceWithContextAttached(workspace([]), item(), handoff);
    expect(next?.activeConversationId).toBe('chat-new');
    expect(next?.conversations).toHaveLength(1);
    expect(next?.conversations[0].context.map((entry) => entry.id))
      .toEqual(['dictionary-entry:taberu']);
  });

  it('attaches to the active conversation rather than making another', () => {
    const state = workspace([conversation({ id: 'a' }), conversation({ id: 'b' })], 'b');
    const next = agentWorkspaceWithContextAttached(state, item(), handoff);
    expect(next?.conversations).toHaveLength(2);
    expect(next?.activeConversationId).toBe('b');
    expect(next?.conversations.find((entry) => entry.id === 'b')?.context).toHaveLength(1);
    expect(next?.conversations.find((entry) => entry.id === 'a')?.context).toEqual([]);
  });

  it('honours an explicit target over the active conversation', () => {
    const state = workspace([conversation({ id: 'a' }), conversation({ id: 'b' })], 'b');
    const next = agentWorkspaceWithContextAttached(state, item(), { ...handoff, conversationId: 'a' });
    expect(next?.activeConversationId).toBe('a');
    expect(next?.conversations.find((entry) => entry.id === 'a')?.context).toHaveLength(1);
  });

  it('creates a conversation when the active id points at nothing', () => {
    const next = agentWorkspaceWithContextAttached(workspace([], 'ghost'), item(), handoff);
    expect(next?.conversations.map((entry) => entry.id)).toEqual(['chat-new']);
  });

  it('stamps updatedAt on the conversation it touched', () => {
    const state = workspace([conversation({ id: 'a', updatedAt: 1 })], 'a');
    const next = agentWorkspaceWithContextAttached(state, item(), { ...handoff, now: NOW + 50 });
    expect(next?.conversations[0].updatedAt).toBe(NOW + 50);
  });

  it('returns null when the same context is already at the front of the active conversation', () => {
    const existing = item();
    const state = workspace([conversation({ id: 'a', context: [existing] })], 'a');
    expect(agentWorkspaceWithContextAttached(state, existing, handoff)).toBeNull();
  });

  it('still selects when the context is unchanged but the conversation was not active', () => {
    // Re-asking about a word already attached to a background conversation should
    // bring that conversation forward, not silently do nothing.
    const existing = item();
    const state = workspace(
      [conversation({ id: 'a', context: [existing] }), conversation({ id: 'b' })],
      'b',
    );
    const next = agentWorkspaceWithContextAttached(state, existing, { ...handoff, conversationId: 'a' });
    expect(next?.activeConversationId).toBe('a');
    expect(next?.conversations.find((entry) => entry.id === 'a')?.context).toHaveLength(1);
  });
});

describe('Agent context removal', () => {
  const NOW = 1_800_000_000_000;
  const built = createAgentContextItem({
    kind: 'dictionary-entry',
    label: 'taberu',
    source: { app: 'dictionary' },
    identity: 'taberu',
    now: NOW,
  });
  if (!built) throw new Error('expected an item');

  it('detaches from the named conversation and stamps it', () => {
    const state = workspace([conversation({ id: 'a', context: [built] })], 'a');
    const next = agentWorkspaceWithContextDetached(state, 'a', built.id, NOW + 5);
    expect(next?.conversations[0].context).toEqual([]);
    expect(next?.conversations[0].updatedAt).toBe(NOW + 5);
  });

  it('returns null for an unknown conversation or an unknown context id', () => {
    const state = workspace([conversation({ id: 'a', context: [built] })], 'a');
    expect(agentWorkspaceWithContextDetached(state, 'nope', built.id, NOW)).toBeNull();
    expect(agentWorkspaceWithContextDetached(state, 'a', 'nope', NOW)).toBeNull();
  });

  it('leaves other conversations alone', () => {
    const state = workspace(
      [conversation({ id: 'a', context: [built] }), conversation({ id: 'b', context: [built] })],
      'a',
    );
    const next = agentWorkspaceWithContextDetached(state, 'a', built.id, NOW);
    expect(next?.conversations.find((entry) => entry.id === 'b')?.context).toHaveLength(1);
  });
});
