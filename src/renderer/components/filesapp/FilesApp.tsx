/**
 * The Files app — the surface.
 *
 * Built on `LiquidAppScaffold` from the first line rather than retrofitted:
 * this is a NEW surface, and the plan is explicit that building it in the old
 * language and converting it later is twice the work. The five slots map onto
 * the Explorer shape the plan asks for without inventing new geometry —
 *
 *   rail      the derived category tree, with a live count per node
 *   toolbar   search, sort column, sort direction, refresh
 *   canvas    the item list (the only slot that is not chrome)
 *   inspector the selected item's details and its actions
 *   dock      the status bar: item count and total size
 *
 * Three behaviours the plan pins and this component must not soften:
 *
 * 1. **A count of 0 is shown, not hidden.** An empty category stays in the tree
 *    reading 0. Gate 1 is "a category reading 0 while items exist is a
 *    FINDING", and a tree that drops its empty nodes cannot be checked for it.
 * 2. **Reveal is offered only where it can work.** A dictionary is a SQLite
 *    row; it has no folder. The action is absent for it rather than present and
 *    failing (gate 12), and the inspector says why in words.
 * 3. **Scope is a filter, not a mode.** Selecting a category narrows the list;
 *    the root node clears it. Same window either way (gate 5's shape).
 */
