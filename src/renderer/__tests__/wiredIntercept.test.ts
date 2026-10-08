// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  INTERCEPT_IDLE_MS,
  interceptCode,
  interceptGate,
  interceptPassed,
  nextInterceptAllowedAt,
  pickInterceptSource,
  type InterceptGateInput,
} from '../wiredMechanics/intercept';

const CLEAR = { reviewing: false, video: false, typing: false, locked: false, hidden: false };
const NOW = 10_000_000;

function gate(patch: Partial<InterceptGateInput> = {}): InterceptGateInput {
  return { now: NOW, enabled: true, lastAt: null, intervalMin: 30, idleForMs: INTERCEPT_IDLE_MS, blockers: CLEAR, ...patch };
}

describe('intercept gate', () => {
  it('fires when enabled, idle long enough and never fired before', () => {
    expect(interceptGate(gate())).toBe('ok');
  });

  it('needs the user to have been away', () => {
    expect(interceptGate(gate({ idleForMs: INTERCEPT_IDLE_MS - 1 }))).toBe('not-idle');
  });

  it('rate-limits to one per interval (default 30 minutes)', () => {
    expect(interceptGate(gate({ lastAt: NOW - 29 * 60_000 }))).toBe('rate-limited');
    expect(interceptGate(gate({ lastAt: NOW - 30 * 60_000 }))).toBe('ok');
    expect(interceptGate(gate({ lastAt: NOW - 59 * 60_000, intervalMin: 60 }))).toBe('rate-limited');
    expect(nextInterceptAllowedAt(NOW, 30)).toBe(NOW + 30 * 60_000);
    expect(nextInterceptAllowedAt(null, 30)).toBe(0);
  });

  it('never fires during review, video, typing, lock or a hidden window', () => {
    expect(interceptGate(gate({ blockers: { ...CLEAR, reviewing: true } }))).toBe('reviewing');
    expect(interceptGate(gate({ blockers: { ...CLEAR, video: true } }))).toBe('video');
    expect(interceptGate(gate({ blockers: { ...CLEAR, typing: true } }))).toBe('typing');
    expect(interceptGate(gate({ blockers: { ...CLEAR, locked: true } }))).toBe('locked');
    expect(interceptGate(gate({ blockers: { ...CLEAR, hidden: true } }))).toBe('hidden');
  });

  it('respects the setting', () => {
    expect(interceptGate(gate({ enabled: false }))).toBe('disabled');
  });

  it('manual trigger skips idle, interval and the setting but keeps hard blockers', () => {
    const manual = gate({ manual: true, enabled: false, idleForMs: 0, lastAt: NOW - 1000 });
    expect(interceptGate(manual)).toBe('ok');
    // Typed into the terminal: focus in a field is expected, not a blocker.
    expect(interceptGate({ ...manual, blockers: { ...CLEAR, typing: true } })).toBe('ok');
    expect(interceptGate({ ...manual, blockers: { ...CLEAR, reviewing: true } })).toBe('reviewing');
    expect(interceptGate({ ...manual, blockers: { ...CLEAR, locked: true } })).toBe('locked');
  });
});

describe('intercept source', () => {
  const cards = [
    { id: 'a', word: '猫', sentence: '猫が好きです。', srs: { intervalDays: 0 } },
    { id: 'b', word: '雨', sentence: '明日は雨が降るそうです。', srs: { intervalDays: 4 } },
    { id: 'c', word: '本', sentence: 'x', known: true },
    { id: 'd', word: 'dog', meaning: 'dog' },
  ];

  it('prefers sentences the user has already met', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = pickInterceptSource(cards, seed);
      expect(s).toMatchObject({ cardId: 'b', kind: 'sentence', text: '明日は雨が降るそうです。' });
    }
  });

  it('falls back to any mined sentence, then to a met word', () => {
    expect(pickInterceptSource([cards[0]], 1)).toMatchObject({ cardId: 'a', kind: 'sentence' });
    expect(pickInterceptSource([cards[2], cards[3]], 1)).toMatchObject({ cardId: 'c', kind: 'word', text: '本' });
    expect(pickInterceptSource([cards[3]], 1)).toBeNull();
    expect(pickInterceptSource([], 1)).toBeNull();
  });

  it('passes on exact or 90+ matches and codes the transmission', () => {
    expect(interceptPassed({ exact: true, score: 40 })).toBe(true);
    expect(interceptPassed({ exact: false, score: 90 })).toBe(true);
    expect(interceptPassed({ exact: false, score: 89 })).toBe(false);
    expect(interceptCode(0x4f2a)).toBe('ICP-4F2A');
  });
});
