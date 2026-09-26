// @vitest-environment jsdom
/**
 * Reader → dictionary popup → Mine makes a card with an answer (round-4 journeys audit).
 *
 * Measured on the packaged app (EPUB import → click 窓 → Mine, offline): the saved card was
 * `{ word: '窓', reading: '', meaning: '窓', back: '窓' }` — the popup had just shown まど /
 * "window", but "Mine" passed only the word and the sentence, the panel asked the offline
 * translator (no model installed → nothing), and fell back to the word as its own meaning.
 * Every review of that card showed 窓 → 窓.
 *
 * Also pinned: the panel's status line was English in every UI language ("Saved →
 * Flashcards"), and a Chinese or Russian book's word was translated as Japanese.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const translateTo = vi.fn(async (): Promise<string> => {
  throw new Error('offline model not installed');
});
vi.mock('../translator', () => ({
  translateTo: (...args: unknown[]) => translateTo(...(args as [])),
  onModelProgress: () => () => undefined,
}));

const lookupTerm = vi.fn();
const lookupChinese = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollTo ??= (() => undefined) as unknown as Element['scrollTo'];
});

beforeEach(() => {
  localStorage.clear();
  translateTo.mockClear();
  lookupTerm.mockReset();
  lookupChinese.mockReset();
  const api = new Proxy(
    {
      lookupTerm,
      lookupChinese,
      ankiStatus: () => Promise.resolve({ connected: false, decks: [], models: [] }),
    } as Record<string, unknown>,
    {
      get: (target, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop in target) return target[prop];
        if (prop.startsWith('on')) return () => () => undefined;
        return () => Promise.resolve(null);
      },
    },
  );
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function mine(payload: { word: string; sentence?: string; lookup?: boolean }): Promise<HTMLElement> {
  const { default: ReaderCollectionPanel } = await import('../components/ReaderCollectionPanel');
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <ReaderCollectionPanel bookId="b1" bookTitle="Book" open onClose={() => undefined} pendingAdd={payload} />,
    );
  });
  // The add runs in an async IIFE: lookup, maybe translate, save.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return host;
}

async function savedCard(word: string) {
  const { loadDeck } = await import('../flashcardDeck');
  return loadDeck().find((card) => card.word === word);
}

describe('Mine from the reader’s dictionary popup', () => {
  it('saves the dictionary reading and meaning, not the word as its own answer', async () => {
    lookupTerm.mockResolvedValue({
      entries: [{ word: '窓', reading: 'まど', senses: [{ definitions: ['window'] }] }],
    });
    await mine({ word: '窓', sentence: '朝、ねこは窓のそばで日向ぼっこをしました。', lookup: true });
    const card = await savedCard('窓');
    expect(card, 'the card was saved').toBeTruthy();
    expect(card?.reading).toBe('まど');
    expect(card?.meaning).toBe('window');
    expect(card?.back, 'the answer side is the meaning').toBe('window');
    expect(translateTo, 'no translator needed when the dictionary answered').not.toHaveBeenCalled();
  });

  it('looks a Chinese book’s word up in the Chinese dictionary and translates from Chinese', async () => {
    localStorage.setItem('jp-study-lang', 'zh');
    const { setStudyLang } = await import('../studyEnvironment');
    setStudyLang('zh');
    lookupChinese.mockResolvedValue({ entries: [] });
    await mine({ word: '窗户', sentence: '小猫在窗户旁边晒太阳。', lookup: true });
    expect(lookupChinese).toHaveBeenCalled();
    expect(lookupTerm).not.toHaveBeenCalled();
    expect(translateTo.mock.calls[0]?.[1], 'translated from Chinese, not Japanese').toBe('zh');
    setStudyLang('ja');
  });

  it('a plain selection (not a lookup) is not guessed from the dictionary', async () => {
    lookupTerm.mockResolvedValue({ entries: [{ word: '朝', reading: 'あさ', senses: [{ definitions: ['morning'] }] }] });
    await mine({ word: '朝、ねこは窓のそばで', sentence: '朝、ねこは窓のそばで日向ぼっこをしました。' });
    expect(lookupTerm).not.toHaveBeenCalled();
  });

  it('says it saved in the UI language', async () => {
    const { setUiLang } = await import('../i18n');
    const { ensureCatalog } = await import('../../shared/i18n/catalogs');
    await ensureCatalog('ru');
    setUiLang('ru');
    await ensureCatalog('ru');
    lookupTerm.mockResolvedValue({ entries: [{ word: '窓', reading: 'まど', senses: [{ definitions: ['window'] }] }] });
    const host = await mine({ word: '窓', sentence: '窓。', lookup: true });
    const text = host.textContent ?? '';
    expect(text).toContain('Сохранено');
    expect(text).not.toContain('Saved');
    setUiLang('en');
  });
});
