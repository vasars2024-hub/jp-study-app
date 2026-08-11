// @vitest-environment node
/**
 * The card-batch staging slot — how a batch `flashcard.generate-cards` produced
 * in the Agent window reaches AI Card Studio's own preview editor.
 *
 * The properties under test are the three the image lane promises, plus the one
 * this store has and that one does not. **Single-use**, so two studios cannot
 * both adopt the same batch and save it twice. **Expiring**, whether or not
 * anyone comes for it. **Bounded**, by the shared normalizer, before anything is
 * held. And **one slot**: a second stage replaces an unclaimed first, which is
 * correct — "generate again" is a gesture the user makes — but must be
 * *reported* rather than silent, because the batch it replaced cost a provider
 * call.
 *
 * The registration test is the other half. A channel that is declared and never
 * handled reaches the renderer client as `bridge-unavailable`, which it treats
 * identically to a preload that predates the method — so a completely absent
 * main handler would look like an old window and the studio would simply never
 * adopt anything, silently.
 */
import os from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

interface FakeWindow {
  destroyed: boolean;
  sent: Array<{ channel: string; payload: unknown }>;
}

const registry = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  windows: [] as FakeWindow[],
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      registry.handlers.set(channel, handler);
    },
  },
  BrowserWindow: {
    getAllWindows: () => registry.windows.map((window) => ({
      isDestroyed: () => window.destroyed,
      webContents: {
        send: (channel: string, payload: unknown) => window.sent.push({ channel, payload }),
      },
    })),
  },
}));

import {
  AGENT_CARD_BATCH_BYTES_LIMIT,
  AGENT_CARD_BATCH_STAGING_CHANNELS,
  AGENT_CARD_BATCH_STAGING_TTL_MS,
} from '../../shared/agentCardBatchStaging';
import {
  createAgentCardBatchStagingStore,
  registerAgentCardBatchStagingIpc,
  type AgentCardBatchStagingStore,
} from '../agentCardBatchStaging';

const result = (expression: string, cards = 1): Record<string, unknown> => ({
  expression,
  reading: `${expression}-reading`,
  meaning: `${expression}-meaning`,
  cards: Array.from({ length: cards }, (_entry, index) => ({
    front: expression,
    back: `back-${index}`,
  })),
});

const request = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  deckLabel: 'Preset studio',
  source: 'preset',
  results: [result('珈琲')],
  ...patch,
});

/**
 * Fails loudly on an unregistered channel rather than throwing a TypeError
 * inside whichever assertion happened to come first.
 */
function handlerFor(channel: string): Handler {
  const found = registry.handlers.get(channel);
  if (!found) throw new Error(`no main handler is registered for ${channel}`);
  return found;
}

let store: AgentCardBatchStagingStore;

beforeEach(() => {
  registry.handlers.clear();
  registry.windows.length = 0;
  store = createAgentCardBatchStagingStore();
});

