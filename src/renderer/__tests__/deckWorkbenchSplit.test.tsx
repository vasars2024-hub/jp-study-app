// @vitest-environment jsdom
//
// Recipe 13's panel. The split itself is covered in
// `shared/__tests__/ankiDeckSplit.test.ts`; what only a mounted test can show is
// that the form refuses exactly what the planner refuses — the Add button and
// `deckSplitParameterProblem` call the same function, and this is where that
// stops being a claim.
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

import type { AnkiDraftDeck } from '../../shared/ankiDraft';
import type { DeckSplitParameters } from '../../shared/ankiDeckSplit';
import DeckWorkbenchSplit from '../components/anki/DeckWorkbenchSplit';

const DECKS: AnkiDraftDeck[] = [
  { id: 'd1', name: 'Core', path: ['Core'], filtered: false },
  { id: 'd2', name: 'Core::Verbs', path: ['Core', 'Verbs'], filtered: false },
  { id: 'd3', name: 'Cram', path: ['Cram'], filtered: true },
];

let root: Root | null = null;
let host: HTMLDivElement;
const onQueue = vi.fn<(params: DeckSplitParameters) => void>();

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onQueue.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function mount(decks: AnkiDraftDeck[] = DECKS): void {
  act(() => {
    root = createRoot(host);
    root.render(<DeckWorkbenchSplit decks={decks} onQueue={onQueue} />);
  });
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto =
    el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  // React installs a value tracker per element class; writing `.value` directly
  // makes React think nothing changed and the onChange never fires.
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  act(() => el.dispatchEvent(new Event('input', { bubbles: true })));
  act(() => el.dispatchEvent(new Event('change', { bubbles: true })));
}

const field = (label: string): HTMLInputElement | HTMLSelectElement =>
  [...host.querySelectorAll('label')]
    .find((l) => l.textContent?.includes(label))!
    .querySelector('input, select') as HTMLInputElement | HTMLSelectElement;

const addButton = (): HTMLButtonElement =>
  [...host.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('ankiWorkbench.tray.split.add'),
  ) as HTMLButtonElement;

const clickAdd = (): void => {
  act(() => addButton().dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

describe('DeckWorkbenchSplit', () => {
  it('will not queue until a deck is named', () => {
    mount();
    expect(addButton().disabled).toBe(true);
    // No refusal text yet: an unchosen deck is an unanswered question, and the
    // select is still showing its own prompt.
    expect(host.textContent).not.toContain('ankiWorkbench.tray.problem.split-refused');

    setValue(field('ankiWorkbench.tray.split.parent'), 'd1');
    expect(addButton().disabled).toBe(false);

    clickAdd();
    expect(onQueue).toHaveBeenCalledTimes(1);
    expect(onQueue.mock.calls[0][0]).toEqual({
      axis: 'jlpt',
      parentDeckId: 'd1',
      unmatched: 'leave',
    });
  });

  it('offers a filtered deck but will not let it be chosen', () => {
    mount();
    const options = [...host.querySelectorAll('option')];
    const cram = options.find((o) => o.textContent === 'Cram')!;
    const core = options.find((o) => o.textContent === 'Core')!;
    expect(cram.disabled).toBe(true);
    expect(core.disabled).toBe(false);
    // And it says why, rather than quietly dropping the deck from the list.
    expect(host.textContent).toContain('ankiWorkbench.tray.split.filteredDecks:1');
  });

  it('says nothing about filtered decks when there are none', () => {
    mount(DECKS.filter((d) => !d.filtered));
    expect(host.textContent).not.toContain('ankiWorkbench.tray.split.filteredDecks');
  });

  it('refuses a frequency split until the band edges ascend', () => {
    mount();
    setValue(field('ankiWorkbench.tray.split.parent'), 'd1');
    setValue(field('ankiWorkbench.tray.split.axis'), 'frequency');

    // No bands at all: there is no default, because "top 1,000" is a judgement
    // about the user's corpus.
    expect(addButton().disabled).toBe(true);
    expect(host.textContent).toContain(
      'ankiWorkbench.tray.problem.split-refused:ankiWorkbench.tray.split.refusal.invalid-bands',
    );

    setValue(field('ankiWorkbench.tray.split.bands'), '5000, 1000');
    expect(addButton().disabled).toBe(true);

    setValue(field('ankiWorkbench.tray.split.bands'), '1000, 5000');
    expect(addButton().disabled).toBe(false);
    // The third deck has no upper bound, which "1000, 5000" does not say.
    expect(host.textContent).toContain(
      'ankiWorkbench.tray.split.bands.preview:1-1000, 1001-5000, 5001+',
    );

    clickAdd();
    expect(onQueue.mock.calls[0][0]).toEqual({
      axis: 'frequency',
      parentDeckId: 'd1',
      unmatched: 'leave',
      bands: [1000, 5000],
    });
  });

  it('refuses to collect into a deck with no name', () => {
    mount();
    setValue(field('ankiWorkbench.tray.split.parent'), 'd1');
    setValue(field('ankiWorkbench.tray.split.unmatched'), 'collect');
    expect(addButton().disabled).toBe(true);
    expect(host.textContent).toContain(
      'ankiWorkbench.tray.problem.split-refused:ankiWorkbench.tray.split.refusal.empty-unmatched-name',
    );

    setValue(field('ankiWorkbench.tray.split.unmatchedSegment'), 'Unsorted');
    expect(addButton().disabled).toBe(false);
    clickAdd();
    expect(onQueue.mock.calls[0][0]).toEqual({
      axis: 'jlpt',
      parentDeckId: 'd1',
      unmatched: 'collect',
      unmatchedSegment: 'Unsorted',
    });
  });

  it('hides the band and name inputs the chosen options do not use', () => {
    mount();
    expect(host.textContent).not.toContain('ankiWorkbench.tray.split.bands');
    expect(host.textContent).not.toContain('ankiWorkbench.tray.split.unmatchedSegment');

    setValue(field('ankiWorkbench.tray.split.axis'), 'frequency');
    expect(host.textContent).toContain('ankiWorkbench.tray.split.bands');

    setValue(field('ankiWorkbench.tray.split.axis'), 'mastery');
    expect(host.textContent).not.toContain('ankiWorkbench.tray.split.bands');
  });
});
