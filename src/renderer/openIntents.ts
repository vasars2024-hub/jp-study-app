/**
 * "Open this exact record" hand-offs into apps that had none.
 *
 * The Files app's Open used to bring the owning app forward at its front page
 * (audit r2: `FilesApp.tsx` passed only the section to `openSectionSurface`).
 * Library and the Media Center already take a record through their own routes
 * (`readingWorkspaceNavigation`, `mediaCenterIntent`); the Visual Novels app,
 * the Flashcards deck and the Dictionary did not, so each gets the smallest
 * possible intent here: park the target in a one-shot handoff (the owner may
 * not be mounted yet), announce it for an owner that already is, and open the
 * section.
 */
import { setHandoff, setHandoffJson, takeHandoff, takeHandoffJson } from './pendingHandoff';
import { openSectionSurface } from './sectionSurface';

export const VISUAL_NOVEL_FOCUS_EVENT = 'visual-novel:focus';
export const FLASHCARDS_FOCUS_EVENT = 'flashcards:focus';
export const DICTIONARY_QUERY_EVENT = 'dictionary:query';

export interface FlashcardsFocus {
  /** Deck folder to filter to. `null` keeps the deck's current folder filter. */
  folder: string | null;
  /** One card to find inside the deck. */
  cardId: string | null;
  /**
   * Start a sitting straight away: `listening` is the audio-first review of
   * the folder (a sentence deck just made from a video). `ahead` reviews the
   * scheduled cards due by the end of `aheadUntil` now (the Calendar's "Study
   * ahead" on a coming day). Absent opens the deck.
   */
  review?: 'listening' | 'ahead';
  /** Local `YYYY-MM-DD`, with `review: 'ahead'`. */
  aheadUntil?: string;
  /** Text for the deck's find box, e.g. `added:2026-10-07` from the Calendar's day view. */
  search?: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function announce(eventName: string): void {
  try {
    window.dispatchEvent(new CustomEvent(eventName));
  } catch {
    /* no window: nothing mounted to tell */
  }
}

export function requestVisualNovel(visualNovelId: string): void {
  setHandoff('visualNovelFocus', visualNovelId);
  announce(VISUAL_NOVEL_FOCUS_EVENT);
  openSectionSurface('visualnovels');
}

export function takeVisualNovelFocus(): string | null {
  const id = takeHandoff('visualNovelFocus');
  return id && id.trim() ? id : null;
}

export function requestFlashcardsFocus(focus: FlashcardsFocus): void {
  setHandoffJson('flashcardsFocus', focus);
  announce(FLASHCARDS_FOCUS_EVENT);
  openSectionSurface('flashcards');
}

export function takeFlashcardsFocus(): FlashcardsFocus | null {
  const raw = takeHandoffJson<Partial<FlashcardsFocus>>('flashcardsFocus');
  if (!raw || typeof raw !== 'object') return null;
  const folder = typeof raw.folder === 'string' && raw.folder ? raw.folder : null;
  const cardId = typeof raw.cardId === 'string' && raw.cardId ? raw.cardId : null;
  const search = typeof raw.search === 'string' && raw.search.trim() ? raw.search.trim().slice(0, 200) : undefined;
  const aheadUntil = raw.review === 'ahead' && typeof raw.aheadUntil === 'string' && DATE_KEY.test(raw.aheadUntil)
    ? raw.aheadUntil
    : undefined;
  if (!folder && !cardId && !search && !aheadUntil) return null;
  const extra = { ...(search ? { search } : {}) };
  if (aheadUntil) return { folder, cardId, ...extra, review: 'ahead', aheadUntil };
  return raw.review === 'listening' ? { folder, cardId, ...extra, review: 'listening' } : { folder, cardId, ...extra };
}

export function requestDictionaryQuery(query: string): void {
  const q = query.trim();
  if (!q) return;
  setHandoff('dictionaryQuery', q);
  announce(DICTIONARY_QUERY_EVENT);
  openSectionSurface('dictionary');
}

export function takeDictionaryQuery(): string | null {
  const q = takeHandoff('dictionaryQuery');
  return q && q.trim() ? q.trim() : null;
}

/** Subscribe to one of the events above. Returns the unsubscribe. */
export function onOpenIntent(eventName: string, listener: () => void): () => void {
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
