/**
 * Flashcards: saved-word + mined-deck management, the review session, and the
 * mining / CSV / AI-studio sub-tools — shared by Study OS's `FlashcardsView`
 * and Blanc's `BlancFlashcardsPanel`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OWNERSHIP: **Media & Cards** work stream. See BLANC_REFINEMENT_PLAN.md,
 * "Parallel split". The Library & Arcade stream must not edit this file.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pillar 0: `flashcards` was a tab bail-out that mounted `FlashcardsView` inside
 * `BlancViewHost`, dragging `AppChrome` into a Blanc window. This is the largest
 * view in the app and has five mode branches, so it decomposes as one
 * `useFlashcards` hook plus one component per mode. `useFlashcards` owns every
 * bit of state, every deck mutation, and the review-session logic; the mode
 * components render bodies only.
 *
 * Pillar 7: mining is the app's core loop and must stay first-class — the mining
 * sub-tool composes the same `EpubMiningPanel` / `EpubMiningSimplePanel` /
 * `JitenMiningPanel` and the same `flashcards:openEpubMining` handoff, so Blanc
 * mines through the identical path, not a parallel one.
 *
 * `confirmDialog` / `promptDialog` are imported from `ui/dialogService` rather
 * than the `ui` barrel — the barrel re-exports `AppChrome`, which would pull
 * chrome into Blanc's bundle transitively. Nothing here may import
 * `AppChrome`/`MenuBar`/`StatusBar`, nor the aero-only `Toolbar`/`Button`
 * (Study OS's aero overview keeps those and stays in `FlashcardsView`).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type RefObject,
} from 'react';
import { confirmDialog, promptDialog } from '../ui/dialogService';
import { ContextualSurface } from '../liquid/LiquidSurface';
import Icon from '../Icons';
import WindowedStrip from './WindowedStrip';
import VirtualList from '../VirtualList';
import EpubMiningPanel from '../EpubMiningPanel';
import EpubMiningSimplePanel from '../EpubMiningSimplePanel';
import JitenMiningPanel from '../JitenMiningPanel';
import MiningCataloguePanel from '../MiningCataloguePanel';
import DeckActionMenu from '../DeckActionMenu';
import FlashcardFileMenu from './FlashcardFileMenu';
import AiCardStudio from '../AiCardStudio';
import CsvEditorPanel from '../CsvEditorPanel';
import DeckImportPanel from '../DeckImportPanel';
import './FlashcardsContent.css';
import {
  createDeckFolder,
  deleteDeckFolder,
  filterDeckCards,
  filterDeckByBook,
  groupDeckByBook,
  loadDeck,
  loadDeckFolders,
  onDeckChanged,
  removeDeckCard,
  removeBookGroup,
  renameBookGroup,
  reviewSessionCards,
  reviewSessionCounts,
  dueDeckCards,
  undoLastReview,
  peekReviewUndo,
  searchDeckCards,
  setBookGroupFolder,
  setDeckCardFolder,
  updateDeckCard,
  updateDeckCardAudioBatch,
  reviewDeckCard,
  setDeckFolders,
  type DeckFlashcard,
  type DeckFolderFilter,
  type BookGroup,
} from '../../flashcardDeck';
import {
  LOCAL_SRS_RELEARN_MINUTES,
  type LocalSrsState,
  type LocalSrsRating,
} from '../../../shared/localSrs';
import { previewSchedule } from '../../../shared/flashcardScheduling';
import { loadSchedulingConfig } from '../../flashcardScheduling';
import {
  audioReviewPoolStatus,
  planFlashcardReview,
  type FlashcardPromptKind,
  type FlashcardReviewMode,
} from '../../../shared/flashcardReview';
import { flashcardAudioErrorKey } from '../../../shared/flashcardAudioMessages';
import { cardAudio } from '../../cardAudioPlayback';
import { TranscriptionCardDeckStatus } from '../media/TranscriptionCardOptions';
import AutoAudioPreferencesPanel from './AutoAudioPreferences';
import AutoReadingPreferencesPanel from './AutoReadingPreferences';
import CardVoicePicker from './CardVoicePicker';
import DeckAudioExport from './DeckAudioExport';
import SchedulingPreferencesPanel from './SchedulingPreferences';
import AnkiQueueStatus from './AnkiQueueStatus';
import LearnMode from './LearnMode';
import MatchMode from './MatchMode';
import TestMode from './TestMode';
import WriteMode from './WriteMode';
import { PRACTICE_MODES, type PracticeMode } from '../../../shared/flashcardPractice';
import { preferredVoiceFor } from '../../flashcardVoicePreference';
import { normalizeStudyLang } from '../../../shared/studyLang';
import { cardContentLang, studyContentLang } from '../../studyEnvironment';
import PitchAccentContour from '../lexicon/PitchAccentContour';
import { deckCardsToCsv } from '../../deckExport';
import { loadSaved, loadSavedCards, onSavedChanged, removeSaved, type SavedWord } from '../../savedWords';
import {
  handOffToAgent,
  routeAgentContext,
  savedWordsAgentContext,
  studySessionAgentContext,
} from '../../agentContextHandoff';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../../shared/agentNavigation';
import { registerCommandHandler } from '../../keyboardShortcuts';
import { useT } from '../../i18n';
import { SearchBox, Select, Tabs, Tile, TileList, useWiredMaterials } from '../ui';
import type { LibraryItem } from '../../../shared/types';
import type { BookLevelEstimate } from '../../../shared/bookLevelEstimate';
import type { JitenStore } from '../../../shared/jiten';
import { coverStyleFor } from '../../utils/coverArt';
import { scrollIntoViewReliably } from '../../utils/reliableScroll';
import {
  deckContentFingerprint,
  deckGroupKey,
  enrichDeckLevelEstimates,
  getCachedDeckLevel,
  onDeckLevelInputsChanged,
} from '../../deckLevelEstimate';
import { takeHandoffJson } from '../../pendingHandoff';
import { FLASHCARDS_FOCUS_EVENT, onOpenIntent, takeFlashcardsFocus } from '../../openIntents';

export type Mode = 'overview' | 'review' | 'epub-mining' | 'ai-studio' | 'csv-tool';
export type OverviewTab = 'dictionary' | 'epub';
/**
 * MINING gate 10 added `catalogue`. The other three are all EPUB tools, which
 * is what made this surface epub-only; the catalogue lists every mineable asset
 * across every store. None of the three was removed — a capability that becomes
 * catalogue-only would be the regression the plan forbids.
 */
export type EpubMiningUi = 'simple' | 'advanced' | 'jiten' | 'catalogue';

export interface ReviewCard {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
  front?: string;
  back?: string;
  audioDataUrl?: string;
  audioPath?: string;
  reviewGroup?: string;
  promptKind: FlashcardPromptKind;
  srs?: LocalSrsState;
  /** Only ever set on transcript-derived cards; see `DeckFlashcard`. */
  timingFidelity?: DeckFlashcard['timingFidelity'];
  textProvenance?: DeckFlashcard['textProvenance'];
}

/** Chip label for a recorded text provenance. Absent means "not recorded". */
const TEXT_PROVENANCE_KEYS: Record<
  NonNullable<DeckFlashcard['textProvenance']>,
  string
> = {
  'human-subs': 'flash.provenance.humanSubs',
  'auto-captions': 'flash.provenance.autoCaptions',
  transcript: 'flash.provenance.transcript',
  'book-text': 'flash.provenance.bookText',
};

const reviewCardKey = (card: { id: string }): string => card.id;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Small cover-art tile for a book group, shared by every group-header layout. */
export function BookCoverThumb({
  style,
  className = '',
  level,
  levelAria,
}: {
  style: CSSProperties;
  className?: string;
  level?: BookLevelEstimate;
  levelAria?: string;
}) {
  return (
    <div className={`flash-book-cover ${className}`.trim()} style={style}>
      {level && (
        <span className="cover-level-badge cover-level-badge--thumb" aria-label={levelAria}>
          {level.label}
        </span>
      )}
    </div>
  );
}


export interface FlashcardsState {
  hideAiStudio: boolean;
  saved: SavedWord[];
  deck: DeckFlashcard[];
  setDeck: React.Dispatch<React.SetStateAction<DeckFlashcard[]>>;
  folders: string[];
  mode: Mode;
  setMode: (m: Mode) => void;
  overviewTab: OverviewTab;
  setOverviewTab: (t: OverviewTab) => void;
  folderFilter: DeckFolderFilter;
  setFolderFilter: (f: DeckFolderFilter) => void;
  search: string;
  setSearch: (v: string) => void;
  collapsedBooks: Record<string, boolean>;
  toggleBookGroup: (key: string) => void;
  creatingFolder: boolean;
  folderTriggerRef: RefObject<HTMLButtonElement | null>;
  setCreatingFolder: (v: boolean) => void;
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  folderErr: string;
  setFolderErr: (v: string) => void;
  dropHover: string | null;
  setDropHover: (v: string | null) => void;
  fileMenu: string | null;
  setFileMenu: (v: string | null) => void;
  // review session
  sessionCards: ReviewCard[];
  reviewIndex: number;
  masteredIds: Set<string>;
  exploredIds: Set<string>;
  /**
   * Cards whose answer has been shown this sitting. The review strip names a card only
   * once it is in here: listing every word up front gave away the answer to the card on
   * screen (a sentence prompt sat under a chip reading its own target word).
   */
  revealedIds: Set<string>;
  flipped: boolean;
  cardFx: 'decrypt' | 'resync' | null;
  reviewed: number;
  total: number;
  reviewSource: 'dictionary' | 'epub';
  /** When this sitting began — the identity half of a study-session hand-off. */
  sessionStartedAt: number;
  reviewBookKey: string;
  setReviewBookKey: (v: string) => void;
  reviewDueOnly: boolean;
  setReviewDueOnly: (v: boolean) => void;
  reviewMode: FlashcardReviewMode;
  setReviewMode: (v: FlashcardReviewMode) => void;
  audioBusy: boolean;
  audioCancelling: boolean;
  audioError: string;
  audioCandidateCount: number;
  bookFolderMenu: string | null;
  deckMenuGroup: BookGroup | null;
  setDeckMenuGroup: (g: BookGroup | null) => void;
  epubMiningUi: EpubMiningUi;
  setEpubMiningUi: (v: EpubMiningUi) => void;
  initialMiningBookId: string;
  initialJitenDeckId: number | null;
  deckLevels: Record<string, BookLevelEstimate>;
  stripRef: React.RefObject<HTMLDivElement | null>;
  /** The review surface's root — the keyboard scope of every review shortcut. */
  reviewRootRef: React.RefObject<HTMLDivElement | null>;
  // derived
  epubCards: DeckFlashcard[];
  recentStrip: DeckFlashcard[];
  filteredDeck: DeckFlashcard[];
  bookGroups: BookGroup[];
  epubReviewBooks: BookGroup[];
  epubDueCards: DeckFlashcard[];
  epubReviewCandidates: DeckFlashcard[];
  epubReviewSessionCandidates: DeckFlashcard[];
  /** Size of the session a given source option would start. See D310. */
  reviewSourceCount: (bookKey: string) => number;
  filteredSaved: SavedWord[];
  unknownReviewCards: ReviewCard[];
  knownReviewCards: ReviewCard[];
  current: ReviewCard | null;
  sessionComplete: boolean;
  // handlers
  bookCoverStyle: (bookId: string, bookTitle: string) => CSSProperties;
  refreshJitenCovers: () => void;
  createFolder: () => void;
  removeFolder: (name: string) => void;
  reorderFolder: (dragged: string, target: string) => void;
  onCardDragStart: (e: DragEvent, cardId: string) => void;
  onBookGroupDragStart: (e: DragEvent, bookId: string, bookTitle: string) => void;
  onFolderDrop: (e: DragEvent, folder: string | null) => void;
  startReview: () => void;
  startEpubReview: () => void;
  restartReview: () => void;
  endReview: () => void;
  goToReviewIndex: (index: number) => void;
  shuffleReview: () => void;
  flip: () => void;
  gotIt: () => void;
  hard: () => void;
  easy: () => void;
  again: () => void;
  /** Take back the last rating in this sitting (Ctrl+Z / Undo button). */
  undoRating: () => void;
  canUndoRating: boolean;
  /** Dictionary saves a "Review dictionary" sitting would contain. */
  dictionaryReviewCount: number;
  playCurrentAudio: () => Promise<void>;
  addAudioToCurrent: () => Promise<void>;
  addAudioToReviewPool: () => Promise<void>;
  cancelAudioBatch: () => void;
  openEpubMining: (ui: EpubMiningUi) => void;
  startReviewForGroup: (group: BookGroup) => void;
  saveGroupCsv: (group: BookGroup) => Promise<void>;
  exportAllEpubCsv: () => Promise<void>;
  removeBookDeck: (bookId: string, bookTitle: string) => Promise<void>;
  moveBookToFolder: (bookId: string, bookTitle: string, folder: string | null) => void;
  renameBookDeck: (bookId: string, bookTitle: string) => Promise<void>;
}

