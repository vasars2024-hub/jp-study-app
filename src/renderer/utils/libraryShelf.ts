/**
 * How the Library shelf decides what to paint and what to detail.
 *
 * These two decisions used to be one expression inside LibraryView, and the
 * expression was written for a *permanent* inspector column: it fell back to
 * the first visible item so the pane always had something in it. The Reading
 * workspace plan asks for a contextual detail drawer instead — a pane that is
 * not in the layout when nothing is selected — and against that shape the
 * fallback is a bug, not a nicety: `setSelectedId(null)` would immediately
 * re-resolve to `visible[0]`, so the close button could never close anything
 * and the shelf could never take the width back.
 */

import type { LibraryItem } from '../../shared/types';
import type { ReadingWorkspaceActionId } from '../../shared/readingWorkspaceActions';

/**
 * How the shelf paints its items. `grid` is the default because a library is
 * browsed by recognising covers; `list` is for scanning progress, type and
 * folder membership down a long collection, which a grid is bad at.
 */
export type LibraryLayout = 'grid' | 'list';

export const LIBRARY_LAYOUTS: readonly LibraryLayout[] = ['grid', 'list'];

export const DEFAULT_LIBRARY_LAYOUT: LibraryLayout = 'grid';

/**
 * The selected item, or null.
 *
 * Selection is only honest if it survives being checked against what is
 * actually on screen. A recorded id outlives its item in three ordinary ways —
 * the item was removed, the folder was switched, a language or level filter
 * excluded it — and in every one of them the drawer must close rather than
 * hold an empty column open or, worse, quietly detail a different book.
 */
export function resolveSelection<T extends { id: string }>(
  visible: readonly T[],
  selectedId: string | null,
): T | null {
  if (!selectedId) return null;
  return visible.find((item) => item.id === selectedId) ?? null;
}

/** What the workbench publishes so CSS can drop the drawer's column entirely. */
export function drawerState(selected: unknown): 'open' | 'closed' {
  return selected ? 'open' : 'closed';
}

/* ------------------------------------------------------------------ *
 * Recently read, Continue reading, series.
 *
 * Every item already carries `lastReadAt` (main writes it with each progress
 * save) and `progress.percent`; the shelf simply never ordered by them.
 * ------------------------------------------------------------------ */

/** A book counts as finished from here on, so it leaves "Continue reading". */
export const FINISHED_PERCENT = 0.985;

/** How many books the "Continue reading" shelf shows. */
export const CONTINUE_READING_LIMIT = 8;

type ShelfItem = Pick<LibraryItem, 'id' | 'title' | 'createdAt' | 'lastReadAt' | 'progress' | 'readingSource'> & {
  inboxMeta?: { receivedAt: number } | undefined;
};

function readAt(item: ShelfItem): number {
  return typeof item.lastReadAt === 'number' && Number.isFinite(item.lastReadAt) ? item.lastReadAt : 0;
}

function addedAt(item: ShelfItem): number {
  return item.inboxMeta?.receivedAt ?? item.createdAt;
}

/**
 * "Recently read" order: books ever opened first, the latest on top; books
 * never opened after them, newest import first — so the sort never hides an
 * unread book, it just puts it behind what the reader is actually reading.
 */
export function compareRecentlyRead(a: ShelfItem, b: ShelfItem): number {
  const ra = readAt(a);
  const rb = readAt(b);
  if (ra !== rb) return rb - ra;
  return addedAt(b) - addedAt(a);
}

/** The progress fraction 0..1 a library item reports, clamped. */
export function progressFraction(item: Pick<LibraryItem, 'progress'>): number {
  const pct = item.progress?.percent;
  return typeof pct === 'number' && Number.isFinite(pct) ? Math.min(1, Math.max(0, pct)) : 0;
}

/**
 * Books started and not finished, most recently read first. A book opened but
 * never moved off its first page still counts — it was opened to be read.
 */
export function continueReadingItems<T extends ShelfItem>(
  items: readonly T[],
  limit = CONTINUE_READING_LIMIT,
): T[] {
  return items
    .filter((item) => readAt(item) > 0 && progressFraction(item) < FINISHED_PERCENT)
    .sort(compareRecentlyRead)
    .slice(0, Math.max(0, limit));
}

