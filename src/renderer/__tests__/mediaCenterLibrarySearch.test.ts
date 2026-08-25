// @vitest-environment node
/**
 * The Media Center's global search box narrows the library grid.
 *
 * It did not, for as long as the Media Center has existed. `MediaCenterView.tsx`
 * wrote every keystroke into `state.query` (`:1749`) and the only other reader of
 * that value in the whole file was the input's own `value` prop — `LibraryPanel`
 * handed `MediaLibraryShell` the unfiltered `state.items`. Measured live on
 * 2026-08-25 in BOTH window presentations: a term matching no title left the shelf
 * at the same 5 cards, so the control rendered, accepted text and did nothing.
 *
 * The fix has two halves and this file pins BOTH, because half of it alone is a
 * worse defect than the dead control:
 *
 *   1. the grid narrows — `searched` sits between the shelf scope and the
 *      grouping, so a hit inside a 26-episode series still surfaces one card;
 *   2. `items` is NOT narrowed — the sidebar shelf counts, the rail footer and
 *      the `emptyLibrary` branch all describe the LIBRARY. Handing the shell a
 *      filtered list makes an unmatched search render "your library is empty,
 *      import something" with two import buttons, instead of "nothing here
 *      matches the current filter".
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchMediaHub } from '../../shared/mediaHub';
import { buildLibraryEntries } from '../../shared/mediaLibraryEntries';
import type { MediaItem } from '../../shared/types';

const SRC = resolve(__dirname, '..', '..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf8');

/** Two series and a one-off, shaped like the real library this was measured on. */
const items = [
  { id: 'a1', title: 'The Big O', fileName: 'The Big O - 01.mkv', path: 'C:/m/bigo/01.mkv', kind: 'video', seriesKey: 'the-big-o', episode: 1 },
  { id: 'a2', title: 'The Big O', fileName: 'The Big O - 02.mkv', path: 'C:/m/bigo/02.mkv', kind: 'video', seriesKey: 'the-big-o', episode: 2 },
  { id: 'b1', title: 'Date A Live II', fileName: 'Date A Live II - 01.mkv', path: 'C:/m/dal/01.mkv', kind: 'video', seriesKey: 'date-a-live-ii', episode: 1 },
  { id: 'c1', title: 'Japanese Podcast with Hana #13', fileName: 'hana-13.mp3', path: 'C:/m/hana/13.mp3', kind: 'audio' },
] as unknown as MediaItem[];

describe('Media Center library search', () => {
  it('wires the debounced query into the shell without narrowing its item list', () => {
    const source = read('renderer/views/MediaCenterView.tsx');
    // Both props, on the one `MediaLibraryShell` the library page renders.
    expect(source).toContain('query={state.debouncedQuery}');
    expect(source).toContain('items={state.items}');
    // The tempting one-word "fix". `displayedItems` IS the filtered list, and
    // passing it here is what turns an unmatched search into a false empty library.
    expect(source).not.toContain('items={state.displayedItems}');
  });

  it('filters the scope and never the library the sidebar describes', () => {
    const source = read('renderer/components/media/library/MediaLibraryShell.tsx');
    expect(source).toContain('const searched = useMemo(');
    expect(source).toContain('searchMediaHub(scoped, { query: q, category: \'all\' })');
    expect(source).toContain('buildLibraryEntries(searched)');
    // The three readers that must keep seeing the whole library.
    expect(source).toContain('const emptyLibrary = items.length === 0;');
    expect(source).toContain("footer={t('media.rail.itemCount', { count: items.length })}");
    expect(source).toMatch(/<MediaLibrarySidebar\s+items=\{items\}/);
  });

  it('narrows a shelf to the matching series and leaves the source list alone', () => {
    const before = buildLibraryEntries(items);

    const hits = searchMediaHub(items, { query: 'big', category: 'all' });
    expect(hits.map((i) => i.id)).toEqual(['a1', 'a2']);

    const entries = buildLibraryEntries(hits);
    expect(entries.length).toBeLessThan(before.length);
    expect(entries.every((e) => e.primary.title.includes('The Big O'))).toBe(true);
    // Both matching files are carried, because the filter runs BEFORE the
    // grouping — a hit inside a run of episodes keeps the run, it does not
    // shatter it into one card per matching file.
    const files = entries.reduce((n, e) => n + e.episodeCount + e.extras.length, 0);
    expect(files).toBe(2);

    // Mutation control: the filter is a projection, not an edit.
    expect(items).toHaveLength(4);
    expect(buildLibraryEntries(items)).toHaveLength(before.length);
  });

  it('returns nothing for a term no title carries, which is the "no matches" branch', () => {
    const hits = searchMediaHub(items, { query: 'zzqqxx-no-such-title', category: 'all' });
    expect(hits).toHaveLength(0);
    // …and the library itself is still four files, which is what keeps the shell
    // on `media.browser.noMatch` instead of the import prompt.
    expect(items).toHaveLength(4);
  });

  it('an empty query is the identity, so the box costs nothing while unused', () => {
    expect(searchMediaHub(items, { query: '', category: 'all' })).toHaveLength(items.length);
    expect(searchMediaHub(items, { query: '   ', category: 'all' })).toHaveLength(items.length);
  });
});
