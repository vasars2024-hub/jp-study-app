/**
 * D144 — which plan removals are allowed to be one click.
 *
 * `removePlan` (`main/jiten.ts`) filters the row out of the store and writes,
 * with no undo. But a plan entry is not one thing: a title you merely queued is
 * re-added by searching for it again, while a note you typed and an acquisition
 * you have already driven are not. Confirming both would be friction on the
 * common case; confirming neither is what shipped.
 *
 * So the predicate IS the guard, and it is tested here rather than through the
 * panel: every false is a removal that stays one click, and every true is a
 * modal a user will see. Both directions are failures if they are wrong.
 */
import { describe, expect, it } from 'vitest';
import { planEntryCarriesWork } from '../jiten';

const planned = { notes: undefined, acquisitionStatus: 'planned', importedLibraryItemId: undefined } as const;

describe('planEntryCarriesWork', () => {
  it('is false for a title that was only ever queued — no modal on the cheap case', () => {
    expect(planEntryCarriesWork(planned)).toBe(false);
  });

  it('is false for whitespace-only notes, which is not a note', () => {
    expect(planEntryCarriesWork({ ...planned, notes: '   \n ' })).toBe(false);
    expect(planEntryCarriesWork({ ...planned, notes: '' })).toBe(false);
  });

  it('is true once the user has written a note', () => {
    expect(planEntryCarriesWork({ ...planned, notes: 'start at ch. 3' })).toBe(true);
  });

  it('is true for every acquisition state past planned, including error', () => {
    for (const status of ['linked', 'downloaded', 'imported', 'analyzed', 'mined', 'error'] as const) {
      // `error` counts deliberately: it is a state the user acted their way into
      // and may be reading in order to retry.
      expect(planEntryCarriesWork({ ...planned, acquisitionStatus: status }), status).toBe(true);
    }
  });

  it('is true once an entry points at a real library item', () => {
    expect(planEntryCarriesWork({ ...planned, importedLibraryItemId: 'lib-1' })).toBe(true);
    // An empty string is not a link.
    expect(planEntryCarriesWork({ ...planned, importedLibraryItemId: '' })).toBe(false);
  });
});
