// @vitest-environment jsdom
//
// The verdicts are covered in `shared/__tests__/ankiSiblingAudit.ts`. What only
// a mounted test can prove is the pair of claims the panel makes about the same
// deck at once: one redundant template pair is ONE edit and it doubles the
// reviewing on every note of its type, and a surface that shows either number
// alone tells the user the wrong story. And that the sample size is on screen,
// because the verdict is the sample's.
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

import type {
  AnkiDraft,
  AnkiDraftCard,
  AnkiDraftNote,
  AnkiDraftNoteType,
} from '../../shared/ankiDraft';
import DeckWorkbenchSiblings from '../components/anki/DeckWorkbenchSiblings';

const tpl = (ord: number, name: string, qfmt: string, afmt: string) => ({
  ord,
  name,
  qfmt,
  afmt,
  bqfmt: '',
  bafmt: '',
});

const fields = [
  { ord: 0, name: 'Front', sticky: false, rtl: false },
  { ord: 1, name: 'Back', sticky: false, rtl: false },
];

const twinned: AnkiDraftNoteType = {
  id: 'twinned',
  name: 'Twinned',
  kind: 'standard',
  css: '',
  fields,
  templates: [
    tpl(0, 'Card 1', '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'),
    tpl(1, 'Card 1 copy', '{{ Front }}', '{{FrontSide}}<hr id=answer>{{ Back }}'),
  ],
  sortFieldOrd: 0,
};

const reversible: AnkiDraftNoteType = {
  ...twinned,
  id: 'reversible',
  name: 'Reversible',
  templates: [
    tpl(0, 'Card 1', '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'),
    tpl(1, 'Card 2', '{{Back}}', '{{FrontSide}}<hr id=answer>{{Front}}'),
  ],
};

function note(id: string, noteTypeId: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId,
    tags: [],
    marked: false,
    fields: [
      { ord: 0, name: 'Front', raw: id, normalized: id },
      { ord: 1, name: 'Back', raw: `${id}-back`, normalized: `${id}-back` },
    ],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`${id}:0`, `${id}:1`],
    media: [],
  };
}

function card(noteId: string, ord: number): AnkiDraftCard {
  return {
    id: `${noteId}:${ord}`,
    noteId,
    deckId: 'd1',
    ord,
    type: 'new',
    queue: 'new',
    due: 0,
    interval: 0,
    easeFactor: 0,
    reps: 0,
    lapses: 0,
    left: 0,
    flag: 'none',
    modifiedAtSec: 0,
  };
}

function draftOf(noteTypes: AnkiDraftNoteType[], notes: AnkiDraftNote[], cards: AnkiDraftCard[]): AnkiDraft {
  return {
    version: 1,
    source: { kind: 'apkg', label: 'fixture', fingerprint: 'fp' },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes,
    notes,
    cards,
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: cards.length,
      decks: 1,
      noteTypes: noteTypes.length,
      reviews: 0,
      mediaReferences: 0,
    },
  };
}

let root: Root | null = null;
let host: HTMLDivElement;
const onQuery = vi.fn();

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onQuery.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function mount(draft: AnkiDraft): void {
  act(() => {
    root = createRoot(host);
    root.render(<DeckWorkbenchSiblings draft={draft} onQuery={onQuery} />);
  });
}

/** One redundant template pair, three notes, six cards. */
const twinDeck = () => {
  const notes = ['n1', 'n2', 'n3'].map((id) => note(id, 'twinned'));
  return draftOf([twinned], notes, notes.flatMap((n) => [card(n.id, 0), card(n.id, 1)]));
};

describe('DeckWorkbenchSiblings', () => {
  it('states one template pair and the three notes it doubles, not one or the other', () => {
    mount(twinDeck());
    const summary = host.querySelector('.wb-siblings p')?.textContent ?? '';
    // groups, then affected NOTES — 1 pair, 3 notes.
    expect(summary).toBe('ankiWorkbench.siblings.summary:1,3');
    const row = host.querySelector('.wb-siblings-row');
    expect(host.querySelectorAll('.wb-siblings-row')).toHaveLength(1);
    expect(row?.querySelector('code')?.textContent).toBe('Twinned');
    expect(row?.querySelector('.wb-siblings-verdict')?.textContent).toBe(
      'ankiWorkbench.browser.explain.sibling.duplicate',
    );
  });

  it('shows how many notes the verdict was compared over, and what it costs', () => {
    mount(twinDeck());
    const detail = host.querySelector('.wb-siblings-row .muted')?.textContent ?? '';
    // Both templates named, so the user knows which one to remove.
    expect(detail).toContain('ankiWorkbench.siblings.templates:Card 1 · Card 1 copy');
    // The sample is the whole deck here, and it is still stated as a number.
    expect(detail).toContain('ankiWorkbench.siblings.sampled:3');
    expect(detail).toContain('ankiWorkbench.siblings.cards:3');
  });

  it('hands the Browser a query instead of offering to delete a template', () => {
    mount(twinDeck());
    const buttons = [...host.querySelectorAll('.wb-siblings-filters button')];
    expect(buttons).toHaveLength(1);
    act(() => (buttons[0] as HTMLButtonElement).click());
    expect(onQuery).toHaveBeenCalledWith('sibling:duplicate');
    // Nothing on this panel writes: no destructive control at all.
    expect(host.querySelectorAll('button')).toHaveLength(1);
  });

  it('says a clean deck is clean, with the count it checked', () => {
    const notes = ['n1', 'n2'].map((id) => note(id, 'reversible'));
    mount(draftOf([reversible], notes, notes.flatMap((n) => [card(n.id, 0), card(n.id, 1)])));
    expect(host.querySelector('.wb-siblings p')?.textContent).toBe(
      'ankiWorkbench.siblings.clean:2',
    );
    expect(host.querySelectorAll('.wb-siblings-row')).toHaveLength(0);
    expect(host.querySelectorAll('.wb-siblings-filters button')).toHaveLength(0);
  });

  it('calls out a card no template makes, separately from the pair count', () => {
    const notes = ['n1', 'n2'].map((id) => note(id, 'reversible'));
    const cards = notes.flatMap((n) => [card(n.id, 0), card(n.id, 1)]);
    cards.push(card('n1', 9));
    mount(draftOf([reversible], notes, cards));
    // No template pair overlaps, so the orphan is the only finding — and it is
    // reported on its own line rather than folded into the pair count.
    expect(host.querySelector('.wb-siblings p')?.textContent).toBe(
      'ankiWorkbench.siblings.summary:0,1',
    );
    expect(host.querySelector('.wb-siblings p + p')?.textContent).toBe(
      'ankiWorkbench.siblings.orphans:1',
    );
    const buttons = [...host.querySelectorAll('.wb-siblings-filters button')];
    expect(buttons).toHaveLength(1);
    act(() => (buttons[0] as HTMLButtonElement).click());
    expect(onQuery).toHaveBeenCalledWith('sibling:orphan');
  });
});
