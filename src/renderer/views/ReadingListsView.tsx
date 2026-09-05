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
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LibraryItem } from '../../shared/types';
import Icon from '../components/Icons';
import { ReadingListPasteFlow } from '../components/reading/ReadingListPasteFlow';
import ReadingSmartLists from '../components/reading/ReadingSmartLists';
import ReadingTimeline from '../components/reading/ReadingTimeline';
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
import { stageReadingWorkspaceRouteForPopout } from '../readingWorkspaceNavigation';
import { READING_WORKSPACE_SCHEMA_VERSION } from '../../shared/readingWorkspace';
import { coverFallbackImage, coverUrlFor } from '../utils/coverArt';
import type {
  ReadingEntryState,
  ReadingListEntry,
  SmartListQuery,
} from '../../shared/readingLists';
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
  saveSmartReadingList,
  setReadingEntryState,
  setReadingEntryStates,
  undoReadingListMove,
  type MovedReadingEntry,
  type RemovedReadingEntry,
  type RemovedReadingList,
} from '../../shared/readingListMutations';
import {
  READING_ENTRY_STATES,
  nextUpReadingRow,
  readingListRows,
  readingWorksByAuthor,
  reorderEntryIds,
  sortReadingListSummaries,
  summarizeReadingLists,
  type ReadingListRow,
  type ReadingListSort,
  type ReadingListSummary,
} from '../../shared/readingListViews';
import {
  readingListExport,
  type ReadingListExportFormat,
} from '../../shared/readingListExport';
import { projectReadingListFinish } from '../../shared/readingListProjection';
import type { LevelTier } from '../../shared/levelScale';
import { effectiveLevelEstimate } from '../../shared/libraryLevel';
import { getUserLevel } from '../levelService';
import { LANG_TAGS } from '../../shared/i18n/core';
import './readingLists.css';

const STATE_KEYS: Record<ReadingEntryState, string> = {
  wanted: 'readingLists.entryState.wanted',
  owned: 'readingLists.entryState.owned',
  reading: 'readingLists.entryState.reading',
  finished: 'readingLists.entryState.finished',
  abandoned: 'readingLists.entryState.abandoned',
  skipped: 'readingLists.entryState.skipped',
};

/**
 * A projected day, in the UI language.
 *
 * `LANG_TAGS[lang]` and never a bare `toLocaleDateString()`: the bare call takes
 * the OS locale, so a Japanese UI on an English machine prints English dates.
 * The widget's finish dates already go through the same tag.
 */
function formatProjectionDay(at: number, lang: string): string {
  return new Date(at).toLocaleDateString(LANG_TAGS[lang as keyof typeof LANG_TAGS] ?? 'en');
}

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

/**
 * The drag payload `LibraryView` has always written. NOT a new contract — it is
 * set at four call sites there (`LibraryView.tsx` 1273, 1584, 1624, 1846) and
 * read back at 464 for filing into a folder. The reading-lists surface joins
 * that existing type rather than minting a second one for the same drag, which
 * is why dropping a book onto a list needs no change to the library at all.
 */
const LIBRARY_ITEM_MIME = 'app/lib-item';

/**
 * What counts as "a `.txt`" for §11.4's file drop. `.md` is included because a
 * pasted book list saved out of a chat app is as likely to be markdown, and the
 * parser (§2.3) already strips the bullet and heading marks either way.
 */
const TEXT_DROP_RE = /\.(txt|md)$/i;

/**
 * Whether a drag carries something this surface takes.
 *
 * Read off `types`, NOT `getData`: the HTML drag-and-drop model puts the data
 * store in *protected* mode for `dragover`, where `getData` returns `''` for
 * every type no matter what the drag holds. A guard written on `getData` would
 * therefore never cancel `dragover`, the browser would refuse every drop, and
 * the feature would be dead in the app while every jsdom test passed — jsdom
 * has no protected mode either.
 */
function dragTypeIncludes(transfer: DataTransfer | null | undefined, type: string): boolean {
  const types = transfer?.types;
  return types ? Array.from(types).includes(type) : false;
}

function dropTypesAccepted(transfer: DataTransfer | null | undefined): boolean {
  return dragTypeIncludes(transfer, LIBRARY_ITEM_MIME) || dragTypeIncludes(transfer, 'Files');
}

/**
 * Read a dropped file as text, or `null` if it cannot be read.
 *
 * `Blob.text()` is the whole implementation where it exists. `FileReader` is
 * the fallback, and it is not decoration: this runs in Electron's renderer AND
 * in jsdom, and a test that hands the handler a plain `{ name, text() }` stub
 * must reach the same branch as the real `File` does. A rejection is answered
 * with `null` rather than thrown, because the caller's whole job is to turn it
 * into a sentence on screen.
 */
async function readDroppedText(file: File): Promise<string | null> {
  try {
    if (typeof file.text === 'function') return await file.text();
  } catch {
    return null;
  }
  return await new Promise<string | null>((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    } catch {
      resolve(null);
    }
  });
}

/**
 * The cover a row draws, resolved to a plain CSS `background-image` value.
 *
 * A STRING, so the row's `memo` still compares by identity — and computed here
 * rather than in the row, because the row must never read `itemsById`. An
 * unbound row still gets a cover: `coverFallbackImage` derives one from the
 * title, which is what the list-card mosaic already does for the same reason,
 * so a `wanted` row is not a hole in the column.
 */
function rowCoverImage(item: LibraryItem | undefined, title: string): string {
  const url = coverUrlFor(item?.coverPath, item?.id);
  return url ? `url("${url}")` : coverFallbackImage(item?.title ?? title);
}

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
  /** §11.1's source-message chip: open the paste this row came out of. */
  showSource: (entryId: string) => void;
  /** §11.1's author link: this author's other works, across every list. */
  showAuthor: (author: string) => void;
  /** §11.1's cover: reveal the bound book in the library, rather than open it. */
  showInLibrary: (entryId: string) => void;
  /** Whether this host can reveal at all. `false` renders the cover inert. */
  canReveal: boolean;
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
  /**
   * Whether this row came out of a paste. A BOOLEAN rather than the source
   * object: the row only decides whether to draw the chip, and a fresh object
   * prop would break the memo §11.4's performance row depends on.
   */
  hasSource: boolean;
  /** §11.1's author link, already trimmed. `null` where the work has no author. */
  author: string | null;
  /** The cover to draw, already resolved to a URL or a fallback data image. */
  coverImage: string;
  selected: boolean;
  /**
   * §11.1 row 8's arrival mark. A primitive, so the memo still holds for the
   * 499 rows that did not move, and separate from `selected` because arriving
   * at a row is not the same as ticking it for a bulk action.
   */
  focused: boolean;
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