describe('the staging slot', () => {
  it('accepts a batch and reports what it holds', () => {
    const staged = store.stage(request({ results: [result('猫', 2), result('犬', 3)] }), 1_000);
    expect(staged).toEqual({ ok: true, results: 2, cards: 5, replacedUnclaimed: false });
    expect(store.pending(1_000)).toBe(true);
  });

  it('hands the batch back with an id the stager never chose', () => {
    store.stage(request(), 1_000);
    const taken = store.take(1_000);
    expect(taken.ok && taken.batch?.deckLabel).toBe('Preset studio');
    expect(taken.ok && taken.batch?.source).toBe('preset');
    expect(taken.ok && (taken.batch?.id.length ?? 0)).toBeGreaterThan(0);
  });

  /**
   * `stagedAt` is the store's own bookkeeping. Leaking it would put a field on
   * `AgentStagedCardBatch` that the shared normalizer does not carry, so a
   * re-normalized batch and a raw one would not be the same object.
   */
  it('does not leak its own timestamp into what the studio adopts', () => {
    store.stage(request(), 1_000);
    const taken = store.take(1_000);
    expect(taken.ok && taken.batch && 'stagedAt' in taken.batch).toBe(false);
  });

  it('is SINGLE-USE — a second take finds nothing', () => {
    store.stage(request(), 1_000);
    const first = store.take(1_000);
    expect(first.ok && first.batch?.deckLabel).toBe('Preset studio');
    expect(store.take(1_000)).toEqual({ ok: true, batch: null });
    expect(store.pending(1_000)).toBe(false);
  });

  it('an empty slot is success with no batch, not a failure', () => {
    expect(store.take(1_000)).toEqual({ ok: true, batch: null });
  });

  it('EXPIRES an unclaimed batch, whether or not anyone comes for it', () => {
    store.stage(request(), 1_000);
    const justInside = 1_000 + AGENT_CARD_BATCH_STAGING_TTL_MS - 1;
    expect(store.pending(justInside)).toBe(true);

    store = createAgentCardBatchStagingStore();
    store.stage(request(), 1_000);
    const atTtl = 1_000 + AGENT_CARD_BATCH_STAGING_TTL_MS;
    expect(store.pending(atTtl)).toBe(false);
    expect(store.take(atTtl)).toEqual({ ok: true, batch: null });
  });

  it('holds ONE slot, and says so when it replaces an unclaimed batch', () => {
    expect(store.stage(request({ results: [result('猫')] }), 1_000))
      .toMatchObject({ ok: true, replacedUnclaimed: false });
    const second = store.stage(request({ deckLabel: 'Second studio' }), 2_000);
    expect(second).toMatchObject({ ok: true, replacedUnclaimed: true });

    const taken = store.take(2_000);
    expect(taken.ok && taken.batch?.deckLabel).toBe('Second studio');
  });

  it('does not report a replacement when the first batch had already expired', () => {
    store.stage(request(), 1_000);
    const after = 1_000 + AGENT_CARD_BATCH_STAGING_TTL_MS + 1;
    expect(store.stage(request(), after)).toMatchObject({ replacedUnclaimed: false });
  });

  it('refuses a malformed batch without disturbing the one it is holding', () => {
    store.stage(request({ deckLabel: 'Keep me' }), 1_000);
    expect(store.stage({ deckLabel: '', results: [] }, 1_000))
      .toEqual({ ok: false, code: 'invalid-request' });
    expect(store.stage('not an object', 1_000))
      .toEqual({ ok: false, code: 'invalid-request' });
    const taken = store.take(1_000);
    expect(taken.ok && taken.batch?.deckLabel).toBe('Keep me');
  });

  /**
   * The bound is checked BEFORE the slot is touched, so an oversized stage
   * cannot be the thing that discarded a batch already waiting for review.
   */
  it('refuses an oversized batch and keeps the batch already waiting', () => {
    store.stage(request({ deckLabel: 'Waiting' }), 1_000);
    // One enormous field is NOT how the ceiling is reached: `boundedText` cuts it
    // to 4,000 characters, so this batch is accepted. That is the point of the
    // whole-payload ceiling existing in addition to the per-field bounds.
    const huge = {
      ...request(),
      results: [{ ...result('猫'), meaning: 'x'.repeat(AGENT_CARD_BATCH_BYTES_LIMIT + 10) }],
    };
    expect(store.stage(huge, 1_000).ok).toBe(true);

    // Size is reached the way a caller actually could: many individually legal
    // fields across the maximum number of results.
    const wide = {
      ...request(),
      results: Array.from({ length: 25 }, (_entry, index) => ({
        expression: `word-${index}`,
        meaning: 'x'.repeat(4_000),
        nuance: 'x'.repeat(4_000),
        sentence: 'x'.repeat(4_000),
        grammarBreakdown: 'x'.repeat(4_000),
        culturalContext: 'x'.repeat(4_000),
        csv: 'x'.repeat(20_000),
        cards: Array.from({ length: 10 }, () => ({
          front: 'f'.repeat(4_000),
          back: 'b'.repeat(4_000),
        })),
      })),
    };
    store = createAgentCardBatchStagingStore();
    store.stage(request({ deckLabel: 'Waiting' }), 1_000);
    expect(store.stage(wide, 1_000)).toEqual({ ok: false, code: 'too-large' });

    const taken = store.take(1_000);
    expect(taken.ok && taken.batch?.deckLabel).toBe('Waiting');
  });

  it('carries the collision-free deck id through, and omits it when absent', () => {
    store.stage(request({ deckBookId: 'ai-item-9-ch3-7' }), 1_000);
    const withId = store.take(1_000);
    expect(withId.ok && withId.batch?.deckBookId).toBe('ai-item-9-ch3-7');

    store.stage(request(), 2_000);
    const withoutId = store.take(2_000);
    expect(withoutId.ok && withoutId.batch && 'deckBookId' in withoutId.batch).toBe(false);
  });
});

