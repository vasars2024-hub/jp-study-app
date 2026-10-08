// @vitest-environment jsdom
/**
 * The word-knowledge store: levels, the manual flag the Anki sync must respect,
 * the sync merge itself, and per-lemma keys.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntervalEntry, IntervalSnapshot } from '../../shared/anki';
import { ankiEntryKnowledgeLevel } from '../../shared/anki';

const store = new Map<string, string>();
let servedSnapshot: IntervalSnapshot;

function entry(expression: string, ivlDays: number, extra: Partial<IntervalEntry> = {}): IntervalEntry {
  return { expression, ivlDays, noteId: expression.length * 7, modelName: 'Basic', ...extra };
}

function snapshotOf(entries: IntervalEntry[]): IntervalSnapshot {
  return { generatedAt: Date.now() + 60_000, sourceQueries: ['deck:test'], entries, noteCount: entries.length, truncated: false };
}

beforeEach(() => {
  store.clear();
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
      onAnkiIntervalsChanged: (): (() => void) => () => undefined,
      ankiGetIntervals: async () => servedSnapshot,
      ankiLinkState: async () => ({ state: 'connected', consecutiveFailures: 0 }),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return import('../knownWords');
}

describe('knowledge levels', () => {
  it('stores, reads and counts levels per word', async () => {
    const kw = await load();
    kw.setLevel('食べる', 3);
    kw.setLevel('走る', 1);
    kw.setLevel('見る', 2);
    expect(kw.getLevel('食べる')).toBe(3);
    expect(kw.getLevel('走る')).toBe(1);
    expect(kw.getLevel('未知')).toBe(0);
    expect(kw.knowledgeCounts()).toEqual({ 0: 0, 1: 1, 2: 1, 3: 1 });
  });

  it('cycles New -> Learning -> Familiar -> Known -> New', async () => {
    const kw = await load();
    expect([kw.cycleLevel('猫'), kw.cycleLevel('猫'), kw.cycleLevel('猫'), kw.cycleLevel('猫')]).toEqual([1, 2, 3, 0]);
    expect(kw.getLevel('猫')).toBe(0);
  });

  it('keys entries exactly: a lemma and its inflection are different keys', async () => {
    const kw = await load();
    kw.setLevel('食べる', 3);
    expect(kw.getLevel('食べた')).toBe(0);
    expect(kw.listKnownEntries()).toEqual([{ word: '食べる', level: 3 }]);
  });
});

describe('manual flag', () => {
  it('a manual "New" is remembered so inference cannot raise it', async () => {
    const kw = await load();
    kw.setLevel('犬', 3, false);
    kw.setLevel('犬', 0); // the user says: I do not know this
    expect(kw.getLevel('犬')).toBe(0);
    expect(kw.isManualLevel('犬')).toBe(true);
    expect(kw.bulkSetFromAnki({ 犬: 3 })).toBe(0);
    expect(kw.setInferredLevel('犬', 2)).toBeNull();
    expect(kw.getLevel('犬')).toBe(0);
    // ...and it is not counted as a word anywhere.
    expect(kw.knowledgeCounts()).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0 });
    expect(kw.listKnownEntries()).toEqual([]);
  });

  it('a manual level survives the sync while inferred ones follow it', async () => {
    const kw = await load();
    kw.setLevel('鳥', 1);
    kw.setInferredLevel('魚', 1);
    expect(kw.bulkSetFromAnki({ 鳥: 3, 魚: 3 })).toBe(1);
    expect(kw.getLevel('鳥')).toBe(1);
    expect(kw.getLevel('魚')).toBe(3);
  });

  it('setInferredLevel reports the previous level so it can be undone', async () => {
    const kw = await load();
    expect(kw.setInferredLevel('空', 2)).toBe(0);
    expect(kw.setInferredLevel('空', 2)).toBeNull();
    expect(kw.setInferredLevel('空', 0)).toBe(2);
    expect(kw.getLevel('空')).toBe(0);
  });

  it('clearManualLevel hands a hand-set level back to the sync', async () => {
    const kw = await load();
    kw.setLevel('鳥', 1);
    expect(kw.bulkSetFromAnki({ 鳥: 3 })).toBe(0);
    expect(kw.clearManualLevel('鳥')).toBe(true);
    expect(kw.isManualLevel('鳥')).toBe(false);
    // The level stays until evidence arrives...
    expect(kw.getLevel('鳥')).toBe(1);
    // ...and the next sync may now move it.
    expect(kw.bulkSetFromAnki({ 鳥: 3 })).toBe(1);
    expect(kw.getLevel('鳥')).toBe(3);
  });

  it('clearManualLevel drops a manual "New" entirely and is a no-op on automatic words', async () => {
    const kw = await load();
    kw.setLevel('犬', 0);
    expect(kw.clearManualLevel('犬')).toBe(true);
    expect(kw.isManualLevel('犬')).toBe(false);
    expect(kw.setInferredLevel('犬', 2)).toBe(0);
    expect(kw.clearManualLevel('犬')).toBe(false);
    expect(kw.clearManualLevel('')).toBe(false);
    expect(kw.getLevel('犬')).toBe(2);
  });
});

describe('Anki sync merge', () => {
  const thresholds = { familiar: 1, known: 21 };

  it('unseen and suspended cards are evidence of nothing', () => {
    expect(ankiEntryKnowledgeLevel({ ivlDays: 0 }, thresholds)).toBe(0);
    expect(ankiEntryKnowledgeLevel({ ivlDays: -3 }, thresholds)).toBe(0);
    expect(ankiEntryKnowledgeLevel({ ivlDays: 400, suspended: true }, thresholds)).toBe(0);
    expect(ankiEntryKnowledgeLevel({ ivlDays: 3 }, thresholds)).toBe(2);
    expect(ankiEntryKnowledgeLevel({ ivlDays: 30 }, thresholds)).toBe(3);
  });

  it('a sync never raises new or suspended cards and never erases SRS evidence', async () => {
    const kw = await load();
    kw.setInferredLevel('学ぶ', 2); // learned in the built-in SRS
    servedSnapshot = snapshotOf([
      entry('学ぶ', 0), // re-added in Anki, never reviewed
      entry('新しい', 0),
      entry('止まる', 400, { suspended: true }),
      entry('分かる', 40),
    ]);
    const { syncKnowledgeFromAnki } = await import('../ankiSync');
    const result = await syncKnowledgeFromAnki();
    expect(result.ok).toBe(true);
    expect(result.scanned).toBe(4);
    expect(kw.getLevel('新しい')).toBe(0);
    expect(kw.getLevel('止まる')).toBe(0);
    expect(kw.getLevel('学ぶ')).toBe(2);
    expect(kw.getLevel('分かる')).toBe(3);
    expect(result.changed).toBe(1);
  });
});
