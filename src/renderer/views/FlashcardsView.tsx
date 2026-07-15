import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
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
import { useT } from '../i18n';

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
  const { t } = useT();
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

  function removeBookDeck(bookId: string, bookTitle: string): void {
    if (!window.confirm(t('flash.deleteConfirm', { title: bookTitle }))) return;
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
            <h2>{t('flash.sessionComplete')}</h2>
            <p className="muted">{t('flash.reviewedCount', { count: total })}</p>
            <div className="flash-done-actions">
              <button className="btn primary" onClick={restartReview}>
                {t('flash.reviewAgain')}
              </button>
              <button className="btn" onClick={endReview}>
                {t('flash.done')}
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
              onClick={shuffleReview}
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

          <div className="flash-review-nav" ref={stripRef}>
            {unknownReviewCards.length > 0 && (
              <div className="flash-review-group flash-review-group-unknown">
                <span className="flash-review-group-label">
                  {t('flash.dontKnowGroup', { count: unknownReviewCards.length })}
                </span>
                <div className="flash-strip flash-review-strip" role="list">
                  {unknownReviewCards.map((card) => reviewStripCard(card, false))}
                </div>
              </div>
            )}
            {knownReviewCards.length > 0 && (
              <div className="flash-review-group flash-review-group-known">
                <span className="flash-review-group-label">
                  {t('flash.knowGroup', { count: knownReviewCards.length })}
                </span>
                <div className="flash-strip flash-review-strip" role="list">
                  {knownReviewCards.map((card) => reviewStripCard(card, true))}
                </div>
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
              <span className="flash-meaning">{current.meaning || t('flash.noMeaningSaved')}</span>
            </div>
          ) : (
            <span className="flash-tap-hint">{t('flash.tapToReveal')}</span>
          )}
        </div>

        {flipped ? (
          <div className="flash-actions">
            <button className="btn flash-again" onClick={again}>
              {t('flash.dontKnow')}
            </button>
            <button className="btn primary flash-got" onClick={gotIt}>
              {t('flash.know')}
            </button>
          </div>
        ) : (
          <div className="flash-actions">
            <button className="btn primary" onClick={flip}>
              {t('flash.showAnswer')}
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
          <p className="muted">{t('flash.mining.intro')}</p>
          <div className="actions">
            <button className="btn" onClick={() => setMode('overview')}>
              {t('flash.backToDecks')}
            </button>
            <button className="btn" onClick={() => setMode('ai-studio')}>
              {t('flash.aiCardStudio')}
            </button>
          </div>
        </div>

        <div className="flash-tabs epub-mining-mode-tabs">
          <button
            type="button"
            className={`flash-tab${epubMiningUi === 'simple' ? ' active' : ''}`}
            onClick={() => setEpubMiningUi('simple')}
          >
            {t('flash.tab.simple')}
          </button>
          <button
            type="button"
            className={`flash-tab${epubMiningUi === 'advanced' ? ' active' : ''}`}
            onClick={() => setEpubMiningUi('advanced')}
          >
            {t('flash.tab.advanced')}
          </button>
        </div>

        <p className="epub-mining-mode-lead muted">
          {epubMiningUi === 'simple' ? t('flash.mining.simpleLead') : t('flash.mining.advancedLead')}
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
          <p className="muted">{t('flash.csv.intro')}</p>
          <div className="actions">
            <button className="btn" onClick={() => setMode('overview')}>
              {t('flash.backToDecks')}
            </button>
            <button className="btn" onClick={() => openEpubMining('advanced')}>
              {t('flash.epubMining')}
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
          <p className="muted">{t('flash.aiStudio.intro')}</p>
          <div className="actions">
            <button className="btn" onClick={() => setMode('overview')}>
              {t('flash.backToDecks')}
            </button>
            <button className="btn" onClick={() => openEpubMining('advanced')}>
              {t('flash.epubMining')}
            </button>
          </div>
        </div>
        <AiCardStudio onDeckImported={() => { setDeck(loadDeck()); setMode('overview'); setOverviewTab('epub'); }} />
      </div>
    );
  }

  return (
    <div className="flash-view flash-view-decks">
      <div className="view-head">
        <p className="muted">{t('flash.overview.intro')}</p>
        <div className="actions">
          <button className="btn primary" onClick={() => openEpubMining('simple')}>
            {t('flash.simpleEpubMining')}
          </button>
          <button className="btn" onClick={() => openEpubMining('advanced')}>
            {t('flash.advancedEpub')}
          </button>
          <button className="btn" onClick={() => setMode('csv-tool')}>
            {t('flash.csvTool')}
          </button>
          <button className="btn" onClick={() => setMode('ai-studio')}>
            {t('flash.aiCardStudio')}
          </button>
          <button className="btn primary" onClick={startReview} disabled={saved.length === 0}>
            {saved.length ? t('flash.reviewDictionaryCount', { count: saved.length }) : t('flash.reviewDictionary')}
          </button>
        </div>
      </div>

      <div className="flash-tabs">
        <button
          type="button"
          className={`flash-tab ${overviewTab === 'epub' ? 'active' : ''}`}
          onClick={() => setOverviewTab('epub')}
        >
          {t('flash.tab.epubDecks', { count: epubCards.length })}
        </button>
        <button
          type="button"
          className={`flash-tab ${overviewTab === 'dictionary' ? 'active' : ''}`}
          onClick={() => setOverviewTab('dictionary')}
        >
          {t('flash.tab.dictionary', { count: saved.length })}
        </button>
      </div>

      <DeckImportPanel onImported={() => setDeck(loadDeck())} />

      {overviewTab === 'epub' ? (
        <>
          <section className="anki-card epub-mine-promo">
            <div className="flash-strip-head">
              <h2 className="flash-section-title">{t('flash.mineFromEpub')}</h2>
              <span className="muted">{t('flash.mineFromEpub.hint')}</span>
            </div>
            <p className="epub-mine-promo-text">{t('flash.mineFromEpub.text')}</p>
            <button type="button" className="btn primary epub-mine-promo-btn" onClick={() => openEpubMining('simple')}>
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
                <select value={reviewBookKey} onChange={(e) => setReviewBookKey(e.target.value)}>
                  <option value="all">{t('flash.allInFolder', { count: filteredDeck.length })}</option>
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
                {t('flash.unknownOnly')}
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={epubReviewCandidates.length === 0}
                onClick={startEpubReview}
              >
                {epubReviewCandidates.length
                  ? t('flash.startReviewCount', { count: epubReviewCandidates.length })
                  : t('flash.startReview')}
              </button>
            </div>
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
              <h2 className="flash-section-title">{t('flash.deckExplorer')}</h2>
              <span className="muted">{t('flash.deckExplorer.hint')}</span>
            </div>

            <div className="lib-folders flash-folders">
              <button
                type="button"
                className={`lib-folder-chip ${folderFilter === 'all' ? 'active' : ''}`}
                onClick={() => setFolderFilter('all')}
              >
                {t('flash.all')}
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
                {t('flash.unfiled')}
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
                    title={t('flash.deleteFolder')}
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
                    placeholder={t('flash.folderNamePlaceholder')}
                    autoFocus
                  />
                  <button type="button" className="btn small" onClick={createFolder}>
                    {t('flash.add')}
                  </button>
                </span>
              ) : (
                <button type="button" className="lib-folder-chip lib-folder-new" onClick={() => setCreatingFolder(true)}>
                  {t('flash.newFolder')}
                </button>
              )}
            </div>
            {folderErr && <div className="lib-folder-err">{folderErr}</div>}

            {filteredDeck.length === 0 ? (
              <p className="muted">{t('flash.noCardsInView')}</p>
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
                          <span className="muted flash-group-count">{t('flash.cardsCount', { count: group.cards.length })}</span>
                          <span className="muted flash-group-known">
                            {t('flash.knownCount', { count: group.cards.filter((c) => c.known).length })}
                          </span>
                        </div>
                        <div className="flash-group-head-actions">
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => setDeckMenuGroup(group)}
                          >
                            {t('flash.options')}
                          </button>
                          <button
                            type="button"
                            className="btn small flash-group-delete"
                            onClick={() => removeBookDeck(group.bookId, group.bookTitle)}
                          >
                            {t('flash.deleteDeck')}
                          </button>
                          {bookFolderMenu === groupKey && (
                            <div className="flash-file-menu flash-book-folder-menu">
                              <button type="button" onClick={() => moveBookToFolder(group.bookId, group.bookTitle, null)}>
                                {t('flash.unfiled')}
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
                                  {t('flash.file')}
                                </button>
                                {fileMenu === card.id && (
                                  <div className="flash-file-menu">
                                    <button type="button" onClick={() => { setDeck(setDeckCardFolder(card.id, null)); setFileMenu(null); }}>
                                      {t('flash.unfiled')}
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
                                  title={t('common.remove')}
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
          <h2>{t('flash.noSavedWords')}</h2>
          <p className="muted">{t('flash.noSavedWords.hint')}</p>
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
              <button className="flash-row-x" title={t('common.remove')} onClick={() => removeSaved(w.word)}>
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
  );
}
