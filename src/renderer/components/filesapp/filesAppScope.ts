/**
 * Context entry into the Files app — gate 5.
 *
 * "Opening from a page passes a *scope* — a category and optionally a focused
 * item — which pre-filters and highlights it. Scope is a filter, not a mode:
 * clearing it reveals everything, and the same window is used either way."
 *
 * **Why a handoff module rather than a wider `openSectionSurface` signature.**
 * `os:open`'s `detail` is a bare section string and at least four hosts listen
 * for it — `DesktopShell`, `MiniShell`, the `?popout=…` window and Blanc. A
 * richer detail would either need every one of them updated in lockstep or
 * would be silently dropped by the ones that were not, which is the failure
 * mode that looks like "the button does nothing on Blanc". So the scope travels
 * beside the event, exactly as `agentContextHandoff.ts` lands its context
 * before calling `openAgentSurface`.
 *
 * **Why the scope is CONSUMED on read.** It describes one gesture. Left in
 * place, the next plain open of the Files app would silently inherit the last
 * caller's filter and look like a tree that lost its other categories. Reading
 * it is therefore taking it.
 */
import {
  isFilesCategoryId,
  type FilesCategoryId,
} from '../../../shared/filesApp/catalog';
import { openSectionSurface } from '../../sectionSurface';

export interface FilesScopeRequest {
  /** The category to pre-filter to. A filter the root node clears, never a mode. */
  categoryId: FilesCategoryId;
  /**
   * The row to highlight on open, when the caller knows which one it means.
   * Must be a real index id (`<enumerator>:<local id>`); an id nothing matches
   * simply highlights nothing, which is why it is optional rather than guessed.
   */
  focusItemId?: string | null;
}

/**
 * Fired after the scope is parked, for a Files app that is ALREADY mounted.
 *
 * Two delivery routes are needed because there are two states and only one of
 * them involves a mount: opening the section from elsewhere mounts the
 * component, which reads `pending`; but asking for a scope while the window is
 * already open re-renders nothing at all, and without this the gesture would
 * appear to do nothing on the second click.
 */
export const FILES_SCOPE_EVENT = 'filesapp:scope';

let pending: FilesScopeRequest | null = null;

/**
 * Look without consuming. For tests and for a host that wants to know whether a
 * scope is waiting; the app itself uses `takePendingFilesScope`.
 */
export function peekPendingFilesScope(): FilesScopeRequest | null {
  return pending;
}

/** Read the pending scope and clear it. See the module note on why. */
export function takePendingFilesScope(): FilesScopeRequest | null {
  const scope = pending;
  pending = null;
  return scope;
}

/** Drop any pending scope without opening anything. */
export function clearPendingFilesScope(): void {
  pending = null;
}

/**
 * The whole gesture: park the scope, then open the section.
 *
 * Returns whether an in-window shell claimed the open — both routes are real
 * and neither is a failure, so a caller that does not care can ignore it. An
 * unrecognised category is REFUSED rather than opened unscoped: opening the
 * whole tree when the caller asked for one folder is a wrong answer wearing a
 * success's clothes.
 */
export function openFilesAppScoped(request: FilesScopeRequest): boolean {
  if (!isFilesCategoryId(request.categoryId)) return false;
  pending = {
    categoryId: request.categoryId,
    ...(request.focusItemId ? { focusItemId: request.focusItemId } : {}),
  };
  const claimed = openSectionSurface('files');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FILES_SCOPE_EVENT, { detail: pending }));
  }
  // A pop-out mounts its own renderer, where this module is a fresh instance
  // and `pending` is null. The scope is kept rather than dropped so the desktop
  // shell — which shares this instance — still honours it; a pop-out simply
  // opens unscoped, which is the honest degradation and not a broken filter.
  return claimed;
}

/* ------------------------------------------------------------------ *
 * The callers' vocabulary. Each names the scope for one surface, so a
 * page never has to know the tree's leaf ids.
 * ------------------------------------------------------------------ */

/** From a book/epub page. `bookId` is `library.json`'s row id. */
export function openFilesAppForBook(bookId?: string | null): boolean {
  return openFilesAppScoped({
    categoryId: 'sources/books',
    focusItemId: bookId ? `library:${bookId}` : null,
  });
}

/** From a manga volume. Manga is its own leaf; a book scope would hide it. */
export function openFilesAppForManga(bookId?: string | null): boolean {
  return openFilesAppScoped({
    categoryId: 'sources/manga',
    focusItemId: bookId ? `library:${bookId}` : null,
  });
}

/** From the media library or the player. `mediaId` is `media.json`'s row id. */
export function openFilesAppForMedia(mediaId?: string | null): boolean {
  return openFilesAppScoped({
    categoryId: 'sources/video',
    focusItemId: mediaId ? `media:${mediaId}` : null,
  });
}

/** From a video's transcript, which lives under text rather than under video. */
export function openFilesAppForTranscript(youtubeId?: string | null): boolean {
  return openFilesAppScoped({
    categoryId: 'sources/text',
    focusItemId: youtubeId ? `transcript:${youtubeId}` : null,
  });
}

/** From the dictionary manager. */
export function openFilesAppForDictionaries(): boolean {
  return openFilesAppScoped({ categoryId: 'reference/dictionaries' });
}

/** From the deck or flashcards surface. */
export function openFilesAppForDecks(): boolean {
  return openFilesAppScoped({ categoryId: 'outputs/decks' });
}
