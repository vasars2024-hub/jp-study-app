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
}

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
  return folder || cardId ? { folder, cardId } : null;
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
