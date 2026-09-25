/**
 * Carry out an owner route from `shared/filesApp/openPlan.ts` — open the exact
 * record, not the owning app's front page.
 *
 * Each branch reuses the owner's own hand-off rather than inventing one:
 * Library takes a Reading-workspace route (`intent: 'open'`, the same shape
 * the reading-list reminder sends), the Media Center its intent bus, and the
 * three apps that had none get the one-shot intents in `renderer/openIntents`.
 *
 * Returns `'preview'` for a route whose record has no app of its own (a
 * Notebook note with no deep link): the Files app shows it in place instead.
 */
import type { FilesItemOpenRoute } from '../../../shared/filesApp/openPlan';
import { READING_WORKSPACE_SCHEMA_VERSION } from '../../../shared/readingWorkspace';
import { requestMediaCenter } from '../../mediaCenterIntent';
import { loadNotebookTimeline } from '../../notebookTimeline';
import { requestDictionaryQuery, requestFlashcardsFocus, requestVisualNovel } from '../../openIntents';
import { SECTION_OPEN_EVENT, openSectionSurface } from '../../sectionSurface';

export type FilesOpenRouteOutcome = 'opened' | 'preview';

function openLibraryItem(itemId: string): void {
  const claimed = !window.dispatchEvent(
    new CustomEvent(SECTION_OPEN_EVENT, {
      detail: {
        version: READING_WORKSPACE_SCHEMA_VERSION,
        section: 'library',
        intent: 'open',
        itemId,
      },
      cancelable: true,
    }),
  );
  // No desktop shell in this window (a popped-out Files): the Library still
  // opens, one click short of the book, rather than nothing at all.
  if (!claimed) openSectionSurface('library');
}

export function performFilesOpenRoute(route: FilesItemOpenRoute): FilesOpenRouteOutcome {
  switch (route.kind) {
    case 'library':
      openLibraryItem(route.itemId);
      return 'opened';
    case 'media':
      requestMediaCenter({ tab: 'title', mediaId: route.mediaId });
      return 'opened';
    case 'visual-novel':
      requestVisualNovel(route.visualNovelId);
      return 'opened';
    case 'deck':
      requestFlashcardsFocus({ folder: route.folder, cardId: route.cardId });
      return 'opened';
    case 'lookup':
      requestDictionaryQuery(route.query);
      return 'opened';
    case 'note': {
      // A note written about an action carries the place it happened; follow it.
      const entry = safeTimeline().find((candidate) => candidate.id === route.entryId);
      const href = typeof entry?.href === 'string' ? entry.href.trim() : '';
      if (href) {
        openSectionSurface(href);
        return 'opened';
      }
      return 'preview';
    }
  }
}

function safeTimeline() {
  try {
    return loadNotebookTimeline();
  } catch {
    return [];
  }
}
