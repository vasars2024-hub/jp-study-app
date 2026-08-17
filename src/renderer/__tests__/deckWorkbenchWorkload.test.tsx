// @vitest-environment jsdom
//
// The arithmetic is covered in `shared/__tests__/ankiSchedulingImpact.test.ts`.
// What only a mounted test can prove is the three claims the panel is placed to
// keep honest: that the horizon on screen does NOT move when the proposal
// changes, that a never-studied deck reads as a named refusal rather than as an
// empty chart of zeros, and that there is no control here offering to apply
// anything — the deck preset is not in the package, so a button would be the
// inactive-control defect the plan forbids.
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

import type { AnkiDraft, RawAnkiCardRow, RawAnkiCollection } from '../../shared/ankiDraft';
import { ANKI_FIELD_SEP, buildAnkiDraft } from '../../shared/ankiDraft';
import DeckWorkbenchWorkload from '../components/anki/DeckWorkbenchWorkload';

const CRT = 1_577_836_800;
/** Exactly 1,000 days after `CRT`, so `todayDay` is 1000 in every assertion. */
const NOW = (CRT + 1000 * 86_400) * 1000;

type CardSpec = Partial<RawAnkiCardRow> & { id: string; nid: string };

function draftOf(cards: CardSpec[]): AnkiDraft {
  const noteIds = [...new Set(cards.map((c) => c.nid))];
  const raw: RawAnkiCollection = {
    col: { ver: 11, crt: CRT, mod: 0 },
    notes: noteIds.map((id, i) => ({
      id,
      guid: `g${i}`,
      mid: '1',
      flds: ['Front', 'Back'].join(ANKI_FIELD_SEP),
    })),
    cards: cards.map((c) => ({ did: '1', ord: 0, ...c })),
    decks: [{ id: '1', name: 'Deck' }],
    noteTypes: [
      {
        id: '1',
        name: 'Basic',
        fields: [
          { name: 'Front', ord: 0 },
          { name: 'Back', ord: 1 },
        ],
        templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
      },
    ],
  };
  return buildAnkiDraft(raw, {
    source: { kind: 'apkg', label: 'test.apkg', createdAtSec: CRT },
    normalize: (v) => v,
  });
}

const reviewCard = (id: string, ivl: number, dueIn: number, over: Partial<RawAnkiCardRow> = {}): CardSpec => ({
  id,
  nid: `n${id}`,
  type: 2,
  queue: 2,
  due: 1000 + dueIn,
  ivl,
  reps: 4,
  factor: 2500,
  ...over,
});

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function mount(draft: AnkiDraft): void {
  act(() => {
    root = createRoot(host);
    root.render(<DeckWorkbenchWorkload draft={draft} nowMs={NOW} />);
  });
}

