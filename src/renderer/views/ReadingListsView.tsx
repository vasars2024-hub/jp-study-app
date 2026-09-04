/**
 * Reading Lists P4b — §6's two surfaces, in one view.
 *
 * `docs/ACTIVE/READING_LISTS_PLAN.md` §6 asks for a grid of list cards and a
 * detail view of rows. They are one component because they are one navigation:
 * the grid IS the detail's back destination, and splitting them would put the
 * store subscription, the undo slot and the library index in two places that
 * then have to agree.
 *
 * Everything drawn here comes from `shared/readingListViews.ts` — the pure model
 * P4a landed one slice ahead of this file, precisely so a count is never
 * computed inside a component. Nothing in this file recounts anything.
 *
 * Three rules the plan makes load-bearing, and where each one lives:
 *
 *   · **Every row goes somewhere real** (§11.1). A bound row opens the library
 *     item through `onOpenBook`, the same callback `App.tsx` already threads to
 *     every reading surface. An UNBOUND row is not dead and is not a card that
 *     swallows the click — it routes to acquisition through `onFindWork`, with
 *     the title carried, because "find me this book" without the title is a
 *     search box the user has to retype into.
 *   · **Undo on every destructive action** (§11.4). Deleting a list, removing an
 *     entry and dismissing a suggestion each hand back the exact inverse
 *     mutation, which the mutation layer already provides (`restoreReadingList`,
 *     `restoreReadingListEntry`, `restoreReadingWorkSuggestion`). The undo slot
 *     holds one action: a second destructive act replaces it rather than
 *     stacking, because an undo stack no surface renders is a promise nobody
 *     can keep.
 *   · **Honest states.** Loading, read failure, write failure and empty are four
 *     different things and say so. A write that main refuses leaves the document
 *     exactly as it was and reports it; it never optimistically redraws.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryItem } from '../../shared/types';
import Icon from '../components/Icons';
import { ReadingListPasteFlow } from '../components/reading/ReadingListPasteFlow';
import { Button, Select } from '../components/ui';
import { useT } from '../i18n';
import { applyReadingListsMutation, latestReadingListsSnapshot } from '../readingListsClient';
import { useReadingListsDocument } from '../readingListsDocument';
import { useLibraryItems } from '../widgets/hooks';
import { coverFallbackImage, coverUrlFor } from '../utils/coverArt';
import type { ReadingEntryState } from '../../shared/readingLists';
import {
  createReadingList,
  createReadingListsMutationContext,
  deleteReadingList,
  dismissReadingWorkSuggestion,
  removeReadingListEntry,
  restoreReadingList,
  restoreReadingListEntry,
  restoreReadingWorkSuggestion,
  setReadingEntryState,
  type RemovedReadingEntry,
  type RemovedReadingList,
} from '../../shared/readingListMutations';
import {
  READING_ENTRY_STATES,
  readingListRows,
  sortReadingListSummaries,
  summarizeReadingLists,
  type ReadingListRow,
  type ReadingListSort,
  type ReadingListSummary,
} from '../../shared/readingListViews';
import './readingLists.css';

const STATE_KEYS: Record<ReadingEntryState, string> = {
  wanted: 'readingLists.entryState.wanted',
  owned: 'readingLists.entryState.owned',
  reading: 'readingLists.entryState.reading',
  finished: 'readingLists.entryState.finished',
  abandoned: 'readingLists.entryState.abandoned',
  skipped: 'readingLists.entryState.skipped',
};

const SORTS: ReadingListSort[] = ['recent', 'name', 'progress'];
const SORT_KEYS: Record<ReadingListSort, string> = {
  recent: 'readingLists.view.sort.recent',
  name: 'readingLists.view.sort.name',
  progress: 'readingLists.view.sort.progress',
};

/** The one undo the surface offers, and the label that explains what it undoes. */
interface UndoSlot {
  message: string;
  run: () => void;
}

export interface ReadingListsViewProps {
  /** §11.1's click-through. The same callback every other reading surface takes. */
  onOpenBook: (item: LibraryItem) => void;
  /**
   * The acquisition path for a row with no file behind it, with the title.
   *
   * Required rather than optional: an optional handler produces a button that
   * is present and does nothing on some hosts, which is the dead control §11.1
   * exists to forbid.
   */
  onFindWork: (title: string) => void;
  /** Deep link. When the list is gone the view falls back to the grid. */
  initialListId?: string | null;
}

