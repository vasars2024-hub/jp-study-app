/**
 * One subscription to the main-owned Reading Lists store, shared by every
 * surface that draws it.
 *
 * §11.2's four widgets and §6's view all need the same three things — the
 * current document, a way to say the read failed, and a re-render when another
 * window (or the completion detector, with no renderer involved at all) changes
 * it. Written once here rather than four times, because four copies of a load
 * effect is four chances to disagree about what "not loaded yet" looks like.
 *
 * The one subtlety worth stating: main deliberately does NOT broadcast back to
 * the window that wrote (`main/readingListsIpc.ts` skips the origin, correctly —
 * that window already has the answer). So a caller that writes must hand the
 * result back through `adopt`; a caller that only reads never has to.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  loadReadingLists,
  onReadingListsChanged,
} from './readingListsClient';
import type { ReadingListsDocument } from '../shared/readingLists';
import type { ReadingListsFailureCode, ReadingListsHealth } from '../shared/readingListsBridge';

export interface ReadingListsDocumentState {
  /** `null` while loading and after a failed read — `failure` tells them apart. */
  document: ReadingListsDocument | null;
  failure: ReadingListsFailureCode | null;
  /**
   * How the document main handed back came to be. `null` until the first
   * snapshot arrives.
   *
   * This is carried rather than discarded because `reset` — the file did not
   * parse and there was no restore point — produces a document that is
   * byte-identical to a first run's. Without the health record a surface cannot
   * tell "you have no lists yet" from "your lists are gone", and §11.4 forbids
   * exactly that: *a corrupt store shows what happened, it does not silently
   * show zero lists*.
   */
  health: ReadingListsHealth | null;
  /** Adopt a document this surface's own write just produced. */
  adopt: (document: ReadingListsDocument) => void;
  /** Re-read from main. Clears the failure first, so the state is honest again. */
  reload: () => void;
}

/**
 * A write always answers `ok` (`main/readingListsStore.ts` re-serves the file it
 * just wrote), so adopting one legitimately ends the recovery report — the user
 * has written over the recovered document and it is now the real one.
 */
const HEALTH_AFTER_WRITE: ReadingListsHealth = { state: 'ok', lostRevisions: 0 };

export function useReadingListsDocument(): ReadingListsDocumentState {
  const [document, setDocument] = useState<ReadingListsDocument | null>(null);
  const [failure, setFailure] = useState<ReadingListsFailureCode | null>(null);
  const [health, setHealth] = useState<ReadingListsHealth | null>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    let live = true;
    setFailure(null);
    void loadReadingLists().then((result) => {
      if (!live) return;
      if (result.ok) {
        setDocument(result.snapshot.document);
        setHealth(result.snapshot.health);
      } else setFailure(result.code);
    });
    const stop = onReadingListsChanged((snapshot) => {
      if (!live) return;
      setDocument(snapshot.document);
      setHealth(snapshot.health);
    });
    return () => {
      live = false;
      stop();
    };
  }, [token]);

  const reload = useCallback(() => {
    setDocument(null);
    setHealth(null);
    setToken((value) => value + 1);
  }, []);

  const adopt = useCallback((next: ReadingListsDocument) => {
    setDocument(next);
    setHealth(HEALTH_AFTER_WRITE);
    setFailure(null);
  }, []);

  return { document, failure, health, adopt, reload };
}
