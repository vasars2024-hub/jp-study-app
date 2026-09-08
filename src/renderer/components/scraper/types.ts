import type { IconName } from '../Icons';
import type {
  ScraperColumnId,
  ScraperDensity,
  ScraperPageId,
  ScraperResultTab,
  ScraperShellState,
  ScraperSortDir,
} from '../../../shared/scraperShell';
import type { SystemStats } from '../../../shared/scraperResults';
import type { ScraperTextKey } from './strings';

export type { ScraperPageId, ScraperResultTab, ScraperColumnId };

/** Stable English group ids for the rail, matching the reference layout. */
export type ScraperNavGroup = 'Scraper' | 'Data' | 'Tools';

export interface ScraperNavPage {
  id: ScraperPageId;
  /**
   * A key into SCRAPER_TEXT, not display text. Resolve with sx() at render
   * time — the shape is deliberately identical to settings/types.ts's
   * labelKey so the deferred i18n sweep is a mechanical swap to t().
   */
  labelKey: ScraperTextKey;
  descKey: ScraperTextKey;
  icon: IconName;
  group: ScraperNavGroup;
  /** Only listed when the shell's Advanced mode is on (the page still works). */
  advanced?: boolean;
}

/**
 * A key into the shared i18n catalogs rather than strings.ts. The Profiles and
 * Scheduled pages finished their migration first, so their card headings live
 * under `scraperMgmt.*` in shared/i18n/scraperUi/ in all four languages. The
 * search registry admits those directly instead of re-declaring eight strings
 * in strings.ts, which would leave two sources of truth for one heading and
 * would have to be un-forked again when the rest of the app follows.
 *
 * The prefix is all the type system can check — `Catalog` is a Record, so there
 * is no literal key union to intersect with. Existence is a test's job
 * (scraperRegistry.test.ts resolves every entry key to real text).
 */
export type ScraperSharedTextKey = `scraperMgmt.${string}`;

/** Either catalog: strings.ts while it lasts, shared for what has moved. */
export type ScraperEntryTextKey = ScraperTextKey | ScraperSharedTextKey;

export interface ScraperRegistryEntry {
  id: string;
  titleKey: ScraperEntryTextKey;
  descKey?: ScraperEntryTextKey;
  /**
   * Search terms, deliberately literal English rather than text keys — search
   * matches the resolved title/description plus these, so a feature stays
   * findable by its English name once the UI is translated.
   */
  keywords: string[];
  pageId: ScraperPageId;
  group: ScraperNavGroup;
  advanced?: boolean;
}

/**
 * The one object every page reads. Pages take zero props (the Settings app's
 * pattern) so adding a page never means threading state through the shell.
 */
export interface ScraperController {
  shell: ScraperShellState;

  page: ScraperPageId;
  navigate: (page: ScraperPageId, focusSettingId?: string) => void;
  focusSettingId: string | null;
  clearFocusSetting: () => void;

  railCollapsed: boolean;
  toggleRail: () => void;
  compact: boolean;
  setCompact: (on: boolean) => void;
  advancedMode: boolean;
  setAdvancedMode: (on: boolean) => void;

  drawerOpen: boolean;
  drawerCategory: string;
  openDrawer: (category?: string) => void;
  closeDrawer: () => void;

  resultTab: ScraperResultTab;
  setResultTab: (tab: ScraperResultTab) => void;
  visibleColumns: ScraperColumnId[];
  setVisibleColumns: (ids: ScraperColumnId[]) => void;
  sortColumn: ScraperColumnId;
  sortDir: ScraperSortDir;
  setSort: (column: ScraperColumnId, dir: ScraperSortDir) => void;
  groupBy: string;
  setGroupBy: (value: string) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  density: ScraperDensity;
  setDensity: (d: ScraperDensity) => void;

  /** Prefilled by Discover's "Queue scrape" action; consumed by New Scrape. */
  targetUrl: string;
  setTargetUrl: (url: string) => void;

  /** One-use dashboard/history handoff into the matching Results inspector. */
  resultSeriesId: string | null;
  openResultSeries: (seriesId: string) => void;
  clearResultSeries: () => void;

  /**
   * The shell's live memory/CPU/job sample, re-read on its own interval. Pages
   * read it from here rather than taking their own one-shot reading, so the
   * rail and a page cannot report two different numbers for one quantity.
   */
  systemStats: SystemStats;

  /** Shared fixture-job state so Dashboard, rail, and footer cannot disagree. */
  dashboardJobActive: boolean;
  cancelDashboardJob: () => void;

  /** One-use Dashboard health handoff into the matching source manager row. */
  sourceId: string | null;
  openSource: (sourceId: string) => void;
  clearSource: () => void;

  recentPages: ScraperPageId[];
}
