import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  confirmDialog,
  AppChrome,
  Button,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  useAeroMaterials,
  type MenuBarMenu,
} from '../components/ui';
import Icon from '../components/Icons';
import EpubMiningPanel from '../components/EpubMiningPanel';
import EpubMiningSimplePanel from '../components/EpubMiningSimplePanel';
import DeckActionMenu from '../components/DeckActionMenu';
import AiCardStudio from '../components/AiCardStudio';
import CsvEditorPanel from '../components/CsvEditorPanel';
import DeckImportPanel from '../components/DeckImportPanel';
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
  setBookGroupFolder,
  setDeckCardFolder,
  setDeckCardKnown,
  setDeckFolders,
  type DeckFlashcard,
  type DeckFolderFilter,
  type BookGroup,
} from '../flashcardDeck';
import { deckCardsToCsv } from '../deckExport';
import { loadSaved, onSavedChanged, removeSaved, type SavedWord } from '../savedWords';
import { registerCommandHandler } from '../keyboardShortcuts';

type Mode = 'overview' | 'review' | 'epub-mining' | 'ai-studio' | 'csv-tool';
type OverviewTab = 'dictionary' | 'epub';

interface ReviewCard {
  id: string;
  word: string;
  reading: string;
  meaning: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type EpubMiningUi = 'simple' | 'advanced';

export default function FlashcardsView() {
  const aero = useAeroMaterials();
  const [saved, setSaved] = useState<SavedWord[]>(() => loadSaved());
  const [deck, setDeck] = useState<DeckFlashcard[]>(() => loadDeck());
  const [folders, setFolders] = useState<string[]>(() => loadDeckFolders());
  const [mode, setMode] = useState<Mode>('overview');
  const [overviewTab, setOverviewTab] = useState<OverviewTab>('epub');
  const [folderFilter, setFolderFilter] = useState<DeckFolderFilter>('all');
  const [collapsedBooks, setCollapsedBooks] = useState<Record<string, boolean>>({});
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderErr, setFolderErr] = useState('');
  const [dropHover, setDropHover] = useState<string | null>(null);
  const [fileMenu, setFileMenu] = useState<string | null>(null);

