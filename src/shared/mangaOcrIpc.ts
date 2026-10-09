import type { MokuroBlockKind, MokuroBox, MokuroPage } from './mokuroTypes';

/** How aggressively the text detector finds regions on a page. */
export type DetectionSensitivity = 'low' | 'normal' | 'high';

export interface MangaOcrScanRequest {
  itemId: string;
  mediaUrl: string;
  force?: boolean;
  /** Detector aggressiveness for a fresh scan/rescan. Default 'normal'. */
  detectionSensitivity?: DetectionSensitivity;
}

/** Manually drawn box on the page image — OCR'd and appended as a new region. */
export interface MangaOcrAddRegionRequest {
  itemId: string;
  mediaUrl: string;
  /** Axis-aligned box in image pixel space: [xmin, ymin, xmax, ymax]. */
  box: MokuroBox;
}

export interface MangaOcrProgress {
  itemId: string;
  mediaUrl: string;
  phase: 'detect' | 'ocr' | 'done' | 'error';
  current: number;
  total: number;
  page?: MokuroPage;
  error?: string;
}

export interface MangaOcrCorrectionRequest {
  itemId: string;
  mediaUrl: string;
  regionId: string;
  /** At least one of lines/kind/vertical should be present. */
  lines?: string[];
  kind?: MokuroBlockKind;
  vertical?: boolean;
}

export interface MangaOcrRegionRescanRequest {
  itemId: string;
  mediaUrl: string;
  regionId: string;
}

export interface MangaOcrMergeRequest {
  itemId: string;
  mediaUrl: string;
  regionIds: [string, string];
}

export interface MangaOcrSplitRequest {
  itemId: string;
  mediaUrl: string;
  regionId: string;
  axis: 'x' | 'y';
  /** Fraction (0-1, exclusive) along `axis` where the box is cut. */
  at: number;
}

export interface MangaOcrOrderRequest {
  itemId: string;
  mediaUrl: string;
  /** regionIds in their new reading order (index = order). */
  order: string[];
}

/** Outcome of importing a Mokuro `.mokuro` volume file into an item's OCR cache. */
export type MangaMokuroImportResult =
  | { ok: true; pages: number; unmatched: number; matchedBy: 'name' | 'order' }
  | { ok: false; reason: 'invalid' | 'tooLarge' | 'noMatch' | 'noPages' };

/** Analyze (OCR) and optionally translate every page of a manga item. */
export interface MangaOcrVolumeRequest {
  itemId: string;
  /** Re-OCR pages even if cache exists. */
  force?: boolean;
  /** Run translation after OCR (requires Qwen model). Default true. */
  translate?: boolean;
  /** Target language for translation (default: en). */
  targetLang?: string;
  /** Detector aggressiveness for fresh scans. Default 'normal'. */
  detectionSensitivity?: DetectionSensitivity;
  /** Inclusive 0-based start page. Defaults to 0. */
  startPage?: number;
  /** Inclusive 0-based end page. Defaults to last page. */
  endPage?: number;
}

export interface MangaOcrVolumeProgress {
  itemId: string;
  phase: 'ocr' | 'translate' | 'done' | 'error' | 'cancelled';
  pageIndex: number;
  pageTotal: number;
  /** Optional region progress within the current page OCR. */
  regionCurrent?: number;
  regionTotal?: number;
  mediaUrl?: string;
  message?: string;
  error?: string;
  /**
   * A run that finished but could not translate some pages. Distinct from
   * `error`: OCR succeeded and those pages simply have no translation cached,
   * which the user needs told rather than shown as silently untranslated text.
   */
  warning?: string;
  ocrMeta?: {
    ocrPages: number;
    translatedPages: number;
    targetLang?: string;
    completedAt?: number;
    updatedAt: number;
  };
}
