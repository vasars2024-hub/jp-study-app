// Scraper app — persisted UI shape.
//
// This is deliberately separate from shared/scraperSettings.ts: that document
// describes how the scraper *behaves* (network, extraction, sources, torrents)
// and is profile-scoped, whereas everything here is how the window *looks* —
// which page is open, how wide the rail is, which columns the table shows.
// Mixing them would mean a profile switch rearranged the user's furniture.
//
// Pure and node-testable: no DOM, no storage. renderer/scraperShellStore.ts
// owns persistence. normalizeScraperShellState() mirrors the {value, issues}
// contract of validateScraperSettings() so both stores fail the same way.

export const SCRAPER_SHELL_VERSION = 1;

export type ScraperPageId =
  | 'dashboard'
  | 'new-scrape'
  | 'discover'
  | 'history'
  | 'sources'
  | 'torrents'
  | 'profiles'
  | 'scheduled'
  | 'site-rules'
  | 'plugins'
  | 'results'
  | 'downloads'
  | 'exports'
  | 'selector-tester'
  | 'regex-tester'
  | 'http-inspector'
  | 'script-console';

export const SCRAPER_PAGE_IDS: ScraperPageId[] = [
  'dashboard',
  'new-scrape',
  'discover',
  'history',
  'sources',
  'torrents',
  'profiles',
  'scheduled',
  'site-rules',
  'plugins',
  'results',
  'downloads',
  'exports',
  'selector-tester',
  'regex-tester',
  'http-inspector',
  'script-console',
];

export type ScraperResultTab =
  | 'episodes'
  | 'details'
  | 'streams'
  | 'torrents'
  | 'images'
  | 'metadata'
  | 'logs';

export const SCRAPER_RESULT_TABS: ScraperResultTab[] = [
  'episodes',
  'details',
  'streams',
  'torrents',
  'images',
  'metadata',
  'logs',
];

export type ScraperDensity = 'compact' | 'cozy';
export type ScraperSortDir = 'asc' | 'desc';

/** Page sizes offered by the table footer's "N per page" control. */
export const SCRAPER_PAGE_SIZES = [10, 25, 50, 100, 200] as const;

/**
 * Column ids the table can show. Kept here rather than in the renderer so the
 * normalizer can drop ids from a future (or downgraded) build without the
 * renderer having to defend against them at paint time.
 */
export const SCRAPER_COLUMN_IDS = [
  'select',
  'index',
  'title',
  'type',
  'language',
  'subtitles',
  'resolution',
  'source',
  'size',
  'duration',
  'airDate',
  'season',
  'status',
  'link',
] as const;

export type ScraperColumnId = (typeof SCRAPER_COLUMN_IDS)[number];

const DEFAULT_COLUMNS: ScraperColumnId[] = [
  'select',
  'index',
  'title',
  'type',
  'language',
  'subtitles',
  'resolution',
  'source',
  'size',
  'link',
];

const MAX_RECENT_PAGES = 8;

export interface ScraperShellState {
  version: typeof SCRAPER_SHELL_VERSION;
  page: ScraperPageId;
  railCollapsed: boolean;
  /** Screenshot-1 layout: one narrow window instead of the rail + drawer app. */
  compact: boolean;
  /**
   * "Advanced / developer tools": expert settings fields plus the developer pages
   * (Selector Tester, Regex Tester, HTTP Inspector, Script Console) and the rail's
   * memory/CPU readout. Off by default so a learner sees the scraper, not its
   * workbench. It used to live under its own localStorage key
   * (`jp-scraper-advanced-v1`), restored separately from everything else here;
   * ScraperApp migrates that key into this field once.
   */
  advanced: boolean;
  drawerOpen: boolean;
  /** Advanced Settings drawer category id; validated against the drawer nav at render. */
  drawerCategory: string;
  resultTab: ScraperResultTab;
  visibleColumns: ScraperColumnId[];
  columnOrder: ScraperColumnId[];
  sortColumn: ScraperColumnId;
  sortDir: ScraperSortDir;
  /** '' means no grouping. */
  groupBy: string;
  pageSize: number;
  density: ScraperDensity;
  recentPages: ScraperPageId[];
}

export interface ScraperShellIssue {
  path: string;
  message: string;
}

