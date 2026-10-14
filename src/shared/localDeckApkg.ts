import { isLocalSrsState } from './localSrs';

export interface LocalDeckApkgMedia {
  fileName: string;
  filePath: string;
}

export interface LocalDeckApkgRequest {
  kind: 'write';
  id: string;
  outputPath: string;
  deckName: string;
  /** Header first, followed by card rows in the shared deck-export order. */
  rows: string[][];
  media: LocalDeckApkgMedia[];
  nowMs: number;
  /**
   * Per card row (aligned with `rows.slice(1)`): its local schedule, written as
   * Anki scheduling columns so the package imports reviewed cards as reviewed.
   * Absent or null entries export as new cards — the format before this existed.
   */
  schedules?: Array<LocalDeckApkgSchedule | null>;
  /**
   * Per card row (aligned with `rows.slice(1)`): the card's saved extras, which
   * the writer turns into the `Notes` column's markup itself
   * (`shared/cardAiExtrasHtml.ts`) — a renderer-built HTML string is never
   * trusted as markup, only escaped.
   */
  notes?: Array<import('./cardAiExtras').CardAiExtras | null>;
  /** Headings for that block, from main's own catalog. */
  notesLabels?: import('./cardAiExtrasHtml').CardAiExtrasLabels;
}

export interface LocalDeckApkgSchedule {
  srs?: import('./localSrs').LocalSrsState;
  suspended?: boolean;
  /**
   * The card's past answers from the review log, written as Anki `revlog`
   * rows so Anki's statistics, its FSRS optimiser and "reschedule from
   * history" see them. Absent: the package carries the schedule only.
   */
  history?: import('./apkgCards').ExportableReview[];
}

/** Most answers one exported card carries; beyond this the oldest are left out. */
export const LOCAL_DECK_APKG_HISTORY_LIMIT = 5000;

const RATINGS = new Set(['again', 'hard', 'good', 'easy']);

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** One answer from the renderer, kept only when it is a real answer at a real time. */
function sanitizeReview(value: unknown): import('./apkgCards').ExportableReview | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const at = finiteOrUndefined(raw.at);
  if (at === undefined || at <= 0 || typeof raw.rating !== 'string' || !RATINGS.has(raw.rating)) return null;
  const review: import('./apkgCards').ExportableReview = { at, rating: raw.rating as import('./localSrs').LocalSrsRating };
  const prev = finiteOrUndefined(raw.prevIntervalDays);
  const next = finiteOrUndefined(raw.intervalDays);
  const duration = finiteOrUndefined(raw.durationMs);
  if (prev !== undefined && prev >= 0) review.prevIntervalDays = prev;
  if (next !== undefined && next >= 0) review.intervalDays = next;
  if (duration !== undefined && duration >= 0) review.durationMs = duration;
  if (raw.isNew === true) review.isNew = true;
  return review;
}

/**
 * Per-row schedules as main accepts them from the renderer: anything that is
 * not a valid local SRS state exports as new, and a history keeps only
 * well-formed answers (the newest `LOCAL_DECK_APKG_HISTORY_LIMIT` of them).
 */
export function sanitizeLocalDeckApkgSchedules(value: unknown): LocalDeckApkgRequest['schedules'] {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const raw = entry as { srs?: unknown; suspended?: unknown; history?: unknown };
    const srs = isLocalSrsState(raw.srs) ? raw.srs : undefined;
    const suspended = raw.suspended === true;
    const history = Array.isArray(raw.history)
      ? raw.history.slice(-LOCAL_DECK_APKG_HISTORY_LIMIT).map(sanitizeReview).filter((r): r is NonNullable<typeof r> => r !== null)
      : [];
    if (!srs && !suspended) return null;
    return {
      ...(srs ? { srs } : {}),
      ...(suspended ? { suspended } : {}),
      ...(srs && history.length ? { history } : {}),
    };
  });
}

export type LocalDeckApkgWorkerResponse =
  | { kind: 'accepted'; id: string }
  | { kind: 'complete'; id: string; outputPath: string; notes: number; media: number; scheduled?: number; reviews?: number }
  | { kind: 'error'; id: string; error: string };