  const [sessionCards, setSessionCards] = useState<ReviewCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(() => new Set());
  const [exploredIds, setExploredIds] = useState<Set<string>>(() => new Set());
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [total, setTotal] = useState(0);
  const [reviewSource, setReviewSource] = useState<'dictionary' | 'epub'>('dictionary');
  const [reviewBookKey, setReviewBookKey] = useState<string>('all');
  const [reviewUnknownOnly, setReviewUnknownOnly] = useState(true);
  const [bookFolderMenu, setBookFolderMenu] = useState<string | null>(null);
  const [deckMenuGroup, setDeckMenuGroup] = useState<BookGroup | null>(null);
  const [epubMiningUi, setEpubMiningUi] = useState<EpubMiningUi>('simple');
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => onSavedChanged(() => setSaved(loadSaved())), []);
  useEffect(
    () =>
      onDeckChanged(() => {
        setDeck(loadDeck());
        setFolders(loadDeckFolders());
      }),
    [],
  );

  const epubCards = useMemo(
    () => deck.filter((c) => c.source === 'epub' || c.source === 'epub-ai' || c.source === 'import' || c.source === 'csv'),
    [deck],
  );
  const recentStrip = useMemo(() => epubCards.slice(0, 24), [epubCards]);
  const filteredDeck = useMemo(() => filterDeckCards(epubCards, folderFilter), [epubCards, folderFilter]);
  const bookGroups = useMemo(() => groupDeckByBook(filteredDeck), [filteredDeck]);
  const epubReviewBooks = useMemo(() => groupDeckByBook(epubCards), [epubCards]);
  const epubReviewCandidates = useMemo(() => {
    const pool = filterDeckByBook(filterDeckCards(epubCards, folderFilter), reviewBookKey);
    if (!reviewUnknownOnly) return pool;
    return pool.filter((c) => !c.known);
  }, [epubCards, folderFilter, reviewBookKey, reviewUnknownOnly]);

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

  function savedToReviewCards(words: SavedWord[]): ReviewCard[] {
    return words.map((w) => ({
      id: `dict:${w.word}`,
      word: w.word,
      reading: w.reading,
      meaning: w.meaning,
    }));
  }

  function deckToReviewCards(cards: DeckFlashcard[]): ReviewCard[] {
    return cards.map((c) => ({
      id: c.id,
      word: c.word,
      reading: c.reading,
      meaning: c.meaning || c.back || '',
    }));
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
    setSessionCards(ordered);
    setReviewIndex(0);
    setMasteredIds(new Set(initialMastered));
    setExploredIds(new Set(ordered[0] ? [ordered[0].id] : []));
    setTotal(ordered.length);
    setReviewed(initialMastered.size);
    setFlipped(false);
    setMode('review');
  }

  function startReview(): void {
    startReviewSession(savedToReviewCards(loadSaved()), 'dictionary');
  }

  function startEpubReview(): void {
    const pool = epubReviewCandidates;
    const initialMastered = reviewUnknownOnly
      ? new Set<string>()
      : new Set(pool.filter((c) => c.known).map((c) => c.id));
    startReviewSession(deckToReviewCards(pool), 'epub', initialMastered);
  }

  function restartReview(): void {
    if (reviewSource === 'epub') {
      const pool = epubReviewCandidates;
      const initialMastered = reviewUnknownOnly
        ? new Set<string>()
        : new Set(pool.filter((c) => c.known).map((c) => c.id));
      startReviewSession(deckToReviewCards(pool), 'epub', initialMastered);
      return;
    }
    startReviewSession(savedToReviewCards(loadSaved()), 'dictionary');
  }

  function endReview(): void {
    setMode('overview');
    setSessionCards([]);
    setReviewIndex(0);
    setMasteredIds(new Set());
    setExploredIds(new Set());
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
    setFlipped((f) => !f);
  }

  function gotIt(): void {
    const card = sessionCards[reviewIndex];
    if (!card || masteredIds.has(card.id)) return;
    const nextMastered = new Set(masteredIds);
    nextMastered.add(card.id);
    setMasteredIds(nextMastered);
    setReviewed((n) => n + 1);
    setFlipped(false);
    if (reviewSource === 'epub') setDeck(setDeckCardKnown(card.id, true));
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

  function again(): void {
    const card = sessionCards[reviewIndex];
    if (!card || sessionCards.length < 2) return;
    if (masteredIds.has(card.id)) {
      const nextMastered = new Set(masteredIds);
      nextMastered.delete(card.id);
      setMasteredIds(nextMastered);
      setReviewed((n) => Math.max(0, n - 1));
      if (reviewSource === 'epub') setDeck(setDeckCardKnown(card.id, false));
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

  function openEpubMining(ui: EpubMiningUi): void {
    setEpubMiningUi(ui);
    setMode('epub-mining');
  }

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
      setFolderErr('That name is reserved.');
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
    setReviewUnknownOnly(false);
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
      title: 'Delete book deck',
      message: `Delete all ${bookTitle} cards from flashcards? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeck(removeBookGroup(bookId, bookTitle));
    setBookFolderMenu(null);
  }

  function moveBookToFolder(bookId: string, bookTitle: string, folder: string | null): void {
    setDeck(setBookGroupFolder(bookId, bookTitle, folder));
    setBookFolderMenu(null);
  }

  function reviewStripCard(card: ReviewCard, mastered: boolean): JSX.Element {
    const i = sessionCards.findIndex((c) => c.id === card.id);
    const active = i === reviewIndex;
    return (
      <button
        key={card.id}
        type="button"
        role="listitem"
        data-review-active={active ? 'true' : undefined}
        className={`flash-strip-card flash-review-strip-card${active ? ' active' : ''}${mastered ? ' mastered' : ''}`}
        onClick={() => goToReviewIndex(i)}
        title={card.word}
      >
        <span className="flash-strip-word" lang="ja">
          {card.word}
        </span>
        {card.reading && card.reading !== card.word && (
          <span className="flash-strip-reading" lang="ja">
            {card.reading}
          </span>
        )}
      </button>
    );
  }

  useEffect(() => {
    if (mode !== 'review') return;
    const el = stripRef.current?.querySelector<HTMLElement>('[data-review-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [mode, reviewIndex, sessionCards.length]);

  // Review shortcuts — central manager (Settings → Shortcuts rebindable).
  useEffect(() => {
    if (mode !== 'review') return;
    const offs = [
      registerCommandHandler('flashcards.flip', () => {
        flip();
      }),
      registerCommandHandler('flashcards.end', () => {
        endReview();
      }),
      registerCommandHandler('flashcards.prev', () => {
        goToReviewIndex(reviewIndex - 1);
      }),
      registerCommandHandler('flashcards.next', () => {
        goToReviewIndex(reviewIndex + 1);
      }),
      registerCommandHandler('flashcards.again', () => {
        if (flipped) again();
        else return false;
      }),
      registerCommandHandler('flashcards.gotIt', () => {
        if (flipped) gotIt();
        else return false;
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [mode, flipped, reviewIndex, sessionCards, masteredIds]);

  if (mode === 'review') {
    if (sessionComplete || !current) {
      return (
        <div className="flash-view">
          <div className="flash-done">
            <div className="flash-done-emoji">
              <Icon name="confetti" size={44} />
            </div>
            <h2>Session complete</h2>
            <p className="muted">
              You reviewed {total} {total === 1 ? 'card' : 'cards'}.
            </p>
            <div className="flash-done-actions">
              <button className="btn primary" onClick={restartReview}>
                Review again
              </button>
              <button className="btn" onClick={endReview}>
                Done
              </button>
            </div>
          </div>
        </div>
      );
    }

    const pct = total ? (reviewed / total) * 100 : 0;
    const reviewTitle =
      reviewSource === 'epub' && reviewBookKey !== 'all'
        ? epubReviewBooks.find((g) => `${g.bookId}::${g.bookTitle}` === reviewBookKey)?.bookTitle
        : null;
    return (
      <div className="flash-view review">
        <div className="flash-review-shell">
          <div className="flash-review-top">
            <button className="btn small" onClick={endReview}>
              <Icon name="chevron" size={13} style={{ transform: 'rotate(180deg)', marginRight: 4, verticalAlign: '-2px' }} />
              Exit
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
              onClick={shuffleReview}
              disabled={sessionCards.length < 2}
              title="Shuffle unknown cards"
            >
              <Icon name="shuffle" size={14} />
              Shuffle
            </button>
          </div>

          <p className="flash-review-explored">
            Flashcards explored: {exploredIds.size} / {sessionCards.length}
          </p>

          <div className="flash-review-nav" ref={stripRef}>
            {unknownReviewCards.length > 0 && (
              <div className="flash-review-group flash-review-group-unknown">
                <span className="flash-review-group-label">
                  Don&apos;t know ({unknownReviewCards.length})
                </span>
                <div className="flash-strip flash-review-strip" role="list">
                  {unknownReviewCards.map((card) => reviewStripCard(card, false))}
                </div>
              </div>
            )}
            {knownReviewCards.length > 0 && (
              <div className="flash-review-group flash-review-group-known">
                <span className="flash-review-group-label">Know ({knownReviewCards.length})</span>
                <div className="flash-strip flash-review-strip" role="list">
                  {knownReviewCards.map((card) => reviewStripCard(card, true))}
                </div>
              </div>
            )}
            {sessionCards.length > 1 && (
              <label className="flash-review-slider">
                <span className="muted">Slide to card</span>
                <input
                  type="range"
                  min={0}
                  max={sessionCards.length - 1}
                  value={reviewIndex}
                  onChange={(e) => goToReviewIndex(Number(e.target.value))}
                />
                <span className="flash-review-slider-pos">
                  {reviewIndex + 1} / {sessionCards.length}
                </span>
              </label>
            )}
          </div>

          <div className="flash-card" onClick={flipped ? undefined : flip}>
          <span className="flash-word" lang="ja">
            {current.word}
          </span>
          {flipped ? (
            <div className="flash-answer">
              {current.reading && current.reading !== current.word && (
                <span className="flash-reading" lang="ja">
                  {current.reading}
                </span>
              )}
              <span className="flash-meaning">{current.meaning || 'No meaning saved.'}</span>
            </div>
          ) : (
            <span className="flash-tap-hint">Tap or press Space to reveal</span>
          )}
        </div>

        {flipped ? (
          <div className="flash-actions">
            <button className="btn flash-again" onClick={again}>
              Don&apos;t know
            </button>
            <button className="btn primary flash-got" onClick={gotIt}>
              Know
            </button>
          </div>
        ) : (
          <div className="flash-actions">
            <button className="btn primary" onClick={flip}>
              Show answer
            </button>
          </div>
        )}
        </div>
      </div>
    );
  }

  if (mode === 'epub-mining') {
    return (
      <div className="flash-view flash-view-mining">
        <div className="view-head">
          <p className="muted">Mine vocabulary from a library EPUB into flashcards.</p>
          <div className="actions">
            <button className="btn" onClick={() => setMode('overview')}>
              Back to decks
            </button>
            <button className="btn" onClick={() => setMode('ai-studio')}>
              AI card studio
            </button>
          </div>
        </div>

        <div className="flash-tabs epub-mining-mode-tabs">
          <button
            type="button"
            className={`flash-tab${epubMiningUi === 'simple' ? ' active' : ''}`}
            onClick={() => setEpubMiningUi('simple')}
          >
            Simple
          </button>
          <button
            type="button"
            className={`flash-tab${epubMiningUi === 'advanced' ? ' active' : ''}`}
            onClick={() => setEpubMiningUi('advanced')}
          >
            Advanced
          </button>
        </div>

        <p className="epub-mining-mode-lead muted">
          {epubMiningUi === 'simple'
            ? 'English meaning + Japanese sentence & definition — two frequency filters only.'
            : 'Full control: all languages, export formats, translation engines.'}
        </p>

        {epubMiningUi === 'simple' ? (
          <EpubMiningSimplePanel onDeckSaved={() => { setMode('overview'); setOverviewTab('epub'); }} />
        ) : (
          <EpubMiningPanel onDeckSaved={() => { setMode('overview'); setOverviewTab('epub'); }} />
        )}
      </div>
    );
  }

  if (mode === 'csv-tool') {
    return (
      <div className="flash-view flash-view-mining">
        <div className="view-head">
          <p className="muted">Paste CSV/TSV, edit in a spreadsheet grid, or import TXT lists — auto-syncs to flashcards.</p>
          <div className="actions">
            <button className="btn" onClick={() => setMode('overview')}>
              Back to decks
            </button>
            <button className="btn" onClick={() => openEpubMining('advanced')}>
              EPUB mining
            </button>
          </div>
        </div>
        <CsvEditorPanel onDeckImported={() => { setMode('overview'); setOverviewTab('epub'); }} />
      </div>
    );
  }

  if (mode === 'ai-studio') {
    return (
      <div className="flash-view flash-view-mining">
        <div className="view-head">
          <p className="muted">Configure preset and field mapping above, then generate cards from saved dictionary words.</p>
          <div className="actions">
            <button className="btn" onClick={() => setMode('overview')}>
              Back to decks
            </button>
            <button className="btn" onClick={() => openEpubMining('advanced')}>
              EPUB mining
            </button>
          </div>
        </div>
        <AiCardStudio onDeckImported={() => { setDeck(loadDeck()); setMode('overview'); setOverviewTab('epub'); }} />
      </div>
    );
  }

  // Native menu bar + status bar (Study Deck Studio). Rendered by AppChrome only
  // under the Aero material set; pass-through (no chrome) in the default theme.
  // Every item drives an existing handler — no behavior forked by theme.
  const deckMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'export-epub', label: 'Export EPUB deck (CSV)…', disabled: filteredDeck.length === 0, onSelect: () => void exportAllEpubCsv() },
      ],
    },
    {
      id: 'deck',
      label: 'Deck',
      items: [
        { id: 'new-folder', label: 'New folder…', onSelect: () => setCreatingFolder(true) },
        { separator: true, label: '' },
        { id: 'view-epub', label: `EPUB decks (${epubCards.length})`, onSelect: () => setOverviewTab('epub') },
        { id: 'view-dict', label: `Dictionary (${saved.length})`, onSelect: () => setOverviewTab('dictionary') },
      ],
    },
    {
      id: 'study',
      label: 'Study',
      items: [
        { id: 'study-epub', label: `Start EPUB review (${epubReviewCandidates.length})`, disabled: epubReviewCandidates.length === 0, onSelect: startEpubReview },
        { id: 'study-dict', label: `Review dictionary (${saved.length})`, disabled: saved.length === 0, onSelect: startReview },
      ],
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [
        { id: 'mine-simple', label: 'Simple EPUB mining', onSelect: () => openEpubMining('simple') },
        { id: 'mine-advanced', label: 'Advanced EPUB mining', onSelect: () => openEpubMining('advanced') },
        { separator: true, label: '' },
        { id: 'csv-tool', label: 'CSV tool', onSelect: () => setMode('csv-tool') },
        { id: 'ai-studio', label: 'AI card studio', onSelect: () => setMode('ai-studio') },
      ],
    },
  ];

  const deckStatus = (
    <>
      <StatusBarField>{epubCards.length} EPUB cards</StatusBarField>
      <StatusBarField>{saved.length} dictionary</StatusBarField>
      {folderFilter !== 'all' && <StatusBarField>Folder: {String(folderFilter)}</StatusBarField>}
      <StatusBarSpacer />
      <StatusBarField live>{epubReviewCandidates.length} ready to review</StatusBarField>
    </>
  );

  if (aero) {
    const knownEpubCount = epubCards.filter((card) => card.known).length;
    const unfiledCount = epubCards.filter((card) => !card.folder).length;
    const activeFolderLabel =
      folderFilter === 'all' ? 'All cards' : folderFilter === 'unfiled' ? 'Unfiled' : String(folderFilter);

    return (
      <AppChrome menus={deckMenus} status={deckStatus} className="aero-flash-chrome">
        <div className="aero-flash">
          <Toolbar className="aero-flash-toolbar">
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Icon name="flashcards" size={14} />}
              disabled={epubReviewCandidates.length === 0}
              onClick={startEpubReview}
            >
              Review
            </Button>
            <Button size="sm" leftIcon={<Icon name="library" size={14} />} onClick={() => openEpubMining('simple')}>
              Mine
            </Button>
            <Button size="sm" leftIcon={<Icon name="scan" size={14} />} onClick={() => openEpubMining('advanced')}>
              Advanced
            </Button>
            <Button size="sm" leftIcon={<Icon name="clipboard" size={14} />} onClick={() => setMode('csv-tool')}>
              CSV
            </Button>
            <Button size="sm" leftIcon={<Icon name="sparkle" size={14} />} onClick={() => setMode('ai-studio')}>
              Studio
            </Button>
            <ToolbarSpacer />
            <Button
              size="sm"
              leftIcon={<Icon name="dictionary" size={14} />}
              disabled={saved.length === 0}
              onClick={startReview}
            >
              Dictionary review
            </Button>
          </Toolbar>

          <div className="aero-flash-layout">
            <aside className="aero-flash-nav">
              <div className="aero-flash-nav-group">
                <div className="aero-flash-nav-title">Sources</div>
                <button
                  type="button"
                  className={`aero-flash-source ${overviewTab === 'epub' ? 'active' : ''}`}
                  onClick={() => setOverviewTab('epub')}
                >
                  <Icon name="library" size={16} />
                  <span>EPUB decks</span>
                  <strong>{epubCards.length}</strong>
                </button>
                <button
                  type="button"
                  className={`aero-flash-source ${overviewTab === 'dictionary' ? 'active' : ''}`}
                  onClick={() => setOverviewTab('dictionary')}
                >
                  <Icon name="dictionary" size={16} />
                  <span>Dictionary</span>
                  <strong>{saved.length}</strong>
                </button>
              </div>

              <div className="aero-flash-nav-group">
                <div className="aero-flash-nav-title">Folders</div>
                <button
                  type="button"
                  className={`aero-flash-folder ${folderFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setFolderFilter('all')}
                >
                  <span>All cards</span>
                  <strong>{epubCards.length}</strong>
                </button>
                <button
                  type="button"
                  className={`aero-flash-folder ${folderFilter === 'unfiled' ? 'active' : ''} ${dropHover === 'unfiled' ? 'dragover' : ''}`}
                  onClick={() => setFolderFilter('unfiled')}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropHover('unfiled');
                  }}
                  onDragLeave={() => setDropHover(null)}
                  onDrop={(e) => onFolderDrop(e, null)}
                >
                  <span>Unfiled</span>
                  <strong>{unfiledCount}</strong>
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    draggable
                    className={`aero-flash-folder ${folderFilter === folder ? 'active' : ''} ${dropHover === folder ? 'dragover' : ''}`}
                    onClick={() => setFolderFilter(folder)}
                    onDragStart={(e) => e.dataTransfer.setData('app/flash-folder', folder)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropHover(folder);
                    }}
                    onDragLeave={() => setDropHover(null)}
                    onDrop={(e) => {
                      const draggedFolder = e.dataTransfer.getData('app/flash-folder');
                      if (draggedFolder && draggedFolder !== folder) {
                        void reorderFolder(draggedFolder, folder);
                        return;
                      }
                      onFolderDrop(e, folder);
                    }}
                  >
                    <span>{folder}</span>
                    <strong>{epubCards.filter((card) => card.folder === folder).length}</strong>
                    <span
                      className="aero-flash-folder-x"
                      role="button"
                      tabIndex={0}
                      title="Delete folder"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFolder(folder);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          removeFolder(folder);
                        }
                      }}
                    >
                      x
                    </span>
                  </button>
                ))}
                {creatingFolder ? (
                  <div className="aero-flash-folder-edit">
                    <input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') createFolder();
                        if (e.key === 'Escape') {
                          setCreatingFolder(false);
                          setNewFolderName('');
                          setFolderErr('');
                        }
                      }}
                      placeholder="Folder name"
                      autoFocus
                    />
                    <Button size="sm" onClick={createFolder}>
                      Add
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="aero-flash-folder-add"
                    leftIcon={<Icon name="plus" size={13} />}
                    onClick={() => setCreatingFolder(true)}
                  >
                    Folder
                  </Button>
                )}
                {folderErr && <div className="aero-flash-error">{folderErr}</div>}
              </div>
            </aside>

            <main className="aero-flash-work">
              <div className="aero-flash-head">
                <div>
                  <div className="aero-flash-kicker">{overviewTab === 'epub' ? activeFolderLabel : 'Saved words'}</div>
                  <h2>{overviewTab === 'epub' ? 'Deck catalog' : 'Dictionary deck'}</h2>
                </div>
                <div className="aero-flash-meters">
                  <span>
                    <strong>{filteredDeck.length}</strong>
                    visible
                  </span>
                  <span>
                    <strong>{knownEpubCount}</strong>
                    known
                  </span>
                  <span>
                    <strong>{epubReviewCandidates.length}</strong>
                    due
                  </span>
                </div>
              </div>

              {overviewTab === 'epub' ? (
                filteredDeck.length === 0 ? (
                  <div className="aero-flash-empty">
                    No cards in this view. Mine from an EPUB or switch folder filters.
                  </div>
                ) : (
                  <div className="aero-flash-table" role="table" aria-label="EPUB deck catalog">
                    <div className="aero-flash-table-head" role="row">
                      <span>Source</span>
                      <span>Cards</span>
                      <span>Known</span>
                      <span>Folder</span>
                      <span>Actions</span>
                    </div>
                    <div className="aero-flash-groups">
                      {bookGroups.map((group) => {
                        const groupKey = `${group.bookId}::${group.bookTitle}`;
                        const collapsed = collapsedBooks[groupKey] ?? false;
                        const knownCount = group.cards.filter((card) => card.known).length;
                        return (
                          <section key={groupKey} className="aero-flash-group">
                            <div
                              className="aero-flash-group-row"
                              draggable
                              onDragStart={(e) => onBookGroupDragStart(e, group.bookId, group.bookTitle)}
                            >
                              <button
                                type="button"
                                className="aero-flash-group-main"
                                onClick={() => toggleBookGroup(groupKey)}
                                aria-expanded={!collapsed}
                              >
                                <span className="aero-flash-chevron" aria-hidden />
                                <span className="aero-flash-group-title">{group.bookTitle}</span>
                              </button>
                              <span>{group.cards.length}</span>
                              <span>{knownCount}</span>
                              <span className="aero-flash-folder-tag">{group.cards[0]?.folder ?? 'Unfiled'}</span>
                              <span className="aero-flash-row-actions">
                                <Button size="sm" onClick={() => startReviewForGroup(group)}>
                                  Review
                                </Button>
                                <Button size="sm" onClick={() => setDeckMenuGroup(group)}>
                                  Options
                                </Button>
                                <button
                                  type="button"
                                  className="aero-flash-row-x"
                                  title="Delete deck"
                                  onClick={() => removeBookDeck(group.bookId, group.bookTitle)}
                                >
                                  x
                                </button>
                              </span>
                            </div>
                            {!collapsed && (
                              <div className="aero-flash-card-rows">
                                {group.cards.slice(0, 80).map((card) => (
                                  <div
                                    key={card.id}
                                    className="aero-flash-card-row"
                                    draggable
                                    onDragStart={(e) => onCardDragStart(e, card.id)}
                                  >
                                    <span className="aero-flash-word" lang="ja">
                                      {card.word}
                                    </span>
                                    <span className="aero-flash-reading" lang="ja">
                                      {card.reading && card.reading !== card.word ? card.reading : ''}
                                    </span>
                                    <span className="aero-flash-meaning">{card.meaning || card.back || '-'}</span>
                                    <span className="aero-flash-row-actions">
                                      <Button
                                        size="sm"
                                        onClick={() => setFileMenu(fileMenu === card.id ? null : card.id)}
                                      >
                                        File
                                      </Button>
                                      {fileMenu === card.id && (
                                        <div className="flash-file-menu aero-flash-file-menu">
                                          <button type="button" onClick={() => { setDeck(setDeckCardFolder(card.id, null)); setFileMenu(null); }}>
                                            Unfiled
                                          </button>
                                          {folders.map((folder) => (
                                            <button
                                              key={folder}
                                              type="button"
                                              onClick={() => {
                                                setDeck(setDeckCardFolder(card.id, folder));
                                                setFileMenu(null);
                                              }}
                                            >
                                              {folder}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      <button
                                        type="button"
                                        className="aero-flash-row-x"
                                        title="Remove"
                                        onClick={() => setDeck(removeDeckCard(card.id))}
                                      >
                                        x
                                      </button>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : saved.length === 0 ? (
                <div className="aero-flash-empty">
                  No saved words yet. Open Dictionary or highlight a word while reading to save it here.
                </div>
              ) : (
                <div className="aero-flash-dict-list" role="list">
                  {saved.map((word) => (
                    <div className="aero-flash-dict-row" key={word.word} role="listitem">
                      <span className="aero-flash-word" lang="ja">
                        {word.word}
                      </span>
                      <span className="aero-flash-reading" lang="ja">
                        {word.reading && word.reading !== word.word ? word.reading : ''}
                      </span>
                      <span className="aero-flash-meaning">{word.meaning}</span>
                      <button className="aero-flash-row-x" title="Remove" onClick={() => removeSaved(word.word)}>
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </main>

            <aside className="aero-flash-inspector">
              <section className="aero-flash-panel aero-flash-session">
                <div className="aero-flash-panel-head">
                  <h3>Study session</h3>
                  <span>{epubReviewCandidates.length} ready</span>
                </div>
                <label>
                  EPUB source
                  <select value={reviewBookKey} onChange={(e) => setReviewBookKey(e.target.value)}>
                    <option value="all">All in current folder ({filteredDeck.length})</option>
                    {epubReviewBooks.map((group) => {
                      const key = `${group.bookId}::${group.bookTitle}`;
                      const inFolder = filterDeckByBook(filteredDeck, key).length;
                      return (
                        <option key={key} value={key}>
                          {group.bookTitle} ({inFolder || group.cards.length})
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="aero-flash-check">
                  <input
                    type="checkbox"
                    checked={reviewUnknownOnly}
                    onChange={(e) => setReviewUnknownOnly(e.target.checked)}
                  />
                  Unknown cards only
                </label>
                <Button
                  variant="primary"
                  block
                  disabled={epubReviewCandidates.length === 0}
                  onClick={startEpubReview}
                  leftIcon={<Icon name="flashcards" size={15} />}
                >
                  Start review
                </Button>
              </section>

              <section className="aero-flash-panel aero-flash-import">
                <div className="aero-flash-panel-head">
                  <h3>Import</h3>
                  <span>CSV, TSV, TXT</span>
                </div>
                <DeckImportPanel onImported={() => setDeck(loadDeck())} />
              </section>

              <section className="aero-flash-panel">
                <div className="aero-flash-panel-head">
                  <h3>Recent cards</h3>
                  <span>Newest</span>
                </div>
                <div className="aero-flash-recent">
                  {recentStrip.length === 0 ? (
                    <p>No recent cards.</p>
                  ) : (
                    recentStrip.slice(0, 8).map((card) => (
                      <div key={card.id} className="aero-flash-recent-card">
                        <span lang="ja">{card.word}</span>
                        <small>{card.reading && card.reading !== card.word ? card.reading : card.meaning || card.back}</small>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </aside>
          </div>

          {deckMenuGroup && (
            <DeckActionMenu
              group={deckMenuGroup}
              folders={folders}
              onClose={() => setDeckMenuGroup(null)}
              onReview={() => startReviewForGroup(deckMenuGroup)}
              onSaveCsv={() => void saveGroupCsv(deckMenuGroup)}
              onMoveFolder={(folder) => {
                setDeck(setBookGroupFolder(deckMenuGroup.bookId, deckMenuGroup.bookTitle, folder));
                setDeckMenuGroup(null);
              }}
              onDelete={() => {
                removeBookDeck(deckMenuGroup.bookId, deckMenuGroup.bookTitle);
                setDeckMenuGroup(null);
              }}
            />
          )}
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome menus={deckMenus} status={deckStatus}>
    <div className="flash-view flash-view-decks">
      <div className="view-head">
        <p className="muted">Dictionary saves, EPUB deck strip, and folder explorer.</p>
        <div className="actions">
          <button className="btn primary" onClick={() => openEpubMining('simple')}>
            Simple EPUB mining
          </button>
          <button className="btn" onClick={() => openEpubMining('advanced')}>
            Advanced EPUB
          </button>
          <button className="btn" onClick={() => setMode('csv-tool')}>
            CSV tool
          </button>
          <button className="btn" onClick={() => setMode('ai-studio')}>
            AI card studio
          </button>
          <button className="btn primary" onClick={startReview} disabled={saved.length === 0}>
            {saved.length ? `Review dictionary (${saved.length})` : 'Review dictionary'}
          </button>
        </div>
      </div>

      <div className="flash-tabs">
        <button
          type="button"
          className={`flash-tab ${overviewTab === 'epub' ? 'active' : ''}`}
          onClick={() => setOverviewTab('epub')}
        >
          EPUB decks ({epubCards.length})
        </button>
        <button
          type="button"
          className={`flash-tab ${overviewTab === 'dictionary' ? 'active' : ''}`}
          onClick={() => setOverviewTab('dictionary')}
        >
          Dictionary ({saved.length})
        </button>
      </div>

      <DeckImportPanel onImported={() => setDeck(loadDeck())} />

      {overviewTab === 'epub' ? (
        <>
          <section className="anki-card epub-mine-promo">
            <div className="flash-strip-head">
              <h2 className="flash-section-title">Mine from EPUB</h2>
              <span className="muted">Lean 3-step flow — English + Japanese only</span>
            </div>
            <p className="epub-mine-promo-text">
              Pick a book, filter by frequency in the book or in the dictionary, then save cards to flashcards.
            </p>
            <button type="button" className="btn primary epub-mine-promo-btn" onClick={() => openEpubMining('simple')}>
              Open Simple EPUB mining
            </button>
          </section>

          <section className="anki-card flash-review-setup">
            <div className="flash-strip-head">
              <h2 className="flash-section-title">Study session</h2>
              <span className="muted">Pick an EPUB source, then start reviewing</span>
            </div>
            <div className="flash-review-setup-grid">
              <label>
                EPUB source
                <select value={reviewBookKey} onChange={(e) => setReviewBookKey(e.target.value)}>
                  <option value="all">All in current folder ({filteredDeck.length})</option>
                  {epubReviewBooks.map((group) => {
                    const key = `${group.bookId}::${group.bookTitle}`;
                    const inFolder = filterDeckByBook(filteredDeck, key).length;
                    return (
                      <option key={key} value={key}>
                        {group.bookTitle} ({inFolder || group.cards.length})
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="flash-review-setup-check">
                <input
                  type="checkbox"
                  checked={reviewUnknownOnly}
                  onChange={(e) => setReviewUnknownOnly(e.target.checked)}
                />
                Unknown cards only
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={epubReviewCandidates.length === 0}
                onClick={startEpubReview}
              >
                {epubReviewCandidates.length
                  ? `Start review (${epubReviewCandidates.length})`
                  : 'Start review'}
              </button>
            </div>
          </section>

          <section className="flash-strip-section anki-card">
            <div className="flash-strip-head">
              <h2 className="flash-section-title">Recent EPUB cards</h2>
              <span className="muted">Left to right — newest first</span>
            </div>
            {recentStrip.length === 0 ? (
              <p className="muted flash-strip-empty">
                Mine cards in EPUB mining to fill this strip.
              </p>
            ) : (
              <div className="flash-strip" role="list">
                {recentStrip.map((card) => (
                  <article key={card.id} className="flash-strip-card" role="listitem">
                    <span className="flash-strip-word" lang="ja">
                      {card.word}
                    </span>
                    {card.reading && card.reading !== card.word && (
                      <span className="flash-strip-reading" lang="ja">
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
              <h2 className="flash-section-title">Deck explorer</h2>
              <span className="muted">Folders and EPUB source groups</span>
            </div>

            <div className="lib-folders flash-folders">
              <button
                type="button"
                className={`lib-folder-chip ${folderFilter === 'all' ? 'active' : ''}`}
                onClick={() => setFolderFilter('all')}
              >
                All
                <span className="lib-chip-count">{epubCards.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setFolderFilter('unfiled')}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropHover('unfiled');
                }}
                onDragLeave={() => setDropHover(null)}
                onDrop={(e) => onFolderDrop(e, null)}
                className={`lib-folder-chip ${folderFilter === 'unfiled' ? 'active' : ''} ${dropHover === 'unfiled' ? 'dragover' : ''}`}
              >
                Unfiled
                <span className="lib-chip-count">{epubCards.filter((c) => !c.folder).length}</span>
              </button>
              {folders.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('app/flash-folder', folder)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropHover(folder);
                  }}
                  onDragLeave={() => setDropHover(null)}
                  onDrop={(e) => {
                    const draggedFolder = e.dataTransfer.getData('app/flash-folder');
                    if (draggedFolder && draggedFolder !== folder) {
                      void reorderFolder(draggedFolder, folder);
                      return;
                    }
                    onFolderDrop(e, folder);
                  }}
                  className={`lib-folder-chip ${folderFilter === folder ? 'active' : ''} ${dropHover === folder ? 'dragover' : ''}`}
                  onClick={() => setFolderFilter(folder)}
                >
                  {folder}
                  <span className="lib-chip-count">{epubCards.filter((c) => c.folder === folder).length}</span>
                  <span
                    className="lib-chip-del"
                    role="button"
                    tabIndex={0}
                    title="Delete folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFolder(folder);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        removeFolder(folder);
                      }
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
              {creatingFolder ? (
                <span className="lib-folder-chip lib-folder-editor">
                  <input
                    className="lib-folder-input"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createFolder();
                      if (e.key === 'Escape') {
                        setCreatingFolder(false);
                        setNewFolderName('');
                        setFolderErr('');
                      }
                    }}
                    placeholder="Folder name"
                    autoFocus
                  />
                  <button type="button" className="btn small" onClick={createFolder}>
                    Add
                  </button>
                </span>
              ) : (
                <button type="button" className="lib-folder-chip lib-folder-new" onClick={() => setCreatingFolder(true)}>
                  + New folder
                </button>
              )}
            </div>
            {folderErr && <div className="lib-folder-err">{folderErr}</div>}

            {filteredDeck.length === 0 ? (
              <p className="muted">No cards in this view. Mine from an EPUB or switch folder filters.</p>
            ) : (
              <div className="flash-groups">
                {bookGroups.map((group) => {
                  const groupKey = `${group.bookId}::${group.bookTitle}`;
                  const collapsed = collapsedBooks[groupKey] ?? false;
                  return (
                    <div key={groupKey} className="flash-group">
                      <div
                        className="flash-group-head flash-group-head-row"
                        draggable
                        onDragStart={(e) => onBookGroupDragStart(e, group.bookId, group.bookTitle)}
                      >
                        <div
                          className="flash-group-head-toggle"
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleBookGroup(groupKey)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') toggleBookGroup(groupKey);
                          }}
                          aria-expanded={!collapsed}
                        >
                          <span className="flash-group-chevron" aria-hidden />
                          <span
                            className="flash-group-title flash-group-title-btn"
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeckMenuGroup(group);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation();
                                setDeckMenuGroup(group);
                              }
                            }}
                          >
                            {group.bookTitle}
                          </span>
                          <span className="muted flash-group-count">{group.cards.length} cards</span>
                          <span className="muted flash-group-known">
                            {group.cards.filter((c) => c.known).length} known
                          </span>
                        </div>
                        <div className="flash-group-head-actions">
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => setDeckMenuGroup(group)}
                          >
                            Options
                          </button>
                          <button
                            type="button"
                            className="btn small flash-group-delete"
                            onClick={() => removeBookDeck(group.bookId, group.bookTitle)}
                          >
                            Delete deck
                          </button>
                          {bookFolderMenu === groupKey && (
                            <div className="flash-file-menu flash-book-folder-menu">
                              <button type="button" onClick={() => moveBookToFolder(group.bookId, group.bookTitle, null)}>
                                Unfiled
                              </button>
                              {folders.map((folder) => (
                                <button
                                  key={folder}
                                  type="button"
                                  onClick={() => moveBookToFolder(group.bookId, group.bookTitle, folder)}
                                >
                                  {folder}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {!collapsed && (
                        <div className="flash-group-body">
                          {group.cards.map((card) => (
                            <div
                              key={card.id}
                              className="flash-row flash-row-draggable"
                              draggable
                              onDragStart={(e) => onCardDragStart(e, card.id)}
                            >
                              <div className="flash-row-main">
                                <span className="flash-row-word" lang="ja">
                                  {card.word}
                                </span>
                                {card.reading && card.reading !== card.word && (
                                  <span className="flash-row-reading" lang="ja">
                                    {card.reading}
                                  </span>
                                )}
                                <span className="flash-row-meaning">{card.meaning || card.back || '—'}</span>
                                {card.sentence && <span className="flash-row-sentence muted">{card.sentence}</span>}
                                {card.folder && <span className="flash-row-folder muted">{card.folder}</span>}
                              </div>
                              <div className="flash-row-actions">
                                <button
                                  type="button"
                                  className="btn small"
                                  onClick={() => setFileMenu(fileMenu === card.id ? null : card.id)}
                                >
                                  File
                                </button>
                                {fileMenu === card.id && (
                                  <div className="flash-file-menu">
                                    <button type="button" onClick={() => { setDeck(setDeckCardFolder(card.id, null)); setFileMenu(null); }}>
                                      Unfiled
                                    </button>
                                    {folders.map((folder) => (
                                      <button
                                        key={folder}
                                        type="button"
                                        onClick={() => {
                                          setDeck(setDeckCardFolder(card.id, folder));
                                          setFileMenu(null);
                                        }}
                                      >
                                        {folder}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <button
                                  className="flash-row-x"
                                  title="Remove"
                                  onClick={() => setDeck(removeDeckCard(card.id))}
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
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
          <h2>No saved words yet</h2>
          <p className="muted">
            Open the Dictionary (or highlight a word while reading) and tap the star icon on a result to save it here.
          </p>
        </div>
      ) : (
        <div className="flash-list">
          {saved.map((w) => (
            <div className="flash-row" key={w.word}>
              <div className="flash-row-main">
                <span className="flash-row-word" lang="ja">
                  {w.word}
                </span>
                {w.reading && w.reading !== w.word && (
                  <span className="flash-row-reading" lang="ja">
                    {w.reading}
                  </span>
                )}
                <span className="flash-row-meaning">{w.meaning}</span>
              </div>
              <button className="flash-row-x" title="Remove" onClick={() => removeSaved(w.word)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {deckMenuGroup && (
        <DeckActionMenu
          group={deckMenuGroup}
          folders={folders}
          onClose={() => setDeckMenuGroup(null)}
          onReview={() => startReviewForGroup(deckMenuGroup)}
          onSaveCsv={() => void saveGroupCsv(deckMenuGroup)}
          onMoveFolder={(folder) => {
            setDeck(setBookGroupFolder(deckMenuGroup.bookId, deckMenuGroup.bookTitle, folder));
            setDeckMenuGroup(null);
          }}
          onDelete={() => {
            removeBookDeck(deckMenuGroup.bookId, deckMenuGroup.bookTitle);
            setDeckMenuGroup(null);
          }}
        />
      )}
    </div>
    </AppChrome>
  );
}
