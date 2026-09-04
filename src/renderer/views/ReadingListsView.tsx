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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryItem } from '../../shared/types';
import Icon from '../components/Icons';
import { ReadingListPasteFlow } from '../components/reading/ReadingListPasteFlow';
import { Button, Select } from '../components/ui';
import { useT } from '../i18n';
import { applyReadingListsMutation, latestReadingListsSnapshot } from '../readingListsClient';
import { useReadingListsDocument } from '../readingListsDocument';
import {
  READING_LIST_DENSITIES,
  loadReadingListDensity,
  saveReadingListDensity,
  type ReadingListDensity,
} from '../readingListsDensity';
import { useLibraryItems } from '../widgets/hooks';
import { coverFallbackImage, coverUrlFor } from '../utils/coverArt';
import type { ReadingEntryState, ReadingListEntry } from '../../shared/readingLists';
import { READING_LIST_EXAMPLE_MESSAGE } from '../../shared/readingListParser';
import {
  addLibraryItemToReadingList,
  createReadingList,
  createReadingListsMutationContext,
  deleteReadingList,
  dismissReadingWorkSuggestion,
  moveReadingListEntries,
  removeReadingListEntries,
  removeReadingListEntry,
  reorderReadingListEntries,
  restoreReadingEntryStates,
  restoreReadingList,
  restoreReadingListEntries,
  restoreReadingListEntry,
  restoreReadingWorkSuggestion,
  setReadingEntryState,
  setReadingEntryStates,
  undoReadingListMove,
  type MovedReadingEntry,
  type RemovedReadingEntry,
  type RemovedReadingList,
} from '../../shared/readingListMutations';
import {
  READING_ENTRY_STATES,
  readingListRows,
  reorderEntryIds,
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

/**
 * Six placeholders, because the grid's `auto-fill` fits three per row at the
 * default window and two full rows read as a grid rather than as a stray card.
 * A fixed count is deliberate: guessing the real number from a previous session
 * would make the skeleton lie whenever it guessed wrong.
 */
const SKELETON_CARDS = [0, 1, 2, 3, 4, 5];

/** The one undo the surface offers, and the label that explains what it undoes. */
interface UndoSlot {
  message: string;
  run: () => void;
}

/**
 * Everything a row can do, addressed by entry id rather than by row object.
 *
 * By id because this object has to be identity-STABLE for the life of the view
 * (§11.4's performance row), and a callback that closes over a row closes over
 * the document that produced it. The implementations read the current handlers
 * out of a ref, so the façade never changes and a row never re-renders because
 * its callbacks were rebuilt.
 */
interface ReadingRowActions {
  open: (entryId: string) => void;
  toggleFinished: (entryId: string) => void;
  remove: (entryId: string) => void;
  setState: (entryId: string, state: ReadingEntryState) => void;
  dismissSuggestion: (entryId: string) => void;
  pick: (entryId: string, range: boolean) => void;
  /** §11.4's reorder. `target` is the row dropped onto, or stepped past. */
  reorder: (entryId: string, targetEntryId: string) => void;
  /** Keyboard reorder: -1 up, +1 down. Drag alone would be inaccessible. */
  step: (entryId: string, delta: -1 | 1) => void;
  /** Which row is being dragged, so the row can mark itself. */
  dragStart: (entryId: string) => void;
  dragEnd: () => void;
  /** The id currently being dragged, read at drop time. */
  dragged: () => string | null;
}

interface ReadingRowProps {
  entryId: string;
  state: ReadingEntryState;
  title: string;
  /** §11.1: `null` is the acquisition destination, not a missing one. */
  item: LibraryItem | undefined;
  /** The suggested item's title, already resolved — the row never reads a map. */
  suggestedTitle: string | null;
  selected: boolean;
  actions: ReadingRowActions;
  t: ReturnType<typeof useT>['t'];
  /**
   * Present ONLY so a language switch repaints the rows.
   *
   * `t`'s identity is stable by design, so a memoized row that took `t` alone
   * would keep the old language's strings forever after a switch, silently and
   * without an error. This prop is unused in the body on purpose.
   */
  lang: ReturnType<typeof useT>['lang'];
}

let rowRenders = 0;

/**
 * The instrument for §11.4's performance row, and the only honest one available
 * from a test: a re-render leaves the same DOM node behind, so nothing in the
 * document can tell you whether 1 row re-rendered or 500 did.
 *
 * Incrementing in a render body is a side effect in render; it is a counter, and
 * a StrictMode double-render doubles both halves of the delta the test asserts.
 */
export function readingRowRendersForTesting(): number {
  return rowRenders;
}

/**
 * §11.4: "the list view must not re-render every row when one entry's state
 * changes."
 *
 * `memo` with the DEFAULT shallow compare, and every prop above is a primitive
 * or an identity-stable object for exactly that reason.
 *
 * **The trap, measured rather than reasoned about.** The obvious shape is to
 * pass the whole `entry`, and the mutation layer really does map entries and
 * replace only the one it changed — so entry identity looks like it survives.
 * It does not: `applyReadingListsMutation` runs `normalizeReadingListsDocument`
 * over its base before mutating, which rebuilds EVERY entry object. Passing
 * `entry` scored 500 of 500 rows re-rendering on a one-row change. `entryId` and
 * `state` are the two fields this component actually reads, and they are
 * primitives, so the compare is true for the 499 rows that did not move.
 *
 * A custom comparator would have worked too and is the worse answer — it is
 * where `lang` gets forgotten, and `t`'s identity is stable by design, so the
 * rows would silently keep the old language's strings after a switch.
 */
const ReadingRow = memo(function ReadingRow({
  entryId,
  state,
  title,
  item,
  suggestedTitle,
  selected,
  actions,
  t,
}: ReadingRowProps) {
  rowRenders += 1;
  return (
    <li
      className="rlv__row"
      data-state={state}
      /*
        §11.4's drag and drop. The dragged id is held in the VIEW, not in
        `dataTransfer`: jsdom implements no `DataTransfer`, so a payload put
        there is unreadable in every test and the feature would ship on a path
        nothing can drive. `setData` is still called where it exists, because a
        drag with an empty data store is refused outright by some hosts.
      */
      draggable
      onDragStart={(event) => {
        actions.dragStart(entryId);
        event.dataTransfer?.setData('text/plain', entryId);
      }}
      onDragEnd={() => actions.dragEnd()}
      onDragOver={(event) => {
        // Without this the drop event never fires at all — the default action
        // for dragover is "refuse the drop", and it is silent about it.
        if (actions.dragged()) event.preventDefault();
      }}
      onDrop={(event) => {
        const moved = actions.dragged();
        if (!moved) return;
        event.preventDefault();
        actions.reorder(moved, entryId);
        actions.dragEnd();
      }}
    >
      {/*
        `onClick` rather than `onChange`, with `readOnly` to keep the input
        controlled without React's warning: the shift key is on the mouse event,
        and a checkbox's change event does not carry it on every host. Space on a
        focused box still fires click, so the keyboard path is the same one.
      */}
      <input
        type="checkbox"
        className="rlv__row-pick"
        checked={selected}
        readOnly
        aria-label={t('readingLists.view.bulk.select', { title })}
        onClick={(event) => actions.pick(entryId, event.shiftKey)}
      />
      <button
        type="button"
        className="rlv__row-open ui-focusable"
        onClick={() => actions.open(entryId)}
        /**
         * §11.4's row keys. `Enter` is left to the button's own activation —
         * that is what "Enter opens" already means — and only the two keys the
         * plan reassigns are intercepted. Space MUST be prevented or the browser
         * fires the click as well and the row both ticks and opens the reader.
         */
        onKeyDown={(event) => {
          if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            // The keyboard half of §11.4's reorder. A drag-only reorder would
            // be a feature the accessibility row two bullets up forbids, and
            // Alt+Arrow is the pairing every other reorderable list uses.
            event.preventDefault();
            actions.step(entryId, event.key === 'ArrowUp' ? -1 : 1);
          } else if (event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault();
            actions.toggleFinished(entryId);
          } else if (event.key === 'Delete') {
            event.preventDefault();
            actions.remove(entryId);
          }
        }}
      >
        <span className="rlv__row-title">{title}</span>
        <span className="rlv__row-where">
          {item ? t('readingLists.view.rowOpen') : t('readingLists.view.rowFind')}
        </span>
      </button>
      <Select
        className="rlv__row-state"
        aria-label={t('readingLists.view.rowState', { title })}
        value={state}
        onChange={(event) => actions.setState(entryId, event.target.value as ReadingEntryState)}
        options={READING_ENTRY_STATES.map((state) => ({
          value: state,
          label: t(STATE_KEYS[state]),
        }))}
      />
      <Button
        size="sm"
        variant="ghost"
        aria-label={t('readingLists.view.rowRemove', { title })}
        onClick={() => actions.remove(entryId)}
      >
        <Icon name="trash" />
      </Button>
      {suggestedTitle !== null ? (
        <p className="rlv__row-triage">
          <span>{t('readingLists.view.suggestion', { title: suggestedTitle })}</span>
          <Button size="sm" onClick={() => actions.dismissSuggestion(entryId)}>
            {t('readingLists.view.suggestionNo')}
          </Button>
        </p>
      ) : null}
    </li>
  );
});

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
  const { t, lang } = useT();
  // One subscription, shared with §11.2's widgets: four copies of a load effect
  // is four chances to disagree about what "not loaded yet" looks like.
  const { document, failure: loadFailure, health, adopt, reload } = useReadingListsDocument();
  const [writeFailure, setWriteFailure] = useState<string | null>(null);
  // Dismissal is per detected-at, not a bare boolean: a SECOND recovery, later in
  // the same session, is a new fact and has to be announced again.
  const [healthDismissedAt, setHealthDismissedAt] = useState<number | null>(null);
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
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [moveSkipped, setMoveSkipped] = useState(0);
  const [picking, setPicking] = useState(false);
  const [pickFilter, setPickFilter] = useState('');
  /** The title of the book the last add declined as already present, or `null`. */
  const [libraryNote, setLibraryNote] = useState<string | null>(null);
  /**
   * §11.4's density row. Read from storage ONCE, lazily — a bare
   * `useState(loadReadingListDensity())` calls into `localStorage` on every
   * render of a view that re-renders on every store broadcast.
   */
  const [density, setDensityState] = useState<ReadingListDensity>(loadReadingListDensity);
  /** Set when the preference applied but could not be persisted (§11.4 honest states). */
  const [densityUnsaved, setDensityUnsaved] = useState(false);
  const setDensity = useCallback((next: ReadingListDensity) => {
    setDensityState(next);
    // The mode applies either way; only the promise that it survives a restart
    // is retracted, and it is retracted in words rather than silently.
    setDensityUnsaved(!saveReadingListDensity(next));
  }, []);
  const nameFieldRef = useRef<HTMLInputElement | null>(null);
  const filterFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (naming) nameFieldRef.current?.focus();
  }, [naming]);

  // A filter that survives navigation would hide rows in a list the user has not
  // typed anything about yet, which reads as "this list is empty". A SELECTION
  // that survives it is worse: the bulk bar would then act on rows from a list
  // the user has already left.
  useEffect(() => {
    setFilter('');
    setSelected(new Set());
    setAnchor(null);
    setMoveSkipped(0);
    setPicking(false);
    setPickFilter('');
    setLibraryNote(null);
  }, [listId]);

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
   * §11.4's bulk selection, derived rather than stored, so it can never name a
   * row that is no longer there.
   *
   * The selection set is the raw record of what was ticked; this is the list the
   * bulk actions actually send. Filtering it through `rows` prunes an entry the
   * user removed one at a time, an entry another window removed, and an entry a
   * re-parse replaced — none of which the set itself would ever hear about.
   * It is taken from `rows`, not `visibleRows`: a selection made and then filtered
   * out of sight is still a selection, and silently shrinking it under the filter
   * would make "Remove" remove fewer rows than the count on the button.
   */
  const selectedIds = useMemo(
    () => rows.filter((row) => selected.has(row.entry.id)).map((row) => row.entry.id),
    [rows, selected],
  );

  /** Move destinations. Archived lists are still destinations — they are lists. */
  const otherLists = useMemo(
    () => (document?.lists ?? []).filter((candidate) => candidate.id !== listId),
    [document, listId],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  /**
   * A shift-range spans the rows the user can SEE. Ranging over `rows` instead
   * would sweep in filtered-out entries between the two clicks — rows that were
   * never on screen, selected by a gesture that looks like it selected four.
   */
  const toggleSelected = useCallback(
    (entryId: string, range: boolean) => {
      setMoveSkipped(0);
      const next = new Set(selected);
      const ids = visibleRows.map((row) => row.entry.id);
      const from = anchor === null ? -1 : ids.indexOf(anchor);
      const to = ids.indexOf(entryId);
      if (range && from >= 0 && to >= 0) {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        for (let index = lo; index <= hi; index += 1) next.add(ids[index]);
        // The anchor stays put, so a second shift-click re-ranges from the same
        // origin rather than from wherever the last one landed.
        setSelected(next);
        return;
      }
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      setSelected(next);
      setAnchor(entryId);
    },
    [anchor, selected, visibleRows],
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

  /**
   * §11.4's "no list yet → the paste box itself".
   *
   * One action, not two. Making the user create an empty list and *then* find
   * the paste control is the two-step the clause is objecting to, so this mints
   * the list and hands the text straight to the same preview sheet a paste from
   * inside a list opens — the triage strip, the dropped-lines disclosure and the
   * per-row edit are identical, because it is literally the same component.
   *
   * Both writes are sequenced rather than folded into one mutation: the preview
   * sheet needs a real `listId` to import against, and it only exists after the
   * first write is acknowledged.
   */
  const createListWithPaste = useCallback(
    (name: string, text: string) => {
      const trimmedName = name.trim();
      const trimmedText = text.trim();
      if (!trimmedName || !trimmedText) return;
      const made: { listId: string | null } = { listId: null };
      void write((current) => {
        const mutation = createReadingList(
          current,
          { name: trimmedName },
          createReadingListsMutationContext(),
        );
        made.listId = mutation.listId;
        return mutation;
      }).then(() => {
        if (!made.listId) return;
        setListId(made.listId);
        setPreviewText(text);
      });
    },
    [write],
  );

  /**
   * §11.4's "or add from your library", and §11.1's other direction: until this
   * existed, `addReadingListEntry` had no renderer caller outside the paste
   * flow, so a book already in the library could not be put on a list at all.
   *
   * The duplicate is reported rather than swallowed. A second click on the same
   * book would otherwise look exactly like a click that did nothing.
   */
  const addFromLibrary = useCallback(
    (item: LibraryItem) => {
      if (!list) return;
      const held: { entryId: string | null; duplicate: boolean } = {
        entryId: null,
        duplicate: false,
      };
      void write(
        (current) => {
          const mutation = addLibraryItemToReadingList(
            current,
            list.id,
            { id: item.id, title: item.title },
            createReadingListsMutationContext(),
          );
          held.entryId = mutation.entryId;
          held.duplicate = mutation.duplicate;
          return mutation;
        },
        () =>
          held.entryId && !held.duplicate
            ? {
                message: t('readingLists.view.library.added', { title: item.title }),
                run: () => {
                  const entryId = held.entryId;
                  if (!entryId) return;
                  void write((current) =>
                    removeReadingListEntry(
                      current,
                      list.id,
                      entryId,
                      createReadingListsMutationContext(),
                    ),
                  );
                },
              }
            : null,
      ).then(() => {
        setLibraryNote(held.duplicate ? item.title : null);
      });
    },
    [list, t, write],
  );

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
   * §11.4's reorder — one write, one undo, both drag and keyboard.
   *
   * The order handed to the mutation is computed from `rows`, the WHOLE list,
   * never from `visibleRows`. A filter hides rows without removing them, and
   * `reorderReadingListEntries` appends anything the caller omitted, so passing
   * the filtered order would silently move every hidden entry to the end.
   *
   * The undo is the order as it was BEFORE, captured inside the mutator so a
   * compare-and-swap retry records the document that actually won.
   */
  const reorderRows = useCallback(
    (movedId: string, targetId: string) => {
      if (!list) return;
      const targetList = list.id;
      const held: { previous: string[] } = { previous: [] };
      void write(
        (current) => {
          const currentList = current.lists.find((candidate) => candidate.id === targetList);
          const order = (currentList?.entries ?? []).map((entry) => entry.id);
          held.previous = order;
          return reorderReadingListEntries(
            current,
            targetList,
            reorderEntryIds(order, movedId, targetId),
            createReadingListsMutationContext(),
          );
        },
        () => {
          const captured = held.previous;
          if (captured.length === 0) return null;
          return {
            message: t('readingLists.view.undo.reordered'),
            run: () => {
              void write((current) =>
                reorderReadingListEntries(
                  current,
                  targetList,
                  captured,
                  createReadingListsMutationContext(),
                ),
              );
            },
          };
        },
      );
    },
    [list, t, write],
  );

  /**
   * The keyboard step. It moves past the next VISIBLE row, not the next row in
   * the document: under a filter the rows between are not on screen, and
   * stepping into a gap the user cannot see is a control that appears to do
   * nothing. The write itself is still computed over the full order.
   */
  const stepRow = useCallback(
    (entryId: string, delta: -1 | 1) => {
      const order = visibleRows.map((row) => row.entry.id);
      const at = order.indexOf(entryId);
      const target = order[at + delta];
      if (at < 0 || target === undefined) return;
      reorderRows(entryId, target);
    },
    [reorderRows, visibleRows],
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

  /**
   * The one mutable cell in this component, and the reason §11.4's performance
   * row is met at all.
   *
   * Assigned during render rather than in an effect: a click that arrives
   * between a render and its effects must reach the handlers built from the
   * document that is on screen, not the previous one. Nothing reads it during
   * render, so a double-render under StrictMode is a second identical write.
   */
  const live = useRef({
    rows,
    openRow,
    toggleFinished,
    removeRow,
    changeState,
    dismissSuggestion,
    toggleSelected,
    reorderRows,
    stepRow,
  });
  live.current = {
    rows,
    openRow,
    toggleFinished,
    removeRow,
    changeState,
    dismissSuggestion,
    toggleSelected,
    reorderRows,
    stepRow,
  };

  /**
   * The dragged row, in a ref rather than in state: nothing about the drag is
   * rendered mid-gesture, and putting it in state would re-render every row on
   * `dragstart` — the exact cost §11.4's performance row forbids.
   */
  const dragging = useRef<string | null>(null);

  /**
   * Built ONCE, deliberately — this is the prop that would otherwise change on
   * every keystroke in the filter field and re-render all 500 rows with it.
   */
  const rowActions = useMemo<ReadingRowActions>(() => {
    const find = (entryId: string) =>
      live.current.rows.find((candidate) => candidate.entry.id === entryId);
    return {
      open: (entryId) => {
        const row = find(entryId);
        if (row) live.current.openRow(row);
      },
      toggleFinished: (entryId) => {
        const row = find(entryId);
        if (row) live.current.toggleFinished(row);
      },
      remove: (entryId) => {
        const row = find(entryId);
        if (row) live.current.removeRow(row);
      },
      setState: (entryId, state) => {
        const row = find(entryId);
        if (row) live.current.changeState(row, state);
      },
      dismissSuggestion: (entryId) => {
        const row = find(entryId);
        if (row) live.current.dismissSuggestion(row);
      },
      pick: (entryId, range) => live.current.toggleSelected(entryId, range),
      reorder: (entryId, targetEntryId) => {
        if (entryId !== targetEntryId) live.current.reorderRows(entryId, targetEntryId);
      },
      step: (entryId, delta) => live.current.stepRow(entryId, delta),
      dragStart: (entryId) => {
        dragging.current = entryId;
      },
      dragEnd: () => {
        dragging.current = null;
      },
      dragged: () => dragging.current,
    };
  }, []);

  /**
   * The three bulk verbs. Each is ONE write with ONE undo, which is the whole
   * point of §11.4's row: forty single writes would be forty compare-and-swap
   * round trips and thirty-nine undo slots the user can never reach.
   *
   * Each captures its inverse payload inside the mutator, because a CAS retry
   * re-runs it against the document main handed back — so what to undo is only
   * known after the write that actually landed.
   */
  const bulkFinish = useCallback(() => {
    if (!list || !selectedIds.length) return;
    const targetList = list.id;
    const ids = selectedIds;
    const held: { previous: ReadingListEntry[] } = { previous: [] };
    void write(
      (current) => {
        const mutation = setReadingEntryStates(
          current,
          targetList,
          ids,
          'finished',
          createReadingListsMutationContext(),
        );
        held.previous = mutation.previous;
        return mutation;
      },
      () => {
        const captured = held.previous;
        if (!captured.length) return null;
        return {
          message: t('readingLists.view.undo.bulkFinished', { count: captured.length }),
          run: () => {
            void write((current) =>
              restoreReadingEntryStates(
                current,
                targetList,
                captured,
                createReadingListsMutationContext(),
              ),
            );
          },
        };
      },
    );
    clearSelection();
  }, [clearSelection, list, selectedIds, t, write]);

  const bulkRemove = useCallback(() => {
    if (!list || !selectedIds.length) return;
    const ids = selectedIds;
    const targetList = list.id;
    const held: { removed: RemovedReadingEntry[] } = { removed: [] };
    void write(
      (current) => {
        const mutation = removeReadingListEntries(
          current,
          targetList,
          ids,
          createReadingListsMutationContext(),
        );
        held.removed = mutation.removed;
        return mutation;
      },
      () => {
        const captured = held.removed;
        if (!captured.length) return null;
        return {
          message: t('readingLists.view.undo.bulkRemoved', { count: captured.length }),
          run: () => {
            void write((current) =>
              restoreReadingListEntries(current, captured, createReadingListsMutationContext()),
            );
          },
        };
      },
    );
    clearSelection();
  }, [clearSelection, list, selectedIds, t, write]);

  const bulkMove = useCallback(
    (toListId: string) => {
      if (!list || !selectedIds.length || !toListId) return;
      const fromList = list.id;
      const ids = selectedIds;
      const name =
        document?.lists.find((candidate) => candidate.id === toListId)?.name ?? toListId;
      const held: { moved: MovedReadingEntry[]; skipped: number } = { moved: [], skipped: 0 };
      void write(
        (current) => {
          const mutation = moveReadingListEntries(
            current,
            fromList,
            toListId,
            ids,
            createReadingListsMutationContext(),
          );
          held.moved = mutation.moved;
          held.skipped = mutation.skipped.length;
          return mutation;
        },
        () => {
          const captured = held.moved;
          if (!captured.length) return null;
          return {
            message: t('readingLists.view.undo.bulkMoved', { count: captured.length, name }),
            run: () => {
              void write((current) =>
                undoReadingListMove(
                  current,
                  fromList,
                  toListId,
                  captured,
                  createReadingListsMutationContext(),
                ),
              );
            },
          };
        },
      ).then(() => {
        // The skip is not a failure and it is not silent: a move of four that
        // moved three has to say which number is which, or the count on the
        // button and the count in the list disagree with no explanation.
        setMoveSkipped(held.skipped);
      });
      clearSelection();
    },
    [clearSelection, document, list, selectedIds, t, write],
  );

  if (!document) {
    return (
      <div className="rlv" data-surface="reading-lists" data-mode="loading" data-density={density}>
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
          /**
           * §11.4's "skeleton rows while the store loads". The placeholders are
           * `aria-hidden` and the status text is the only thing a screen reader
           * gets — announcing six empty cards is worse than announcing nothing.
           */
          <div className="rlv__loading" aria-busy="true">
            <p className="rlv__state" role="status">
              {t('readingLists.view.loading')}
            </p>
            <ul className="rlv__skeleton" aria-hidden="true" data-testid="rlv-skeleton">
              {SKELETON_CARDS.map((slot) => (
                <li key={slot} className="rlv__skeleton-card">
                  <span className="rlv__skeleton-mosaic" />
                  <span className="rlv__skeleton-line rlv__skeleton-line--name" />
                  <span className="rlv__skeleton-line rlv__skeleton-line--meta" />
                  <span className="rlv__skeleton-line rlv__skeleton-line--bar" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  /**
   * §11.4: *a corrupt store shows what happened and offers last-good recovery,
   * it does not silently show zero lists*.
   *
   * `reset` is the case that makes this load-bearing. Main hands back an empty
   * document, which is byte-identical to a first run's, so without this the
   * surface renders "No lists yet. Make one, then paste a message into it." over
   * a store that just lost every list. `recovered` is the milder half — the
   * lists on screen are real, but they are the restore point, so anything
   * written since the corruption is not here.
   *
   * Both name the file, because recovery is a file operation and the user's only
   * route to the unreadable original is on disk.
   */
  const showHealth =
    (health?.state === 'recovered' || health?.state === 'reset') &&
    // Normalized on both sides: a health record with no `detectedAt` would
    // otherwise compare `undefined !== null` and refuse to stay dismissed.
    (health.detectedAt ?? 0) !== (healthDismissedAt ?? -1);
  const healthNotice = showHealth ? (
    <div
      className={`rlv__notice rlv__notice--${health.state === 'reset' ? 'error' : 'warn'}`}
      role="alert"
      data-health={health.state}
    >
      <span>
        {health.state === 'reset'
          ? t('readingLists.view.health.reset')
          : t('readingLists.view.health.recovered')}
      </span>
      <Button
        size="sm"
        onClick={() => {
          setHealthDismissedAt(health.detectedAt ?? 0);
        }}
      >
        {t('readingLists.view.health.dismiss')}
      </Button>
    </div>
  ) : null;

  /**
   * §11.4's *with the §2.1 example shown as a hint*.
   *
   * The text is `READING_LIST_EXAMPLE_MESSAGE`, imported from the parser rather
   * than retyped here — it is the exact input §2.1's acceptance test pins the
   * output of, so what the user is shown cannot drift from what the parser is
   * proven to do with it. It is untranslated on purpose: it is sample input, not
   * chrome, and what it demonstrates *is* the mixed EN/JA shape.
   *
   * The button matters as much as the sample. A hint you have to retype is a
   * hint nobody uses, and this one fills the box with something the preview
   * sheet is guaranteed to have an interesting answer for — five entries, one
   * flagged for triage, one volume range, one URL kept off the entries.
   */
  const exampleHint = (
    <div className="rlv__example">
      <p className="rlv__example-label">{t('readingLists.view.empty.exampleLabel')}</p>
      <pre className="rlv__example-text">{READING_LIST_EXAMPLE_MESSAGE}</pre>
      <Button
        size="sm"
        onClick={() => {
          setPasteText(READING_LIST_EXAMPLE_MESSAGE);
          setPasting(true);
        }}
      >
        {t('readingLists.view.empty.useExample')}
      </Button>
    </div>
  );

  /**
   * §11.4's density control, rendered in BOTH headers because it is one
   * preference over one surface — the grid of cards and the list of rows are
   * the same navigation, and a mode that applied to only half of it would read
   * as a bug the first time the user went back.
   *
   * A `<select>` rather than a two-state button: the two modes are named, and a
   * button labelled "Compact" is ambiguous about whether it reports the current
   * mode or the one it would switch to.
   */
  const densityControl = (
    <Select
      aria-label={t('readingLists.view.density.label')}
      value={density}
      onChange={(event) => setDensity(event.target.value as ReadingListDensity)}
      options={READING_LIST_DENSITIES.map((value) => ({
        value,
        label: t(`readingLists.view.density.${value}`),
      }))}
    />
  );

  const notices = (
    <>
      {healthNotice}
      {densityUnsaved ? (
        <div className="rlv__notice rlv__notice--warn" role="status">
          {t('readingLists.view.density.unsaved')}
        </div>
      ) : null}
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

    /**
     * The library picker. Filtered on the WHOLE library rather than on a
     * pre-trimmed "not already on this list" set: hiding a book the user owns
     * because it is already here reads as the library being incomplete, and
     * they then go looking for it. It is shown, marked, and its button says so —
     * the mutation refuses the duplicate either way.
     */
    const onList = new Set(
      rows.map((row) => row.itemId).filter((itemId): itemId is string => Boolean(itemId)),
    );
    // NOT `query`: the filter strip below already has a `query` in this scope,
    // and shadowing it made the row-count line vanish unless the PICKER's search
    // box happened to be non-empty. The existing filter test caught it.
    const pickQuery = pickFilter.trim().toLowerCase();
    const candidates = (
      pickQuery ? items.filter((item) => item.title.toLowerCase().includes(pickQuery)) : items
    ).slice(
      0,
      // A cap, not virtualization: this is a transient picker over a library
      // that is thousands of items, and the filter above it is the real
      // navigation. The count line says the cap is in force so it is not a
      // silent truncation.
      50,
    );
    const libraryPicker = (
      <div className="rlv__picker" data-testid="rlv-library-picker">
        <label className="rlv__paste-label" htmlFor="rlv-pick">
          {t('readingLists.view.library.label')}
        </label>
        <input
          id="rlv-pick"
          type="search"
          className="rlv__filter-field ui-focusable"
          value={pickFilter}
          placeholder={t('readingLists.view.library.filterPlaceholder')}
          onChange={(event) => setPickFilter(event.target.value)}
        />
        <p className="rlv__picker-count" role="status">
          {t('readingLists.view.library.showing', {
            shown: candidates.length,
            total: items.length,
          })}
        </p>
        {items.length === 0 ? (
          <p className="rlv__state">{t('readingLists.view.library.emptyLibrary')}</p>
        ) : candidates.length === 0 ? (
          <p className="rlv__state">
            {t('readingLists.view.library.noMatch', { query: pickFilter.trim() })}
          </p>
        ) : (
          <ul className="rlv__picker-list" aria-label={t('readingLists.view.library.listLabel')}>
            {candidates.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="rlv__picker-item ui-focusable"
                  disabled={onList.has(item.id)}
                  onClick={() => addFromLibrary(item)}
                >
                  <span className="rlv__picker-title">{item.title}</span>
                  {onList.has(item.id) ? (
                    <span className="rlv__picker-on">{t('readingLists.view.library.onList')}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="rlv__paste-actions">
          <Button size="sm" onClick={() => setPicking(false)}>
            {t('readingLists.view.pasteCancel')}
          </Button>
        </div>
      </div>
    );

    return (
      <div
        className="rlv"
        data-surface="reading-lists"
        data-mode="detail"
        data-density={density}
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
          {densityControl}
          <Button size="sm" onClick={() => setPasting((open) => !open)}>
            {t('readingLists.view.paste')}
          </Button>
          <Button size="sm" onClick={() => setPicking((open) => !open)}>
            {t('readingLists.view.library.add')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => summary && removeList(summary)}>
            {t('readingLists.view.deleteList')}
          </Button>
        </header>
        {notices}
        {picking ? libraryPicker : null}
        {libraryNote ? (
          <p className="rlv__notice" role="status">
            {t('readingLists.view.library.already', { title: libraryNote })}
          </p>
        ) : null}
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
            <label className="rlv__selectall">
              <input
                type="checkbox"
                checked={
                  visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.entry.id))
                }
                onChange={(event) => {
                  setMoveSkipped(0);
                  const next = new Set(selected);
                  for (const row of visibleRows) {
                    if (event.target.checked) next.add(row.entry.id);
                    else next.delete(row.entry.id);
                  }
                  setSelected(next);
                  setAnchor(null);
                }}
              />
              <span>{t('readingLists.view.bulk.selectAll')}</span>
            </label>
          </div>
        )}
        {selectedIds.length > 0 ? (
          <div className="rlv__bulk" role="group" aria-label={t('readingLists.view.bulk.label')}>
            <span className="rlv__bulk-count" role="status">
              {t('readingLists.view.bulk.count', { count: selectedIds.length })}
            </span>
            <Button size="sm" onClick={bulkFinish}>
              {t('readingLists.view.bulk.finish')}
            </Button>
            {otherLists.length > 0 ? (
              <Select
                className="rlv__bulk-move"
                aria-label={t('readingLists.view.bulk.moveLabel')}
                value=""
                onChange={(event) => bulkMove(event.target.value)}
                options={[
                  { value: '', label: t('readingLists.view.bulk.movePick') },
                  ...otherLists.map((candidate) => ({
                    value: candidate.id,
                    label: candidate.name,
                  })),
                ]}
              />
            ) : (
              <span className="rlv__bulk-note">{t('readingLists.view.bulk.moveNone')}</span>
            )}
            <Button size="sm" variant="danger" onClick={bulkRemove}>
              {t('readingLists.view.bulk.remove')}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              {t('readingLists.view.bulk.clear')}
            </Button>
          </div>
        ) : null}
        {moveSkipped > 0 ? (
          <p className="rlv__notice" role="status">
            {t('readingLists.view.bulk.skipped', { count: moveSkipped })}
          </p>
        ) : null}
        {rows.length === 0 ? (
          /**
           * §11.4: *Empty list → "paste a message or add from your library".
           * Never a bare "No items".*
           *
           * Both routes, and both are real controls in this block rather than
           * prose pointing at the header. The copy named only the paste route
           * for exactly as long as the library route did not exist.
           */
          <div className="rlv__empty" data-testid="rlv-empty-list">
            <p className="rlv__empty-lede">{t('readingLists.view.empty.list')}</p>
            <div className="rlv__paste-actions">
              <Button
                variant="primary"
                onClick={() => {
                  setPasting(true);
                }}
              >
                {t('readingLists.view.paste')}
              </Button>
              <Button
                onClick={() => {
                  setPicking(true);
                }}
              >
                {t('readingLists.view.library.add')}
              </Button>
            </div>
            {exampleHint}
          </div>
        ) : visibleRows.length === 0 ? (
          <p className="rlv__state">{t('readingLists.view.filterEmpty', { query: filter.trim() })}</p>
        ) : (
          <>
            {/* Discoverability. A drag handle is invisible to anyone not
                already dragging, and the keyboard half is invisible to
                everyone — so the surface says it, once, and only when there
                is more than one row to move. */}
            {visibleRows.length > 1 ? (
              <p className="rlv__hint">{t('readingLists.view.rowReorder')}</p>
            ) : null}
            <ul
              className="rlv__rows"
              aria-label={t('readingLists.view.rowsLabel', { name: list.name })}
            >
            {visibleRows.map((row) => {
              const suggested = row.suggestion ? row.work?.suggestion : undefined;
              return (
                <ReadingRow
                  key={row.entry.id}
                  entryId={row.entry.id}
                  state={row.entry.state}
                  title={row.title}
                  item={row.itemId ? itemsById.get(row.itemId) : undefined}
                  suggestedTitle={
                    suggested ? (itemsById.get(suggested.itemId)?.title ?? suggested.itemId) : null
                  }
                  selected={selected.has(row.entry.id)}
                  actions={rowActions}
                  t={t}
                  lang={lang}
                />
              );
            })}
            </ul>
          </>
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
    <div className="rlv" data-surface="reading-lists" data-mode="grid" data-density={density}>
      <header className="rlv__head">
        <h2 className="rlv__title">{t('readingLists.view.title')}</h2>
        <span className="rlv__spacer" />
        {densityControl}
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
        /**
         * §11.4: *No list yet → the paste box itself, with the §2.1 example
         * shown as a hint.* Not a sentence telling the user where the paste box
         * is; the paste box.
         */
        <form
          className="rlv__empty"
          data-testid="rlv-empty-grid"
          onSubmit={(event) => {
            event.preventDefault();
            createListWithPaste(draftName, pasteText);
          }}
        >
          <p className="rlv__empty-lede">{t('readingLists.view.empty.grid')}</p>
          <label className="rlv__paste-label" htmlFor="rlv-empty-name">
            {t('readingLists.view.empty.nameLabel')}
          </label>
          <input
            id="rlv-empty-name"
            className="rlv__new-field ui-focusable"
            value={draftName}
            placeholder={t('readingLists.view.newListPlaceholder')}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <label className="rlv__paste-label" htmlFor="rlv-empty-paste">
            {t('readingLists.view.pasteLabel')}
          </label>
          <textarea
            id="rlv-empty-paste"
            className="rlv__paste-field ui-focusable"
            rows={6}
            value={pasteText}
            placeholder={t('readingLists.view.pastePlaceholder')}
            onChange={(event) => setPasteText(event.target.value)}
          />
          <div className="rlv__paste-actions">
            {/*
              An explicit `onClick` rather than `type="submit"`, with the form's
              `onSubmit` kept for Enter inside the name field. Two named paths to
              one callback: implicit form submission from a button click is a
              behaviour jsdom does not perform, so a submit-only button makes the
              mouse path structurally untestable — the suite would pass on a
              button that does nothing.
            */}
            <Button
              variant="primary"
              disabled={!draftName.trim() || !pasteText.trim()}
              onClick={() => createListWithPaste(draftName, pasteText)}
            >
              {t('readingLists.view.empty.submit')}
            </Button>
            {/* Disabled buttons are the "why is nothing happening" state, so the
                reason is on screen rather than only in a tooltip. */}
            {!draftName.trim() || !pasteText.trim() ? (
              <span className="rlv__empty-why" role="status">
                {!draftName.trim()
                  ? t('readingLists.view.empty.needName')
                  : t('readingLists.view.empty.needText')}
              </span>
            ) : null}
          </div>
          {exampleHint}
        </form>
      ) : (
        // Named, because "list, 3 items" with no name is what a reader says
        // about an unlabelled <ul>, and this surface has three of them.
        <ul className="rlv__grid" aria-label={t('readingLists.view.title')}>
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
                {/*
                  DECORATIVE, and it used to claim `role="progressbar"` with
                  `aria-valuenow`. ARIA gives `button` presentational children,
                  so that role was stripped from the accessibility tree in every
                  browser — it announced nothing while making the source read as
                  covered. §11.4 asks for progress "announced as text rather
                  than colour alone", and the sentence directly above this bar
                  is that text, inside the same button, so it is already part of
                  the name the card is announced with.
                */}
                <span className="rlv__bar" aria-hidden="true">
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
