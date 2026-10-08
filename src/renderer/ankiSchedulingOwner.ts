/**
 * "Anki owns scheduling".
 *
 * A mined card goes to the built-in deck AND (when Anki is set up) to Anki, and
 * both then scheduled it: the learner reviewed the same word twice, on two
 * different timetables. With this on, a card that reached Anki (or is queued for
 * it) is kept in the deck as reference — searchable, editable, minable from — but
 * the built-in review queue skips it and Anki is the one place it is reviewed.
 * Off by default, so nobody's existing review queue changes underneath them.
 */
import { writeLocalStorage } from './localStorageWrite';

export const ANKI_OWNS_SCHEDULING_KEY = 'jp-anki-owns-scheduling';
export const ANKI_OWNS_SCHEDULING_EVENT = 'jp-anki-owns-scheduling-changed';

export function ankiOwnsScheduling(): boolean {
  try {
    return localStorage.getItem(ANKI_OWNS_SCHEDULING_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAnkiOwnsScheduling(on: boolean): void {
  writeLocalStorage(ANKI_OWNS_SCHEDULING_KEY, on ? '1' : '0');
  try {
    window.dispatchEvent(new CustomEvent(ANKI_OWNS_SCHEDULING_EVENT, { detail: on }));
  } catch {
    /* no window (tests) */
  }
}

/** The card has an Anki twin (created, a duplicate there, or waiting in the mining queue). */
export function hasAnkiTwin(card: { ankiNoteId?: number; ankiExported?: boolean; ankiPending?: boolean; ankiDuplicate?: boolean }): boolean {
  return Boolean(card.ankiNoteId || card.ankiExported || card.ankiPending || card.ankiDuplicate);
}

/** Drop Anki-owned cards from a review queue when the setting is on. */
export function withoutAnkiOwned<T extends { ankiNoteId?: number; ankiExported?: boolean; ankiPending?: boolean; ankiDuplicate?: boolean }>(
  cards: readonly T[],
): readonly T[] {
  return ankiOwnsScheduling() ? cards.filter((card) => !hasAnkiTwin(card)) : cards;
}
