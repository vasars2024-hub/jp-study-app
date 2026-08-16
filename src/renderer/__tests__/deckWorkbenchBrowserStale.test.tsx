// @vitest-environment jsdom
//
// The verdicts are covered in `shared/__tests__/ankiStaleCards.test.ts` and the
// parse in `shared/__tests__/ankiBrowserQuery.test.ts`. Neither can see the one
// thing that makes `stale:` a product feature rather than a module: that the
// *Browser* builds the context and puts it on the schema.
//
// A predicate whose context is never supplied does not fail loudly — it parses
// to `no-stale-context` and renders a tidy refusal, which reads exactly like a
// deliberate design. So the refusal is used here as the negative control rather
// than as the assertion: a draft with no `col.crt` must still refuse, and a
// draft that has one must filter.
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

/**
 * `VirtualList` measures its host, and jsdom reports every `clientHeight` as 0
 * and ships no `ResizeObserver` — without both stubs the grid renders zero rows
 * and a wiring failure and a layout failure become indistinguishable.
 */
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

function card(noteId: string, due: number): AnkiDraftCard {
  return {
    id: `${noteId}:0`,
    noteId,
    deckId: 'd1',
    ord: 0,
    type: 'review',
    queue: 'review',
    due,
    interval: 10,
    easeFactor: 2500,
    reps: 4,
    lapses: 0,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
  };
}

// The collection was created 1,000 days before `NOW`, so `todayDay` is 1000 and
// a card's `due` reads directly as "days after creation".
const NOW_MS = Date.UTC(2026, 0, 1);
const CREATED_AT_SEC = Math.floor(NOW_MS / 1000) - 1000 * 86_400;

function draftOf(createdAtSec: number | undefined): AnkiDraft {
  // `n-fresh` is due tomorrow, `n-late` was due 400 days ago — one on each side
  // of the 21-day default, so the filter has something to remove.
  const notes = [note('n-fresh'), note('n-late')];
  const cards = [card('n-fresh', 1001), card('n-late', 600)];
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp', createdAtSec },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [NOTE_TYPE],
    notes,
    cards,
    reviews: [],
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: cards.length,
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
  vi.setSystemTime(NOW_MS);
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount(draft: AnkiDraft): void {
  root = createRoot(host);
  act(() => {
    root!.render(
      <DeckWorkbenchBrowser
        draft={draft}
        totalNotes={draft.notes.length}
        journal={createEditJournal()}
        onSelection={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
  });
}

function typeQuery(text: string): void {
  const box = host.querySelector<HTMLInputElement>('input[aria-describedby], input[type="search"], input.wb-browser-query')
    ?? Array.from(host.querySelectorAll('input')).find((el) => el.type !== 'checkbox');
  if (!box) throw new Error('no query box');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function queryError(): string | null {
  return host.querySelector('.wb-browser-query-error')?.textContent ?? null;
}

describe('DeckWorkbenchBrowser wires the stale context', () => {
  it('filters on stale:overdue instead of refusing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    mount(draftOf(CREATED_AT_SEC));

    // Both notes are in the unfiltered grid.
    expect(host.textContent).toContain('n-fresh');
    expect(host.textContent).toContain('n-late');

    typeQuery('stale:overdue');

    // The wiring claim: no refusal, and exactly the overdue note survives.
    expect(queryError()).toBeNull();
    expect(host.textContent).toContain('n-late');
    expect(host.textContent).not.toContain('n-fresh');
  });

  it('still refuses when the source carries no collection origin', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    // Same query, same rows, one field removed: `buildStaleContext` returns null
    // and the schema must then carry no `stale` at all. If the Browser passed an
    // empty map instead, this would render zero rows and no message — the exact
    // shape that reads like "nothing matched".
    mount(draftOf(undefined));

    typeQuery('stale:overdue');

    expect(queryError()).toBe('ankiWorkbench.browser.query.noStaleContext:stale:overdue');
  });

  it('rejects a verdict the recipe does not define', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    mount(draftOf(CREATED_AT_SEC));

    typeQuery('stale:rotten');

    // Context present, value wrong — so this must be `unknown-key` and not the
    // context refusal, or the message sends the user to scan something that has
    // already scanned.
    expect(queryError()).toBe('ankiWorkbench.browser.query.unknownKey:stale:rotten');
  });
});
