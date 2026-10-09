/**
 * Book round-trip: a card mined in the novel reader opens the book again at the
 * place it was mined — the reading counterpart of `sceneRoundTrip.ts`, which
 * does the same for a video line.
 *
 *   - **Where** a card points: `cardBookPosition` (shared/bookLocation). The
 *     reader writes the book id and its locator on the card's `sourceRef` when
 *     it mines; the card's dedupe key is untouched, so a word mined on two pages
 *     is still one card.
 *   - **How to get there** (`openBookAt`): a reader already showing that book
 *     jumps in place; otherwise the position is parked as a one-shot handoff
 *     and the Library is asked to open the book, which takes it on load.
 */
import { isBookLocation, type BookPosition } from '../shared/bookLocation';
import { READING_WORKSPACE_SCHEMA_VERSION } from '../shared/readingWorkspace';
import { setHandoffJson, takeHandoffJson } from './pendingHandoff';
import { SECTION_OPEN_EVENT, openSectionSurface } from './sectionSurface';

export { bookLocation, bookLocationRef, cardBookPosition, isBookLocation } from '../shared/bookLocation';
export type { BookPosition } from '../shared/bookLocation';

/** Dispatched (cancelable) first: a reader showing the book claims it with `preventDefault`. */
export const BOOK_OPEN_AT_EVENT = 'novel:openAt';

/**
 * Open the book at `position`. A reader already showing it jumps in place;
 * otherwise the position waits as a handoff for the reader that opens next.
 */
export function openBookAt(position: BookPosition): void {
  if (!position.bookId || !isBookLocation(position.loc)) return;
  const claimedByReader = !window.dispatchEvent(
    new CustomEvent<BookPosition>(BOOK_OPEN_AT_EVENT, { detail: position, cancelable: true }),
  );
  if (claimedByReader) return;
  setHandoffJson('novelOpenAt', position);
  const claimed = !window.dispatchEvent(
    new CustomEvent(SECTION_OPEN_EVENT, {
      detail: {
        version: READING_WORKSPACE_SCHEMA_VERSION,
        section: 'library',
        intent: 'open',
        itemId: position.bookId,
      },
      cancelable: true,
    }),
  );
  if (!claimed) openSectionSurface('library');
}

/**
 * The parked position for `bookId`, consumed. A handoff for a different book is
 * dropped too: the open it was written for went somewhere else.
 */
export function takeBookOpenAt(bookId: string): string | null {
  const parked = takeHandoffJson<Partial<BookPosition>>('novelOpenAt');
  if (!parked || parked.bookId !== bookId || !isBookLocation(parked.loc)) return null;
  return parked.loc;
}
