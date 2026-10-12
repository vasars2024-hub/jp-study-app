/**
 * Link Gum cards to Anki notes that already exist, instead of creating them again.
 *
 * Mine on the laptop, sync Anki through AnkiWeb, open Gum on the desktop: the
 * desktop's copy of the card (queued while its Anki was closed, or refused as a
 * duplicate) has no note id, and the queue would add the note a second time —
 * into another deck when the profiles differ, where Anki's duplicate check does
 * not look. A link pass asks main which existing notes these cards are (in a
 * profile's deck, of its note type, term field equal to the word; read-only)
 * and records the note id on the card, which takes it out of the queue for good.
 *
 * Linking writes Anki note ids onto Gum cards, which is part of syncing with
 * Anki: it runs only while sync is on (Gum answers are sent to Anki, or Anki
 * owns scheduling), or when the user presses "Link existing notes" (`explicit`).
 * A pass pages through EVERY card that needs a link, one batch per request with
 * a pause between requests, so a large deck is covered without flooding
 * AnkiConnect's single worker.
 */

import { loadDeck, updateDeckCard, type DeckFlashcard } from './flashcardDeck';
import { ankiOwnsScheduling } from './ankiSchedulingOwner';
import { ankiPushReviewsEnabled, readAnkiSyncState, updateAnkiSyncState } from './ankiSyncState';
import {
  ANKI_SYNC_LINK_BATCH,
  ANKI_SYNC_LINK_PAUSE_MS,
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
  /** Requests sent (one per batch). */
  batches: number;
  /** Nothing was looked up because sync is off and the user did not ask. */
  disabled?: boolean;
  errorKind?: AnkiSyncErrorKind;
  error?: string;
}

export interface AnkiLinkPassOptions {
  /** The user asked for this pass ("Link existing notes"): runs with sync off too. */
  explicit?: boolean;
  /** Cards per request (tests); capped at `ANKI_SYNC_LINK_BATCH`. */
  batch?: number;
  /** Pause between two requests, ms (tests pass 0). */
  pauseMs?: number;
}

/** Whether background linking may run: sync is on in one of its two directions. */
export function ankiLinkingEnabled(): boolean {
  return ankiPushReviewsEnabled() || ankiOwnsScheduling();
}

function pause(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function linkRequest(card: DeckFlashcard): AnkiLinkRequest {
  const word = card.word.trim();
  const reading = card.reading?.trim();
  const deck = card.ankiDeck?.trim();
  return {
    key: card.id,
    term: word,
    ...(reading && reading !== word ? { reading } : {}),
    ...(deck ? { deck } : {}),
  };
}

/**
 * One pass over `cards` (default: the whole deck) that need a link, every one
 * of them, a batch at a time. Never throws; a main without the channel, sync
 * off without `explicit`, or nothing to look up is a no-op. Stops at the first
 * failed request and reports it; cards linked before that keep their links.
 */
export async function linkCardsToExistingAnkiNotes(
  cards: readonly DeckFlashcard[] = loadDeck(),
  now = Date.now(),
  options: AnkiLinkPassOptions = {},
): Promise<AnkiLinkPassReport> {
  const report: AnkiLinkPassReport = { looked: 0, linkedIds: [], ambiguous: 0, batches: 0 };
  if (!options.explicit && !ankiLinkingEnabled()) return { ...report, disabled: true };
  const find = typeof window !== 'undefined' ? window.api?.ankiFindNoteLinks : undefined;
  if (typeof find !== 'function') return report;
  const wanted = cards.filter(needsAnkiLink);
  if (!wanted.length) return report;
  const size = Math.max(1, Math.min(ANKI_SYNC_LINK_BATCH, options.batch ?? ANKI_SYNC_LINK_BATCH));
  const gap = Math.max(0, options.pauseMs ?? ANKI_SYNC_LINK_PAUSE_MS);
  const state = await readAnkiSyncState();
  for (let start = 0; start < wanted.length; start += size) {
    if (start > 0) await pause(gap);
    const page = wanted.slice(start, start + size);
    report.looked += page.length;
    report.batches += 1;
    let result;
    try {
      result = await find({
        requests: page.map(linkRequest),
        ...(state.boundProfile ? { expectedProfile: state.boundProfile } : {}),
      });
    } catch (error) {
      return { ...report, errorKind: 'api', error: error instanceof Error ? error.message : String(error) };
    }
    if (!result?.ok) {
      return { ...report, errorKind: result?.errorKind ?? 'api', ...(result?.error ? { error: result.error } : {}) };
    }
    const byId = new Map(page.map((card) => [card.id, card]));
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
  }
  await updateAnkiSyncState((s) => ({ ...s, lastLinkAt: now }));
  return report;
}
