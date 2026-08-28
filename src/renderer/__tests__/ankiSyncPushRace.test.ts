// @vitest-environment jsdom
/**
 * The manual Statistics sync and the pushed-snapshot listener fold the SAME data.
 *
 * `commitSnapshot` fires its listeners synchronously and only then resolves the
 * `anki:getIntervals` reply, so the push reaches the renderer FIRST. Both paths call
 * `bulkSetFromAnki`, which counts only entries whose level actually moved — so whichever
 * lands first takes every change with it and the other reports 0. That is how a sync that
 * wrote 41,535 words announced "0 updated" (L7_REVIEW_LEARNING.md, 2026-08-27): a false
 * success of exactly the kind rubric category 8 exists to catch.
 *
 * These tests drive the real module, not a re-implementation: the push handler is captured
 * from the stubbed `window.api` at import time, which is where the module registers it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntervalSnapshot } from '../../shared/anki';

type PushHandler = (snapshot: IntervalSnapshot) => void;

const store = new Map<string, string>();
let pushHandler: PushHandler | null = null;
let servedSnapshot: IntervalSnapshot;
let linkState: 'checking' | 'connected' | 'disconnected' = 'connected';
/** Fires the push the moment the manual sync asks, exactly as main orders the two. */
let pushOnRequest: IntervalSnapshot | null = null;

function snapshot(generatedAt: number, expressions: string[]): IntervalSnapshot {
  return {
    generatedAt,
    sourceQueries: ['deck:test'],
    entries: expressions.map((expression, i) => ({
      expression,
      ivlDays: 400, // comfortably past any "known" threshold
      noteId: 1000 + i,
      modelName: 'Basic',
    })),
    noteCount: expressions.length,
    truncated: false,
  };
}

beforeEach(() => {
  store.clear();
  pushHandler = null;
  pushOnRequest = null;
  linkState = 'connected';
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  });
  Object.defineProperty(window, 'api', {
    value: {
      onAnkiIntervalsChanged: (cb: PushHandler) => {
        pushHandler = cb;
        return () => undefined;
      },
      ankiGetIntervals: async () => {
        // Main pushes to every window before the invoke reply is delivered.
        if (pushOnRequest && pushHandler) pushHandler(pushOnRequest);
        return servedSnapshot;
      },
      ankiLinkState: async () => ({ state: linkState, consecutiveFailures: 0 }),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function loadModule(): Promise<typeof import('../ankiSync')> {
  vi.resetModules();
  return import('../ankiSync');
}

/** Let every queued microtask and the deferred-drain settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('manual sync versus the pushed snapshot', () => {
  it('reports the words it changed even when the push carries the same snapshot', async () => {
    const snap = snapshot(5_000_000_000_000, ['食べる', '走る', '見る']);
    servedSnapshot = snap;
    pushOnRequest = snap; // the race, reproduced in the order main produces it
    const { syncKnowledgeFromAnki } = await loadModule();

    const result = await syncKnowledgeFromAnki();

    expect(result.ok).toBe(true);
    expect(result.scanned).toBe(3);
    // Without the deferral the push folds first and this is 0 on a sync that wrote 3 words.
    expect(result.changed).toBe(3);
    expect(result.stale).toBeUndefined();
  });

  it('still applies a deferred push that is NEWER than what the sync folded', async () => {
    const served = snapshot(5_000_000_000_000, ['食べる']);
    const newer = snapshot(5_000_000_001_000, ['食べる', '走る', '見る']);
    servedSnapshot = served;
    pushOnRequest = newer;
    const { syncKnowledgeFromAnki } = await loadModule();
    const { knowledgeCounts } = await import('../knownWords');

    const result = await syncKnowledgeFromAnki();
    expect(result.changed).toBe(1); // the sync's own fold, honestly counted
    await settle();

    // The deferred push was not dropped: the two words only it knew about landed after.
    expect(knowledgeCounts()[3]).toBe(3);
  });

  it('drains the deferred push when the sync bails out without folding', async () => {
    const pushed = snapshot(5_000_000_000_000, ['食べる', '走る']);
    servedSnapshot = pushed;
    pushOnRequest = pushed;
    linkState = 'disconnected';
    const { syncKnowledgeFromAnki } = await loadModule();
    const { knowledgeCounts } = await import('../knownWords');

    const result = await syncKnowledgeFromAnki();
    expect(result.ok).toBe(false);
    await settle();

    // `foldedAt` stays 0 on the bail-out, so the push always wins and nothing is lost.
    expect(knowledgeCounts()[3]).toBe(2);
  });

  // NEGATIVE CONTROL: the listener must still be live when no sync is running, or the two
  // tests above would pass just as well against a handler that folds nothing at all.
  it('folds an ordinary push with no sync in flight', async () => {
    servedSnapshot = snapshot(5_000_000_000_000, []);
    const { syncKnowledgeFromAnki } = await loadModule();
    void syncKnowledgeFromAnki; // keep the import honest about what it loaded
    const { knowledgeCounts } = await import('../knownWords');

    expect(pushHandler).not.toBeNull();
    pushHandler?.(snapshot(5_000_000_002_000, ['歩く', '泳ぐ']));
    await settle();

    expect(knowledgeCounts()[3]).toBe(2);
  });
});
