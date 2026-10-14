/**
 * Turn a local deck into something Anki can import, audio and all.
 *
 * The decision is in `shared/deckMediaExport`; this is the run. It reuses the
 * CSV escaping the plain export already uses rather than a second quoting
 * routine, so a sentence with a comma behaves the same either way.
 */

import type { ExportableReview } from '../shared/apkgCards';
import { escapeCsvField, type CsvDelimiter } from '../shared/csvEditor';
import {
  buildDeckMediaExport,
  type DeckMediaExportCard,
  type DeckMediaExportOptions,
} from '../shared/deckMediaExport';
import type { LocalDeckApkgSchedule } from '../shared/localDeckApkg';
import { isRecallReview, type ReviewLogEntry } from '../shared/reviewLog';
import { loadFullReviewLog } from './reviewLog';

export interface DeckMediaExportOutcome {
  ok: boolean;
  directory?: string;
  /** Cards written to the text file. */
  cards: number;
  /** Media files written beside it. */
  written: number;
  /** Media a card pointed at that could not be exported — gone, or not managed. */
  failed: number;
  /** Cards with no audio at all. Not a failure; the row is still exported. */
  withoutAudio: number;
  packagePath?: string;
  packageVerified?: boolean;
  /** Cards the package carries with their review schedule. */
  scheduled?: number;
  /** Past answers the package carries in its review log. */
  reviews?: number;
  error?: string;
}

/**
 * Each exported card's past answers, by card id, from the whole review log
 * (archive included). Only recall reviews: a game or practice answer is not a
 * review Anki would have logged.
 */
export function exportHistoryByCard(
  log: readonly ReviewLogEntry[],
  cardIds: ReadonlySet<string>,
): Map<string, ExportableReview[]> {
  const out = new Map<string, ExportableReview[]>();
  for (const entry of log) {
    if (!entry.cardId || !cardIds.has(entry.cardId) || !entry.rating || !isRecallReview(entry)) continue;
    const review: ExportableReview = { at: entry.at, rating: entry.rating };
    if (entry.prevIntervalDays !== undefined) review.prevIntervalDays = entry.prevIntervalDays;
    if (entry.intervalDays !== undefined) review.intervalDays = entry.intervalDays;
    if (entry.isNew) review.isNew = true;
    if (entry.durationMs !== undefined) review.durationMs = entry.durationMs;
    const list = out.get(entry.cardId);
    if (list) list.push(review);
    else out.set(entry.cardId, [review]);
  }
  return out;
}

/**
 * Export `cards` with their audio.
 *
 * Returns rather than throws: every count the caller shows has to come from
 * what actually reached disk, and a partial export — some clips gone, the rest
 * written — is a real outcome that must be reported as one instead of being
 * rounded to success or to failure.
 */
export async function runDeckAudioExport(
  cards: readonly DeckMediaExportCard[],
  fileName = 'deck.csv',
  delimiter: CsvDelimiter = ',',
  options: DeckMediaExportOptions = { includeImages: true, includeSchedule: true },
): Promise<DeckMediaExportOutcome> {
  const built = buildDeckMediaExport(cards, options);
  let schedules: Array<LocalDeckApkgSchedule | null> | undefined = built.schedules;
  if (schedules) {
    // The Anki package carries each scheduled card's answers as its review
    // log. A log that cannot be read exports the schedules alone, as before.
    const ids = new Set(cards.filter((card) => card.srs).map((card) => card.id));
    const log = ids.size ? await loadFullReviewLog().catch(() => [] as ReviewLogEntry[]) : [];
    const history = exportHistoryByCard(log, ids);
    schedules = schedules.map((schedule, index) => {
      const rows = schedule?.srs ? history.get(cards[index].id) : undefined;
      return schedule && rows?.length ? { ...schedule, history: rows } : schedule;
    });
  }
  const text = built.rows
    .map((row) => row.map((field) => escapeCsvField(field, delimiter)).join(delimiter))
    .join('\n');

  const result = await window.api.flashcardExportDeck({
    text,
    fileName,
    media: built.media,
    rows: built.rows,
    ...(schedules ? { schedules } : {}),
    ...(built.notes ? { notes: built.notes } : {}),
  });
  return {
    ok: result.ok === true,
    directory: result.directory,
    cards: built.rows.length - 1,
    written: result.written ?? 0,
    failed: result.failed ?? 0,
    withoutAudio: built.withoutAudio,
    packagePath: result.packagePath,
    packageVerified: result.packageVerified,
    ...(typeof result.scheduled === 'number' ? { scheduled: result.scheduled } : {}),
    ...(typeof result.reviews === 'number' ? { reviews: result.reviews } : {}),
    error: result.error,
  };
}
