/**
 * The inspector's no-selection summary — rubric category 4's repair for the
 * files surface.
 *
 * Measured live 2026-09-04 at maximized (1264x773), the inspector was a 320px
 * column holding one 43px sentence and its empty remainder was the surface's
 * largest dead rectangle: **316x572, 17.4% of the viewport** against a 15% bar.
 * The summary fills it with something derived from the rows already on screen.
 *
 * The two rules worth a suite are the two that fail silently. A `null` size
 * folded in as zero reads as a smaller library rather than as an error, and a
 * capped kind list that drops its remainder makes the rows on screen stop
 * adding up to the count above them.
 */
import { describe, expect, it } from 'vitest';
import {
  FOLDER_SUMMARY_MAX_KINDS,
  summarizeFolder,
} from '../components/filesapp/folderSummary';
import type { FilesItem, FilesItemKind } from '../../shared/filesApp/catalog';

function item(over: Partial<FilesItem> & { id: string }): FilesItem {
  return {
    name: over.id,
    kind: 'book',
    categoryId: 'library-books',
    provenance: 'user',
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    lastUsedAt: null,
    location: { kind: 'index', label: 'test' },
    flags: {},
    source: 'test',
    ...over,
  } as FilesItem;
}

describe('files inspector — the folder summary', () => {
  it('sums only the rows that HAVE a size and counts the ones that do not', () => {
    const s = summarizeFolder([
      item({ id: 'a', sizeBytes: 1000 }),
      item({ id: 'b', sizeBytes: null }),
      item({ id: 'c', sizeBytes: 2400 }),
      item({ id: 'd', sizeBytes: null }),
    ]);
    expect(s.bytes).toBe(3400);
    expect(s.sizedCount).toBe(2);
    expect(s.unsizedCount).toBe(2);
    // The invariant the UI reads: the two halves account for every row, so the
    // "N with no size" tail can never be inferred wrongly from the total.
    expect(s.sizedCount + s.unsizedCount).toBe(4);
  });

  it('treats a size of 0 as a real size, not as an absent one', () => {
    // A zero-byte file exists and has a size. `null` is the absent case, and
    // conflating the two is the mistake this whole helper is shaped against.
    const s = summarizeFolder([item({ id: 'z', sizeBytes: 0 })]);
    expect(s.sizedCount).toBe(1);
    expect(s.unsizedCount).toBe(0);
  });

  it('reports the total number of kinds even when the list is capped', () => {
    const kinds: FilesItemKind[] = [
      'book',
      'manga',
      'video',
      'audio',
      'transcript',
      'subtitle',
      'deck',
      'note',
    ];
    const s = summarizeFolder(kinds.map((kind, i) => item({ id: `k${i}`, kind })));
    expect(kinds.length).toBeGreaterThan(FOLDER_SUMMARY_MAX_KINDS);
    expect(s.kinds).toHaveLength(FOLDER_SUMMARY_MAX_KINDS);
    // The remainder is COUNTED, not dropped: 8 distinct kinds, 6 listed, so the
    // UI can say "2 more kinds" instead of quietly showing six of eight.
    expect(s.kindsTotal).toBe(kinds.length);
    expect(s.kindsTotal - s.kinds.length).toBe(2);
  });

  it('orders kinds by count, most numerous first', () => {
    const s = summarizeFolder([
      item({ id: '1', kind: 'note' }),
      item({ id: '2', kind: 'video' }),
      item({ id: '3', kind: 'video' }),
      item({ id: '4', kind: 'video' }),
      item({ id: '5', kind: 'book' }),
      item({ id: '6', kind: 'book' }),
    ]);
    expect(s.kinds).toEqual([
      ['video', 3],
      ['book', 2],
      ['note', 1],
    ]);
  });

  it('counts broken links, which is the one flag the summary escalates', () => {
    const s = summarizeFolder([
      item({ id: 'a', flags: { brokenLink: true } }),
      item({ id: 'b', flags: {} }),
      item({ id: 'c', flags: { brokenLink: true } }),
      // `orphan` is the mirror-image flag and must NOT be counted here.
      item({ id: 'd', flags: { orphan: true } }),
    ]);
    expect(s.broken).toBe(2);
  });

  it('is empty-safe: an empty folder invents nothing', () => {
    const s = summarizeFolder([]);
    expect(s).toEqual({
      bytes: 0,
      sizedCount: 0,
      unsizedCount: 0,
      broken: 0,
      kinds: [],
      kindsTotal: 0,
    });
  });
});
