// @vitest-environment jsdom
//
// The verdicts and the spread are covered in `shared/__tests__/ankiStaleCards.ts`.
// What only a mounted test can prove is the pair of claims the panel makes about
// one deck at once — and the two silences it must not keep.
//
// A deck whose source carried no revlog can never read `dormant`. A panel that
// simply showed `dormant: 0` there would be saying "you have reviewed everything
// recently" while meaning "nobody knows", so the absence is asserted as visible
// text and not as a number.
//
// And `reset` is named on screen and disabled with its reason. Hiding it would
// leave the user hunting for a feature the recipe's own title promises.
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

import type { AnkiDraft, AnkiDraftCard, AnkiDraftNote } from '../../shared/ankiDraft';
import DeckWorkbenchStale from '../components/anki/DeckWorkbenchStale';

const NOW_MS = Date.UTC(2026, 0, 1);
/** Creation 1,000 days before `NOW_MS`, so `todayDay` is exactly 1000. */
const CREATED_AT_SEC = Math.floor(NOW_MS / 1000) - 1000 * 86_400;

function note(id: string): AnkiDraftNote {
  return {
    id,
    guid: `g-${id}`,
    noteTypeId: 'nt1',
    tags: [],
    marked: false,
    fields: [{ ord: 0, name: 'Front', raw: id, normalized: id }],
    modifiedAtSec: 0,
    flags: 0,
    data: '',
    cardIds: [`${id}:0`],
    media: [],
  };
}

