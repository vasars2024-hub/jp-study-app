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
import { filesPanelForCard } from '../../../shared/filesApp/systemPanels';
import { openSectionSurface } from '../../sectionSurface';
import { writeLocalStorageJson } from '../../localStorageWrite';

export interface FilesScopeRequest {
  /** The category to pre-filter to. A filter the root node clears, never a mode. */
  categoryId: FilesCategoryId;
  /**
   * The row to highlight on open, when the caller knows which one it means.
   * Must be a real index id (`<enumerator>:<local id>`); an id nothing matches
   * simply highlights nothing, which is why it is optional rather than guessed.
   */
  focusItemId?: string | null;
  /**
   * The panel CARD to scroll to and highlight, for the two panel-backed leaves
   * (`system/memory`, `system/statistics`). Gate 8's search half needs this:
   * a hit that used to land on `data-setting-id="factory-reset"` inside
   * Settings must still land on that card here, and "opened the Files app" is
   * not the same answer as "showed the row you searched for".
   *
   * The strings are deliberately the OLD settings registry ids, so no
   * translation table sits between the two worlds.
   */
  focusCardId?: string | null;
  /** Set by main's Agent delivery: a mounted Files app calls it to say it took the scope. */
  handled?: () => void;
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
/**
 * The same request, parked where ANOTHER window can read it: a Files pop-out
 * mounts its own renderer, where `pending` below is a fresh `null` — so a
 * scoped open used to reach a pop-out unscoped. Main writes this key too, when
 * the Agent opens Files on a category (audit r2 #7).
 */
export const FILES_SCOPE_STORAGE_KEY = 'jp-files-pending-scope';
/** A parked scope older than this is somebody else's, not this open's. */
const STORED_SCOPE_TTL_MS = 60_000;

let pending: FilesScopeRequest | null = null;

function readStoredScope(): FilesScopeRequest | null {
  try {
    const raw = localStorage.getItem(FILES_SCOPE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { categoryId?: unknown; focusItemId?: unknown; at?: unknown };
    if (!isFilesCategoryId(parsed.categoryId)) return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > STORED_SCOPE_TTL_MS) return null;
    return {
      categoryId: parsed.categoryId,
      ...(typeof parsed.focusItemId === 'string' ? { focusItemId: parsed.focusItemId } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Look without consuming. For tests and for a host that wants to know whether a
 * scope is waiting; the app itself uses `takePendingFilesScope`.
 */
export function peekPendingFilesScope(): FilesScopeRequest | null {
  // Pure: reads, never clears (see `FilesApp`'s lazy initialiser).
  return pending ?? readStoredScope();
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
  try {
    localStorage.removeItem(FILES_SCOPE_STORAGE_KEY);
  } catch {
    /* storage unavailable: nothing was parked there either */
  }
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
    ...(request.focusCardId ? { focusCardId: request.focusCardId } : {}),
  };
  writeLocalStorageJson(FILES_SCOPE_STORAGE_KEY, {
    categoryId: pending.categoryId,
    ...(pending.focusItemId ? { focusItemId: pending.focusItemId } : {}),
    at: Date.now(),
  });
  const claimed = openSectionSurface('files');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FILES_SCOPE_EVENT, { detail: pending }));
  }
  // A pop-out mounts its own renderer, where this module is a fresh instance
  // and `pending` is null; it reads the copy parked in localStorage above
  // instead, so it opens scoped too.
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

/**
 * Gate 8's redirect: a settings-search hit for a card that MOVED here.
 *
 * Returns false for a card the Files app does not own, and opens nothing —
 * rerouting an unrelated settings entry into this app would be the same
 * misroute the gate forbids, only pointing the other way.
 */
export function openFilesAppForSystemCard(cardId: string): boolean {
  const categoryId = filesPanelForCard(cardId);
  if (!categoryId) return false;
  return openFilesAppScoped({ categoryId, focusCardId: cardId });
}

/** From anywhere that used to link at the Settings "Memory" page. */
export function openFilesAppForMemory(): boolean {
  return openFilesAppScoped({ categoryId: 'system/memory' });
}