export const DEFAULT_SCRAPER_SHELL_STATE: ScraperShellState = {
  version: SCRAPER_SHELL_VERSION,
  page: 'dashboard',
  railCollapsed: false,
  compact: false,
  advanced: false,
  drawerOpen: false,
  drawerCategory: 'network',
  resultTab: 'episodes',
  visibleColumns: [...DEFAULT_COLUMNS],
  columnOrder: [...SCRAPER_COLUMN_IDS],
  sortColumn: 'index',
  sortDir: 'asc',
  groupBy: '',
  pageSize: 10,
  density: 'cozy',
  recentPages: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boolAt(
  input: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = input[key];
  return typeof value === 'boolean' ? value : fallback;
}

function enumAt<T extends string>(
  input: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
  issues: ScraperShellIssue[],
): T {
  const value = input[key];
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  if (value !== undefined) {
    issues.push({ path: key, message: `Unknown value; using "${fallback}".` });
  }
  return fallback;
}

/** Keeps declaration order, drops unknown ids, drops repeats. */
function columnListAt(
  input: Record<string, unknown>,
  key: string,
  fallback: ScraperColumnId[],
  issues: ScraperShellIssue[],
): ScraperColumnId[] {
  const value = input[key];
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<string>();
  const out: ScraperColumnId[] = [];
  let dropped = 0;
  for (const entry of value) {
    if (typeof entry !== 'string') {
      dropped += 1;
      continue;
    }
    if (!(SCRAPER_COLUMN_IDS as readonly string[]).includes(entry)) {
      dropped += 1;
      continue;
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry as ScraperColumnId);
  }
  if (dropped > 0) {
    issues.push({ path: key, message: `Dropped ${dropped} unknown column id(s).` });
  }
  // An empty result would render a table with no columns at all, which reads as
  // a broken app rather than a user preference.
  return out.length ? out : [...fallback];
}

export function normalizeScraperShellState(input: unknown): {
  value: ScraperShellState;
  issues: ScraperShellIssue[];
} {
  const issues: ScraperShellIssue[] = [];
  if (!isRecord(input)) {
    return { value: { ...DEFAULT_SCRAPER_SHELL_STATE }, issues };
  }

  const visibleColumns = columnListAt(
    input,
    'visibleColumns',
    DEFAULT_SCRAPER_SHELL_STATE.visibleColumns,
    issues,
  );

  // Any column the user can toggle on must have a place in the order, so the
  // order is completed from the canonical list rather than trusted wholesale.
  const storedOrder = columnListAt(
    input,
    'columnOrder',
    DEFAULT_SCRAPER_SHELL_STATE.columnOrder,
    issues,
  );
  const columnOrder = [
    ...storedOrder,
    ...SCRAPER_COLUMN_IDS.filter((id) => !storedOrder.includes(id)),
  ];

  const rawPageSize = input.pageSize;
  let pageSize = DEFAULT_SCRAPER_SHELL_STATE.pageSize;
  if (typeof rawPageSize === 'number' && Number.isFinite(rawPageSize)) {
    const match = SCRAPER_PAGE_SIZES.find((n) => n === rawPageSize);
    if (match) pageSize = match;
    else issues.push({ path: 'pageSize', message: 'Unsupported page size; using 10.' });
  }

  const rawRecent = input.recentPages;
  const recentPages: ScraperPageId[] = [];
  if (Array.isArray(rawRecent)) {
    for (const entry of rawRecent) {
      if (typeof entry !== 'string') continue;
      if (!(SCRAPER_PAGE_IDS as string[]).includes(entry)) continue;
      if (recentPages.includes(entry as ScraperPageId)) continue;
      recentPages.push(entry as ScraperPageId);
      if (recentPages.length >= MAX_RECENT_PAGES) break;
    }
  }

  const groupByRaw = input.groupBy;
  const groupBy = typeof groupByRaw === 'string' ? groupByRaw.slice(0, 40) : '';

  const drawerCategoryRaw = input.drawerCategory;
  const drawerCategory =
    typeof drawerCategoryRaw === 'string' && drawerCategoryRaw.trim()
      ? drawerCategoryRaw.trim().slice(0, 40)
      : DEFAULT_SCRAPER_SHELL_STATE.drawerCategory;

  return {
    value: {
      version: SCRAPER_SHELL_VERSION,
      page: enumAt(input, 'page', SCRAPER_PAGE_IDS, 'dashboard', issues),
      railCollapsed: boolAt(input, 'railCollapsed', false),
      compact: boolAt(input, 'compact', false),
      advanced: boolAt(input, 'advanced', false),
      drawerOpen: boolAt(input, 'drawerOpen', false),
      drawerCategory,
      resultTab: enumAt(input, 'resultTab', SCRAPER_RESULT_TABS, 'episodes', issues),
      visibleColumns,
      columnOrder,
      sortColumn: enumAt(input, 'sortColumn', SCRAPER_COLUMN_IDS, 'index', issues),
      sortDir: enumAt(input, 'sortDir', ['asc', 'desc'] as const, 'asc', issues),
      groupBy,
      pageSize,
      density: enumAt(input, 'density', ['compact', 'cozy'] as const, 'cozy', issues),
      recentPages,
    },
    issues,
  };
}

/** Most-recently-used page list, newest first, deduped and capped. */
export function pushRecentScraperPage(
  recent: ScraperPageId[],
  id: ScraperPageId,
): ScraperPageId[] {
  return [id, ...recent.filter((p) => p !== id)].slice(0, MAX_RECENT_PAGES);
}
