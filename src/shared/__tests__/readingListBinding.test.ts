/**
 * P2(b) — binding a work to a library item, and the suggestion band beside it.
 *
 * Every promotion here ships with the state it must NOT touch: the failure this
 * suite exists to catch is a bind that quietly overwrites a state the user set
 * by hand, which reads as data loss and has no undo the user can find.
 */

import { describe, expect, it } from 'vitest';
import {
  bindReadingWork,
  dismissReadingWorkSuggestion,
  restoreReadingWorkSuggestion,
  suggestReadingWorkBinding,
  unbindReadingWork,
} from '../readingListMutations';
import {
  normalizeReadingListsDocument,
  type ReadingEntryState,
  type ReadingListsDocument,
} from '../readingLists';

const NOW = 1_770_000_000_000;

function context() {
  let n = 0;
  return { now: NOW, mintId: (prefix: string) => `${prefix}_${(n += 1)}` };
}

/** One list, one entry per state asked for, all pointing at the same work. */
function docWith(states: readonly ReadingEntryState[]): ReadingListsDocument {
  return normalizeReadingListsDocument({
    schemaVersion: 1,
    revision: 3,
    works: [{ id: 'w1', titleRaw: 'コンビニ人間', boundItemIds: [], bindConfidence: 0 }],
    lists: [
      {
        id: 'l1',
        name: 'From Aya',
        kind: 'pool',
        createdAt: NOW,
        updatedAt: NOW,
        entries: states.map((state, index) => ({
          id: `e${index}`,
          workId: 'w1',
          order: index,
          addedAt: NOW,
          state,
          ...(state === 'finished' ? { finishedAt: NOW } : {}),
        })),
        imports: [],
      },
    ],
  });
}

const workOf = (document: ReadingListsDocument) => document.works[0];
const stateOf = (document: ReadingListsDocument, entryId: string) =>
  document.lists[0].entries.find((entry) => entry.id === entryId)?.state;

describe('bindReadingWork', () => {
  it('binds the item, records the confidence and promotes wanted to owned', () => {
    const result = bindReadingWork(docWith(['wanted']), 'w1', 'item-1', 0.91, context());
    expect(result.bound).toBe(true);
    expect(workOf(result.document).boundItemIds).toEqual(['item-1']);
    expect(workOf(result.document).bindConfidence).toBe(0.91);
    expect(stateOf(result.document, 'e0')).toBe('owned');
    expect(result.promotedEntryIds).toEqual(['e0']);
    expect(result.events).toEqual([
      {
        at: NOW,
        kind: 'work-bound',
        workId: 'w1',
        detail: { itemId: 'item-1', confidence: 0.91, promoted: 1 },
      },
    ]);
  });

  it('NEGATIVE CONTROL — leaves reading, finished, abandoned and skipped alone', () => {
    const before = docWith(['wanted', 'reading', 'finished', 'abandoned', 'skipped']);
    const after = bindReadingWork(before, 'w1', 'item-1', 0.9, context()).document;
    expect(stateOf(after, 'e0')).toBe('owned');
    expect(stateOf(after, 'e1')).toBe('reading');
    expect(stateOf(after, 'e2')).toBe('finished');
    expect(stateOf(after, 'e3')).toBe('abandoned');
    expect(stateOf(after, 'e4')).toBe('skipped');
  });

  it('keeps the strongest claim when a second file binds more weakly', () => {
    const first = bindReadingWork(docWith(['wanted']), 'w1', 'item-1', 0.95, context());
    const second = bindReadingWork(first.document, 'w1', 'item-2', 0.84, context());
    expect(workOf(second.document).boundItemIds).toEqual(['item-1', 'item-2']);
    expect(workOf(second.document).bindConfidence).toBe(0.95);
  });

  it('is a reference-identical no-op when nothing would change', () => {
    const once = bindReadingWork(docWith(['wanted']), 'w1', 'item-1', 0.9, context());
    const twice = bindReadingWork(once.document, 'w1', 'item-1', 0.9, context());
    // Callers skip the IPC round trip on identity, so this is not cosmetic.
    expect(twice.document).toBe(once.document);
    expect(twice.bound).toBe(false);
    expect(twice.events).toEqual([]);
  });

  it('refuses an unknown work and an empty item id', () => {
    const document = docWith(['wanted']);
    expect(bindReadingWork(document, 'nope', 'item-1', 0.9, context()).document).toBe(document);
    expect(bindReadingWork(document, 'w1', '   ', 0.9, context()).document).toBe(document);
  });
});