export default function ReadingListsView({
  onOpenBook,
  onFindWork,
  initialListId = null,
}: ReadingListsViewProps) {
  const { t } = useT();
  // One subscription, shared with §11.2's widgets: four copies of a load effect
  // is four chances to disagree about what "not loaded yet" looks like.
  const { document, failure: loadFailure, adopt, reload } = useReadingListsDocument();
  const [writeFailure, setWriteFailure] = useState<string | null>(null);
  const items = useLibraryItems();
  const [listId, setListId] = useState<string | null>(initialListId);
  const [sort, setSort] = useState<ReadingListSort>('recent');
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoSlot | null>(null);
  const [filter, setFilter] = useState('');
  const nameFieldRef = useRef<HTMLInputElement | null>(null);
  const filterFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (naming) nameFieldRef.current?.focus();
  }, [naming]);

  // A filter that survives navigation would hide rows in a list the user has not
  // typed anything about yet, which reads as "this list is empty".
  useEffect(() => setFilter(''), [listId]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const summaries = useMemo(
    () => (document ? sortReadingListSummaries(summarizeReadingLists(document), sort) : []),
    [document, sort],
  );

  const list = useMemo(
    () => document?.lists.find((candidate) => candidate.id === listId) ?? null,
    [document, listId],
  );

  const rows = useMemo(
    () => (list && document ? readingListRows(list, document.works) : []),
    [list, document],
  );

  /**
   * §11.4's filter. Matching is on the row TITLE only — the state select and the
   * suggestion line are chrome, and folding them in makes "reading" match every
   * row that merely offers `reading` as an option.
   */
  const query = filter.trim().toLowerCase();
  const visibleRows = useMemo(
    () => (query ? rows.filter((row) => row.title.toLowerCase().includes(query)) : rows),
    [query, rows],
  );

  /**
   * Every write goes through here, so there is exactly one place that answers a
   * refusal and exactly one place that reports a failure.
   *
   * `capture` runs inside the mutator and may run more than once — a compare-and
   * -swap retry re-applies the intent against the winning document — so it
   * records the LAST attempt, which is what actually landed.
   */
  const write = useCallback(
    async (mutate: Parameters<typeof applyReadingListsMutation>[1], undoSlot?: () => UndoSlot | null) => {
      if (!document) return;
      setWriteFailure(null);
      const result = await applyReadingListsMutation(document, mutate);
      if (!result.ok) {
        setWriteFailure(result.code);
        return;
      }
      adopt(result.snapshot.document);
      if (result.changed) setUndo(undoSlot?.() ?? null);
    },
    [adopt, document],
  );

  const openRow = useCallback(
    (row: ReadingListRow) => {
      const item = row.itemId ? itemsById.get(row.itemId) : undefined;
      if (item) onOpenBook(item);
      else onFindWork(row.title);
    },
    [itemsById, onFindWork, onOpenBook],
  );

  const createList = useCallback(() => {
    const name = draftName.trim();
    if (!name) return;
    setDraftName('');
    setNaming(false);
    // A holder rather than a bare `let`: the mutator runs inside `write`, may run
    // again on a CAS retry, and TypeScript does not track an assignment made
    // inside a callback — so a plain local reads back as its initial value's type.
    const made: { listId: string | null } = { listId: null };
    void write((current) => {
      const mutation = createReadingList(current, { name }, createReadingListsMutationContext());
      made.listId = mutation.listId;
      return mutation;
    }).then(() => {
      if (made.listId) setListId(made.listId);
    });
  }, [draftName, write]);

  const removeList = useCallback(
    (summary: ReadingListSummary) => {
      const held: { removed: RemovedReadingList | null; index: number } = {
        removed: null,
        index: 0,
      };
      void write(
        (current) => {
          held.index = current.lists.findIndex((candidate) => candidate.id === summary.listId);
          const mutation = deleteReadingList(
            current,
            summary.listId,
            createReadingListsMutationContext(),
          );
          held.removed = mutation.removed;
          return mutation;
        },
        () => {
          const captured = held.removed;
          const at = held.index;
          if (!captured) return null;
          return {
            message: t('readingLists.view.undo.listDeleted', { name: summary.name }),
            run: () => {
              void write((current) =>
                restoreReadingList(current, captured, at, createReadingListsMutationContext()),
              );
            },
          };
        },
      );
      if (listId === summary.listId) setListId(null);
    },
    [listId, t, write],
  );

  const removeRow = useCallback(
    (row: ReadingListRow) => {
      if (!list) return;
      const targetList = list.id;
      const held: { removed: RemovedReadingEntry | null } = { removed: null };
      void write(
        (current) => {
          const mutation = removeReadingListEntry(
            current,
            targetList,
            row.entry.id,
            createReadingListsMutationContext(),
          );
          held.removed = mutation.removed;
          return mutation;
        },
        () => {
          const captured = held.removed;
          if (!captured) return null;
          return {
            message: t('readingLists.view.undo.entryRemoved', { title: row.title }),
            run: () => {
              void write((current) =>
                restoreReadingListEntry(current, captured, createReadingListsMutationContext()),
              );
            },
          };
        },
      );
    },
    [list, t, write],
  );

  const changeState = useCallback(
    (row: ReadingListRow, state: ReadingEntryState) => {
      if (!list) return;
      const targetList = list.id;
      void write((current) =>
        setReadingEntryState(
          current,
          targetList,
          row.entry.id,
          state,
          createReadingListsMutationContext(),
        ),
      );
    },
    [list, write],
  );

  /**
   * §11.4's `Space`, and §4.5's "always reversible" read from the keyboard.
   *
   * Un-finishing needs a destination and the entry does not record where it came
   * from, so the destination is DERIVED rather than guessed: an entry that was
   * ever started goes back to `reading`, one that is bound to a file goes back to
   * `owned`, and one with no file at all goes back to `wanted`. Every branch is a
   * state the row could legitimately have been in, and none of them invents a
   * finish date — `setReadingEntryState` deletes `finishedAt` on the way out.
   */
  const toggleFinished = useCallback(
    (row: ReadingListRow) => {
      const next: ReadingEntryState =
        row.entry.state === 'finished'
          ? row.entry.startedAt !== undefined
            ? 'reading'
            : row.itemId
              ? 'owned'
              : 'wanted'
          : 'finished';
      changeState(row, next);
    },
    [changeState],
  );

  const dismissSuggestion = useCallback(
    (row: ReadingListRow) => {
      const workId = row.work?.id;
      if (!workId) return;
      void write(
        (current) => dismissReadingWorkSuggestion(current, workId, createReadingListsMutationContext()),
        () => ({
          message: t('readingLists.view.undo.suggestionDismissed', { title: row.title }),
          run: () => {
            void write((current) =>
              restoreReadingWorkSuggestion(current, workId, createReadingListsMutationContext()),
            );
          },
        }),
      );
    },
    [t, write],
  );

  if (!document) {
    return (
      <div className="rlv" data-surface="reading-lists">
        {loadFailure ? (
          <div className="rlv__state rlv__state--error" role="alert">
            <p>{t('readingLists.view.loadFailed')}</p>
            <Button
              variant="primary"
              onClick={() => {
                reload();
              }}
            >
              {t('readingLists.view.retry')}
            </Button>
          </div>
        ) : (
          <div className="rlv__state" aria-busy="true">
            {t('readingLists.view.loading')}
          </div>
        )}
      </div>
    );
  }

  const notices = (
    <>
      {writeFailure ? (
        <div className="rlv__notice rlv__notice--error" role="alert">
          {t('readingLists.view.writeFailed')}
        </div>
      ) : null}
      {undo ? (
        <div className="rlv__notice rlv__notice--undo" role="status">
          <span>{undo.message}</span>
          <Button
            size="sm"
            onClick={() => {
              const action = undo.run;
              setUndo(null);
              action();
            }}
          >
            {t('readingLists.view.undo.action')}
          </Button>
        </div>
      ) : null}
    </>
  );

  if (list) {
    const summary = summaries.find((candidate) => candidate.listId === list.id);
    return (
      <div
        className="rlv"
        data-surface="reading-lists"
        data-mode="detail"
        /**
         * §11.4's `/`. Bound on the view rather than the document: a global
         * listener would steal the key from every other window in this shell,
         * and a list that is not on screen has no filter to focus.
         */
        onKeyDown={(event) => {
          if (event.key !== '/' || event.defaultPrevented) return;
          const target = event.target as HTMLElement | null;
          const tag = target?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
            return;
          }
          event.preventDefault();
          filterFieldRef.current?.focus();
          filterFieldRef.current?.select();
        }}
      >
        <header className="rlv__head">
          <Button size="sm" leftIcon={<Icon name="chevron" />} onClick={() => setListId(null)}>
            {t('readingLists.view.back')}
          </Button>
          <h2 className="rlv__title">{list.name}</h2>
          {summary ? (
            <span className="rlv__count">
              {t('readingLists.view.progress', {
                finished: summary.finished,
                counted: summary.counted,
              })}
            </span>
          ) : null}
          <span className="rlv__spacer" />
          <Button size="sm" onClick={() => setPasting((open) => !open)}>
            {t('readingLists.view.paste')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => summary && removeList(summary)}>
            {t('readingLists.view.deleteList')}
          </Button>
        </header>
        {notices}
        {pasting ? (
          <form
            className="rlv__paste"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pasteText.trim()) return;
              setPreviewText(pasteText);
            }}
          >
            <label className="rlv__paste-label" htmlFor="rlv-paste">
              {t('readingLists.view.pasteLabel')}
            </label>
            <textarea
              id="rlv-paste"
              className="rlv__paste-field ui-focusable"
              rows={5}
              value={pasteText}
              placeholder={t('readingLists.view.pastePlaceholder')}
              onChange={(event) => setPasteText(event.target.value)}
            />
            <div className="rlv__paste-actions">
              <Button type="submit" variant="primary" disabled={!pasteText.trim()}>
                {t('readingLists.view.pasteSubmit')}
              </Button>
              <Button onClick={() => setPasting(false)}>{t('readingLists.view.pasteCancel')}</Button>
            </div>
          </form>
        ) : null}
        {rows.length === 0 ? null : (
          <div className="rlv__filter">
            <input
              ref={filterFieldRef}
              type="search"
              className="rlv__filter-field ui-focusable"
              value={filter}
              placeholder={t('readingLists.view.filterPlaceholder')}
              aria-label={t('readingLists.view.filterLabel')}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && filter) {
                  event.preventDefault();
                  setFilter('');
                }
              }}
            />
            {query ? (
              <span className="rlv__filter-count" role="status">
                {t('readingLists.view.filterCount', {
                  shown: visibleRows.length,
                  total: rows.length,
                })}
              </span>
            ) : null}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="rlv__state">{t('readingLists.view.emptyList')}</p>
        ) : visibleRows.length === 0 ? (
          <p className="rlv__state">{t('readingLists.view.filterEmpty', { query: filter.trim() })}</p>
        ) : (
          <ul className="rlv__rows">
            {visibleRows.map((row) => {
              const item = row.itemId ? itemsById.get(row.itemId) : undefined;
              const suggested = row.suggestion ? row.work?.suggestion : undefined;
              return (
                <li key={row.entry.id} className="rlv__row" data-state={row.entry.state}>
                  <button
                    type="button"
                    className="rlv__row-open ui-focusable"
                    onClick={() => openRow(row)}
                    /**
                     * §11.4's row keys. `Enter` is left to the button's own
                     * activation — that is what "Enter opens" already means — and
                     * only the two keys the plan reassigns are intercepted. Space
                     * MUST be prevented or the browser fires the click as well and
                     * the row both ticks and opens the reader.
                     */
                    onKeyDown={(event) => {
                      if (event.key === ' ' || event.key === 'Spacebar') {
                        event.preventDefault();
                        toggleFinished(row);
                      } else if (event.key === 'Delete') {
                        event.preventDefault();
                        removeRow(row);
                      }
                    }}
                  >
                    <span className="rlv__row-title">{row.title}</span>
                    <span className="rlv__row-where">
                      {item
                        ? t('readingLists.view.rowOpen')
                        : t('readingLists.view.rowFind')}
                    </span>
                  </button>
                  <Select
                    className="rlv__row-state"
                    aria-label={t('readingLists.view.rowState', { title: row.title })}
                    value={row.entry.state}
                    onChange={(event) =>
                      changeState(row, event.target.value as ReadingEntryState)
                    }
                    options={READING_ENTRY_STATES.map((state) => ({
                      value: state,
                      label: t(STATE_KEYS[state]),
                    }))}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('readingLists.view.rowRemove', { title: row.title })}
                    onClick={() => removeRow(row)}
                  >
                    <Icon name="trash" />
                  </Button>
                  {suggested ? (
                    <p className="rlv__row-triage">
                      <span>
                        {t('readingLists.view.suggestion', {
                          title: itemsById.get(suggested.itemId)?.title ?? suggested.itemId,
                        })}
                      </span>
                      <Button size="sm" onClick={() => dismissSuggestion(row)}>
                        {t('readingLists.view.suggestionNo')}
                      </Button>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <ReadingListPasteFlow
          open={previewText !== null}
          rawText={previewText ?? ''}
          listId={list.id}
          listName={list.name}
          onClose={() => setPreviewText(null)}
          onImported={() => {
            setPasteText('');
            setPasting(false);
            // The flow writes through the same client but from its own call, and
            // main deliberately does NOT broadcast back to the window that wrote
            // (`readingListsIpc.ts` skips the origin). Without this the sheet
            // closes on a successful import and the list behind it still reads
            // empty — a landed write that looks like a silent failure.
            const fresh = latestReadingListsSnapshot();
            if (fresh) adopt(fresh.document);
          }}
        />
      </div>
    );
  }

  return (
    <div className="rlv" data-surface="reading-lists" data-mode="grid">
      <header className="rlv__head">
        <h2 className="rlv__title">{t('readingLists.view.title')}</h2>
        <span className="rlv__spacer" />
        <Select
          aria-label={t('readingLists.view.sort.label')}
          value={sort}
          onChange={(event) => setSort(event.target.value as ReadingListSort)}
          options={SORTS.map((value) => ({ value, label: t(SORT_KEYS[value]) }))}
        />
        <Button variant="primary" leftIcon={<Icon name="plus" />} onClick={() => setNaming(true)}>
          {t('readingLists.view.newList')}
        </Button>
      </header>
      <p className="rlv__lede">{t('readingLists.view.lede')}</p>
      {notices}
      {naming ? (
        <form
          className="rlv__new"
          onSubmit={(event) => {
            event.preventDefault();
            createList();
          }}
        >
          <input
            ref={nameFieldRef}
            className="rlv__new-field ui-focusable"
            value={draftName}
            placeholder={t('readingLists.view.newListPlaceholder')}
            aria-label={t('readingLists.view.newListPlaceholder')}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setNaming(false);
                setDraftName('');
              }
            }}
          />
          <Button type="submit" variant="primary" disabled={!draftName.trim()}>
            {t('readingLists.view.create')}
          </Button>
          <Button
            onClick={() => {
              setNaming(false);
              setDraftName('');
            }}
          >
            {t('readingLists.view.cancel')}
          </Button>
        </form>
      ) : null}
      {summaries.length === 0 ? (
        <p className="rlv__state">{t('readingLists.view.emptyGrid')}</p>
      ) : (
        <ul className="rlv__grid">
          {summaries.map((summary) => (
            <li key={summary.listId} className="rlv__card" data-archived={summary.archived}>
              <button
                type="button"
                className="rlv__card-open ui-focusable"
                onClick={() => setListId(summary.listId)}
              >
                <span className="rlv__mosaic" aria-hidden="true">
                  {(summary.coverItemIds.length > 0
                    ? summary.coverItemIds
                    : [summary.listId]
                  ).map((coverId) => {
                    const item = itemsById.get(coverId);
                    const url = coverUrlFor(item?.coverPath, item?.id);
                    return (
                      <span
                        key={coverId}
                        className="rlv__mosaic-tile"
                        style={{
                          backgroundImage: url
                            ? `url("${url}")`
                            : coverFallbackImage(item?.title ?? summary.name),
                        }}
                      />
                    );
                  })}
                </span>
                <span className="rlv__card-name">{summary.name}</span>
                <span className="rlv__card-progress">
                  {t('readingLists.view.progress', {
                    finished: summary.finished,
                    counted: summary.counted,
                  })}
                </span>
                <span
                  className="rlv__bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={summary.counted}
                  aria-valuenow={summary.finished}
                >
                  <span
                    className="rlv__bar-fill"
                    style={{ width: `${Math.round(summary.progress * 100)}%` }}
                  />
                </span>
                {summary.triage > 0 ? (
                  <span className="rlv__card-triage">
                    {t('readingLists.view.triage', { count: summary.triage })}
                  </span>
                ) : null}
                {summary.archived ? (
                  <span className="rlv__card-archived">{t('readingLists.view.archived')}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