function card(noteId: string, due: number, queue: AnkiDraftCard['queue'] = 'review'): AnkiDraftCard {
  return {
    id: `${noteId}:0`,
    noteId,
    deckId: 'd1',
    ord: 0,
    type: 'review',
    queue,
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

interface Shape {
  /** How many review cards are deeply overdue (due day 600, i.e. 400 days late). */
  overdue: number;
  /** How many are due tomorrow. */
  fresh: number;
  /** How many are overdue *and* suspended. */
  withheld: number;
  /** `undefined` means the source carried no revlog at all. */
  reviews: AnkiDraft['reviews'];
  /** Drop `col.crt`, which is the whole-scan refusal. Default: the source has one. */
  noOrigin?: boolean;
}

function draftOf(shape: Shape): AnkiDraft {
  const notes: AnkiDraftNote[] = [];
  const cards: AnkiDraftCard[] = [];
  const push = (id: string, due: number, queue?: AnkiDraftCard['queue']): void => {
    notes.push(note(id));
    cards.push(card(id, due, queue));
  };
  for (let i = 0; i < shape.overdue; i += 1) push(`late-${i}`, 600);
  for (let i = 0; i < shape.fresh; i += 1) push(`fresh-${i}`, 1001);
  for (let i = 0; i < shape.withheld; i += 1) push(`held-${i}`, 600, 'suspended');
  return {
    version: 1,
    source: {
      kind: 'apkg',
      label: 'fixture',
      fingerprint: 'fp',
      ...(shape.noOrigin ? {} : { createdAtSec: CREATED_AT_SEC }),
    },
    decks: [{ id: 'd1', name: 'Core', path: ['Core'], filtered: false }],
    noteTypes: [
      {
        id: 'nt1',
        name: 'Basic',
        kind: 'standard',
        sortFieldIndex: 0,
        fields: [{ ord: 0, name: 'Front', sticky: false, rtl: false }],
        templates: [{ ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Front}}', bqfmt: '', bafmt: '' }],
      },
    ],
    notes,
    cards,
    ...(shape.reviews === undefined ? {} : { reviews: shape.reviews }),
    diagnostics: [],
    counts: {
      notes: notes.length,
      cards: cards.length,
      decks: 1,
      noteTypes: 1,
      reviews: shape.reviews?.length ?? 0,
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
  root = createRoot(host);
  act(() => {
    root!.render(<DeckWorkbenchStale draft={draft} onQuery={onQuery} nowMs={NOW_MS} />);
  });
}

function buttonNamed(text: string): HTMLButtonElement | undefined {
  // Exact match: `…stale.reset` is not a prefix of anything here, but the
  // glossary panel's `add`/`addPair` pair shows what substring lookups cost.
  return Array.from(host.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').startsWith(text),
  );
}

describe('DeckWorkbenchStale', () => {
  it('reports the backlog and spreads it evenly, never all on one day', () => {
    mount(draftOf({ overdue: 30, fresh: 5, withheld: 0, reviews: [] }));

    // 30 overdue at the 21-day default, spread over the 14-day default.
    expect(host.textContent).toContain('ankiWorkbench.stale.summary:30,21,90');
    expect(host.textContent).toContain('ankiWorkbench.stale.previewTitle:30,14');

    // Round-robin: 30 cards over 14 days is 3+3 on the first two days and 2 on
    // the rest — the point being that no day gets 30 and no day gets 0.
    const rows = Array.from(host.querySelectorAll('.wb-stale-spread li')).map(
      (li) => li.textContent ?? '',
    );
    expect(rows[0]).toBe('ankiWorkbench.stale.spreadRow:1,3');
    expect(rows[1]).toBe('ankiWorkbench.stale.spreadRow:2,3');
    expect(rows[2]).toBe('ankiWorkbench.stale.spreadRow:3,2');
    // 7 listed + the "and N more days" summary.
    expect(rows).toHaveLength(8);
    expect(rows[7]).toBe('ankiWorkbench.stale.spreadMore:7');

    // The counted spread sums back to the moved cards — the tally cannot be a
    // different deck from the preview.
    const total = rows
      .slice(0, 7)
      .reduce((sum, row) => sum + Number(row.split(',')[1]), 0);
    expect(total).toBe(3 + 3 + 2 * 5);
  });

  it('hands a stale: query back for each verdict the deck actually has', () => {
    mount(draftOf({ overdue: 4, fresh: 2, withheld: 3, reviews: [] }));

    buttonNamed('ankiWorkbench.browser.explain.stale.overdue')!.click();
    expect(onQuery).toHaveBeenCalledWith('stale:overdue');

    // `dormant` has no cards here (revlog present but empty), so no button for
    // it — a click that produced an empty grid would be the panel's own fault.
    expect(buttonNamed('ankiWorkbench.browser.explain.stale.dormant')).toBeUndefined();
    expect(buttonNamed('ankiWorkbench.browser.explain.stale.withheld')).toBeDefined();
  });

  it('says the review log is absent rather than reporting a dormant zero', () => {
    // Negative control for the summary above: identical cards, one difference —
    // `reviews` is undefined instead of `[]`.
    mount(draftOf({ overdue: 30, fresh: 5, withheld: 0, reviews: undefined }));

    expect(host.textContent).toContain('ankiWorkbench.stale.noHistory');
    const dormantInput = host.querySelectorAll<HTMLInputElement>('.wb-stale-thresholds input')[1];
    expect(dormantInput.disabled).toBe(true);

    // And the control case: with a revlog, the notice is gone and the input is live.
    act(() => root?.unmount());
    root = null;
    host.innerHTML = '';
    mount(draftOf({ overdue: 30, fresh: 5, withheld: 0, reviews: [] }));
    expect(host.textContent).not.toContain('ankiWorkbench.stale.noHistory');
    expect(
      host.querySelectorAll<HTMLInputElement>('.wb-stale-thresholds input')[1].disabled,
    ).toBe(false);
  });

  it('counts withheld cards as skipped and never moves them', () => {
    mount(draftOf({ overdue: 10, fresh: 0, withheld: 6, reviews: [] }));

    // 16 cards are overdue by day number; only the 10 unsuspended ones move.
    expect(host.textContent).toContain('ankiWorkbench.stale.previewTitle:10,14');
    expect(host.textContent).toContain('ankiWorkbench.stale.withheldSkipped:6');
  });

  it('names reset and disables it with its reason', () => {
    mount(draftOf({ overdue: 3, fresh: 0, withheld: 0, reviews: [] }));

    const reset = buttonNamed('ankiWorkbench.stale.reset')!;
    expect(reset.disabled).toBe(true);
    expect(host.textContent).toContain('ankiWorkbench.stale.refusal.reset-unsupported');
  });

  it('refuses whole when the source reports no collection origin', () => {
    mount(draftOf({ overdue: 30, fresh: 5, withheld: 0, reviews: [], noOrigin: true }));

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'ankiWorkbench.stale.refusal.no-collection-origin',
    );
    // No preview, no filter buttons — a refusal must not also offer a plan.
    expect(host.querySelector('.wb-stale-preview')).toBeNull();
    expect(host.querySelector('.wb-stale-filters')).toBeNull();
  });

  it('says the deck is clean instead of showing an empty preview', () => {
    mount(draftOf({ overdue: 0, fresh: 7, withheld: 0, reviews: [] }));

    expect(host.textContent).toContain('ankiWorkbench.stale.clean:7');
    expect(host.querySelector('.wb-stale-preview')).toBeNull();
  });
});
