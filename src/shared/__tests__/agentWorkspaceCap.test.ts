/**
 * Conversation history has a real size budget: oldest unpinned conversations go first,
 * the open and pinned ones are kept (trimmed only as a last resort), and saved prompts
 * are never touched.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_CONVERSATION_MAX_MESSAGES,
  AGENT_WORKSPACE_SCHEMA_VERSION,
  capAgentWorkspaceHistory,
  normalizeAgentWorkspaceState,
  type AgentConversation,
  type AgentMessage,
  type AgentWorkspaceState,
} from '../agentWorkspace';

function message(conversationId: string, i: number, size = 100): AgentMessage {
  return {
    id: `${conversationId}-m${i}`,
    conversationId,
    role: i % 2 ? 'assistant' : 'user',
    status: 'complete',
    text: 'x'.repeat(size),
    createdAt: i,
    updatedAt: i,
    contextIds: [],
    attachments: [],
    cards: [],
  };
}

function conversation(id: string, updatedAt: number, count: number, patch: Partial<AgentConversation> = {}): AgentConversation {
  return {
    id,
    title: id,
    mode: 'ask',
    createdAt: 0,
    updatedAt,
    pinned: false,
    archived: false,
    context: [],
    messages: Array.from({ length: count }, (_, i) => message(id, i)),
    ...patch,
  };
}

function state(conversations: AgentConversation[], active: string | null = null): AgentWorkspaceState {
  return {
    version: AGENT_WORKSPACE_SCHEMA_VERSION,
    revision: 3,
    activeConversationId: active,
    conversations,
    prompts: [{ id: 'p1', title: 'Saved', text: 'keep me', createdAt: 0, updatedAt: 0 }],
  };
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

describe('capAgentWorkspaceHistory', () => {
  it('returns the same object when the workspace already fits', () => {
    const small = state([conversation('a', 1, 3)]);
    expect(capAgentWorkspaceHistory(small)).toBe(small);
  });

  it('keeps only the newest messages of a very long conversation', () => {
    const long = state([conversation('a', 1, AGENT_CONVERSATION_MAX_MESSAGES + 25, {})]);
    const capped = capAgentWorkspaceHistory(long);
    expect(capped.conversations[0].messages).toHaveLength(AGENT_CONVERSATION_MAX_MESSAGES);
    expect(capped.conversations[0].messages[0].id).toBe('a-m25');
  });

  it('drops least recently used conversations first, never pinned or open ones', () => {
    const input = state([
      conversation('old', 1, 40),
      conversation('pinned-old', 0, 40, { pinned: true }),
      conversation('open-old', 2, 40),
      conversation('newer', 50, 40),
      conversation('newest', 99, 40),
    ], 'open-old');
    const budget = bytes(input) - 3_000;
    const capped = capAgentWorkspaceHistory(input, budget);
    const ids = capped.conversations.map((c) => c.id);
    expect(ids).not.toContain('old');
    expect(ids).toEqual(expect.arrayContaining(['pinned-old', 'open-old', 'newest']));
    expect(bytes(capped)).toBeLessThanOrEqual(budget);
    expect(capped.prompts).toEqual(input.prompts);
    expect(capped.revision).toBe(3);
  });

  it('trims the oldest messages of kept conversations only when nothing else is left to drop', () => {
    const input = state([conversation('pinned', 1, 200, { pinned: true })], null);
    const budget = Math.floor(bytes(input) / 2);
    const capped = capAgentWorkspaceHistory(input, budget);
    const kept = capped.conversations[0].messages;
    expect(kept.length).toBeLessThan(200);
    expect(kept.length).toBeGreaterThanOrEqual(20);
    // The newest message always survives.
    expect(kept[kept.length - 1].id).toBe('pinned-m199');
    expect(bytes(capped)).toBeLessThanOrEqual(budget);
  });

  it('counts what it removed, so the shell can say the history was shortened', () => {
    const long = state([conversation('a', 1, AGENT_CONVERSATION_MAX_MESSAGES + 25, { trimmedMessages: 5 })]);
    expect(capAgentWorkspaceHistory(long).conversations[0].trimmedMessages).toBe(30);

    const input = state([conversation('old', 1, 40), conversation('open', 2, 40)], 'open');
    const capped = capAgentWorkspaceHistory({ ...input, droppedConversations: 2 }, bytes(input) - 3_000);
    expect(capped.droppedConversations).toBe(3);
    // A conversation that was never cut carries no count at all.
    expect(capped.conversations[0].trimmedMessages).toBeUndefined();
  });

  it('keeps the counts through normalization and drops nonsense', () => {
    const normalized = normalizeAgentWorkspaceState({
      ...state([conversation('a', 1, 2, { trimmedMessages: 12 }), conversation('b', 1, 2, { trimmedMessages: -3 } as never)]),
      droppedConversations: 4,
    });
    expect(normalized.droppedConversations).toBe(4);
    expect(normalized.conversations[0].trimmedMessages).toBe(12);
    expect(normalized.conversations[1].trimmedMessages).toBeUndefined();
  });
});
