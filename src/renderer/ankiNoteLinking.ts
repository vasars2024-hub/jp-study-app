/**
 * Link Gum cards to Anki notes that already exist, instead of creating them again.
 *
 * Mine on the laptop, sync Anki through AnkiWeb, open Gum on the desktop: the
 * desktop's copy of the card (queued while its Anki was closed, or refused as a
 * duplicate) has no note id, and the queue would add the note a second time —
 * into another deck when the profiles differ, where Anki's duplicate check does
 * not look. A link pass asks main which existing notes these cards are (same
 * note type as a profile, term field equal to the word; read-only) and records
 * the note id on the card, which takes it out of the queue for good.
 */

import { loadDeck, updateDeckCard, type DeckFlashcard } from './flashcardDeck';
import { readAnkiSyncState, updateAnkiSyncState } from './ankiSyncState';
import {
  ANKI_SYNC_LINK_BATCH,
  needsAnkiLink,
  type AnkiLinkRequest,
  type AnkiSyncErrorKind,
} from '../shared/ankiReviewSync';

export interface AnkiLinkPassReport {
  /** Cards asked about. */
  looked: number;
  /** Cards that now carry a note id. */
  linkedIds: string[];
  /** Linked although more than one note matched equally (the oldest was taken). */
  ambiguous: number;
  errorKind?: AnkiSyncErrorKind;
  error?: string;
}

/**
 * One pass over `cards` (default: the whole deck) that need a link. Never
 * throws; a main without the channel, or nothing to look up, is a no-op.
 */
export async function linkCardsToExistingAnkiNotes(
  cards: readonly DeckFlashcard[] = loadDeck(),
  now = Date.now(),
): Promise<AnkiLinkPassReport> {
  const report: AnkiLinkPassReport = { looked: 0, linkedIds: [], ambiguous: 0 };
  const find = typeof window !== 'undefined' ? window.api?.ankiFindNoteLinks : undefined;
  if (typeof find !== 'function') return report;
  const wanted = cards.filter(needsAnkiLink).slice(0, ANKI_SYNC_LINK_BATCH);
  if (!wanted.length) return report;
  report.looked = wanted.length;
  const requests: AnkiLinkRequest[] = wanted.map((card) => ({
    key: card.id,
    term: card.word.trim(),
    ...(card.reading?.trim() && card.reading.trim() !== card.word.trim() ? { reading: card.reading.trim() } : {}),
  }));
  const state = await readAnkiSyncState();
  let result;
  try {
    result = await find({ requests, ...(state.boundProfile ? { expectedProfile: state.boundProfile } : {}) });
  } catch (error) {
    return { ...report, errorKind: 'api', error: error instanceof Error ? error.message : String(error) };
  }
  if (!result?.ok) {
    return { ...report, errorKind: result?.errorKind ?? 'api', ...(result?.error ? { error: result.error } : {}) };
  }
  const byId = new Map(wanted.map((card) => [card.id, card]));
  for (const match of result.matches) {
    const card = byId.get(match.key);
    if (!card || typeof match.noteId !== 'number' || match.noteId <= 0) continue;
    updateDeckCard(card.id, {
      ankiNoteId: match.noteId,
      ankiExported: true,
      ankiExportedAt: card.ankiExportedAt ?? now,
      ankiPending: undefined,
      ankiDuplicate: undefined,
      ankiQueueGaveUp: undefined,
      ankiExportError: undefined,
    });
    report.linkedIds.push(card.id);
    if (match.ambiguous) report.ambiguous += 1;
  }
  await updateAnkiSyncState((s) => ({ ...s, lastLinkAt: now }));
  return report;
}