function click(el: Element | null): void {
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function setNumber(input: Element | null, value: string): void {
  const field = input as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function labelled(text: string): HTMLInputElement | null {
  for (const label of Array.from(host.querySelectorAll('label'))) {
    if (label.textContent?.startsWith(text)) return label.querySelector('input');
  }
  return null;
}

function horizonText(): string[] {
  return Array.from(host.querySelectorAll('.wb-workload-horizon li')).map(
    (li) => li.textContent ?? '',
  );
}

/** Three scheduled cards: 0.1 + 0.05 + 0.25 = 0.4 reviews a day. */
const studiedDeck = () =>
  draftOf([reviewCard('1', 10, 0), reviewCard('2', 20, 3), reviewCard('3', 4, 3)]);

describe('DeckWorkbenchWorkload', () => {
  it('states the card count and both loads, rather than one blended headline', () => {
    mount(studiedDeck());
    // 90 → 85 by default: 0.4 now, 0.4/1.6374 = 0.244 after.
    expect(host.querySelector('.wb-workload p')?.textContent).toBe(
      'ankiWorkbench.workload.summary:3,0.4,0.2',
    );
  });

  it('says less work when intervals grow, and more when they shrink', () => {
    mount(studiedDeck());
    expect(host.querySelector('.wb-workload-down')?.textContent).toContain(
      'ankiWorkbench.workload.deltaDown',
    );
    expect(host.querySelector('.wb-workload-up')).toBeNull();

    // Raising retention above the current setting shortens every interval.
    setNumber(labelled('ankiWorkbench.workload.retentionTo'), '95');
    expect(host.querySelector('.wb-workload-up')?.textContent).toContain(
      'ankiWorkbench.workload.deltaUp',
    );
    expect(host.querySelector('.wb-workload-down')).toBeNull();
  });

  it('does not move a single day of the horizon when the proposal changes', () => {
    // The whole reason the horizon is rendered apart from the comparison. Anki
    // reschedules a card when it is next answered, so an already-scheduled due
    // day is not the proposal's to move — and a panel that redrew this chart
    // would be the most convincing wrong answer this recipe could give.
    mount(studiedDeck());
    const before = horizonText();
    expect(before[0]).toBe('ankiWorkbench.workload.horizonRow:0,1');
    expect(before[3]).toBe('ankiWorkbench.workload.horizonRow:3,2');

    setNumber(labelled('ankiWorkbench.workload.retentionTo'), '95');
    expect(host.querySelector('.wb-workload-up')).not.toBeNull(); // the estimate did change
    expect(horizonText()).toEqual(before); // …and the horizon did not

    click(host.querySelectorAll('.wb-workload-controls .btn')[1]); // interval modifier
    expect(horizonText()).toEqual(before);
  });

  it('names the decay for a retention proposal and drops the claim for a modifier', () => {
    mount(studiedDeck());
    const provenance = () =>
      Array.from(host.querySelectorAll('.wb-workload p')).map((p) => p.textContent ?? '');
    expect(provenance().some((line) => line === 'ankiWorkbench.workload.provenanceRetention:-0.5'))
      .toBe(true);

    click(host.querySelectorAll('.wb-workload-controls .btn')[1]);
    expect(provenance().some((line) => line === 'ankiWorkbench.workload.provenanceModifier:0'))
      .toBe(true);
    expect(provenance().some((line) => line.startsWith('ankiWorkbench.workload.provenanceRetention')))
      .toBe(false);
  });

  it('refuses a never-studied deck by name instead of drawing a chart of zeros', () => {
    // The user's own mined deck is this shape — recipe 10 measured 0 cards with
    // any SRS state on it — so this is the common case and not an edge.
    mount(draftOf([{ id: '1', nid: 'n1', type: 0, queue: 0, due: 1 }]));
    const refusal = host.querySelector('.wb-workload-refusal');
    expect(refusal?.textContent).toBe('ankiWorkbench.workload.refusal.no-scheduled-cards');
    expect(refusal?.getAttribute('role')).toBe('alert');
    // Nothing else is rendered: no summary, no horizon, no zeros to misread.
    expect(host.querySelector('.wb-workload-horizon')).toBeNull();
    expect(horizonText()).toEqual([]);
  });

  it('refuses an out-of-band retention rather than extrapolating the curve past it', () => {
    mount(studiedDeck());
    setNumber(labelled('ankiWorkbench.workload.retentionTo'), '50');
    expect(host.querySelector('.wb-workload-refusal')?.textContent).toBe(
      'ankiWorkbench.workload.refusal.retention-out-of-range',
    );
    // …and recovers, so the refusal is a state and not a dead end.
    setNumber(labelled('ankiWorkbench.workload.retentionTo'), '80');
    expect(host.querySelector('.wb-workload-refusal')).toBeNull();
    expect(host.querySelector('.wb-workload-horizon')).not.toBeNull();
  });

  it('accounts for every card it did not count, so a missing thousand cannot hide', () => {
    mount(
      draftOf([
        reviewCard('1', 10, 0),
        { id: '2', nid: 'n2', type: 0, queue: 0, due: 1 },
        reviewCard('3', 10, 1, { queue: -1 }),
        reviewCard('4', 10, 1, { odid: '9', odue: 1005 }),
        reviewCard('5', -600, 1),
      ]),
    );
    const lines = Array.from(host.querySelectorAll('.wb-workload p')).map((p) => p.textContent);
    expect(lines).toContain('ankiWorkbench.workload.excluded:1,1,1,1');
    expect(lines[0]).toBe('ankiWorkbench.workload.summary:1,0.1,0.1');
  });

  it('offers no control that would apply anything, and says why once', () => {
    mount(studiedDeck());
    // Every button on the panel selects a proposal kind. There is no Add, no
    // Apply, and no queue: the deck preset is not part of the package, so a
    // control here could only be inactive.
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.closest('.wb-workload-controls') !== null)).toBe(true);
    expect(
      Array.from(host.querySelectorAll('.wb-workload p')).map((p) => p.textContent),
    ).toContain('ankiWorkbench.workload.previewOnly');
  });
});
