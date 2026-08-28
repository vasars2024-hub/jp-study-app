import { describe, expect, it } from 'vitest';
import { classifyIntervalSyncOutcome } from '../anki';

// `anki:getIntervals` swallows a failed poll and serves the cached snapshot, so the manual
// Statistics sync cannot tell a refresh from a fallback by looking at the snapshot alone.
// These cases pin the two signals that separate them.
describe('classifyIntervalSyncOutcome', () => {
  const requestedAt = 1_000_000;

  it('calls a poll that finished after the request a refresh', () => {
    expect(
      classifyIntervalSyncOutcome({
        requestedAt,
        generatedAt: requestedAt + 4200,
        state: 'connected',
      }),
    ).toBe('refreshed');
  });

  it('accepts a snapshot stamped in the same millisecond as the request', () => {
    expect(
      classifyIntervalSyncOutcome({ requestedAt, generatedAt: requestedAt, state: 'connected' }),
    ).toBe('refreshed');
  });

  it('reports disconnected before it looks at the snapshot age', () => {
    // The measured defect: an AnkiConnect URL on a refused port still yielded a full
    // 87,260-entry snapshot, which was announced as "Synced 87,260 words — 0 updated".
    expect(
      classifyIntervalSyncOutcome({
        requestedAt,
        generatedAt: requestedAt - 9 * 60_000,
        state: 'disconnected',
      }),
    ).toBe('disconnected');
  });

  it('still reports disconnected when the served snapshot happens to be new', () => {
    expect(
      classifyIntervalSyncOutcome({
        requestedAt,
        generatedAt: requestedAt + 10,
        state: 'disconnected',
      }),
    ).toBe('disconnected');
  });

  it('reports stale when a connected link served a snapshot older than the request', () => {
    // Heartbeat has not caught up yet, or the poll failed for a reason the wire state does
    // not carry. Either way nothing was re-read, and the age is the proof.
    expect(
      classifyIntervalSyncOutcome({
        requestedAt,
        generatedAt: requestedAt - 1,
        state: 'connected',
      }),
    ).toBe('stale');
  });

  it('reports stale while the link is still checking', () => {
    expect(
      classifyIntervalSyncOutcome({
        requestedAt,
        generatedAt: requestedAt - 300_000,
        state: 'checking',
      }),
    ).toBe('stale');
  });

  // NEGATIVE CONTROL: the classifier must not be a constant. If every input returned the
  // same verdict the four cases above would pass just as happily.
  it('returns all three verdicts across the inputs above', () => {
    const verdicts = new Set([
      classifyIntervalSyncOutcome({ requestedAt, generatedAt: requestedAt + 1, state: 'connected' }),
      classifyIntervalSyncOutcome({ requestedAt, generatedAt: requestedAt - 1, state: 'connected' }),
      classifyIntervalSyncOutcome({ requestedAt, generatedAt: requestedAt + 1, state: 'disconnected' }),
    ]);
    expect(Array.from(verdicts).sort()).toEqual(['disconnected', 'refreshed', 'stale']);
  });
});
