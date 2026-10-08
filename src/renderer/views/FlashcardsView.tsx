import {
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
import DeckActionMenu from '../components/DeckActionMenu';
import DeckImportPanel from '../components/DeckImportPanel';
import FlashcardFileMenu from '../components/flashcards/FlashcardFileMenu';
import {
  BookCoverThumb,
  FlashcardAiMode,
  FlashcardCsvMode,
  FlashcardDeckOverview,
  FlashcardMiningMode,
  FlashcardReviewMode,
  useFlashcards,
} from '../components/flashcards/FlashcardsContent';
import {
  filterDeckByBook,
  loadDeck,
  removeDeckCard,
  setBookGroupFolder,
  setDeckCardFolder,
} from '../flashcardDeck';
import { removeSaved } from '../savedWords';
import { useT } from '../i18n';
import { useState } from 'react';
import { cardContentLang, studyContentLang } from '../studyEnvironment';

interface FlashcardsViewProps {
  hideAiStudio?: boolean;
}

/**
 * How many rows an expanded deck group shows before it says it is a page.
 *
 * This surface renders every row it shows, unlike the Study OS deck browser
 * (`FlashcardsContent.tsx`), which hands the same `group.cards` to `VirtualList`
 * uncapped. Virtualising here would be wrong twice over: `.aero-flash-card-row`
 * is `min-height`, not a fixed height, and its `:nth-child(even)` striping is
 * computed from real siblings — a windowed list has none for the rows it has not
 * mounted. So the cap stays and becomes reachable instead, which is the same
 * shape as the dictionary's page (`shared/dictionaryLookup.ts`).
 */
const AERO_DECK_PAGE = 80;

export default function FlashcardsView({ hideAiStudio = false }: FlashcardsViewProps = {}) {
  const { t } = useT();
  const aero = useAeroMaterials();
  const state = useFlashcards(hideAiStudio);
  // Keyed by group, so expanding one deck does not silently expand the others —
  // and so collapsing a group and reopening it comes back at page one.
  const [cardPage, setCardPage] = useState<Record<string, number>>({});
  const {
    saved,
    folders,
    mode,
    overviewTab,
    folderFilter,
    epubCards,
    filteredDeck,
    bookGroups,
    epubReviewBooks,
    epubDueCards,
    epubReviewCandidates,
    recentStrip,
    reviewBookKey,
    reviewDueOnly,
    collapsedBooks,
    creatingFolder,
    newFolderName,
    folderErr,
    dropHover,
    fileMenu,
    deckLevels,
    deckMenuGroup,
  } = state;

  // Native menu bar + status bar (Study Deck Studio). Rendered by AppChrome only
  // under the Aero material set; pass-through (no chrome) in the default theme.
  const deckMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('flash.file'),
      items: [
        {
          id: 'export-epub',
          label: t('flash.aero.menu.exportEpub'),
          disabled: filteredDeck.length === 0,
          onSelect: () => void state.exportAllEpubCsv(),
        },
      ],
    },
    {
      id: 'deck',
      label: t('flash.aero.menu.deck'),
      items: [
        { id: 'new-folder', label: t('flash.aero.menu.newFolder'), onSelect: () => state.setCreatingFolder(true) },
        { separator: true, label: '' },
        {
          id: 'view-epub',
          label: t('flash.tab.epubDecks', { count: epubCards.length }),
          onSelect: () => state.setOverviewTab('epub'),
        },
        {
          id: 'view-dict',
          label: t('flash.tab.dictionary', { count: saved.length }),
          onSelect: () => state.setOverviewTab('dictionary'),
        },
      ],
    },
    {
      id: 'study',
      label: t('flash.aero.menu.study'),
      items: [
        {
          id: 'study-epub',
          label: t('flash.aero.menu.startEpubReview', { count: epubReviewCandidates.length }),
          disabled: epubReviewCandidates.length === 0,
          onSelect: state.startEpubReview,
        },
        {
          id: 'study-dict',
          label: t('flash.reviewDictionaryCount', { count: saved.length }),
          disabled: saved.length === 0,
          onSelect: state.startReview,
        },
      ],
    },
    {
      id: 'tools',
      label: t('flash.aero.menu.tools'),
      items: [
        { id: 'mine-simple', label: t('flash.simpleEpubMining'), onSelect: () => state.openEpubMining('simple') },
        {
          id: 'mine-advanced',
          label: t('flash.aero.menu.advancedMining'),
          onSelect: () => state.openEpubMining('advanced'),
        },
        // Was left literal on 2026-09-07 as "a product name". That was decided
        // while `jiten.mining.title` was an orphan; D235 wired it, so the panel
        // this item opens now renders that exact heading translated and the menu
        // item that leads to it should not disagree with it.
        { id: 'mine-jiten', label: t('jiten.mining.title'), onSelect: () => state.openEpubMining('jiten') },
        { separator: true, label: '' },
        { id: 'csv-tool', label: t('flash.csvTool'), onSelect: () => state.setMode('csv-tool') },
        ...(hideAiStudio
          ? []
          : [{ id: 'ai-studio', label: t('flash.aiCardStudio'), onSelect: () => state.setMode('ai-studio') }]),
      ],
    },
  ];

  const deckStatus = (
    <>
      <StatusBarField>{t('flash.aero.status.epubCards', { count: epubCards.length })}</StatusBarField>
      <StatusBarField>{t('flash.aero.status.dictionary', { count: saved.length })}</StatusBarField>
      {folderFilter !== 'all' && (
        <StatusBarField>
          {t('flash.aero.status.folder', {
            name: folderFilter === 'unfiled' ? t('flash.unfiled') : String(folderFilter),
          })}
        </StatusBarField>
      )}
      <StatusBarSpacer />
      <StatusBarField live>
        {t('flash.aero.status.readyToReview', { count: epubReviewCandidates.length })}
      </StatusBarField>
    </>
  );

  if (mode === 'review') return <FlashcardReviewMode state={state} />;
  if (mode === 'epub-mining') return <FlashcardMiningMode state={state} />;
  if (mode === 'csv-tool') return <FlashcardCsvMode state={state} />;
  if (mode === 'ai-studio') return <FlashcardAiMode state={state} />;

  if (aero) {
    const knownEpubCount = epubCards.filter((card) => card.known).length;
    const unfiledCount = epubCards.filter((card) => !card.folder).length;
    const activeFolderLabel =
      folderFilter === 'all'
        ? t('flash.aero.allCards')
        : folderFilter === 'unfiled'
          ? t('flash.unfiled')
          : String(folderFilter);

    return (
      <AppChrome menus={deckMenus} status={deckStatus} className="aero-flash-chrome">
        <div className="aero-flash">
          <Toolbar className="aero-flash-toolbar">
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Icon name="flashcards" size={14} />}
              disabled={epubReviewCandidates.length === 0}
              onClick={state.startEpubReview}
            >
              {t('flash.aero.toolbar.review')}
            </Button>
            <Button size="sm" leftIcon={<Icon name="library" size={14} />} onClick={() => state.openEpubMining('simple')}>
              {t('flash.aero.toolbar.mine')}
            </Button>
            <Button size="sm" leftIcon={<Icon name="scan" size={14} />} onClick={() => state.openEpubMining('advanced')}>
              {t('flash.tab.advanced')}
            </Button>
            <Button size="sm" leftIcon={<Icon name="globe" size={14} />} onClick={() => state.openEpubMining('jiten')}>
              Jiten
            </Button>
            <Button size="sm" leftIcon={<Icon name="clipboard" size={14} />} onClick={() => state.setMode('csv-tool')}>
              {t('flash.aero.toolbar.csv')}
            </Button>
            {!hideAiStudio && (
              <Button size="sm" leftIcon={<Icon name="sparkle" size={14} />} onClick={() => state.setMode('ai-studio')}>
                {t('flash.aero.toolbar.studio')}
              </Button>
            )}
            <ToolbarSpacer />
            <Button
              size="sm"
              leftIcon={<Icon name="dictionary" size={14} />}
              disabled={saved.length === 0}
              onClick={state.startReview}
            >
              {t('flash.reviewDictionary')}
            </Button>
          </Toolbar>

          <div className="aero-flash-layout">
            <aside className="aero-flash-nav">
              <div className="aero-flash-nav-group">
                <div className="aero-flash-nav-title">{t('flash.aero.nav.sources')}</div>
                <button
                  type="button"
                  className={`aero-flash-source ${overviewTab === 'epub' ? 'active' : ''}`}
                  aria-pressed={overviewTab === 'epub'}
                  onClick={() => state.setOverviewTab('epub')}
                >
                  <Icon name="library" size={16} />
                  <span>{t('flash.aero.nav.epubDecks')}</span>
                  <strong>{epubCards.length}</strong>
                </button>
                <button
                  type="button"
                  className={`aero-flash-source ${overviewTab === 'dictionary' ? 'active' : ''}`}
                  aria-pressed={overviewTab === 'dictionary'}
                  onClick={() => state.setOverviewTab('dictionary')}
                >
                  <Icon name="dictionary" size={16} />
                  <span>{t('flash.aero.nav.dictionary')}</span>
                  <strong>{saved.length}</strong>
                </button>
              </div>

              <div className="aero-flash-nav-group">
                <div className="aero-flash-nav-title">{t('flash.aero.nav.folders')}</div>
                <button
                  type="button"
                  className={`aero-flash-folder ${folderFilter === 'all' ? 'active' : ''}`}
                  aria-pressed={folderFilter === 'all'}
                  onClick={() => state.setFolderFilter('all')}
                >
                  <span>{t('flash.aero.allCards')}</span>
                  <strong>{epubCards.length}</strong>
                </button>
                <button
                  type="button"
                  className={`aero-flash-folder ${folderFilter === 'unfiled' ? 'active' : ''} ${dropHover === 'unfiled' ? 'dragover' : ''}`}
                  aria-pressed={folderFilter === 'unfiled'}
                  onClick={() => state.setFolderFilter('unfiled')}
                  onDragOver={(e) => {
                    e.preventDefault();
                    state.setDropHover('unfiled');
                  }}
                  onDragLeave={() => state.setDropHover(null)}
                  onDrop={(e) => state.onFolderDrop(e, null)}
                >
                  <span>{t('flash.unfiled')}</span>
                  <strong>{unfiledCount}</strong>
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    draggable
                    className={`aero-flash-folder ${folderFilter === folder ? 'active' : ''} ${dropHover === folder ? 'dragover' : ''}`}
                    aria-pressed={folderFilter === folder}
                    onClick={() => state.setFolderFilter(folder)}
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
                  >
                    <span>{folder}</span>
                    <strong>{epubCards.filter((card) => card.folder === folder).length}</strong>
                    <span
                      className="aero-flash-folder-x"
                      role="button"
                      tabIndex={0}
                      title={t('flash.deleteFolder')}
                      onClick={(e) => {
                        e.stopPropagation();
                        state.removeFolder(folder);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          state.removeFolder(folder);
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
                      onChange={(e) => state.setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter/Escape belong to the IME while converting a folder name.
                        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
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
                    <Button size="sm" onClick={state.createFolder}>
                      {t('flash.add')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="aero-flash-folder-add"
                    ref={state.folderTriggerRef}
                    leftIcon={<Icon name="plus" size={13} />}
                    onClick={() => state.setCreatingFolder(true)}
                  >
                    {t('flash.aero.addFolder')}
                  </Button>
                )}
                {folderErr && <div className="aero-flash-error">{folderErr}</div>}
              </div>
            </aside>

            <main className="aero-flash-work">
              <div className="aero-flash-head">
                <div>
                  <div className="aero-flash-kicker">
                    {overviewTab === 'epub' ? activeFolderLabel : t('flash.aero.savedWords')}
                  </div>
                  <h2>{overviewTab === 'epub' ? t('flash.aero.deckCatalog') : t('flash.aero.dictionaryDeck')}</h2>
                </div>
                <div className="aero-flash-meters">
                  <span>
                    <strong>{filteredDeck.length}</strong>
                    {t('flash.aero.meter.visible')}
                  </span>
                  <span>
                    <strong>{knownEpubCount}</strong>
                    {t('flash.aero.meter.known')}
                  </span>
                  <span>
                    <strong>{epubDueCards.length}</strong>
                    {t('flash.aero.meter.due')}
                  </span>
                </div>
              </div>

              {overviewTab === 'epub' ? (
                filteredDeck.length === 0 ? (
                  <div className="aero-flash-empty">{t('flash.noCardsInView')}</div>
                ) : (
                  <div className="aero-flash-table" role="table" aria-label={t('flash.aero.table.aria')}>
                    <div className="aero-flash-table-head" role="row">
                      <span>{t('flash.aero.table.source')}</span>
                      <span>{t('flash.aero.table.cards')}</span>
                      <span>{t('flash.aero.table.known')}</span>
                      <span>{t('flash.aero.table.folder')}</span>
                      <span>{t('flash.aero.table.actions')}</span>
                    </div>
                    <div className="aero-flash-groups">
                      {bookGroups.map((group) => {
                        const groupKey = `${group.bookId}::${group.bookTitle}`;
                        const collapsed = collapsedBooks[groupKey] ?? false;
                        const knownCount = group.cards.filter((card) => card.known).length;
                        const shown = Math.min(cardPage[groupKey] ?? AERO_DECK_PAGE, group.cards.length);
                        const hidden = group.cards.length - shown;
                        return (
                          <section key={groupKey} className="aero-flash-group">
                            <div
                              className="aero-flash-group-row"
                              draggable
                              onDragStart={(e) => state.onBookGroupDragStart(e, group.bookId, group.bookTitle)}
                            >
                              <button
                                type="button"
                                className="aero-flash-group-main"
                                onClick={() => state.toggleBookGroup(groupKey)}
                                aria-expanded={!collapsed}
                              >
                                <span className="aero-flash-chevron" aria-hidden />
                                <BookCoverThumb
                                  className="aero-flash-group-cover"
                                  style={state.bookCoverStyle(group.bookId, group.bookTitle)}
                                  level={deckLevels[groupKey]}
                                  levelAria={
                                    deckLevels[groupKey]
                                      ? t('flash.deck.levelAria', { level: deckLevels[groupKey].label })
                                      : undefined
                                  }
                                />
                                <span className="aero-flash-group-title">{group.bookTitle}</span>
                              </button>
                              <span>{group.cards.length}</span>
                              <span>{knownCount}</span>
                              <span className="aero-flash-folder-tag">{group.cards[0]?.folder ?? t('flash.unfiled')}</span>
                              <span className="aero-flash-row-actions">
                                <Button size="sm" onClick={() => state.startReviewForGroup(group)}>
                                  {t('flash.aero.toolbar.review')}
                                </Button>
                                <Button size="sm" onClick={() => state.setDeckMenuGroup(group)}>
                                  {t('flash.options')}
                                </Button>
                                <button
                                  type="button"
                                  className="aero-flash-row-x"
                                  title={t('flash.deleteDeck')}
                                  onClick={() => state.removeBookDeck(group.bookId, group.bookTitle)}
                                >
                                  x
                                </button>
                              </span>
                            </div>
                            {!collapsed && (
                              <div className="aero-flash-card-rows">
                                {group.cards.slice(0, shown).map((card) => (
                                  <div
                                    key={card.id}
                                    className="aero-flash-card-row"
                                    draggable
                                    onDragStart={(e) => state.onCardDragStart(e, card.id)}
                                  >
                                    <span className="aero-flash-word" lang={cardContentLang(card)}>
                                      {card.word}
                                    </span>
                                    <span className="aero-flash-reading" lang={cardContentLang(card)}>
                                      {card.reading && card.reading !== card.word ? card.reading : ''}
                                    </span>
                                    <span className="aero-flash-meaning">{card.meaning || card.back || '-'}</span>
                                    <span className="aero-flash-row-actions">
                                      {state.cardHasScene(card.id) && (
                                        <Button
                                          size="sm"
                                          data-flash-action="row-play-in-video"
                                          title={t('studyLoop.replayNamed', { term: card.word })}
                                          aria-label={t('studyLoop.replayNamed', { term: card.word })}
                                          onClick={() => void state.playCardInVideo(card.id)}
                                        >
                                          <Icon name="video" size={13} />
                                        </Button>
                                      )}
                                      <FlashcardFileMenu
                                        open={fileMenu === card.id}
                                        folders={folders}
                                        onOpenChange={(open) => state.setFileMenu(open ? card.id : null)}
                                        onMove={(folder) => state.setDeck(setDeckCardFolder(card.id, folder))}
                                      />
                                      <button
                                        type="button"
                                        className="aero-flash-row-x"
                                        title={t('flash.aero.remove')}
                                        onClick={() => state.setDeck(removeDeckCard(card.id))}
                                      >
                                        x
                                      </button>
                                    </span>
                                  </div>
                                ))}
                                {/*
                                  The header cell beside this list has always rendered
                                  `group.cards.length` — the TRUE total — while the list itself
                                  stopped at 80 and said nothing. A deck of 247 showed "247" and
                                  147 rows that did not exist, with no control that could reach
                                  them. The count is read from the same array that is sliced, so
                                  it cannot drift from what is rendered.
                                */}
                                {hidden > 0 && (
                                  <div className="aero-flash-card-row">
                                    <span className="muted">
                                      {t('flash.aero.deck.showingOf', {
                                        shown,
                                        total: group.cards.length,
                                      })}
                                    </span>
                                    <span />
                                    <span />
                                    <span className="aero-flash-row-actions">
                                      <Button
                                        size="sm"
                                        onClick={() =>
                                          setCardPage((prev) => ({
                                            ...prev,
                                            [groupKey]: shown + AERO_DECK_PAGE,
                                          }))
                                        }
                                      >
                                        {t('flash.aero.deck.showMore')}
                                      </Button>
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : saved.length === 0 ? (
                <div className="aero-flash-empty">{t('flash.aero.empty.dictionary')}</div>
              ) : (
                <div className="aero-flash-dict-list" role="list">
                  {saved.map((word) => (
                    <div className="aero-flash-dict-row" key={word.word} role="listitem">
                      <span className="aero-flash-word" lang={studyContentLang()}>
                        {word.word}
                      </span>
                      <span className="aero-flash-reading" lang={studyContentLang()}>
                        {word.reading && word.reading !== word.word ? word.reading : ''}
                      </span>
                      <span className="aero-flash-meaning">{word.meaning}</span>
                      <button className="aero-flash-row-x" title={t('flash.aero.remove')} onClick={() => removeSaved(word.word)}>
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
                  <h3>{t('flash.studySession')}</h3>
                  <span>{t('flash.aero.readyCount', { count: epubReviewCandidates.length })}</span>
                </div>
                <label>
                  {t('flash.epubSource')}
                  <select value={reviewBookKey} onChange={(e) => state.setReviewBookKey(e.target.value)}>
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
                <label className="aero-flash-check">
                  <input
                    type="checkbox"
                    checked={reviewDueOnly}
                    onChange={(e) => state.setReviewDueOnly(e.target.checked)}
                  />
                  {t('flash.dueOnly')}
                </label>
                <Button
                  variant="primary"
                  block
                  disabled={epubReviewCandidates.length === 0}
                  onClick={state.startEpubReview}
                  leftIcon={<Icon name="flashcards" size={15} />}
                >
                  {t('flash.startReview')}
                </Button>
              </section>

              <section className="aero-flash-panel aero-flash-import">
                <div className="aero-flash-panel-head">
                  <h3>{t('flash.aero.import')}</h3>
                  <span>{t('flash.aero.importFormats')}</span>
                </div>
                <DeckImportPanel onImported={() => state.setDeck(loadDeck())} />
              </section>

              <section className="aero-flash-panel">
                <div className="aero-flash-panel-head">
                  <h3>{t('flash.aero.recentCards')}</h3>
                  <span>{t('flash.aero.newest')}</span>
                </div>
                <div className="aero-flash-recent">
                  {recentStrip.length === 0 ? (
                    <p>{t('flash.aero.noRecentCards')}</p>
                  ) : (
                    recentStrip.slice(0, 8).map((card) => (
                      <div key={card.id} className="aero-flash-recent-card">
                        <span lang={cardContentLang(card)}>{card.word}</span>
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
              onClose={() => state.setDeckMenuGroup(null)}
              onReview={() => state.startReviewForGroup(deckMenuGroup)}
              onSaveCsv={() => void state.saveGroupCsv(deckMenuGroup)}
              onMoveFolder={(folder) => {
                state.setDeck(setBookGroupFolder(deckMenuGroup.bookId, deckMenuGroup.bookTitle, folder));
                state.setDeckMenuGroup(null);
              }}
              onRename={() => {
                void state.renameBookDeck(deckMenuGroup.bookId, deckMenuGroup.bookTitle);
                state.setDeckMenuGroup(null);
              }}
              onDelete={() => {
                state.removeBookDeck(deckMenuGroup.bookId, deckMenuGroup.bookTitle);
                state.setDeckMenuGroup(null);
              }}
            />
          )}
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome menus={deckMenus} status={deckStatus}>
      <FlashcardDeckOverview state={state} />
    </AppChrome>
  );
}