describe('registration', () => {
  beforeEach(() => {
    registerAgentCardBatchStagingIpc(() => store);
  });

  it('handles both declared channels — an unhandled one is a silent no-op at the far end', () => {
    expect(registry.handlers.has(AGENT_CARD_BATCH_STAGING_CHANNELS.stage)).toBe(true);
    expect(registry.handlers.has(AGENT_CARD_BATCH_STAGING_CHANNELS.take)).toBe(true);
  });

  it('stages and takes through the handlers, not just through the store', async () => {
    const stage = handlerFor(AGENT_CARD_BATCH_STAGING_CHANNELS.stage);
    const take = handlerFor(AGENT_CARD_BATCH_STAGING_CHANNELS.take);
    expect(await stage(null, request())).toMatchObject({ ok: true, results: 1, cards: 1 });
    const taken = (await take(null)) as { ok: boolean; batch: { deckLabel: string } | null };
    expect(taken.batch?.deckLabel).toBe('Preset studio');
  });

  it('announces an accepted batch to every live window', async () => {
    registry.windows.push({ destroyed: false, sent: [] }, { destroyed: false, sent: [] });
    const stage = handlerFor(AGENT_CARD_BATCH_STAGING_CHANNELS.stage);
    await stage(null, request());
    for (const window of registry.windows) {
      expect(window.sent.map((entry) => entry.channel))
        .toEqual([AGENT_CARD_BATCH_STAGING_CHANNELS.staged]);
    }
  });

  /**
   * The announcement carries the batch id and nothing else in the image lane;
   * here it carries nothing at all. The cards stay in main until a window
   * claims them, so a broadcast can never be the thing that copies a batch into
   * a renderer that was not asking for one.
   */
  it('announces with no payload, so the broadcast cannot be the copy', async () => {
    registry.windows.push({ destroyed: false, sent: [] });
    await handlerFor(AGENT_CARD_BATCH_STAGING_CHANNELS.stage)(null, request());
    expect(registry.windows[0].sent[0].payload).toBeUndefined();
  });

  it('does not announce a refused stage', async () => {
    registry.windows.push({ destroyed: false, sent: [] });
    await handlerFor(AGENT_CARD_BATCH_STAGING_CHANNELS.stage)(null, { deckLabel: '' });
    expect(registry.windows[0].sent).toEqual([]);
  });

  it('skips a destroyed window rather than throwing away an accepted batch', async () => {
    registry.windows.push({ destroyed: true, sent: [] }, { destroyed: false, sent: [] });
    const staged = await handlerFor(AGENT_CARD_BATCH_STAGING_CHANNELS.stage)(
      null,
      request(),
    );
    expect(staged).toMatchObject({ ok: true });
    expect(registry.windows[0].sent).toEqual([]);
    expect(registry.windows[1].sent).toHaveLength(1);
  });
});