const VOLUME_SUFFIXES: readonly RegExp[] = [
  // 【1】 (1) （第2巻） [Vol. 3]
  /\s*[[(（【]\s*(?:vol(?:ume)?\.?|第)?\s*\d+\s*(?:巻|話|冊)?\s*[\])）】]\s*$/iu,
  // 第2巻, 2巻
  /\s*(?:第\s*)?\d+\s*(?:巻|冊)\s*$/u,
  // Vol. 3, Volume 3, Book 2, v03
  /[\s,_-]*(?<![\p{L}\p{N}])(?:vol(?:ume)?\.?|book|v)\s*\d+\s*$/iu,
  // #12
  /\s*#\s*\d+\s*$/u,
  // "Title - 03", "Title 3"
  /[\s\-–—:_]+\d{1,3}\s*$/u,
  // CJK title run straight into its number: よつばと!1
  /(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}!?])\d{1,3}\s*$/u,
];

/**
 * The series a book belongs to: the provider's work title when the item came
 * from one (a downloaded manga chapter knows its work exactly), else the title
 * with its volume number taken off. NFKC first, so `１巻` and `1巻` agree.
 */
export function librarySeriesName(item: Pick<LibraryItem, 'title' | 'readingSource'>): string {
  const work = item.readingSource?.workTitle?.trim();
  if (work) return work;
  const title = item.title.normalize('NFKC').trim();
  let base = title;
  for (const pattern of VOLUME_SUFFIXES) base = base.replace(pattern, '');
  base = base.replace(/[\s\-–—:_,]+$/u, '').trim();
  return base || title;
}

/** Comparison key for a series name: case- and width-folded. */
export function librarySeriesKey(item: Pick<LibraryItem, 'title' | 'readingSource'>): string {
  return librarySeriesName(item).toLowerCase();
}

export interface LibrarySeriesGroup<T> {
  /** The series name, or '' for the books that belong to no series. */
  name: string;
  items: T[];
}

/**
 * Books grouped by series. A "series" of one book is not a series: those are
 * gathered in one trailing group (name '') instead of each getting a heading.
 * Within a series the books keep the order they came in with.
 */
export function groupLibraryBySeries<T extends Pick<LibraryItem, 'title' | 'readingSource'>>(
  items: readonly T[],
): Array<LibrarySeriesGroup<T>> {
  const byKey = new Map<string, LibrarySeriesGroup<T>>();
  for (const item of items) {
    const key = librarySeriesKey(item);
    const group = byKey.get(key);
    if (group) group.items.push(item);
    else byKey.set(key, { name: librarySeriesName(item), items: [item] });
  }
  const series: Array<LibrarySeriesGroup<T>> = [];
  const standalone: T[] = [];
  for (const group of byKey.values()) {
    if (group.items.length > 1) series.push(group);
    else standalone.push(...group.items);
  }
  series.sort((a, b) => a.name.localeCompare(b.name));
  if (standalone.length) series.push({ name: '', items: standalone });
  return series;
}

/**
 * Arrow-key movement down a list of rows: the index to focus after `key`, or
 * null when the key is not a list-movement key. Clamped, never wraps — a list
 * that jumps from the last row back to the first loses the reader's place.
 */
export function nextRowIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowDown') return Math.min(count - 1, current + 1);
  if (key === 'ArrowUp') return Math.max(0, current - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * What the Library shelf can genuinely perform from its detail drawer.
 *
 * This is the host half of `resolveReadingWorkspaceActions`'s intersection —
 * the shared registry decides which actions an *entry* supports, this decides
 * which of them this *surface* can actually carry out. It is a function of the
 * item rather than a constant because mining is only truthful for the exact
 * books the mining panel would list: `EpubMiningSimplePanel` filters its own
 * picker to `kind === 'book'` with a real `.epub` file, so handing it anything
 * else would open a surface that cannot find the book you clicked.
 *
 * `import`, `extract`, `plan`, `analyze`, `progress` and `jitenVocabulary` are
 * absent because nothing on this surface performs them yet. Absent, not
 * disabled: a button that is rendered and can never fire is a promise the app
 * does not keep.
 */
export function libraryHostedActions(
  item: Pick<LibraryItem, 'kind' | 'epubFile'>,
): ReadingWorkspaceActionId[] {
  const hosted: ReadingWorkspaceActionId[] = ['read', 'dictionary'];
  if (item.kind === 'book' && item.epubFile?.toLowerCase().endsWith('.epub')) hosted.push('mine');
  return hosted;
}