describe('unbindReadingWork', () => {
  it('undoes a bind completely — owned falls back to wanted and confidence to zero', () => {
    const bound = bindReadingWork(docWith(['wanted']), 'w1', 'item-1', 0.9, context());
    const undone = unbindReadingWork(bound.document, 'w1', 'item-1', context());
    expect(workOf(undone.document).boundItemIds).toEqual([]);
    expect(workOf(undone.document).bindConfidence).toBe(0);
    expect(stateOf(undone.document, 'e0')).toBe('wanted');
    expect(undone.events[0].kind).toBe('work-unbound');
  });

  it('NEGATIVE CONTROL — a state the user earned survives the unbind', () => {
    const bound = bindReadingWork(docWith(['reading', 'finished']), 'w1', 'item-1', 0.9, context());
    const undone = unbindReadingWork(bound.document, 'w1', 'item-1', context());
    expect(stateOf(undone.document, 'e0')).toBe('reading');
    expect(stateOf(undone.document, 'e1')).toBe('finished');
  });

  it('does not demote while another file still stands for the work', () => {
    const one = bindReadingWork(docWith(['wanted']), 'w1', 'item-1', 0.9, context());
    const two = bindReadingWork(one.document, 'w1', 'item-2', 0.9, context());
    const undone = unbindReadingWork(two.document, 'w1', 'item-1', context());
    expect(workOf(undone.document).boundItemIds).toEqual(['item-2']);
    expect(stateOf(undone.document, 'e0')).toBe('owned');
  });

  it('is a no-op for an item that was never bound', () => {
    const document = docWith(['wanted']);
    expect(unbindReadingWork(document, 'w1', 'ghost', context()).document).toBe(document);
  });
});

describe('the suggestion band', () => {
  it('records a suggestion without touching the entry state', () => {
    const result = suggestReadingWorkBinding(
      docWith(['wanted']),
      'w1',
      { itemId: 'item-9', confidence: 0.61, signals: { titleVia: 'fuzzy' } },
      context(),
    );
    expect(result.suggested).toBe(true);
    expect(workOf(result.document).suggestion).toEqual({
      itemId: 'item-9',
      confidence: 0.61,
      signals: { titleVia: 'fuzzy' },
    });
    // The whole point of the middle band: nothing is claimed as owned.
    expect(stateOf(result.document, 'e0')).toBe('wanted');
  });

  it('NEGATIVE CONTROL — never suggests against a work that is already bound', () => {
    const bound = bindReadingWork(docWith(['wanted']), 'w1', 'item-1', 0.9, context()).document;
    const result = suggestReadingWorkBinding(bound, 'w1', { itemId: 'item-9', confidence: 0.7 }, context());
    expect(result.suggested).toBe(false);
    expect(result.document).toBe(bound);
  });

  it('NEGATIVE CONTROL — never re-offers an item the user already refused', () => {
    const offered = suggestReadingWorkBinding(
      docWith(['wanted']),
      'w1',
      { itemId: 'item-9', confidence: 0.61 },
      context(),
    ).document;
    const dismissed = dismissReadingWorkSuggestion(offered, 'w1', context());
    expect(dismissed.dismissed).toBe(true);
    expect(workOf(dismissed.document).suggestion?.dismissedAt).toBe(NOW);

    // A later import scores the same item again, higher. It stays refused.
    const again = suggestReadingWorkBinding(
      dismissed.document,
      'w1',
      { itemId: 'item-9', confidence: 0.79 },
      context(),
    );
    expect(again.suggested).toBe(false);
    expect(again.document).toBe(dismissed.document);
  });

  it('offers a different item after a refusal, and undoes the refusal itself', () => {
    const offered = suggestReadingWorkBinding(
      docWith(['wanted']),
      'w1',
      { itemId: 'item-9', confidence: 0.61 },
      context(),
    ).document;
    const dismissed = dismissReadingWorkSuggestion(offered, 'w1', context()).document;

    const other = suggestReadingWorkBinding(dismissed, 'w1', { itemId: 'item-4', confidence: 0.6 }, context());
    expect(other.suggested).toBe(true);
    expect(workOf(other.document).suggestion?.itemId).toBe('item-4');

    const restored = restoreReadingWorkSuggestion(dismissed, 'w1', context());
    expect(restored.restored).toBe(true);
    expect(workOf(restored.document).suggestion?.dismissedAt).toBeUndefined();
    expect(workOf(restored.document).suggestion?.itemId).toBe('item-9');
  });

  it('a bind clears the suggestion rather than leaving both on the record', () => {
    const offered = suggestReadingWorkBinding(
      docWith(['wanted']),
      'w1',
      { itemId: 'item-9', confidence: 0.61 },
      context(),
    ).document;
    const bound = bindReadingWork(offered, 'w1', 'item-1', 0.9, context()).document;
    expect(workOf(bound).suggestion).toBeUndefined();
  });
});

describe('normalizeReadingWork, on the new field', () => {
  it('round-trips a suggestion and repairs one that contradicts a binding', () => {
    const document = normalizeReadingListsDocument({
      works: [
        {
          id: 'a',
          titleRaw: 'x',
          boundItemIds: [],
          bindConfidence: 0,
          suggestion: { itemId: 'i1', confidence: 2, signals: { a: 1, bad: { nested: true } } },
        },
        {
          id: 'b',
          titleRaw: 'y',
          boundItemIds: ['i2'],
          bindConfidence: 0.9,
          suggestion: { itemId: 'i3', confidence: 0.6 },
        },
        { id: 'c', titleRaw: 'z', boundItemIds: [], bindConfidence: 0, suggestion: { confidence: 0.6 } },
      ],
      lists: [],
    });
    expect(document.works[0].suggestion).toEqual({ itemId: 'i1', confidence: 1, signals: { a: 1 } });
    // Bound already: the chip would say "is this it?" beside "owned".
    expect(document.works[1].suggestion).toBeUndefined();
    // No item id: a chip pointing at nothing.
    expect(document.works[2].suggestion).toBeUndefined();
  });
});
