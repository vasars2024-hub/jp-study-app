import { describe, expect, it } from 'vitest';
import type { BrowserColumn } from '../ankiWorkbenchBrowser';
import {
  EMPTY_SAVED_VIEWS,
  applyBrowserView,
  browserViewSort,
  captureBrowserView,
  parseSavedBrowserViews,
  removeBrowserView,
  saveBrowserView,
  serializeSavedBrowserViews,
} from '../ankiBrowserViews';

function col(id: string, visible: boolean): BrowserColumn {
  return { id, kind: id.startsWith('field:') ? 'field' : 'meta', visible, width: 2 };
}

const columns = [
  col('field:Expression', true),
  col('field:Meaning', false),
  col('meta:tags', true),
  col('meta:decks', false),
];

const view = captureBrowserView('Leeches', 'tag:leech -is:marked', { columnId: 'meta:tags', dir: 'desc' }, columns, 1000);

describe('capture', () => {
  it('records the query, the sort and exactly the visible columns', () => {
    expect(view).toEqual({
      id: 'view-1000-leeches',
      name: 'Leeches',
      query: 'tag:leech -is:marked',
      sort: { columnId: 'meta:tags', dir: 'desc' },
      visibleColumnIds: ['field:Expression', 'meta:tags'],
      savedAtSec: 1000,
    });
  });

  it('never records a selection — note ids mean nothing in another deck', () => {
    expect(Object.keys(view)).not.toContain('selection');
    expect(Object.keys(view)).not.toContain('ids');
  });
});

describe('the saved list', () => {
  it('upserts by name so saving twice does not leave two identical labels', () => {
    const first = saveBrowserView(EMPTY_SAVED_VIEWS, view);
    const again = saveBrowserView(first, captureBrowserView('leeches', 'tag:leech', null, columns, 2000));
    expect(again.views).toHaveLength(1);
    expect(again.views[0]?.query).toBe('tag:leech');
    // Newest first.
    const other = saveBrowserView(again, captureBrowserView('Empty backs', 'Back:', null, columns, 3000));
    expect(other.views.map((v) => v.name)).toEqual(['Empty backs', 'leeches']);
  });

  it('removes by id', () => {
    const saved = saveBrowserView(EMPTY_SAVED_VIEWS, view);
    expect(removeBrowserView(saved, view.id).views).toEqual([]);
    expect(removeBrowserView(saved, 'nope').views).toHaveLength(1);
  });
});

describe('applying a view to a deck it was not saved on', () => {
  it('restores the columns it can and names the ones it cannot', () => {
    const otherDeck = [col('field:Expression', false), col('field:Text', true), col('meta:decks', true)];
    const out = applyBrowserView(otherDeck, view);
    expect(out.columns.map((c) => [c.id, c.visible])).toEqual([
      ['field:Expression', true],
      ['field:Text', false],
      ['meta:decks', false],
    ]);
    // `meta:tags` is not a column here, and the surface has to be able to say so
    // rather than show one fewer column than the view promised.
    expect(out.missingColumnIds).toEqual(['meta:tags']);
    expect(out.sortDropped).toBe(true);
    expect(browserViewSort(otherDeck, view)).toBeNull();
  });

  it('leaves the columns alone when the view would blank the grid', () => {
    const foreign = [col('field:Text', true), col('meta:cards', false)];
    const out = applyBrowserView(foreign, view);
    expect(out.columns).toEqual(foreign);
    expect(out.missingColumnIds).toEqual(['field:Expression', 'meta:tags']);
  });

  it('keeps a sort whose column does exist', () => {
    expect(browserViewSort(columns, view)).toEqual({ columnId: 'meta:tags', dir: 'desc' });
    expect(applyBrowserView(columns, view).sortDropped).toBe(false);
  });
});

describe('persistence', () => {
  it('round-trips', () => {
    const saved = saveBrowserView(EMPTY_SAVED_VIEWS, view);
    expect(parseSavedBrowserViews(serializeSavedBrowserViews(saved))).toEqual(saved);
  });

  it('survives junk instead of losing every view to one bad entry', () => {
    expect(parseSavedBrowserViews(null)).toEqual(EMPTY_SAVED_VIEWS);
    expect(parseSavedBrowserViews('not json')).toEqual(EMPTY_SAVED_VIEWS);
    expect(parseSavedBrowserViews('{"version":99,"views":[]}')).toEqual(EMPTY_SAVED_VIEWS);
    const mixed = JSON.stringify({
      version: 1,
      views: [view, { id: 'x', name: '' }, { nonsense: true }, { ...view, id: 'y', name: 'Second', sort: { columnId: 'a', dir: 'sideways' } }],
    });
    expect(parseSavedBrowserViews(mixed).views.map((v) => v.name)).toEqual(['Leeches']);
  });

  it('normalizes a missing sort to null rather than leaving it undefined', () => {
    const raw = JSON.stringify({ version: 1, views: [{ ...view, sort: undefined }] });
    expect(parseSavedBrowserViews(raw).views[0]?.sort).toBeNull();
  });
});