interface ReadingListReturnState {
  scrollTop: number;
  selected: string[];
  anchor: string | null;
}

/**
 * §11.1's *"Back works"* — where the list you left is remembered.
 *
 * MODULE-LEVEL on purpose. Opening a book navigates the app away and UNMOUNTS
 * this view, so component state is gone by the time the user comes back; a
 * `useRef` or a `useState` here would remember nothing across the only journey
 * the rule is about.
 *
 * NOT persisted, equally on purpose. A scroll offset is a session affordance,
 * not a setting: writing it to `localStorage` would add a key with no restore
 * point (trap 1) to remember where someone was three days ago, and restoring a
 * stale offset into a list that has since changed length is worse than starting
 * at the top.
 */
const READING_LIST_RETURN = new Map<string, ReadingListReturnState>();

/**
 * The two halves are written by different events at different times — the scroll
 * as it happens, the selection on the way out — so they merge rather than
 * replace. A plain `set` from either writer would erase the other's half.
 */
function rememberReturn(listId: string, patch: Partial<ReadingListReturnState>): void {
  const held = READING_LIST_RETURN.get(listId) ?? { scrollTop: 0, selected: [], anchor: null };
  READING_LIST_RETURN.set(listId, { ...held, ...patch });
}

/** The map is process-global, so a test that does not clear it leaks into the next. */
export function resetReadingListReturnForTesting(): void {
  READING_LIST_RETURN.clear();
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
  hasSource,
  author,
  coverImage,
  selected,
  focused,
  actions,
  t,
}: ReadingRowProps) {
  rowRenders += 1;
  return (
    <li
      className="rlv__row"
      data-state={state}
      /*
        §11.1 row 8's scroll target. An attribute rather than a ref map: the
        rows are `memo`'d and a ref callback per row would take a new identity
        on every render of the parent, which re-runs 500 detach/attach pairs
        for a one-row change — the exact cost `ReadingRowProps` was flattened
        to avoid.
      */
      data-entry-id={entryId}
      data-focused={focused ? 'true' : undefined}
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
      {/*
        §11.1's *"an entry's cover → the library item detail"*. A real button,
        not a decorated div, and a SEPARATE destination from the row itself —
        the cover reveals the book in the library, the title opens the reader.

        Drawn only where there IS a library item to reveal. An unbound row's
        cover is a fallback image with nothing behind it, and making it a
        button would be the card that swallows the click §11.1 forbids; there
        the same image is rendered inert.
      */}
      {item && actions.canReveal ? (
        <button
          type="button"
          className="rlv__row-cover ui-focusable"
          style={{ backgroundImage: coverImage }}
          aria-label={t('readingLists.view.coverReveal', { title })}
          onClick={() => actions.showInLibrary(entryId)}
        />
      ) : (
        <span
          className="rlv__row-cover"
          style={{ backgroundImage: coverImage }}
          aria-hidden="true"
        />
      )}
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
      {/*
        §11.1's author link. OUTSIDE the open button, not inside it: a button
        inside a button is invalid HTML, React logs it, and the browser's own
        fix-up moves it out of the button — where it would then no longer open
        the reader NOR the author, which is the dead control §11.1 forbids.
      */}
      {author !== null ? (
        <Button
          size="sm"
          variant="ghost"
          className="rlv__row-author"
          aria-label={t('readingLists.view.author.open', { author })}
          onClick={() => actions.showAuthor(author)}
        >
          {author}
        </Button>
      ) : null}
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
      {/*
        §11.1's source-message chip. Rendered only where there IS a source: a
        row typed by hand or added from the library came from no paste, and a
        chip that opens an empty message is the dead card §11.1 forbids.
      */}
      {hasSource ? (
        <Button
          size="sm"
          variant="ghost"
          className="rlv__row-source"
          aria-label={t('readingLists.view.source.open', { title })}
          onClick={() => actions.showSource(entryId)}
        >
          {t('readingLists.view.source.chip')}
        </Button>
      ) : null}
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
  /**
   * §11.1's *"an entry's cover → the library item detail"*.
   *
   * OPTIONAL, and the cover only becomes a button where it is supplied — a
   * required handler that some host cannot honour would be a control that is
   * present and does nothing, which is what §11.1's "no dead ends" forbids.
   * `ReadingWorkspaceView` supplies it; a widget rendering a list may not.
   */
  onShowInLibrary?: (item: LibraryItem) => void;
  /** Deep link. When the list is gone the view falls back to the grid. */
  initialListId?: string | null;
  /**
   * §11.1 row 8: the entry the deep link scrolls to and selects.
   *
   * Only meaningful with `initialListId`. An entry that is not on the open list
   * is ignored in silence rather than falling back to the top — a scroll that
   * lands somewhere arbitrary is worse than not scrolling.
   */
  initialEntryId?: string | null;
}

export default function ReadingListsView({
  onOpenBook,
  onFindWork,
  onShowInLibrary,
  initialListId = null,
  initialEntryId = null,
}: ReadingListsViewProps) {
  const { t, lang } = useT();
  // One subscription, shared with §11.2's widgets: four copies of a load effect
  // is four chances to disagree about what "not loaded yet" looks like.
  const { document, failure: loadFailure, health, adopt, reload } = useReadingListsDocument();
  const [writeFailure, setWriteFailure] = useState<string | null>(null);
  /**
   * P5 §8's receipt. What was copied and how much of it, or why it was not.
   *
   * Its own state rather than a reuse of `writeFailure`: that notice renders a
   * FIXED string (`readingLists.view.writeFailed`) and ignores the value it was
   * given, so an export failure routed through it would report a failed WRITE —
   * a different thing, about the document rather than the clipboard.
   */
  const [exported, setExported] = useState<{ message: string; failed: boolean } | null>(null);
  // Dismissal is per detected-at, not a bare boolean: a SECOND recovery, later in
  // the same session, is a new fact and has to be announced again.
  const [healthDismissedAt, setHealthDismissedAt] = useState<number | null>(null);
  const items = useLibraryItems();
  const [listId, setListId] = useState<string | null>(initialListId);
  /**
   * §11.1's last row — *"Middle-click / Ctrl-click opens in a pop-out wherever
   * the app already supports it"*.
   *
   * The app supports pop-outs for SECTIONS (`?popout=<section>`, one window per
   * section), not for individual books, so the gesture belongs to a list CARD
   * and opens the Reading section already routed to that list. Ctrl-clicking a
   * row would have to invent a per-book window, which is a second navigation
   * model §11.1 explicitly forbids.
   *
   * Falls back to opening in-window whenever the hand-off cannot be staged or
   * main refuses the window. A gesture that suppressed the normal open and then
   * failed silently would be exactly the dead end this row exists to remove.
   */
  const openListPoppedOut = useCallback((targetListId: string): void => {
    const staged = stageReadingWorkspaceRouteForPopout({
      version: READING_WORKSPACE_SCHEMA_VERSION,
      section: 'lists',
      intent: 'browse',
      listId: targetListId,
    });
    if (!staged) {
      setListId(targetListId);
      return;
    }
    const popOut = window.api?.popOut;
    if (typeof popOut !== 'function') {
      setListId(targetListId);
      return;
    }
    void Promise.resolve(popOut('reading'))
      .then((opened) => {
        // Explicitly `=== false`, not falsy. Main does not hot-reload, so a
        // renderer that has picked up this build can still be talking to a main
        // process that predates it and resolves `undefined` — and that older
        // main DID open the window. Treating `undefined` as a refusal would
        // pop the window out AND route in-window, which is worse than the dead
        // end this fallback exists to remove.
        if (opened === false) setListId(targetListId);
      })
      .catch(() => setListId(targetListId));
  }, []);
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
  /** §11.1: the entry whose source message is open, or `null`. */
  const [sourceFor, setSourceFor] = useState<string | null>(null);
  /** §11.1: the author whose other works are open, or `null`. */
  const [authorFor, setAuthorFor] = useState<string | null>(null);
  /**
   * Why the last drop did nothing, already translated. §11.4's honest-states
   * row: a drop that lands on the surface and produces no list, no row and no
   * word is indistinguishable from a drop the surface never received.
   */
  const [dropFailure, setDropFailure] = useState<string | null>(null);
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
  //
  // §11.1's "Back works" does NOT contradict this and must not be read as
  // undoing it: what is remembered is keyed BY LIST, so leaving A for B still
  // arrives at B with B's own state (usually none), and the bulk bar can never
  // hold a row from a list that is not on screen. The restore below runs after
  // this effect, deliberately — both queue in one commit and the later write
  // wins.
  useEffect(() => {
    setFilter('');
    setSelected(new Set());
    setAnchor(null);
    setMoveSkipped(0);
    setPicking(false);
    setPickFilter('');
    setLibraryNote(null);
  }, [listId]);

  /**
   * §11.1: *"Back works. Opening a book from a list and coming back returns to
   * the list at the same scroll position and selection."*
   *
   * `liveRef` is written during RENDER so the capture below can read the values
   * as of the last render of the list being left. Reading `selected` from the
   * effect's own closure would capture whatever the dependency array pinned,
   * and putting `selected` in the dependencies would re-run the capture on every
   * click instead of on the way out.
   */
  const liveRef = useRef({ selected, anchor });
  liveRef.current = { selected, anchor };
  const detailRef = useRef<HTMLDivElement | null>(null);
  const restoredForRef = useRef<string | null>(null);
  const selectionRestoredForRef = useRef<string | null>(null);

  /**
   * Capture the SELECTION on the way OUT — in a cleanup, not on every change.
   *
   * The cleanup for list A runs BEFORE the effect body for list B, and before
   * the clearing effect above has written its empty set, so `liveRef.current`
   * still holds A's selection here. Capturing continuously would store A's
   * selection under B's key on the render where `listId` changed and A's state
   * had not been cleared yet.
   *
   * The SCROLL is not captured here. It cannot be: `detailRef.current` is
   * already `null` by the time a passive cleanup runs on unmount, and on mount
   * the ref is null anyway because the first render is the loading state. It is
   * written by the container's own `onScroll` instead, as it happens.
   */
  useEffect(() => {
    if (!listId) return undefined;
    const leaving = listId;
    return () => {
      rememberReturn(leaving, {
        selected: [...liveRef.current.selected],
        anchor: liveRef.current.anchor,
      });
    };
  }, [listId]);

  /**
   * Restore the SELECTION, once per arrival.
   *
   * The `alive` filter is DEFENCE IN DEPTH and is knowingly unfalsifiable from a
   * test: a mutation that deletes it scores GREEN, because `selectedIds` below
   * already derives the actionable list through `rows`, and the select-all
   * checkbox reads `selected.has` over `visibleRows` — so no surface can show a
   * dead id whether it is filtered here or not. It is kept because restoring
   * ids into state that the state can never shed is the kind of thing that stops
   * being harmless the moment a new consumer reads `selected` directly. Do not
   * spend another run trying to make it fail.
   *
   * `document` IS a dependency, and the ref guard is what makes that safe: the
   * first render of a visit has no document at all (the store loads after
   * mount), so an effect keyed on `listId` alone runs exactly once, finds
   * nothing, and never gets a second chance. Without the guard it would instead
   * re-select on every store broadcast, and a user who deselected a row would
   * have it come back the next time anything anywhere wrote.
   */
  useEffect(() => {
    if (!listId) {
      selectionRestoredForRef.current = null;
      return;
    }
    if (selectionRestoredForRef.current === listId) return;
    const list = document?.lists.find((candidate) => candidate.id === listId);
    if (!list) return;
    selectionRestoredForRef.current = listId;
    const held = READING_LIST_RETURN.get(listId);
    if (!held || held.selected.length === 0) return;
    const alive = new Set(list.entries.map((entry) => entry.id));
    const kept = held.selected.filter((id) => alive.has(id));
    if (kept.length === 0) return;
    setSelected(new Set(kept));
    setAnchor(held.anchor && alive.has(held.anchor) ? held.anchor : null);
  }, [listId, document]);

  useEffect(() => {
    if (!listId) restoredForRef.current = null;
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

  /**
   * P5 §5.4's projected finish for the open list.
   *
   * `Date.now()` inside the memo, so the date does not drift between the two
   * renders of one visit, and NOT in the dependencies — a projection that
   * recomputed on every render would recompute on every keystroke in the filter.
   */
  const projection = useMemo(
    () => (document && listId ? projectReadingListFinish(document, listId, Date.now()) : null),
    [document, listId],
  );

  /**
   * P5 §5.3's "Next up" button, and §6's list-detail bullet of the same name.
   *
   * The two inputs the pure core needs, and neither is invented here: the tier
   * comes from `getUserLevel()`, the same reader the Reading Finder builds its
   * level band from, and the per-work level is `effectiveLevelEstimate` — the
   * one L1–L7 scale §7's `difficultyMax` already rides.
   *
   * `getUserLevel` reads storage and is guarded, because a throw here would
   * take the whole list detail down for a button. Falling back to `null` turns
   * the fit OFF and leaves list order, which is the shipped behaviour.
   */
  const targetLevel = useMemo<LevelTier | null>(() => {
    try {
      return getUserLevel();
    } catch {
      return null;
    }
  }, []);

  /**
   * Keyed by WORK, not by item: the core is given works and the two ids are not
   * interchangeable. A work bound to nothing, or to an item the library has not
   * loaded yet, is UNMEASURED rather than absent — §7's call, and the reason a
   * fresh import is not invisible for as long as enrichment takes.
   */
  const workLevels = useMemo(() => {
    const out = new Map<string, LevelTier | null>();
    for (const work of document?.works ?? []) {
      let level: LevelTier | null = null;
      for (const itemId of work.boundItemIds) {
        const item = itemsById.get(itemId);
        const found = item ? effectiveLevelEstimate(item) : null;
        if (found != null) {
          level = found;
          break;
        }
      }
      out.set(work.id, level);
    }
    return out;
  }, [document, itemsById]);

  const nextUp = useMemo(
    () =>
      list && document
        ? nextUpReadingRow(list, document.works, { levels: workLevels, targetLevel })
        : null,
    [list, document, workLevels, targetLevel],
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
   * §11.1 row 8's arrival. `focusEntryId` outlives the scroll so the row stays
   * marked — landing on a 200-row list with nothing highlighted is the same as
   * not having scrolled.
   *
   * NOT folded into `selected`: that set is what the bulk actions send, so
   * ticking a row on arrival would arm "Remove" against a book the user only
   * asked to see.
   */
  const [focusEntryId, setFocusEntryId] = useState<string | null>(initialEntryId);
  const rowsRef = useRef<HTMLUListElement | null>(null);
  const focusAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    focusAppliedRef.current = null;
    setFocusEntryId(initialEntryId);
  }, [initialEntryId]);

  useEffect(() => {
    if (!focusEntryId || focusAppliedRef.current === focusEntryId) return;
    // The entry must be on the OPEN list. A stale route names a row that is not
    // here, and scrolling to the top instead would claim to have found it.
    if (!rows.some((row) => row.entry.id === focusEntryId)) return;
    // The same trap §11.1 row 4's reveal hit: a filter left over from earlier
    // hides the row the route named, so the scroll finds no node and the deep
    // link reads as broken. Clear it and let the next render carry the scroll.
    if (!visibleRows.some((row) => row.entry.id === focusEntryId)) {
      setFilter('');
      return;
    }
    const node = Array.from(rowsRef.current?.children ?? []).find(
      (child) => child.getAttribute('data-entry-id') === focusEntryId,
    );
    if (!node) return;
    focusAppliedRef.current = focusEntryId;
    // jsdom implements no `scrollIntoView`; without the guard every test that
    // deep-links a row throws instead of asserting the landing.
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'center' });
    }
    // Move the keyboard to where the eye went. Arriving with focus still on the
    // body means the next Tab starts at the top of the page, not at the row.
    node.querySelector('button')?.focus();
  }, [focusEntryId, rows, visibleRows]);

  /**
   * §11.1's "Back works", scroll half. Once per arrival, and only once the rows
   * are actually there — the document loads after the first render, so applying
   * it any earlier writes a `scrollTop` onto a container that has nothing to
   * scroll and the browser silently clamps it to 0.
   *
   * A LAYOUT effect: on a plain effect the list paints at the top and then
   * jumps, which reads worse than not restoring at all.
   */
  useLayoutEffect(() => {
    if (!listId || rows.length === 0) return;
    if (restoredForRef.current === listId) return;
    restoredForRef.current = listId;
    // Row 8's arrival scrolls to a NAMED entry and outranks this: the caller
    // asked for a specific row, and a remembered offset would fight it.
    if (focusEntryId || !detailRef.current) return;
    // Written UNCONDITIONALLY, including the 0. Grid and detail are both a
    // `div.rlv`, so React reconciles them to the SAME host node and the browser
    // keeps its scroll offset across the switch — a list with nothing remembered
    // would otherwise open at wherever the PREVIOUS list was left. Measured:
    // A at 300 → grid → B opened at 300.
    detailRef.current.scrollTop = READING_LIST_RETURN.get(listId)?.scrollTop ?? 0;
  }, [listId, rows.length, focusEntryId]);

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

  /**
   * §11.1 rows 1–3, the whole "every row goes somewhere real" contract:
   *
   *   bound            → the reader, `onOpenBook` (the seam `App.tsx` threads;
   *                      a second navigation path would put the reader in a
   *                      different window than the library puts it in)
   *   bound, on the shelf → the reader AND `owned → reading`
   *   unbound (wanted) → the acquisition path, `onFindWork(title)`
   *
   * The promotion is the row §11.1 calls "bound, never started". It is written
   * only from `owned`: `wanted` cannot reach here with an item bound, and
   * `finished`, `abandoned` and `skipped` are all deliberate states a re-read
   * must not quietly overwrite — opening a book you abandoned to check one line
   * is not a decision to resume it.
   *
   * No undo toast, deliberately. A toast on every open would fire on the app's
   * single most common gesture, and the reversal is already one control away
   * and in view: the row's own state Select, which the promotion visibly moves.
   */
  const openRow = useCallback(
    (row: ReadingListRow) => {
      const item = row.itemId ? itemsById.get(row.itemId) : undefined;
      if (!item) {
        onFindWork(row.title);
        return;
      }
      if (list && row.entry.state === 'owned') {
        const targetList = list.id;
        void write((current) =>
          setReadingEntryState(
            current,
            targetList,
            row.entry.id,
            'reading',
            createReadingListsMutationContext(),
          ),
        );
      }
      onOpenBook(item);
    },
    [itemsById, list, onFindWork, onOpenBook, write],
  );

  /**
   * P5 §8. Renders the open list and puts it on the clipboard.
   *
   * The result is REPORTED, both ways. A copy that silently failed — no
   * clipboard permission, a host without the API — is indistinguishable from
   * one that worked until the user pastes into a chat and sends nothing, so
   * the failure has to say so where the user is looking.
   *
   * `lang` is the dependency rather than `t`, per the i18n rule: `t`'s identity
   * is stable by design, so depending on it goes silently stale after a switch.
   */
  const copyExport = useCallback(
    async (format: ReadingListExportFormat) => {
      if (!list || !document) return;
      const text = readingListExport(format, list, document.works);
      try {
        // Optional-chained: a host without the API returns undefined rather
        // than throwing, and awaiting undefined resolves — which would report a
        // copy that never happened. The explicit check is what makes it honest.
        const write = navigator.clipboard?.writeText;
        if (!write) throw new Error('no clipboard');
        await navigator.clipboard.writeText(text);
      } catch {
        setExported({ message: t('readingLists.view.export.failed'), failed: true });
        return;
      }
      setExported({
        message: t('readingLists.view.export.copied', { count: list.entries.length }),
        failed: false,
      });
    },
    // `lang`, deliberately, and NOT `t` — see the doc comment. No disable
    // comment: `react-hooks/exhaustive-deps` is not configured in this repo, so
    // one is itself a lint ERROR ("Definition for rule ... was not found").
    [list, document, lang],
  );

  const showSource = useCallback((entryId: string) => {
    setSourceFor((current) => (current === entryId ? null : entryId));
    setAuthorFor(null);
  }, []);

  const showInLibrary = useCallback(
    (row: ReadingListRow) => {
      const item = row.itemId ? itemsById.get(row.itemId) : undefined;
      if (item) onShowInLibrary?.(item);
    },
    [itemsById, onShowInLibrary],
  );

  const showAuthor = useCallback((author: string) => {
    // The two panels are mutually exclusive on purpose. Both explain the same
    // row, and stacking them pushes the row itself off screen.
    setAuthorFor((current) => (current === author ? null : author));
    setSourceFor(null);
  }, []);

  /**
   * §11.1: *"an author name → that author's other works, owned and wanted"*.
   *
   * Across the whole document — see `readingWorksByAuthor`. The rows the user is
   * already looking at are filtered out here rather than in the query, because
   * "other works" is a property of this SURFACE (you are looking at that list),
   * not of the data; the widgets in §11.2 will want the unfiltered answer.
   */
  const authorRows = useMemo(() => {
    if (!authorFor || !document) return null;
    const all = readingWorksByAuthor(document, authorFor);
    const here = new Set(list ? list.entries.map((entry) => entry.id) : []);
    return { author: authorFor, all, others: all.filter((row) => !here.has(row.entryId)) };
  }, [authorFor, document, list]);

  /**
   * §11.1's *"a source-message chip → the original paste, with the producing
   * line highlighted"*, resolved from data §1 has stored since P0: the entry
   * carries `sourceRef.importId` and `lineIndex`, and the list carries the
   * import with its whole `rawText`.
   *
   * `lineIndex` indexes the RAW text's lines, and the highlight is derived by
   * that index rather than by matching `rawLine` back against the text. Matching
   * would pick the wrong line in the ordinary case this feature exists for — a
   * message that lists the same title twice — and would silently highlight
   * nothing after §2.4's re-parse rewrites a line.
   */
  const sourceView = useMemo(() => {
    if (!sourceFor || !list) return null;
    const entry = list.entries.find((candidate) => candidate.id === sourceFor);
    const ref = entry?.sourceRef;
    if (!ref) return null;
    const found = list.imports.find((candidate) => candidate.id === ref.importId);
    const title = rows.find((row) => row.entry.id === sourceFor)?.title ?? '';
    // A paste whose import row is gone is a REAL state: §2.4's re-parse replaces
    // an import, and an entry can outlive the message that produced it. The raw
    // line survives on the entry, so the one line is still shown — with the
    // reason the rest is missing, rather than an empty panel.
    if (!found) {
      return { title, lines: [ref.rawLine], highlight: 0, partial: true, pastedAt: null };
    }
    return {
      title,
      lines: found.rawText.split('\n'),
      highlight: ref.lineIndex,
      partial: false,
      pastedAt: found.pastedAt,
    };
  }, [list, rows, sourceFor]);

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
  const addLibraryItemTo = useCallback(
    (targetListId: string, item: LibraryItem) => {
      const held: { entryId: string | null; duplicate: boolean } = {
        entryId: null,
        duplicate: false,
      };
      void write(
        (current) => {
          const mutation = addLibraryItemToReadingList(
            current,
            targetListId,
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
                      targetListId,
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
    [t, write],
  );

  const addFromLibrary = useCallback(
    (item: LibraryItem) => {
      if (!list) return;
      addLibraryItemTo(list.id, item);
    },
    [addLibraryItemTo, list],
  );

  /**
   * §11.4's "drop a library item onto a list". The payload is `app/lib-item`
   * and it is NOT a new contract — `LibraryView` has set exactly that type on
   * all four of its drag sources since long before this view existed, so the
   * gesture works across the two floating windows with no change to the library
   * at all. Reading a different type here would have been a second contract for
   * the same drag.
   *
   * Returns whether it consumed the drop, so the caller only calls
   * `preventDefault` for a payload it actually handled.
   */
  const dropLibraryItem = useCallback(
    (targetListId: string, transfer: DataTransfer | null | undefined): boolean => {
      const itemId = transfer?.getData?.(LIBRARY_ITEM_MIME);
      if (!itemId) return false;
      const item = items.find((candidate) => candidate.id === itemId);
      // An id with no item is a real state, not an impossible one: the library
      // is loaded independently and a drag can outlive a refresh. Silently
      // doing nothing is what §11.4's honest-states row forbids.
      if (!item) {
        setDropFailure(t('readingLists.view.drop.unknownItem'));
        return true;
      }
      setDropFailure(null);
      addLibraryItemTo(targetListId, item);
      return true;
    },
    [addLibraryItemTo, items, t],
  );

  /**
   * §11.4's "drop a `.txt` onto the lists view to import it". It lands in the
   * SAME preview §2.5 makes mandatory for a paste — a file is a paste that
   * arrived by a different door, and importing it unseen would be the one
   * intake path that skips the preview.
   */
  const dropTextFile = useCallback(
    (transfer: DataTransfer | null | undefined): boolean => {
      const files = Array.from(transfer?.files ?? []);
      if (files.length === 0) return false;
      const file = files.find((candidate) => TEXT_DROP_RE.test(candidate.name));
      if (!file) {
        setDropFailure(t('readingLists.view.drop.notText'));
        return true;
      }
      setDropFailure(null);
      // Captured at DROP time, not read after the await: the file read is async
      // and the user can navigate out of the list mid-read. The list they
      // dropped on is the list they meant.
      const droppedOnto = listId;
      void readDroppedText(file).then((text) => {
        if (text === null) {
          setDropFailure(t('readingLists.view.drop.unreadable'));
          return;
        }
        if (!text.trim()) {
          setDropFailure(t('readingLists.view.drop.empty'));
          return;
        }
        if (droppedOnto) {
          setListId(droppedOnto);
          setPreviewText(text);
          return;
        }
        // In the grid there is no list to import INTO, so the file names one.
        // A dropped file that silently created "Untitled" would lose the only
        // name the gesture actually carried.
        createListWithPaste(file.name.replace(TEXT_DROP_RE, ''), text);
      });
      return true;
    },
    [createListWithPaste, listId, t],
  );

  /**
   * §11.4's "drag an entry between lists". One entry, one write, one undo — the
   * same `moveReadingListEntries` the bulk bar uses, because a second move path
   * would be a second place for the skip rule to disagree with itself.
   */
  const moveEntryToList = useCallback(
    (entryId: string, toListId: string) => {
      if (!list || !toListId || toListId === list.id) return;
      const fromList = list.id;
      const name = document?.lists.find((candidate) => candidate.id === toListId)?.name ?? toListId;
      const held: { moved: MovedReadingEntry[] } = { moved: [] };
      void write(
        (current) => {
          const mutation = moveReadingListEntries(
            current,
            fromList,
            toListId,
            [entryId],
            createReadingListsMutationContext(),
          );
          held.moved = mutation.moved;
          return mutation;
        },
        () => {
          const captured = held.moved;
          if (!captured.length) return null;
          return {
            message: t('readingLists.view.undo.movedOne', { name }),
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
      );
      // The moved row is gone from this list, so a selection that still names it
      // would leave the bulk bar counting a row nothing can act on.
      setSelected((current) => {
        if (!current.has(entryId)) return current;
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
    },
    [document, list, t, write],
  );

  /** P5 §7: keep the open question as a `smart` list. */
  const saveSmartQuery = useCallback(
    (name: string, query: SmartListQuery) => {
      void write((current) =>
        saveSmartReadingList(current, { name, query }, createReadingListsMutationContext()),
      );
    },
    [write],
  );

  /**
   * Removing a saved question, with the same undo every other destructive
   * action here carries (§11.4). It reuses `deleteReadingList`/`restoreReadingList`
   * rather than a smart-specific pair: a smart list IS a list, and a second
   * delete path would be a second answer to what deleting one means.
   */
  const removeSmartQuery = useCallback(
    (targetId: string, name: string) => {
      const held: { removed: RemovedReadingList | null; index: number } = {
        removed: null,
        index: 0,
      };
      void write(
        (current) => {
          held.index = current.lists.findIndex((candidate) => candidate.id === targetId);
          const mutation = deleteReadingList(current, targetId, createReadingListsMutationContext());
          held.removed = mutation.removed;
          return mutation;
        },
        () => {
          const captured = held.removed;
          const at = held.index;
          if (!captured) return null;
          return {
            message: t('readingLists.smart.removed', { name }),
            run: () => {
              void write((current) =>
                restoreReadingList(current, captured, at, createReadingListsMutationContext()),
              );
            },
          };
        },
      );
    },
    [t, write],
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
    showSource,
    showAuthor,
    showInLibrary,
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
    showSource,
    showAuthor,
    showInLibrary,
  };

  /**
   * The dragged row, in a ref rather than in state: nothing about the drag is
   * rendered mid-gesture, and putting it in state would re-render every row on
   * `dragstart` — the exact cost §11.4's performance row forbids.
   */
  const dragging = useRef<string | null>(null);

  /**
   * Whether a row drag is in flight, in STATE rather than in the ref above,
   * because §11.4's "drag an entry between lists" needs a destination that only
   * exists while the gesture does — a rail of the other lists, rendered on
   * `dragstart` and gone on `dragend`.
   *
   * This does NOT cost the performance row. `ReadingRow` is `memo` on
   * primitives plus three identity-stable props, so a re-render of the view
   * that changes none of them re-renders zero rows; the test asserts that
   * number rather than reasoning about it.
   */
  const [dragActive, setDragActive] = useState(false);
  /** The list a cross-list drop is hovering, so it can say so before the drop. */
  const [dragOverList, setDragOverList] = useState<string | null>(null);

  /**
   * Built ONCE, deliberately — this is the prop that would otherwise change on
   * every keystroke in the filter field and re-render all 500 rows with it.
   */
  const canReveal = Boolean(onShowInLibrary);
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
      showSource: (entryId) => live.current.showSource(entryId),
      showAuthor: (author) => live.current.showAuthor(author),
      showInLibrary: (entryId) => {
        const row = find(entryId);
        if (row) live.current.showInLibrary(row);
      },
      canReveal,
      pick: (entryId, range) => live.current.toggleSelected(entryId, range),
      reorder: (entryId, targetEntryId) => {
        if (entryId !== targetEntryId) live.current.reorderRows(entryId, targetEntryId);
      },
      step: (entryId, delta) => live.current.stepRow(entryId, delta),
      dragStart: (entryId) => {
        dragging.current = entryId;
        setDragActive(true);
      },
      dragEnd: () => {
        dragging.current = null;
        setDragActive(false);
        setDragOverList(null);
      },
      dragged: () => dragging.current,
    };
    // `canReveal` is a BOOLEAN in the dependency list, never the handler itself.
    // `onShowInLibrary`'s identity changes on every render of whatever mounts
    // this view, so depending on it would rebuild `actions` each time and
    // repaint all 500 rows — the exact cost §11.4's performance row forbids.
    // Whether a host can reveal at all changes at most once.
  }, [canReveal]);

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
        /*
          Boss audit 2026-09-05 attempt 4, Finding 8: measured 103x26 live, under
          the 32px pointer floor. `.lq-hit` rather than growing the control or
          editing `size="sm"` — the shared size is used app-wide and this is one
          button. The expander is an `::after` with `max(100%, var(--lq-hit-target))`,
          so the RENDERED rect stays 26px and only the pointer target grows;
          `theme/liquid-controls.css` documents that contract.
        */
        className="lq-hit"
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
      {exported ? (
        <div
          className={`rlv__notice rlv__notice--${exported.failed ? 'error' : 'undo'}`}
          role="status"
          data-testid="rlv-export-note"
        >
          <span>{exported.message}</span>
          <Button size="sm" variant="ghost" onClick={() => setExported(null)}>
            {t('readingLists.view.drop.dismiss')}
          </Button>
        </div>
      ) : null}
      {dropFailure ? (
        <div className="rlv__notice rlv__notice--warn" role="status" data-testid="rlv-drop-note">
          <span>{dropFailure}</span>
          <Button size="sm" variant="ghost" onClick={() => setDropFailure(null)}>
            {t('readingLists.view.drop.dismiss')}
          </Button>
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
        ref={detailRef}
        className="rlv"
        data-surface="reading-lists"
        data-mode="detail"
        data-density={density}
        /*
          §11.1's "Back works", scroll half — recorded AS IT HAPPENS rather than
          on the way out. By the time a passive cleanup runs on unmount React has
          already detached `detailRef`, so there is nothing left to read; and on
          the way in the ref is null too, because the first render of a visit is
          the loading state. A write per scroll event into a module Map is the
          cheapest thing here by a wide margin — no state, no re-render.
        */
        onScroll={(event) => rememberReturn(list.id, { scrollTop: event.currentTarget.scrollTop })}
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
        /**
         * §11.4's two INBOUND drops, both on the surface rather than on a
         * bullseye: a library book dropped anywhere on an open list joins it,
         * and a `.txt` dropped anywhere on it opens the §2.5 preview.
         *
         * The dragover guard reads `types`, never `getData` — `getData` is
         * specified to return the empty string during a drag for everything but
         * the drop event itself, so a guard written on it accepts nothing and
         * the whole feature reads as dead.
         */
        onDragOver={(event) => {
          if (dropTypesAccepted(event.dataTransfer)) event.preventDefault();
        }}
        onDrop={(event) => {
          if (dropLibraryItem(list.id, event.dataTransfer) || dropTextFile(event.dataTransfer)) {
            event.preventDefault();
          }
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
          {/*
            P5 §5.4. Rendered only where there is an honest answer — no reading
            behind it means no date, and the alternative is a line reading
            "finishes never". `provisional` is shown as its own sentence rather
            than as a footnote on the date: §5.4's whole risk is that a
            confident date off two finishes reads exactly like one off forty.
          */}
          {projection?.finishesAt && projection.remaining > 0 ? (
            <span className="rlv__projection" data-provisional={projection.provisional}>
              {t(
                projection.provisional
                  ? 'readingLists.view.projection.rough'
                  : 'readingLists.view.projection.at',
                { date: formatProjectionDay(projection.finishesAt, lang) },
              )}
            </span>
          ) : null}
          {/*
            P5 §5.3 / §6: *"'Next up' button"*. It routes through `openRow`, the
            SAME handler a row click uses, so the queue inherits §11.1's whole
            contract for free — bound goes to the reader, `owned` is promoted to
            `reading`, and an unbound `wanted` entry lands on acquisition rather
            than swallowing the click. A second navigation path here would be a
            second answer to "where does a book open".

            The title is IN the label rather than a bare "Next up": a button
            that opens a reader without saying which book is a button the user
            has to press to find out what it does.
          */}
          {nextUp ? (
            <Button
              size="sm"
              className="rlv__nextup"
              leftIcon={<Icon name="bookmark" />}
              onClick={() => openRow(nextUp)}
            >
              {t('readingLists.view.nextUp', { title: nextUp.title })}
            </Button>
          ) : null}
          <span className="rlv__spacer" />
          {densityControl}
          <Button size="sm" onClick={() => setPasting((open) => !open)}>
            {t('readingLists.view.paste')}
          </Button>
          <Button size="sm" onClick={() => setPicking((open) => !open)}>
            {t('readingLists.view.library.add')}
          </Button>
          {/*
            P5 §8. The clipboard and NOT a file dialog: §8's first bullet is
            "pasteable straight back into LINE, Discord, or a forum", which is a
            paste, and a native save dialog is a modal no automated check can
            drive and one more thing to cancel out of. A file save can be added
            later beside this without moving the format code, which is pure.
          */}
          <label className="rlv__export">
            <span className="rlv__export-label">{t('readingLists.view.export.label')}</span>
            <select
              className="rlv__export-select ui-focusable"
              aria-label={t('readingLists.view.export.label')}
              value=""
              onChange={(event) => {
                const format = event.target.value;
                event.target.value = '';
                if (format) void copyExport(format as ReadingListExportFormat);
              }}
            >
              <option value="">{t('readingLists.view.export.pick')}</option>
              <option value="message">{t('readingLists.view.export.message')}</option>
              <option value="markdown">{t('readingLists.view.export.markdown')}</option>
              <option value="csv">{t('readingLists.view.export.csv')}</option>
            </select>
          </label>
          <Button size="sm" variant="danger" onClick={() => summary && removeList(summary)}>
            {t('readingLists.view.deleteList')}
          </Button>
        </header>
        {notices}
        {/*
          §11.1's source-message chip lands HERE rather than in a modal: the
          whole point of the row is "which line of which message produced this",
          and a dialog that covers the list hides the very row being explained.
        */}
        {sourceView ? (
          <section
            className="rlv__source"
            aria-label={t('readingLists.view.source.title', { title: sourceView.title })}
            data-testid="rlv-source"
          >
            <header className="rlv__source-head">
              <h3 className="rlv__source-title">
                {t('readingLists.view.source.title', { title: sourceView.title })}
              </h3>
              {sourceView.pastedAt !== null ? (
                <span className="rlv__source-when">
                  {t('readingLists.view.source.pastedAt', {
                    when: new Date(sourceView.pastedAt).toLocaleDateString(lang),
                  })}
                </span>
              ) : null}
              <span className="rlv__spacer" />
              <Button size="sm" onClick={() => setSourceFor(null)}>
                {t('readingLists.view.source.close')}
              </Button>
            </header>
            {sourceView.partial ? (
              <p className="rlv__source-partial" role="status">
                {t('readingLists.view.source.partial')}
              </p>
            ) : null}
            <ol className="rlv__source-lines">
              {sourceView.lines.map((line, index) => (
                <li
                  // The index IS the identity here — these are the lines of one
                  // immutable pasted message, and two identical lines are the
                  // case this panel exists to tell apart.
                  key={index}
                  className="rlv__source-line"
                  data-produced={index === sourceView.highlight}
                >
                  {/* The empty line still needs a box, or the numbering that
                      makes `lineIndex` legible skips and stops matching. */}
                  <span className="rlv__source-text">{line || ' '}</span>
                  {index === sourceView.highlight ? (
                    <span className="rlv__source-mark">
                      {t('readingLists.view.source.thisLine')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {authorRows ? (
          <section
            className="rlv__author"
            aria-label={t('readingLists.view.author.title', { author: authorRows.author })}
            data-testid="rlv-author"
          >
            <header className="rlv__source-head">
              <h3 className="rlv__source-title">
                {t('readingLists.view.author.title', { author: authorRows.author })}
              </h3>
              <span className="rlv__spacer" />
              <Button size="sm" onClick={() => setAuthorFor(null)}>
                {t('readingLists.view.source.close')}
              </Button>
            </header>
            {authorRows.others.length === 0 ? (
              /**
               * A real empty state, not a blank panel. It names WHICH author and
               * says the one thing the user needs — that this is the only one on
               * their lists — rather than reading as a link that failed.
               */
              <p className="rlv__source-when" role="status">
                {t('readingLists.view.author.onlyOne', { author: authorRows.author })}
              </p>
            ) : (
              <ul
                className="rlv__author-list"
                aria-label={t('readingLists.view.author.title', { author: authorRows.author })}
              >
                {authorRows.others.map((row) => (
                  <li key={row.entryId} className="rlv__author-row">
                    {/*
                      §11.1's "no dead ends" applied to this panel too: the row
                      opens the reader when there is a file and goes to the
                      acquisition path when there is not — the same two
                      destinations, through the same two callbacks, as a list row.
                    */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rlv__author-open ui-focusable"
                      onClick={() => {
                        const found = row.itemId ? itemsById.get(row.itemId) : undefined;
                        if (found) onOpenBook(found);
                        else onFindWork(row.title);
                      }}
                    >
                      <span className="rlv__author-title">{row.title}</span>
                      <span className="rlv__author-where">
                        {row.itemId
                          ? t('readingLists.view.rowOpen')
                          : t('readingLists.view.rowFind')}
                      </span>
                    </Button>
                    <span className="rlv__author-state">{t(STATE_KEYS[row.state])}</span>
                    {/* Which list, because that is the fact that tells the user
                        where to go next, and it is why one work on two lists
                        stays two rows here. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rlv__author-list-link"
                      aria-label={t('readingLists.view.author.goList', { name: row.listName })}
                      onClick={() => {
                        setAuthorFor(null);
                        setListId(row.listId);
                      }}
                    >
                      {row.listName}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
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
        {/*
          §11.4's "drag an entry between lists". The destination has to EXIST
          while the gesture does, and in a single-list view the other lists are
          off screen — so they appear as a rail for the length of the drag and
          are gone the moment it ends.

          Mounted only while dragging, deliberately: a rail that is always there
          is a permanent strip of dead targets, and the same move already has a
          resting-state control (the bulk bar's move Select) for anyone who is
          not dragging. This is the gesture, not the only route.
        */}
        {dragActive && otherLists.length > 0 ? (
          <div
            className="rlv__droprail"
            role="group"
            aria-label={t('readingLists.view.moveRail.label')}
            data-testid="rlv-droprail"
          >
            <span className="rlv__droprail-lede">{t('readingLists.view.moveRail.lede')}</span>
            {otherLists.map((candidate) => (
              <div
                key={candidate.id}
                className="rlv__droprail-target"
                data-list-id={candidate.id}
                data-over={dragOverList === candidate.id}
                onDragOver={(event) => {
                  if (!rowActions.dragged()) return;
                  event.preventDefault();
                  if (dragOverList !== candidate.id) setDragOverList(candidate.id);
                }}
                onDragLeave={() => {
                  setDragOverList((current) => (current === candidate.id ? null : current));
                }}
                onDrop={(event) => {
                  const moved = rowActions.dragged();
                  if (!moved) return;
                  event.preventDefault();
                  moveEntryToList(moved, candidate.id);
                  rowActions.dragEnd();
                }}
              >
                {candidate.name}
              </div>
            ))}
          </div>
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
              ref={rowsRef}
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
                  hasSource={Boolean(row.entry.sourceRef)}
                  author={row.work?.authorRaw?.trim() || null}
                  coverImage={rowCoverImage(
                    row.itemId ? itemsById.get(row.itemId) : undefined,
                    row.title,
                  )}
                  selected={selected.has(row.entry.id)}
                  focused={focusEntryId === row.entry.id}
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
        {/*
          P5 §5.12's per-list half — *"Finishes on a calendar, PER LIST"*. Below
          the rows, because the rows are what the user came for and a year grid
          above them would push the list itself off the first screen.
        */}
        <ReadingTimeline
          document={document}
          items={items}
          listId={list.id}
          onOpenBook={onOpenBook}
          onFindWork={onFindWork}
        />
      </div>
    );
  }

  return (
    <div
      className="rlv"
      data-surface="reading-lists"
      data-mode="grid"
      data-density={density}
      /*
        §11.4's file drop, grid half. There is no open list here, so the file
        NAMES the list it creates — see `dropTextFile`. A library item dropped
        on the empty background is deliberately NOT accepted: there is no list
        it could mean, and inventing one would be a guess. It is accepted on a
        card, below, where it means exactly one thing.
      */
      onDragOver={(event) => {
        if (dropTypesAccepted(event.dataTransfer)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (dropTextFile(event.dataTransfer)) event.preventDefault();
      }}
    >
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
            <li
              key={summary.listId}
              className="rlv__card"
              data-archived={summary.archived}
              data-list-id={summary.listId}
              data-over={dragOverList === summary.listId}
              /*
                §11.4's "drop a library item onto a list", literal half: the
                card IS the list, so a book dropped on it joins that list.
                A `.txt` dropped on a card falls through to the root handler
                above and creates a NEW list — a card is a destination for a
                book, not for a message that describes a whole list.
              */
              onDragOver={(event) => {
                if (!dragTypeIncludes(event.dataTransfer, LIBRARY_ITEM_MIME)) return;
                event.preventDefault();
                if (dragOverList !== summary.listId) setDragOverList(summary.listId);
              }}
              onDragLeave={() => {
                setDragOverList((current) => (current === summary.listId ? null : current));
              }}
              onDrop={(event) => {
                if (!dropLibraryItem(summary.listId, event.dataTransfer)) return;
                event.preventDefault();
                event.stopPropagation();
                setDragOverList(null);
              }}
            >
              <button
                type="button"
                className="rlv__card-open ui-focusable"
                onClick={(event) => {
                  // `metaKey` as well as `ctrlKey`: this shell runs on macOS
                  // too, where Cmd-click is the same gesture.
                  if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    openListPoppedOut(summary.listId);
                    return;
                  }
                  setListId(summary.listId);
                }}
                /*
                  Middle-click does not raise `click` on a button in Chromium —
                  only `auxclick`. Handling it here rather than in `onClick` is
                  why the middle half of this row works at all.
                */
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  openListPoppedOut(summary.listId);
                }}
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
      {/*
        P5 §7. Below the grid because it ANSWERS questions about what is already
        in the lists — a panel offering "Abandoned" above a user's own lists
        would be the app leading with a judgement. It renders nothing at all
        until there is at least one work to ask about.
      */}
      <ReadingSmartLists
        document={document}
        items={items}
        onOpenBook={onOpenBook}
        onFindWork={onFindWork}
        onSaveQuery={saveSmartQuery}
        onRemoveSaved={removeSmartQuery}
      />
      {/*
        P5 §5.12, unscoped on the grid: this is the "what did I read this year"
        half. The per-list half is the same component with `listId` set, on the
        detail below — one implementation, so the two can never disagree about
        what counts as a finish.
      */}
      <ReadingTimeline
        document={document}
        items={items}
        onOpenBook={onOpenBook}
        onFindWork={onFindWork}
      />
    </div>
  );
}
