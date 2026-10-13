import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../types';
import {
  applyLibraryMetaPatch,
  libraryMetaFormValues,
  normalizeLibraryMetaPatch,
  parseLibraryTags,
} from '../libraryMeta';

const base: LibraryItem = { id: 'a', title: 'T', kind: 'book', createdAt: 1, author: 'X', series: 'S', seriesIndex: 2, tags: ['t'] };

describe('details patches', () => {
  it('cleans text, parses numbers and tags, and clears with empty values', () => {
    expect(
      normalizeLibraryMetaPatch({ title: ' A\u0000  B ', author: '', series: ' Saga ', seriesIndex: '1.5', tags: 'x, X ,y、z,' }),
    ).toEqual({ ok: true, patch: { title: 'A B', author: null, series: 'Saga', seriesIndex: 1.5, tags: ['x', 'y', 'z'] } });
    expect(normalizeLibraryMetaPatch({ seriesIndex: '', tags: [] })).toEqual({ ok: true, patch: { seriesIndex: null, tags: null } });
  });

  it('refuses what cannot be saved, with a key the UI can show', () => {
    expect(normalizeLibraryMetaPatch(null)).toEqual({ ok: false, errorKey: 'libManage.meta.error.invalid' });
    expect(normalizeLibraryMetaPatch({ title: ' ' })).toEqual({ ok: false, errorKey: 'libManage.meta.error.titleRequired' });
    expect(normalizeLibraryMetaPatch({ title: 'x'.repeat(301) })).toEqual({ ok: false, errorKey: 'libManage.meta.error.tooLong' });
    expect(normalizeLibraryMetaPatch({ seriesIndex: -1 })).toEqual({ ok: false, errorKey: 'libManage.meta.error.seriesIndex' });
    expect(normalizeLibraryMetaPatch({ seriesIndex: 'NaN' })).toEqual({ ok: false, errorKey: 'libManage.meta.error.seriesIndex' });
    expect(normalizeLibraryMetaPatch({ tags: Array.from({ length: 51 }, (_, i) => `t${i}`) })).toEqual({
      ok: false,
      errorKey: 'libManage.meta.error.tags',
    });
    expect(normalizeLibraryMetaPatch({ author: 5 })).toEqual({ ok: false, errorKey: 'libManage.meta.error.invalid' });
  });

  it('drops unknown fields (nothing else on the item can be written this way)', () => {
    expect(normalizeLibraryMetaPatch({ id: 'evil', epubFile: '../../x', title: 'ok' })).toEqual({ ok: true, patch: { title: 'ok' } });
  });

  it('applies to a copy, clears fields, and drops a position without a series', () => {
    const next = applyLibraryMetaPatch(base, { series: null, tags: null }, 99);
    expect(next).toMatchObject({ id: 'a', title: 'T', author: 'X', metaEditedAt: 99 });
    expect(next.series).toBeUndefined();
    expect(next.seriesIndex).toBeUndefined();
    expect(next.tags).toBeUndefined();
    expect(base.series).toBe('S');
  });

  it('form values round-trip through the normalizer unchanged', () => {
    const form = libraryMetaFormValues(base);
    expect(form).toEqual({ title: 'T', author: 'X', series: 'S', seriesIndex: '2', tags: 't' });
    expect(normalizeLibraryMetaPatch(form)).toEqual({
      ok: true,
      patch: { title: 'T', author: 'X', series: 'S', seriesIndex: 2, tags: ['t'] },
    });
    expect(parseLibraryTags(['a', 'A', ' b '])).toEqual(['a', 'b']);
  });
});
