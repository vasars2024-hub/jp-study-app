export const READING_GARDEN_STORAGE_KEY = 'jp-reading-garden-v1';
export const READING_GARDEN_PROGRESS_EVENT = 'jp-reading-garden-progress';
export const READING_GARDEN_MAX_STAGE = 50;
export const READING_GARDEN_PAGES_PER_PHASE = 50;
export const READING_GARDEN_EVOLUTION_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export interface ReadingGardenProgress {
  version: 2;
  /** Lifetime EPUB pages recorded by the garden. */
  pagesRead: number;
  /** Pages earned but not yet consumed by a phase evolution. */
  bankedPages: number;
  stage: number;
  lastEvolutionDay: string | null;
  lastEvolutionAt: number | null;
  lastReadAt: number | null;
  lastBookId: string | null;
}

export interface EpubPageRead {
  bookId: string;
  partIndex: number;
  pageIndex: number;
}

type GardenStorage = Pick<Storage, 'getItem' | 'setItem'>;

function finitePageCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function readingGardenDayKey(now = Date.now()): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function emptyReadingGardenProgress(): ReadingGardenProgress {
  return {
    version: 2,
    pagesRead: 0,
    bankedPages: 0,
    stage: 1,
    lastEvolutionDay: null,
    lastEvolutionAt: null,
    lastReadAt: null,
    lastBookId: null,
  };
}

export function readingGardenPendingPhases(progress: ReadingGardenProgress): number {
  if (progress.stage >= READING_GARDEN_MAX_STAGE) return 0;
  return Math.min(
    READING_GARDEN_MAX_STAGE - progress.stage,
    Math.floor(progress.bankedPages / READING_GARDEN_PAGES_PER_PHASE),
  );
}

export function readingGardenPagesTowardNext(progress: ReadingGardenProgress): number {
  if (progress.stage >= READING_GARDEN_MAX_STAGE) return READING_GARDEN_PAGES_PER_PHASE;
  return Math.min(READING_GARDEN_PAGES_PER_PHASE, progress.bankedPages);
}

export function readingGardenCanEvolve(
  progress: ReadingGardenProgress,
  now = Date.now(),
): boolean {
  if (progress.stage >= READING_GARDEN_MAX_STAGE) return false;
  if (progress.bankedPages < READING_GARDEN_PAGES_PER_PHASE) return false;
  const today = readingGardenDayKey(now);
  if (progress.lastEvolutionDay === today) return false;
  if (
    progress.lastEvolutionAt !== null &&
    now - progress.lastEvolutionAt < READING_GARDEN_EVOLUTION_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

/**
 * Releases at most one banked phase. A different local calendar day and a
 * twenty-hour monotonic interval are both required after the previous release,
 * which keeps normal daily use pleasant while resisting simple clock flipping.
 */
export function settleReadingGardenEvolution(
  progress: ReadingGardenProgress,
  now = Date.now(),
): ReadingGardenProgress {
  if (!readingGardenCanEvolve(progress, now)) return progress;
  return {
    ...progress,
    bankedPages: Math.max(0, progress.bankedPages - READING_GARDEN_PAGES_PER_PHASE),
    stage: Math.min(READING_GARDEN_MAX_STAGE, progress.stage + 1),
    lastEvolutionDay: readingGardenDayKey(now),
    lastEvolutionAt: now,
  };
}

function normalizeV2(parsed: Partial<ReadingGardenProgress>): ReadingGardenProgress {
  const pagesRead = finitePageCount(parsed.pagesRead);
  return {
    version: 2,
    pagesRead,
    bankedPages: Math.min(pagesRead, finitePageCount(parsed.bankedPages)),
    stage:
      typeof parsed.stage === 'number' && Number.isFinite(parsed.stage)
        ? Math.min(READING_GARDEN_MAX_STAGE, Math.max(1, Math.floor(parsed.stage)))
        : 1,
    lastEvolutionDay:
      typeof parsed.lastEvolutionDay === 'string' ? parsed.lastEvolutionDay : null,
    lastEvolutionAt: finiteTimestamp(parsed.lastEvolutionAt),
    lastReadAt: finiteTimestamp(parsed.lastReadAt),
    lastBookId: typeof parsed.lastBookId === 'string' ? parsed.lastBookId : null,
  };
}

function migrateV1(parsed: {
  pagesRead?: unknown;
  lastReadAt?: unknown;
  lastBookId?: unknown;
}): ReadingGardenProgress {
  const pagesRead = finitePageCount(parsed.pagesRead);
  return {
    ...emptyReadingGardenProgress(),
    pagesRead,
    bankedPages: pagesRead,
    lastReadAt: finiteTimestamp(parsed.lastReadAt),
    lastBookId: typeof parsed.lastBookId === 'string' ? parsed.lastBookId : null,
  };
}

export function loadReadingGardenProgress(
  storage: GardenStorage = localStorage,
  now = Date.now(),
): ReadingGardenProgress {
  try {
    const parsed = JSON.parse(storage.getItem(READING_GARDEN_STORAGE_KEY) || 'null') as
      | Partial<ReadingGardenProgress>
      | null;
    if (!parsed) return emptyReadingGardenProgress();
    const normalized =
      parsed.version === 2
        ? normalizeV2(parsed)
        : parsed.version === 1
          ? migrateV1(parsed)
          : emptyReadingGardenProgress();
    const settled = settleReadingGardenEvolution(normalized, now);
    if (
      parsed.version !== 2 ||
      settled !== normalized ||
      JSON.stringify(normalized) !== JSON.stringify(parsed)
    ) {
      storage.setItem(READING_GARDEN_STORAGE_KEY, JSON.stringify(settled));
    }
    return settled;
  } catch {
    return emptyReadingGardenProgress();
  }
}

export function recordEpubPageRead(
  input: EpubPageRead,
  storage: GardenStorage = localStorage,
  now = Date.now(),
): ReadingGardenProgress {
  const current = loadReadingGardenProgress(storage, now);
  const withPage: ReadingGardenProgress = {
    ...current,
    pagesRead: current.pagesRead + 1,
    bankedPages:
      current.stage >= READING_GARDEN_MAX_STAGE
        ? current.bankedPages
        : current.bankedPages + 1,
    lastReadAt: now,
    lastBookId: input.bookId,
  };
  const next = settleReadingGardenEvolution(withPage, now);
  storage.setItem(READING_GARDEN_STORAGE_KEY, JSON.stringify(next));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<ReadingGardenProgress>(READING_GARDEN_PROGRESS_EVENT, {
        detail: next,
      }),
    );
  }
  return next;
}
