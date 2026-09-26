// @vitest-environment jsdom
/**
 * The Library's level scoring: progressive, sampled small, and done once per
 * file. Before, `enrichInboxItems` sampled 40,000 characters of every book and
 * tokenized them on the UI thread, serially, every time the Library opened —
 * and the Library awaited all of it before showing its list (30–52 s blank on a
 * 200-book shelf).
 *
 * Chinese and Russian study languages run here end to end (ICU segmentation);
 * Japanese goes through the same path with kuromoji in the worker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb } from './helpers/fakeIndexedDb';
import { __resetDbForTests } from '../storage/db';
import type { LibraryItem } from '../../shared/types';

const book = (id: string): LibraryItem => ({
  id,
  title: id,
  kind: 'book',
  createdAt: 1,
  epubFile: 'original.epub',
});

const SAMPLES: Record<string, string> = {
  zh: '今天天气很好。我们去公园散步，看见很多人在跑步。',
  ru: 'Сегодня хорошая погода. Мы гуляем в парке и читаем книгу.',
};

let api: Record<string, ReturnType<typeof vi.fn>>;

async function load() {
  vi.resetModules();
  const enrich = await import('../inboxEnrich');
  const profiles = await import('../bookProfiles');
  profiles.resetBookProfilesForTests();
  return { ...enrich, ...profiles };
}

beforeEach(() => {
  installFakeIndexedDb();
  __resetDbForTests();
  localStorage.clear();
  api = {
    bookFileKeys: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, `100:${id.length}`]))),
    sampleBookText: vi.fn(async () => SAMPLES[localStorage.getItem('jp-study-dict-lang') ?? 'zh']),
    updateLevelMetaMany: vi.fn(async () => []),
    updateInboxMeta: vi.fn(async () => []),
  };
  (window as unknown as { api: unknown }).api = api;
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each(['zh', 'ru'] as const)('Library level scoring (%s)', (lang) => {
  beforeEach(() => {
    localStorage.setItem('jp-study-dict-lang', lang);
  });

  it('samples ~2k characters per book, once, and persists all scores in one write per batch', async () => {
    const { enrichLibraryInBackground, flushBookProfiles } = await load();
    const items = [book('a'), book('b'), book('c')];
    const scored: LibraryItem[] = [];
    await enrichLibraryInBackground(items, (batch) => scored.push(...batch), { batchMs: 60_000 });

    expect(api.bookFileKeys).toHaveBeenCalledTimes(1);
    expect(api.sampleBookText).toHaveBeenCalledTimes(3);
    for (const call of api.sampleBookText.mock.calls) expect(call[1]).toBe(2_000);
    expect(scored.map((it) => it.id)).toEqual(['a', 'b', 'c']);
    expect(scored[0].levelMeta?.levelEstimate).toBeGreaterThanOrEqual(1);
    expect(scored[0].levelMeta?.lang).toBe(lang === 'zh' ? 'zh' : 'unknown');
    // One library write for the whole batch, without a broadcast.
    expect(api.updateLevelMetaMany).toHaveBeenCalledTimes(1);
    expect(api.updateLevelMetaMany.mock.calls[0][0]).toHaveLength(3);
    expect(api.updateLevelMetaMany.mock.calls[0][1]).toEqual({ broadcast: false });
    await flushBookProfiles();

    // A new session (fresh module state): the profiles come from IndexedDB,
    // keyed by the file identity, so nothing is sampled or tokenized again.
    const again = await load();
    api.sampleBookText.mockClear();
    const rescored: LibraryItem[] = [];
    await again.enrichLibraryInBackground(items, (batch) => rescored.push(...batch));
    expect(api.sampleBookText).not.toHaveBeenCalled();
    expect(rescored.map((it) => it.levelMeta)).toEqual(scored.map((it) => it.levelMeta));
  });

  it('samples a book again when its file changed', async () => {
    const { enrichLibraryInBackground, flushBookProfiles } = await load();
    await enrichLibraryInBackground([book('a')], () => undefined);
    await flushBookProfiles();
    const again = await load();
    api.bookFileKeys.mockImplementation(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, '999:1'])));
    api.sampleBookText.mockClear();
    await again.enrichLibraryInBackground([book('a')], () => undefined);
    expect(api.sampleBookText).toHaveBeenCalledTimes(1);
  });

  it('stops between books when cancelled and delivers nothing after', async () => {
    const { enrichLibraryInBackground } = await load();
    const signal = { cancelled: false };
    const seen: string[] = [];
    api.sampleBookText.mockImplementation(async () => {
      signal.cancelled = true;
      return SAMPLES[lang];
    });
    await enrichLibraryInBackground([book('a'), book('b')], (batch) => seen.push(...batch.map((b) => b.id)), { signal });
    expect(api.sampleBookText).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });
});

describe('what needs a score', () => {
  it('skips PDFs, scored books and non-books', async () => {
    const { needsLevelEnrich } = await load();
    expect(needsLevelEnrich(book('a'))).toBe(true);
    expect(needsLevelEnrich({ ...book('p'), epubFile: 'x.pdf' })).toBe(false);
    expect(needsLevelEnrich({ ...book('s'), levelMeta: { lang: 'ja', knownRatio: 0.5, levelEstimate: 3 } })).toBe(false);
    expect(needsLevelEnrich({ ...book('m'), kind: 'manga' })).toBe(false);
  });
});
