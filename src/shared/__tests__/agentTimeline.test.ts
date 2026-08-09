/**
 * The timeline's value is entirely in what it refuses to lose and what it
 * refuses to invent, so those are what these pin hardest: a terminal attempt is
 * never rewritten by the retry that follows it, and a transition with nothing in
 * flight records nothing at all.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_TIMELINE_LIMIT,
  agentTimelineForConversation,
  agentTimelineRecord,
  isAgentTimelineTerminal,
  type AgentTimelineEntry,
  type AgentTimelineTarget,
} from '../agentTimeline';

const NOW = 1_700_000_000_000;

const target = (over: Partial<AgentTimelineTarget> = {}): AgentTimelineTarget => ({
  conversationId: 'chat-1',
  messageId: 'msg-1',
  cardId: 'card-1',
  actionId: 'action-1',
  effect: 'navigate',
  ...over,
});

describe('agentTimelineRecord', () => {
  it('opens an attempt on review and carries it to a terminal state', () => {
    let entries: AgentTimelineEntry[] = [];
    entries = agentTimelineRecord(entries, target(), { type: 'review' }, NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 'review', attempt: 1, startedAt: NOW, updatedAt: NOW });

    entries = agentTimelineRecord(entries, target(), { type: 'running' }, NOW + 10);
    entries = agentTimelineRecord(entries, target(), { type: 'succeeded' }, NOW + 20);
    expect(entries).toHaveLength(1);
    // The attempt keeps the moment it opened and gains the moment it settled.
    expect(entries[0]).toMatchObject({ status: 'succeeded', startedAt: NOW, updatedAt: NOW + 20 });
  });

  it('appends a second attempt instead of rewriting the failure before it', () => {
    let entries = agentTimelineRecord([], target(), { type: 'review' }, NOW);
    entries = agentTimelineRecord(entries, target(), { type: 'failed', code: 'open-failed' }, NOW + 5);
    entries = agentTimelineRecord(entries, target(), { type: 'review' }, NOW + 100);

    expect(entries).toHaveLength(2);
    // Newest first, and the original failure is still exactly what it was.
    expect(entries[0]).toMatchObject({ status: 'review', attempt: 2, startedAt: NOW + 100 });
    expect(entries[1]).toMatchObject({ status: 'failed', attempt: 1, code: 'open-failed', updatedAt: NOW + 5 });
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  it('records a refusal as a failed attempt carrying its code', () => {
    let entries = agentTimelineRecord([], target(), { type: 'review' }, NOW);
    entries = agentTimelineRecord(entries, target(), { type: 'refused', code: 'unknown-section' }, NOW + 5);
    expect(entries[0]).toMatchObject({ status: 'failed', code: 'unknown-section' });
  });

  it('never invents an attempt for a transition with nothing in flight', () => {
    // A completion no approval preceded is the one claim this module exists to
    // make impossible.
    expect(agentTimelineRecord([], target(), { type: 'succeeded' }, NOW)).toEqual([]);

    const settled = agentTimelineRecord(
      agentTimelineRecord([], target(), { type: 'review' }, NOW),
      target(),
      { type: 'cancelled' },
      NOW + 5,
    );
    // A stray transition after the attempt settled changes nothing.
    expect(agentTimelineRecord(settled, target(), { type: 'succeeded' }, NOW + 9)).toEqual(settled);
  });

  it('treats a second review of a live attempt as the same attempt', () => {
    let entries = agentTimelineRecord([], target(), { type: 'review' }, NOW);
    entries = agentTimelineRecord(entries, target(), { type: 'review' }, NOW + 3);
    expect(entries).toHaveLength(1);
    expect(entries[0].attempt).toBe(1);
  });

  it('keeps attempts for different actions apart', () => {
    let entries = agentTimelineRecord([], target(), { type: 'review' }, NOW);
    entries = agentTimelineRecord(entries, target({ actionId: 'action-2' }), { type: 'review' }, NOW + 1);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.actionId)).toEqual(['action-2', 'action-1']);
  });

  it('stores no destination — ids only', () => {
    const entries = agentTimelineRecord([], target(), { type: 'review' }, NOW);
    const keys = Object.keys(entries[0]);
    for (const forbidden of ['section', 'page', 'destination', 'route', 'url', 'label']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('drops the oldest attempts rather than the newest when full', () => {
    let entries: AgentTimelineEntry[] = [];
    for (let i = 0; i < AGENT_TIMELINE_LIMIT + 5; i += 1) {
      entries = agentTimelineRecord(entries, target({ actionId: `action-${i}` }), { type: 'review' }, NOW + i);
    }
    expect(entries).toHaveLength(AGENT_TIMELINE_LIMIT);
    expect(entries[0].actionId).toBe(`action-${AGENT_TIMELINE_LIMIT + 4}`);
  });
});

describe('agentTimelineForConversation', () => {
  it('returns only the asked-for conversation, newest first', () => {
    let entries = agentTimelineRecord([], target(), { type: 'review' }, NOW);
    entries = agentTimelineRecord(entries, target({ conversationId: 'chat-2' }), { type: 'review' }, NOW + 1);
    entries = agentTimelineRecord(entries, target({ actionId: 'action-2' }), { type: 'review' }, NOW + 2);

    expect(agentTimelineForConversation(entries, 'chat-1').map((e) => e.actionId))
      .toEqual(['action-2', 'action-1']);
    expect(agentTimelineForConversation(entries, 'chat-2')).toHaveLength(1);
    expect(agentTimelineForConversation(entries, 'missing')).toEqual([]);
  });
});

describe('isAgentTimelineTerminal', () => {
  it('names exactly the states that can no longer change', () => {
    expect(['succeeded', 'failed', 'cancelled'].every(isAgentTimelineTerminal as never)).toBe(true);
    expect(['review', 'running'].some(isAgentTimelineTerminal as never)).toBe(false);
  });
});
