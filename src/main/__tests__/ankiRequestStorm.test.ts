// @vitest-environment node
/**
 * The AnkiConnect request storm (E2E: 348 `modelFieldNames` in one five-minute
 * run), counted against the fake AnkiConnect at the fetch level so the real
 * client, cache and batching run. No Anki, no window.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { once: () => undefined, getPath: () => '' },
  ipcMain: { handle: () => undefined },
}));

import { FakeAnkiConnect } from './fakeAnkiConnect';
import { AnkiError, invoke } from '../anki/client';
import {
  FIELDS_TTL_MS,
  MISSING_TTL_MS,
  getModelFieldNames,
  invalidateModelFieldNames,
  primeModelFieldNames,
  resetModelFieldCacheForTests,
} from '../anki/modelFields';
import { checkAnkiDuplicates } from '../anki/extensionDuplicates';
import {
  DISCONNECTED_PROBE_MAX_MS,
  disconnectedProbeDelay,
  getLinkStatus,
  resetHeartbeatForTests,
  startHeartbeat,
  stopHeartbeat,
} from '../anki/heartbeat';

let fake: FakeAnkiConnect;
let clock = 1_000_000;

beforeEach(() => {
  fake = new FakeAnkiConnect();
  fake.models['Gum JA'] = ['Term', 'Reading', 'Meaning'];
  fake.models.Basic = ['Front', 'Back'];
  vi.stubGlobal('fetch', fake.fetch);
  clock = 1_000_000;
  resetModelFieldCacheForTests(() => clock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('note-type field names: cached per model, deduped, batched', () => {
  it('twenty concurrent asks for one note type are one request; later asks are none', async () => {
    const answers = await Promise.all(Array.from({ length: 20 }, () => getModelFieldNames('Gum JA')));
    expect(new Set(answers.map((a) => a.join('|')))).toEqual(new Set(['Term|Reading|Meaning']));
    for (let i = 0; i < 50; i++) await getModelFieldNames('Gum JA');
    expect(fake.count('modelFieldNames')).toBe(1);
    expect(fake.requests).toBe(1);
  });

  it('a missing note type is asked once and its refusal is remembered', async () => {
    for (let i = 0; i < 30; i++) {
      await expect(getModelFieldNames('Nope')).rejects.toBeInstanceOf(AnkiError);
    }
    expect(fake.count('modelFieldNames')).toBe(1);
    // Remembered for MISSING_TTL_MS, then asked again (the user may have created it in Anki).
    clock += MISSING_TTL_MS + 1;
    await expect(getModelFieldNames('Nope')).rejects.toThrow(/model was not found/);
    expect(fake.count('modelFieldNames')).toBe(2);
  });

  it('several note types asked in the same turn share ONE multi request', async () => {
    const [a, b] = await Promise.all([
      getModelFieldNames('Gum JA'),
      getModelFieldNames('Basic'),
      getModelFieldNames('Missing').catch((err: unknown) => err),
    ]);
    expect(a).toEqual(['Term', 'Reading', 'Meaning']);
    expect(b).toEqual(['Front', 'Back']);
    expect(fake.count('modelFieldNames')).toBe(3);
    expect(fake.requests).toBe(1);
  });

  it('refresh, invalidation and the TTL ask again; a fresh note type is primed', async () => {
    await getModelFieldNames('Gum JA');
    await getModelFieldNames('Gum JA', { refresh: true });
    expect(fake.count('modelFieldNames')).toBe(2);
    invalidateModelFieldNames(); // reconnect
    await getModelFieldNames('Gum JA');
    expect(fake.count('modelFieldNames')).toBe(3);
    clock += FIELDS_TTL_MS + 1;
    await getModelFieldNames('Gum JA');
    expect(fake.count('modelFieldNames')).toBe(4);
    primeModelFieldNames('Created', ['A', 'B']);
    expect(await getModelFieldNames('Created')).toEqual(['A', 'B']);
    expect(fake.count('modelFieldNames')).toBe(4);
  });

  it('a "model was not found" from any action drops that note type', async () => {
    fake.extraHandler = (action, params) => {
      if (action === 'addNote') throw new Error(`model was not found: ${String((params.note as { modelName: string }).modelName)}`);
      return null;
    };
    await getModelFieldNames('Gum JA');
    await expect(invoke('addNote', {
      note: { deckName: 'D', modelName: 'Gum JA', fields: {}, tags: [], options: { allowDuplicate: false } },
    })).rejects.toThrow(/model was not found/);
    await getModelFieldNames('Basic');
    await getModelFieldNames('Gum JA');
    expect(fake.calls.filter((c) => c.action === 'modelFieldNames').map((c) => c.params.modelName)).toEqual(['Gum JA', 'Basic', 'Gum JA']);
  });

  it('an in-flight answer cannot refill an entry invalidated meanwhile', async () => {
    const first = getModelFieldNames('Gum JA');
    invalidateModelFieldNames('Gum JA');
    fake.models['Gum JA'] = ['Term', 'Reading', 'Meaning', 'Audio'];
    await first;
    expect(await getModelFieldNames('Gum JA')).toEqual(['Term', 'Reading', 'Meaning', 'Audio']);
  });
});

describe('the dictionary\'s "already in Anki?" marker', () => {
  it('re-renders against targets whose note type is missing cost one request, not one per render', async () => {
    const targets = [
      { deckName: 'Mining', modelName: 'Gum JA' },
      { deckName: 'Sentences', modelName: 'Lapis' }, // not in this collection
      { deckName: 'Kanji', modelName: 'Kanji Card' }, // not in this collection
    ];
    fake.extraHandler = (action, params) =>
      action === 'canAddNotes' ? { result: (params.notes as unknown[]).map(() => true) } : null;
    for (let render = 0; render < 40; render++) {
      const replies = await Promise.all(targets.map((t) => checkAnkiDuplicates(['猫'], t)));
      expect(replies.every((r) => r.ok)).toBe(true);
      expect(replies[1]).toMatchObject({ ok: true, duplicates: {}, missingModel: true });
    }
    // Before: 40 renders x 3 targets = 120 `modelFieldNames`. Now: one per note type.
    expect(fake.count('modelFieldNames')).toBe(3);
    // The first render's three asks went out as one `multi`.
    expect(fake.count('canAddNotes')).toBe(40);
  });

  it('a mapped term field is checked with one multi of findNotes, not one request per word', async () => {
    fake.models.Sentence = ['Sentence', 'Word'];
    await getModelFieldNames('Sentence');
    const before = fake.requests;
    const out = await checkAnkiDuplicates(['猫', '犬', '鳥', '魚'], { deckName: 'S', modelName: 'Sentence', termField: 'Word' });
    expect(out.ok).toBe(true);
    expect(fake.count('findNotes')).toBe(4);
    expect(fake.requests - before).toBe(1);
  });
});

describe('heartbeat: one request per probe, and a backoff while Anki is not running', () => {
  afterEach(() => {
    stopHeartbeat();
    resetHeartbeatForTests();
  });

  it('backs off 5 s, 10 s, 20 s, 40 s, then every 60 s', () => {
    expect([1, 2, 3, 4, 5, 9].map(disconnectedProbeDelay)).toEqual([5000, 10000, 20000, 40000, DISCONNECTED_PROBE_MAX_MS, DISCONNECTED_PROBE_MAX_MS]);
  });

  it('Anki closed for five minutes: 8 probes instead of 31', async () => {
    vi.useFakeTimers();
    fake.down = true;
    let attempts = 0;
    vi.stubGlobal('fetch', async (url: unknown, init?: { body?: unknown }) => {
      attempts += 1;
      return fake.fetch(url, init);
    });
    resetHeartbeatForTests();
    startHeartbeat();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(getLinkStatus().state).toBe('disconnected');
    // At 0, 5, 15, 35, 75, 135, 195 and 255 s => 8 (a fixed 10 s cadence made 31).
    expect(attempts).toBe(8);
  });

  it('a connected probe is ONE multi request carrying version + deckNames', async () => {
    vi.useFakeTimers();
    resetHeartbeatForTests();
    startHeartbeat();
    await vi.advanceTimersByTimeAsync(10);
    expect(getLinkStatus().state).toBe('connected');
    expect(fake.requests).toBe(1);
    expect(fake.calls.map((c) => c.action)).toEqual(['version', 'deckNames']);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    // 30 s cadence while connected: 1 + 10 probes, one request each.
    expect(fake.requests).toBe(11);
  });
});
