// @vitest-environment jsdom
//
// The Browser's "you are only looking at one page" state, which was dead.
//
// `partial` was `draft.counts.notes < totalNotes`. `counts` describes the whole
// COLLECTION and `draft.notes` is the window (`ankiDraft.ts:1023` states this),
// so on every paged source the comparison put the collection total against
// itself and came out false — the one condition it exists to detect. Measured
// live on the 100,000-note fixture at a page of 500: no page notice, a row line
// reading "1 of 100,000 loaded notes shown", and a one-row filtered result
// offering a button that selects all 100,000.
//
// The fixture below is the shape that mattered and that no existing test had:
// `counts.notes` and `totalNotes` EQUAL and both larger than `notes.length`.
// A fixture where they differ passes either way, which is why this went unseen.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));
vi.mock('../components/anki/deckWorkbench.css', () => ({}));

import type {
  AnkiDraft,
  AnkiDraftCard,
  AnkiDraftNote,
  AnkiDraftNoteType,
} from '../../shared/ankiDraft';
import { createEditJournal } from '../../shared/ankiDraftEdit';
import DeckWorkbenchBrowser from '../components/anki/DeckWorkbenchBrowser';

/** `VirtualList` measures its host; jsdom reports 0 and ships no ResizeObserver. */
function installLayout(width: number, height: number): void {
  class StubResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element): void {
      this.callback(
        [{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve(): void {
      /* no-op */
    }
    disconnect(): void {
      /* no-op */
    }
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  for (const [prop, value] of [
    ['clientWidth', width],
    ['clientHeight', height],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
  }
}

const NOTE_TYPE: AnkiDraftNoteType = {
  id: 'nt1',
  name: 'Basic',
  kind: 'standard',
  sortFieldIndex: 0,
  fields: [
    { ord: 0, name: 'Front', sticky: false, rtl: false },
    { ord: 1, name: 'Back', sticky: false, rtl: false },
  ],
  templates: [{ ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Back}}', bqfmt: '', bafmt: '' }],
};

function note(id: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Front', raw: id, normalized: id },
      { ord: 1, name: 'Back', raw: `${id}-back`, normalized: `${id}-back` },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`${id}:0`],
    media: [],
  };
}

function card(noteId: string): AnkiDraftCard {
  return {
    id: `${noteId}:0`,
    noteId,
    deckId: 'd1',
    ord: 0,
    type: 'review',
    queue: 'review',
    due: 1,
    interval: 10,
    easeFactor: 2500,
    reps: 4,
    lapses: 0,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
  };
}

const LOADED = 4;

/**
 * `collectionNotes` is what `counts` reports — the whole collection, exactly as a
 * real paged `.apkg` read returns it. The page itself is always LOADED notes.
 */
function pagedDraft(collectionNotes: number): AnkiDraft {
  const notes = Array.from({ length: LOADED }, (_, i) => note(`n${i}`));
  const cards = notes.map((n) => card(n.id));
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp', createdAtSec: 0 },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [NOTE_TYPE],
    notes,
    cards,
    reviews: [],
    diagnostics: [],
    counts: {
      notes: collectionNotes,
      cards: collectionNotes,
      decks: 1,
      noteTypes: 1,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  installLayout(1200, 800);
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

function mount(draft: AnkiDraft, totalNotes: number): void {
  root = createRoot(host);
  act(() => {
    root!.render(
      <DeckWorkbenchBrowser
        draft={draft}
        totalNotes={totalNotes}
        journal={createEditJournal()}
        onSelection={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
  });
}

function typeQuery(text: string): void {
  const box = host.querySelector<HTMLInputElement>('input.wb-browser-search');
  if (!box) throw new Error('no query box');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const pageNotice = () => host.querySelector('.wb-browser-partial')?.textContent ?? null;
const rowsLine = () => host.querySelector('.wb-browser-tools .muted')?.textContent ?? null;
const footButtons = () =>
  Array.from(host.querySelectorAll('.wb-browser-foot button')).map((b) => b.textContent ?? '');

describe('DeckWorkbenchBrowser reports a partial page honestly', () => {
  it('shows the page notice when counts describes the collection, not the page', () => {
    // The live shape: 100,000-note collection, 4 loaded. `counts.notes` and
    // `totalNotes` are EQUAL — the case the old comparison could not see.
    mount(pagedDraft(100_000), 100_000);

    expect(pageNotice()).toBe(`ankiWorkbench.browser.pageOnly:${LOADED},100000`);
    // The row line counts the page, not the collection.
    expect(rowsLine()).toBe(`ankiWorkbench.browser.rows:${LOADED},${LOADED}`);
  });

  it('will not offer a whole-source selection under a filter on a partial page', () => {
    mount(pagedDraft(100_000), 100_000);
    typeQuery('n1');

    // One row matched. The button must promise only what it can deliver.
    expect(rowsLine()).toBe(`ankiWorkbench.browser.rows:1,${LOADED}`);
    expect(footButtons()).toContain('ankiWorkbench.browser.selectFound:1');
    expect(footButtons().join('|')).not.toContain('ankiWorkbench.browser.selectAll');
  });

  it('still offers the whole source when no filter narrows it', () => {
    // The inverse: `partial` alone must not disable the whole-source button, or
    // the fix would have bought honesty by removing a working capability.
    mount(pagedDraft(100_000), 100_000);

    expect(footButtons()).toContain('ankiWorkbench.browser.selectAll:100000');
  });

  it('shows no page notice when the whole source is loaded', () => {
    // The negative control. Same component, same query, nothing paged: a notice
    // that renders here would make the assertions above vacuous.
    mount(pagedDraft(LOADED), LOADED);

    expect(pageNotice()).toBeNull();
    expect(rowsLine()).toBe(`ankiWorkbench.browser.rows:${LOADED},${LOADED}`);
    typeQuery('n1');
    expect(footButtons()).toContain('ankiWorkbench.browser.selectAll:1');
  });
});
