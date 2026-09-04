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
import type { ReadingListsFailureCode } from '../shared/readingListsBridge';

export interface ReadingListsDocumentState {
  /** `null` while loading and after a failed read — `failure` tells them apart. */
  document: ReadingListsDocument | null;
  failure: ReadingListsFailureCode | null;
  /** Adopt a document this surface's own write just produced. */
  adopt: (document: ReadingListsDocument) => void;
  /** Re-read from main. Clears the failure first, so the state is honest again. */
  reload: () => void;
}

export function useReadingListsDocument(): ReadingListsDocumentState {
  const [document, setDocument] = useState<ReadingListsDocument | null>(null);
  const [failure, setFailure] = useState<ReadingListsFailureCode | null>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    let live = true;
    setFailure(null);
    void loadReadingLists().then((result) => {
      if (!live) return;
      if (result.ok) setDocument(result.snapshot.document);
      else setFailure(result.code);
    });
    const stop = onReadingListsChanged((snapshot) => {
      if (live) setDocument(snapshot.document);
    });
    return () => {
      live = false;
      stop();
    };
  }, [token]);

  const reload = useCallback(() => {
    setDocument(null);
    setToken((value) => value + 1);
  }, []);

  const adopt = useCallback((next: ReadingListsDocument) => {
    setDocument(next);
    setFailure(null);
  }, []);

  return { document, failure, adopt, reload };
}
