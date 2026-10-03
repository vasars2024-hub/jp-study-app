// @vitest-environment jsdom
/**
 * "Mix it up": several decks in one sitting, and the listen-only playlist.
 *
 * The review pool for a mix is the union of the chosen decks (never "all" by
 * accident), and Listen plays each clip, reveals its sentence only after it
 * has been heard, pauses, and moves on by itself to the end.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
}));

import {
  addDeckCards,
  filterDeckByBooks,
  loadDeck,
  reviewSessionCards,
  type DeckFlashcard,
} from '../flashcardDeck';
import ListenMode from '../components/flashcards/ListenMode';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const card = (over: Partial<DeckFlashcard>): Omit<DeckFlashcard, 'id' | 'addedAt'> => ({
  word: over.sentence ?? 'x',
  reading: '',
  meaning: '',
  source: 'subtitle',
  studyKind: 'sentence',
  ...over,
});

function seed(): void {
  addDeckCards([
    card({ sentence: '一話の一文目。', bookId: 'sentence-deck:ep1', bookTitle: 'Ep 1', folder: 'Ep 1', audioPath: 'C:/m/1.mp3', meaning: 'Line one.', sourceRef: { mediaId: 'e1', cueStartSec: 1 } }),
    card({ sentence: '一話の二文目。', bookId: 'sentence-deck:ep1', bookTitle: 'Ep 1', folder: 'Ep 1', audioPath: 'C:/m/2.mp3', sourceRef: { mediaId: 'e1', cueStartSec: 5 } }),
    card({ sentence: '二話の一文目。', bookId: 'sentence-deck:ep2', bookTitle: 'Ep 2', folder: 'Ep 2', audioPath: 'C:/m/3.mp3', sourceRef: { mediaId: 'e2', cueStartSec: 2 } }),
    card({ sentence: '音声のない文。', bookId: 'sentence-deck:ep2', bookTitle: 'Ep 2', folder: 'Ep 2' }),
    card({ sentence: '本の文。', bookId: 'book-1', bookTitle: 'A book' }),
  ]);
}

beforeEach(() => {
  localStorage.clear();
  idb.clear();
});

describe('a mixed sitting', () => {
  it('draws from exactly the chosen decks', () => {
    seed();
    const deck = loadDeck();
    const keys = ['sentence-deck:ep1::Ep 1', 'sentence-deck:ep2::Ep 2'];
    expect(filterDeckByBooks(deck, keys).map((c) => c.sentence).sort()).toEqual(
      ['一話の一文目。', '一話の二文目。', '二話の一文目。', '音声のない文。'].sort(),
    );
    // An empty mix is empty, not the whole collection.
    expect(filterDeckByBooks(deck, [])).toEqual([]);
    // Audio-first sittings drop the silent card, as for a single deck.
    expect(reviewSessionCards(deck, keys, false, 'audio')).toHaveLength(3);
    expect(reviewSessionCards(deck, 'sentence-deck:ep1::Ep 1', false, 'audio')).toHaveLength(2);
  });
});

describe('ListenMode', () => {
  let host: HTMLDivElement;
  let root: Root;
  let played: string[];
  let playSpy: ReturnType<typeof vi.spyOn>;
  /** The element the component last started: the spy's `this`. */
  const lastAudio = (): HTMLMediaElement | undefined => playSpy.mock.contexts.at(-1) as HTMLMediaElement | undefined;

  beforeEach(() => {
    played = [];
    (window as unknown as { api: unknown }).api = {
      flashcardReadAudio: async (path: string) => ({ ok: true, dataUrl: `data:audio/mpeg;base64,${btoa(path)}` }),
      visualNovelReadCaptureAudio: async () => ({ ok: false }),
    };
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      played.push(atob(this.src.split(',')[1] ?? ''));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    host?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function flush(): Promise<void> {
    for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
  }

  it('plays each clip, reveals it after it is heard, and moves on by itself', async () => {
    seed();
    const onExit = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root.render(<ListenMode deck="all" onExit={onExit} />); });

    const section = host.querySelector('[data-listen-total]');
    expect(section?.getAttribute('data-listen-total')).toBe('3');
    // Two cards without a clip are left out, and the header says so.
    expect(host.textContent).toContain('2 cards without audio are left out.');
    // Listening first: nothing to read before it plays.
    expect(host.textContent).toContain('Listen first');

    // Shortest pause, so the test waits one real second per line.
    const gap = [...host.querySelectorAll('select')].find((el) => [...el.options].some((o) => o.textContent === '6 seconds'));
    await act(async () => {
      if (gap) {
        gap.value = '1';
        gap.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await act(async () => { host.querySelector<HTMLButtonElement>('[data-listen-action="toggle"]')?.click(); });
    await flush();
    expect(played).toHaveLength(1);
    expect(host.textContent).toContain('Listen first');

    // The clip ends: its sentence shows during the pause, then the next one plays.
    const first = played[0];
    await act(async () => { lastAudio()?.onended?.(new Event('ended')); });
    const firstCard = loadDeck().find((c) => c.audioPath === first);
    expect(host.textContent).toContain(firstCard?.sentence ?? '???');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    await flush();
    expect(played).toHaveLength(2);
    expect(played[1]).not.toBe(first);
    expect(section?.getAttribute('data-listen-index')).toBe('1');

    // Through the last line to the end.
    await act(async () => { lastAudio()?.onended?.(new Event('ended')); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    await flush();
    await act(async () => { lastAudio()?.onended?.(new Event('ended')); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    await flush();
    expect(new Set(played)).toEqual(new Set(['C:/m/1.mp3', 'C:/m/2.mp3', 'C:/m/3.mp3']));
    expect(host.textContent).toContain('Played all 3 lines.');

    const exit = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Exit');
    await act(async () => { exit?.click(); });
    expect(onExit).toHaveBeenCalled();
  }, 20_000);

  it('changing the repeat or the pause while a line plays does not start it over', async () => {
    seed();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root.render(<ListenMode deck="all" onExit={() => undefined} />); });
    const selects = [...host.querySelectorAll('select')];
    const repeat = selects.find((el) => [...el.options].some((o) => o.textContent === '3 times'));
    const gap = selects.find((el) => [...el.options].some((o) => o.textContent === '6 seconds'));
    const choose = async (select: HTMLSelectElement | undefined, value: string): Promise<void> => {
      await act(async () => {
        if (!select) throw new Error('no select');
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();
    };
    await act(async () => { host.querySelector<HTMLButtonElement>('[data-listen-action="toggle"]')?.click(); });
    await flush();
    expect(played).toHaveLength(1);
    await choose(gap, '1');
    await choose(repeat, '2');
    // Still the one play of the first line — nothing restarted it.
    expect(played).toHaveLength(1);
    // The new values apply when it ends: heard twice, a one-second pause between.
    await act(async () => { lastAudio()?.onended?.(new Event('ended')); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    await flush();
    expect(played).toHaveLength(2);
    expect(played[1]).toBe(played[0]);
  }, 20_000);

  it.each(['initial', 'repeat', 'media error'] as const)('offers a retry when %s playback fails', async (failure) => {
    vi.useFakeTimers();
    seed();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root.render(<ListenMode deck="all" />); });
    const toggle = host.querySelector<HTMLButtonElement>('[data-listen-action="toggle"]')!;

    if (failure === 'initial') playSpy.mockRejectedValueOnce(new Error('Cannot decode clip'));
    await act(async () => { toggle.click(); });
    await flush();

    if (failure === 'repeat') {
      const repeat = [...host.querySelectorAll('select')].find((el) => [...el.options].some((o) => o.textContent === '3 times'))!;
      await act(async () => {
        repeat.value = '2';
        repeat.dispatchEvent(new Event('change', { bubbles: true }));
      });
      playSpy.mockRejectedValueOnce(new Error('Cannot replay clip'));
      await act(async () => { lastAudio()?.onended?.(new Event('ended')); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      await flush();
    }

    if (failure === 'media error') {
      await act(async () => { lastAudio()?.dispatchEvent(new Event('error')); });
    }

    expect(host.querySelector('.flash-audio-error')?.textContent).toBeTruthy();
    expect(toggle.textContent).toBe('Play');
    expect(host.querySelector('[data-listen-index]')?.getAttribute('data-listen-index')).toBe('0');

    const attempts = playSpy.mock.calls.length;
    await act(async () => { toggle.click(); });
    await flush();
    expect(playSpy).toHaveBeenCalledTimes(attempts + 1);
    expect(toggle.textContent).toBe('Pause');
    expect(host.querySelector('.flash-audio-error')).toBeNull();
  });

  it('says so when the deck has no audio at all', async () => {
    addDeckCards([card({ sentence: '音声なし。' })]);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root.render(<ListenMode deck="all" onExit={() => undefined} />); });
    expect(host.textContent).toContain('No card in this deck has audio yet.');
  });
});
