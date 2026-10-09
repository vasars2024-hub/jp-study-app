// @vitest-environment jsdom
/**
 * Session caches over the installed dictionaries must follow dictionary changes.
 *
 * Found by the headless e2e harness (tools/e2e, flow `dictionary`): on a fresh profile
 * every word's corpus frequency is `entries: []` and every character's facts are null —
 * correct, nothing is installed yet. Both answers were cached for the session, so a
 * frequency dictionary or KANJIDIC2 installed afterwards changed nothing on screen until
 * the app restarted. Every install/removal/toggle ends in a `committed` job on the import
 * stream; that is when the caches are dropped.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDictionaryChangeSignalForTests } from '../dictionaryChangeSignal';
import {
  cachedWordFrequency,
  fetchWordFrequency,
  resetWordFrequencyCache,
  wordFrequencyCacheGeneration,
} from '../dictFrequencyCache';
import EntryFrequencies from '../components/lexicon/EntryFrequencies';
import KanjiBreakdown from '../components/lexicon/KanjiBreakdown';
import type { DictEntry } from '../../shared/types';

type Snapshot = { jobId: string; status: string; terminal?: { state: string } };

let emit: (snapshot: Snapshot) => void = () => undefined;
let installed = false;
let root: Root | null = null;
let host: HTMLDivElement;

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  installed = false;
  resetDictionaryChangeSignalForTests();
  resetWordFrequencyCache();
  (window as unknown as { api: unknown }).api = {
    onDictImportChanged: vi.fn((cb: (s: Snapshot) => void) => {
      emit = cb;
      return () => undefined;
    }),
    dictFrequency: vi.fn(async (word: string) => ({
      query: word,
      entries: installed ? [{ corpusId: 'c1', corpusTitle: 'E2E Frequency', rank: 245 }] : [],
    })),
    lookupTerm: vi.fn(async (char: string) => ({
      entries: [],
      character: installed
        ? { char, readings: ['ショク'], meanings: ['eat', 'food'], strokes: 9, components: [], sourceIds: ['kanjidic2'] }
        : undefined,
    })),
  };
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const committed = (): void => emit({ jobId: 'j1', status: 'committed', terminal: { state: 'committed' } });

describe('dictFrequencyCache', () => {
  it('drops a cached empty answer when a dictionary job commits', async () => {
    expect((await fetchWordFrequency('食べる', 'ja'))?.entries).toEqual([]);
    expect(cachedWordFrequency('食べる', 'ja')?.entries).toEqual([]);
    installed = true;
    const before = wordFrequencyCacheGeneration();
    committed();
    expect(wordFrequencyCacheGeneration()).toBe(before + 1);
    expect(cachedWordFrequency('食べる', 'ja')).toBeUndefined();
    expect((await fetchWordFrequency('食べる', 'ja'))?.entries.map((e) => e.rank)).toEqual([245]);
  });

  it('a failed or cancelled job keeps the cache', async () => {
    await fetchWordFrequency('食べる', 'ja');
    emit({ jobId: 'j2', status: 'failed', terminal: { state: 'failed' } });
    emit({ jobId: 'j3', status: 'running' });
    expect(cachedWordFrequency('食べる', 'ja')).toBeDefined();
  });

  it('an answer read before the change is not cached after it', async () => {
    let release: (v: unknown) => void = () => undefined;
    (window.api as unknown as { dictFrequency: unknown }).dictFrequency = vi.fn(
      () => new Promise((resolve) => { release = resolve; }),
    );
    const inFlight = fetchWordFrequency('飲む', 'ja');
    committed();
    release({ query: '飲む', entries: [] });
    expect((await inFlight)?.entries).toEqual([]);
    expect(cachedWordFrequency('飲む', 'ja')).toBeUndefined();
  });

  it('mounted chips re-ask after the change', async () => {
    const entry = { word: '食べる', reading: 'たべる', senses: [], jlpt: [], isCommon: true } as unknown as DictEntry;
    root = createRoot(host);
    act(() => root!.render(<EntryFrequencies entry={entry} lang="ja" />));
    await flush();
    expect(host.querySelector('.dict-freq-chip')).toBeNull();
    installed = true;
    act(() => committed());
    await flush();
    expect(host.querySelector('.dict-freq-chip-rank')?.textContent).toBe('245');
  });
});

describe('KanjiBreakdown', () => {
  it('an open breakdown that said "not installed" fills in once KANJIDIC2 commits', async () => {
    root = createRoot(host);
    act(() => root!.render(<KanjiBreakdown word="食べる" lang="ja" />));
    act(() => (host.querySelector('.dict-kanji-toggle') as HTMLButtonElement).click());
    await flush();
    expect(host.querySelector('.dict-kanji-list')).toBeNull();
    expect(host.querySelector('.dict-kanji-status')).not.toBeNull();
    installed = true;
    act(() => committed());
    await flush();
    expect(host.querySelector('.dict-kanji-row .dict-kanji-glyph')?.textContent).toBe('食');
    expect(host.querySelector('.dict-kanji-meanings')?.textContent).toContain('eat');
  });

  it('closing and reopening without a change does not ask again', async () => {
    root = createRoot(host);
    act(() => root!.render(<KanjiBreakdown word="食べる" lang="ja" />));
    const toggle = () => act(() => (host.querySelector('.dict-kanji-toggle') as HTMLButtonElement).click());
    toggle();
    await flush();
    const calls = (window.api as unknown as { lookupTerm: { mock: { calls: unknown[] } } }).lookupTerm.mock.calls.length;
    toggle();
    toggle();
    await flush();
    expect((window.api as unknown as { lookupTerm: { mock: { calls: unknown[] } } }).lookupTerm.mock.calls.length).toBe(calls);
  });
});
