/**
 * The real deletes behind the Files app's Delete, one per owning store.
 *
 * Each branch calls the owner's own API — the same call its own app makes —
 * so a delete from Files is the delete that app would have done, not a second
 * writer with its own idea of the store's shape. Run by the deletion session
 * once a delete's undo window has passed (`FilesDeletionSession.commitDue`).
 *
 * An owner that says the record is already gone counts as success: two Files
 * windows may both reach the same due delete, and the second must not turn the
 * first one's success into a "could not delete" entry under Hidden items.
 */
import type { FilesSoftDeleteCommit } from '../../../shared/filesApp/softDelete';
import { removeDeckCards } from '../../flashcardDeck';
import { removeNotebookEntry } from '../../notebookTimeline';
import { removeSaved } from '../../savedWords';
import { removeTranslationHistory } from '../../translationHistory';
import { deleteEntry as deleteClipboardEntry } from '../../clipboardHistory';
import { removeAnnotation } from '../../annotations';

export type FilesOwnerDeleteOutcome = { ok: true } | { ok: false; reason: string };

/** The preload slice this needs, so a test can hand in exactly these. */
export interface FilesOwnerDeleteApi {
  removeItem?: (id: string) => Promise<unknown>;
  removeMedia?: (id: string) => Promise<unknown>;
  dictRemoveYomitan?: (id: string) => Promise<{ ok: boolean; error?: string }>;
  dictRemoveSource?: (id: string) => Promise<{ ok: boolean; error?: string }>;
  visualNovelRemove?: (id: string) => Promise<unknown>;
  filesTrashOwnedFile?: (itemId: string) => Promise<{ ok: boolean; reasonKey?: string }>;
}

function missing(): FilesOwnerDeleteOutcome {
  return { ok: false, reason: 'unavailable' };
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runOwnerDelete(
  itemId: string,
  commit: FilesSoftDeleteCommit,
  api: FilesOwnerDeleteApi | undefined = (typeof window !== 'undefined'
    ? (window.api as unknown as FilesOwnerDeleteApi | undefined)
    : undefined),
): Promise<FilesOwnerDeleteOutcome> {
  const id = commit.localId;
  try {
    switch (commit.owner) {
      case 'library':
        if (typeof api?.removeItem !== 'function') return missing();
        await api.removeItem(id);
        return { ok: true };
      case 'media': {
        if (typeof api?.removeMedia !== 'function') return missing();
        if (commit.trashFile) {
          // The file first, while the index can still resolve its path from
          // the row: main never takes a path from the renderer.
          if (typeof api.filesTrashOwnedFile !== 'function') return missing();
          const trashed = await api.filesTrashOwnedFile(itemId);
          if (!trashed?.ok) return { ok: false, reason: trashed?.reasonKey ?? 'trash-failed' };
        }
        await api.removeMedia(id);
        return { ok: true };
      }
      case 'dictionary': {
        if (typeof api?.dictRemoveYomitan !== 'function') return missing();
        // An imported Yomitan dictionary is removed through its registry, which
        // also drops its files and search index; a source the registry does not
        // know (a built-in one) is removed from the database alone.
        const yomitan = await api.dictRemoveYomitan(id);
        if (yomitan?.ok) return { ok: true };
        if (yomitan?.error && yomitan.error !== 'Dictionary not found.') {
          return { ok: false, reason: yomitan.error };
        }
        if (typeof api.dictRemoveSource !== 'function') return missing();
        const source = await api.dictRemoveSource(id);
        if (source?.ok || source?.error === 'not-found') return { ok: true };
        return { ok: false, reason: source?.error ?? 'failed' };
      }
      case 'visual-novel':
        if (typeof api?.visualNovelRemove !== 'function') return missing();
        await api.visualNovelRemove(id);
        return { ok: true };
      case 'deck-card':
        removeDeckCards([id]);
        return { ok: true };
      case 'notebook':
        removeNotebookEntry(id);
        return { ok: true };
      case 'saved-word':
        removeSaved(id);
        return { ok: true };
      case 'translation':
        removeTranslationHistory(id);
        return { ok: true };
      case 'clipboard':
        deleteClipboardEntry(id);
        return { ok: true };
      case 'annotation': {
        // `annotation:<bookId>:<markId>` — a book id may itself hold a colon,
        // a mark id never does, so the LAST colon splits them.
        const at = id.lastIndexOf(':');
        if (at <= 0) return { ok: false, reason: 'bad-id' };
        removeAnnotation(id.slice(0, at), id.slice(at + 1));
        return { ok: true };
      }
    }
  } catch (err) {
    return { ok: false, reason: reasonOf(err) };
  }
  return { ok: false, reason: 'unknown-owner' };
}
