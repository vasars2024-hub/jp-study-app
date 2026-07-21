// Cubari-style manga reader preferences. Persisted to localStorage, following
// the same pattern as readerSettings.ts (the EPUB/novel reader's settings) —
// a typed interface + load/save pair — but kept as its own module since the
// manga reader's controls (spread, page-selector position, etc.) don't apply
// to the EPUB reader at all.

export type PageFitMode =
  | 'limit-all'
  | 'limit-width'
  | 'limit-height'
  | 'stretch-all'
  | 'stretch-width'
  | 'stretch-height';
export type ReaderLayout = 'ltr' | 'ttb' | 'rtl';
export type PageSelectorPosition = 'left' | 'bottom';
export type MangaReaderTheme = 'app-default' | 'cubari' | 'custom';
/** How aggressively the text detector finds regions on a page (more = catches more, risks false boxes). */
export type DetectionSensitivity = 'low' | 'normal' | 'high';
/**
 * Cubari's "browser history/back-button behavior" setting, ported for visual
 * parity. This app has no real browser-history stack or OS-window-title sync,
 * so only 'none' vs. anything-else is functionally wired (confirm-before-close);
 * the other four options are not distinguishable in a local-file desktop reader
 * and are documented as such in the settings panel.
 */
export type HistoryBehavior = 'none' | 'title' | 'chapter' | 'chapter-skip' | 'every-move';

export interface MangaReaderSettings {
  pageFit: PageFitMode;
  /** 10-100, caps the resolved page width regardless of fit mode. */
  maxPageWidthPct: number;
  readerLayout: ReaderLayout;
  /** TTB mode only: no gap between stacked page images. */
  removeGapsVertical: boolean;
  /** How many pages render per spread (1 = single page). */
  spreadPageCount: number;
  /** Pages before the first full spread that render solo (e.g. 1 = cover-alone). */
  spreadPageOffset: number;
  /** How many pages ahead to prefetch (image decode warm-up). -1 = unlimited. */
  preloadPages: number;
  /** How many of those prefetches may be in flight at once. */
  preloadConcurrency: number;
  /** TTB mode: px per arrow-key press. */
  scrollSpeedPx: number;
  resetScrollOnFlip: boolean;
  clickToTurnPages: boolean;
  arrowKeysInVertical: boolean;
  swipeGesturesEnabled: boolean;
  historyBehavior: HistoryBehavior;
  pageSelectorPosition: PageSelectorPosition;
  pageSelectorPinned: boolean;
  showPageNumber: boolean;
  hoverHintsEnabled: boolean;
  showSidebarByDefault: boolean;
  /** Floating page thumbnail while hovering the seek bar. */
  showPagePreviews: boolean;
  /** Auto-OCR + auto-translate every page in the background when a manga opens, saved to disk. */
  autoTranslate: boolean;
  /** How aggressively the detector finds text regions (affects a fresh scan/rescan only). */
  detectionSensitivity: DetectionSensitivity;
  theme: MangaReaderTheme;
  themeColors: { interface: string; text: string; accent: string; background: string };
}

export const DEFAULT_MANGA_READER_SETTINGS: MangaReaderSettings = {
  pageFit: 'limit-all',
  maxPageWidthPct: 100,
  readerLayout: 'ltr',
  removeGapsVertical: false,
  spreadPageCount: 1,
  spreadPageOffset: 0,
  preloadPages: 3,
  preloadConcurrency: 5,
  scrollSpeedPx: 25,
  resetScrollOnFlip: true,
  clickToTurnPages: true,
  arrowKeysInVertical: true,
  swipeGesturesEnabled: true,
  historyBehavior: 'none',
  pageSelectorPosition: 'bottom',
  pageSelectorPinned: true,
  showPageNumber: true,
  hoverHintsEnabled: false,
  showSidebarByDefault: false,
  showPagePreviews: false,
  autoTranslate: true,
  detectionSensitivity: 'normal',
  theme: 'app-default',
  themeColors: { interface: '#1a1a1a', text: '#f2f2f2', accent: '#ff2e4d', background: '#0c0c0c' },
};

export const CUBARI_THEME_COLORS = {
  interface: '#232733',
  text: '#e8e8ec',
  accent: '#7c8cff',
  background: '#14161f',
};

export const MAX_PAGE_WIDTH_MIN = 10;
export const MAX_PAGE_WIDTH_MAX = 100;
export const SPREAD_COUNT_MAX = 10;
export const PRELOAD_PAGES_MAX = 9;
export const PRELOAD_CONCURRENCY_MIN = 5;
export const PRELOAD_CONCURRENCY_MAX = 50;
export const SCROLL_SPEED_MIN = 5;
export const SCROLL_SPEED_MAX = 50;

const STORAGE_KEY = 'jp-manga-reader-settings';

export function loadMangaReaderSettings(): MangaReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MANGA_READER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<MangaReaderSettings>;
    const merged: MangaReaderSettings = {
      ...DEFAULT_MANGA_READER_SETTINGS,
      ...parsed,
      themeColors: { ...DEFAULT_MANGA_READER_SETTINGS.themeColors, ...parsed.themeColors },
    };
    // Guard against corrupt / partial saves that crash the reader on open.
    if (typeof merged.pageFit !== 'string' || !merged.pageFit) {
      merged.pageFit = DEFAULT_MANGA_READER_SETTINGS.pageFit;
    }
    if (!Number.isFinite(merged.maxPageWidthPct)) {
      merged.maxPageWidthPct = DEFAULT_MANGA_READER_SETTINGS.maxPageWidthPct;
    }
    if (!Number.isFinite(merged.spreadPageCount) || merged.spreadPageCount < 1) {
      merged.spreadPageCount = 1;
    }
    if (typeof merged.autoTranslate !== 'boolean') {
      merged.autoTranslate = DEFAULT_MANGA_READER_SETTINGS.autoTranslate;
    }
    if (!['low', 'normal', 'high'].includes(merged.detectionSensitivity)) {
      merged.detectionSensitivity = DEFAULT_MANGA_READER_SETTINGS.detectionSensitivity;
    }
    return merged;
  } catch {
    return { ...DEFAULT_MANGA_READER_SETTINGS };
  }
}

export function saveMangaReaderSettings(s: MangaReaderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full or unavailable — settings just won't persist */
  }
}