export function useFlashcards(hideAiStudio = false): FlashcardsState {
  const { t } = useT();
  const [saved, setSaved] = useState<SavedWord[]>(() => loadSaved());
  const [deck, setDeck] = useState<DeckFlashcard[]>(() => loadDeck());
  const [folders, setFolders] = useState<string[]>(() => loadDeckFolders());
  const [mode, setMode] = useState<Mode>('overview');
  const [overviewTab, setOverviewTab] = useState<OverviewTab>('epub');
  const [folderFilter, setFolderFilter] = useState<DeckFolderFilter>('all');
  const [search, setSearch] = useState('');
  const [collapsedBooks, setCollapsedBooks] = useState<Record<string, boolean>>({});
  const [creatingFolder, setCreatingFolder] = useState(false);
  const folderTriggerRef = useRef<HTMLButtonElement>(null);
  const wasCreatingFolder = useRef(false);
  useEffect(() => {
    if (wasCreatingFolder.current && !creatingFolder) {
      folderTriggerRef.current?.focus({ preventScroll: true });
    }
    wasCreatingFolder.current = creatingFolder;
  }, [creatingFolder]);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderErr, setFolderErr] = useState('');
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [fileMenu, setFileMenu] = useState<string | null>(null);

  const [sessionCards, setSessionCards] = useState<ReviewCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(() => new Set());
  const [exploredIds, setExploredIds] = useState<Set<string>>(() => new Set());
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const reviewRootRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  // WIRED decrypt/resync card effects (§5.5) — transient class, wired-gated.
  const wiredFx = useWiredMaterials();
  const [cardFx, setCardFx] = useState<'decrypt' | 'resync' | null>(null);
  const cardFxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireCardFx = (fx: 'decrypt' | 'resync', ms: number): void => {
    if (!wiredFx) return;
    if (cardFxTimer.current) clearTimeout(cardFxTimer.current);
    setCardFx(fx);
    window.dispatchEvent(new CustomEvent(fx === 'decrypt' ? 'wired:decrypt' : 'wired:sync-fail'));
    cardFxTimer.current = setTimeout(() => setCardFx(null), ms);
  };
  useEffect(
    () => () => {
      if (cardFxTimer.current) clearTimeout(cardFxTimer.current);
    },
    [],
  );
  const [reviewed, setReviewed] = useState(0);
  const [total, setTotal] = useState(0);
  const [reviewSource, setReviewSource] = useState<'dictionary' | 'epub'>('dictionary');
  const [sessionStartedAt, setSessionStartedAt] = useState(0);
  const [reviewBookKey, setReviewBookKey] = useState<string>('all');
  const [reviewDueOnly, setReviewDueOnly] = useState(true);
  const [reviewMode, setReviewMode] = useState<FlashcardReviewMode>('mixed');
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioCancelling, setAudioCancelling] = useState(false);
  const [audioError, setAudioError] = useState('');
  const audioBatchRef = useRef<{ id: string; cancelled: boolean } | null>(null);
  const [bookFolderMenu] = useState<string | null>(null);
  const [deckMenuGroup, setDeckMenuGroup] = useState<BookGroup | null>(null);
  const [epubMiningUi, setEpubMiningUi] = useState<EpubMiningUi>('simple');
  const [initialMiningBookId, setInitialMiningBookId] = useState('');
  const [initialJitenDeckId, setInitialJitenDeckId] = useState<number | null>(null);
  /** JLPT/HSK badges keyed by deck group id (`bookId::bookTitle`). */
  const [deckLevels, setDeckLevels] = useState<Record<string, BookLevelEstimate>>({});
  const levelEnrichCancel = useRef({ cancelled: false });
  const stripRef = useRef<HTMLDivElement>(null);

  // Cover art sources for book-group thumbnails: local Library covers keyed
  // by LibraryItem.id, and cached Jiten deck covers keyed by jitenDeckId
  // (see main/jiten.ts's cacheDeckCover). Both are looked up by DeckFlashcard.bookId.
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [jitenCoverPaths, setJitenCoverPaths] = useState<Record<number, string>>({});

  const libraryCoverById = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const item of libraryItems) map.set(item.id, item.coverPath);
    return map;
  }, [libraryItems]);

  function refreshJitenCovers(): void {
    void window.api.jitenGetStore().then((store: JitenStore) => {
      const next: Record<number, string> = {};
      for (const entry of store.plan) {
        if (entry.jitenDeckId != null && entry.coverCachePath)
          next[entry.jitenDeckId] = entry.coverCachePath;
      }
      setJitenCoverPaths(next);
    });
  }

  function bookCoverStyle(bookId: string, bookTitle: string): CSSProperties {
    const deckId = bookId.startsWith('jiten-') ? Number(bookId.slice('jiten-'.length)) : NaN;
    const coverPath = Number.isFinite(deckId)
      ? jitenCoverPaths[deckId]
      : libraryCoverById.get(bookId);
    return coverStyleFor(bookTitle, coverPath, bookId);
  }

  useEffect(() => onSavedChanged(() => setSaved(loadSaved())), []);
  useEffect(
    () =>
      onDeckChanged(() => {
        setDeck(loadDeck());
        setFolders(loadDeckFolders());
      }),
    [],
  );
  useEffect(() => {
    void window.api.listLibrary().then(setLibraryItems);
    return window.api.onLibraryChanged(setLibraryItems);
  }, []);
  useEffect(refreshJitenCovers, []);

  // Every card in the deck, dictionary saves included.
  //
  // This used to exclude `source: 'dictionary'`, back when a dictionary save
  // lived in its own store. That exclusion also hid every card Study Mode
  // writes from lookup history (it labels them `dictionary`), so they appeared
  // nowhere. Dictionary saves are real deck cards now (savedWords.ts), so they
  // are listed, counted and reviewed like the rest; the Dictionary tab is a
  // view of the same cards, not a second collection.
  const epubCards = deck;
  const recentStrip = useMemo(() => epubCards.slice(0, 24), [epubCards]);
  // Search narrows the *visible* deck (explorer, counts, CSV export) but not the
  // review pool below — a session is scoped by folder + book picker, not by
  // whatever happens to be typed in the find box.
  const filteredDeck = useMemo(
    () => searchDeckCards(filterDeckCards(epubCards, folderFilter), search),
    [epubCards, folderFilter, search],
  );
  const filteredSaved = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return saved;
    return saved.filter((w) =>
      [w.word, w.reading, w.meaning].some((field) => field?.toLowerCase().includes(q)),
    );
  }, [saved, search]);
  const bookGroups = useMemo(() => groupDeckByBook(filteredDeck), [filteredDeck]);
  const epubReviewBooks = useMemo(() => groupDeckByBook(epubCards), [epubCards]);
  const epubReviewPool = useMemo(
    () => filterDeckCards(epubCards, folderFilter),
    [epubCards, folderFilter],
  );
  // Due now, with the profile's new-cards-per-day allowance applied.
  const epubDueCards = useMemo(() => dueDeckCards(epubReviewPool), [epubReviewPool]);
  const epubReviewCandidates = useMemo(() => {
    const pool = filterDeckByBook(epubReviewPool, reviewBookKey);
    return reviewDueOnly ? dueDeckCards(pool) : pool;
  }, [epubReviewPool, reviewBookKey, reviewDueOnly]);
  const epubReviewSessionCandidates = useMemo(
    () => reviewSessionCards(epubReviewPool, reviewBookKey, reviewDueOnly, reviewMode),
    [epubReviewPool, reviewBookKey, reviewDueOnly, reviewMode],
  );
  /**
   * What the source picker labels each option with: the size of the session that
   * option would start, asked through the same predicate the Start review button
   * uses. D310 — it used to read off `filteredDeck`, which the find box narrows
   * and the session ignores.
   */
  const reviewSourceCounts = useMemo(
    () => reviewSessionCounts(epubReviewPool, reviewDueOnly, reviewMode),
    [epubReviewPool, reviewDueOnly, reviewMode],
  );
  const reviewSourceCount = useCallback(
    (bookKey: string) => reviewSourceCounts.get(bookKey) ?? 0,
    [reviewSourceCounts],
  );
  const audioCandidateCount = useMemo(
    () => epubReviewCandidates.filter((card) => !card.audioDataUrl && !card.audioPath).length,
    [epubReviewCandidates],
  );

  // A book's level is a property of its cards in the folder, not of whatever the
  // find box narrows it to: keyed on the search-filtered groups, every keystroke
  // changed every fingerprint and re-ran the estimate for each visible book.
  const levelGroups = useMemo(() => groupDeckByBook(epubReviewPool), [epubReviewPool]);

  // Seed deck level badges from cache, then idle-enrich missing estimates.
  useEffect(() => {
    const seed: Record<string, BookLevelEstimate> = {};
    for (const g of levelGroups) {
      const id = deckGroupKey(g.bookId, g.bookTitle);
      const cached = getCachedDeckLevel(id, deckContentFingerprint(g.cards));
      if (cached) seed[id] = cached;
    }
    setDeckLevels(seed);

    levelEnrichCancel.current.cancelled = true;
    const signal = { cancelled: false };
    levelEnrichCancel.current = signal;
    void enrichDeckLevelEstimates(
      levelGroups,
      (deckId, estimate) => {
        if (signal.cancelled) return;
        setDeckLevels((prev) => (prev[deckId] === estimate ? prev : { ...prev, [deckId]: estimate }));
      },
      signal,
    );
    return () => {
      signal.cancelled = true;
    };
  }, [levelGroups]);

  useEffect(() => {
    return onDeckLevelInputsChanged(() => {
      setDeckLevels({});
      // Re-trigger enrich by cloning the deck reference.
      setDeck((prev) => [...prev]);
    });
  }, []);

  const unknownReviewCards = useMemo(
    () => sessionCards.filter((c) => !masteredIds.has(c.id)),
    [sessionCards, masteredIds],
  );
  const knownReviewCards = useMemo(
    () => sessionCards.filter((c) => masteredIds.has(c.id)),
    [sessionCards, masteredIds],
  );

  const current = sessionCards[reviewIndex] ?? null;
  const sessionComplete = sessionCards.length > 0 && masteredIds.size >= sessionCards.length;

  /**
   * The dictionary saves a "Review dictionary" sitting draws from. Due cards
   * when the due filter is on (the saves are scheduled like any card now), so
   * the sitting is a real review whose grades are kept.
   */
  const dictionaryReviewPool = useMemo(() => {
    const cards = deck.filter((card) => card.source === 'dictionary' && saved.some((w) => w.word === card.word));
    return reviewDueOnly ? dueDeckCards(cards) : cards;
  }, [deck, saved, reviewDueOnly]);

  function deckToReviewCards(cards: DeckFlashcard[]): ReviewCard[] {
    return planFlashcardReview(cards.map((c) => ({
      id: c.id,
      word: c.word,
      reading: c.reading,
      meaning: c.meaning || c.back || '',
      sentence: c.sentence,
      front: c.front,
      back: c.back,
      audioDataUrl: c.audioDataUrl,
      audioPath: c.audioPath,
      reviewGroup: `${c.bookId ?? c.source}:${c.bookTitle ?? c.folder ?? ''}`,
      srs: c.srs,
      timingFidelity: c.timingFidelity,
      textProvenance: c.textProvenance,
    })), { mode: reviewMode });
  }

  function markRevealed(id: string): void {
    setRevealedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function markExplored(id: string): void {
    setExploredIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function orderReviewCards(cards: ReviewCard[], initialMastered: Set<string>): ReviewCard[] {
    const unknown = shuffle(cards.filter((c) => !initialMastered.has(c.id)));
    const known = cards.filter((c) => initialMastered.has(c.id));
    return [...unknown, ...known];
  }

  function startReviewSession(
    cards: ReviewCard[],
    source: 'dictionary' | 'epub',
    initialMastered: Set<string> = new Set(),
  ): void {
    if (!cards.length) return;
    const ordered = orderReviewCards(cards, initialMastered);
    setReviewSource(source);
    // Stamped once per sitting: it is what gives a study-session hand-off a
    // stable identity, so answering forty cards leaves one shelf entry while
    // tomorrow's review of the same deck leaves a new one.
    setSessionStartedAt(Date.now());
    setSessionCards(ordered);
    setReviewIndex(0);
    setMasteredIds(new Set(initialMastered));
    setExploredIds(new Set(ordered[0] ? [ordered[0].id] : []));
    setRevealedIds(new Set());
    setTotal(ordered.length);
    setReviewed(initialMastered.size);
    setFlipped(false);
    undoStackRef.current = [];
    setUndoDepth(0);
    setMode('review');
  }

  function startReview(): void {
    // Dictionary saves are deck cards: reviewed through the deck path, so
    // Again / Hard / Good / Easy are persisted like every other review. They
    // used to be shown four buttons whose answers were thrown away.
    const pool = dictionaryReviewPool.length ? dictionaryReviewPool : loadSavedCards();
    startReviewSession(deckToReviewCards(pool), 'epub');
  }

  function startEpubReview(): void {
    const pool = epubReviewSessionCandidates;
    const initialMastered = reviewDueOnly
      ? new Set<string>()
      : new Set(pool.filter((c) => c.known).map((c) => c.id));
    startReviewSession(deckToReviewCards(pool), 'epub', initialMastered);
  }

  function restartReview(): void {
    if (reviewSource === 'epub') {
      // The done-state action repeats this sitting's cards even though Good has
      // just moved them beyond the due filter. Starting from candidates here
      // made the button inert as soon as a scheduled session completed.
      startReviewSession(sessionCards, 'epub');
      return;
    }
    startReview();
  }

  function endReview(): void {
    // Leaving the sitting silences it: an autoplayed listening prompt must not
    // keep talking over the deck overview.
    cardAudio.stop();
    setMode('overview');
    setSessionCards([]);
    setReviewIndex(0);
    setMasteredIds(new Set());
    setExploredIds(new Set());
    setRevealedIds(new Set());
    setFlipped(false);
  }

  function goToReviewIndex(index: number): void {
    if (!sessionCards.length) return;
    const next = Math.max(0, Math.min(index, sessionCards.length - 1));
    setReviewIndex(next);
    const card = sessionCards[next];
    if (card) markExplored(card.id);
    setFlipped(false);
  }

  function shuffleReview(): void {
    if (sessionCards.length < 2) return;
    const next = orderReviewCards(sessionCards, masteredIds);
    setSessionCards(next);
    setReviewIndex(0);
    setFlipped(false);
    if (next[0]) setExploredIds(new Set([next[0].id]));
  }

  function flip(): void {
    if (!flipped) {
      fireCardFx('decrypt', 320);
      const card = sessionCards[reviewIndex];
      if (card) markRevealed(card.id);
    }
    setFlipped((f) => !f);
  }

  /**
   * The sitting as it was before each persisted rating, newest last. Undo
   * restores the card's schedule through `undoLastReview` and puts the sitting
   * back exactly here, so the card is in front of the user again, flipped.
   */
  const undoStackRef = useRef<Array<{
    cardId: string;
    sessionCards: ReviewCard[];
    reviewIndex: number;
    masteredIds: Set<string>;
    reviewed: number;
  }>>([]);
  const [undoDepth, setUndoDepth] = useState(0);

  function rememberForUndo(cardId: string): void {
    undoStackRef.current.push({
      cardId,
      sessionCards,
      reviewIndex,
      masteredIds: new Set(masteredIds),
      reviewed,
    });
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setUndoDepth(undoStackRef.current.length);
  }

  function undoRating(): void {
    const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
    // Only when the deck's last review is this sitting's last rating: an undo
    // must never reach into a review made somewhere else.
    if (!snapshot || peekReviewUndo()?.cardId !== snapshot.cardId) return;
    const undone = undoLastReview();
    undoStackRef.current.pop();
    setUndoDepth(undoStackRef.current.length);
    if (!undone) return;
    setDeck(undone.cards);
    const restored = undone.cards.find((c) => c.id === snapshot.cardId);
    setSessionCards(snapshot.sessionCards.map((c) => (
      c.id === snapshot.cardId ? { ...c, srs: restored?.srs } : c
    )));
    setReviewIndex(snapshot.reviewIndex);
    setMasteredIds(snapshot.masteredIds);
    setReviewed(snapshot.reviewed);
    markExplored(snapshot.cardId);
    markRevealed(snapshot.cardId);
    setFlipped(true);
  }

  function accept(rating: Exclude<LocalSrsRating, 'again'>): void {
    const card = sessionCards[reviewIndex];
    if (!card || masteredIds.has(card.id)) return;
    if (reviewSource === 'epub') rememberForUndo(card.id);
    if (wiredFx) window.dispatchEvent(new CustomEvent('wired:sync-ok'));
    const nextMastered = new Set(masteredIds);
    nextMastered.add(card.id);
    setMasteredIds(nextMastered);
    setReviewed((n) => n + 1);
    setFlipped(false);
    if (reviewSource === 'epub') {
      const nextDeck = reviewDeckCard(card.id, rating);
      const reviewedCard = nextDeck.find((candidate) => candidate.id === card.id);
      setDeck(nextDeck);
      if (reviewedCard) {
        setSessionCards((cards) => cards.map((candidate) => (
          candidate.id === card.id ? { ...candidate, srs: reviewedCard.srs } : candidate
        )));
      }
    }
    setSessionCards((cards) => {
      const unknown = cards.filter((c) => !nextMastered.has(c.id));
      const known = cards.filter((c) => nextMastered.has(c.id));
      return [...unknown, ...known];
    });
    if (nextMastered.size >= sessionCards.length) return;
    setReviewIndex(0);
    const firstUnknown = sessionCards.find((c) => !nextMastered.has(c.id));
    if (firstUnknown) markExplored(firstUnknown.id);
  }

  function gotIt(): void {
    accept('good');
  }

  function hard(): void {
    accept('hard');
  }

  function easy(): void {
    accept('easy');
  }

  function again(): void {
    const card = sessionCards[reviewIndex];
    if (!card) return;
    if (reviewSource === 'epub') rememberForUndo(card.id);
    fireCardFx('resync', 260);
    if (reviewSource === 'epub') {
      const nextDeck = reviewDeckCard(card.id, 'again');
      const reviewedCard = nextDeck.find((candidate) => candidate.id === card.id);
      setDeck(nextDeck);
      if (reviewedCard) {
        setSessionCards((cards) => cards.map((candidate) => (
          candidate.id === card.id ? { ...candidate, srs: reviewedCard.srs } : candidate
        )));
      }
    }
    if (masteredIds.has(card.id)) {
      const nextMastered = new Set(masteredIds);
      nextMastered.delete(card.id);
      setMasteredIds(nextMastered);
      setReviewed((n) => Math.max(0, n - 1));
      setSessionCards((cards) => {
        const unknown = cards.filter((c) => !nextMastered.has(c.id));
        const known = cards.filter((c) => nextMastered.has(c.id));
        return [...unknown, ...known];
      });
    } else {
      setSessionCards((cards) => {
        const next = [...cards];
        const [picked] = next.splice(reviewIndex, 1);
        const knownStart = next.findIndex((c) => masteredIds.has(c.id));
        const insertAt = knownStart === -1 ? next.length : knownStart;
        next.splice(insertAt, 0, picked);
        return next;
      });
    }
    setFlipped(false);
  }

  async function resolveAudio(card: ReviewCard): Promise<string | null> {
    if (card.audioDataUrl) return card.audioDataUrl;
    if (!card.audioPath) return null;
    const managed = await window.api.flashcardReadAudio(card.audioPath);
    if (managed.ok && managed.dataUrl) return managed.dataUrl;
    const captured = await window.api.visualNovelReadCaptureAudio(card.audioPath);
    return captured.ok && captured.dataUrl ? captured.dataUrl : null;
  }

  async function playCurrentAudio(): Promise<void> {
    const card = sessionCards[reviewIndex];
    if (!card) return;
    setAudioError('');
    const dataUrl = await resolveAudio(card);
    if (!dataUrl) {
      setAudioError(t('flash.audioUnavailable'));
      return;
    }
    await cardAudio.play(dataUrl).catch(() => setAudioError(t('flash.audioPlaybackFailed')));
  }

  async function addAudioToCurrent(): Promise<void> {
    const card = sessionCards[reviewIndex];
    if (!card || reviewSource !== 'epub' || audioBusy) return;
    setAudioBusy(true);
    setAudioError('');
    try {
      // The card's own language speaks it (absent is Japanese, as stored).
      const lang = normalizeStudyLang(card.studyLang);
      const result = await window.api.flashcardSynthesizeAudio(
        card.sentence || card.word,
        lang,
        preferredVoiceFor(lang),
      );
      if (!result.ok || !result.path) {
        // NOT `result.error`: that is the synthesizer's own English sentence, and it
        // was reaching users reading the app in ja/zh/ru verbatim. The classification
        // main assigns is what carries meaning across languages.
        setAudioError(t(flashcardAudioErrorKey(result.reason)));
        return;
      }
      const nextDeck = updateDeckCard(card.id, { audioPath: result.path });
      setDeck(nextDeck);
      setSessionCards((cards) => cards.map((candidate) => (
        candidate.id === card.id ? { ...candidate, audioPath: result.path } : candidate
      )));
      const data = await window.api.flashcardReadAudio(result.path);
      if (data.ok && data.dataUrl) await cardAudio.play(data.dataUrl).catch(() => undefined);
    } finally {
      setAudioBusy(false);
    }
  }

  async function addAudioToReviewPool(): Promise<void> {
    if (audioBusy) return;
    const candidates = epubReviewCandidates.filter((card) => !card.audioDataUrl && !card.audioPath);
    if (!candidates.length) return;
    setAudioBusy(true);
    setAudioCancelling(false);
    setAudioError('');
    const batch = { id: crypto.randomUUID(), cancelled: false };
    audioBatchRef.current = batch;
    const updates: Array<{ id: string; audioPath: string }> = [];
    let failures = 0;
    let firstReason: unknown;
    try {
      // The OS synthesizer owns one voice device. Sequential generation avoids
      // competing speech engines while still keeping the renderer responsive.
      // One voice per language, read once for the batch; each card speaks in its own language.
      const voices = new Map<string, string | undefined>();
      for (const card of candidates) {
        if (batch.cancelled) break;
        const lang = normalizeStudyLang(card.studyLang);
        if (!voices.has(lang)) voices.set(lang, preferredVoiceFor(lang));
        const result = await window.api.flashcardSynthesizeAudio(
          card.sentence || card.word,
          lang,
          voices.get(lang),
          batch.id,
        );
        if (batch.cancelled || result.reason === 'cancelled') break;
        if (result.ok && result.path) updates.push({ id: card.id, audioPath: result.path });
        else {
          failures += 1;
          if (firstReason === undefined) firstReason = result.reason;
        }
      }
      if (updates.length) setDeck(updateDeckCardAudioBatch(updates));
      if (batch.cancelled) {
        setAudioError(t('flash.audioBatchCancelled', { count: updates.length }));
      }
      // A count alone told the user nothing they could act on. A missing voice fails
      // every card in the batch for one reason, and that reason is the whole answer.
      if (failures) {
        setAudioError(`${t('flash.audioBatchFailed', { count: failures })} ${t(flashcardAudioErrorKey(firstReason))}`);
      }
    } finally {
      if (audioBatchRef.current === batch) audioBatchRef.current = null;
      setAudioCancelling(false);
      setAudioBusy(false);
    }
  }

  function cancelAudioBatch(): void {
    const batch = audioBatchRef.current;
    if (!batch || batch.cancelled) return;
    batch.cancelled = true;
    setAudioCancelling(true);
    void window.api.flashcardCancelSynthesis(batch.id);
  }

  function openEpubMining(ui: EpubMiningUi): void {
    setEpubMiningUi(ui);
    setMode('epub-mining');
  }

  useEffect(() => {
    function consumeMiningHandoff(): void {
      const epub = takeHandoffJson<{ bookId?: string; ui?: 'simple' | 'advanced' }>('epubMining');
      if (epub?.bookId) {
        setInitialMiningBookId(epub.bookId);
        setEpubMiningUi(epub.ui === 'advanced' ? 'advanced' : 'simple');
        setOverviewTab('epub');
        setMode('epub-mining');
      }

      const jiten = takeHandoffJson<{ deckId?: number; title?: string }>('jitenMining');
      if (typeof jiten?.deckId === 'number') {
        setInitialJitenDeckId(jiten.deckId);
        setEpubMiningUi('jiten');
        setOverviewTab('epub');
        setMode('epub-mining');
      }
    }

    consumeMiningHandoff();
    window.addEventListener('flashcards:openEpubMining', consumeMiningHandoff);
    return () => window.removeEventListener('flashcards:openEpubMining', consumeMiningHandoff);
  }, []);

  // "Open" on a deck folder or one card in the Files app: the deck list, filtered to it.
  useEffect(() => {
    function consumeFocus(): void {
      const focus = takeFlashcardsFocus();
      if (!focus) return;
      const card = focus.cardId ? loadDeck().find((entry) => entry.id === focus.cardId) : undefined;
      const folder = focus.folder ?? (card?.folder || null);
      setFolderFilter(folder ?? 'all');
      setSearch(card ? (card.word || card.front || '').trim() : '');
      setOverviewTab('epub');
      setMode('overview');
    }
    consumeFocus();
    return onOpenIntent(FLASHCARDS_FOCUS_EVENT, consumeFocus);
  }, []);

  useEffect(() => {
    if (hideAiStudio && mode === 'ai-studio') setMode('overview');
  }, [hideAiStudio, mode]);

  function toggleBookGroup(key: string): void {
    setCollapsedBooks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function createFolder(): void {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingFolder(false);
      setNewFolderName('');
      setFolderErr('');
      return;
    }
    if (name.toLowerCase() === 'all' || name.toLowerCase() === 'unfiled') {
      setFolderErr(t('flash.reservedName'));
      return;
    }
    if (folders.includes(name)) {
      setFolderFilter(name);
      setCreatingFolder(false);
      setNewFolderName('');
      setFolderErr('');
      return;
    }
    setFolders(createDeckFolder(name));
    setFolderFilter(name);
    setCreatingFolder(false);
    setNewFolderName('');
    setFolderErr('');
  }

  function removeFolder(name: string): void {
    const result = deleteDeckFolder(name);
    setFolders(result.folders);
    setDeck(result.cards);
    if (folderFilter === name) setFolderFilter('all');
  }

  function reorderFolder(dragged: string, target: string): void {
    if (dragged === target || !folders.includes(dragged)) return;
    const next = folders.filter((f) => f !== dragged);
    const idx = next.indexOf(target);
    next.splice(idx === -1 ? next.length : idx, 0, dragged);
    setFolders(setDeckFolders(next));
  }

  function onCardDragStart(e: DragEvent, cardId: string): void {
    e.dataTransfer.setData('app/flashcard', cardId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onBookGroupDragStart(e: DragEvent, bookId: string, bookTitle: string): void {
    e.dataTransfer.setData('app/flash-book', `${bookId}::${bookTitle}`);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onFolderDrop(e: DragEvent, folder: string | null): void {
    e.preventDefault();
    setDropHover(null);
    const bookKey = e.dataTransfer.getData('app/flash-book');
    if (bookKey) {
      const sep = bookKey.indexOf('::');
      const bookId = sep >= 0 ? bookKey.slice(0, sep) : 'unknown';
      const bookTitle = sep >= 0 ? bookKey.slice(sep + 2) : 'Unknown source';
      setDeck(setBookGroupFolder(bookId, bookTitle, folder));
      return;
    }
    const cardId = e.dataTransfer.getData('app/flashcard');
    if (!cardId) return;
    setDeck(setDeckCardFolder(cardId, folder));
  }

  function startReviewForGroup(group: BookGroup): void {
    setReviewBookKey(`${group.bookId}::${group.bookTitle}`);
    setReviewDueOnly(false);
    const initialMastered = new Set(group.cards.filter((c) => c.known).map((c) => c.id));
    startReviewSession(deckToReviewCards(group.cards), 'epub', initialMastered);
    setDeckMenuGroup(null);
    setMode('review');
  }

  async function saveGroupCsv(group: BookGroup): Promise<void> {
    const csv = deckCardsToCsv(group.cards);
    const safe = group.bookTitle.replace(/[^\w -]+/g, '').trim() || 'deck';
    const res = await window.api.miningSaveEpubDeckFile(csv, safe, 'csv');
    if (res.ok && res.path) setDeckMenuGroup(null);
  }

  // File → Export: all EPUB cards in the current folder filter, as one CSV.
  async function exportAllEpubCsv(): Promise<void> {
    if (!filteredDeck.length) return;
    const csv = deckCardsToCsv(filteredDeck);
    await window.api.miningSaveEpubDeckFile(csv, 'flashcards-deck', 'csv');
  }

  async function removeBookDeck(bookId: string, bookTitle: string): Promise<void> {
    const ok = await confirmDialog({
      title: t('flash.deleteDeck'),
      message: t('flash.deleteConfirm', { title: bookTitle }),
      confirmLabel: t('common.remove'),
      danger: true,
    });
    if (!ok) return;
    setDeck(removeBookGroup(bookId, bookTitle));
  }

  function moveBookToFolder(bookId: string, bookTitle: string, folder: string | null): void {
    setDeck(setBookGroupFolder(bookId, bookTitle, folder));
  }

  async function renameBookDeck(bookId: string, bookTitle: string): Promise<void> {
    const next = await promptDialog({
      title: t('flash.renameBook'),
      message: t('flash.renameBook.prompt'),
      defaultValue: bookTitle,
    });
    if (next == null) return;
    setDeck(renameBookGroup(bookId, bookTitle, next));
  }

  useEffect(() => {
    if (mode !== 'review') return undefined;
    const el = stripRef.current?.querySelector<HTMLElement>('[data-review-active="true"]');
    // The strip scrolls HORIZONTALLY, which is why `reliableScroll` looks for a
    // scroller in either axis: an overflow-Y-only search walks past this one.
    return scrollIntoViewReliably(el, { inline: 'center', block: 'nearest' });
  }, [mode, reviewIndex, sessionCards.length]);

  // Review shortcuts — central manager (Settings → Shortcuts rebindable).
  //
  // Scoped to the review surface: Space, the digits, Escape and Ctrl+Z are ordinary keys
  // everywhere else, so they only reach the sitting while the keyboard is on this window.
  // Unscoped, Escape in any other window ended the review and Ctrl+Z in a text field
  // elsewhere took back a rating.
  useEffect(() => {
    if (mode !== 'review') return;
    const scoped = { scope: () => reviewRootRef.current };
    const offs = [
      registerCommandHandler('flashcards.flip', () => {
        flip();
      }, scoped),
      registerCommandHandler('flashcards.end', () => {
        endReview();
      }, scoped),
      registerCommandHandler('flashcards.prev', () => {
        goToReviewIndex(reviewIndex - 1);
      }, scoped),
      registerCommandHandler('flashcards.next', () => {
        goToReviewIndex(reviewIndex + 1);
      }, scoped),
      registerCommandHandler('flashcards.again', () => {
        if (flipped) again();
        else return false;
      }, scoped),
      registerCommandHandler('flashcards.hard', () => {
        if (flipped) hard();
        else return false;
      }, scoped),
      registerCommandHandler('flashcards.gotIt', () => {
        if (flipped) gotIt();
        else return false;
      }, scoped),
      registerCommandHandler('flashcards.easy', () => {
        if (flipped) easy();
        else return false;
      }, scoped),
      registerCommandHandler('flashcards.undo', () => {
        if (undoStackRef.current.length) undoRating();
        else return false;
      }, scoped),
      // Not gated on `flipped`: in audio-only review the prompt IS the audio, so
      // replaying it before the answer is revealed is the whole point of the key.
      registerCommandHandler('flashcards.replayAudio', () => {
        void playCurrentAudio();
      }, scoped),
    ];
    return () => offs.forEach((off) => off());
  }, [mode, flipped, reviewIndex, sessionCards, masteredIds]);

  return {
    hideAiStudio,
    saved,
    deck,
    setDeck,
    folders,
    mode,
    setMode,
    overviewTab,
    setOverviewTab,
    folderFilter,
    setFolderFilter,
    search,
    setSearch,
    collapsedBooks,
    toggleBookGroup,
    creatingFolder,
    setCreatingFolder,
    folderTriggerRef,
    newFolderName,
    setNewFolderName,
    folderErr,
    setFolderErr,
    dropHover,
    setDropHover,
    fileMenu,
    setFileMenu,
    sessionCards,
    reviewIndex,
    masteredIds,
    exploredIds,
    revealedIds,
    flipped,
    cardFx,
    reviewed,
    total,
    reviewSource,
    sessionStartedAt,
    reviewBookKey,
    setReviewBookKey,
    reviewDueOnly,
    setReviewDueOnly,
    reviewMode,
    setReviewMode,
    audioBusy,
    audioCancelling,
    audioError,
    audioCandidateCount,
    bookFolderMenu,
    deckMenuGroup,
    setDeckMenuGroup,
    epubMiningUi,
    setEpubMiningUi,
    initialMiningBookId,
    initialJitenDeckId,
    deckLevels,
    stripRef,
    reviewRootRef,
    epubCards,
    recentStrip,
    filteredDeck,
    bookGroups,
    epubReviewBooks,
    epubDueCards,
    epubReviewCandidates,
    epubReviewSessionCandidates,
    reviewSourceCount,
    filteredSaved,
    unknownReviewCards,
    knownReviewCards,
    current,
    sessionComplete,
    bookCoverStyle,
    refreshJitenCovers,
    createFolder,
    removeFolder,
    reorderFolder,
    onCardDragStart,
    onBookGroupDragStart,
    onFolderDrop,
    startReview,
    startEpubReview,
    restartReview,
    endReview,
    goToReviewIndex,
    shuffleReview,
    flip,
    gotIt,
    hard,
    easy,
    again,
    undoRating,
    canUndoRating: undoDepth > 0,
    dictionaryReviewCount: dictionaryReviewPool.length,
    playCurrentAudio,
    addAudioToCurrent,
    addAudioToReviewPool,
    cancelAudioBatch,
    openEpubMining,
    startReviewForGroup,
    saveGroupCsv,
    exportAllEpubCsv,
    removeBookDeck,
    moveBookToFolder,
    renameBookDeck,
  };
}

/** The review session: the flip card, the progress strip, and the done state. */
export function FlashcardReviewMode({ state }: { state: FlashcardsState }) {
  const { t } = useT();
  const {
    current,
    sessionComplete,
    total,
    reviewed,
    reviewSource,
    reviewBookKey,
    epubReviewBooks,
    sessionCards,
    reviewIndex,
    exploredIds,
    revealedIds,
    unknownReviewCards,
    knownReviewCards,
    flipped,
    cardFx,
    sessionStartedAt,
  } = state;

  useEffect(() => {
    if (current?.promptKind === 'listening') void state.playCurrentAudio();
  }, [current?.id, current?.promptKind]);

  // Each strip chip looked its own index up with findIndex: O(n²) per render.
  const sessionIndexById = useMemo(
    () => new Map(sessionCards.map((card, index) => [card.id, index] as const)),
    [sessionCards],
  );

  /**
   * "Ask about how this session went" — a different gesture from asking about the
   * saved-word list, which is why it lives here rather than in the overview.
   *
   * The counts are the material and they are `personal`: how someone is
   * performing is not reference data, so the item is session-only and its
   * identity is hashed. `studySessionAgentContext` keys that identity on the deck
   * plus this sitting's start, so answering forty cards leaves one shelf entry.
   */
  const askAgentAboutSession = (): void => {
    if (total === 0) return;
    const deckName = reviewSource === 'epub' && reviewBookKey !== 'all'
      ? epubReviewBooks.find((g) => `${g.bookId}::${g.bookTitle}` === reviewBookKey)?.bookTitle
        ?? t('flash.session.deck')
      : t('flash.session.deck');
    void handOffToAgent(
      studySessionAgentContext(
        deckName,
        t('flash.session.summary', { reviewed, total }),
        sessionStartedAt,
      ),
      t('agent.conversation.fromStudySession'),
      routeAgentContext('flashcards', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.flashcards)),
    );
  };

  function reviewStripCard(card: ReviewCard, mastered: boolean): JSX.Element {
    const i = sessionIndexById.get(card.id) ?? -1;
    const active = i === reviewIndex;
    // A chip names its card only once that card's answer has been shown: the word and
    // reading ARE the answer to a sentence, meaning or listening prompt.
    const named = revealedIds.has(card.id);
    if (!named) {
      return (
        <button
          key={card.id}
          type="button"
          role="listitem"
          data-review-active={active ? 'true' : undefined}
          data-review-hidden="true"
          className={`flash-strip-card flash-review-strip-card${active ? ' active' : ''}${mastered ? ' mastered' : ''}`}
          onClick={() => state.goToReviewIndex(i)}
          title={t('flash.review.hiddenCardTitle', { position: i + 1 })}
        >
          <span className="flash-strip-word">
            {card.promptKind === 'listening'
              ? t('flash.audioCardShort')
              : t('flash.review.hiddenCard', { position: i + 1 })}
          </span>
        </button>
      );
    }
    return (
      <button
        key={card.id}
        type="button"
        role="listitem"
        data-review-active={active ? 'true' : undefined}
        className={`flash-strip-card flash-review-strip-card${active ? ' active' : ''}${mastered ? ' mastered' : ''}`}
        onClick={() => state.goToReviewIndex(i)}
        title={card.word}
      >
        <span className="flash-strip-word" lang={cardContentLang(card)}>
          {card.word}
        </span>
        {card.reading && card.reading !== card.word && (
          <span className="flash-strip-reading" lang={cardContentLang(card)}>
            {card.reading}
          </span>
        )}
      </button>
    );
  }

  if (sessionComplete || !current) {
    return (
      <div className="flash-view" ref={state.reviewRootRef}>
        <div className="flash-done">
          <div className="flash-done-emoji">
            <Icon name="confetti" size={44} />
          </div>
          <h2>{t('flash.sessionComplete')}</h2>
          <p className="muted">{t('flash.reviewedCount', { count: total })}</p>
          <div className="flash-done-actions">
            <button className="btn primary" onClick={state.restartReview}>
              {t('flash.reviewAgain')}
            </button>
            <button data-ai-entry className="btn" onClick={askAgentAboutSession}>
              {t('flash.askAgent')}
            </button>
            <button className="btn" onClick={state.endReview}>
              {t('flash.done')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pct = total ? (reviewed / total) * 100 : 0;
  // One preview through the seam rather than three direct scheduler calls, so
  // the button labels move when the algorithm setting does.
  const nextIntervals = reviewSource === 'epub'
    ? previewSchedule(current.srs, loadSchedulingConfig())
    : null;
  const nextGoodInterval = nextIntervals ? nextIntervals.good : null;
  const nextHardInterval = nextIntervals ? nextIntervals.hard : null;
  const nextEasyInterval = nextIntervals ? nextIntervals.easy : null;
  const reviewTitle =
    reviewSource === 'epub' && reviewBookKey !== 'all'
      ? epubReviewBooks.find((g) => `${g.bookId}::${g.bookTitle}` === reviewBookKey)?.bookTitle
      : null;

  return (
    <div className="flash-view review" ref={state.reviewRootRef}>
      <div className="flash-review-shell">
        <div className="flash-review-top">
          <button className="btn small" onClick={state.endReview}>
            <Icon name="chevron" size={13} style={{ transform: 'rotate(180deg)', marginRight: 4, verticalAlign: '-2px' }} />
            {t('flash.exit')}
          </button>
          {reviewTitle && <span className="flash-review-source muted">{reviewTitle}</span>}
          <div className="flash-progress">
            <div className="flash-progress-bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="flash-progress-text">
              {reviewed} / {total}
            </span>
          </div>
          <button
            type="button"
            className="btn small flash-review-shuffle"
            onClick={state.shuffleReview}
            disabled={sessionCards.length < 2}
            title={t('flash.shuffleTitle')}
          >
            <Icon name="shuffle" size={14} />
            {t('flash.shuffle')}
          </button>
        </div>

        <p className="flash-review-explored">
          {t('flash.exploredCount', { explored: exploredIds.size, total: sessionCards.length })}
        </p>

        <div className="flash-review-nav" ref={state.stripRef}>
          {unknownReviewCards.length > 0 && (
            <div className="flash-review-group flash-review-group-unknown">
              <span className="flash-review-group-label">
                {t('flash.dontKnowGroup', { count: unknownReviewCards.length })}
              </span>
              <WindowedStrip
                className="flash-strip flash-review-strip"
                items={unknownReviewCards}
                itemKey={reviewCardKey}
                activeKey={current?.id}
                renderItem={(card) => reviewStripCard(card, false)}
              />
            </div>
          )}
          {knownReviewCards.length > 0 && (
            <div className="flash-review-group flash-review-group-known">
              <span className="flash-review-group-label">
                {t('flash.knowGroup', { count: knownReviewCards.length })}
              </span>
              <WindowedStrip
                className="flash-strip flash-review-strip"
                items={knownReviewCards}
                itemKey={reviewCardKey}
                activeKey={current?.id}
                renderItem={(card) => reviewStripCard(card, true)}
              />
            </div>
          )}
          {sessionCards.length > 1 && (
            <label className="flash-review-slider">
              <span className="muted">{t('flash.slideToCard')}</span>
              <input
                type="range"
                min={0}
                max={sessionCards.length - 1}
                value={reviewIndex}
                onChange={(e) => state.goToReviewIndex(Number(e.target.value))}
              />
              <span className="flash-review-slider-pos">
                {reviewIndex + 1} / {sessionCards.length}
              </span>
            </label>
          )}
        </div>

        <div className="flash-audio-tools">
          {(current.audioDataUrl || current.audioPath) ? (
            <button type="button" className="btn small" onClick={() => void state.playCurrentAudio()}>
              <Icon name="player" size={13} />
              {t('flash.replayAudio')}
            </button>
          ) : reviewSource === 'epub' ? (
            <button
              type="button"
              className="btn small"
              disabled={state.audioBusy}
              onClick={() => void state.addAudioToCurrent()}
            >
              <Icon name="player" size={13} />
              {state.audioBusy ? t('flash.addingAudio') : t('flash.addAudio')}
            </button>
          ) : null}
          {/*
            The clip on an estimated card really does contain the sentence, but its
            seconds were placed inside a fixed chunk window rather than measured. Say
            so where the audio controls are, not in a tooltip nobody opens.
          */}
          {current.textProvenance && (
            <span className="flash-card-provenance">
              {t(TEXT_PROVENANCE_KEYS[current.textProvenance])}
            </span>
          )}
          {current.timingFidelity === 'chunk-estimated' && (
            <span className="flash-audio-estimated" title={t('flash.timing.estimated.detail')}>
              {t('flash.timing.estimated')}
            </span>
          )}
          {state.audioError && <span className="flash-audio-error" role="status">{state.audioError}</span>}
        </div>

        <div className={`flash-card${cardFx ? ` is-${cardFx}` : ''}`} onClick={flipped ? undefined : state.flip}>
          {!flipped && current.promptKind === 'listening' ? (
            <div className="flash-listening-prompt">
              <span className="flash-prompt-kind">{t('flash.prompt.listening')}</span>
              <button
                type="button"
                className="btn primary"
                onClick={(event) => {
                  event.stopPropagation();
                  void state.playCurrentAudio();
                }}
              >
                <Icon name="player" size={16} />
                {t('flash.replayAudio')}
              </button>
            </div>
          ) : !flipped && current.promptKind === 'recall' ? (
            <>
              <span className="flash-prompt-kind">{t('flash.prompt.recall')}</span>
              <span className="flash-meaning flash-recall-prompt">
                {current.meaning || current.back || t('flash.noMeaningSaved')}
              </span>
            </>
          ) : !flipped ? (
            <>
              <span className="flash-prompt-kind">
                {t(current.promptKind === 'comprehension'
                  ? 'flash.prompt.comprehension'
                  : 'flash.prompt.reading')}
              </span>
              {/*
                A comprehension prompt is a whole SENTENCE, so it cannot ride the single-word type
                ramp: `.flash-review-shell .flash-word` is clamp(42px, 8vw, 64px), and measured live
                a 266-character sentence rendered 1,870px tall in a 545px viewport. The recall
                prompt already solves this the same way one branch above (`flash-recall-prompt`);
                this is that pattern, not a new one.
              */}
              <span
                className={`flash-word${current.promptKind === 'comprehension' ? ' flash-sentence-prompt' : ''}`}
                lang={cardContentLang(current)}
              >
                {current.promptKind === 'comprehension'
                  ? current.sentence || current.front || current.word
                  : current.word}
              </span>
            </>
          ) : (
            <span className="flash-word" lang={cardContentLang(current)}>{current.word}</span>
          )}
          {flipped ? (
            <div className="flash-answer">
              {current.reading && current.reading !== current.word && (
                <span className="flash-reading" lang={cardContentLang(current)}>
                  {current.reading}
                </span>
              )}
              {/* Japanese pitch accent from the installed pitch dictionary; nothing for zh/ru
                  (tones and stress are in the reading) or when the word has no entry. */}
              <PitchAccentContour
                className="flash-pitch"
                word={current.word}
                reading={current.reading}
                lang={normalizeStudyLang(current.studyLang)}
              />
              {current.sentence && current.sentence !== current.word && (
                <span className="flash-sentence" lang={cardContentLang(current)}>{current.sentence}</span>
              )}
              <span className="flash-meaning">{current.meaning || t('flash.noMeaningSaved')}</span>
            </div>
          ) : (
            <span className="flash-tap-hint">{t('flash.tapToReveal')}</span>
          )}
        </div>

        {flipped ? (
          <div className="flash-actions">
            <button className="btn flash-again" onClick={state.again}>
              {t('flash.rating.again')}
              {reviewSource === 'epub' && (
                <span className="flash-srs-hint">
                  {t('flash.srs.againDue', { minutes: LOCAL_SRS_RELEARN_MINUTES })}
                </span>
              )}
            </button>
            <button className="btn flash-hard" onClick={state.hard}>
              {t('flash.rating.hard')}
              {nextHardInterval != null && (
                <span className="flash-srs-hint">
                  {t('flash.srs.daysDue', { days: nextHardInterval })}
                </span>
              )}
            </button>
            <button className="btn primary flash-got" onClick={state.gotIt}>
              {t('flash.rating.good')}
              {nextGoodInterval != null && (
                <span className="flash-srs-hint">
                  {t('flash.srs.goodDue', { days: nextGoodInterval })}
                </span>
              )}
            </button>
            <button className="btn flash-easy" onClick={state.easy}>
              {t('flash.rating.easy')}
              {nextEasyInterval != null && (
                <span className="flash-srs-hint">
                  {t('flash.srs.daysDue', { days: nextEasyInterval })}
                </span>
              )}
            </button>
          </div>
        ) : (
          <div className="flash-actions">
            <button className="btn primary" onClick={state.flip}>
              {t('flash.showAnswer')}
            </button>
          </div>
        )}
        {state.canUndoRating && (
          <div className="flash-undo-row">
            <button
              type="button"
              className="btn small flash-undo"
              onClick={state.undoRating}
              title={t('flash.undoRating.hint')}
            >
              {t('flash.undoRating')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** EPUB / advanced / Jiten mining sub-tool. */
export function FlashcardMiningMode({ state }: { state: FlashcardsState }) {
  const { t } = useT();
  const { epubMiningUi, hideAiStudio } = state;

  return (
    <div className="flash-view flash-view-mining">
      <ContextualSurface className="view-head">
        <p className="muted">{t('flash.mining.intro')}</p>
        <div className="actions">
          <button className="btn" onClick={() => state.setMode('overview')}>
            {t('flash.backToDecks')}
          </button>
          {!hideAiStudio && (
            <button className="btn" data-ai-entry onClick={() => state.setMode('ai-studio')}>
              {t('flash.aiCardStudio')}
            </button>
          )}
        </div>
      </ContextualSurface>

      <ContextualSurface className="flash-tabs epub-mining-mode-tabs">
        <button
          type="button"
          className={`flash-tab${epubMiningUi === 'simple' ? ' active' : ''}`}
          onClick={() => state.setEpubMiningUi('simple')}
        >
          {t('flash.tab.simple')}
        </button>
        <button
          type="button"
          className={`flash-tab${epubMiningUi === 'advanced' ? ' active' : ''}`}
          onClick={() => state.setEpubMiningUi('advanced')}
        >
          {t('flash.tab.advanced')}
        </button>
        <button
          type="button"
          className={`flash-tab${epubMiningUi === 'jiten' ? ' active' : ''}`}
          onClick={() => state.setEpubMiningUi('jiten')}
        >
          Jiten
        </button>
        {/* MINING gate 10. The other three tabs are EPUB tools; this one lists
            every mineable asset in the index, which is what stops this surface
            being epub-only. It is added beside them, never in place of one. */}
        <button
          type="button"
          className={`flash-tab${epubMiningUi === 'catalogue' ? ' active' : ''}`}
          onClick={() => state.setEpubMiningUi('catalogue')}
        >
          {t('flash.tab.catalogue')}
        </button>
      </ContextualSurface>

      <p className="epub-mining-mode-lead muted">
        {epubMiningUi === 'simple'
          ? t('flash.mining.simpleLead')
          : epubMiningUi === 'advanced'
            ? t('flash.mining.advancedLead')
            : epubMiningUi === 'catalogue'
              ? t('flash.mining.catalogueLead')
              : 'Download a Jiten vocabulary deck for a planned title and save it into your local deck library.'}
      </p>

      {epubMiningUi === 'simple' ? (
        <EpubMiningSimplePanel
          initialBookId={state.initialMiningBookId}
          onDeckSaved={() => {
            state.setMode('overview');
            state.setOverviewTab('epub');
          }}
        />
      ) : epubMiningUi === 'advanced' ? (
        <EpubMiningPanel
          initialBookId={state.initialMiningBookId}
          onDeckSaved={() => {
            state.setMode('overview');
            state.setOverviewTab('epub');
          }}
        />
      ) : epubMiningUi === 'catalogue' ? (
        // Stays on the Mining surface after a mine, deliberately: the whole
        // point of a catalogue is mining several assets in one sitting, and
        // bouncing to the deck overview after each one would undo that.
        <MiningCataloguePanel onMined={() => state.setDeck(loadDeck())} />
      ) : (
        <JitenMiningPanel
          initialDeckId={state.initialJitenDeckId}
          onDeckSaved={() => {
            state.setMode('overview');
            state.setOverviewTab('epub');
            state.setDeck(loadDeck());
            state.refreshJitenCovers();
            // The deck's cover finishes downloading shortly after this fires
            // (JitenMiningPanel caches it fire-and-forget) — pick it up once it lands.
            setTimeout(state.refreshJitenCovers, 2500);
          }}
        />
      )}
    </div>
  );
}

/** CSV editor sub-tool. */
export function FlashcardCsvMode({ state }: { state: FlashcardsState }) {
  const { t } = useT();
  return (
    <div className="flash-view flash-view-mining">
      <ContextualSurface className="view-head">
        <p className="muted">{t('flash.csv.intro')}</p>
        <div className="actions">
          <button className="btn" onClick={() => state.setMode('overview')}>
            {t('flash.backToDecks')}
          </button>
          <button className="btn" onClick={() => state.openEpubMining('advanced')}>
            {t('flash.epubMining')}
          </button>
        </div>
      </ContextualSurface>
      <CsvEditorPanel
        onDeckImported={() => {
          state.setMode('overview');
          state.setOverviewTab('epub');
        }}
      />
    </div>
  );
}

/** AI card studio sub-tool. Renders nothing when hidden (Blanc mode). */
export function FlashcardAiMode({ state }: { state: FlashcardsState }) {
  const { t } = useT();
  if (state.hideAiStudio) return null;
  return (
    <div className="flash-view flash-view-mining">
      <ContextualSurface className="view-head">
        <p className="muted">{t('flash.aiStudio.intro')}</p>
        <div className="actions">
          <button className="btn" onClick={() => state.setMode('overview')}>
            {t('flash.backToDecks')}
          </button>
          <button className="btn" onClick={() => state.openEpubMining('advanced')}>
            {t('flash.epubMining')}
          </button>
        </div>
      </ContextualSurface>
      <AiCardStudio
        onDeckImported={() => {
          state.setDeck(loadDeck());
          state.setMode('overview');
          state.setOverviewTab('epub');
        }}
      />
    </div>
  );
}

// Fixed row heights for the two VirtualList-backed rows below (Pillar 1 item
// 4 — decks were observed at 3,000+ cards, all rendered unvirtualized).
// `.flash-row-sentence` is line-clamped to 2 lines specifically so this row's
// height has a real ceiling; CARD_ROW_HEIGHT is that ceiling plus the 8px gap
// `.flash-group-body`/`.flash-list` used to provide via flex `gap` (VirtualList
// renders each row in its own fixed-height slot, not a flex child, so the gap
// has to be baked into the slot instead).
const CARD_ROW_HEIGHT = 108;
const CARD_LIST_MAX_HEIGHT = 420;
const SAVED_ROW_HEIGHT = 64;
const SAVED_LIST_MAX_HEIGHT = 560;

/**
 * The default (non-aero) deck overview: import panel, mining promo, review
 * setup, recent strip, and the deck explorer with folders and book groups.
 * Study OS's aero overview is a distinct layout that keeps `Toolbar`/`Button`
 * and stays in `FlashcardsView`; both shells share this one.
 */
/**
 * How many saved words one hand-off may carry.
 *
 * Someone with four thousand mined words must not send all of them to a provider
 * because they clicked one button — the same rule `mediaCueAgentContext` records
 * for a subtitle scene, where "this line" must not become "this episode". The
 * most recently saved are the ones taken, because they are what the user has
 * been working on.
 */
const ASK_AGENT_SAVED_LIMIT = 40;

/**
 * What audio-only review will really do with this selection.
 *
 * Without it, choosing "Audio only" either silently shrank the sitting to
 * whichever cards happen to have clips, or greyed out Start with no stated
 * reason — while the button that fixes it sits directly alongside.
 */
function AudioPoolNote({ state }: { state: FlashcardsState }) {
  const { t } = useT();
  const status = audioReviewPoolStatus(
    state.epubReviewCandidates.length,
    state.epubReviewSessionCandidates.length,
  );
  if (status.kind === 'empty') return null;

  return (
    <p className="flash-audio-pool-note muted" role="status">
      {status.kind === 'none' && t('flash.audioPool.none', { total: status.total })}
      {status.kind === 'partial' && t('flash.audioPool.partial', {
        usable: status.usable,
        dropped: status.dropped,
      })}
      {status.kind === 'all' && t('flash.audioPool.all', { usable: status.usable })}
    </p>
  );
}

export function FlashcardDeckOverview({ state }: { state: FlashcardsState }) {
  const { t, lang } = useT();
  const {
    saved,
    epubCards,
    overviewTab,
    folders,
    folderFilter,
    filteredDeck,
    filteredSaved,
    search,
    bookGroups,
    epubReviewBooks,
    epubReviewSessionCandidates,
    reviewSourceCount,
    recentStrip,
    reviewBookKey,
    reviewDueOnly,
    reviewMode,
    collapsedBooks,
    creatingFolder,
    newFolderName,
    folderErr,
    dropHover,
    fileMenu,
    bookFolderMenu,
    deckLevels,
    deckMenuGroup,
    hideAiStudio,
  } = state;

  // The practice modes are opened and closed here rather than through the mode
  // machine: each is a self-contained surface over the same deck, and routing
  // one through `setMode` would tear down the overview it sits inside. One
  // piece of state, not one boolean each, so two modes can never be open at
  // once and every one of them exits back to the same place.
  const [practice, setPractice] = useState<PracticeMode>('none');

  // The source picker's options, built once per deck/folder/filter change: typing
  // in the find box re-renders this view, and the picker does not depend on it.
  const reviewSourceOptions = useMemo(
    () => [
      <option key="all" value="all">{t('flash.allInFolder', { count: reviewSourceCount('all') })}</option>,
      ...epubReviewBooks.map((group) => {
        const key = `${group.bookId}::${group.bookTitle}`;
        return (
          <option key={key} value={key}>
            {group.bookTitle} ({reviewSourceCount(key)})
          </option>
        );
      }),
    ],
    // `lang`, not `t`: t's identity is stable across a language switch.
    [epubReviewBooks, reviewSourceCount, lang],
  );

  /**
   * Which local deck a practice sitting draws from.
   *
   * Separate from `folderFilter`, which drives the deck EXPLORER above. Reusing
   * that one would mean browsing a folder silently changed what the next round
   * practises, and closing a search would silently change it back.
   */
  const [practiceDeck, setPracticeDeck] = useState<DeckFolderFilter>('all');
  const practiceDeckChoices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of state.deck) counts.set(card.folder ?? '', (counts.get(card.folder ?? '') ?? 0) + 1);
    return [
      { value: 'all', label: t('flash.practice.deckAll'), count: state.deck.length },
      { value: 'unfiled', label: t('flash.practice.deckUnfiled'), count: counts.get('') ?? 0 },
      ...folders.map((folder) => ({
        value: folder,
        label: folder,
        count: counts.get(folder) ?? 0,
      })),
    ];
    // `lang`, not `t`: a memo that depends on `t` goes stale across a language
    // switch (CLAUDE.md §6).
  }, [state.deck, folders, lang]);
  const practiceDeckSize = practiceDeckChoices.find((c) => c.value === practiceDeck)?.count ?? 0;

  /**
   * The saved-word list, bounded, with the place it came from attached.
   *
   * Not a `useCallback`: it calls `t()`, and depending on `t` is the documented
   * way to go stale across a language switch (CLAUDE.md §6).
   */
  const askAgent = (): void => {
    if (saved.length === 0) return;
    const words = saved
      .slice(0, ASK_AGENT_SAVED_LIMIT)
      .map((entry) => entry.word);
    void handOffToAgent(
      savedWordsAgentContext(words, t('flash.askAgent.shelf')),
      t('agent.conversation.fromFlashcards'),
      routeAgentContext('flashcards', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.flashcards)),
    );
  };

  return (
    <div className="flash-view flash-view-decks">
      <ContextualSurface className="view-head">
        <p className="muted">{t('flash.overview.intro')}</p>
        <div className="actions">
          <button className="btn primary" onClick={() => state.openEpubMining('simple')}>
            {t('flash.simpleEpubMining')}
          </button>
          {/*
            A disabled control has to say what would enable it. Measured 2026-09-03 with
            `probes/cat8-honest-states.cjs`: on an empty profile this window painted 10 disabled
            controls and 5 of them carried no explanation anywhere a user or a screen reader
            could reach — no title, no `aria-describedby`, and nothing but other buttons' captions
            beside them. The hint is rendered, not just an attribute, because a `title` on a
            disabled button is not reliably shown at all (pointer events are suppressed), which
            would have been a fix only the probe could see.
          */}
          <button
            className="btn primary"
            onClick={state.startReview}
            disabled={saved.length === 0}
            aria-describedby={saved.length === 0 ? 'flash-review-dict-blocked' : undefined}
          >
            {saved.length
              ? t('flash.reviewDictionaryCount', { count: state.dictionaryReviewCount || saved.length })
              : t('flash.reviewDictionary')}
          </button>
          {/*
            Five specialist entries used to sit flat beside the two the overview is
            actually for, so the first thing this window asked of a user was to read
            seven launchers and work out which one meant "start". Everything is still
            here and one keystroke away; nothing is removed, disabled or renamed, and
            the disclosure opens and closes without touching stored state.
          */}
          <details className="flash-more-tools">
            <summary className="btn">{t('flash.moreTools')}</summary>
            <div className="flash-more-tools-body">
              <button className="btn" onClick={() => state.openEpubMining('advanced')}>
                {t('flash.advancedEpub')}
              </button>
              <button className="btn" onClick={() => state.openEpubMining('jiten')}>
                {t('flash.jitenVocab')}
              </button>
              <button className="btn" onClick={() => state.setMode('csv-tool')}>
                {t('flash.csvTool')}
              </button>
              {!hideAiStudio && (
                <button className="btn" data-ai-entry onClick={() => state.setMode('ai-studio')}>
                  {t('flash.aiCardStudio')}
                </button>
              )}
              <button data-ai-entry
                className="btn"
                onClick={askAgent}
                disabled={saved.length === 0}
                aria-describedby={saved.length === 0 ? 'flash-review-dict-blocked' : undefined}
              >
                {t('flash.askAgent')}
              </button>
            </div>
          </details>
        </div>
        {saved.length === 0 && (
          <p className="muted" id="flash-review-dict-blocked">
            {t('flash.reviewDictionary.blocked')}
          </p>
        )}
      </ContextualSurface>

      <TranscriptionCardDeckStatus />
      <AnkiQueueStatus deck={state.deck} />

      {/*
        Five preference panels used to sit open, stacked, above the deck itself. Measured
        2026-09-03 with `probes/cat5-ui-clarity.cjs`: the overview asked a user to scan **26**
        controls at rest against the rubric's bar of 12, and 24 of the 26 were these panels'
        checkboxes, caps, selects and sweeps — settings, not the thing the window is for.
        Same defect in the other instrument: the deck view was **3,186px** tall before a card
        was ever shown. Folded behind the same `<details>` the specialist launchers already
        use, so the semantics, keyboard path and screen-reader state come from the element
        rather than being re-implemented. Nothing is removed, disabled or renamed, the
        disclosure touches no stored state, and the status panel above stays open because a
        state a user has not asked for must not be hidden behind one.
      */}
      <details className="flash-deck-prefs">
        <summary className="btn">{t('flash.deckPreferences')}</summary>
        <div className="flash-deck-prefs-body">
          <CardVoicePicker />
          <AutoAudioPreferencesPanel />
          <AutoReadingPreferencesPanel />
          <SchedulingPreferencesPanel />
          <DeckAudioExport />
        </div>
      </details>

      {practice === 'match' && <MatchMode deck={practiceDeck} onExit={() => setPractice('none')} />}
      {practice === 'write' && <WriteMode deck={practiceDeck} onExit={() => setPractice('none')} />}
      {practice === 'learn' && <LearnMode deck={practiceDeck} onExit={() => setPractice('none')} />}
      {practice === 'test' && <TestMode deck={practiceDeck} onExit={() => setPractice('none')} />}
      {/*
        The practice launcher: four mode tiles on the window surface, not a bordered
        fieldset inside the window's own panel. Every tile has the same shape (icon, name,
        one line of what it drills), so no caption sits under one button and beside the
        next. The tile's accessible name is its action ("Start learning"); the line below
        the name is its description.
      */}
      {practice === 'none' && (
        <section className="flash-practice" aria-labelledby="flash-practice-title">
          <div className="flash-practice__head">
            <div className="flash-practice__intro">
              <h2 id="flash-practice-title" className="flash-section-title">
                {t('flash.practice.title')}
              </h2>
              <p className="muted">{t('flash.practice.lead')}</p>
            </div>
            <label className="flash-practice__deck">
              <span className="muted">{t('flash.practice.deck')}</span>
              {/* The count is on the option, not a footnote: a mode that refuses
                  a four-card deck is only honest if the four was visible first. */}
              <Select
                value={practiceDeck}
                onChange={(event) => setPracticeDeck(event.currentTarget.value)}
              >
                {practiceDeckChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {t('flash.practice.deckOption', { name: choice.label, count: choice.count })}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <TileList className="flash-practice__modes">
            {PRACTICE_MODES.map((entry) => (
              <li key={entry.id}>
                <Tile
                  className="flash-practice__tile"
                  disabled={practiceDeckSize === 0}
                  aria-label={t(entry.startKey)}
                  icon={<Icon name={entry.icon} size={18} />}
                  title={t(entry.titleKey)}
                  description={t(entry.aboutKey)}
                  onClick={() => setPractice(entry.id)}
                />
              </li>
            ))}
          </TileList>
          {practiceDeckSize === 0 && (
            <p className="flash-practice__empty muted" role="status">{t('flash.practice.emptyDeck')}</p>
          )}
        </section>
      )}

      {/* The card collections: the design system's tab strip and search field, so this
          window's controls read like every other window's. */}
      <ContextualSurface className="flash-collections">
        <Tabs
          className="flash-collection-tabs"
          aria-label={t('flash.tabs.label')}
          value={overviewTab}
          onChange={(id) => state.setOverviewTab(id === 'dictionary' ? 'dictionary' : 'epub')}
          tabs={[
            { id: 'epub', label: t('flash.tab.epubDecks', { count: epubCards.length }) },
            { id: 'dictionary', label: t('flash.tab.dictionary', { count: saved.length }) },
          ]}
        />
        <div className="flash-searchbar">
          <SearchBox
            className="flash-search"
            value={search}
            onChange={(e) => state.setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') state.setSearch('');
            }}
            placeholder={t('flash.search.placeholder')}
            aria-label={t('flash.search.aria')}
          />
          {search && (
            <>
              <span className="flash-search-count muted" role="status">
                {overviewTab === 'epub'
                  ? t('flash.search.matchCount', { count: filteredDeck.length })
                  : t('flash.search.matchCount', { count: filteredSaved.length })}
              </span>
              <button
                type="button"
                className="btn small flash-search-clear"
                title={t('flash.search.clear')}
                aria-label={t('flash.search.clear')}
                onClick={() => state.setSearch('')}
              >
                <Icon name="close" size={14} />
              </button>
            </>
          )}
        </div>
      </ContextualSurface>

      <DeckImportPanel onImported={() => state.setDeck(loadDeck())} />

      {overviewTab === 'epub' ? (
        <>
          <section className="anki-card epub-mine-promo">
            <div className="flash-strip-head">
              <h2 className="flash-section-title">{t('flash.mineFromEpub')}</h2>
              <span className="muted">{t('flash.mineFromEpub.hint')}</span>
            </div>
            <p className="epub-mine-promo-text">{t('flash.mineFromEpub.text')}</p>
            <button type="button" className="btn primary epub-mine-promo-btn" onClick={() => state.openEpubMining('simple')}>
              {t('flash.openSimpleMining')}
            </button>
          </section>

          <section className="anki-card flash-review-setup">
            <div className="flash-strip-head">
              <h2 className="flash-section-title">{t('flash.studySession')}</h2>
              <span className="muted">{t('flash.studySession.hint')}</span>
            </div>
            <div className="flash-review-setup-grid">
              <label>
                {t('flash.epubSource')}
                <Select value={reviewBookKey} onChange={(e) => state.setReviewBookKey(e.target.value)}>
                  {/*
                    D310: every number here is the size of the session that option
                    would start, via the same `reviewSessionCards` the Start review
                    button uses. It read off `filteredDeck` before — folder AND the
                    find box — so a query matching nothing showed "All in current
                    folder (0)" directly above "Start review (4)". The per-book
                    `inFolder || group.cards.length` fallback was the other half of
                    it: a book with nothing in scope printed its whole-deck total
                    rather than the 0 it actually offers.
                  */}
                  {reviewSourceOptions}
                </Select>
              </label>
              <label className="flash-review-setup-check">
                <input
                  type="checkbox"
                  checked={reviewDueOnly}
                  onChange={(e) => state.setReviewDueOnly(e.target.checked)}
                />
                {t('flash.dueOnly')}
              </label>
              <label>
                {t('flash.reviewMode')}
                <Select
                  value={reviewMode}
                  onChange={(event) => state.setReviewMode(event.target.value as FlashcardReviewMode)}
                >
                  <option value="mixed">{t('flash.reviewMode.mixed')}</option>
                  <option value="text">{t('flash.reviewMode.text')}</option>
                  <option value="audio">{t('flash.reviewMode.audio')}</option>
                </Select>
              </label>
              {reviewMode === 'audio' && <AudioPoolNote state={state} />}
              <button
                type="button"
                className="btn"
                disabled={state.audioCandidateCount === 0 || state.audioBusy}
                onClick={() => void state.addAudioToReviewPool()}
                aria-describedby={
                  state.audioCandidateCount === 0 || state.audioBusy ? 'flash-add-audio-blocked' : undefined
                }
              >
                <Icon name="player" size={13} />
                {state.audioBusy
                  ? t('flash.addingAudio')
                  : t('flash.addAudioToDeck', { count: state.audioCandidateCount })}
              </button>
              {(state.audioCandidateCount === 0 || state.audioBusy) && (
                <p className="muted" id="flash-add-audio-blocked">
                  {state.audioBusy ? t('flash.addAudio.blockedBusy') : t('flash.addAudio.blockedNone')}
                </p>
              )}
              {state.audioBusy && (
                <button
                  type="button"
                  className="btn"
                  disabled={state.audioCancelling}
                  onClick={state.cancelAudioBatch}
                >
                  {state.audioCancelling ? t('flash.audioCancelling') : t('common.cancel')}
                </button>
              )}
              <button
                type="button"
                className="btn primary"
                disabled={epubReviewSessionCandidates.length === 0}
                onClick={state.startEpubReview}
                aria-describedby={
                  epubReviewSessionCandidates.length === 0 ? 'flash-start-review-blocked' : undefined
                }
              >
                {epubReviewSessionCandidates.length
                  ? t('flash.startReviewCount', { count: epubReviewSessionCandidates.length })
                  : t('flash.startReview')}
              </button>
              {epubReviewSessionCandidates.length === 0 && (
                <p className="muted" id="flash-start-review-blocked">
                  {t('flash.startReview.blocked')}
                </p>
              )}
            </div>
            {state.audioError && <p className="flash-audio-error" role="status">{state.audioError}</p>}
          </section>

          <section className="flash-strip-section anki-card">
            <div className="flash-strip-head">
              <h2 className="flash-section-title">{t('flash.recentCards')}</h2>
              <span className="muted">{t('flash.recentCards.hint')}</span>
            </div>
            {recentStrip.length === 0 ? (
              <p className="muted flash-strip-empty">{t('flash.recentCards.empty')}</p>
            ) : (
              <div className="flash-strip" role="list">
                {recentStrip.map((card) => (
                  <article key={card.id} className="flash-strip-card" role="listitem">
                    <span className="flash-strip-word" lang={cardContentLang(card)}>
                      {card.word}
                    </span>
                    {card.reading && card.reading !== card.word && (
                      <span className="flash-strip-reading" lang={cardContentLang(card)}>
                        {card.reading}
                      </span>
                    )}
                    <span className="flash-strip-meaning">{card.meaning || card.back || '—'}</span>
                    {card.bookTitle && <span className="flash-strip-source muted">{card.bookTitle}</span>}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="flash-explorer anki-card">
            <div className="flash-explorer-head">
              <h2 className="flash-section-title">{t('flash.deckExplorer')}</h2>
              <span className="muted">{t('flash.deckExplorer.hint')}</span>
            </div>

            <div className="lib-folders flash-folders">
              <button
                type="button"
                className={`lib-folder-chip ${folderFilter === 'all' ? 'active' : ''}`}
                onClick={() => state.setFolderFilter('all')}
                aria-pressed={folderFilter === 'all'}
              >
                {t('flash.all')}
                <span className="lib-chip-count">{epubCards.length}</span>
              </button>
              <button
                type="button"
                onClick={() => state.setFolderFilter('unfiled')}
                aria-pressed={folderFilter === 'unfiled'}
                onDragOver={(e) => {
                  e.preventDefault();
                  state.setDropHover('unfiled');
                }}
                onDragLeave={() => state.setDropHover(null)}
                onDrop={(e) => state.onFolderDrop(e, null)}
                className={`lib-folder-chip ${folderFilter === 'unfiled' ? 'active' : ''} ${dropHover === 'unfiled' ? 'dragover' : ''}`}
              >
                {t('flash.unfiled')}
                <span className="lib-chip-count">{epubCards.filter((c) => !c.folder).length}</span>
              </button>
              {folders.map((folder) => (
                <span
                  key={folder}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('app/flash-folder', folder)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    state.setDropHover(folder);
                  }}
                  onDragLeave={() => state.setDropHover(null)}
                  onDrop={(e) => {
                    const draggedFolder = e.dataTransfer.getData('app/flash-folder');
                    if (draggedFolder && draggedFolder !== folder) {
                      void state.reorderFolder(draggedFolder, folder);
                      return;
                    }
                    state.onFolderDrop(e, folder);
                  }}
                  className={`lib-folder-chip flash-folder-chip-group ${folderFilter === folder ? 'active' : ''} ${dropHover === folder ? 'dragover' : ''}`}
                >
                  <button
                    type="button"
                    className="flash-folder-chip-select"
                    aria-pressed={folderFilter === folder}
                    onClick={() => state.setFolderFilter(folder)}
                  >
                    {folder}
                    <span className="lib-chip-count">{epubCards.filter((c) => c.folder === folder).length}</span>
                  </button>
                  <button
                    type="button"
                    className="lib-chip-del"
                    title={t('flash.deleteFolder')}
                    aria-label={t('flash.deleteFolder')}
                    onClick={(e) => {
                      e.stopPropagation();
                      state.removeFolder(folder);
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {creatingFolder ? (
                <span className="lib-folder-chip lib-folder-editor">
                  <input
                    className="lib-folder-input"
                    value={newFolderName}
                    onChange={(e) => state.setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') state.createFolder();
                      if (e.key === 'Escape') {
                        state.setCreatingFolder(false);
                        state.setNewFolderName('');
                        state.setFolderErr('');
                      }
                    }}
                    placeholder={t('flash.folderNamePlaceholder')}
                    aria-label={t('flash.folderNamePlaceholder')}
                    autoFocus
                  />
                  <button type="button" className="btn small" onClick={state.createFolder}>
                    {t('flash.add')}
                  </button>
                </span>
              ) : (
                <button ref={state.folderTriggerRef} type="button" className="lib-folder-chip lib-folder-new" onClick={() => state.setCreatingFolder(true)}>
                  {t('flash.newFolder')}
                </button>
              )}
            </div>
            {folderErr && <div className="lib-folder-err">{folderErr}</div>}

            {filteredDeck.length === 0 ? (
              // This was a bare muted paragraph: neither the surface's own empty-state treatment
              // (which review mode already renders) nor a way back out of the filter that emptied
              // the list. An empty state that names its cause owes the reader the undo for it.
              <div className="flash-empty flash-empty-inline">
                <p className="muted">
                  {search ? t('flash.search.noMatches', { query: search }) : t('flash.noCardsInView')}
                </p>
                {search ? (
                  <button type="button" className="btn small" onClick={() => state.setSearch('')}>
                    {t('flash.search.clear')}
                  </button>
                ) : folderFilter !== 'all' ? (
                  <button type="button" className="btn small" onClick={() => state.setFolderFilter('all')}>
                    {t('flash.deck.showAllCards')}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flash-groups">
                {bookGroups.map((group) => {
                  const groupKey = `${group.bookId}::${group.bookTitle}`;
                  // While searching, force groups open — a collapsed group would
                  // hide the very match the user is looking for.
                  const collapsed = search ? false : (collapsedBooks[groupKey] ?? false);
                  return (
                    <div key={groupKey} className="flash-group">
                      <div
                        className="flash-group-head flash-group-head-row"
                        draggable
                        onDragStart={(e) => state.onBookGroupDragStart(e, group.bookId, group.bookTitle)}
                      >
                        <div
                          className="flash-group-head-toggle"
                          role="button"
                          tabIndex={0}
                          onClick={() => state.toggleBookGroup(groupKey)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') state.toggleBookGroup(groupKey);
                          }}
                          aria-expanded={!collapsed}
                        >
                          <span className="flash-group-chevron" aria-hidden />
                          <BookCoverThumb
                            className="flash-group-cover"
                            style={state.bookCoverStyle(group.bookId, group.bookTitle)}
                            level={deckLevels[groupKey]}
                            levelAria={
                              deckLevels[groupKey]
                                ? t('flash.deck.levelAria', { level: deckLevels[groupKey].label })
                                : undefined
                            }
                          />
                          <span
                            className="flash-group-title flash-group-title-btn"
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              state.setDeckMenuGroup(group);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                state.setDeckMenuGroup(group);
                              }
                            }}
                          >
                            {group.bookTitle}
                          </span>
                          <span className="muted flash-group-count">{t('flash.cardsCount', { count: group.cards.length })}</span>
                          <span className="muted flash-group-known">
                            {t('flash.knownCount', { count: group.cards.filter((c) => c.known).length })}
                          </span>
                        </div>
                        <div className="flash-group-head-actions">
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => state.setDeckMenuGroup(group)}
                          >
                            {t('flash.options')}
                          </button>
                          <button
                            type="button"
                            className="btn small flash-group-delete"
                            onClick={() => state.removeBookDeck(group.bookId, group.bookTitle)}
                          >
                            {t('flash.deleteDeck')}
                          </button>
                          {bookFolderMenu === groupKey && (
                            <div className="flash-file-menu flash-book-folder-menu">
                              <button type="button" onClick={() => state.moveBookToFolder(group.bookId, group.bookTitle, null)}>
                                {t('flash.unfiled')}
                              </button>
                              {folders.map((folder) => (
                                <button
                                  key={folder}
                                  type="button"
                                  onClick={() => state.moveBookToFolder(group.bookId, group.bookTitle, folder)}
                                >
                                  {folder}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {!collapsed && (
                        <VirtualList
                          items={group.cards}
                          itemHeight={CARD_ROW_HEIGHT}
                          getKey={(card) => card.id}
                          className="flash-group-body flash-group-body-vlist"
                          listRole="list"
                          itemRole="listitem"
                          style={{ height: Math.min(group.cards.length * CARD_ROW_HEIGHT, CARD_LIST_MAX_HEIGHT) }}
                          renderItem={(card) => (
                            <div
                              className="flash-row flash-row-draggable"
                              draggable
                              onDragStart={(e) => state.onCardDragStart(e, card.id)}
                            >
                              <div className="flash-row-main">
                                <span className="flash-row-word" lang={cardContentLang(card)}>
                                  {card.word}
                                </span>
                                {card.reading && card.reading !== card.word && (
                                  <span className="flash-row-reading" lang={cardContentLang(card)}>
                                    {card.reading}
                                  </span>
                                )}
                                <span className="flash-row-meaning">{card.meaning || card.back || '—'}</span>
                                {card.sentence && <span className="flash-row-sentence muted">{card.sentence}</span>}
                                {typeof card.sourceRef?.episode === 'number' && (
                                  // The deck row already names the show, via the group header it
                                  // sits under. Which *episode* is the part a season harvest of
                                  // 90-odd files records and nothing showed — without it the
                                  // provenance exists only in storage.
                                  <span className="flash-row-episode muted">
                                    {t('flash.row.episode', { episode: card.sourceRef.episode })}
                                  </span>
                                )}
                                {card.folder && <span className="flash-row-folder muted">{card.folder}</span>}
                              </div>
                              <div className="flash-row-actions">
                                <FlashcardFileMenu
                                  open={fileMenu === card.id}
                                  folders={folders}
                                  onOpenChange={(open) => state.setFileMenu(open ? card.id : null)}
                                  onMove={(folder) => state.setDeck(setDeckCardFolder(card.id, folder))}
                                />
                                <button
                                  className="flash-row-x"
                                  title={t('common.remove')} aria-label={t('common.remove')}
                                  onClick={() => state.setDeck(removeDeckCard(card.id))}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : saved.length === 0 ? (
        <div className="flash-empty">
          <div className="flash-empty-emoji">
            <Icon name="flashcards" size={40} />
          </div>
          <h2>{t('flash.noSavedWords')}</h2>
          <p className="muted">{t('flash.noSavedWords.hint')}</p>
        </div>
      ) : filteredSaved.length === 0 ? (
        <div className="flash-empty flash-empty-inline">
          <p className="muted">{t('flash.search.noMatches', { query: search })}</p>
          <button type="button" className="btn small" onClick={() => state.setSearch('')}>
            {t('flash.search.clear')}
          </button>
        </div>
      ) : (
        <VirtualList
          items={filteredSaved}
          itemHeight={SAVED_ROW_HEIGHT}
          getKey={(w) => w.word}
          className="flash-list flash-list-vlist"
          listRole="list"
          itemRole="listitem"
          style={{ height: Math.min(filteredSaved.length * SAVED_ROW_HEIGHT, SAVED_LIST_MAX_HEIGHT) }}
          renderItem={(w) => (
            <div className="flash-row">
              <div className="flash-row-main">
                <span className="flash-row-word" lang={studyContentLang()}>
                  {w.word}
                </span>
                {w.reading && w.reading !== w.word && (
                  <span className="flash-row-reading" lang={studyContentLang()}>
                    {w.reading}
                  </span>
                )}
                <span className="flash-row-meaning">{w.meaning}</span>
              </div>
              <button className="flash-row-x" title={t('common.remove')} aria-label={t('common.remove')} onClick={() => removeSaved(w.word)}>
                ×
              </button>
            </div>
          )}
        />
      )}
      {deckMenuGroup && (
        <DeckActionMenu
          group={deckMenuGroup}
          folders={folders}
          onClose={() => state.setDeckMenuGroup(null)}
          onReview={() => state.startReviewForGroup(deckMenuGroup)}
          onSaveCsv={() => void state.saveGroupCsv(deckMenuGroup)}
          onMoveFolder={(folder) => {
            state.setDeck(setBookGroupFolder(deckMenuGroup.bookId, deckMenuGroup.bookTitle, folder));
            state.setDeckMenuGroup(null);
          }}
          onDelete={() => {
            state.removeBookDeck(deckMenuGroup.bookId, deckMenuGroup.bookTitle);
            state.setDeckMenuGroup(null);
          }}
        />
      )}
    </div>
  );
}
