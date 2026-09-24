// @vitest-environment node
/**
 * D315 / D345 — opening Files froze its window ~13 s and Refresh froze the desk
 * ~5 s on a 43,685-row index.
 *
 * Profiled statically and then measured in Node: the freeze was the list SORT, not
 * IPC. `sortItems` compared names with `localeCompare(b, undefined, options)`,
 * which builds a new ICU collator on every call in V8 — 14.6 s for 43,000 names,
 * against 0.5 s through one `Intl.Collator`. The join of the renderer-owned rows
 * (41,677 of them notes) also ran in one synchronous pass on every open, Refresh
 * and import; it now yields whenever a slice has held the thread for a frame.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countByCategory,
  foldFilesQuery,
  matchesFoldedQuery,
  matchesQuery,
  sortItems,
  type FilesIndexSnapshot,
  type FilesItem,
} from '../../shared/filesApp/catalog';
import { FILES_DEFAULT_SIZE, fitNewWindowRect } from '../desktopWindowGeometry';
import { widthClassFor } from '../components/liquid/LiquidAppScaffold';

function item(i: number): FilesItem {
  return {
    id: `note:${i}`,
    name: `${(i * 7919) % 100_000}語${i % 13}`,
    kind: 'note',
    categoryId: 'outputs/notes',
    provenance: 'app-generated',
    sizeBytes: null,
    createdAt: i,
    modifiedAt: null,
    lastUsedAt: null,
    location: { store: 'localStorage', key: 'k', pointer: String(i) },
    flags: {},
    source: 'known-words',
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Files — the open/refresh freeze', () => {
  it('sorts by name without building a collator per comparison', () => {
    const items = Array.from({ length: 2_000 }, (_, i) => item(i));
    const spy = vi.spyOn(String.prototype, 'localeCompare');
    const sorted = sortItems(items, 'name', 'asc');
    sortItems(items, 'kind', 'desc');
    // Every options-taking call is one new ICU collator in V8 — the freeze itself.
    expect(spy.mock.calls.filter((call) => call.length > 1 && call[2] !== undefined)).toEqual([]);
    expect(sorted).toHaveLength(2_000);
    // Still the same order the collator defines: numeric, case- and width-insensitive.
    const numeric = sortItems([{ ...item(1), name: 'file10' }, { ...item(2), name: 'file9' }], 'name');
    expect(numeric.map((i) => i.name)).toEqual(['file9', 'file10']);
  });

  it('sorts a 43,000-row index well inside a second', () => {
    const items = Array.from({ length: 43_000 }, (_, i) => item(i));
    const started = Date.now();
    sortItems(items, 'name', 'asc');
    // Measured before the fix at ~14 s for this size; the budget is generous so a
    // loaded CI machine cannot flake it, and still two orders below the defect.
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  it('search folds each name once, not once per keystroke', () => {
    const items = Array.from({ length: 500 }, (_, i) => item(i));
    const spy = vi.spyOn(String.prototype, 'normalize');
    expect(items.filter((i) => matchesQuery(i, '語1')).length).toBeGreaterThan(0);
    const folded = foldFilesQuery('語12');
    const first = spy.mock.calls.length;
    const hits = items.filter((i) => matchesFoldedQuery(i, folded));
    // The list filter folds the query once and reuses each name's fold: no
    // NFKC pass over 500 names on the second keystroke.
    expect(spy.mock.calls.length - first).toBe(0);
    expect(hits.every((i) => i.name.includes('語12'))).toBe(true);
  });

  it('the renderer join yields once a slice has run long, and gives the same result', async () => {
    const { withRendererItems, withRendererItemsAsync } = await import(
      '../components/filesapp/rendererEnumerators'
    );
    const snapshot: FilesIndexSnapshot = {
      items: [item(1), item(2)],
      counts: countByCategory([item(1), item(2)]),
      enumerators: [],
      builtAt: 0,
    };
    let clock = 0;
    let yields = 0;
    const joined = await withRendererItemsAsync(
      snapshot,
      async () => {
        yields += 1;
      },
      12,
      () => (clock += 20),
    );
    expect(yields).toBeGreaterThan(0);
    const sync = withRendererItems(snapshot);
    expect(joined.items.map((i) => i.id)).toEqual(sync.items.map((i) => i.id));
    expect(joined.enumerators.map((r) => r.source)).toEqual(sync.enumerators.map((r) => r.source));

    // A fast join never pauses at all.
    let calm = 0;
    await withRendererItemsAsync(snapshot, async () => {
      calm += 1;
    }, 12, () => 0);
    expect(calm).toBe(0);
  });
});

describe('Files — first-open size and chrome', () => {
  it('opens wide enough for its three-pane layout on an ordinary desk', () => {
    const rect = fitNewWindowRect({ x: 60, y: 24, ...FILES_DEFAULT_SIZE }, { w: 1920, h: 1000 }, { w: 260, h: 170 });
    expect(rect.w).toBe(FILES_DEFAULT_SIZE.w);
    // 820 -> 782 of scaffold was measured live; the frame costs ~38px.
    expect(widthClassFor(rect.w - 38)).toBe('wide');
    expect(widthClassFor(820 - 38)).toBe('medium');
  });

  it('Scan a folder and Clean up get the same button styling as their neighbours', () => {
    const css = readFileSync(resolve(__dirname, '../components/filesapp/filesApp.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const start = css.indexOf('.fa-sort-dir,');
    const selectorList = css.slice(start, css.indexOf('{', start));
    expect(selectorList).toContain('.fa-action');
    expect(selectorList).toContain('.fa-scan-open');
    expect(selectorList).toContain('.fa-cleanup-open');
    expect(selectorList).toContain('.fa-refresh');
  });
});