import {
  Fragment,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { summarizeFolder } from './folderSummary';
import { formatDate, formatSize } from './format';
import { LiquidAppScaffold } from '../liquid/LiquidAppScaffold';
import VirtualList from '../VirtualList';
import {
  FILES_SORT_COLUMNS,
  FILES_TREE,
  categoryContains,
  categoryNode,
  countByCategory,
  deleteModeFor,
  isFilesPanelCategory,
  isMachineDerived,
  matchesQuery,
  revealTargetFor,
  sortItems,
  type FilesCategoryId,
  type FilesItem,
  type FilesSortColumn,
} from '../../../shared/filesApp/catalog';
import { FILES_MINE_MAX_CARDS, mineabilityOf } from '../../../shared/filesApp/mining';
import { filesReachability } from '../../../shared/filesApp/routeParity';
import { unindexedNotebookStreams } from '../../../shared/filesApp/notebookAbsorption';

/**
 * Computed once at module scope: the table is a frozen constant, so recomputing
 * it per render would be work with no possible different answer.
 */
const UNINDEXED_STREAMS = unindexedNotebookStreams();
// The mine chain moved out of this file for gate 10: the Flashcards Mining
// surface hosts the same catalogue, and two copies of the walk would drift.
import { mineFilesItem, type MineState, type SettledMineState } from './filesMineChain';
import {
  filesOpenDecision,
  isRoutableLocation,
  openFor,
  type FilesOpenDecision,
} from '../../../shared/filesApp/openPlan';
import {
  addToCollection,
  ancestorsOf,
  childrenOf,
  createCollection,
  deleteCollection,
  nestCollection,
  removeFromCollection,
  renameCollection,
  resolveCollection,
  type FilesCollection,
  type FilesCollectionsDoc,
} from '../../../shared/filesApp/collections';
import {
  commitCollections,
  loadCollectionsDoc,
  newCollectionId,
  onCollectionsChanged,
} from '../../filesCollectionsStore';
import {
  favoriteKey,
  isPinned,
  resolveFavorites,
  toggleFilesFavorite,
  type FilesFavoritesDoc,
  type FilesFavoriteTarget,
} from '../../../shared/filesApp/favorites';
import {
  commitFavorites,
  loadFavoritesDoc,
  onFavoritesChanged,
} from '../../filesFavoritesStore';
import {
  allSmartFolders,
  criteriaAreNarrowing,
  deleteSmartFolder,
  isPresetSmartFolder,
  saveSmartFolder,
  smartFolderById,
  smartFolderCount,
  smartFolderMembers,
  type FilesSmartCriteria,
  type FilesSmartFolder,
  type FilesSmartFoldersDoc,
} from '../../../shared/filesApp/smartFolders';
import {
  commitSmartFolders,
  loadSmartFoldersDoc,
  newSmartFolderId,
  onSmartFoldersChanged,
} from '../../filesSmartFoldersStore';
import {
  FILES_VIEW_MODES,
  folderView,
  folderViewKey,
  setFolderView,
  type FilesFolderView,
  type FilesViewMode,
  type FilesViewStateDoc,
} from '../../../shared/filesApp/viewState';
import {
  commitViewState,
  loadViewStateDoc,
  onViewStateChanged,
} from '../../filesViewStateStore';
import { targetLabelKey, type DropCandidate } from '../../../shared/fileRouting';
import { openSectionSurface } from '../../sectionSurface';
import { removeDeckCards } from '../../flashcardDeck';
import {
  FILES_SCOPE_EVENT,
  clearPendingFilesScope,
  peekPendingFilesScope,
  type FilesScopeRequest,
} from './filesAppScope';
import { useFilesIndex } from './useFilesIndex';
import { ScanReviewSheet } from './ScanReviewSheet';
import { CleanupSheet } from './CleanupSheet';
import { useFilesWatch } from './useFilesWatch';
import { FilesDeletionControls, FilesDeletionReceipt } from './FilesDeletionControls';
import {
  FILES_SOFT_DELETE_EVENT,
  createWindowFilesDeletionSession,
  type FilesDeletionNotice,
} from './filesDeletionSession';
import './filesApp.css';

/**
 * Gate 8's two panels, loaded on demand — and the `lazy` is load-bearing, not
 * an optimisation.
 *
 * `FilesStatisticsPanel` imports `StatsContent`, which reaches `ankiSync`, and
 * `ankiSync` calls `window.api.onAnkiIntervalsChanged(...)` AT MODULE SCOPE. A
 * static import therefore runs that line the moment anything touches this file
 * — including `filesApp.test.tsx`, which mounts the list with no preload
 * bridge and died on it. `studyLedgerHarness.tsx` documents the same hazard and
 * takes the same way out. The panels are also two screens most sessions never
 * open, so the file list no longer carries their readers in its chunk.
 */
const FilesMemoryPanel = lazy(() =>
  import('./panels/FilesMemoryPanel').then((m) => ({ default: m.FilesMemoryPanel })),
);
const FilesStatisticsPanel = lazy(() =>
  import('./panels/FilesStatisticsPanel').then((m) => ({ default: m.FilesStatisticsPanel })),
);

const ROW_HEIGHT = 32;

/**
 * Gate 22's two presentations, as data rather than as CSS.
 *
 * `compact` genuinely drops the three columns rather than hiding them with
 * `display:none`: a hidden `gridcell` is still announced by some assistive
 * technology and still costs a `formatSize`/`formatDate` call per visible row,
 * so a "view mode" that only styles would be a mode in name. The row height
 * changes with it because `VirtualList` windows on a fixed `itemHeight` — a
 * shorter row that the windowing does not know about scrolls wrong.
 */
const COMPACT_ROW_HEIGHT = 24;
const DETAILS_COLUMNS = ['name', 'kind', 'provenance', 'size', 'modified'] as const;
const COMPACT_COLUMNS = ['name', 'kind'] as const;

function columnsFor(mode: FilesViewMode): readonly FilesSortColumn[] {
  return mode === 'compact' ? COMPACT_COLUMNS : DETAILS_COLUMNS;
}

/**
 * Gate 16's drag payload.
 *
 * A private MIME type, not `text/plain`, for a measured reason: `DropRouter`
 * (`DropRouter.tsx:231`) admits a drag only when `dataTransfer.types` includes
 * `'Files'`, so an internal row drag never reaches the file importer — but a
 * `text/plain` payload would still be droppable on every text field in the app.
 * A named type means only the folders answer it.
 */
const FILES_DRAG_ITEM_TYPE = 'application/x-jp-files-item';


/**
 * Which folder the rail's own controls act on.
 *
 * Gate 17 is the reason this is one union rather than two independent pieces of
 * state: the rename/delete controls have to be REACHABLE on a derived folder in
 * order to refuse on it. A control that is hidden cannot say why it is not
 * there, and the gate's words are "refused with a named message; it does not
 * silently no-op".
 */
type FolderSelection =
  | { kind: 'root' }
  | { kind: 'derived'; id: FilesCategoryId }
  | { kind: 'collection'; id: string };

/** A refusal or a receipt from a folder action, always a key and never a literal. */
interface FolderNotice {
  key: string;
  values?: Record<string, string | number>;
  tone: 'ok' | 'error';
}

interface BulkMineResult {
  itemId: string;
  name: string;
  result: SettledMineState;
}

type BulkMineState =
  | { status: 'idle' }
  | { status: 'running'; completed: number; total: number }
  | { status: 'done'; results: BulkMineResult[] }
  | { status: 'undone'; count: number; results: BulkMineResult[] };

export interface FilesAppProps {
  /**
   * Context entry: the category the caller came from. A filter, never a mode —
   * the tree's root clears it and the same window shows everything.
   */
  initialScope?: FilesCategoryId | null;
  /** Highlight this item on open, when the caller knows which one it means. */
  initialFocusItemId?: string | null;
}

export function FilesApp({ initialScope = null, initialFocusItemId = null }: FilesAppProps) {
  const { t, lang } = useT();
  const { state, refresh, refreshing } = useFilesIndex();
  /*
   * Gate 25. The watcher runs in main whether or not this window is open; what
   * lives here is the half the gate scores — the list refreshing on its own,
   * and a line saying what landed. It sits in the app rather than in the scan
   * sheet because the sheet is modal, and a folder that only reports arrivals
   * while a dialog happens to be open is not being watched.
   */
  const watch = useFilesWatch(refresh);

  /**
   * Gate 5's entry. An explicit prop wins — a caller that mounted this
   * component with a scope means it — and otherwise the scope a `openFilesApp*`
   * gesture parked on its way here applies.
   *
   * `peekPendingFilesScope` is PURE, which is what makes it safe in a lazy
   * initialiser: React double-invokes those in StrictMode, and a consuming read
   * would hand the second call `null` and lose the scope. The clearing happens
   * in the effect below, where running twice is harmless.
   */
  const [entryScope] = useState<FilesScopeRequest | null>(peekPendingFilesScope);
  const [scope, setScope] = useState<FilesCategoryId | null>(
    initialScope ?? entryScope?.categoryId ?? null,
  );
  const [query, setQuery] = useState('');
  /* Gate 22 owns the sort column, the direction and the view mode. They are NOT
     component state: they are read from the view-state document keyed by the
     folder on screen, further down where all three scopes are known. */
  const [selectedId, setSelectedId] = useState<string | null>(
    initialFocusItemId ?? entryScope?.focusItemId ?? null,
  );
  const [revealNote, setRevealNote] = useState<string | null>(null);
  /**
   * Gate 10's open result. `null` is "not asked yet"; a `choose` decision parks
   * the ranked candidates here and NOTHING opens until the user picks one, which
   * is the gate's own rule about not silently choosing.
   */
  const [openState, setOpenState] = useState<
    { status: 'idle' } | { status: 'routing' } | { status: 'settled'; decision: FilesOpenDecision }
  >({ status: 'idle' });
  /**
   * Gate 8: the panel card a settings-search hit named, so the hit lands on its
   * own row rather than merely on the app. Cleared when the scope moves, which
   * is what stops a stale highlight following the user around the tree.
   */
  const [focusCardId, setFocusCardId] = useState<string | null>(
    entryScope?.focusCardId ?? null,
  );
  /**
   * The last mine's outcome. `addedIds` is what makes it reversible — the plan
   * requires a reversible action, and `addDeckCardsTracked` hands back exactly
   * the new rows so undo removes those and nothing that happened to match.
   */
  const [mineState, setMineState] = useState<MineState>({ status: 'idle' });
  /** Gate 20. Checkboxes own multi-selection; the focused row remains independent. */
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkMineState, setBulkMineState] = useState<BulkMineState>({ status: 'idle' });

  /* ------------------------- gate 16 state ------------------------ */

  /**
   * The user's own folders. Read from the store on mount rather than held only
   * in React state — the document is the thing that survives a restart, and a
   * component that kept its own copy would drift from a second window's writes.
   */
  const [collectionsDoc, setCollectionsDoc] = useState<FilesCollectionsDoc>(loadCollectionsDoc);
  /** Which of the user's folders is scoped. Mutually exclusive with `scope`. */
  const [collectionScope, setCollectionScope] = useState<string | null>(null);
  const [folderNotice, setFolderNotice] = useState<FolderNotice | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  /**
   * The delete confirm, inline rather than a native dialog. A native dialog
   * cannot be seen by the debug bridge and cannot be dismissed by it either, so
   * a confirm that lives in the DOM is the only shape this gate can be proven
   * in — and it is also the only shape that can state the count.
   */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  /** Gate 18. Same store shape as the folders, same restart guarantee. */
  const [favoritesDoc, setFavoritesDoc] = useState<FilesFavoritesDoc>(loadFavoritesDoc);

  /** Gate 19. The document holds QUESTIONS; membership is never stored. */
  const [smartDoc, setSmartDoc] = useState<FilesSmartFoldersDoc>(loadSmartFoldersDoc);
  const [smartScope, setSmartScope] = useState<string | null>(null);
  const [savingSearch, setSavingSearch] = useState(false);
  const [searchNameDraft, setSearchNameDraft] = useState('');

  /* ------------------------- gate 22 state ------------------------ */

  /**
   * Gate 22. The document is the source of truth for sort and view mode, not a
   * cache of component state — so a folder the user has never opened this
   * session already shows what it was last set to, with no effect to run first
   * and no frame where it shows the default and then jumps.
   */
  const [viewStateDoc, setViewStateDoc] = useState<FilesViewStateDoc>(loadViewStateDoc);
  const [viewNotice, setViewNotice] = useState<string | null>(null);

  /* Gate 27's surface. Mounted only while open so a closed sheet holds no
     report in memory — a 5,000-row scan is not something to keep alive behind
     a hidden dialog. */
  const [scanOpen, setScanOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  /**
   * Which folder's view is on screen. The precedence — smart, then collection,
   * then category, then root — is the same order `visible` resolves the list in,
   * and the two must not drift: a key naming a folder the list is not showing
   * would store the setting faithfully against the wrong row, which reads as a
   * setting that does not persist.
   */
  const folderKey = useMemo(
    () => folderViewKey({ scope, collectionId: collectionScope, smartId: smartScope }),
    [scope, collectionScope, smartScope],
  );

  const { sortColumn, sortDirection, viewMode } = folderView(viewStateDoc, folderKey);

  /** One place every view write lands, so a refusal and a failed save differ. */
  const applyView = useCallback(
    (patch: Partial<FilesFolderView>) => {
      const commit = commitViewState((doc) => setFolderView(doc, folderKey, patch, Date.now()));
      setViewStateDoc(commit.doc);
      // The change IS live either way — the document above already carries it —
      // but gate 22 is a restart gate, so a write that did not land has to say
      // so rather than hand back a receipt that is false tomorrow.
      setViewNotice(commit.errorKey ?? commit.storageErrorKey ?? null);
    },
    [folderKey],
  );

  /**
   * The scope was read above; taking it is this effect's job, so the next plain
   * open of the Files app does not silently inherit the last caller's filter.
   *
   * The listener is the other half of gate 5: a scoped-open gesture aimed at a
   * window that is ALREADY on screen re-renders nothing, so without it the same
   * button works once and then appears dead.
   */
  useEffect(() => {
    clearPendingFilesScope();
    const onScope = (event: Event) => {
      const detail = (event as CustomEvent<FilesScopeRequest | null>).detail;
      if (!detail) return;
      clearPendingFilesScope();
      setScope(detail.categoryId);
      // A derived scope and one of the user's own folders are mutually
      // exclusive filters. Without this the caller's category would be applied
      // on top of whatever collection was open and the list would show the
      // intersection of two things nobody asked to intersect.
      setCollectionScope(null);
      setSmartScope(null);
      setSelectedId(detail.focusItemId ?? null);
      setFocusCardId(detail.focusCardId ?? null);
      // A scope arriving on an open window must not land inside a stale search:
      // the caller asked for a folder, not for a folder minus whatever was typed.
      setQuery('');
    };
    window.addEventListener(FILES_SCOPE_EVENT, onScope);
    return () => window.removeEventListener(FILES_SCOPE_EVENT, onScope);
  }, []);

  /**
   * A second Files window (the app can pop one out) writes to the same store,
   * so this one re-reads rather than trusting the copy it made on mount.
   */
  useEffect(() => onCollectionsChanged(() => setCollectionsDoc(loadCollectionsDoc())), []);
  useEffect(() => onFavoritesChanged(() => setFavoritesDoc(loadFavoritesDoc())), []);
  useEffect(() => onSmartFoldersChanged(() => setSmartDoc(loadSmartFoldersDoc())), []);
  useEffect(() => onViewStateChanged(() => setViewStateDoc(loadViewStateDoc())), []);

  /*
   * Gates 9 and 21. One session for the whole app, not one per selected row:
   * the tombstone overlay is shared state, and a session rebuilt on selection
   * would hand each row its own view of what is deleted.
   *
   * `createWindowFilesDeletionSession` reads `window`, so it is called in a
   * lazy initialiser rather than at module scope — the same reason the panels
   * below are `lazy`. `filesApp.test.tsx` mounts with no preload bridge, and
   * the session's own adapter answers `filesApp.delete.failed` for that case
   * instead of throwing.
   */
  const [deletionSession] = useState(createWindowFilesDeletionSession);
  /*
   * The receipt lives HERE, not in the inspector that produced it. Deleting a
   * row clears the selection and unmounts that inspector, so an inline Undo
   * was unreachable in exactly the case it exists for — the successful delete.
   * The status dock below renders it and never unmounts.
   */
  const [deleteNotice, setDeleteNotice] = useState<FilesDeletionNotice | null>(null);
  /*
   * A soft delete writes localStorage from inside the control, so nothing in
   * React's tree knows the row vanished. This is the same subscribe-and-re-read
   * shape the four documents above use; the counter exists only to force the
   * re-filter, since the tombstones live in the session rather than in state.
   */
  const [softDeleteGeneration, setSoftDeleteGeneration] = useState(0);
  useEffect(() => {
    const bump = (): void => setSoftDeleteGeneration((n) => n + 1);
    window.addEventListener(FILES_SOFT_DELETE_EVENT, bump);
    return () => window.removeEventListener(FILES_SOFT_DELETE_EVENT, bump);
  }, []);

  /*
   * The single funnel. Filtering HERE rather than in the list means a
   * soft-deleted row also leaves the tree counts, the search results and the
   * bulk selection — a row hidden from the list but still counted in the
   * sidebar is the "quietly shrank" state the collection resolver above is
   * careful to avoid.
   */
  const allItems = useMemo(
    () => deletionSession.visibleItems(state.snapshot?.items ?? []),
    // `softDeleteGeneration` is the dependency that matters: the tombstone set
    // is read inside `visibleItems`, so nothing else here changes when it does.
    [state.snapshot, deletionSession, softDeleteGeneration],
  );

  /**
   * Counts come from the snapshot when nothing is filtered, and are recomputed
   * against the search when something is — so the tree shows how many hits are
   * in each category rather than a total the visible list contradicts.
   */
  const counts = useMemo(() => {
    if (!query.trim()) return state.snapshot?.counts ?? countByCategory([]);
    return countByCategory(allItems.filter((i) => matchesQuery(i, query)));
    // `lang` is not read here; counts are numbers, not translated strings.
  }, [state.snapshot, allItems, query]);

  const countFor = useCallback(
    (id: FilesCategoryId) => counts.find((c) => c.categoryId === id)?.total ?? 0,
    [counts],
  );

  /**
   * The scoped collection, resolved against the index this very render.
   *
   * `resolveCollection` splits the ids into present and missing rather than
   * filtering the missing away, because a folder that quietly shrank is the
   * shape the plan calls a finding — the count is reported below the list.
   */
  const scopedCollection = useMemo(() => {
    if (!collectionScope) return null;
    const collection = collectionsDoc.collections.find((c) => c.id === collectionScope);
    if (!collection) return null;
    return resolveCollection(collection, new Set(allItems.map((i) => i.id)));
  }, [collectionScope, collectionsDoc, allItems]);

  /** The saved search currently open, resolved from presets + the user's own. */
  const scopedSmart: FilesSmartFolder | null = useMemo(
    () => (smartScope ? (smartFolderById(smartDoc, smartScope) ?? null) : null),
    [smartScope, smartDoc],
  );

  const visible = useMemo(() => {
    if (scopedSmart) {
      // Recomputed from the live index every render: gate 19's "stays live" is
      // structural because there is no stored membership to go out of date.
      return sortItems(
        smartFolderMembers(allItems, scopedSmart.criteria).filter((i) => matchesQuery(i, query)),
        sortColumn,
        sortDirection,
      );
    }
    if (scopedCollection) {
      // The user's own order is the folder's order, so the ids drive the walk
      // and the index is only consulted for the row. Filtering `allItems` by
      // membership instead would silently re-sort the folder into index order.
      const byId = new Map(allItems.map((i) => [i.id, i]));
      const inFolder = scopedCollection.presentItemIds
        .map((id) => byId.get(id))
        .filter((i): i is FilesItem => Boolean(i))
        .filter((i) => matchesQuery(i, query));
      return sortItems(inFolder, sortColumn, sortDirection);
    }
    const filtered = allItems.filter(
      (item) =>
        (scope === null || categoryContains(scope, item.categoryId)) && matchesQuery(item, query),
    );
    return sortItems(filtered, sortColumn, sortDirection);
  }, [allItems, scope, scopedCollection, scopedSmart, query, sortColumn, sortDirection]);

  const selected = useMemo(
    () => visible.find((i) => i.id === selectedId) ?? null,
    [visible, selectedId],
  );

  const totalSize = useMemo(
    () => visible.reduce((sum, i) => sum + (i.sizeBytes ?? 0), 0),
    [visible],
  );

  /**
   * The column-header gesture: the same column flips direction, a new column
   * starts ascending. One `applyView` call and not two, because two would be two
   * `setItem`s and two change events for one click — and the second would be
   * written against the document the first had already replaced.
   */
  const toggleSort = useCallback(
    (column: FilesSortColumn) => {
      applyView(
        column === sortColumn
          ? { sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' }
          : { sortColumn: column, sortDirection: 'asc' },
      );
    },
    [applyView, sortColumn, sortDirection],
  );

  const onReveal = useCallback(async () => {
    if (!selected) return;
    const result = await window.api?.filesReveal?.(selected.location);
    if (!result || result.ok) {
      setRevealNote(null);
      return;
    }
    setRevealNote(t(result.reasonKey ?? 'filesApp.reveal.notFileBacked'));
  }, [selected, t]);

  /**
   * Gate 10. The routing decision is taken in `shared/filesApp/openPlan.ts`; all
   * this does is feed it the real path through the file router and act on the
   * answer. Opening never imports — see that module's header for why re-running
   * `DropRouter`'s switch on an already-indexed row would be a defect.
   */
  const runOpenDecision = useCallback((decision: FilesOpenDecision) => {
    setOpenState({ status: 'settled', decision });
    if (decision.mode === 'open') openSectionSurface(decision.section);
  }, []);

  /**
   * Takes the item rather than reading `selected`, because the double-click
   * route selects and opens in one gesture and the state has not committed yet
   * at that point — reading `selected` there would open the PREVIOUS row.
   */
  const openItem = useCallback(
    async (item: FilesItem) => {
      if (!isRoutableLocation(item.location)) {
        runOpenDecision(filesOpenDecision(item, null));
        return;
      }
      setOpenState({ status: 'routing' });
      const plans = await window.api?.fileDropClassify?.([item.location.path]);
      // A missing plan is NOT downgraded to the kind table: for a file the
      // router is the authority, and guessing from the extension is what
      // sniffing exists to avoid. `filesOpenDecision(item, null)` refuses here.
      runOpenDecision(filesOpenDecision(item, plans?.[0] ?? null));
    },
    [runOpenDecision],
  );

  const onOpen = useCallback(async () => {
    if (selected) await openItem(selected);
  }, [selected, openItem]);

  const onChooseCandidate = useCallback(
    // The kind travels with the pick too, or gate 15's refinement would apply
    // on the direct route and be dropped the moment the list was involved.
    (candidate: DropCandidate) => runOpenDecision(openFor(candidate, false, selected?.kind)),
    [runOpenDecision, selected],
  );

  /**
   * Gate 3, the whole round trip — now in `./filesMineChain`, because gate 10
   * gives the Flashcards Mining surface the same catalogue and the two must
   * mine identically.
   */
  const mineOne = useCallback(
    (item: FilesItem): Promise<SettledMineState> => mineFilesItem(item),
    [],
  );

  const onMine = useCallback(async () => {
    if (!selected) return;
    setMineState({ status: 'reading' });
    setMineState(await mineOne(selected));
  }, [selected, mineOne]);

  const toggleBulkSelection = useCallback((item: FilesItem) => {
    setBulkSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    setSelectedId(item.id);
    setBulkMineState({ status: 'idle' });
  }, []);

  const onBulkMine = useCallback(async () => {
    const items = allItems.filter((item) => bulkSelectedIds.has(item.id));
    if (items.length === 0) return;
    const results: BulkMineResult[] = [];
    setBulkMineState({ status: 'running', completed: 0, total: items.length });
    // Sequential on purpose: each item re-reads the deck after the previous
    // write, so two files containing the same cue cannot race in a duplicate.
    for (const item of items) {
      const result = await mineOne(item);
      results.push({ itemId: item.id, name: item.name, result });
      setBulkMineState({ status: 'running', completed: results.length, total: items.length });
    }
    setBulkMineState({ status: 'done', results });
    // The receipt retains the exact batch and its undo ids. Clearing the check
    // marks the action complete and prevents a second click from overwriting
    // the only recovery path for cards the first click added.
    setBulkSelectedIds(new Set());
  }, [allItems, bulkSelectedIds, mineOne]);

  const onUndoBulkMine = useCallback(() => {
    if (bulkMineState.status !== 'done') return;
    const ids = bulkMineState.results.flatMap((entry) =>
      entry.result.status === 'done' ? entry.result.addedIds : [],
    );
    removeDeckCards(ids);
    setBulkMineState({ status: 'undone', count: ids.length, results: bulkMineState.results });
  }, [bulkMineState]);

  // Read outside the updater deliberately: React double-invokes state updaters
  // in StrictMode, and a deck write is not something to run twice.
  const onUndoMine = useCallback(() => {
    if (mineState.status !== 'done') return;
    removeDeckCards(mineState.addedIds);
    setMineState({ status: 'undone', count: mineState.addedIds.length });
  }, [mineState]);

  /** A new selection invalidates the previous item's result, never carries it over. */
  const selectItem = useCallback((id: string) => {
    setSelectedId(id);
    setMineState({ status: 'idle' });
    setRevealNote(null);
    setOpenState({ status: 'idle' });
  }, []);

  /* ---------------------- gate 16/17 actions ---------------------- */

  /**
   * Which folder the rail's controls act on. Derived and collection scopes are
   * mutually exclusive by construction, so this cannot report both.
   */
  const folderSelection: FolderSelection = collectionScope
    ? { kind: 'collection', id: collectionScope }
    : scope
      ? { kind: 'derived', id: scope }
      : { kind: 'root' };

  /**
   * The name a gate-17 refusal has to say out loud. A refusal that will not
   * name the folder it refused on is barely better than a no-op.
   */
  const derivedLabel = useCallback(
    (selection: FolderSelection): string =>
      selection.kind === 'derived'
        ? t(categoryNode(selection.id)?.labelKey ?? 'filesApp.tree.everything')
        : t('filesApp.tree.everything'),
    // `lang` and not `t`: `t`'s identity is stable by design, so a dependency on
    // it goes stale after a language switch instead of erroring.
    [t, lang],
  );

  /** One place every write lands, so a refusal and a failed save look different. */
  const runCollectionOp = useCallback(
    (
      op: Parameters<typeof commitCollections>[0],
      success: FolderNotice,
    ): FilesCollection | undefined => {
      const commit = commitCollections(op);
      setCollectionsDoc(commit.doc);
      if (commit.errorKey) {
        setFolderNotice({ key: commit.errorKey, tone: 'error' });
        return undefined;
      }
      if (commit.storageErrorKey) {
        // The change IS live — the document above already has it — but it will
        // not survive a restart, and gate 16 is a restart gate. Saying so beats
        // a receipt that turns out to have been a lie tomorrow.
        setFolderNotice({ key: commit.storageErrorKey, tone: 'error' });
        return undefined;
      }
      setFolderNotice(success);
      return undefined;
    },
    [],
  );

  const onNewFolder = useCallback(() => {
    const name = t('filesApp.collections.newNameDefault');
    const id = newCollectionId();
    // Numbered on collision rather than refused: "New folder" is a default
    // nobody typed, so refusing it would punish the user for the app's choice.
    const siblings = childrenOf(collectionsDoc, null).map((c) => c.name.toLocaleLowerCase());
    let candidate = name;
    for (let n = 2; siblings.includes(candidate.toLocaleLowerCase()); n += 1) {
      candidate = `${name} ${n}`;
    }
    runCollectionOp(
      (doc) => createCollection(doc, { name: candidate, id, now: Date.now() }),
      { key: 'filesApp.collections.created', values: { name: candidate }, tone: 'ok' },
    );
    // Straight into rename: a folder called "New folder" is what the user has
    // to fix next, every time.
    setRenamingId(id);
    setRenameDraft(candidate);
  }, [collectionsDoc, runCollectionOp, t, lang]);

  const onStartRename = useCallback(() => {
    if (folderSelection.kind !== 'collection') {
      // Gate 17: named, not silent. The control stays present precisely so it
      // has somewhere to say this.
      setFolderNotice({
        key: 'filesApp.derived.cannotRename',
        values: { category: derivedLabel(folderSelection) },
        tone: 'error',
      });
      return;
    }
    const target = collectionsDoc.collections.find((c) => c.id === folderSelection.id);
    if (!target) return;
    setFolderNotice(null);
    setRenamingId(target.id);
    setRenameDraft(target.name);
  }, [folderSelection, collectionsDoc, derivedLabel]);

  const onCommitRename = useCallback(() => {
    if (!renamingId) return;
    const name = renameDraft;
    const commit = commitCollections((doc) => renameCollection(doc, renamingId, name, Date.now()));
    setCollectionsDoc(commit.doc);
    if (commit.errorKey) {
      // The editor stays OPEN on a refusal — closing it would throw away what
      // the user typed and leave them to work out what was wrong from a toast.
      setFolderNotice({ key: commit.errorKey, tone: 'error' });
      return;
    }
    setFolderNotice(
      commit.storageErrorKey
        ? { key: commit.storageErrorKey, tone: 'error' }
        : { key: 'filesApp.collections.renamed', values: { name }, tone: 'ok' },
    );
    setRenamingId(null);
  }, [renamingId, renameDraft]);

  const onRequestDelete = useCallback(() => {
    if (folderSelection.kind !== 'collection') {
      setFolderNotice({
        key: 'filesApp.derived.cannotDelete',
        values: { category: derivedLabel(folderSelection) },
        tone: 'error',
      });
      return;
    }
    setFolderNotice(null);
    setPendingDeleteId(folderSelection.id);
  }, [folderSelection, derivedLabel]);

  const onConfirmDelete = useCallback(() => {
    if (!pendingDeleteId) return;
    const target = collectionsDoc.collections.find((c) => c.id === pendingDeleteId);
    const name = target?.name ?? '';
    runCollectionOp((doc) => deleteCollection(doc, pendingDeleteId, Date.now()), {
      key: 'filesApp.collections.deleted',
      values: { name },
      tone: 'ok',
    });
    setPendingDeleteId(null);
    // The list must leave a folder that no longer exists, or it shows an empty
    // canvas under a heading naming something deleted.
    if (collectionScope === pendingDeleteId) setCollectionScope(null);
  }, [pendingDeleteId, collectionsDoc, collectionScope, runCollectionOp]);

  const onMoveFolder = useCallback(
    (parentId: string | null) => {
      if (folderSelection.kind !== 'collection') {
        setFolderNotice({
          key: 'filesApp.derived.cannotMove',
          values: { category: derivedLabel(folderSelection) },
          tone: 'error',
        });
        return;
      }
      const target = collectionsDoc.collections.find((c) => c.id === folderSelection.id);
      runCollectionOp((doc) => nestCollection(doc, folderSelection.id, parentId, Date.now()), {
        key: 'filesApp.collections.moved',
        values: { name: target?.name ?? '' },
        tone: 'ok',
      });
    },
    [folderSelection, collectionsDoc, derivedLabel, runCollectionOp],
  );

  /** Drag-in and the keyboard "Add" button share this — one write path, one receipt. */
  const addItemToFolder = useCallback(
    (collectionId: string, item: FilesItem) => {
      const target = collectionsDoc.collections.find((c) => c.id === collectionId);
      runCollectionOp((doc) => addToCollection(doc, collectionId, item.id, Date.now()), {
        key: 'filesApp.collections.added',
        values: { name: item.name, folder: target?.name ?? '' },
        tone: 'ok',
      });
    },
    [collectionsDoc, runCollectionOp],
  );

  const onRemoveFromFolder = useCallback(() => {
    if (!scopedCollection || !selected) return;
    runCollectionOp(
      (doc) =>
        removeFromCollection(doc, scopedCollection.collection.id, selected.id, Date.now()),
      {
        key: 'filesApp.collections.removed',
        values: { name: selected.name, folder: scopedCollection.collection.name },
        tone: 'ok',
      },
    );
  }, [scopedCollection, selected, runCollectionOp]);

  /* ------------------------ gate 19 actions ----------------------- */

  /** What the user is looking at right now, as criteria a search could save. */
  const currentCriteria: FilesSmartCriteria = useMemo(() => {
    const criteria: FilesSmartCriteria = {};
    if (scope) criteria.categoryId = scope;
    if (query.trim()) criteria.query = query.trim();
    return criteria;
  }, [scope, query]);

  const onSaveSearch = useCallback(() => {
    const name = searchNameDraft;
    const commit = commitSmartFolders((doc) =>
      saveSmartFolder(doc, {
        id: newSmartFolderId(),
        name,
        criteria: currentCriteria,
        now: Date.now(),
      }),
    );
    setSmartDoc(commit.doc);
    const errorKey = commit.errorKey ?? commit.storageErrorKey;
    if (errorKey) {
      // The editor stays open on a refusal, same as the folder rename: closing
      // it would throw away what was typed and leave a toast to explain it.
      setFolderNotice({ key: errorKey, tone: 'error' });
      return;
    }
    setFolderNotice({ key: 'filesApp.smart.saved', values: { name }, tone: 'ok' });
    setSavingSearch(false);
    setSearchNameDraft('');
  }, [searchNameDraft, currentCriteria]);

  const onDeleteSearch = useCallback(
    (folder: FilesSmartFolder) => {
      const commit = commitSmartFolders((doc) => deleteSmartFolder(doc, folder.id));
      setSmartDoc(commit.doc);
      const errorKey = commit.errorKey ?? commit.storageErrorKey;
      setFolderNotice(
        errorKey
          ? { key: errorKey, tone: 'error' }
          : { key: 'filesApp.smart.deleted', values: { name: folder.name ?? '' }, tone: 'ok' },
      );
      if (!errorKey && smartScope === folder.id) setSmartScope(null);
    },
    [smartScope],
  );

  const onOpenSmart = useCallback((id: string) => {
    setSmartScope(id);
    setScope(null);
    setCollectionScope(null);
    setFocusCardId(null);
    setFolderNotice(null);
    // A saved search already carries its own query; leaving the box filled
    // would intersect it with a second filter the user did not save.
    setQuery('');
  }, []);

  /* ------------------------ gate 18 actions ----------------------- */

  /**
   * The folder currently open, as a favorite target — or `null` at the root,
   * which is not a location anyone needs a shortcut to.
   */
  const scopeAsFavorite: FilesFavoriteTarget | null =
    folderSelection.kind === 'derived'
      ? { type: 'category', categoryId: folderSelection.id }
      : folderSelection.kind === 'collection'
        ? { type: 'collection', collectionId: folderSelection.id }
        : null;

  const onToggleFavorite = useCallback(
    (target: FilesFavoriteTarget, name: string) => {
      const wasPinned = isPinned(favoritesDoc, target);
      const commit = commitFavorites((doc) => toggleFilesFavorite(doc, target, Date.now()));
      setFavoritesDoc(commit.doc);
      const errorKey = commit.errorKey ?? commit.storageErrorKey;
      setFolderNotice(
        errorKey
          ? { key: errorKey, tone: 'error' }
          : {
              // Read BEFORE the commit: the toggle has already flipped by now,
              // so asking the new document what happened reports the opposite.
              key: wasPinned ? 'filesApp.favorites.unpinned' : 'filesApp.favorites.pinned',
              values: { name },
              tone: 'ok',
            },
      );
    },
    [favoritesDoc],
  );

  /**
   * Favorites, resolved against the world this render.
   *
   * A pinned item that left the index and a pinned folder the user deleted are
   * both STALE, not gone — the count is shown and the row keeps its place, for
   * the same reason a collection reports its missing ids rather than shrinking.
   */
  const favorites = useMemo(
    () =>
      resolveFavorites(favoritesDoc, {
        knownItemIds: new Set(allItems.map((i) => i.id)),
        knownCollectionIds: new Set(collectionsDoc.collections.map((c) => c.id)),
      }),
    [favoritesDoc, allItems, collectionsDoc],
  );

  /** A favorite's own label, resolved from whichever store owns its target. */
  const favoriteLabel = useCallback(
    (target: FilesFavoriteTarget): string => {
      if (target.type === 'category') {
        return t(categoryNode(target.categoryId)?.labelKey ?? 'filesApp.tree.everything');
      }
      if (target.type === 'collection') {
        return (
          collectionsDoc.collections.find((c) => c.id === target.collectionId)?.name ??
          t('filesApp.favorites.unknownCollection')
        );
      }
      return allItems.find((i) => i.id === target.itemId)?.name ?? t('filesApp.favorites.unknownItem');
    },
    [collectionsDoc, allItems, t, lang],
  );

  /** Open whatever a favorite points at. An item selects it; a place scopes to it. */
  const onOpenFavorite = useCallback((target: FilesFavoriteTarget) => {
    setFolderNotice(null);
    if (target.type === 'item') {
      setScope(null);
      setCollectionScope(null);
      setSmartScope(null);
      selectItem(target.itemId);
      return;
    }
    if (target.type === 'category') {
      setScope(target.categoryId);
      setCollectionScope(null);
      setSmartScope(null);
      setFocusCardId(null);
      return;
    }
    setScope(null);
    setCollectionScope(target.collectionId);
    setFocusCardId(null);
  }, [selectItem]);

  /* ---------------------------- rail ---------------------------- */

  /**
   * The user's folders as a depth-ordered list.
   *
   * Anything the walk from the root does not reach is appended at depth 0
   * rather than dropped. A hand-edited store can hold a cycle that
   * `nestCollection`'s guard never saw, and a folder the user made must not
   * become invisible because of it — an invisible folder cannot be deleted,
   * which is the one state with no way out.
   */
  const collectionRows = useMemo(() => {
    const rows: { collection: FilesCollection; depth: number }[] = [];
    const placed = new Set<string>();
    const walk = (parentId: string | null, depth: number) => {
      if (depth > 16) return;
      for (const c of childrenOf(collectionsDoc, parentId)) {
        if (placed.has(c.id)) continue;
        placed.add(c.id);
        rows.push({ collection: c, depth });
        walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    for (const c of collectionsDoc.collections) {
      if (!placed.has(c.id)) rows.push({ collection: c, depth: 0 });
    }
    return rows;
  }, [collectionsDoc]);

  const knownItemIds = useMemo(() => new Set(allItems.map((i) => i.id)), [allItems]);

  /** The item a rail drop is carrying, read back from the index by its id. */
  const itemFromDrag = useCallback(
    (event: DragEvent): FilesItem | null => {
      const id = event.dataTransfer?.getData(FILES_DRAG_ITEM_TYPE);
      if (!id) return null;
      return allItems.find((i) => i.id === id) ?? null;
    },
    [allItems],
  );

  const rail = (
    <div className="fa-tree">
      <button
        type="button"
        className="fa-tree-node fa-tree-root"
        /* The collapsed rail clips the label out of the layout (filesApp.css,
           §collapsed rail) — `title` is how a pointer user gets the name back.
           Set unconditionally: it is the same string either way, and a title
           that only exists at one breakpoint is a thing to forget. */
        title={t('filesApp.tree.everything')}
        data-selected={folderSelection.kind === 'root' ? 'true' : undefined}
        aria-pressed={folderSelection.kind === 'root'}
        onClick={() => {
          setScope(null);
          setCollectionScope(null);
          setSmartScope(null);
        }}
      >
        <span className="fa-tree-label">{t('filesApp.tree.everything')}</span>
        <span className="fa-tree-count">{allItems.length.toLocaleString(LANG_TAGS[lang])}</span>
      </button>
      {FILES_TREE.map((node) => (
        <button
          key={node.id}
          type="button"
          className="fa-tree-node"
          title={t(node.labelKey)}
          data-leaf={node.isLeaf ? 'true' : undefined}
          data-panel={isFilesPanelCategory(node.id) ? 'true' : undefined}
          data-derived="true"
          data-selected={
            folderSelection.kind === 'derived' && folderSelection.id === node.id ? 'true' : undefined
          }
          aria-pressed={folderSelection.kind === 'derived' && folderSelection.id === node.id}
          /* Gate 17, the "not offered" half. There is deliberately NO
             `preventDefault` here, so the drop never fires and the browser shows
             the no-drop cursor — a derived folder's membership is a consequence
             of what an item IS, and a hand-placed row would be a lie about that.
             Saying so is better than a cursor the user has to interpret. */
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(FILES_DRAG_ITEM_TYPE)) return;
            e.dataTransfer.dropEffect = 'none';
            setFolderNotice({
              key: 'filesApp.derived.cannotAdd',
              values: { category: t(node.labelKey) },
              tone: 'error',
            });
          }}
          onClick={() => {
            setScope(node.id);
            setCollectionScope(null);
            setSmartScope(null);
            // A tree click is not a search hit; it asked for the panel, not for
            // one card inside it. Carrying the highlight over would leave the
            // previous hit's row lit on a screen nobody searched for.
            setFocusCardId(null);
          }}
        >
          <span className="fa-tree-label">{t(node.labelKey)}</span>
          {/* Shown even at 0: a category that reads 0 while items exist is a
              finding, and a hidden node cannot be seen to be wrong. The two
              PANEL leaves are the exception — they hold no enumerable rows at
              all, so a count of 0 there would be an honest number answering a
              question nobody asked. */}
          {isFilesPanelCategory(node.id) ? (
            <span className="fa-tree-count fa-tree-panel-mark" aria-hidden>
              ›
            </span>
          ) : (
            <span className="fa-tree-count">
              {countFor(node.id).toLocaleString(LANG_TAGS[lang])}
            </span>
          )}
        </button>
      ))}

      {/* ---------------- gate 19: saved searches ---------------- */}
      <div className="fa-smart">
        <div className="fa-collections-head">
          {/* `title` on every rail label the collapsed rail ellipsizes. The
              accessible name is unchanged — the text stays in the DOM — but a
              pointer user in the 72px rail otherwise reads two characters. */}
          <h3 className="fa-collections-title" title={t('filesApp.smart.heading')}>
            {t('filesApp.smart.heading')}
          </h3>
          <button
            type="button"
            className="fa-smart-save"
            title={t('filesApp.smart.save')}
            onClick={() => {
              // Refused HERE as well as in the model, so the name editor never
              // opens on a view that cannot produce a search worth saving.
              if (!criteriaAreNarrowing(currentCriteria)) {
                setFolderNotice({ key: 'filesApp.smart.error.emptyCriteria', tone: 'error' });
                return;
              }
              setFolderNotice(null);
              setSavingSearch(true);
            }}
          >
            {t('filesApp.smart.save')}
          </button>
        </div>
        {savingSearch ? (
          <div className="fa-collection-rename fa-smart-name">
            <label>
              <span className="fa-visually-hidden">{t('filesApp.smart.saveName')}</span>
              <input
                type="text"
                value={searchNameDraft}
                autoFocus
                onChange={(e) => setSearchNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSaveSearch();
                  }
                  if (e.key === 'Escape') setSavingSearch(false);
                }}
              />
            </label>
            <button type="button" className="fa-action fa-smart-name-save" onClick={onSaveSearch}>
              {t('filesApp.collections.renameSave')}
            </button>
            <button type="button" className="fa-action" onClick={() => setSavingSearch(false)}>
              {t('filesApp.collections.renameCancel')}
            </button>
          </div>
        ) : null}
        {allSmartFolders(smartDoc).map((folder) => (
          <div key={folder.id} className="fa-smart-row" data-preset={isPresetSmartFolder(folder.id) ? 'true' : undefined}>
            <button
              type="button"
              className="fa-tree-node fa-smart-node"
              title={folder.nameKey ? t(folder.nameKey) : (folder.name ?? '')}
              data-smart={folder.id}
              data-selected={smartScope === folder.id ? 'true' : undefined}
              aria-pressed={smartScope === folder.id}
              onClick={() => onOpenSmart(folder.id)}
            >
              <span className="fa-tree-label">
                {folder.nameKey ? t(folder.nameKey) : (folder.name ?? '')}
              </span>
              {/* Counted from the live index on every render. There is no cached
                  membership anywhere, which is what gate 19 is really asking. */}
              <span className="fa-tree-count">
                {smartFolderCount(allItems, folder.criteria).toLocaleString(LANG_TAGS[lang])}
              </span>
            </button>
            {/* A preset has no delete control at all — it is compiled in, and a
                button that appears to remove it would be lying. The model
                refuses too, so the two cannot drift. */}
            {isPresetSmartFolder(folder.id) ? null : (
              <button
                type="button"
                className="fa-smart-delete"
                aria-label={t('filesApp.smart.delete')}
                title={t('filesApp.smart.delete')}
                onClick={() => onDeleteSearch(folder)}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {smartDoc.folders.length === 0 ? (
          <p className="fa-collections-empty fa-smart-empty">{t('filesApp.smart.empty')}</p>
        ) : null}
      </div>

      {/* ---------------- gate 18: Favorites ---------------- */}
      <div className="fa-favorites">
        <div className="fa-collections-head">
          <h3 className="fa-collections-title" title={t('filesApp.favorites.heading')}>
            {t('filesApp.favorites.heading')}
          </h3>
          {/* Pinning a LOCATION is the gate's second half, and this is where a
              user would look for it: on the folder they are standing in. */}
          {scopeAsFavorite ? (
            <button
              type="button"
              className="fa-favorite-pin-location"
              aria-pressed={isPinned(favoritesDoc, scopeAsFavorite)}
              onClick={() =>
                onToggleFavorite(scopeAsFavorite, favoriteLabel(scopeAsFavorite))
              }
            >
              {t(
                isPinned(favoritesDoc, scopeAsFavorite)
                  ? 'filesApp.favorites.unpinLocation'
                  : 'filesApp.favorites.pinLocation',
              )}
            </button>
          ) : null}
        </div>
        {favoritesDoc.favorites.length === 0 ? (
          <p className="fa-collections-empty">{t('filesApp.favorites.empty')}</p>
        ) : (
          favoritesDoc.favorites.map((favorite) => {
            const key = favoriteKey(favorite.target);
            const isStale = favorites.stale.some((f) => favoriteKey(f.target) === key);
            return (
              <div key={key} className="fa-favorite-row" data-stale={isStale ? 'true' : undefined}>
                <button
                  type="button"
                  className="fa-tree-node fa-favorite-node"
                  title={favoriteLabel(favorite.target)}
                  data-favorite={key}
                  /* A stale favorite is still clickable — it just cannot lead
                     anywhere, and disabling it would remove the only thing that
                     explains why. It is marked, and it can be unpinned. */
                  disabled={isStale}
                  onClick={() => onOpenFavorite(favorite.target)}
                >
                  <span className="fa-tree-label">{favoriteLabel(favorite.target)}</span>
                </button>
                <button
                  type="button"
                  className="fa-favorite-unpin"
                  aria-label={t('filesApp.favorites.unpinItem')}
                  title={t('filesApp.favorites.unpinItem')}
                  onClick={() => onToggleFavorite(favorite.target, favoriteLabel(favorite.target))}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
        {favorites.stale.length > 0 ? (
          // Kept and counted, never swept: a shortcut that vanished on its own
          // is indistinguishable from one the user forgot they made.
          <p className="fa-favorites-stale" role="status">
            {t('filesApp.favorites.stale', { count: favorites.stale.length })}
          </p>
        ) : null}
      </div>

      {/* ---- gate 16: the only folders in this tree the user writes ---- */}
      <div className="fa-collections">
        <div className="fa-collections-head">
          <h3 className="fa-collections-title" title={t('filesApp.collections.heading')}>
            {t('filesApp.collections.heading')}
          </h3>
          <button
            type="button"
            className="fa-collections-new"
            title={t('filesApp.collections.new')}
            onClick={onNewFolder}
          >
            {t('filesApp.collections.new')}
          </button>
        </div>
        {collectionRows.length === 0 ? (
          <p className="fa-collections-empty">{t('filesApp.collections.empty')}</p>
        ) : (
          collectionRows.map(({ collection, depth }) =>
            renamingId === collection.id ? (
              <div key={collection.id} className="fa-collection-rename" style={{ '--fa-depth': depth } as CSSProperties}>
                <label>
                  <span className="fa-visually-hidden">{t('filesApp.collections.nameLabel')}</span>
                  <input
                    type="text"
                    value={renameDraft}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onCommitRename();
                      }
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                </label>
                <button type="button" className="fa-action" onClick={onCommitRename}>
                  {t('filesApp.collections.renameSave')}
                </button>
                <button type="button" className="fa-action" onClick={() => setRenamingId(null)}>
                  {t('filesApp.collections.renameCancel')}
                </button>
              </div>
            ) : (
              <button
                key={collection.id}
                type="button"
                className="fa-tree-node fa-collection-node"
                title={collection.name}
                style={{ '--fa-depth': depth } as CSSProperties}
                data-collection={collection.id}
                data-dragover={dragOverId === collection.id ? 'true' : undefined}
                data-selected={collectionScope === collection.id ? 'true' : undefined}
                aria-pressed={collectionScope === collection.id}
                onClick={() => {
                  setCollectionScope(collection.id);
                  setScope(null);
                  setSmartScope(null);
                  setFocusCardId(null);
                  setFolderNotice(null);
                }}
                /* The drop half of gate 16. `preventDefault` is what makes this
                   a drop target at all — its absence on the derived nodes above
                   is the whole difference between offered and not offered. */
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(FILES_DRAG_ITEM_TYPE)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDragOverId(collection.id);
                }}
                onDragLeave={() => setDragOverId((id) => (id === collection.id ? null : id))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverId(null);
                  const item = itemFromDrag(e);
                  if (item) addItemToFolder(collection.id, item);
                }}
              >
                <span className="fa-tree-label">{collection.name}</span>
                <span className="fa-tree-count">
                  {resolveCollection(collection, knownItemIds).presentItemIds.length.toLocaleString(
                    LANG_TAGS[lang],
                  )}
                </span>
              </button>
            ),
          )
        )}

        {/* Gate 17's reachable surface. These act on whatever folder is
            selected, derived or not — a control that vanishes on a derived
            folder cannot say why it refused, and the gate asks for a named
            message rather than an absence. */}
        {/* `role="group"` labelled "My folders" was two things wrong at once: `group` is
            generic enough to cover a fieldset, so nothing downstream could tell this cluster
            of three commands from a form; and the name it borrowed described the folder LIST
            above rather than the actions themselves. It is a toolbar, inside the scaffold rail
            (`data-lq-role="liquid"`), and it now says so — see the note on `.fa-toolbar`. */}
        <div
          className="fa-folder-actions"
          role="toolbar"
          aria-label={t('filesApp.collections.actionsLabel')}
        >
          <button
            type="button"
            className="fa-action fa-folder-rename"
            title={t('filesApp.collections.rename')}
            onClick={onStartRename}
          >
            {t('filesApp.collections.rename')}
          </button>
          <button
            type="button"
            className="fa-action fa-folder-delete"
            title={t('filesApp.collections.delete')}
            onClick={onRequestDelete}
          >
            {t('filesApp.collections.delete')}
          </button>
          <label className="fa-folder-move" title={t('filesApp.collections.moveTo')}>
            <span className="fa-visually-hidden">{t('filesApp.collections.moveTo')}</span>
            <select
              value={
                folderSelection.kind === 'collection'
                  ? (collectionsDoc.collections.find((c) => c.id === folderSelection.id)?.parentId ??
                    '')
                  : ''
              }
              onChange={(e) => onMoveFolder(e.target.value || null)}
            >
              <option value="">{t('filesApp.collections.topLevel')}</option>
              {collectionRows
                .filter(({ collection }) => {
                  if (folderSelection.kind !== 'collection') return true;
                  // Neither itself nor anything beneath it: the model refuses
                  // both, and offering an option that can only be refused is a
                  // control that lies about what it does.
                  if (collection.id === folderSelection.id) return false;
                  return !ancestorsOf(collectionsDoc, collection.id).some(
                    (a) => a.id === folderSelection.id,
                  );
                })
                .map(({ collection }) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
            </select>
          </label>
        </div>

        {pendingDeleteId ? (
          <div className="fa-folder-confirm" role="alertdialog" aria-label={t('filesApp.collections.delete')}>
            {/* The count is in the sentence because gate 16's claim IS the
                count: these items stay where they are. A confirm that will not
                say how many is asking for consent to something unstated. */}
            <p>
              {t('filesApp.collections.deleteConfirm', {
                name: collectionsDoc.collections.find((c) => c.id === pendingDeleteId)?.name ?? '',
                count:
                  collectionsDoc.collections.find((c) => c.id === pendingDeleteId)?.itemIds.length ??
                  0,
              })}
            </p>
            <button type="button" className="fa-action fa-folder-confirm-yes" onClick={onConfirmDelete}>
              {t('filesApp.collections.deleteConfirmYes')}
            </button>
            <button type="button" className="fa-action" onClick={() => setPendingDeleteId(null)}>
              {t('filesApp.collections.deleteConfirmNo')}
            </button>
          </div>
        ) : null}

        {folderNotice ? (
          <p
            className="fa-folder-notice"
            data-tone={folderNotice.tone}
            role="status"
          >
            {t(folderNotice.key, folderNotice.values)}
          </p>
        ) : null}
      </div>
    </div>
  );

  /* -------------------------- toolbar --------------------------- */

  const showListTools = scope === null || !isFilesPanelCategory(scope);

  /**
   * One label for both kinds of narrowing — a derived category and one of the
   * user's own folders — so a collection scope cannot end up as the only filter
   * with no way out stated in the same sentence.
   */
  const scopeLabel = scopedSmart
    ? t('filesApp.collections.scoped', {
        name: scopedSmart.nameKey ? t(scopedSmart.nameKey) : (scopedSmart.name ?? ''),
      })
    : scopedCollection
    ? t('filesApp.collections.scoped', { name: scopedCollection.collection.name })
    : scope
      ? t('filesApp.entry.scoped', {
          category: t(categoryNode(scope)?.labelKey ?? 'filesApp.tree.everything'),
        })
      : null;

  // L9 category 3, measured live 2026-09-04 on the 820x580 window in Liquid: this strip and
  // `.fa-folder-actions` below were the surface's only two `denseWorkOnTranslucent` regions.
  // Neither is dense work — this one is 703x38 and holds a search field, a sort control, a view
  // toggle and four buttons — but an undeclared `<div>` has no runtime evidence that it is
  // chrome, so the walk classified both by content and §2.3's "dense work on glass" bar failed
  // on the app's own toolbar. The role is the honest declaration and it is what the scaffold
  // already assumes: `.lq-scaffold-toolbar` around it carries `data-lq-role="liquid"`, so once
  // this says `toolbar` it is contextual chrome on a shared Liquid primitive, which is exactly
  // what §2.3 reserves Liquid for. Same shape and same reasoning as `MusicWidget`'s transport
  // cluster. The name is the region's; every control inside keeps its own.
  const toolbar = (
    <div className="fa-toolbar" role="toolbar" aria-label={t('filesApp.toolbar.label')}>
      {/* Search, sort and refresh act on the item list. On a panel scope there
          is no list for them to act on, and a control that is present and does
          nothing is a worse answer than one that is absent. */}
      {showListTools ? (
        <>
          <label className="fa-search">
            <span className="fa-visually-hidden">{t('filesApp.search.label')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('filesApp.search.placeholder')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="fa-sort">
            <span className="fa-visually-hidden">{t('filesApp.sort.label')}</span>
            <select
              value={sortColumn}
              onChange={(e) => applyView({ sortColumn: e.target.value as FilesSortColumn })}
            >
              {FILES_SORT_COLUMNS.map((column) => (
                <option key={column} value={column}>
                  {t(`filesApp.column.${column}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="fa-sort-dir"
            onClick={() => applyView({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' })}
            aria-label={t(sortDirection === 'asc' ? 'filesApp.sort.asc' : 'filesApp.sort.desc')}
          >
            {sortDirection === 'asc' ? '↑' : '↓'}
          </button>
          {/* Gate 22's third remembered control. A radio group and not a select:
              two values with one visible at a time is what `aria-pressed` on a
              pair of buttons says, and it is one click rather than two. */}
          <div className="fa-view-mode" role="group" aria-label={t('filesApp.view.label')}>
            {FILES_VIEW_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                /* `lq-hit` and not a taller `min-height`: these sit inside a
                   1px-padded bordered pill, so raising the box would grow the
                   pill itself — the chrome inflation `liquid-controls.css`
                   calls damage rather than repair. The shared `::after` gives
                   the POINTER 32px and moves no layout. Safe here because
                   `.fa-view-mode` sets no `overflow`, which is the one thing
                   that silently clips the expander back. Measured at 28px. */
                className="fa-view-mode-button lq-hit"
                data-mode={mode}
                aria-pressed={viewMode === mode}
                onClick={() => applyView({ viewMode: mode })}
              >
                {t(`filesApp.view.mode.${mode}`)}
              </button>
            ))}
          </div>
          {viewNotice ? (
            <p className="fa-view-notice" role="status">
              {t(viewNotice)}
            </p>
          ) : null}
          <button type="button" className="fa-refresh" onClick={refresh} disabled={refreshing}>
            {t(refreshing ? 'filesApp.action.refreshing' : 'filesApp.action.refresh')}
          </button>
          {/* Gates 23 and 27: the scan's report, and the review queue that
              stands between a guess and the library. */}
          <button
            type="button"
            className="fa-scan-open"
            onClick={() => setScanOpen(true)}
          >
            {t('filesApp.review.title')}
          </button>
          {/* Gates 32-35: the dry run, its guard, and the log. Opening it plans
              and removes nothing — the confirm inside is the only write. */}
          <button
            type="button"
            className="fa-cleanup-open"
            onClick={() => setCleanupOpen(true)}
          >
            {t('filesApp.cleanup.title')}
          </button>
          {bulkSelectedIds.size > 0 ? (
            <>
              <button
                type="button"
                className="fa-bulk-mine"
                onClick={() => void onBulkMine()}
                disabled={bulkMineState.status === 'running'}
              >
                {t(
                  bulkMineState.status === 'running'
                    ? 'filesApp.bulk.mining'
                    : 'filesApp.bulk.mine',
                  { count: bulkSelectedIds.size },
                )}
              </button>
              <button
                type="button"
                className="fa-bulk-clear"
                onClick={() => {
                  setBulkSelectedIds(new Set());
                  setBulkMineState({ status: 'idle' });
                }}
              >
                {t('filesApp.bulk.clear')}
              </button>
            </>
          ) : null}
        </>
      ) : null}
      {/* Gate 5: a narrowed list has to say it is narrowed. Without this the
          same window shows a fraction of the tree and reads as a broken index
          rather than as a filter someone asked for — and the way out is stated
          in the same sentence rather than left to be discovered in the rail. */}
      {scopeLabel ? (
        <button
          type="button"
          className="fa-scope-clear"
          onClick={() => {
            setScope(null);
            setCollectionScope(null);
            setSmartScope(null);
          }}
          title={scopeLabel}
        >
          {scopeLabel}
        </button>
      ) : null}
    </div>
  );

  /* --------------------------- canvas --------------------------- */

  const header = (
    <div className="fa-row fa-head" role="row" aria-rowindex={1}>
      <span role="columnheader" aria-sort="none" className="fa-cell fa-cell-select">
        <span className="fa-visually-hidden">{t('filesApp.bulk.selection')}</span>
      </span>
      {columnsFor(viewMode).map((column) => (
        <button
          key={column}
          type="button"
          role="columnheader"
          className={`fa-cell fa-cell-${column}`}
          aria-sort={
            sortColumn === column
              ? sortDirection === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'
          }
          onClick={() => toggleSort(column)}
        >
          {t(`filesApp.column.${column}`)}
        </button>
      ))}
    </div>
  );

  const canvas = (() => {
    /**
     * Gate 8. The two system leaves are PANELS, not item lists, so they render
     * before any index state is consulted — memory and statistics read their own
     * stores and are perfectly available while the file index is still loading
     * or has failed outright. Gating them on `state.status` would make an
     * unrelated enumerator failure hide the app's own diagnostics, which is the
     * screen you most want when something is broken.
     */
    if (scope && isFilesPanelCategory(scope)) {
      return (
        <Suspense fallback={<p className="fa-state">{t('filesApp.state.loading')}</p>}>
          {scope === 'system/memory' ? (
            <FilesMemoryPanel focusCardId={focusCardId} />
          ) : (
            <FilesStatisticsPanel focusCardId={focusCardId} />
          )}
        </Suspense>
      );
    }
    if (state.status === 'loading') {
      return <p className="fa-state">{t('filesApp.state.loading')}</p>;
    }
    if (state.status === 'unavailable') {
      return <p className="fa-state fa-state-error">{t('filesApp.state.unavailable')}</p>;
    }
    if (state.status === 'error') {
      return (
        <div className="fa-state fa-state-error">
          <p>{t('filesApp.state.error')}</p>
          <p className="fa-state-detail">{state.error}</p>
          <button type="button" onClick={refresh}>
            {t('filesApp.action.retry')}
          </button>
        </div>
      );
    }
    const failed = state.snapshot.enumerators.filter((r) => r.error);
    return (
      <div
        className="fa-list"
        role="grid"
        data-view={viewMode}
        aria-label={t('filesApp.list.label')}
        aria-rowcount={visible.length + 1}
      >
        {header}
        {failed.length > 0 ? (
          // A store that could not be read is named, so a category at 0 is
          // never mistaken for an honest zero.
          <p className="fa-state-warning" role="status">
            {t('filesApp.state.partial', { sources: failed.map((f) => f.source).join(', ') })}
          </p>
        ) : null}
        {/* A folder that quietly shrank is the shape the plan calls a finding.
            The ids are kept, not dropped, so the shortfall between what the
            user filed and what the list shows is stated rather than absorbed. */}
        {scopedCollection && scopedCollection.missingItemIds.length > 0 ? (
          <p className="fa-state-warning fa-collection-missing" role="status">
            {t('filesApp.collections.missing', {
              count: scopedCollection.missingItemIds.length,
            })}
          </p>
        ) : null}
        <VirtualList
          items={visible}
          itemHeight={viewMode === 'compact' ? COMPACT_ROW_HEIGHT : ROW_HEIGHT}
          className="fa-rows"
          getKey={(item) => item.id}
          // Written inline, like every other VirtualList call site in this
          // tree. `virtualListSemantics` reads the OPENING TAG to check that a
          // windowed collection declares itself, so a role hidden in an
          // extracted callback is invisible to it -- and a useCallback bought
          // nothing here anyway: VirtualList calls renderItem during its own
          // render and memoises on items, not on this.
          renderItem={(item: FilesItem, index: number) => (
          <div
            role="row"
            className="fa-row"
            // VirtualList marks its own slots `presentation` in grid mode, so the
            // real row count CANNOT come from it — a 4,000-row list windowed to 20
            // announces twenty rows unless the caller supplies these. Row 1 is the
            // header, so the body starts at 2.
            aria-rowindex={index + 2}
            data-selected={item.id === selectedId ? 'true' : undefined}
            data-broken={item.flags.brokenLink ? 'true' : undefined}
            aria-selected={item.id === selectedId}
            tabIndex={0}
            /* Gate 16's pointer path into a folder. The keyboard path is the
               inspector's Add control — drag alone would put a whole feature
               behind a gesture a keyboard user cannot make. */
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(FILES_DRAG_ITEM_TYPE, item.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => selectItem(item.id)}
            /* Gate 10, the filing-system gesture: single click selects, double
               click opens. Both routes end in the same `openItem`, so there is
               one decision path and not a shortcut that skips the router. */
            onDoubleClick={() => {
              selectItem(item.id);
              void openItem(item);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectItem(item.id);
              }
            }}
          >
            <span role="gridcell" className="fa-cell fa-cell-select">
              <input
                type="checkbox"
                className="fa-bulk-check"
                checked={bulkSelectedIds.has(item.id)}
                disabled={bulkMineState.status === 'running'}
                aria-label={t('filesApp.bulk.selectItem', { name: item.name })}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleBulkSelection(item)}
              />
            </span>
            <span role="gridcell" className="fa-cell fa-cell-name">
              {item.name}
              {item.flags.brokenLink ? (
                <span className="fa-badge fa-badge-broken">{t('filesApp.flag.brokenLink')}</span>
              ) : null}
            </span>
            <span role="gridcell" className="fa-cell fa-cell-kind">
              {t(`filesApp.kind.${item.kind}`)}
            </span>
            {/* Gate 22: compact really drops these three — see `columnsFor`. */}
            {viewMode === 'details' ? (
              <>
                <span
                  role="gridcell"
                  className="fa-cell fa-cell-provenance"
                  data-machine={isMachineDerived(item.provenance) ? 'true' : undefined}
                >
                  {t(`filesApp.provenance.${item.provenance}`)}
                </span>
                <span role="gridcell" className="fa-cell fa-cell-size">
                  {formatSize(item.sizeBytes, t, lang)}
                </span>
                <span role="gridcell" className="fa-cell fa-cell-modified">
                  {formatDate(item.modifiedAt, lang)}
                </span>
              </>
            ) : null}
          </div>
          )}
          gridRole="rowgroup"
          emptyState={
            <p className="fa-state">
              {t(query.trim() ? 'filesApp.state.noMatches' : 'filesApp.state.empty')}
            </p>
          }
        />
      </div>
    );
  })();

  /* ------------------------- inspector -------------------------- */

  const mineability = selected ? mineabilityOf(selected) : null;
  const reachability = selected ? filesReachability(selected.source) : null;

  /**
   * Gate 10's receipt. The `choose` branch is the gate's own requirement, so it
   * renders the RANKED order the router returned — no re-sort here, because the
   * ranking is the router's answer and reordering it in the view would make the
   * two disagree about which home is likeliest.
   */
  const openResult = (() => {
    if (openState.status !== 'settled') return null;
    const { decision } = openState;
    if (decision.mode === 'refuse') {
      return (
        <p className="fa-details-note fa-open-refusal" role="status">
          {t(decision.reasonKey)}
        </p>
      );
    }
    if (decision.mode === 'choose') {
      return (
        <div className="fa-open-choose" role="group" aria-label={t('filesApp.open.choose')}>
          <p className="fa-details-note">{t('filesApp.open.choose')}</p>
          {decision.candidates.map((candidate) => (
            <button
              key={candidate.target}
              type="button"
              className="fa-action fa-open-candidate"
              data-target={candidate.target}
              onClick={() => onChooseCandidate(candidate)}
            >
              <span className="fa-open-candidate-name">{t(targetLabelKey(candidate.target))}</span>
              <span className="fa-open-candidate-why">{t(candidate.reasonKey)}</span>
            </button>
          ))}
          <button
            type="button"
            className="fa-action fa-open-cancel"
            onClick={() => setOpenState({ status: 'idle' })}
          >
            {t('filesApp.action.openCancel')}
          </button>
        </div>
      );
    }
    return (
      <p className="fa-details-note fa-open-opened" role="status">
        {/* `palette.section.*` is the app-name key family the Start menu and the
            command palette already use — a second set of names for the same
            twenty-five apps is exactly the kind of drift i18n hides well. */}
        {t('filesApp.open.opened', { app: t(`palette.section.${decision.section}`) })}
        <span className="fa-state-detail"> {t(decision.reasonKey)}</span>
        {decision.sniffed ? (
          <span className="fa-state-detail fa-open-sniffed"> {t('filesApp.open.sniffed')}</span>
        ) : null}
      </p>
    );
  })();

  /**
   * The mine's receipt. Every state reports NUMBERS — the plan's rule is
   * numbers, never adjectives — and each skip bucket is named separately so a
   * small `added` is explained rather than merely small.
   */
  const mineResult = (() => {
    if (mineState.status === 'refused') {
      return (
        <p className="fa-details-note fa-mine-refusal" role="status">
          {t(mineState.reasonKey, mineState.values)}
          {mineState.detail ? <span className="fa-state-detail"> {mineState.detail}</span> : null}
        </p>
      );
    }
    if (mineState.status === 'undone') {
      return (
        <p className="fa-details-note" role="status">
          {t('filesApp.mine.undone', { count: mineState.count })}
        </p>
      );
    }
    if (mineState.status !== 'done') return null;
    const skipped = mineState.skippedNotJapanese + mineState.skippedDuplicate;
    return (
      <div className="fa-mine-result" role="status">
        <p>
          {t('filesApp.mine.added', {
            count: mineState.added,
            read: mineState.passagesRead,
          })}
        </p>
        {skipped > 0 ? (
          <p className="fa-details-note">
            {t('filesApp.mine.skipped', {
              notJapanese: mineState.skippedNotJapanese,
              duplicate: mineState.skippedDuplicate,
            })}
          </p>
        ) : null}
        {mineState.skippedOverCap > 0 ? (
          <p className="fa-details-note">
            {t('filesApp.mine.capped', {
              max: FILES_MINE_MAX_CARDS,
              overCap: mineState.skippedOverCap,
            })}
          </p>
        ) : null}
        {/* The binding constraint, visible where the cards were made — not only
            on the card itself, where a user who never opens the deck never sees it. */}
        {mineState.machineDerived ? (
          <p className="fa-details-note" data-machine="true">
            {t('filesApp.mine.machineMark')}
          </p>
        ) : null}
        <button type="button" className="fa-action fa-action-undo" onClick={onUndoMine}>
          {t('filesApp.action.undoMine')}
        </button>
      </div>
    );
  })();

  const bulkMineResult = (() => {
    if (bulkMineState.status === 'idle') return null;
    if (bulkMineState.status === 'running') {
      return (
        <p className="fa-details-note fa-bulk-progress" role="status">
          {t('filesApp.bulk.progress', {
            completed: bulkMineState.completed,
            total: bulkMineState.total,
          })}
        </p>
      );
    }
    const results = bulkMineState.results;
    const succeeded = results.filter((entry) => entry.result.status === 'done');
    const cards = succeeded.reduce(
      (sum, entry) => sum + (entry.result.status === 'done' ? entry.result.added : 0),
      0,
    );
    return (
      <div className="fa-bulk-result" role="status">
        <p>
          {bulkMineState.status === 'undone'
            ? t('filesApp.bulk.undone', { count: bulkMineState.count })
            : t('filesApp.bulk.summary', {
                succeeded: succeeded.length,
                total: results.length,
                cards,
                failed: results.length - succeeded.length,
              })}
        </p>
        <ul>
          {results.map((entry) => (
            <li key={entry.itemId} data-outcome={entry.result.status}>
              <strong>{entry.name}</strong>{' — '}
              {entry.result.status === 'done'
                ? t('filesApp.bulk.itemAdded', { count: entry.result.added })
                : t(entry.result.reasonKey, entry.result.values)}
              {entry.result.detail ? (
                <span className="fa-state-detail"> {entry.result.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {bulkMineState.status === 'done' && cards > 0 ? (
          <button type="button" className="fa-action fa-bulk-undo" onClick={onUndoBulkMine}>
            {t('filesApp.bulk.undo')}
          </button>
        ) : null}
      </div>
    );
  })();

  /**
   * What the inspector says when nothing is selected — rubric category 4.
   *
   * Measured live 2026-09-04 at maximized (1264x773): the inspector was a 320px
   * column holding ONE 43px sentence, and its empty remainder was the surface's
   * largest dead rectangle at **316x572, 17.4% of the viewport** against a 15%
   * bar. The sentence stays (it is the honest answer to "why is this empty"),
   * but a fixed column that earns nothing until the user clicks is exactly what
   * this category is for.
   *
   * Everything here is derived from `visible` — the rows actually on screen
   * under the current scope, search and filters — so it can never disagree with
   * the list beside it. The counting rules live in `folderSummary.ts` with
   * their own suite; see that file for why `sizeBytes: null` is not zero.
   */
  const folderSummary = useMemo(() => summarizeFolder(visible), [visible]);

  const inspector = selected && mineability ? (
    <div className="fa-details">
      <h2 className="fa-details-title">{selected.name}</h2>
      <dl className="fa-details-list">
        <dt>{t('filesApp.column.kind')}</dt>
        <dd>{t(`filesApp.kind.${selected.kind}`)}</dd>
        <dt>{t('filesApp.column.provenance')}</dt>
        <dd data-machine={isMachineDerived(selected.provenance) ? 'true' : undefined}>
          {t(`filesApp.provenance.${selected.provenance}`)}
        </dd>
        <dt>{t('filesApp.column.size')}</dt>
        <dd>{formatSize(selected.sizeBytes, t, lang)}</dd>
        <dt>{t('filesApp.column.created')}</dt>
        <dd>{formatDate(selected.createdAt, lang)}</dd>
        <dt>{t('filesApp.column.modified')}</dt>
        <dd>{formatDate(selected.modifiedAt, lang)}</dd>
        <dt>{t('filesApp.details.location')}</dt>
        <dd className="fa-details-location">{describeLocation(selected, t)}</dd>
        <dt>{t('filesApp.details.source')}</dt>
        <dd>{selected.source}</dd>
        {/* The anti-gatekeeper promise, said per item instead of only in a test.
            `FILES_ROUTE_PARITY` has carried the route for every store since
            gate 6; until this line it was evidence nothing in the product read,
            so a user could not tell an item they can also reach in Library from
            one that genuinely lives only here. `new` rows and unknown sources
            render NO row at all rather than an empty one — a `<dt>` with a blank
            `<dd>` reads as a claim that failed to load. */}
        {reachability ? (
          <>
            <dt>{t('filesApp.details.alsoIn')}</dt>
            <dd className="fa-details-also" data-reach={reachability.kind}>
              {reachability.kind === 'section'
                ? t(`palette.section.${reachability.section}`)
                : t(
                    reachability.kind === 'global'
                      ? 'filesApp.details.alsoInGlobal'
                      : 'filesApp.details.onlyHere',
                  )}
            </dd>
          </>
        ) : null}
      </dl>
      {/* Gate 10. Always offered — every row has SOME answer, and where that
          answer is "nothing opens this", the refusal is the honest outcome and
          is more useful than a hidden button. */}
      <button
        type="button"
        className="fa-action fa-action-open"
        onClick={onOpen}
        disabled={openState.status === 'routing'}
      >
        {t(openState.status === 'routing' ? 'filesApp.action.opening' : 'filesApp.action.open')}
      </button>
      {openResult}
      {revealTargetFor(selected.location) ? (
        <button type="button" className="fa-action" onClick={onReveal}>
          {t('filesApp.action.reveal')}
        </button>
      ) : (
        // Absent rather than present-and-failing: this store has no folder.
        <p className="fa-details-note">{t('filesApp.reveal.notFileBacked')}</p>
      )}
      {/* Gate 3. Offered only where text can actually be read; where it cannot,
          the reason is stated rather than the button being present and failing. */}
      {mineability.mineable ? (
        <button
          type="button"
          className="fa-action fa-action-mine"
          onClick={onMine}
          disabled={mineState.status === 'reading'}
        >
          {t(mineState.status === 'reading' ? 'filesApp.action.mining' : 'filesApp.action.mine')}
        </button>
      ) : (
        <p className="fa-details-note fa-mine-refusal">{t(mineability.reasonKey)}</p>
      )}
      {mineResult}
      {bulkMineResult}
      {/* Gate 18's first half. A toggle, because pin and unpin are one gesture
          and two buttons would let the app show both at once. */}
      <button
        type="button"
        className="fa-action fa-favorite-toggle"
        aria-pressed={isPinned(favoritesDoc, { type: 'item', itemId: selected.id })}
        onClick={() =>
          onToggleFavorite({ type: 'item', itemId: selected.id }, selected.name)
        }
      >
        {t(
          isPinned(favoritesDoc, { type: 'item', itemId: selected.id })
            ? 'filesApp.favorites.unpinItem'
            : 'filesApp.favorites.pinItem',
        )}
      </button>
      {/* Gate 16's keyboard path into a folder, and gate 17's "not offered" in
          its plainest form: the options are the user's OWN folders and nothing
          else, so a derived folder is never on the menu to begin with. */}
      {collectionRows.length === 0 ? (
        <p className="fa-details-note">{t('filesApp.collections.noneYet')}</p>
      ) : (
        <label className="fa-details-add">
          <span>{t('filesApp.collections.addTo')}</span>
          <select
            className="fa-add-to-collection"
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) addItemToFolder(id, selected);
            }}
          >
            <option value="">{t('filesApp.collections.add')}</option>
            {collectionRows.map(({ collection }) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {/* Only inside a folder: "remove from this folder" has no referent when
          the list is a derived category, and a control whose target is a guess
          is worse than one that is not there. */}
      {scopedCollection && scopedCollection.presentItemIds.includes(selected.id) ? (
        <button type="button" className="fa-action fa-remove-from-collection" onClick={onRemoveFromFolder}>
          {t('filesApp.collections.removeFrom')}
        </button>
      ) : null}
      {/* Gates 9 and 21. The mode line stays: it says what Delete WILL do
          before the button is pressed, and the three modes read differently on
          purpose — a Recycle Bin delete and an index-only one are not the same
          promise. The control below is the act; this is the label. */}
      <p className="fa-details-note">
        {t(`filesApp.delete.mode.${deleteModeFor(selected.location)}`)}
      </p>
      <FilesDeletionControls
        item={selected}
        session={deletionSession}
        t={t}
        /* A trashed file is gone from disk, so the index must be rebuilt rather
           than filtered; `refresh` forces that. A soft delete also lands here,
           where the rebuild is harmless and keeps one path for both. */
        onChanged={refresh}
        onNotice={setDeleteNotice}
      />
      {revealNote ? (
        <p className="fa-details-note" role="status">
          {revealNote}
        </p>
      ) : null}
    </div>
  ) : (
    <div className="fa-details fa-details-summary">
      <h2 className="fa-details-title">{scopeLabel ?? t('filesApp.summary.title')}</h2>
      <dl className="fa-details-list">
        <dt>{t('filesApp.summary.shown')}</dt>
        <dd>{t('filesApp.summary.itemCount', { count: visible.length })}</dd>
        <dt>{t('filesApp.summary.totalSize')}</dt>
        <dd>
          {/* `formatSize(null, …)` rather than a literal em dash: `format.ts`
              owns that decision ("a store with no size and a genuinely empty
              file must not print the same") and a second copy of the glyph is
              exactly the drift that file was extracted to stop. */}
          {folderSummary.sizedCount === 0
            ? formatSize(null, t, lang)
            : folderSummary.unsizedCount === 0
              ? formatSize(folderSummary.bytes, t, lang)
              : t('filesApp.summary.sizePartial', {
                  size: formatSize(folderSummary.bytes, t, lang),
                  count: folderSummary.unsizedCount,
                })}
        </dd>
        {folderSummary.kinds.map(([kind, count]) => (
          <Fragment key={kind}>
            <dt>{t(`filesApp.kind.${kind}`)}</dt>
            <dd>{t('filesApp.summary.itemCount', { count })}</dd>
          </Fragment>
        ))}
        {folderSummary.kindsTotal > folderSummary.kinds.length ? (
          <>
            <dt>{t('filesApp.summary.otherKinds')}</dt>
            <dd>
              {t('filesApp.summary.kindCount', {
                count: folderSummary.kindsTotal - folderSummary.kinds.length,
              })}
            </dd>
          </>
        ) : null}
      </dl>
      {folderSummary.broken > 0 ? (
        <p className="fa-details-note fa-summary-broken">
          {t('filesApp.summary.broken', { count: folderSummary.broken })}
        </p>
      ) : null}
      {/* Gate 7's other half, said out loud. `NOTEBOOK_STREAM_ABSORPTION` has
          recorded since the Notebook was deleted that two of its fourteen
          streams have no Files enumerator at all — the Jiten plan-to-read store
          and live-caption scripts. A count that silently omits them looks
          complete, which is the dishonest state: the whole point of the table is
          that "indexed" and "reachable" are different columns. So each one is
          named here WITH the app that still owns it, which is also why this is
          not a defect report — nothing was lost, only not indexed. */}
      {UNINDEXED_STREAMS.length > 0 ? (
        <div className="fa-summary-unindexed">
          <p className="fa-details-note">
            {t('filesApp.summary.unindexed', { count: UNINDEXED_STREAMS.length })}
          </p>
          <ul>
            {UNINDEXED_STREAMS.map((row) => (
              <li key={row.stream} data-stream={row.stream}>
                {t('filesApp.summary.unindexedStream', {
                  // The Notebook's own labels, which outlived its section on
                  // purpose; a second set of names for the same fourteen streams
                  // is exactly the drift i18n hides well.
                  name: t(`notebook.stream.${row.stream}`),
                  app: t(`palette.section.${row.route}`),
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* The original empty state, kept verbatim and kept LAST: the summary
          answers "what is in here", this answers "why is there nothing else". */}
      <p className="fa-state">{t('filesApp.state.noSelection')}</p>
    </div>
  );

  /* ---------------------------- dock ---------------------------- */

  const onPanel = scope !== null && isFilesPanelCategory(scope);

  /**
   * Gate 25's statement. The list has already refreshed by the time this
   * renders — this says WHY it changed, with the number the gate asks for.
   * Seconds are passed as a number so `t()` can format them for the locale; a
   * `toFixed` string here would opt the value out of i18n entirely.
   */
  const watchNotice = watch.arrivals.length ? (
    <span className="fa-watch-arrived">
      {t('filesApp.watch.arrived', {
        count: watch.arrivals.length,
        name: watch.arrivals[watch.arrivals.length - 1].entry.name,
        seconds:
          Math.round(watch.arrivals[watch.arrivals.length - 1].elapsedMs / 100) / 10,
      })}
      <button
        type="button"
        className="fa-watch-dismiss"
        onClick={watch.clearArrivals}
        title={t('filesApp.watch.dismiss')}
      >
        {t('filesApp.watch.dismiss')}
      </button>
    </span>
  ) : null;

  const dock = (
    <div className="fa-status" role="status">
      {onPanel ? (
        // "0 items, total 0 B" is true of a panel and says nothing; the honest
        // line names where these numbers came from instead.
        <span>{t('filesApp.system.movedFromSettings')}</span>
      ) : (
        <>
          <span>{t('filesApp.status.items', { count: visible.length })}</span>
          <span>{t('filesApp.status.size', { size: formatSize(totalSize, t, lang) })}</span>
          {selected ? <span>{t('filesApp.status.selected', { name: selected.name })}</span> : null}
          {watch.roots.length ? (
            <span className="fa-watch-count">
              {t('filesApp.watch.watching', { count: watch.roots.length })}
            </span>
          ) : null}
          {watchNotice}
        </>
      )}
      {/* Outside the panel branch on purpose: a delete receipt is about an item,
          and the panels have no items — but it must still be here rather than
          in the inspector, which the delete itself unmounts. */}
      <FilesDeletionReceipt
        notice={deleteNotice}
        session={deletionSession}
        t={t}
        onChanged={refresh}
        onNotice={setDeleteNotice}
      />
    </div>
  );

  return (
    <>
    <LiquidAppScaffold
      className={`fa-shell${onPanel ? ' fa-shell-panel' : ''}`}
      rail={rail}
      railLabel={t('filesApp.tree.label')}
      toolbar={toolbar}
      // A panel occupies the whole canvas and has no per-row selection, so the
      // inspector is dropped rather than left showing "nothing selected" beside
      // a screen where selecting is not a thing that happens.
      inspector={onPanel ? undefined : inspector}
      inspectorLabel={t('filesApp.details.label')}
      dock={dock}
    >
      {canvas}
    </LiquidAppScaffold>
    {scanOpen ? (
      <ScanReviewSheet
        onClose={() => setScanOpen(false)}
        // Anything that lands has to reach this window's own list, not just the
        // index bus — the sheet is a sibling, so it cannot assume a remount.
        onImported={refresh}
      />
    ) : null}
    {cleanupOpen ? (
      <CleanupSheet onClose={() => setCleanupOpen(false)} onChanged={refresh} />
    ) : null}
    </>
  );
}

/** Human wording for a location, per store. Never a raw JSON dump. */
function describeLocation(item: FilesItem, t: (k: string, v?: Record<string, string | number>) => string): string {
  const loc = item.location;
  switch (loc.store) {
    case 'file':
      return loc.path;
    case 'sqlite':
      return t('filesApp.location.sqlite', { table: loc.table, database: loc.database });
    case 'json':
      return t('filesApp.location.json', { file: loc.file });
    case 'localStorage':
      return t('filesApp.location.localStorage', { key: loc.key });
    case 'derived':
      return t('filesApp.location.derived');
  }
}

export default FilesApp;
