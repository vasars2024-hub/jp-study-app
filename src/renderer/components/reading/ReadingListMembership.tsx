/**
 * §11.1 row 8 — *"the 'on 2 lists' line in the reader → the list detail,
 * scrolled to this entry"*.
 *
 * A READ-ONLY touch-point. §10.2 forbids list logic inside `NovelReader.tsx`
 * (130 KB) and `MangaReader.tsx` (87 KB) — both are hot files that concurrent
 * tracks hold dirty, and a detector or a mutation living in one of them is a
 * merge conflict on every turn plus a second answer to "what is a list". So the
 * readers render this and nothing else; it derives through
 * `readingListsForItem` and navigates through the same `os:open` route
 * §11.2's widgets use. It mutates nothing.
 */

import { useMemo } from 'react';
import { useT } from '../../i18n';
import { useReadingListsDocument } from '../../readingListsDocument';
import { readingListsForItem } from '../../../shared/readingListViews';
import {
  READING_WORKSPACE_SCHEMA_VERSION,
  type ReadingWorkspaceRoute,
} from '../../../shared/readingWorkspace';
import './readingListMembership.css';

export interface ReadingListMembershipProps {
  /** The library item open in the reader. Blank or absent renders nothing. */
  itemId: string | null | undefined;
}

function openListAtEntry(listId: string, entryId: string): void {
  const route: Omit<ReadingWorkspaceRoute, 'version'> = {
    section: 'lists',
    intent: 'browse',
    listId,
    entryId,
  };
  window.dispatchEvent(
    new CustomEvent('os:open', {
      detail: { version: READING_WORKSPACE_SCHEMA_VERSION, ...route },
    }),
  );
}

export default function ReadingListMembership({ itemId }: ReadingListMembershipProps) {
  const { t, lang } = useT();
  const { document } = useReadingListsDocument();

  /**
   * Archived lists are dropped HERE, not in `readingListsForItem`.
   *
   * The derivation cannot know who is asking; this caller can. A book retired
   * to an archive is not somewhere the reader should send anyone, and counting
   * it would make "on 3 lists" true of a place the user cannot act on.
   */
  const rows = useMemo(
    () =>
      document && itemId
        ? readingListsForItem(document, itemId).filter((row) => !row.listArchived)
        : [],
    [document, itemId],
  );

  // No lists is the common case for most books. A strip reading "on 0 lists" is
  // noise in a reading surface, so it renders nothing at all rather than a
  // zero state — this is a cross-reference, not a feature that needs promoting.
  if (rows.length === 0) return null;

  return (
    <div className="rlm">
      {/*
        The count is its own element and not part of each button's label: a
        screen reader hearing "on 2 lists" once and then two list names is the
        shape a sighted user sees, whereas folding it into every button repeats
        it per row.

        `lang` is in the memo dependencies of nothing here on purpose — this
        component re-renders on a language switch because `useT` returns a new
        `lang`, and the strings below are read at render time, not memoized.
      */}
      <span className="rlm__count" data-lang={lang}>
        {t('readingLists.membership.count', { count: rows.length })}
      </span>
      <ul className="rlm__lists">
        {rows.map((row) => (
          <li key={row.listId + '/' + row.entryId}>
            <button
              type="button"
              className="rlm__link"
              /*
                §11.1's "every link lands somewhere real". This carries the
                ENTRY as well as the list, so the detail scrolls to this book
                rather than to the top of a list that may hold two hundred.
              */
              onClick={() => openListAtEntry(row.listId, row.entryId)}
              title={t('readingLists.membership.openHint', { name: row.listName })}
            >
              {row.listName}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
