// @vitest-environment jsdom
/**
 * The Flashcards window, as rendered (round-2 V7 + J10).
 *
 * - Practice is four mode tiles of one shape — icon, name, one line of what it drills — not a
 *   bordered fieldset of grey default buttons whose captions sat under some and beside others.
 *   Each tile's accessible name is its action, and its description is attached to it.
 * - The collections use the design system's tab strip (a real tablist) and search field, and
 *   the tabs have neutral names: a deck mined from a video is not an "EPUB deck".
 * - The deck picker is the design system's select.
 * - The review strip does not print a card's word before that card's answer has been shown:
 *   the word IS the answer to a sentence, meaning or listening prompt.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Every bridge call resolves empty; the few whose callers read a shape get that shape. */
const API_SHAPES: Record<string, unknown> = {
  listLibrary: [],
  jitenGetStore: { plan: [] },
};

function stubApi(): void {
  const api = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop.startsWith('on')) return () => () => undefined;
        return () => Promise.resolve(prop in API_SHAPES ? API_SHAPES[prop] : null);
      },
    },
  );
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

const CARDS = [
  { id: 'a', word: '食べる', reading: 'たべる', meaning: 'to eat', addedAt: 1, bookTitle: 'Book' },
  { id: 'b', word: '飲む', reading: 'のむ', meaning: 'to drink', addedAt: 2, bookTitle: 'Book' },
  { id: 'c', word: '走る', reading: 'はしる', meaning: 'to run', addedAt: 3, bookTitle: 'Book' },
];

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubApi();
  // jsdom has no ResizeObserver; the overview measures its toolbar with one.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe = (): undefined => undefined;
    unobserve = (): undefined => undefined;
    disconnect = (): undefined => undefined;
  };
  // …nor scrollIntoView, which the review strip calls to keep the active chip in view.
  Element.prototype.scrollIntoView ??= (): undefined => undefined;
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: [], cards: CARDS }));
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  const { default: FlashcardsView } = await import('../views/FlashcardsView');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<FlashcardsView />);
  });
}

describe('Flashcards overview', () => {
  it('practice is four tiles of one shape, named by their action and described', async () => {
    await mount();
    const practice = host.querySelector('section.flash-practice');
    expect(practice, 'the practice section').toBeTruthy();
    expect(host.querySelector('fieldset.flash-practice'), 'no nested fieldset box').toBeNull();
    const tiles = [...host.querySelectorAll<HTMLButtonElement>('.flash-practice__tile')];
    expect(tiles).toHaveLength(4);
    expect(tiles.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Start learning',
      'Start writing',
      'Start a match round',
      'Take a test',
    ]);
    for (const tile of tiles) {
      expect(tile.querySelector('.flash-practice__icon svg'), 'an icon').toBeTruthy();
      expect(tile.querySelector('.flash-practice__name')?.textContent).toBeTruthy();
      const about = document.getElementById(tile.getAttribute('aria-describedby') ?? '');
      expect(about, 'its description is attached').toBeTruthy();
      expect(tile.contains(about)).toBe(true);
      expect(tile.disabled).toBe(false);
    }
    expect(tiles.map((b) => b.querySelector('.flash-practice__name')?.textContent)).toEqual([
      'Learn',
      'Write',
      'Match',
      'Test',
    ]);
    // The deck picker is the design system's select, and counts in the right number.
    const select = practice?.querySelector('select');
    expect(select?.classList.contains('ui-select')).toBe(true);
    expect(select?.options[0]?.textContent).toBe('All cards — 3 cards');
  });

  it('a tile opens its mode', async () => {
    await mount();
    const learn = host.querySelector<HTMLButtonElement>('.flash-practice__tile[aria-label="Start learning"]');
    await act(async () => {
      learn?.click();
    });
    expect(host.querySelector('section.flash-practice'), 'the launcher gives way to the mode').toBeNull();
  });

  it('the collections are a real tablist with neutral names, and search is the ui search field', async () => {
    await mount();
    const tablist = host.querySelector('[role="tablist"]');
    expect(tablist?.getAttribute('aria-label')).toBe('Card collections');
    const tabs = [...(tablist?.querySelectorAll('[role="tab"]') ?? [])].map((t) => t.textContent);
    expect(tabs).toEqual(['Decks (3)', 'Saved words (0)']);
    expect(tabs.join(' ')).not.toMatch(/EPUB/);
    const search = host.querySelector('.flash-searchbar .ui-search input[type="search"]');
    expect(search, 'the design-system search field').toBeTruthy();
    expect(host.textContent).not.toMatch(/Recent EPUB cards|Dictionary saves, EPUB deck strip/);
  });
});

describe('the review strip before a card is revealed', () => {
  const byText = (text: RegExp): HTMLButtonElement | undefined =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => text.test(b.textContent ?? ''));

  it('names no card until its answer has been shown, then names that one', async () => {
    await mount();
    await act(async () => {
      byText(/^Start review \(\d+\)$/)?.click();
    });
    const strip = host.querySelector('.flash-review-strip');
    expect(strip, 'the review started').toBeTruthy();
    const chips = [...(strip?.querySelectorAll<HTMLElement>('.flash-strip-card') ?? [])];
    expect(chips.length).toBe(CARDS.length);
    for (const card of CARDS) expect(strip?.textContent).not.toContain(card.word);
    expect(chips.every((c) => c.dataset.reviewHidden === 'true')).toBe(true);

    await act(async () => {
      byText(/^Show answer$/)?.click();
    });
    const shown = [...(host.querySelector('.flash-review-strip')?.querySelectorAll<HTMLElement>('.flash-strip-card') ?? [])];
    const named = shown.filter((c) => c.dataset.reviewHidden !== 'true');
    expect(named).toHaveLength(1);
    expect(named[0]?.dataset.reviewActive).toBe('true');
  });
});
